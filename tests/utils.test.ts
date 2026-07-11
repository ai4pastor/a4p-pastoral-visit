import { describe, expect, it } from "vitest";
import {
  birthdayDday,
  daysSince,
  formatRelativeKo,
  formatYymmdd,
  monthsBetween,
  parseDate,
  parseWikilinkTarget,
  yamlString,
} from "../src/utils";

describe("parseWikilinkTarget", () => {
  it("단순 링크", () => {
    expect(parseWikilinkTarget('[[홍길동]]')).toBe("홍길동");
  });
  it("따옴표 감싼 프론트매터 값도 문자열이면 처리", () => {
    expect(parseWikilinkTarget("[[홍길동]]")).toBe("홍길동");
  });
  it("경로 포함 + 별칭", () => {
    expect(parseWikilinkTarget("[[400. Education/홍길동|홍 집사]]")).toBe(
      "400. Education/홍길동",
    );
  });
  it("헤딩 앵커 포함", () => {
    expect(parseWikilinkTarget("[[홍길동#기본정보]]")).toBe("홍길동");
  });
  it("NFD 입력 → NFC 정규화", () => {
    const nfd = "[[홍길동]]".normalize("NFD");
    expect(parseWikilinkTarget(nfd)).toBe("홍길동".normalize("NFC"));
  });
  it("비링크 문자열", () => {
    expect(parseWikilinkTarget("홍길동")).toBeNull();
    expect(parseWikilinkTarget(undefined)).toBeNull();
    expect(parseWikilinkTarget(42)).toBeNull();
  });
});

describe("formatYymmdd", () => {
  it("정상 변환", () => {
    expect(formatYymmdd("2026-03-08")).toBe("260308");
  });
  it("잘못된 형식", () => {
    expect(formatYymmdd("26-3-8")).toBeNull();
    expect(formatYymmdd("")).toBeNull();
  });
});

describe("parseDate", () => {
  it("유효 날짜", () => {
    const d = parseDate("2026-03-08");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(2);
    expect(d?.getDate()).toBe(8);
  });
  it("시각 붙은 문자열도 날짜부만", () => {
    expect(parseDate("2026-03-08T10:00")?.getDate()).toBe(8);
  });
  it("무효 입력", () => {
    expect(parseDate("2026-13-01")).toBeNull();
    expect(parseDate(null)).toBeNull();
  });
});

describe("monthsBetween / daysSince", () => {
  const today = new Date(2026, 6, 11); // 2026-07-11
  it("개월 계산 (일자 미달 시 내림)", () => {
    expect(monthsBetween("2026-01-11", today)).toBe(6);
    expect(monthsBetween("2026-01-12", today)).toBe(5);
  });
  it("일수 계산", () => {
    expect(daysSince("2026-07-01", today)).toBe(10);
    expect(daysSince("2026-07-11", today)).toBe(0);
  });
  it("무효 입력", () => {
    expect(monthsBetween("없음", today)).toBeNull();
  });
});

describe("birthdayDday", () => {
  const today = new Date(2026, 6, 11); // 2026-07-11
  it("올해 생일이 남아 있으면 그 날까지", () => {
    expect(birthdayDday("1977-07-20", today)).toBe(9);
  });
  it("오늘이 생일이면 0", () => {
    expect(birthdayDday("1977-07-11", today)).toBe(0);
  });
  it("지났으면 내년으로", () => {
    expect(birthdayDday("1977-07-10", today)).toBe(364);
  });
  it("연말 경계", () => {
    const dec31 = new Date(2026, 11, 31);
    expect(birthdayDday("1980-01-01", dec31)).toBe(1);
  });
});

describe("formatRelativeKo", () => {
  const today = new Date(2026, 6, 11);
  it("일/개월/년 단위", () => {
    expect(formatRelativeKo("2026-07-11", today)).toBe("오늘");
    expect(formatRelativeKo("2026-07-01", today)).toBe("10일 전");
    expect(formatRelativeKo("2026-03-08", today)).toBe("4개월 전");
    expect(formatRelativeKo("2024-03-08", today)).toBe("2년 전");
  });
});

describe("yamlString", () => {
  it("특수문자 없는 값은 그대로", () => {
    expect(yamlString("홍길동")).toBe("홍길동");
  });
  it("콜론·따옴표 이스케이프", () => {
    expect(yamlString("장소: 자택")).toBe('"장소: 자택"');
    expect(yamlString('그는 "예" 라고')).toBe('"그는 \\"예\\" 라고"');
  });
  it("wikilink 값은 따옴표 감쌈", () => {
    expect(yamlString("[[홍길동]]")).toBe('"[[홍길동]]"');
  });
});
