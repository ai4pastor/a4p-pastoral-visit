/** 성도 노트 프론트매터 (교인노트) — 필드는 노트마다 불균일할 수 있음 */
export interface MemberFrontmatter {
  type?: string;
  이름?: string;
  성별?: string;
  생년월일?: string;
  연락처?: string;
  직분?: string;
  구역?: string;
  등록일?: string;
  세례여부?: string;
  결혼여부?: string;
  신급?: string;
  가족수?: number;
  가족관계?: string;
  심방상태?: string;
  [key: string]: unknown;
}

/** 심방일지 프론트매터 */
export interface VisitFrontmatter {
  type?: string;
  성도?: string;
  날짜?: string;
  장소?: string;
  동행?: string;
  심방유형?: string;
  반영?: boolean | string;
  [key: string]: unknown;
}

/** 인덱스의 성도 항목 */
export interface MemberEntry {
  /** vault 경로 */
  path: string;
  /** 파일명 기반 이름 (NFC 정규화) */
  name: string;
  fm: MemberFrontmatter;
}

/** 인덱스의 심방일지 항목 */
export interface VisitEntry {
  path: string;
  /** 파일명 (확장자 제외, NFC 정규화) */
  basename: string;
  fm: VisitFrontmatter;
  /** 프론트매터 `성도` 링크가 해석된 성도 노트 경로 (미해석 시 null) */
  memberPath: string | null;
}

/** 후속조치 항목 */
export interface ActionItem {
  visitPath: string;
  visitBasename: string;
  memberName: string;
  visitDate: string;
  /** 0-기반 라인 번호 */
  line: number;
  /** 라인 원문 (토글 시 일치 검증용) */
  raw: string;
  text: string;
  checked: boolean;
  daysElapsed: number;
}

/** 새 성도 등록 모달 입력값 */
export interface NewMemberInput {
  이름: string;
  성별: string;
  생년월일: string;
  연락처: string;
  구역: string;
  직분: string;
  등록일: string;
  세례여부: string;
  결혼여부: string;
  신급: string;
  가족수: string;
  가족관계: string;
}

/** 심방일지 작성 모달 입력값 */
export interface NewVisitInput {
  memberPath: string;
  memberName: string;
  날짜: string;
  장소: string;
  동행: string;
  심방유형: string;
}
