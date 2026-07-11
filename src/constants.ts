/**
 * 섹션 헤딩·앵커의 단일 출처.
 * 볼트 실물(460. 성도)과 문자 단위로 일치해야 한다 (이모지 포함).
 * 성도 노트의 섹션 임베드가 이 텍스트를 앵커로 쓰므로 변경 금지 (하위 호환 계약).
 */

/** 심방일지 본문 7개 고정 섹션 */
export const VISIT_SECTIONS = {
  basicInfo: "## 📋 기본정보",
  visitInfo: "## 📍 심방정보",
  conversation: "## 📝 대화내용",
  prayer: "## 🙏 기도제목",
  church: "## ⛪ 교회 관련",
  observation: "## 🔍 관찰 및 평가",
  followUp: "## 💡 후속조치",
} as const;

/** 성도 노트의 플러그인 관리 섹션 2종 */
export const MEMBER_SECTIONS = {
  visitLog: "## 📝 심방 기록",
  embeds: "## 📌 중요 심방 내용 (임베드)",
} as const;

/** 성도 노트 임베드 앵커 — 심방일지 헤딩 텍스트(## 제외)와 정확히 일치해야 함 */
export const EMBED_ANCHORS = ["📝 대화내용", "🙏 기도제목", "💡 후속조치"] as const;

/** 분석·생성에 쓰는 헤딩 구성 — 설정에서 커스터마이즈 가능 (기본값은 볼트 샘플 표준) */
export interface HeadingConfig {
  basicInfo: string;
  visitInfo: string;
  conversation: string;
  prayer: string;
  church: string;
  observation: string;
  followUp: string;
  /** 성도 노트의 심방 기록 섹션 */
  memberVisitLog: string;
  /** 성도 노트의 임베드 섹션 */
  memberEmbeds: string;
}

export const DEFAULT_HEADINGS: HeadingConfig = {
  ...VISIT_SECTIONS,
  memberVisitLog: MEMBER_SECTIONS.visitLog,
  memberEmbeds: MEMBER_SECTIONS.embeds,
};

/** 임베드 앵커 3종 — 대화내용·기도제목·후속조치 헤딩에서 `## ` 접두를 뗀 텍스트 */
export function embedAnchorsOf(h: HeadingConfig): string[] {
  return [h.conversation, h.prayer, h.followUp].map((x) => x.replace(/^##\s*/, ""));
}

/** 헤딩 라벨 (설정 UI·검증 메시지용) */
export const HEADING_LABELS: Record<keyof HeadingConfig, string> = {
  basicInfo: "기본정보",
  visitInfo: "심방정보",
  conversation: "대화내용 (요약 추출·임베드)",
  prayer: "기도제목 (임베드)",
  church: "교회 관련",
  observation: "관찰 및 평가",
  followUp: "후속조치 (체크박스 수집·임베드)",
  memberVisitLog: "성도 노트 — 심방 기록",
  memberEmbeds: "성도 노트 — 임베드",
};

/** 노트 유형 식별자 (frontmatter type) */
export const NOTE_TYPE = {
  member: "교인노트",
  visit: "심방일지",
} as const;

/** 심방상태 값 */
export const VISIT_STATUS = {
  needed: "필요",
  done: "완료",
  notNeeded: "불필요",
} as const;

/** world/route 분류 (볼트 WORD 분류 체계 — 기존 정의 값만 사용) */
export const WORD_CLASSIFICATION = {
  world: "[[📩 208 상담 & 목양]]",
  route: "[[📝기록]]",
} as const;

/** 요약 추출 시 제외할 메타 라벨 */
export const SUMMARY_EXCLUDE_LABELS = ["주요 대화 주제", "본인 기도제목", "가족 기도제목"];

export const PLUGIN_ID = "a4p-pastoral-visit";
