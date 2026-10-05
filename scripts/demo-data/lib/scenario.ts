/**
 * 시나리오 로더 — seed(성도 프론트매터) ⊕ overrides, 일지 조각(logs/**.md) 파싱, {{T±n}} 치환, 검증.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { FmEntry, parseNote, setValue, dropKey, getValue, rawFor, hasKey } from "./frontmatter";
import { addDays, resolvePlaceholders } from "./dates";
import { VISIT_SECTIONS, VISIT_STATUS } from "../../../src/constants";
import { nfc } from "../../../src/utils";

export interface SeedMember {
  name: string;
  entries: FmEntry[];
  /** 관리 섹션을 뺀 본문 (대개 "# 이름") */
  extraBody: string;
}

export interface MemberOverride {
  set?: Record<string, string | number | boolean>;
  /** 생일을 앵커 기준 n일 뒤로 (연도는 기존 생년 유지) */
  birthdayOffset?: number;
  /** 등록일을 앵커 기준 n일 전으로 (양수) */
  registeredDaysAgo?: number;
  drop?: string[];
}

export interface Overrides {
  dropKeys?: string[];
  fillEmpty?: Record<string, string>;
  /** 반영된 일지가 1건 이상인 성도의 기본 심방상태 (명시 set이 우선) */
  statusIfVisited?: string;
  /** 데이터 위생 규칙 (시드의 무작위 생성 모순 교정) */
  rules?: {
    /** 신급이 세례교인·입교인·등록교인인데 세례여부가 미세례면 → 세례 */
    baptizedIfConfirmed?: boolean;
    /** 새신자인데 등록한 지 n년 넘었으면 → 등록교인 */
    newcomerGradeMaxYears?: number;
    /** 가족관계에 배우자가 있으면 → 결혼여부 기혼, 기혼인데 가족수 1이면 → 2 */
    spouseConsistency?: boolean;
  };
  members?: Record<string, MemberOverride>;
}

export interface VisitSpec {
  member: string;
  date: string;
  type: string;
  place: string;
  companion: string;
  synced: boolean;
  summary?: string;
  /** 헤딩 텍스트(## 포함) → 본문 줄 */
  sections: Record<string, string[]>;
  sourceFile: string;
}

const NARRATIVE_KEYS = ["conversation", "prayer", "church", "observation", "followUp"] as const;
export const NARRATIVE_HEADINGS: string[] = NARRATIVE_KEYS.map((k) => VISIT_SECTIONS[k]);
const VISIT_TYPES = ["정기심방", "특별심방", "위로심방"];

export function loadSeed(seedPath: string): SeedMember[] {
  const raw = JSON.parse(readFileSync(seedPath, "utf8")) as SeedMember[];
  return raw.map((m) => ({ ...m, name: nfc(m.name) }));
}

export function loadOverrides(path: string): Overrides {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as Overrides;
}

/** seed ⊕ overrides → 성도별 최종 프론트매터 엔트리 */
export function applyOverrides(
  members: SeedMember[],
  ov: Overrides,
  anchor: string,
  visitedNames: Set<string>,
): Map<string, SeedMember> {
  const out = new Map<string, SeedMember>();
  for (const m of members) {
    const entries = m.entries.map((e) => ({ key: e.key, lines: [...e.lines] }));
    for (const k of ov.dropKeys ?? []) dropKey(entries, k);
    const mo = ov.members?.[m.name] ?? {};
    for (const k of mo.drop ?? []) dropKey(entries, k);

    if (ov.statusIfVisited && visitedNames.has(m.name)) {
      setValue(entries, "심방상태", rawFor(ov.statusIfVisited));
    }
    if (mo.birthdayOffset !== undefined) {
      const cur = getValue(entries, "생년월일") ?? "1970-01-01";
      const year = cur.slice(0, 4);
      const target = addDays(anchor, mo.birthdayOffset);
      setValue(entries, "생년월일", `${year}-${target.slice(5)}`);
    }
    if (mo.registeredDaysAgo !== undefined) {
      setValue(entries, "등록일", addDays(anchor, -mo.registeredDaysAgo));
    }
    for (const [k, v] of Object.entries(mo.set ?? {})) {
      setValue(entries, k, rawFor(v));
    }
    for (const [k, v] of Object.entries(ov.fillEmpty ?? {})) {
      const cur = getValue(entries, k);
      if (!hasKey(entries, k) || cur === "" || cur === null) setValue(entries, k, rawFor(v));
    }
    applyRules(entries, ov, anchor);
    out.set(m.name, { name: m.name, entries, extraBody: m.extraBody });
  }
  return out;
}

function applyRules(entries: FmEntry[], ov: Overrides, anchor: string): void {
  const r = ov.rules ?? {};
  const g = (k: string) => getValue(entries, k) ?? "";
  if (r.newcomerGradeMaxYears !== undefined && g("신급") === "새신자") {
    const reg = g("등록일");
    if (/^\d{4}-\d{2}-\d{2}$/.test(reg) && reg < addDays(anchor, -365 * r.newcomerGradeMaxYears)) {
      setValue(entries, "신급", "등록교인");
    }
  }
  if (r.baptizedIfConfirmed && ["세례교인", "입교인", "등록교인"].includes(g("신급")) && g("세례여부") === "미세례") {
    setValue(entries, "세례여부", "세례");
  }
  if (r.spouseConsistency) {
    if (g("가족관계").includes("배우자") && g("결혼여부") !== "기혼") setValue(entries, "결혼여부", "기혼");
    if (g("결혼여부") === "기혼" && g("가족수") === "1") setValue(entries, "가족수", "2");
  }
}

/** 조각 파일 하나 파싱 */
export function parseFragment(content: string, sourceFile: string, anchor: string): VisitSpec {
  const text = resolvePlaceholders(content, anchor);
  const parsed = parseNote(text);
  if (!parsed.hasFrontmatter) throw new Error(`${sourceFile}: 헤더(---)가 없습니다`);
  const h = (k: string) => getValue(parsed.entries, k);

  const member = nfc(h("member") ?? "");
  if (!member) throw new Error(`${sourceFile}: member 누락`);
  let date = h("date") ?? "";
  const offset = h("offset");
  if (!date && offset !== null && offset !== "") date = addDays(anchor, Number(offset));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${sourceFile}: date/offset 누락 또는 형식 오류 (${date})`);
  if (date > anchor) throw new Error(`${sourceFile}: 날짜 ${date}가 앵커 ${anchor} 이후입니다`);
  const type = h("type") ?? "";
  if (!VISIT_TYPES.includes(type)) throw new Error(`${sourceFile}: 심방유형 "${type}"은 허용값이 아닙니다`);
  const syncedRaw = (h("synced") ?? "true").toLowerCase();
  const synced = syncedRaw !== "false";
  const summary = h("summary") || undefined;

  // 본문을 H2 기준으로 분할
  const sections: Record<string, string[]> = {};
  let current: string | null = null;
  for (const line of parsed.body.split("\n")) {
    if (/^##\s/.test(line) && !/^###/.test(line)) {
      current = nfc(line.trim());
      sections[current] = [];
      continue;
    }
    if (current) sections[current].push(line);
  }
  for (const heading of NARRATIVE_HEADINGS) {
    if (!(heading in sections)) throw new Error(`${sourceFile}: 섹션 "${heading}" 누락`);
  }
  const extra = Object.keys(sections).filter((k) => !NARRATIVE_HEADINGS.includes(k));
  if (extra.length) throw new Error(`${sourceFile}: 허용되지 않은 섹션 ${extra.join(", ")}`);
  // 섹션 끝의 빈 줄 제거 (렌더 시 일관되게 한 줄 넣음)
  for (const k of Object.keys(sections)) {
    while (sections[k].length && sections[k][sections[k].length - 1].trim() === "") sections[k].pop();
    while (sections[k].length && sections[k][0].trim() === "") sections[k].shift();
  }

  return {
    member,
    date,
    type,
    place: h("place") ?? "",
    companion: h("companion") ?? "",
    synced,
    summary,
    sections,
    sourceFile,
  };
}

export function loadFragments(dirs: string[], anchor: string): VisitSpec[] {
  const specs: VisitSpec[] = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".md")).sort()) {
      specs.push(parseFragment(readFileSync(join(dir, f), "utf8"), join(dir, f), anchor));
    }
  }
  specs.sort((a, b) => a.date.localeCompare(b.date) || a.member.localeCompare(b.member, "ko"));
  return specs;
}

export { VISIT_STATUS };
