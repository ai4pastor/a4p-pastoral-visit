import { App, Notice, TFile, TFolder, normalizePath } from "obsidian";
import type PastoralVisitPlugin from "./main";
import { buildMemberContent } from "./note-builders";
import { NewMemberInput } from "./types";
import { nfc } from "./utils";

export { suggestAltName } from "./note-builders";

/** 재귀 폴더 보장 (a4p-readwise-search 패턴) */
export async function ensureFolder(app: App, folderPath: string): Promise<void> {
  const segments = folderPath.split("/").filter(Boolean);
  let cur = "";
  for (const seg of segments) {
    cur = cur ? `${cur}/${seg}` : seg;
    const existing = app.vault.getAbstractFileByPath(cur);
    if (!existing) {
      await app.vault.createFolder(cur);
    } else if (!(existing instanceof TFolder)) {
      throw new Error(`경로가 폴더가 아닙니다: ${cur}`);
    }
  }
}

/** 성도 노트 생성 + 열기 */
export async function createMemberNote(
  plugin: PastoralVisitPlugin,
  input: NewMemberInput,
): Promise<TFile | null> {
  const app = plugin.app;
  const folder = plugin.settings.memberFolder.trim().replace(/^\/+|\/+$/g, "");
  await ensureFolder(app, folder);

  const path = normalizePath(`${folder}/${nfc(input.이름)}.md`);
  if (app.vault.getAbstractFileByPath(path)) {
    // 모달에서 선제 감지하므로 여기 도달은 방어적 처리
    new Notice("같은 이름의 노트가 이미 있습니다. 이름을 바꿔 주세요.");
    return null;
  }

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const content = buildMemberContent(input, {
    insertWordClassification: plugin.settings.insertWordClassification,
    today: todayStr,
  });

  let file: TFile;
  try {
    const created = await app.vault.create(path, content);
    if (!(created instanceof TFile)) throw new Error("생성 결과를 확인할 수 없습니다.");
    file = created;
  } catch (e) {
    new Notice(`성도 노트 생성 실패: ${e instanceof Error ? e.message : "알 수 없는 오류"}`, 8000);
    return null;
  }

  // 기록 최소화 온보딩 (최초 1회)
  if (!plugin.settings.onboardingShown) {
    plugin.settings.onboardingShown = true;
    await plugin.persist();
    new Notice(
      "성도 노트에는 심방에 필요한 최소 정보만 기록하세요. 주민번호·금융정보는 기록하지 않습니다.",
      10000,
    );
  }

  const leaf = app.workspace.getLeaf(true);
  await leaf.openFile(file);
  new Notice(`성도 노트 생성됨: ${input.이름}`);
  return file;
}
