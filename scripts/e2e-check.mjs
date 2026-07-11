/**
 * dev 볼트의 실제 성도 노트에 대해 planSync를 돌려보는 기계 검증 (파일 수정 없음 — 읽기 전용).
 * 검증: ① 기존 줄 무수정 ② 멱등성 ③ 임베드 앵커 형식
 * 실행: npm run build 후  node scripts/e2e-check.mjs
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

// sync-core를 esbuild로 단독 번들해 임포트
execSync(
  "npx esbuild src/sync-core.ts --bundle --format=esm --outfile=scripts/.sync-core.bundle.mjs",
  { stdio: "inherit" },
);
const { planSync, extractSummary } = await import("./.sync-core.bundle.mjs");

const VAULT = process.env.HOME + "/obsidian_dev_vault/400. Education & Ministry/460. 성도";
const memberContent = readFileSync(`${VAULT}/홍길동.md`, "utf8");
const visitContent = readFileSync(`${VAULT}/심방일지/260308_심방일지_홍길동.md`, "utf8");

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) failures++;
};

// ① 요약 추출 — 실물 일지에서
const summary = extractSummary(visitContent, "정기심방", "2026-03-08");
console.log(`요약 제안: ${summary}`);
check("요약에 심방유형·날짜 포함", summary.startsWith("정기심방 (2026-03-08)"));

// ② 새 가상 일지 반영 계획
const plan = planSync(memberContent, "260711_심방일지_홍길동", "2026-07-11", "정기심방", "정기심방 (2026-07-11), 테스트");
check("새 링크 추가됨", plan.newContent.includes("- [[260711_심방일지_홍길동]] —"));
check("임베드 3종 추가됨", ["📝 대화내용", "🙏 기도제목", "💡 후속조치"].every(
  (a) => plan.newContent.includes(`![[260711_심방일지_홍길동#${a}]]`),
));
check("경고 없음 (표준 노트)", plan.warnings.length === 0);

// ③ 기존 줄 전부 보존
const beforeLines = memberContent.split("\n");
const afterLines = new Set(plan.newContent.split("\n"));
const lost = beforeLines.filter((l) => !afterLines.has(l));
check(`기존 줄 무수정 (유실 ${lost.length}줄)`, lost.length === 0);

// ④ 멱등성 — 2회 반영 시 무변경
const second = planSync(plan.newContent, "260711_심방일지_홍길동", "2026-07-11", "정기심방", "다른 요약");
check("2회 반영 차단 (멱등)", second.newContent === plan.newContent && second.nothingToDo);

// ⑤ 이미 반영된 실물 일지(260308)도 차단
const already = planSync(memberContent, "260308_심방일지_홍길동", "2026-03-08", "정기심방", "요약");
check("기존 반영분 재반영 차단", already.nothingToDo);

console.log(failures === 0 ? "\n모든 검증 통과" : `\n${failures}건 실패`);
process.exit(failures === 0 ? 0 : 1);
