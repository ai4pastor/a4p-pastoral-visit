import { describe, expect, it } from "vitest";
import { DigestEntry, buildPrayerDigest } from "../src/prayers-core";

const entries: DigestEntry[] = [
  {
    memberName: "홍길동",
    memberMeta: "집사 · 4구역",
    items: [
      {
        text: "박순옥 권사 무릎 수술이 잘 되도록",
        group: "가족 기도제목",
        visitDate: "2026-03-08",
        visitBasename: "260308_심방일지_홍길동",
        answered: false,
        answeredDate: null,
      },
      {
        text: "퇴직 후 건강이 유지되도록",
        group: "본인 기도제목",
        visitDate: "2026-01-25",
        visitBasename: "260125_심방일지_홍길동",
        answered: true,
        answeredDate: "2026-07-01",
      },
    ],
  },
  {
    memberName: "김영수",
    memberMeta: "",
    items: [
      {
        text: "직장 승진 적응",
        group: "",
        visitDate: "2026-01-02",
        visitBasename: "260102_심방일지_김영수",
        answered: false,
        answeredDate: null,
      },
    ],
  },
];

const opts = {
  dateStr: "2026-07-12",
  rangeLabel: "최근 4주 (2026-06-14 ~ 2026-07-12)",
  includeAnswered: true,
  insertWordClassification: true,
  worldValue: "[[📩 208 상담 & 목양]]",
  routeValue: "[[📝기록]]",
};

describe("buildPrayerDigest", () => {
  const content = buildPrayerDigest(entries, opts);

  it("프론트매터 (type·태그·WORD 분류)", () => {
    expect(content).toContain("type: 기도모음");
    expect(content).toContain("- 기도모음");
    expect(content).toContain('[[📩 208 상담 & 목양]]');
    expect(content).toContain("created_via: a4p-pastoral-visit");
  });
  it("성도별 섹션 (wikilink 헤딩 + 부가 정보)", () => {
    expect(content).toContain("## [[홍길동]] (집사 · 4구역)");
    expect(content).toContain("## [[김영수]]");
    expect(content).not.toContain("## [[김영수]] ()");
  });
  it("진행 중 항목: 그룹 + 출처 일지 wikilink", () => {
    expect(content).toContain(
      "- 박순옥 권사 무릎 수술이 잘 되도록 — 가족 기도제목 · [[260308_심방일지_홍길동|2026-03-08]]",
    );
    expect(content).toContain("- 직장 승진 적응 — [[260102_심방일지_김영수|2026-01-02]]");
  });
  it("응답 항목: 취소선 + 감사 표기", () => {
    expect(content).toContain("- ~~퇴직 후 건강이 유지되도록~~ ✅ 감사 (2026-07-01)");
  });
  it("건수 요약 콜아웃", () => {
    expect(content).toContain("진행 중 2건 · 전체 3건");
  });
  it("빈 목록 처리", () => {
    const empty = buildPrayerDigest([], { ...opts, includeAnswered: false });
    expect(empty).toContain("(수집된 기도제목이 없습니다)");
  });
});
