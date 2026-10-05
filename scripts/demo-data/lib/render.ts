/**
 * 렌더 — 일지(buildVisitContent 골격 + 서사 5섹션 치환), 성도 노트(planSync 순차 적용).
 * 플러그인이 쓰는 함수(src/*)를 그대로 import 하므로 산출물은 플러그인 출력과 바이트 호환.
 */
import { DEFAULT_HEADINGS, MEMBER_SECTIONS } from "../../../src/constants";
import { buildVisitContent, buildVisitFileName } from "../../../src/note-builders";
import { extractSummary, findSectionRange, planSync, resolveAnchors } from "../../../src/sync-core";
import type { MemberFrontmatter } from "../../../src/types";
import { FmEntry, getValue, parseNote, serialize } from "./frontmatter";
import { SeedMember, VisitSpec, NARRATIVE_HEADINGS } from "./scenario";

export interface RenderedVisit {
  spec: VisitSpec;
  basename: string;
  content: string;
  summary: string;
  anchors: string[];
}

/** 성도 프론트매터 엔트리 → 플러그인 타입(일지 기본정보 채움용) */
export function toMemberFm(entries: FmEntry[]): MemberFrontmatter {
  const g = (k: string) => getValue(entries, k) ?? undefined;
  const 가족수 = g("가족수");
  return {
    type: g("type"),
    이름: g("이름"),
    연락처: g("연락처"),
    구역: g("구역"),
    직분: g("직분"),
    가족관계: g("가족관계"),
    가족수: 가족수 ? Number(가족수) : undefined,
  };
}

export function renderVisit(spec: VisitSpec, memberEntries: FmEntry[]): RenderedVisit {
  const basename = buildVisitFileName(spec.date, spec.member);
  if (!basename) throw new Error(`${spec.sourceFile}: 파일명 생성 실패`);
  const skeleton = buildVisitContent(
    {
      memberPath: "",
      memberName: spec.member,
      날짜: spec.date,
      장소: spec.place,
      동행: spec.companion,
      심방유형: spec.type,
    },
    toMemberFm(memberEntries),
    { insertWordClassification: true },
  );
  let lines = skeleton.split("\n");
  for (const heading of NARRATIVE_HEADINGS) {
    const range = findSectionRange(lines, heading);
    if (!range) throw new Error(`골격에 ${heading} 없음`);
    const body = spec.sections[heading];
    lines = [...lines.slice(0, range.headingLine + 1), ...body, "", ...lines.slice(range.endLine)];
  }
  let content = lines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\n*$/, "\n");
  if (spec.synced) {
    const parsed = parseNote(content);
    parsed.entries.push({ key: "반영", lines: ["반영: true"] });
    content = serialize(parsed.entries, parsed.body);
  }
  const summary = spec.summary ?? extractSummary(content, spec.type, spec.date);
  const anchors = resolveAnchors(content, DEFAULT_HEADINGS);
  return { spec, basename, content, summary, anchors };
}

const PLACEHOLDER_LOG = "(심방 기록이 추가되면 여기에 링크됩니다)";
const PLACEHOLDER_EMBED = "(임베드가 여기에 추가됩니다)";

/** 성도 노트 본문 — 심방 없으면 플러그인 등록 골격(플레이스홀더), 있으면 planSync 순차 적용 */
export function renderMember(member: SeedMember, visits: RenderedVisit[]): string {
  const synced = visits.filter((v) => v.spec.synced).sort((a, b) => a.spec.date.localeCompare(b.spec.date));
  const head = member.extraBody.trim() ? member.extraBody.trim() : `# ${member.name}`;
  let body: string;
  if (synced.length === 0) {
    body = [
      head,
      "",
      MEMBER_SECTIONS.visitLog,
      "",
      PLACEHOLDER_LOG,
      "",
      MEMBER_SECTIONS.embeds,
      "",
      PLACEHOLDER_EMBED,
      "",
    ].join("\n");
  } else {
    body = [head, "", MEMBER_SECTIONS.visitLog, "", MEMBER_SECTIONS.embeds, ""].join("\n");
    for (const v of synced) {
      const plan = planSync(body, v.basename, v.spec.date, v.spec.type, v.summary, DEFAULT_HEADINGS, v.anchors);
      if (plan.warnings.length) throw new Error(`${member.name}/${v.basename}: planSync 경고 ${plan.warnings.join(" | ")}`);
      body = plan.newContent;
    }
    body = normalizeLayout(body);
  }
  return serialize(member.entries, body);
}

/** 헤딩 뒤 빈 줄 1개, 연속 빈 줄 축소, EOF 개행 1개 */
export function normalizeLayout(body: string): string {
  const lines = body.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    if (/^##\s/.test(lines[i]) && !/^###/.test(lines[i]) && lines[i + 1]?.trim() !== "") out.push("");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\n*$/, "\n");
}
