import { describe, expect, it } from "vitest";
import {
  buildMemberContent,
  buildVisitContent,
  buildVisitFileName,
  findCursorLine,
} from "../src/note-builders";
import { VISIT_SECTIONS, MEMBER_SECTIONS } from "../src/constants";
import { NewMemberInput, NewVisitInput } from "../src/types";

const visitInput: NewVisitInput = {
  memberPath: "400. Education & Ministry/460. 성도/홍길동.md",
  memberName: "홍길동",
  날짜: "2026-03-08",
  장소: "교회 식당",
  동행: "김목사",
  심방유형: "정기심방",
};

const memberFm = {
  type: "교인노트",
  이름: "홍길동",
  연락처: "010-1234-5678",
  구역: "4구역",
  직분: "집사",
  가족관계: "배우자 [[박순옥]]",
  가족수: 4,
};

describe("buildVisitFileName", () => {
  it("파일명 규칙", () => {
    expect(buildVisitFileName("2026-03-08", "홍길동")).toBe("260308_심방일지_홍길동");
  });
  it("무효 날짜", () => {
    expect(buildVisitFileName("2026-3-8", "홍길동")).toBeNull();
    expect(buildVisitFileName("2026-03-08", "")).toBeNull();
  });
});

describe("buildVisitContent", () => {
  const content = buildVisitContent(visitInput, memberFm, { insertWordClassification: true });

  it("7개 섹션 헤딩이 모두 constants와 일치", () => {
    for (const heading of Object.values(VISIT_SECTIONS)) {
      expect(content).toContain(`\n${heading}\n`);
    }
  });
  it("프론트매터 필수 필드", () => {
    expect(content).toContain("type: 심방일지");
    expect(content).toContain('성도: "[[홍길동]]"');
    expect(content).toContain("날짜: 2026-03-08");
    expect(content).toContain("심방유형: 정기심방");
    expect(content).toContain("created_via: a4p-pastoral-visit");
  });
  it("기본정보가 성도 프론트매터에서 채워짐", () => {
    expect(content).toContain("- **성명:** [[홍길동]]");
    expect(content).toContain("- **연락처:** 010-1234-5678");
    expect(content).toContain("- **소속구역:** 4구역");
    expect(content).toContain("- **직분:** 집사");
    expect(content).toContain("가족 4인");
  });
  it("심방정보가 모달 입력으로 채워짐", () => {
    expect(content).toContain("- **심방장소:** 교회 식당");
    expect(content).toContain("- **동행자:** 김목사");
  });
  it("성도 필드 누락 시 해당 줄 생략", () => {
    const sparse = buildVisitContent(visitInput, { type: "교인노트" }, { insertWordClassification: false });
    expect(sparse).not.toContain("- **연락처:**");
    expect(sparse).not.toContain("- **소속구역:**");
    expect(sparse).toContain("- **성명:** [[홍길동]]");
    expect(sparse).not.toContain("world:");
  });
  it("WORD 분류 토글", () => {
    expect(content).toContain("[[📩 208 상담 & 목양]]");
    expect(content).toContain("[[📝기록]]");
  });
});

describe("findCursorLine", () => {
  it("대화내용 입력 지점", () => {
    const content = buildVisitContent(visitInput, memberFm, { insertWordClassification: true });
    const lines = content.split("\n");
    const line = findCursorLine(content);
    expect(lines[line - 1].trim()).toBe("- **주요 대화 주제:**");
    expect(lines[line].startsWith("  - ")).toBe(true);
  });
});

describe("buildMemberContent", () => {
  const input: NewMemberInput = {
    이름: "테스트성도",
    성별: "남",
    생년월일: "1980-01-15",
    연락처: "010-9999-8888",
    구역: "1구역",
    직분: "성도",
    등록일: "2026-07-11",
    세례여부: "세례",
    결혼여부: "기혼",
    신급: "등록교인",
    가족수: "3",
    가족관계: "[[김가족]] (배우자)",
  };
  const content = buildMemberContent(input, { insertWordClassification: true, today: "2026-07-11" });

  it("교인노트 프론트매터", () => {
    expect(content).toContain("type: 교인노트");
    expect(content).toContain("이름: 테스트성도");
    expect(content).toContain("심방상태: 필요");
    expect(content).toContain('가족관계: "[[김가족]] (배우자)"');
  });
  it("본문 2섹션 골격", () => {
    expect(content).toContain(`${MEMBER_SECTIONS.visitLog}\n`);
    expect(content).toContain(`${MEMBER_SECTIONS.embeds}\n`);
    expect(content).toContain("# 테스트성도");
  });
});
