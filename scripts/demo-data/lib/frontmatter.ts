/**
 * 줄 단위 프론트매터 편집기 — 키 순서·따옴표·다중행 값(리스트)을 원문 그대로 보존한다.
 * YAML 파서를 쓰지 않는 이유: 볼트 노트의 서식(따옴표, 리스트 들여쓰기)을 바꾸지 않기 위해.
 */

export interface FmEntry {
  key: string;
  /** 키 줄 + 이어지는 들여쓴 줄들 (원문) */
  lines: string[];
}

export interface ParsedNote {
  entries: FmEntry[];
  /** 프론트매터 뒤 본문 (선행 개행 제거) */
  body: string;
  hasFrontmatter: boolean;
}

const KEY_RE = /^([^\s#][^:]*?):(?:\s|$)/;

export function parseNote(content: string): ParsedNote {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") return { entries: [], body: content, hasFrontmatter: false };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) return { entries: [], body: content, hasFrontmatter: false };

  const entries: FmEntry[] = [];
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    const m = line.match(KEY_RE);
    if (m && !/^\s/.test(line)) {
      entries.push({ key: m[1].trim(), lines: [line] });
    } else if (entries.length > 0) {
      entries[entries.length - 1].lines.push(line);
    }
    // 키 이전의 이상한 줄은 버린다 (실무상 없음)
  }
  const body = lines.slice(end + 1).join("\n").replace(/^\n+/, "");
  return { entries, body, hasFrontmatter: true };
}

export function getValue(entries: FmEntry[], key: string): string | null {
  const e = entries.find((x) => x.key === key);
  if (!e) return null;
  const first = e.lines[0];
  const idx = first.indexOf(":");
  const scalar = first.slice(idx + 1).trim();
  if (scalar) return unquote(scalar);
  // 리스트 값: 첫 항목만 돌려준다 (world/route 용도)
  const item = e.lines.slice(1).find((l) => /^\s*-\s+/.test(l));
  return item ? unquote(item.replace(/^\s*-\s+/, "").trim()) : "";
}

export function unquote(v: string): string {
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return v;
}

/** 스칼라 값 설정 — 기존 키면 그 자리(순서 유지), 없으면 `after` 키 뒤 또는 끝에 추가 */
export function setValue(entries: FmEntry[], key: string, rawValue: string, after?: string): void {
  const line = rawValue === "" ? `${key}:` : `${key}: ${rawValue}`;
  const e = entries.find((x) => x.key === key);
  if (e) {
    e.lines = [line];
    return;
  }
  const entry: FmEntry = { key, lines: [line] };
  if (after) {
    const idx = entries.findIndex((x) => x.key === after);
    if (idx !== -1) {
      entries.splice(idx + 1, 0, entry);
      return;
    }
  }
  entries.push(entry);
}

export function dropKey(entries: FmEntry[], key: string): boolean {
  const idx = entries.findIndex((x) => x.key === key);
  if (idx === -1) return false;
  entries.splice(idx, 1);
  return true;
}

export function hasKey(entries: FmEntry[], key: string): boolean {
  return entries.some((x) => x.key === key);
}

export function serialize(entries: FmEntry[], body: string): string {
  const fm = ["---", ...entries.flatMap((e) => e.lines), "---"];
  return fm.join("\n") + "\n\n" + body.replace(/^\n+/, "");
}

/** YAML 스칼라 이스케이프 — src/utils.ts yamlString과 동일 규칙 */
export function yamlScalar(s: string): string {
  if (/[:#\-?&*,\[\]{}|>!%@`'"\n]/.test(s) || /^\s|\s$/.test(s)) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}

/** 오버라이드 값: 이미 따옴표로 감싼 값이면 그대로, 아니면 yamlScalar */
export function rawFor(value: string | number | boolean): string {
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value.startsWith('"') && value.endsWith('"')) return value;
  return yamlScalar(value);
}
