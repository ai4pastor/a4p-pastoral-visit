import { describe, expect, it } from "vitest";
import { parseFollowUps, toggleFollowUpLine } from "../src/actions-core";

const VISIT = `---
type: 심방일지
---

# 심방기록

## 📝 대화내용
- [ ] 섹션 밖 체크박스는 무시

## 💡 후속조치
- [ ] 수술 전 심방 계획
- [x] 소그룹 안내 자료 전달
- [X] 대문자 체크
  - [ ] 중첩 들여쓰기 항목
- [ ]
`;

describe("parseFollowUps", () => {
  const items = parseFollowUps(VISIT);

  it("후속조치 섹션 내부만 수집", () => {
    expect(items.every((i) => !i.text.includes("섹션 밖"))).toBe(true);
  });
  it("체크 상태 구분 (x/X)", () => {
    expect(items.find((i) => i.text === "수술 전 심방 계획")?.checked).toBe(false);
    expect(items.find((i) => i.text === "소그룹 안내 자료 전달")?.checked).toBe(true);
    expect(items.find((i) => i.text === "대문자 체크")?.checked).toBe(true);
  });
  it("중첩 들여쓰기 항목 포함", () => {
    expect(items.find((i) => i.text === "중첩 들여쓰기 항목")).toBeDefined();
  });
  it("빈 템플릿 항목('- [ ] ') 제외", () => {
    expect(items.filter((i) => i.text === "").length).toBe(0);
  });
  it("후속조치 섹션 없으면 빈 배열", () => {
    expect(parseFollowUps("# 노트\n내용만")).toEqual([]);
  });
});

describe("toggleFollowUpLine", () => {
  const items = parseFollowUps(VISIT);
  const unchecked = items.find((i) => i.text === "수술 전 심방 계획")!;
  const checked = items.find((i) => i.text === "소그룹 안내 자료 전달")!;

  it("미체크 → 체크 (해당 라인만)", () => {
    const r = toggleFollowUpLine(VISIT, unchecked.line, unchecked.raw);
    expect(r.stale).toBe(false);
    const diff = VISIT.split("\n").filter((l, i) => r.newContent.split("\n")[i] !== l);
    expect(diff.length).toBe(1);
    expect(r.newContent).toContain("- [x] 수술 전 심방 계획");
  });
  it("체크 → 미체크", () => {
    const r = toggleFollowUpLine(VISIT, checked.line, checked.raw);
    expect(r.newContent).toContain("- [ ] 소그룹 안내 자료 전달");
  });
  it("라인 원문 불일치 시 무변경", () => {
    const r = toggleFollowUpLine(VISIT, unchecked.line, "- [ ] 다른 내용");
    expect(r.stale).toBe(true);
    expect(r.newContent).toBe(VISIT);
  });
});
