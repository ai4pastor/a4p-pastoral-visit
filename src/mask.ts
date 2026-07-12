/**
 * 민감정보 화면 마스킹 — 순수 함수 (obsidian 비의존, vitest 대상).
 * 표시 레이어 전용: 파일·클립보드의 원문은 절대 변경하지 않는다.
 */

/** 전화번호 마스킹: 010-1234-5678 → 010-****-5678 */
export function maskPhone(phone: string): string {
  return phone.replace(/(\d{2,3})[-. ]?(\d{3,4})[-. ]?(\d{4})/g, (_m, a, b, c) => {
    return `${a}-${"*".repeat(String(b).length)}-${c}`;
  });
}

/** 생년월일 마스킹: 1977-12-06 → 19**-**-** */
export function maskBirth(birth: string): string {
  return birth.replace(/(\d{2})(\d{2})-(\d{2})-(\d{2})/g, "$1**-**-**");
}

/**
 * 민감정보 표시 단일 관문 — 뷰·모달 공용 (직접 setText 금지 규율).
 * maskOn이 꺼져 있을 때만 원문을 반환한다.
 */
export function renderSensitive(value: string, kind: "phone" | "birth", maskOn: boolean): string {
  if (!maskOn) return value;
  return kind === "birth" ? maskBirth(value) : maskPhone(value);
}
