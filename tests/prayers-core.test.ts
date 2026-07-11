import { describe, expect, it } from "vitest";
import { parsePrayers, togglePrayerLine } from "../src/prayers-core";

/** 볼트 실물 형식의 기도제목 섹션 */
const VISIT = `---
type: 심방일지
---

# 심방기록

## 📝 대화내용
- **주제:** 기도 섹션 밖 불릿은 무시

## 🙏 기도제목
- **본인 기도제목:**
  - 퇴직 후 건강이 유지되도록
  - 남은 인생을 하나님의 뜻 가운데 살아가도록 ✅ 2026-07-01
- **가족 기도제목:**
  - 손자녀들이 신앙 안에서 바르게 자라도록

## ⛪ 교회 관련
- **출석상황:** 매주 출석
`;

describe("parsePrayers", () => {
  const items = parsePrayers(VISIT);

  it("기도제목 섹션 내부만 수집 (그룹 라벨 제외)", () => {
    expect(items.length).toBe(3);
    expect(items.every((i) => !i.text.includes("기도 섹션 밖"))).toBe(true);
    expect(items.every((i) => !i.text.includes("출석"))).toBe(true);
  });
  it("그룹 라벨 추적 (본인/가족)", () => {
    expect(items.find((i) => i.text.startsWith("퇴직 후"))?.group).toBe("본인 기도제목");
    expect(items.find((i) => i.text.startsWith("손자녀"))?.group).toBe("가족 기도제목");
  });
  it("응답 마커 인식 + 텍스트에서 마커 제거", () => {
    const answered = items.find((i) => i.answered)!;
    expect(answered.text).toBe("남은 인생을 하나님의 뜻 가운데 살아가도록");
    expect(answered.answeredDate).toBe("2026-07-01");
    expect(items.filter((i) => !i.answered).length).toBe(2);
  });
  it("기도제목 섹션 없으면 빈 배열", () => {
    expect(parsePrayers("# 노트\n- 불릿")).toEqual([]);
  });
  it("커스텀 헤딩 지원", () => {
    const custom = "## 중보 기도\n- 새 성전 건축\n";
    expect(parsePrayers(custom, "## 중보 기도").length).toBe(1);
  });
});

describe("togglePrayerLine", () => {
  const items = parsePrayers(VISIT);
  const active = items.find((i) => i.text.startsWith("퇴직 후"))!;
  const answered = items.find((i) => i.answered)!;

  it("응답 표시: 라인 끝에 ✅ 날짜 추가 (해당 라인만)", () => {
    const r = togglePrayerLine(VISIT, active.line, active.raw, "2026-07-12");
    expect(r.stale).toBe(false);
    const before = VISIT.split("\n");
    const after = r.newContent.split("\n");
    const diff = before.filter((l, i) => after[i] !== l);
    expect(diff.length).toBe(1);
    expect(after[active.line]).toBe(`${active.raw} ✅ 2026-07-12`);
  });
  it("응답 해제: 마커 제거로 원상복구", () => {
    const r = togglePrayerLine(VISIT, answered.line, answered.raw, "2026-07-12");
    expect(r.newContent.split("\n")[answered.line]).toBe(
      "  - 남은 인생을 하나님의 뜻 가운데 살아가도록",
    );
  });
  it("표시 → 해제 왕복 시 원문 복원", () => {
    const marked = togglePrayerLine(VISIT, active.line, active.raw, "2026-07-12");
    const markedRaw = marked.newContent.split("\n")[active.line];
    const unmarked = togglePrayerLine(marked.newContent, active.line, markedRaw, "2026-07-13");
    expect(unmarked.newContent).toBe(VISIT);
  });
  it("라인 원문 불일치 시 무변경", () => {
    const r = togglePrayerLine(VISIT, active.line, "  - 다른 내용", "2026-07-12");
    expect(r.stale).toBe(true);
    expect(r.newContent).toBe(VISIT);
  });
});
