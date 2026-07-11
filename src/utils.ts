/**
 * obsidian 비의존 순수 함수 모음 — vitest 직접 테스트 대상.
 */

/** "[[홍길동]]" / "[[경로/홍길동|별칭]]" → "경로/홍길동" (링크패스). 비링크면 null */
export function parseWikilinkTarget(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = value.match(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/);
  if (!m) return null;
  const target = m[1].trim();
  return target ? target.normalize("NFC") : null;
}

/** Date → YYMMDD (심방일지 파일명용) */
export function formatYymmdd(dateStr: string): string | null {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return `${m[1].slice(2)}${m[2]}${m[3]}`;
}

/** "2026-03-08" 파싱 — 유효하지 않으면 null */
export function parseDate(dateStr: unknown): Date | null {
  if (typeof dateStr !== "string") return null;
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1) return null;
  return d;
}

/** 두 날짜 사이 개월 수 (내림) */
export function monthsBetween(fromStr: string, to: Date): number | null {
  const from = parseDate(fromStr);
  if (!from) return null;
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

/** 경과 일수 */
export function daysSince(fromStr: string, to: Date): number | null {
  const from = parseDate(fromStr);
  if (!from) return null;
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.floor(ms / 86400000);
}

/** 생일까지 남은 일수 (오늘=0). 생년월일에서 월·일만 사용 */
export function birthdayDday(birthStr: string, today: Date): number | null {
  const birth = parseDate(birthStr);
  if (!birth) return null;
  const t = startOfDay(today);
  let next = new Date(t.getFullYear(), birth.getMonth(), birth.getDate());
  if (next.getTime() < t.getTime()) {
    next = new Date(t.getFullYear() + 1, birth.getMonth(), birth.getDate());
  }
  return Math.round((next.getTime() - t.getTime()) / 86400000);
}

/** "3개월 전" 형태 상대 표기 */
export function formatRelativeKo(dateStr: string, today: Date): string {
  const days = daysSince(dateStr, today);
  if (days === null) return "";
  if (days <= 0) return "오늘";
  if (days < 30) return `${days}일 전`;
  const months = monthsBetween(dateStr, today) ?? 0;
  if (months < 12) return `${Math.max(1, months)}개월 전`;
  const years = Math.floor(months / 12);
  return `${years}년 전`;
}

/** YAML 값 이스케이프 (a4p-readwise-search 패턴) */
export function yamlString(s: string): string {
  if (/[:#\-?&*,\[\]{}|>!%@`'"\n]/.test(s) || /^\s|\s$/.test(s)) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}

/** NFC 정규화 비교용 */
export function nfc(s: string): string {
  return s.normalize("NFC");
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
