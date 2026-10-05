import { describe, it, expect } from "vitest";
import { parseNote, setValue, dropKey, getValue, serialize, rawFor } from "../scripts/demo-data/lib/frontmatter";
import { addDays, resolvePlaceholders } from "../scripts/demo-data/lib/dates";
import { parseFragment, applyOverrides, SeedMember } from "../scripts/demo-data/lib/scenario";
import { renderVisit, renderMember, normalizeLayout } from "../scripts/demo-data/lib/render";
import { computeCards } from "../scripts/demo-data/lib/cards";
import { planSync } from "../src/sync-core";

const SEED_NOTE = `---
created: 2026-02-09T15:20
world:
  - "[[📩 208 상담 & 목양]]"
type: 교인노트
이름: 홍길동
생년월일: 1954-12-06
등록일: 2022-07-03
결혼여부: 미혼
신급: 새신자
세례여부: 미세례
가족수: 1
가족관계: "[[박순옥]] (배우자)"
심방상태: 필요
성격: 좋음
---

# 홍길동
`;

const FRAGMENT = `---
member: 홍길동
offset: -3
type: 정기심방
place: 자택
companion: 김목사
synced: true
---

## 📝 대화내용
- **주요 대화 주제:**
  - **첫 주제:** 내용
  - **둘째 주제:** 내용

## 🙏 기도제목
- **본인 기도제목:**
  - 기도 하나 ✅ {{T-1}}
  - 기도 둘

## ⛪ 교회 관련
- **출석상황:** 꾸준

## 🔍 관찰 및 평가
### 영적상태
- **신앙성장:** 좋음

## 💡 후속조치
- [ ] 할 일 ({{T+7}}까지)
- [x] 끝난 일
`;

describe("frontmatter 편집기", () => {
  it("키 순서·리스트 값을 보존하고 set/drop 한다", () => {
    const p = parseNote(SEED_NOTE);
    expect(getValue(p.entries, "world")).toBe("[[📩 208 상담 & 목양]]");
    setValue(p.entries, "심방상태", "완료");
    dropKey(p.entries, "성격");
    setValue(p.entries, "반영", "true");
    const out = serialize(p.entries, p.body);
    expect(out).toContain("world:\n  - \"[[📩 208 상담 & 목양]]\"");
    expect(out).toContain("심방상태: 완료");
    expect(out).not.toContain("성격");
    expect(out.indexOf("type:")).toBeLessThan(out.indexOf("이름:"));
    expect(out.endsWith("# 홍길동\n")).toBe(true);
  });
  it("rawFor 는 특수문자를 따옴표로 감싼다", () => {
    expect(rawFor("[[박순옥]] (배우자)")).toBe('"[[박순옥]] (배우자)"');
    expect(rawFor("완료")).toBe("완료");
    expect(rawFor(4)).toBe("4");
  });
});

describe("날짜 치환", () => {
  it("{{T±n}} 를 앵커 기준으로 치환한다", () => {
    expect(addDays("2026-10-05", -3)).toBe("2026-10-02");
    expect(resolvePlaceholders("a {{T}} b {{T-1}} c {{T+14}}", "2026-10-05")).toBe("a 2026-10-05 b 2026-10-04 c 2026-10-19");
  });
});

describe("조각 파싱·오버라이드", () => {
  it("offset 으로 날짜를 만들고 5섹션을 분리한다", () => {
    const spec = parseFragment(FRAGMENT, "f.md", "2026-10-05");
    expect(spec.date).toBe("2026-10-02");
    expect(Object.keys(spec.sections)).toHaveLength(5);
    expect(spec.sections["## 🙏 기도제목"].join("\n")).toContain("✅ 2026-10-04");
  });
  it("앵커 이후 날짜·허용 외 유형은 거부한다", () => {
    expect(() => parseFragment(FRAGMENT.replace("offset: -3", "offset: 1"), "f.md", "2026-10-05")).toThrow();
    expect(() => parseFragment(FRAGMENT.replace("정기심방", "축하심방"), "f.md", "2026-10-05")).toThrow();
  });
  it("위생 규칙: 배우자→기혼, 가족수1→2, 미세례+등록교인→세례, 오래된 새신자→등록교인", () => {
    const p = parseNote(SEED_NOTE);
    const seed: SeedMember = { name: "홍길동", entries: p.entries, extraBody: "# 홍길동" };
    const merged = applyOverrides([seed], {
      dropKeys: ["성격"],
      statusIfVisited: "완료",
      rules: { baptizedIfConfirmed: true, newcomerGradeMaxYears: 2, spouseConsistency: true },
      members: { 홍길동: { birthdayOffset: 1 } },
    }, "2026-10-05", new Set(["홍길동"]));
    const e = merged.get("홍길동")!.entries;
    expect(getValue(e, "결혼여부")).toBe("기혼");
    expect(getValue(e, "가족수")).toBe("2");
    expect(getValue(e, "신급")).toBe("등록교인");
    expect(getValue(e, "세례여부")).toBe("세례");
    expect(getValue(e, "심방상태")).toBe("완료");
    expect(getValue(e, "생년월일")).toBe("1954-10-06");
    expect(getValue(e, "성격")).toBeNull();
  });
});

describe("렌더", () => {
  const p = parseNote(SEED_NOTE);
  const member: SeedMember = { name: "홍길동", entries: p.entries, extraBody: "# 홍길동" };
  const spec = parseFragment(FRAGMENT, "f.md", "2026-10-05");
  const visit = renderVisit(spec, member.entries);

  it("일지: 파일명·반영·7헤딩·요약 추출", () => {
    expect(visit.basename).toBe("261002_심방일지_홍길동");
    expect(visit.content).toContain("반영: true");
    expect(visit.content.match(/^## /gm)).toHaveLength(7);
    expect(visit.summary).toBe("정기심방 (2026-10-02), 첫 주제, 둘째 주제");
    expect(visit.anchors).toEqual(["📝 대화내용", "🙏 기도제목", "💡 후속조치"]);
  });
  it("성도 노트: planSync 결과와 멱등", () => {
    const content = renderMember(member, [visit]);
    expect(content).toContain("- [[261002_심방일지_홍길동]] — 정기심방 (2026-10-02), 첫 주제, 둘째 주제");
    expect(content).toContain("![[261002_심방일지_홍길동#💡 후속조치]]");
    const again = planSync(content, visit.basename, spec.date, spec.type, visit.summary);
    expect(again.nothingToDo).toBe(true);
  });
  it("심방 없는 성도는 플레이스홀더 골격", () => {
    const content = renderMember(member, []);
    expect(content).toContain("(심방 기록이 추가되면 여기에 링크됩니다)");
  });
  it("normalizeLayout 은 헤딩 뒤 빈 줄 1개를 보장한다", () => {
    expect(normalizeLayout("## A\n- x\n\n\n\n## B\n")).toBe("## A\n\n- x\n\n## B\n");
  });
  it("카드 계산: 미반영·후속조치·생일", () => {
    const r = computeCards(
      [{ name: "홍길동", status: "완료", birth: "1954-10-09", registered: "2022-07-03" }],
      [{ member: "홍길동", date: spec.date, synced: false, content: visit.content, basename: visit.basename }],
      "2026-10-05",
    );
    expect(r.unsynced).toEqual(["261002_심방일지_홍길동"]);
    expect(r.pendingFollowUps).toHaveLength(1);
    expect(r.birthdays).toEqual([{ name: "홍길동", dday: 4 }]);
    expect(r.prayersAnswered).toBe(1);
    expect(r.prayersActive).toBe(1);
  });
});
