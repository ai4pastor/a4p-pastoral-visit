import { describe, expect, it } from "vitest";
import { parseWordValues } from "../src/word-config";

/** Templater 템플릿 형식 (수강생 표준 — ALLOWED_WORLD 배열, 속성값만 다름) */
const TEMPLATER_TEMPLATE = `---
world:
route:
---
<%_*
const ALLOWED_WORLD = [
	"101 조직신학",
	"208 상담 & 목양",
	"304 옵시디언 & PKM",
];
const ALLOWED_OUTCOME = [
	"설교",
	"강의",
];
// R은 고정
fm.route = ["[[📝입력]]"];
_%>
`;

/** 분류 체계 노트 형식 (wikilink 테이블) */
const SYSTEM_NOTE = `# WORD 분류 체계

| 코드 | 분류 |
| --- | --- |
| 101 | [[📩 101 조직신학]] |
| 208 | [[📩 208 상담 & 목양]] |

Route: [[📝입력]] → [[📝작업]] → [[📝완료]] → [[📝기록]]

대분류 [[📖 100 신학]]은 world 값으로 쓰지 않는다.
`;

describe("parseWordValues — Templater 템플릿", () => {
  const result = parseWordValues(TEMPLATER_TEMPLATE);

  it("ALLOWED_WORLD 배열에서 world 추출 (📩 wikilink 형태로)", () => {
    expect(result.world).toContain("[[📩 101 조직신학]]");
    expect(result.world).toContain("[[📩 208 상담 & 목양]]");
    expect(result.world).toContain("[[📩 304 옵시디언 & PKM]]");
    expect(result.world.length).toBe(3);
  });
  it("ALLOWED_OUTCOME은 world에 섞이지 않음", () => {
    expect(result.world.some((w) => w.includes("설교"))).toBe(false);
  });
  it("route 고정값 추출", () => {
    expect(result.route).toEqual(["[[📝입력]]"]);
  });
});

describe("parseWordValues — 분류 체계 노트", () => {
  const result = parseWordValues(SYSTEM_NOTE);

  it("📩 wikilink만 world로 (📖 대분류 제외)", () => {
    expect(result.world).toEqual(["[[📩 101 조직신학]]", "[[📩 208 상담 & 목양]]"]);
  });
  it("route 4단계 전부 추출", () => {
    expect(result.route).toEqual(["[[📝기록]]", "[[📝완료]]", "[[📝입력]]", "[[📝작업]]"]);
  });
});

describe("parseWordValues — 엣지", () => {
  it("별칭 wikilink 처리", () => {
    const r = parseWordValues("[[📩 501 브런치 스토리|브런치]]");
    expect(r.world).toEqual(["[[📩 501 브런치 스토리]]"]);
  });
  it("중복 제거", () => {
    const r = parseWordValues("[[📝기록]] [[📝기록]]");
    expect(r.route).toEqual(["[[📝기록]]"]);
  });
  it("관련 없는 노트면 빈 결과", () => {
    const r = parseWordValues("# 일반 노트\n내용");
    expect(r.world).toEqual([]);
    expect(r.route).toEqual([]);
  });
  it("Templater JS 코드 조각은 제외", () => {
    const r = parseWordValues('out.push(`[[📩 ${inner}]]`); if (found) out.push(`[[📩 ${found}]]`);');
    expect(r.world).toEqual([]);
  });
});
