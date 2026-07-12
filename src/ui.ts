import { setIcon } from "obsidian";

/**
 * 공용 UI 헬퍼 — 사이드 패널·모달이 함께 쓰는 시각 컴포넌트.
 * 노트에 기록되는 문자(헤딩·마커)는 여기서 다루지 않는다 (constants.ts 계약).
 */

/** 옵시디언 번들 lucide 버전에 없는 아이콘 대비 폴백 */
export function safeIcon(el: HTMLElement, name: string, fallback?: string): void {
  setIcon(el, name);
  if (fallback && !el.querySelector("svg")) setIcon(el, fallback);
}

export type BadgeTone = "neutral" | "warn" | "accent";

/** 카운트 뱃지 (pill) — 0건은 흐리게, 경고·액센트 톤 구분 */
export function badge(parent: HTMLElement, count: number, tone: BadgeTone = "neutral"): HTMLElement {
  const cls =
    count === 0 ? "is-zero" : tone === "warn" ? "is-warn" : tone === "accent" ? "is-accent" : "";
  return parent.createSpan({ text: String(count), cls: `a4p-pv-badge${cls ? ` ${cls}` : ""}` });
}

export interface EmptySpec {
  /** lucide 아이콘 id ("circle-check" 긍정 / "inbox" 안내) */
  icon: string;
  text: string;
  cta?: { label: string; onClick: () => void };
}

/** 공용 빈 상태 — 카드 안은 인라인, 탭 전체는 block(센터드) */
export function renderEmpty(parent: HTMLElement, spec: EmptySpec, block = false): void {
  const el = parent.createDiv({ cls: `a4p-pv-empty${block ? " is-block" : ""}` });
  safeIcon(el.createSpan({ cls: "a4p-pv-empty-icon" }), spec.icon, "info");
  el.createSpan({ text: spec.text, cls: "a4p-pv-empty-text" });
  if (spec.cta) {
    const btn = el.createEl("button", { text: spec.cta.label, cls: "a4p-pv-empty-cta" });
    btn.addEventListener("click", spec.cta.onClick);
  }
}

/** 경고·안내 콜아웃 — 텍스트 노드는 호출부가 반환 요소에 추가 */
export function callout(parent: HTMLElement, kind: "warn" | "info", text: string): HTMLElement {
  const el = parent.createDiv({ cls: `a4p-pv-callout${kind === "info" ? " is-info" : ""}` });
  safeIcon(el.createSpan({ cls: "a4p-pv-callout-icon" }), kind === "info" ? "info" : "alert-triangle");
  el.createSpan({ text });
  return el;
}

export interface DiffGroup {
  /** 섹션 컨텍스트 라인 (faint, 거터 없음) — 예: "## 🗓️ 심방 기록" */
  context?: string;
  /** 추가되는 줄들 (+ 거터, 초록 틴트) */
  lines: string[];
}

/**
 * dry-run 미리보기 diff — "어느 노트의 어느 위치에 무엇이 추가되는가".
 * 노트 원문 문자(이모지 포함)를 그대로 보여준다 (미리보기의 정직성).
 */
export function renderDiff(
  parent: HTMLElement,
  fileName: string,
  groups: DiffGroup[],
  countLabel?: string,
): HTMLElement {
  const diff = parent.createDiv({ cls: "a4p-pv-diff" });
  const header = diff.createDiv({ cls: "a4p-pv-diff-header" });
  safeIcon(header.createSpan({ cls: "a4p-pv-diff-header-icon" }), "file-text");
  header.createSpan({ text: fileName });
  if (countLabel) header.createSpan({ text: countLabel, cls: "a4p-pv-diff-header-count" });

  const body = diff.createDiv({ cls: "a4p-pv-diff-body" });
  for (const group of groups) {
    if (group.context) {
      const line = body.createDiv({ cls: "a4p-pv-diff-line is-context" });
      line.createSpan({ text: " ", cls: "a4p-pv-diff-gutter" });
      line.createSpan({ text: group.context });
    }
    for (const text of group.lines) {
      const line = body.createDiv({ cls: "a4p-pv-diff-line is-added" });
      line.createSpan({ text: "+", cls: "a4p-pv-diff-gutter" });
      line.createSpan({ text });
    }
  }
  return diff;
}
