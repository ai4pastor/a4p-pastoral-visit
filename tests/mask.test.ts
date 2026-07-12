import { describe, expect, it } from "vitest";
import { maskBirth, maskPhone, renderSensitive } from "../src/mask";

describe("maskPhone", () => {
  it("표준 휴대폰 번호", () => {
    expect(maskPhone("010-1234-5678")).toBe("010-****-5678");
  });
  it("하이픈 없는 번호", () => {
    expect(maskPhone("01012345678")).toBe("010-****-5678");
  });
  it("지역번호 3자리 국번", () => {
    expect(maskPhone("02-123-4567")).toBe("02-***-4567");
  });
  it("번호 아닌 문자열은 그대로", () => {
    expect(maskPhone("연락처 없음")).toBe("연락처 없음");
  });
});

describe("maskBirth", () => {
  it("생년월일", () => {
    expect(maskBirth("1977-12-06")).toBe("19**-**-**");
  });
  it("날짜 아닌 문자열은 그대로", () => {
    expect(maskBirth("미상")).toBe("미상");
  });
});

describe("renderSensitive", () => {
  it("마스킹 켜짐 — 전화번호", () => {
    expect(renderSensitive("010-1234-5678", "phone", true)).toBe("010-****-5678");
  });
  it("마스킹 켜짐 — 생년월일", () => {
    expect(renderSensitive("1977-12-06", "birth", true)).toBe("19**-**-**");
  });
  it("마스킹 꺼짐 — 전화번호 원문", () => {
    expect(renderSensitive("010-1234-5678", "phone", false)).toBe("010-1234-5678");
  });
  it("마스킹 꺼짐 — 생년월일 원문", () => {
    expect(renderSensitive("1977-12-06", "birth", false)).toBe("1977-12-06");
  });
});
