/**
 * 일지 → 성도 노트 반영의 순수 로직 (obsidian 비의존, vitest 대상).
 *
 * 안전 원칙: 기존 줄은 어떤 경우에도 수정·삭제하지 않는다.
 * 가능한 조작은 ① 섹션 내 특정 위치에 새 줄 삽입 ② 헤딩 부재 시 문서 말미에 섹션 신설 뿐이다.
 */
import {
  DEFAULT_HEADINGS,
  HeadingConfig,
  SUMMARY_EXCLUDE_LABELS,
  embedAnchorsOf,
} from "./constants";
import { looseHeadingText, nfc } from "./utils";

export interface SectionRange {
  /** 헤딩 라인 (0-기반) */
  headingLine: number;
  /** 섹션 끝 라인 (exclusive — 다음 `## ` 헤딩 또는 EOF) */
  endLine: number;
}

/**
 * 헤딩 텍스트로 `## ` 섹션 범위 탐지. `###` 하위 헤딩은 통과.
 * 1차: trim+NFC 완전 일치. 2차: 이모지·공백을 무시한 느슨 일치
 * (`## 대화내용`처럼 이모지 없이 써도 인식).
 */
export function findSectionRange(lines: string[], headingText: string): SectionRange | null {
  const target = nfc(headingText.trim());
  let headingLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (nfc(lines[i].trim()) === target) {
      headingLine = i;
      break;
    }
  }
  if (headingLine === -1) {
    const looseTarget = looseHeadingText(headingText);
    if (looseTarget) {
      for (let i = 0; i < lines.length; i++) {
        if (!/^##\s/.test(lines[i]) || /^###/.test(lines[i])) continue;
        if (looseHeadingText(lines[i]) === looseTarget) {
          headingLine = i;
          break;
        }
      }
    }
  }
  if (headingLine === -1) return null;
  let endLine = lines.length;
  for (let i = headingLine + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i]) && !/^###/.test(lines[i])) {
      endLine = i;
      break;
    }
  }
  return { headingLine, endLine };
}

/** 요약 자동 제안 — 대화내용 섹션의 볼드 주제 라벨 상위 2개 */
export function extractSummary(
  visitContent: string,
  심방유형: string,
  날짜: string,
  conversationHeading: string = DEFAULT_HEADINGS.conversation,
): string {
  const lines = visitContent.split("\n");
  const range = findSectionRange(lines, conversationHeading);
  const labels: string[] = [];
  if (range) {
    const labelRe = /^\s*-\s+\*\*(.+?):?\*\*/;
    for (let i = range.headingLine + 1; i < range.endLine; i++) {
      const m = lines[i].match(labelRe);
      if (!m) continue;
      // 요약 줄에서는 wikilink 문법을 평문으로 ([[박순옥]] → 박순옥)
      const label = m[1]
        .replace(/:$/, "")
        .replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_w, target, alias) => alias ?? target)
        .trim();
      if (!label || SUMMARY_EXCLUDE_LABELS.includes(label)) continue;
      if (!labels.includes(label)) labels.push(label);
      if (labels.length >= 2) break;
    }
  }
  const base = `${심방유형} (${날짜})`;
  return labels.length > 0 ? `${base}, ${labels.join(", ")}` : base;
}

/** 심방 기록 섹션에 넣을 한 줄 */
export function buildLogLine(visitBasename: string, summary: string): string {
  return `- [[${visitBasename}]] — ${summary}`;
}

/**
 * 일지 본문에서 임베드 앵커 3종(대화내용·기도제목·후속조치)의 **실제 헤딩 텍스트**를 해석.
 * 이모지 없이 쓴 헤딩(`## 대화내용`)도 느슨 매칭으로 찾아, 임베드가 실제 헤딩과
 * 정확히 일치하도록 한다 (옵시디언 섹션 임베드는 헤딩 텍스트가 주소이므로).
 * 섹션을 못 찾으면 설정 헤딩의 앵커로 폴백.
 */
export function resolveAnchors(visitContent: string, headings: HeadingConfig): string[] {
  const lines = visitContent.split("\n");
  const keys: Array<keyof HeadingConfig> = ["conversation", "prayer", "followUp"];
  return keys.map((key) => {
    const range = findSectionRange(lines, headings[key]);
    if (range) {
      return nfc(lines[range.headingLine].replace(/^##\s*/, "").trim());
    }
    return headings[key].replace(/^##\s*/, "").trim();
  });
}

/** 임베드 섹션에 넣을 블록 (### 날짜 유형 + 임베드 3줄) */
export function buildEmbedBlock(
  visitBasename: string,
  날짜: string,
  심방유형: string,
  anchors: string[] = embedAnchorsOf(DEFAULT_HEADINGS),
): string[] {
  return [
    `### ${날짜} ${심방유형}`,
    ...anchors.map((anchor) => `![[${visitBasename}#${anchor}]]`),
  ];
}

/** 섹션 내에 해당 일지 링크가 이미 있는지 (멱등 2차 방어) */
export function sectionContainsLink(
  lines: string[],
  range: SectionRange,
  visitBasename: string,
): boolean {
  const needle = `[[${nfc(visitBasename)}`;
  for (let i = range.headingLine + 1; i < range.endLine; i++) {
    if (nfc(lines[i]).includes(needle)) return true;
  }
  return false;
}

export interface AppendPlan {
  newContent: string;
  /** 삽입된 위치 (0-기반, newContent 기준) */
  insertedAt: number;
  /** 헤딩이 없어 섹션을 새로 만들었는가 */
  sectionCreated: boolean;
  /** 날짜순 중간 삽입이었는가 (미리보기 고지용) */
  insertedMidway: boolean;
  /** 이미 링크가 있어 건너뛰었는가 */
  skipped: boolean;
}

/** 섹션 내 기존 항목의 날짜 추출 규칙 */
const LOG_DATE_RE = /^-\s+\[\[.+?\]\].*?\((\d{4}-\d{2}-\d{2})\)/;
const EMBED_DATE_RE = /^###\s+(\d{4}-\d{2}-\d{2})\s/;

/**
 * 섹션에 새 블록을 날짜순으로 삽입.
 * - 기본: 섹션 끝(뒤따르는 빈 줄 앞)에 append
 * - 새 날짜가 기존 항목보다 이르면 해당 위치 앞에 삽입
 * - 헤딩 부재 시 문서 말미에 섹션 신설
 * - 이미 해당 일지 링크가 있으면 무변경 (skipped)
 */
export function computeAppend(
  content: string,
  sectionHeading: string,
  newBlock: string[],
  newDate: string,
  visitBasename: string,
  dateRe: RegExp,
): AppendPlan {
  const lines = content.split("\n");
  const range = findSectionRange(lines, sectionHeading);

  if (!range) {
    // 섹션 신설 — 문서 말미에
    const out = [...lines];
    while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
    out.push("", sectionHeading, "", ...newBlock, "");
    return {
      newContent: out.join("\n"),
      insertedAt: out.length - newBlock.length - 1,
      sectionCreated: true,
      insertedMidway: false,
      skipped: false,
    };
  }

  if (sectionContainsLink(lines, range, visitBasename)) {
    return {
      newContent: content,
      insertedAt: -1,
      sectionCreated: false,
      insertedMidway: false,
      skipped: true,
    };
  }

  // 섹션 내 기존 항목들의 (라인, 날짜) 수집
  const dated: Array<{ line: number; date: string }> = [];
  for (let i = range.headingLine + 1; i < range.endLine; i++) {
    const m = lines[i].match(dateRe);
    if (m) dated.push({ line: i, date: m[1] });
  }

  // 삽입 위치: 새 날짜보다 늦은 첫 항목 앞. 없으면 섹션 끝(trailing 빈 줄 앞)
  let insertAt = range.endLine;
  while (insertAt > range.headingLine + 1 && lines[insertAt - 1].trim() === "") insertAt--;
  let insertedMidway = false;
  for (const item of dated) {
    if (item.date > newDate) {
      insertAt = item.line;
      insertedMidway = true;
      break;
    }
  }

  const out = [...lines];
  // 블록 삽입 — 임베드 블록(### 포함)은 앞뒤 빈 줄로 분리
  const isBlock = newBlock.length > 1;
  const toInsert = isBlock
    ? [...(out[insertAt - 1]?.trim() === "" ? [] : [""]), ...newBlock, ""]
    : [...newBlock];
  out.splice(insertAt, 0, ...toInsert);

  return {
    newContent: out.join("\n"),
    insertedAt: insertAt,
    sectionCreated: false,
    insertedMidway,
    skipped: false,
  };
}

/** 미리보기(diff)용 — 어느 섹션에 어떤 줄이 추가되는가 (읽기 전용 파생 정보) */
export interface SyncInsertion {
  /** 대상 섹션 헤딩 (신설 시에도 이 텍스트) */
  heading: string;
  /** 추가될 줄들 */
  lines: string[];
  /** 섹션이 없어 문서 끝에 신설되는가 */
  sectionCreated: boolean;
}

export interface SyncPlan {
  newContent: string;
  logLine: string;
  embedBlock: string[];
  warnings: string[];
  /** 두 섹션 모두 이미 반영돼 있어 변경 없음 */
  nothingToDo: boolean;
  /** 실제로 추가되는 삽입 목록 (건너뛴 섹션 제외) */
  insertions: SyncInsertion[];
}

/** 성도 노트 반영 전체 계획 — 심방 기록 줄 + 임베드 블록 */
export function planSync(
  memberContent: string,
  visitBasename: string,
  날짜: string,
  심방유형: string,
  summary: string,
  headings: HeadingConfig = DEFAULT_HEADINGS,
  /** 일지의 실제 헤딩에서 해석한 임베드 앵커 (resolveAnchors 결과). 없으면 설정 헤딩 기준 */
  anchors?: string[],
): SyncPlan {
  const warnings: string[] = [];
  const logLine = buildLogLine(visitBasename, summary);
  const embedBlock = buildEmbedBlock(visitBasename, 날짜, 심방유형, anchors ?? embedAnchorsOf(headings));

  const step1 = computeAppend(
    memberContent,
    headings.memberVisitLog,
    [logLine],
    날짜,
    visitBasename,
    LOG_DATE_RE,
  );
  if (step1.sectionCreated) warnings.push(`"${headings.memberVisitLog}" 섹션이 없어 문서 끝에 새로 만듭니다.`);
  if (step1.insertedMidway) warnings.push("심방 기록: 기존 항목보다 이른 날짜라 날짜순 위치에 삽입합니다.");
  if (step1.skipped) warnings.push("심방 기록: 이미 링크가 있어 건너뜁니다.");

  const step2 = computeAppend(
    step1.newContent,
    headings.memberEmbeds,
    embedBlock,
    날짜,
    visitBasename,
    EMBED_DATE_RE,
  );
  if (step2.sectionCreated) warnings.push(`"${headings.memberEmbeds}" 섹션이 없어 문서 끝에 새로 만듭니다.`);
  if (step2.insertedMidway) warnings.push("임베드: 기존 항목보다 이른 날짜라 날짜순 위치에 삽입합니다.");
  if (step2.skipped) warnings.push("임베드: 이미 있어 건너뜁니다.");

  const insertions: SyncInsertion[] = [];
  if (!step1.skipped) {
    insertions.push({
      heading: headings.memberVisitLog,
      lines: [logLine],
      sectionCreated: step1.sectionCreated,
    });
  }
  if (!step2.skipped) {
    insertions.push({
      heading: headings.memberEmbeds,
      lines: embedBlock,
      sectionCreated: step2.sectionCreated,
    });
  }

  return {
    newContent: step2.newContent,
    logLine,
    embedBlock,
    warnings,
    nothingToDo: step1.skipped && step2.skipped,
    insertions,
  };
}
