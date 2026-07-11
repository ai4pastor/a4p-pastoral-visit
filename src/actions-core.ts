/**
 * 후속조치 체크박스 파싱·토글의 순수 로직 (obsidian 비의존, vitest 대상).
 */
import { DEFAULT_HEADINGS } from "./constants";
import { findSectionRange } from "./sync-core";

export interface ParsedFollowUp {
  /** 0-기반 라인 번호 */
  line: number;
  /** 라인 원문 (토글 시 일치 검증용) */
  raw: string;
  text: string;
  checked: boolean;
}

const CHECKBOX_RE = /^(\s*)- \[( |x|X)\] (.*)$/;

/** 일지 본문에서 후속조치 섹션 내 체크박스 수집 */
export function parseFollowUps(
  content: string,
  followUpHeading: string = DEFAULT_HEADINGS.followUp,
): ParsedFollowUp[] {
  const lines = content.split("\n");
  const range = findSectionRange(lines, followUpHeading);
  if (!range) return [];
  const items: ParsedFollowUp[] = [];
  for (let i = range.headingLine + 1; i < range.endLine; i++) {
    const m = lines[i].match(CHECKBOX_RE);
    if (!m) continue;
    const text = m[3].trim();
    if (!text) continue; // 빈 템플릿 항목("- [ ] ")은 제외
    items.push({
      line: i,
      raw: lines[i],
      text,
      checked: m[2] !== " ",
    });
  }
  return items;
}

export interface ToggleResult {
  newContent: string;
  /** 라인 원문이 달라져 있어 변경하지 않았는가 */
  stale: boolean;
}

/**
 * 해당 라인만 체크 토글. 라인 원문이 기대값과 다르면 무변경 (동시 편집 안전).
 */
export function toggleFollowUpLine(content: string, line: number, expectedRaw: string): ToggleResult {
  const lines = content.split("\n");
  if (lines[line] !== expectedRaw) {
    return { newContent: content, stale: true };
  }
  const m = expectedRaw.match(CHECKBOX_RE);
  if (!m) return { newContent: content, stale: true };
  const checked = m[2] !== " ";
  lines[line] = checked
    ? expectedRaw.replace(/- \[[xX]\]/, "- [ ]")
    : expectedRaw.replace("- [ ]", "- [x]");
  return { newContent: lines.join("\n"), stale: false };
}
