/** 앵커 상대 날짜 유틸 — 시간대 영향을 받지 않도록 UTC 정오 기준으로 계산 */

export function parseIso(s: string): Date {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error(`날짜 형식 오류: ${s}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
}

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** 텍스트 안의 `{{T}}`, `{{T-3}}`, `{{T+14}}`를 앵커 기준 날짜로 치환 */
export function resolvePlaceholders(text: string, anchor: string): string {
  return text.replace(/\{\{\s*T\s*([+-]\s*\d+)?\s*\}\}/g, (_m, off) => {
    const n = off ? Number(String(off).replace(/\s+/g, "")) : 0;
    return addDays(anchor, n);
  });
}

/** 로컬 Date (src/utils.ts 날짜 함수가 로컬 Date를 받으므로) */
export function toLocalDate(iso: string): Date {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)!;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
