import { MarkdownView, Notice, TFile, normalizePath } from "obsidian";
import type PastoralVisitPlugin from "./main";
import { ensureFolder } from "./member-note";
import { buildVisitContent, buildVisitFileName, findCursorLine } from "./note-builders";
import { NewVisitInput } from "./types";

/** 심방일지 생성 + 열기 + 커서 위치 */
export async function createVisitNote(
  plugin: PastoralVisitPlugin,
  input: NewVisitInput,
): Promise<TFile | null> {
  const app = plugin.app;
  const folder = plugin.settings.visitFolder.trim().replace(/^\/+|\/+$/g, "");
  await ensureFolder(app, folder);

  const fileName = buildVisitFileName(input.날짜, input.memberName);
  if (!fileName) {
    new Notice("날짜 형식이 올바르지 않습니다 (YYYY-MM-DD).");
    return null;
  }
  const path = normalizePath(`${folder}/${fileName}.md`);

  // 같은 날 같은 성도 일지가 있으면 새로 만들지 않고 연다 (덮어쓰기 금지)
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) {
    new Notice("같은 날짜의 심방일지가 이미 있어 엽니다.");
    await app.workspace.getLeaf(true).openFile(existing);
    return existing;
  }

  const memberEntry = plugin.index.members.get(input.memberPath);
  const memberFm = memberEntry?.fm ?? {};
  const content = buildVisitContent(input, memberFm, {
    insertWordClassification: plugin.settings.insertWordClassification,
  });

  let file: TFile;
  try {
    const created = await app.vault.create(path, content);
    if (!(created instanceof TFile)) throw new Error("생성 결과를 확인할 수 없습니다.");
    file = created;
  } catch (e) {
    new Notice(`심방일지 생성 실패: ${e instanceof Error ? e.message : "알 수 없는 오류"}`, 8000);
    return null;
  }

  const leaf = app.workspace.getLeaf(true);
  await leaf.openFile(file);

  // 커서를 대화내용 입력 지점으로 — 렌더 타이밍 이슈는 우아한 저하 (실패해도 무해)
  requestAnimationFrame(() => {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (view?.file?.path === file.path) {
      const line = findCursorLine(content);
      view.editor.setCursor({ line, ch: view.editor.getLine(line)?.length ?? 0 });
      view.editor.focus();
    }
  });

  new Notice(`심방일지 생성됨: ${fileName}`);
  return file;
}
