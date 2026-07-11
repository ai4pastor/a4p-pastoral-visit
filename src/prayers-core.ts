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

// ── 주간 기도제목 모음 ──

export interface DigestPrayer {
  text: string;
  group: string;
  visitDate: string;
  visitBasename: string;
  answered: boolean;
  answeredDate: string | null;
}

export interface DigestEntry {
  memberName: string;
  /** 직분·구역 등 부가 정보 (없으면 "") */
  memberMeta: string;
  items: DigestPrayer[];
}

export interface DigestOptions {
  /** 생성일 (YYYY-MM-DD) */
  dateStr: string;
  /** 수집 범위 라벨 (예: "최근 4주 (2026-06-14 ~ 2026-07-12)") */
  rangeLabel: string;
  /** 응답 표시된 항목도 포함 (감사 제목으로 별도 표기) */
  includeAnswered: boolean;
  insertWordClassification: boolean;
  worldValue: string;
  routeValue: string;
}

/**
 * 주간 기도제목 모음 노트 콘텐츠 조립 — 순수 함수.
 * 성도별 섹션 + 각 기도제목에 그룹·출처 일지 wikilink. 새벽기도·중보기도회 자료용.
 */
export function buildPrayerDigest(entries: DigestEntry[], opts: DigestOptions): string {
  const fm: string[] = ["---"];
  fm.push(`created: ${opts.dateStr}`);
  fm.push(`type: 기도모음`);
  fm.push(`날짜: ${opts.dateStr}`);
  fm.push(`tags:`);
  fm.push(`  - 기도`);
  fm.push(`  - 기도모음`);
  if (opts.insertWordClassification) {
    fm.push(`world:`);
    fm.push(`  - "${opts.worldValue}"`);
    fm.push(`route:`);
    fm.push(`  - "${opts.routeValue}"`);
  }
  fm.push(`created_via: a4p-pastoral-visit`);
  fm.push("---");

  const total = entries.reduce((n, e) => n + e.items.length, 0);
  const activeCount = entries.reduce((n, e) => n + e.items.filter((i) => !i.answered).length, 0);

  const body: string[] = [];
  body.push(`# 주간 기도제목 — ${opts.dateStr}`);
  body.push("");
  body.push(`> [!info] ${opts.rangeLabel} 심방일지에서 수집 · 진행 중 ${activeCount}건${opts.includeAnswered ? ` · 전체 ${total}건` : ""}`);
  body.push("");

  for (const entry of entries) {
    if (entry.items.length === 0) continue;
    const meta = entry.memberMeta ? ` (${entry.memberMeta})` : "";
    body.push(`## [[${entry.memberName}]]${meta}`);
    body.push("");
    for (const item of entry.items) {
      const src = ` — ${item.group ? `${item.group} · ` : ""}[[${item.visitBasename}|${item.visitDate}]]`;
      if (item.answered) {
        body.push(`- ~~${item.text}~~ ✅ 감사${item.answeredDate ? ` (${item.answeredDate})` : ""}${src}`);
      } else {
        body.push(`- ${item.text}${src}`);
      }
    }
    body.push("");
  }

  if (total === 0) {
    body.push("(수집된 기도제목이 없습니다)");
    body.push("");
  }

  return fm.join("\n") + "\n\n" + body.join("\n");
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
