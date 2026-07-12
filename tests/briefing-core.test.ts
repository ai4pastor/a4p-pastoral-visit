import { describe, expect, it } from "vitest";
import {
  ageFrom,
  buildBriefingModel,
  filterMembers,
  parseFamilyRelations,
} from "../src/briefing-core";
import { ActionItem, MemberEntry, PrayerItem, VisitEntry } from "../src/types";

const TODAY = new Date(2026, 6, 12); // 2026-07-12

function member(name: string, fm: Record<string, unknown> = {}): MemberEntry {
  return { path: `성도/${name}.md`, name, fm };
}

function visit(basename: string, date: string, extra: Record<string, unknown> = {}): VisitEntry {
  return {
    path: `심방일지/${basename}.md`,
    basename,
    fm: { type: "심방일지", 날짜: date, ...extra },
    memberPath: "성도/홍길동.md",
  };
}

function action(visitPath: string, text: string, checked = false): ActionItem {
  return {
    visitPath,
    visitBasename: "x",
    memberName: "홍길동",
    visitDate: "2026-01-01",
    line: 0,
    raw: `- [ ] ${text}`,
    text,
    checked,
    daysElapsed: 10,
  };
}

function prayer(visitPath: string, text: string): PrayerItem {
  return {
    visitPath,
    visitBasename: "x",
    memberName: "홍길동",
    visitDate: "2026-01-01",
    line: 0,
    raw: `- ${text}`,
    text,
    group: "본인 기도제목",
    answered: false,
    answeredDate: null,
  };
}

describe("filterMembers", () => {
  const members = [
    member("홍길동", { 구역: "1구역", 직분: "집사" }),
    member("김철수", { 구역: "2구역", 직분: "장로" }),
    member("박영희", { 구역: "1구역" }),
  ];

  it("빈 검색어 = 전체 (가나다 정렬)", () => {
    const r = filterMembers(members, "");
    expect(r.map((m) => m.name)).toEqual(["김철수", "박영희", "홍길동"]);
  });
  it("이름 부분일치", () => {
    expect(filterMembers(members, "길동").map((m) => m.name)).toEqual(["홍길동"]);
  });
  it("구역 일치", () => {
    expect(filterMembers(members, "1구역").map((m) => m.name)).toEqual(["박영희", "홍길동"]);
  });
  it("직분 일치", () => {
    expect(filterMembers(members, "장로").map((m) => m.name)).toEqual(["김철수"]);
  });
  it("NFD 자소분리 한글도 매칭 (macOS 파일명 함정)", () => {
    const nfdQuery = "홍길동".normalize("NFD");
    expect(filterMembers(members, nfdQuery).map((m) => m.name)).toEqual(["홍길동"]);
  });
});

describe("ageFrom", () => {
  it("생일 지남", () => {
    expect(ageFrom("1977-05-01", TODAY)).toBe(49);
  });
  it("생일 전", () => {
    expect(ageFrom("1977-12-06", TODAY)).toBe(48);
  });
  it("생일 당일", () => {
    expect(ageFrom("1977-07-12", TODAY)).toBe(49);
  });
  it("잘못된 날짜는 null", () => {
    expect(ageFrom("미상", TODAY)).toBeNull();
  });
});

describe("parseFamilyRelations", () => {
  it("단일 링크 + 라벨", () => {
    expect(parseFamilyRelations("[[박순옥]] (배우자)")).toEqual([
      { linkTarget: "박순옥", display: "박순옥", label: "배우자" },
    ]);
  });
  it("다중 링크", () => {
    const r = parseFamilyRelations("[[박순옥]] (배우자), [[홍아들]] (자녀)");
    expect(r.map((f) => f.display)).toEqual(["박순옥", "홍아들"]);
    expect(r.map((f) => f.label)).toEqual(["배우자", "자녀"]);
  });
  it("배열 값", () => {
    const r = parseFamilyRelations(["[[박순옥]] (배우자)", "[[홍아들]]"]);
    expect(r.length).toBe(2);
    expect(r[1].label).toBe("");
  });
  it("별칭 우선 표시", () => {
    expect(parseFamilyRelations("[[성도/박순옥|순옥]] (배우자)")[0].display).toBe("순옥");
  });
  it("비링크 문자열은 빈 결과", () => {
    expect(parseFamilyRelations("배우자 박순옥")).toEqual([]);
    expect(parseFamilyRelations(3)).toEqual([]);
  });
});

describe("buildBriefingModel", () => {
  const m = member("홍길동", {
    직분: "집사",
    구역: "1구역",
    심방상태: "완료",
    생년월일: "1977-12-06",
    연락처: "010-1234-5678",
    등록일: "2025-01-12",
    "2026년 봉사": "주방봉사",
  });
  const visits = [
    visit("260110_심방일지_홍길동", "2026-01-10", { 심방유형: "정기심방", 장소: "자택" }),
    visit("260320_심방일지_홍길동", "2026-03-20", { 심방유형: "특별심방", 장소: "병원" }),
    visit("260601_심방일지_홍길동", "2026-06-01", { 심방유형: "정기심방", 장소: "자택" }),
  ];

  it("마지막 심방 + 상대 날짜", () => {
    const model = buildBriefingModel(m, visits, [], [], [], TODAY);
    expect(model.lastVisit?.date).toBe("2026-06-01");
    expect(model.lastVisit?.type).toBe("정기심방");
    expect(model.lastVisit?.relative).toBe("1개월 전");
  });

  it("심방 0건이면 lastVisit null + 빈 타임라인", () => {
    const model = buildBriefingModel(m, [], [], [], [], TODAY);
    expect(model.lastVisit).toBeNull();
    expect(model.timeline).toEqual([]);
  });

  it("후속조치: 체크된 항목·타 성도 visitPath 제외", () => {
    const actions = [
      action(visits[0].path, "안부 전화"),
      action(visits[1].path, "완료된 일", true),
      action("심방일지/타성도.md", "다른 성도 일"),
    ];
    const model = buildBriefingModel(m, visits, actions, [], [], TODAY);
    expect(model.pendingActions.map((a) => a.text)).toEqual(["안부 전화"]);
  });

  it("기도제목: 최근 일지 2건만", () => {
    const prayers = [
      prayer(visits[0].path, "옛 기도"),
      prayer(visits[1].path, "건강 회복"),
      prayer(visits[2].path, "자녀 진로"),
    ];
    const model = buildBriefingModel(m, visits, [], prayers, [], TODAY);
    expect(model.recentPrayers.map((p) => p.text)).toEqual(["건강 회복", "자녀 진로"]);
  });

  it("타임라인 날짜 내림차순", () => {
    const model = buildBriefingModel(m, visits, [], [], [], TODAY);
    expect(model.timeline.map((t) => t.date)).toEqual(["2026-06-01", "2026-03-20", "2026-01-10"]);
    expect(model.timeline[1].place).toBe("병원");
  });

  it("참고 정보: 나이·등록기간·봉사·연락처 원문", () => {
    const model = buildBriefingModel(m, visits, [], [], [], TODAY);
    expect(model.age).toBe(48);
    expect(model.registeredMonths).toBe(18);
    expect(model.serviceThisYear).toBe("주방봉사");
    expect(model.phone).toBe("010-1234-5678");
    expect(model.status).toBe("완료");
  });
});
