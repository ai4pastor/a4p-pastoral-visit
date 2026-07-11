/**
 * 기도제목 파싱·응답 표시의 순수 로직 (obsidian 비의존, vitest 대상).
 *
 * 기도제목은 체크박스가 아닌 일반 불릿이므로, "응답됨/더 이상 불필요" 표시는
 * 라인 끝에 `✅ YYYY-MM-DD` 마커를 붙이는 방식으로 남긴다.
 * — 원문 불릿 구조를 보존하고, 성도 노트의 기도제목 임베드에도 그대로 보인다.
 * — 마커 제거로 되돌릴 수 있다 (라인 원문 일치 검증, 후속조치 토글과 동일 안전 패턴).
 */
import { DEFAULT_HEADINGS } from "./constants";
import { findSectionRange } from "./sync-core";

/** 응답 마커: 라인 끝의 `✅` (+ 선택적 날짜) */
const ANSWERED_RE = /\s*✅\s*(\d{4}-\d{2}-\d{2})?\s*$/;
/** 그룹 라벨: `- **본인 기도제목:**` (내용 없이 라벨만) */
const GROUP_RE = /^\s*-\s+\*\*(.+?):?\*\*\s*$/;
/** 불릿 항목 (체크박스 제외) */
const ITEM_RE = /^(\s*)-\s+(?!\[)(.+)$/;

export interface ParsedPrayer {
  /** 0-기반 라인 번호 */
  line: number;
  /** 라인 원문 (토글 시 일치 검증용) */
  raw: string;
  /** 마커 제외한 기도제목 텍스트 */
  text: string;
  /** 그룹 라벨 (본인 기도제목 / 가족 기도제목 등, 없으면 "") */
  group: string;
  answered: boolean;
  /** 응답 표시 날짜 (마커에 있으면) */
  answeredDate: string | null;
}

/** 일지 본문에서 기도제목 섹션 내 불릿 수집 */
export function parsePrayers(
  content: string,
  prayerHeading: string = DEFAULT_HEADINGS.prayer,
): ParsedPrayer[] {
  const lines = content.split("\n");
  const range = findSectionRange(lines, prayerHeading);
  if (!range) return [];

  const items: ParsedPrayer[] = [];
  let group = "";
  for (let i = range.headingLine + 1; i < range.endLine; i++) {
    const line = lines[i];
    const groupM = line.match(GROUP_RE);
    if (groupM) {
      group = groupM[1].replace(/:$/, "").trim();
      continue;
    }
    const itemM = line.match(ITEM_RE);
    if (!itemM) continue;
    const body = itemM[2].trim();
    if (!body) continue;
    const answeredM = body.match(ANSWERED_RE);
    const text = body.replace(ANSWERED_RE, "").trim();
    if (!text) continue;
    items.push({
      line: i,
      raw: line,
      text,
      group,
      answered: !!answeredM,
      answeredDate: answeredM?.[1] ?? null,
    });
  }
  return items;
}

export interface PrayerToggleResult {
  newContent: string;
  /** 라인 원문이 달라져 있어 변경하지 않았는가 */
  stale: boolean;
}

/**
 * 응답 표시 토글 — 해당 라인 끝에 `✅ 날짜` 마커를 붙이거나 제거.
 * 라인 원문이 기대값과 다르면 무변경 (동시 편집 안전).
 */
export function togglePrayerLine(
  content: string,
  line: number,
  expectedRaw: string,
  today: string,
): PrayerToggleResult {
  const lines = content.split("\n");
  if (lines[line] !== expectedRaw) {
    return { newContent: content, stale: true };
  }
  if (ANSWERED_RE.test(expectedRaw)) {
    lines[line] = expectedRaw.replace(ANSWERED_RE, "");
  } else {
    lines[line] = `${expectedRaw.replace(/\s+$/, "")} ✅ ${today}`;
  }
  return { newContent: lines.join("\n"), stale: false };
}
