/**
 * 시연 데이터 생성기 CLI
 *   node scripts/demo-data/cli.mjs extract  --vault <460. 성도>              # 1회성 seed/history 추출
 *   node scripts/demo-data/cli.mjs generate --vault <460. 성도> --anchor 2026-10-05 [--apply] [--yes] [--diff <이름>]
 *   node scripts/demo-data/cli.mjs verify   --vault <460. 성도> --anchor 2026-10-05
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { nfc } from "../../src/utils";
import { EMBED_ANCHORS, MEMBER_SECTIONS, NOTE_TYPE, VISIT_SECTIONS } from "../../src/constants";
import { findSectionRange, planSync, resolveAnchors, extractSummary } from "../../src/sync-core";
import { parseNote, getValue, FmEntry, serialize } from "./lib/frontmatter";
import { applyOverrides, loadFragments, loadOverrides, loadSeed, NARRATIVE_HEADINGS, SeedMember } from "./lib/scenario";
import { renderMember, renderVisit, RenderedVisit } from "./lib/render";
import { computeCards, formatCards, ModelMember, ModelVisit } from "./lib/cards";
import { assertMemberRoot, atomicWrite, backupTar, isObsidianRunning, scanFolder } from "./lib/fsx";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const SEED = join(HERE, "seed", "members.json");
const OVERRIDES = join(HERE, "members.overrides.json");
const LOG_DIRS = [join(HERE, "logs", "history"), join(HERE, "logs", "new")];
const BACKUP_DIR = join(REPO, ".backup");
const VISIT_SUBDIR = "심방일지";
const MEMBER_ROOT_NAME = "460. 성도";
const TEST_FOLDER = "성도 테스트";
const TEST_FOLDER_DEST = "469. 성도 실습(테스트)";

type Args = Record<string, string | boolean>;
function parseArgs(argv: string[]): { cmd: string; args: Args } {
  const [cmd = "", ...rest] = argv;
  const args: Args = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else args[key] = true;
  }
  return { cmd, args };
}

function str(args: Args, k: string, def?: string): string {
  const v = args[k];
  if (typeof v === "string") return v;
  if (def !== undefined) return def;
  throw new Error(`--${k} 가 필요합니다`);
}

// ── extract ──

interface HistoryMeta {
  summary?: string;
}

function cmdExtract(args: Args): void {
  const root = assertMemberRoot(str(args, "vault"), MEMBER_ROOT_NAME);
  const folder = scanFolder(root);
  const members: SeedMember[] = [];
  const summaries = new Map<string, string>(); // basename → 기존 요약줄
  for (const [relNfc, rel] of folder.files) {
    if (relNfc.includes("/")) continue; // 최상위만 (심방일지/, 성도 테스트/ 제외)
    const content = readFileSync(join(root, rel), "utf8");
    const parsed = parseNote(content);
    if (getValue(parsed.entries, "type") !== NOTE_TYPE.member) continue;
    const name = nfc(relNfc.replace(/\.md$/, ""));
    // 관리 섹션 2종을 제외한 본문
    let lines = parsed.body.split("\n");
    for (const heading of [MEMBER_SECTIONS.visitLog, MEMBER_SECTIONS.embeds]) {
      const r = findSectionRange(lines, heading);
      if (!r) continue;
      for (let i = r.headingLine + 1; i < r.endLine; i++) {
        const m = lines[i].match(/^-\s+\[\[([^\]|]+)\]\]\s+—\s+(.+)$/);
        if (m) summaries.set(nfc(m[1]), m[2].trim());
      }
      lines = [...lines.slice(0, r.headingLine), ...lines.slice(r.endLine)];
    }
    const extraBody = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    members.push({ name, entries: parsed.entries, extraBody });
  }
  members.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  mkdirSync(dirname(SEED), { recursive: true });
  writeFileSync(SEED, JSON.stringify(members, null, 2) + "\n", "utf8");
  console.log(`seed/members.json: 성도 ${members.length}명`);

  // 기존 일지 → history 조각
  const histDir = LOG_DIRS[0];
  mkdirSync(histDir, { recursive: true });
  let n = 0;
  for (const [relNfc, rel] of folder.files) {
    if (!relNfc.startsWith(`${VISIT_SUBDIR}/`)) continue;
    const content = readFileSync(join(root, rel), "utf8");
    const parsed = parseNote(content);
    if (getValue(parsed.entries, "type") !== NOTE_TYPE.visit) continue;
    const basename = nfc(relNfc.split("/").pop()!.replace(/\.md$/, ""));
    const memberLink = getValue(parsed.entries, "성도") ?? "";
    const member = nfc(memberLink.replace(/^\[\[|\]\]$/g, ""));
    const date = getValue(parsed.entries, "날짜") ?? "";
    const type = getValue(parsed.entries, "심방유형") ?? "";
    const place = getValue(parsed.entries, "장소") ?? "";
    const companion = getValue(parsed.entries, "동행") ?? "";
    const lines = parsed.body.split("\n");
    const out: string[] = ["---", `member: ${member}`, `date: ${date}`, `type: ${type}`, `place: ${place}`, `companion: ${companion}`, `synced: true`];
    const sum = summaries.get(basename);
    if (sum) out.push(`summary: ${sum}`);
    out.push("---", "");
    for (const heading of NARRATIVE_HEADINGS) {
      const r = findSectionRange(lines, heading);
      out.push(heading);
      if (r) {
        const body = lines.slice(r.headingLine + 1, r.endLine);
        while (body.length && body[body.length - 1].trim() === "") body.pop();
        out.push(...body);
      }
      out.push("");
    }
    writeFileSync(join(histDir, `${basename}.md`), out.join("\n"), "utf8");
    n++;
  }
  console.log(`logs/history/: 일지 ${n}건`);
}

// ── generate ──

interface Rendered {
  anchor: string;
  members: Map<string, { seed: SeedMember; content: string }>;
  visits: RenderedVisit[];
}

function render(anchor: string): Rendered {
  const seed = loadSeed(SEED);
  const ov = loadOverrides(OVERRIDES);
  const specs = loadFragments(LOG_DIRS, anchor);
  const names = new Set(seed.map((m) => m.name));
  for (const s of specs) if (!names.has(s.member)) throw new Error(`${s.sourceFile}: 성도 "${s.member}" 가 seed에 없습니다`);
  const visitedNames = new Set(specs.filter((s) => s.synced).map((s) => s.member));
  const merged = applyOverrides(seed, ov, anchor, visitedNames);

  const visits: RenderedVisit[] = [];
  const seenBase = new Set<string>();
  for (const spec of specs) {
    const rv = renderVisit(spec, merged.get(spec.member)!.entries);
    if (seenBase.has(rv.basename)) throw new Error(`중복 파일명: ${rv.basename}`);
    seenBase.add(rv.basename);
    visits.push(rv);
  }
  const members = new Map<string, { seed: SeedMember; content: string }>();
  for (const m of merged.values()) {
    members.set(m.name, { seed: m, content: renderMember(m, visits.filter((v) => v.spec.member === m.name)) });
  }
  return { anchor, members, visits };
}

function toModel(r: Rendered): { members: ModelMember[]; visits: ModelVisit[] } {
  const members: ModelMember[] = [...r.members.values()].map(({ seed }) => ({
    name: seed.name,
    status: getValue(seed.entries, "심방상태"),
    birth: getValue(seed.entries, "생년월일"),
    registered: getValue(seed.entries, "등록일"),
  }));
  const visits: ModelVisit[] = r.visits.map((v) => ({
    member: v.spec.member,
    date: v.spec.date,
    synced: v.spec.synced,
    content: v.content,
    basename: v.basename,
  }));
  return { members, visits };
}

function cmdGenerate(args: Args): void {
  const anchor = str(args, "anchor");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) throw new Error("--anchor 는 YYYY-MM-DD");
  const root = assertMemberRoot(str(args, "vault"), MEMBER_ROOT_NAME);
  const folder = scanFolder(root);
  const r = render(anchor);

  // 변경 계획
  type Action = { rel: string; kind: "create" | "modify" | "same"; content: string };
  const actions: Action[] = [];
  const planned = new Map<string, string>();
  for (const v of r.visits) planned.set(`${VISIT_SUBDIR}/${v.basename}.md`, v.content);
  for (const [name, m] of r.members) planned.set(`${name}.md`, m.content);
  for (const [rel, content] of planned) {
    const existingRel = folder.files.get(nfc(rel));
    if (!existingRel) actions.push({ rel, kind: "create", content });
    else {
      const cur = readFileSync(join(root, existingRel), "utf8");
      actions.push({ rel: existingRel, kind: cur === content ? "same" : "modify", content });
    }
  }
  // 범위 안에 있지만 계획에 없는 파일 (건드리지 않음 — 보고만)
  const untouched = [...folder.files.keys()].filter((k) => !planned.has(k) && !k.startsWith(`${TEST_FOLDER}/`));

  const counts = { create: 0, modify: 0, same: 0 };
  for (const a of actions) counts[a.kind]++;
  console.log(`\n=== 시연 데이터 생성 리포트 (앵커 ${anchor}) ===`);
  console.log(`대상 폴더: ${root}`);
  console.log(`생성 ${counts.create} / 수정 ${counts.modify} / 무변경 ${counts.same}`);
  console.log(`\n[생성]`);
  for (const a of actions.filter((x) => x.kind === "create")) console.log(`  + ${a.rel}`);
  console.log(`[수정]`);
  for (const a of actions.filter((x) => x.kind === "modify")) console.log(`  ~ ${a.rel}`);
  console.log(`[범위 내 비대상 — 건드리지 않음] ${untouched.length}개: ${untouched.join(", ")}`);
  const testExists = existsSync(join(root, TEST_FOLDER));
  console.log(`[실습 폴더] ${TEST_FOLDER}/ ${testExists ? `→ ../${TEST_FOLDER_DEST}/ 로 이동 예정` : "없음"}`);

  const model = toModel(r);
  console.log(`\n--- 기대 대시보드 (${anchor}) ---`);
  console.log(formatCards(computeCards(model.members, model.visits, anchor)));

  if (typeof args.diff === "string") {
    const target = actions.find((a) => nfc(a.rel).includes(nfc(String(args.diff))));
    if (!target) console.log(`\n(diff) 대상 없음: ${args.diff}`);
    else {
      console.log(`\n--- diff ${target.rel} ---`);
      try {
        const before = target.kind === "create" ? "/dev/null" : join(root, target.rel);
        execFileSync("diff", ["-u", before, "-"], { input: target.content, stdio: ["pipe", "inherit", "inherit"] });
      } catch {
        /* diff는 차이가 있으면 exit 1 */
      }
    }
  }

  if (!args.apply) {
    console.log(`\n(dry-run) 실제 쓰기는 --apply 로 실행합니다.`);
    return;
  }

  // ── apply ──
  if (isObsidianRunning() && !args.yes) {
    throw new Error("Obsidian이 실행 중입니다. 종료(또는 Sync 일시정지) 후 다시 실행하거나 --yes 로 강행하세요.");
  }
  const label = root.includes("obsidian_dev_vault") ? "dev" : "real";
  const tar = backupTar(root, BACKUP_DIR, label);
  console.log(`\n백업: ${tar}`);
  console.log(`복원: tar -xzf "${tar}" -C "${dirname(root)}"`);
  writeFileSync(tar.replace(/\.tar\.gz$/, ".plan.json"), JSON.stringify({ anchor, actions: actions.map((a) => ({ rel: a.rel, kind: a.kind })) }, null, 2));

  // 일지 먼저, 성도 다음
  const order = (a: Action) => (a.rel.startsWith(`${VISIT_SUBDIR}/`) ? 0 : 1);
  for (const a of actions.filter((x) => x.kind !== "same").sort((x, y) => order(x) - order(y))) {
    atomicWrite(root, a.rel, a.content);
  }
  console.log(`쓰기 완료: 생성 ${counts.create}, 수정 ${counts.modify}`);

  if (testExists && !args["keep-test-folder"]) {
    const dest = join(dirname(root), TEST_FOLDER_DEST);
    if (existsSync(dest)) console.log(`이동 생략: ${dest} 가 이미 있습니다`);
    else {
      renameSync(join(root, TEST_FOLDER), dest);
      console.log(`이동: ${TEST_FOLDER}/ → ${dest}`);
    }
  }
  console.log("\n검증 실행:");
  cmdVerify({ vault: root, anchor });
}

// ── verify ──

function cmdVerify(args: Args): void {
  const anchor = str(args, "anchor");
  const root = assertMemberRoot(str(args, "vault"), MEMBER_ROOT_NAME);
  const folder = scanFolder(root);
  const problems: string[] = [];
  const memberFiles = new Map<string, string>(); // name → rel
  const memberContents = new Map<string, string>();
  const nameCount = new Map<string, number>();
  const visits: Array<{ rel: string; basename: string; member: string; date: string; type: string; synced: boolean; content: string; entries: FmEntry[] }> = [];

  for (const [relNfc, rel] of folder.files) {
    const content = readFileSync(join(root, rel), "utf8");
    const parsed = parseNote(content);
    const type = getValue(parsed.entries, "type");
    if (type === NOTE_TYPE.member) {
      const name = nfc(relNfc.split("/").pop()!.replace(/\.md$/, ""));
      nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
      memberFiles.set(name, rel);
      memberContents.set(name, content);
    } else if (type === NOTE_TYPE.visit) {
      const basename = nfc(relNfc.split("/").pop()!.replace(/\.md$/, ""));
      const member = nfc((getValue(parsed.entries, "성도") ?? "").replace(/^\[\[|\]\]$/g, ""));
      visits.push({
        rel,
        basename,
        member,
        date: getValue(parsed.entries, "날짜") ?? "",
        type: getValue(parsed.entries, "심방유형") ?? "",
        synced: !!getValue(parsed.entries, "반영"),
        content,
        entries: parsed.entries,
      });
    }
  }
  for (const [n, c] of nameCount) if (c > 1) problems.push(`중복 성도 이름: ${n} (${c}개)`);

  const linkedBasenames = new Set<string>();
  for (const v of visits) {
    const expectedBase = v.date.match(/^\d{4}-\d{2}-\d{2}$/) ? `${v.date.slice(2).replace(/-/g, "")}_심방일지_${v.member}` : null;
    if (expectedBase !== v.basename) problems.push(`${v.rel}: 파일명·날짜·성도 불일치 (기대 ${expectedBase})`);
    if (v.date > anchor) problems.push(`${v.rel}: 날짜 ${v.date} > 앵커`);
    if (!memberFiles.has(v.member)) problems.push(`${v.rel}: 성도 "${v.member}" 노트 없음`);
    const lines = v.content.split("\n");
    const h2 = lines.filter((l) => /^##\s/.test(l) && !/^###/.test(l)).map((l) => nfc(l.trim()));
    const expectedH2 = Object.values(VISIT_SECTIONS);
    if (JSON.stringify(h2) !== JSON.stringify(expectedH2)) problems.push(`${v.rel}: H2 헤딩 ${h2.length}개/순서 불일치`);
    const anchors = resolveAnchors(v.content, { ...VISIT_SECTIONS, memberVisitLog: MEMBER_SECTIONS.visitLog, memberEmbeds: MEMBER_SECTIONS.embeds });
    if (JSON.stringify(anchors) !== JSON.stringify([...EMBED_ANCHORS])) problems.push(`${v.rel}: 임베드 앵커 ${anchors.join("|")}`);
    // ✅ 날짜 범위
    for (const m of v.content.matchAll(/✅\s*(\d{4}-\d{2}-\d{2})/g)) {
      if (m[1] < v.date || m[1] > anchor) problems.push(`${v.rel}: ✅ ${m[1]} 가 [${v.date}, ${anchor}] 밖`);
    }
    const mc = memberContents.get(v.member);
    if (!mc) continue;
    const hasLink = mc.includes(`[[${v.basename}`);
    if (v.synced) {
      const plan = planSync(mc, v.basename, v.date, v.type, extractSummary(v.content, v.type, v.date), undefined, anchors);
      if (!plan.nothingToDo) problems.push(`${v.rel}: 반영됐다는데 성도 노트에 링크/임베드 없음 (멱등 실패)`);
      for (const line of plan.embedBlock.slice(1)) if (!mc.includes(line)) problems.push(`${v.rel}: 임베드 줄 누락 ${line}`);
      linkedBasenames.add(v.basename);
    } else if (hasLink) problems.push(`${v.rel}: 미반영인데 성도 노트에 링크 있음`);
  }
  // 성도 노트의 링크·임베드가 실재하는가
  const visitBase = new Map(visits.map((v) => [v.basename, v]));
  for (const [name, mc] of memberContents) {
    for (const m of mc.matchAll(/!?\[\[([^\]|#]+?)(?:#([^\]|]+))?\]\]/g)) {
      const target = nfc(m[1]);
      if (!target.includes("_심방일지_")) continue;
      const v = visitBase.get(target);
      if (!v) {
        problems.push(`${name}.md: 존재하지 않는 일지 링크 ${target}`);
        continue;
      }
      if (m[2]) {
        const heading = `## ${nfc(m[2])}`;
        if (!v.content.split("\n").some((l) => nfc(l.trim()) === heading)) problems.push(`${name}.md: 앵커 미해석 ${target}#${m[2]}`);
      }
    }
    // 심방 기록 줄 날짜순
    const lines = mc.split("\n");
    const r = findSectionRange(lines, MEMBER_SECTIONS.visitLog);
    if (r) {
      const dates = lines.slice(r.headingLine + 1, r.endLine).map((l) => l.match(/\((\d{4}-\d{2}-\d{2})\)/)?.[1]).filter(Boolean) as string[];
      const sorted = [...dates].sort();
      if (JSON.stringify(dates) !== JSON.stringify(sorted)) problems.push(`${name}.md: 심방 기록 줄이 날짜순이 아님`);
    }
    // 가족관계 대칭·실재
    const parsed = parseNote(mc);
    const fam = getValue(parsed.entries, "가족관계") ?? "";
    for (const fm of fam.matchAll(/\[\[([^\]|#]+)\]\]/g)) {
      const other = nfc(fm[1]);
      if (!memberContents.has(other)) problems.push(`${name}.md: 가족관계 대상 없음 ${other}`);
      else if (!(getValue(parseNote(memberContents.get(other)!).entries, "가족관계") ?? "").includes(`[[${name}]]`)) problems.push(`${name}.md ↔ ${other}: 가족관계 비대칭`);
    }
    if (fam.includes("배우자") && getValue(parsed.entries, "결혼여부") !== "기혼") problems.push(`${name}.md: 배우자 있는데 결혼여부 ${getValue(parsed.entries, "결혼여부")}`);
  }

  const model = {
    members: [...memberContents.entries()].map(([name, mc]) => {
      const e = parseNote(mc).entries;
      return { name, status: getValue(e, "심방상태"), birth: getValue(e, "생년월일"), registered: getValue(e, "등록일") };
    }),
    visits: visits.map((v) => ({ member: v.member, date: v.date, synced: v.synced, content: v.content, basename: v.basename })),
  };
  console.log(`\n=== 검증 (${root}) — 성도 ${memberContents.size}, 일지 ${visits.length} ===`);
  console.log(formatCards(computeCards(model.members, model.visits, anchor)));
  if (problems.length) {
    console.log(`\n✗ 문제 ${problems.length}건`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exitCode = 1;
  } else console.log("\n✓ 모든 검증 통과");
}

// ── main ──
const { cmd, args } = parseArgs(process.argv.slice(2));
try {
  if (cmd === "extract") cmdExtract(args);
  else if (cmd === "generate") cmdGenerate(args);
  else if (cmd === "verify") cmdVerify(args);
  else {
    console.log("사용법: cli.mjs <extract|generate|verify> --vault <460. 성도 경로> [--anchor YYYY-MM-DD] [--apply] [--yes] [--diff 이름]");
    process.exitCode = 2;
  }
} catch (e) {
  console.error(`오류: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
