import { describe, expect, it } from "vitest";
import { maskBirth, maskPhone } from "../src/mask";

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
