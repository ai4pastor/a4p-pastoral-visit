import { describe, expect, it } from "vitest";
import {
  buildEmbedBlock,
  buildLogLine,
  extractSummary,
  findSectionRange,
  planSync,
} from "../src/sync-core";

/** 볼트 실물 형식을 본뜬 성도 노트 (이미 일지 1건 반영된 상태) */
const MEMBER_WITH_HISTORY = `---
type: 교인노트
이름: 홍길동
심방상태: 필요
---

# 홍길동

## 📝 심방 기록
- [[260125_심방일지_홍길동]] — 정기심방 (2026-01-25), 퇴직 후 생활 적응, 손자녀 양육 이야기

## 📌 중요 심방 내용 (임베드)
### 2026-01-25 정기심방
![[260125_심방일지_홍길동#📝 대화내용]]
![[260125_심방일지_홍길동#🙏 기도제목]]
![[260125_심방일지_홍길동#💡 후속조치]]
`;

/** 플러그인이 생성한 빈 템플릿 상태 (placeholder 포함) */
const MEMBER_EMPTY = `---
type: 교인노트
이름: 김새신
심방상태: 필요
---

# 김새신

## 📝 심방 기록

(심방 기록이 추가되면 여기에 링크됩니다)

## 📌 중요 심방 내용 (임베드)

(임베드가 여기에 추가됩니다)
`;

/** 두 섹션이 아예 없는 비표준 노트 */
const MEMBER_NO_SECTIONS = `---
type: 교인노트
이름: 박자유
---

# 박자유

자유 메모.
`;

/** 볼트 실물 형식의 심방일지 대화내용 */
const VISIT_CONTENT = `---
type: 심방일지
성도: "[[홍길동]]"
날짜: 2026-03-08
심방유형: 정기심방
---

# 심방기록 — 2026-03-08 홍길동

## 📝 대화내용
- **주요 대화 주제:**
  - **시니어 소그룹 첫 모임 참여 후기:** 소그룹 참여가 즐거우셨다고 했다.
  - **박순옥 권사 무릎 수술:** 다음 달 수술 예정이다.
  - **교회 역사 정리 프로젝트:** 관심을 보이셨다.

## 🙏 기도제목
- **본인 기도제목:**
  - 수술이 잘 되도록

## 💡 후속조치
- [ ] 수술 전 심방 계획
`;

describe("findSectionRange", () => {
  const lines = MEMBER_WITH_HISTORY.split("\n");
  it("헤딩 완전 일치로 탐지", () => {
    const r = findSectionRange(lines, "## 📝 심방 기록");
    expect(r).not.toBeNull();
    expect(lines[r!.headingLine]).toBe("## 📝 심방 기록");
  });
  it("섹션 끝은 다음 ## 헤딩 (### 은 통과)", () => {
    const r = findSectionRange(lines, "## 📌 중요 심방 내용 (임베드)");
    expect(r!.endLine).toBe(lines.length); // ### 하위 헤딩을 지나 EOF까지
  });
  it("NFD 헤딩도 NFC 정규화로 매칭", () => {
    const nfdLines = MEMBER_WITH_HISTORY.normalize("NFD").split("\n");
    expect(findSectionRange(nfdLines, "## 📝 심방 기록")).not.toBeNull();
  });
  it("부재 시 null", () => {
    expect(findSectionRange(MEMBER_NO_SECTIONS.split("\n"), "## 📝 심방 기록")).toBeNull();
  });
});

describe("extractSummary", () => {
  it("볼드 주제 라벨 상위 2개 (메타 라벨 제외)", () => {
    expect(extractSummary(VISIT_CONTENT, "정기심방", "2026-03-08")).toBe(
      "정기심방 (2026-03-08), 시니어 소그룹 첫 모임 참여 후기, 박순옥 권사 무릎 수술",
    );
  });
  it("라벨 없으면 fallback", () => {
    const bare = "## 📝 대화내용\n자유 서술만 있음\n";
    expect(extractSummary(bare, "위로심방", "2026-04-01")).toBe("위로심방 (2026-04-01)");
  });
});

describe("planSync — 이력 있는 노트에 append", () => {
  const summary = "정기심방 (2026-03-08), 시니어 소그룹 후기";
  const plan = planSync(MEMBER_WITH_HISTORY, "260308_심방일지_홍길동", "2026-03-08", "정기심방", summary);

  it("심방 기록 줄이 기존 항목 뒤에 추가", () => {
    const lines = plan.newContent.split("\n");
    const idx = lines.indexOf(buildLogLine("260308_심방일지_홍길동", summary));
    const prevIdx = lines.findIndex((l) => l.includes("260125_심방일지_홍길동]] —"));
    expect(idx).toBeGreaterThan(prevIdx);
  });
  it("임베드 블록 추가 (### 헤딩 + 임베드 3줄)", () => {
    expect(plan.newContent).toContain("### 2026-03-08 정기심방");
    for (const line of buildEmbedBlock("260308_심방일지_홍길동", "2026-03-08", "정기심방")) {
      expect(plan.newContent).toContain(line);
    }
  });
  it("기존 줄은 전부 보존 (비파괴)", () => {
    for (const line of MEMBER_WITH_HISTORY.split("\n")) {
      expect(plan.newContent.split("\n")).toContain(line);
    }
  });
  it("경고 없음", () => {
    expect(plan.warnings).toEqual([]);
    expect(plan.nothingToDo).toBe(false);
  });
});

describe("planSync — 멱등성", () => {
  it("같은 일지 2회 반영 시 두 번째는 무변경", () => {
    const first = planSync(MEMBER_WITH_HISTORY, "260308_심방일지_홍길동", "2026-03-08", "정기심방", "요약");
    const second = planSync(first.newContent, "260308_심방일지_홍길동", "2026-03-08", "정기심방", "요약");
    expect(second.newContent).toBe(first.newContent);
    expect(second.nothingToDo).toBe(true);
  });
  it("이미 반영된 일지(260125)는 건너뜀", () => {
    const plan = planSync(MEMBER_WITH_HISTORY, "260125_심방일지_홍길동", "2026-01-25", "정기심방", "요약");
    expect(plan.newContent).toBe(MEMBER_WITH_HISTORY);
    expect(plan.nothingToDo).toBe(true);
  });
});

describe("planSync — 날짜순 삽입", () => {
  it("기존 항목보다 이른 날짜는 그 앞에 삽입", () => {
    const plan = planSync(MEMBER_WITH_HISTORY, "251201_심방일지_홍길동", "2025-12-01", "특별심방", "요약");
    const lines = plan.newContent.split("\n");
    const newIdx = lines.findIndex((l) => l.includes("251201_심방일지_홍길동]] —"));
    const oldIdx = lines.findIndex((l) => l.includes("260125_심방일지_홍길동]] —"));
    expect(newIdx).toBeLessThan(oldIdx);
    expect(plan.warnings.some((w) => w.includes("날짜순"))).toBe(true);
  });
});

describe("planSync — 빈 템플릿 (placeholder 보존)", () => {
  const plan = planSync(MEMBER_EMPTY, "260711_심방일지_김새신", "2026-07-11", "정기심방", "요약");
  it("placeholder 줄을 삭제하지 않음", () => {
    expect(plan.newContent).toContain("(심방 기록이 추가되면 여기에 링크됩니다)");
    expect(plan.newContent).toContain("(임베드가 여기에 추가됩니다)");
  });
  it("링크·임베드가 섹션 안에 추가됨", () => {
    expect(plan.newContent).toContain("- [[260711_심방일지_김새신]] — 요약");
    expect(plan.newContent).toContain("![[260711_심방일지_김새신#📝 대화내용]]");
  });
});

describe("planSync — insertions (미리보기 diff용)", () => {
  it("정상 반영 시 두 섹션 삽입이 순서대로 담김", () => {
    const plan = planSync(MEMBER_WITH_HISTORY, "260308_심방일지_홍길동", "2026-03-08", "정기심방", "요약");
    expect(plan.insertions.length).toBe(2);
    expect(plan.insertions[0].heading).toBe("## 📝 심방 기록");
    expect(plan.insertions[0].lines).toEqual([buildLogLine("260308_심방일지_홍길동", "요약")]);
    expect(plan.insertions[0].sectionCreated).toBe(false);
    expect(plan.insertions[1].heading).toBe("## 📌 중요 심방 내용 (임베드)");
    expect(plan.insertions[1].lines[0]).toBe("### 2026-03-08 정기심방");
  });
  it("이미 반영된 일지는 insertions 비어 있음", () => {
    const plan = planSync(MEMBER_WITH_HISTORY, "260125_심방일지_홍길동", "2026-01-25", "정기심방", "요약");
    expect(plan.insertions).toEqual([]);
  });
  it("섹션 신설 시 sectionCreated 표시", () => {
    const plan = planSync(MEMBER_NO_SECTIONS, "260711_심방일지_박자유", "2026-07-11", "정기심방", "요약");
    expect(plan.insertions.every((i) => i.sectionCreated)).toBe(true);
  });
});

describe("planSync — 섹션 없는 비표준 노트", () => {
  const plan = planSync(MEMBER_NO_SECTIONS, "260711_심방일지_박자유", "2026-07-11", "정기심방", "요약");
  it("문서 말미에 섹션 신설 + 경고", () => {
    expect(plan.newContent).toContain("## 📝 심방 기록");
    expect(plan.newContent).toContain("## 📌 중요 심방 내용 (임베드)");
    expect(plan.warnings.filter((w) => w.includes("새로 만듭니다")).length).toBe(2);
  });
  it("기존 본문 보존", () => {
    expect(plan.newContent).toContain("자유 메모.");
  });
});
