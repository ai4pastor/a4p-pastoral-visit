/**
 * 노트 콘텐츠 조립 — obsidian 비의존 순수 함수 (vitest 직접 테스트 대상).
 * 파일 IO는 member-note.ts / visit-note.ts 가 담당한다.
 */
import { MEMBER_SECTIONS, VISIT_SECTIONS, VISIT_STATUS, WORD_CLASSIFICATION } from "./constants";
import { MemberFrontmatter, NewMemberInput, NewVisitInput } from "./types";
import { formatYymmdd, nfc, yamlString } from "./utils";

/** 동명이인 파일명 제안: 홍길동 → 홍길동(4구역) */
export function suggestAltName(name: string, 구역: string): string {
  return 구역 ? `${name}(${구역})` : `${name}(2)`;
}

/** 성도 노트 콘텐츠 조립 */
export function buildMemberContent(
  input: NewMemberInput,
  opts: { insertWordClassification: boolean; today: string },
): string {
  const fm: string[] = ["---"];
  fm.push(`created: ${opts.today}`);
  if (opts.insertWordClassification) {
    fm.push(`world:`);
    fm.push(`  - ${yamlString(WORD_CLASSIFICATION.world)}`);
    fm.push(`route:`);
    fm.push(`  - ${yamlString(WORD_CLASSIFICATION.route)}`);
  }
  fm.push(`type: 교인노트`);
  fm.push(`이름: ${yamlString(input.이름)}`);
  fm.push(`성별: ${input.성별 ? yamlString(input.성별) : ""}`);
  fm.push(`생년월일: ${input.생년월일}`);
  fm.push(`연락처: ${input.연락처 ? yamlString(input.연락처) : ""}`);
  fm.push(`직분: ${input.직분 ? yamlString(input.직분) : ""}`);
  fm.push(`구역: ${input.구역 ? yamlString(input.구역) : ""}`);
  fm.push(`등록일: ${input.등록일}`);
  fm.push(`세례여부: ${input.세례여부 ? yamlString(input.세례여부) : ""}`);
  fm.push(`결혼여부: ${input.결혼여부 ? yamlString(input.결혼여부) : ""}`);
  fm.push(`신급: ${input.신급 ? yamlString(input.신급) : ""}`);
  fm.push(`가족수: ${input.가족수 || ""}`);
  fm.push(`가족관계: ${input.가족관계 ? yamlString(input.가족관계) : ""}`);
  fm.push(`심방상태: ${VISIT_STATUS.needed}`);
  fm.push(`created_via: a4p-pastoral-visit`);
  fm.push("---");

  const body: string[] = [];
  body.push(`# ${input.이름}`);
  body.push("");
  body.push(MEMBER_SECTIONS.visitLog);
  body.push("");
  body.push("(심방 기록이 추가되면 여기에 링크됩니다)");
  body.push("");
  body.push(MEMBER_SECTIONS.embeds);
  body.push("");
  body.push("(임베드가 여기에 추가됩니다)");
  body.push("");

  return fm.join("\n") + "\n\n" + body.join("\n");
}

/** 심방일지 파일명 — `{YYMMDD}_심방일지_{이름}` */
export function buildVisitFileName(dateStr: string, memberName: string): string | null {
  const yymmdd = formatYymmdd(dateStr);
  if (!yymmdd || !memberName) return null;
  return `${yymmdd}_심방일지_${nfc(memberName)}`;
}

/**
 * 심방일지 콘텐츠 조립.
 * 기본정보는 성도 노트 프론트매터에서, 심방정보는 모달 입력에서 자동으로 채운다.
 * 나머지 5개 섹션은 볼트 샘플 구조를 따르는 빈 골격.
 */
export function buildVisitContent(
  input: NewVisitInput,
  memberFm: MemberFrontmatter,
  opts: { insertWordClassification: boolean },
): string {
  const fm: string[] = ["---"];
  fm.push(`created: ${input.날짜}`);
  fm.push(`type: 심방일지`);
  fm.push(`성도: ${yamlString(`[[${input.memberName}]]`)}`);
  fm.push(`장소: ${input.장소 ? yamlString(input.장소) : ""}`);
  fm.push(`날짜: ${input.날짜}`);
  fm.push(`동행: ${input.동행 ? yamlString(input.동행) : ""}`);
  fm.push(`심방유형: ${yamlString(input.심방유형)}`);
  fm.push(`tags:`);
  fm.push(`  - 심방`);
  fm.push(`  - 심방일지`);
  if (opts.insertWordClassification) {
    fm.push(`world:`);
    fm.push(`  - ${yamlString(WORD_CLASSIFICATION.world)}`);
    fm.push(`route:`);
    fm.push(`  - ${yamlString(WORD_CLASSIFICATION.route)}`);
  }
  fm.push(`created_via: a4p-pastoral-visit`);
  fm.push("---");

  const 가족관계 = typeof memberFm.가족관계 === "string" ? memberFm.가족관계 : "";
  const 가족수 = memberFm.가족수 != null ? String(memberFm.가족수) : "";
  const 가족정보 = [가족관계, 가족수 ? `가족 ${가족수}인` : ""].filter(Boolean).join(", ");

  const body: string[] = [];
  body.push(`# 심방기록 — ${input.날짜} ${input.memberName}`);
  body.push("");
  body.push(VISIT_SECTIONS.basicInfo);
  body.push(`- **성명:** [[${input.memberName}]]`);
  if (memberFm.연락처) body.push(`- **연락처:** ${memberFm.연락처}`);
  if (memberFm.구역) body.push(`- **소속구역:** ${memberFm.구역}`);
  if (memberFm.직분) body.push(`- **직분:** ${memberFm.직분}`);
  if (가족정보) body.push(`- **가족관계:** ${가족정보}`);
  body.push("");
  body.push(VISIT_SECTIONS.visitInfo);
  body.push(`- **심방일시:** ${input.날짜}`);
  if (input.장소) body.push(`- **심방장소:** ${input.장소}`);
  if (input.동행) body.push(`- **동행자:** ${input.동행}`);
  body.push(`- **심방유형:** ${input.심방유형}`);
  body.push("");
  body.push(VISIT_SECTIONS.conversation);
  body.push(`- **주요 대화 주제:**`);
  body.push(`  - `);
  body.push("");
  body.push(VISIT_SECTIONS.prayer);
  body.push(`- **본인 기도제목:**`);
  body.push(`  - `);
  body.push(`- **가족 기도제목:**`);
  body.push(`  - `);
  body.push("");
  body.push(VISIT_SECTIONS.church);
  body.push(`- **출석상황:** `);
  body.push(`- **봉사활동:** `);
  body.push(`- **신앙상태:** `);
  body.push(`- **교회생활 관심사:** `);
  body.push("");
  body.push(VISIT_SECTIONS.observation);
  body.push(`### 영적상태`);
  body.push(`- **신앙성장:** `);
  body.push(`- **관심사항:** `);
  body.push(`- **격려사항:** `);
  body.push("");
  body.push(`### 생활상황`);
  body.push(`- **건강상태:** `);
  body.push(`- **가정상황:** `);
  body.push(`- **직장/학업:** `);
  body.push("");
  body.push(VISIT_SECTIONS.followUp);
  body.push(`- [ ] `);
  body.push("");

  return fm.join("\n") + "\n\n" + body.join("\n");
}

/** `## 📝 대화내용` 바로 아래 첫 입력 지점(0-기반 라인) */
export function findCursorLine(content: string): number {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === VISIT_SECTIONS.conversation.replace(/^##\s*/, "## ").trim()) {
      for (let j = i + 1; j < lines.length && j <= i + 3; j++) {
        if (lines[j].trim() === "-") return j;
        if (lines[j].startsWith("  - ")) return j;
      }
      return i + 1;
    }
  }
  return 0;
}
