import { describe, expect, it } from "vitest";
import { DEFAULT_HEADINGS, HeadingConfig, embedAnchorsOf } from "../src/constants";
import { buildVisitContent, findCursorLine } from "../src/note-builders";
import { extractSummary, planSync } from "../src/sync-core";
import { parseFollowUps } from "../src/actions-core";
import { NewVisitInput } from "../src/types";

/** 교회 커스텀 헤딩 세트 (이모지 없음, 다른 이름) */
const CUSTOM: HeadingConfig = {
  ...DEFAULT_HEADINGS,
  conversation: "## 나눔 내용",
  prayer: "## 중보 기도",
  followUp: "## 할 일",
  memberVisitLog: "## 심방 이력",
  memberEmbeds: "## 심방 상세",
};

const visitInput: NewVisitInput = {
  memberPath: "성도/홍길동.md",
  memberName: "홍길동",
  날짜: "2026-07-12",
  장소: "자택",
  동행: "",
  심방유형: "정기심방",
};

describe("커스텀 헤딩 — 일지 생성", () => {
  const content = buildVisitContent(visitInput, {}, {
    insertWordClassification: false,
    headings: CUSTOM,
  });

  it("커스텀 헤딩으로 생성됨", () => {
    expect(content).toContain("\n## 나눔 내용\n");
    expect(content).toContain("\n## 할 일\n");
    expect(content).not.toContain("## 📝 대화내용");
  });
  it("커서 위치도 커스텀 헤딩 기준", () => {
    const line = findCursorLine(content, CUSTOM.conversation);
    expect(line).toBeGreaterThan(0);
  });
});

describe("커스텀 헤딩 — 분석·반영", () => {
  const visitContent = `---
type: 심방일지
---
## 나눔 내용
- **이사 준비:** 다음 달 이사 예정.

## 할 일
- [ ] 이삿날 심방
`;

  it("요약 추출이 커스텀 헤딩에서 동작", () => {
    expect(extractSummary(visitContent, "정기심방", "2026-07-12", CUSTOM.conversation)).toBe(
      "정기심방 (2026-07-12), 이사 준비",
    );
  });
  it("기본 헤딩으로 찾으면 fallback (섹션 못 찾음)", () => {
    expect(extractSummary(visitContent, "정기심방", "2026-07-12")).toBe("정기심방 (2026-07-12)");
  });
  it("후속조치 수집이 커스텀 헤딩에서 동작", () => {
    const items = parseFollowUps(visitContent, CUSTOM.followUp);
    expect(items.length).toBe(1);
    expect(items[0].text).toBe("이삿날 심방");
  });

  it("반영이 커스텀 성도 노트 섹션·임베드 앵커 사용", () => {
    const memberContent = `# 홍길동

## 심방 이력

## 심방 상세
`;
    const plan = planSync(memberContent, "260712_심방일지_홍길동", "2026-07-12", "정기심방", "요약", CUSTOM);
    expect(plan.warnings).toEqual([]); // 커스텀 섹션을 찾았으므로 신설 경고 없음
    expect(plan.newContent).toContain("![[260712_심방일지_홍길동#나눔 내용]]");
    expect(plan.newContent).toContain("![[260712_심방일지_홍길동#할 일]]");
  });
});

describe("embedAnchorsOf", () => {
  it("헤딩에서 ## 접두를 뗀 앵커 3종", () => {
    expect(embedAnchorsOf(CUSTOM)).toEqual(["나눔 내용", "중보 기도", "할 일"]);
    expect(embedAnchorsOf(DEFAULT_HEADINGS)).toEqual(["📝 대화내용", "🙏 기도제목", "💡 후속조치"]);
  });
});
