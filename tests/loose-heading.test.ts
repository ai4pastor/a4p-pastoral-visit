import { describe, expect, it } from "vitest";
import { looseHeadingText } from "../src/utils";
import { extractSummary, findSectionRange, planSync, resolveAnchors } from "../src/sync-core";
import { parseFollowUps } from "../src/actions-core";
import { parsePrayers } from "../src/prayers-core";
import { DEFAULT_HEADINGS } from "../src/constants";

/** 이모지 없이 작성된 심방일지 */
const VISIT_NO_EMOJI = `---
type: 심방일지
---

# 심방기록

## 대화내용
- **주요 대화 주제:**
  - **이사 준비:** 다음 달 이사 예정.

## 기도제목
- **본인 기도제목:**
  - 이사가 순조롭게 되도록

## 후속조치
- [ ] 이삿날 심방
`;

/** 이모지 없이 작성된 성도 노트 */
const MEMBER_NO_EMOJI = `---
type: 교인노트
---

# 김새신

## 심방 기록

## 중요 심방 내용 (임베드)
`;

describe("looseHeadingText", () => {
  it("이모지·## 접두·공백 정규화", () => {
    expect(looseHeadingText("## 📝 대화내용")).toBe("대화내용");
    expect(looseHeadingText("## 대화내용")).toBe("대화내용");
    expect(looseHeadingText("##  ⛪  교회  관련")).toBe("교회 관련");
    expect(looseHeadingText("## 📌 중요 심방 내용 (임베드)")).toBe("중요 심방 내용 (임베드)");
  });
});

describe("느슨 매칭 — 이모지 없는 일지 분석", () => {
  it("findSectionRange가 이모지 없는 헤딩을 찾음", () => {
    const lines = VISIT_NO_EMOJI.split("\n");
    const r = findSectionRange(lines, DEFAULT_HEADINGS.conversation);
    expect(r).not.toBeNull();
    expect(lines[r!.headingLine]).toBe("## 대화내용");
  });
  it("요약 추출 동작", () => {
    expect(extractSummary(VISIT_NO_EMOJI, "정기심방", "2026-07-12")).toBe(
      "정기심방 (2026-07-12), 이사 준비",
    );
  });
  it("후속조치·기도제목 수집 동작", () => {
    expect(parseFollowUps(VISIT_NO_EMOJI).length).toBe(1);
    expect(parsePrayers(VISIT_NO_EMOJI).length).toBe(1);
  });
  it("정확 일치가 느슨 일치보다 우선", () => {
    const both = "## 대화내용\n- 느슨\n\n## 📝 대화내용\n- 정확\n";
    const r = findSectionRange(both.split("\n"), DEFAULT_HEADINGS.conversation);
    expect(both.split("\n")[r!.headingLine]).toBe("## 📝 대화내용");
  });
});

describe("resolveAnchors — 임베드가 실제 헤딩을 따라감", () => {
  it("이모지 없는 일지 → 이모지 없는 앵커", () => {
    expect(resolveAnchors(VISIT_NO_EMOJI, DEFAULT_HEADINGS)).toEqual([
      "대화내용",
      "기도제목",
      "후속조치",
    ]);
  });
  it("표준 일지 → 표준 앵커", () => {
    const standard = "## 📝 대화내용\n\n## 🙏 기도제목\n\n## 💡 후속조치\n";
    expect(resolveAnchors(standard, DEFAULT_HEADINGS)).toEqual([
      "📝 대화내용",
      "🙏 기도제목",
      "💡 후속조치",
    ]);
  });
  it("섹션 없으면 설정 헤딩 앵커로 폴백", () => {
    expect(resolveAnchors("# 빈 노트", DEFAULT_HEADINGS)).toEqual([
      "📝 대화내용",
      "🙏 기도제목",
      "💡 후속조치",
    ]);
  });
});

describe("느슨 매칭 — 이모지 없는 성도 노트 반영", () => {
  it("섹션 신설 없이 기존 섹션에 append + 실제 앵커로 임베드", () => {
    const anchors = resolveAnchors(VISIT_NO_EMOJI, DEFAULT_HEADINGS);
    const plan = planSync(
      MEMBER_NO_EMOJI, "260712_심방일지_김새신", "2026-07-12", "정기심방", "요약",
      DEFAULT_HEADINGS, anchors,
    );
    expect(plan.warnings).toEqual([]); // "섹션을 새로 만듭니다" 없음
    expect(plan.newContent).toContain("![[260712_심방일지_김새신#대화내용]]");
    expect(plan.newContent).not.toContain("#📝 대화내용]]");
  });
});
