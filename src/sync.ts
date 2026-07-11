import { MarkdownView, Notice, TFile } from "obsidian";
import type PastoralVisitPlugin from "./main";
import { NOTE_TYPE, VISIT_STATUS } from "./constants";
import { extractSummary, planSync } from "./sync-core";
import { SyncModal } from "./modals/sync-modal";

export interface SyncContext {
  visitFile: TFile;
  memberFile: TFile;
  visitBasename: string;
  memberName: string;
  날짜: string;
  심방유형: string;
  /** 자동 제안 요약 (모달에서 편집 가능) */
  suggestedSummary: string;
  /** 현재 심방상태 */
  currentStatus: string;
}

/** 반영 진입점 — 검증 후 미리보기 모달 오픈 */
export async function openSyncFlow(plugin: PastoralVisitPlugin, visitFile: TFile): Promise<void> {
  const app = plugin.app;
  const fm = app.metadataCache.getFileCache(visitFile)?.frontmatter;

  if (fm?.type !== NOTE_TYPE.visit) {
    new Notice("심방일지(type: 심방일지)가 아닙니다.");
    return;
  }
  // 멱등 1차 방어
  if (fm.반영) {
    new Notice("이미 반영된 일지입니다.");
    return;
  }

  const entry = plugin.index.visits.get(visitFile.path);
  const memberPath = entry?.memberPath;
  if (!memberPath) {
    new Notice("일지의 `성도` 링크로 성도 노트를 찾을 수 없습니다. 프론트매터를 확인하세요.");
    return;
  }
  const memberFile = app.vault.getAbstractFileByPath(memberPath);
  if (!(memberFile instanceof TFile)) {
    new Notice("성도 노트 파일을 찾을 수 없습니다.");
    return;
  }

  const 날짜 = typeof fm.날짜 === "string" ? fm.날짜 : "";
  const 심방유형 = typeof fm.심방유형 === "string" ? fm.심방유형 : "심방";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(날짜)) {
    new Notice("일지의 `날짜`가 YYYY-MM-DD 형식이 아닙니다.");
    return;
  }

  // 미저장 편집 반영 (활성 에디터가 이 일지라면 먼저 저장)
  await saveIfActive(plugin, visitFile);

  const visitContent = await app.vault.cachedRead(visitFile);
  const memberFm = app.metadataCache.getFileCache(memberFile)?.frontmatter;

  const ctx: SyncContext = {
    visitFile,
    memberFile,
    visitBasename: visitFile.basename,
    memberName: memberFile.basename,
    날짜,
    심방유형,
    suggestedSummary: extractSummary(visitContent, 심방유형, 날짜),
    currentStatus: typeof memberFm?.심방상태 === "string" ? memberFm.심방상태 : "",
  };

  new SyncModal(plugin, ctx).open();
}

/**
 * 반영 실행 — 모달 승인 후 호출.
 * 순서: 성도 노트 append → 일지 `반영: true` → (선택) 성도 `심방상태: 완료`.
 * 중간 실패 시에도 멱등 2차 방어(링크 존재 검사)가 재실행을 안전하게 만든다.
 */
export async function executeSync(
  plugin: PastoralVisitPlugin,
  ctx: SyncContext,
  summary: string,
  updateStatus: boolean,
): Promise<boolean> {
  const app = plugin.app;

  // 성도 노트도 미저장 편집이 있으면 먼저 저장
  await saveIfActive(plugin, ctx.memberFile);

  let nothingToDo = false;
  try {
    await app.vault.process(ctx.memberFile, (content) => {
      const plan = planSync(content, ctx.visitBasename, ctx.날짜, ctx.심방유형, summary);
      nothingToDo = plan.nothingToDo;
      return plan.newContent;
    });
  } catch (e) {
    new Notice(`반영 실패: ${e instanceof Error ? e.message : "알 수 없는 오류"}`, 8000);
    return false;
  }

  try {
    await app.fileManager.processFrontMatter(ctx.visitFile, (fm) => {
      fm["반영"] = true;
    });
    if (updateStatus) {
      await app.fileManager.processFrontMatter(ctx.memberFile, (fm) => {
        fm["심방상태"] = VISIT_STATUS.done;
      });
    }
  } catch (e) {
    new Notice(
      `프론트매터 갱신 실패: ${e instanceof Error ? e.message : "알 수 없는 오류"} — 본문 반영은 완료됐습니다.`,
      8000,
    );
    return false;
  }

  new Notice(
    nothingToDo
      ? "이미 반영돼 있어 본문 변경 없이 상태만 갱신했습니다."
      : `반영 완료: ${ctx.memberName} 노트에 심방 기록이 추가됐습니다.`,
  );
  return true;
}

/** 해당 파일이 활성 에디터에 열려 있으면 저장 (디스크 최신화) */
async function saveIfActive(plugin: PastoralVisitPlugin, file: TFile): Promise<void> {
  for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) {
    const view = leaf.view;
    if (view instanceof MarkdownView && view.file?.path === file.path) {
      await view.save();
      return;
    }
  }
}
