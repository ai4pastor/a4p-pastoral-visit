/**
 * WORD 분류법 노트 분석 — 순수 파싱 로직 (obsidian 비의존, vitest 대상).
 *
 * 수강생마다 번호·순서가 다른 WORD 분류를 쓰므로, 하드코딩 대신
 * 각자의 분류법 노트(체계 노트 또는 Templater 템플릿)를 분석해
 * world(📩)·route(📝) 유효 값을 추출하고 사용자가 선택하게 한다.
 * — 볼트 절대 원칙: 분류법에 정의된 값만 사용, 새 값 창조 금지.
 */

export interface WordValues {
  /** `[[📩 208 상담 & 목양]]` 형태 (괄호 포함) */
  world: string[];
  /** `[[📝기록]]` 형태 */
  route: string[];
}

const WORLD_RE = /\[\[(📩\s*[^\]|#]+?)(?:\|[^\]]*)?\]\]/g;
const ROUTE_RE = /\[\[(📝\s*[^\]|#]+?)(?:\|[^\]]*)?\]\]/g;
/** Templater 템플릿의 허용 목록 배열 항목: "208 상담 & 목양", */
const ALLOWED_ITEM_RE = /^\s*"(\d{3}\s+[^"]+)",?\s*$/;

/** WORD 분류법 노트 본문에서 world·route 유효 값 추출 */
export function parseWordValues(content: string): WordValues {
  const world = new Set<string>();
  const route = new Set<string>();

  // ① wikilink 형태 (체계 노트·일반 노트): [[📩 ...]] / [[📝...]]
  // Templater 템플릿의 JS 코드 조각(${...}, 백틱)은 값이 아니므로 제외
  const isCodeArtifact = (s: string) => s.includes("${") || s.includes("`");
  for (const m of content.matchAll(WORLD_RE)) {
    const value = m[1].trim();
    if (!isCodeArtifact(value)) world.add(`[[${value}]]`);
  }
  for (const m of content.matchAll(ROUTE_RE)) {
    const value = m[1].trim();
    if (!isCodeArtifact(value)) route.add(`[[${value}]]`);
  }

  // ② Templater 템플릿의 ALLOWED_WORLD 배열 ("208 상담 & 목양" → [[📩 208 상담 & 목양]])
  const allowedBlock = content.match(/ALLOWED_WORLD\s*=\s*\[([\s\S]*?)\]/);
  if (allowedBlock) {
    for (const line of allowedBlock[1].split("\n")) {
      const m = line.match(ALLOWED_ITEM_RE);
      if (m) world.add(`[[📩 ${m[1].trim()}]]`);
    }
  }

  return {
    world: Array.from(world).sort((a, b) => a.localeCompare(b, "ko", { numeric: true })),
    route: Array.from(route).sort((a, b) => a.localeCompare(b, "ko")),
  };
}
