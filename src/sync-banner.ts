import { MarkdownView, TFile, WorkspaceLeaf } from "obsidian";
import type PastoralVisitPlugin from "./main";
import { NOTE_TYPE } from "./constants";
import { openSyncFlow } from "./sync";

/**
 * 미반영 심방일지의 뷰 헤더에 "성도 노트에 반영" 액션 아이콘을 표시.
 * MarkdownView.addAction() 공식 API 사용. Map 단일 원장으로 중복 등록/잔존 방지 (reconcile 패턴).
 */
export class SyncBanner {
  private plugin: PastoralVisitPlugin;
  private buttons = new Map<WorkspaceLeaf, HTMLElement>();

  constructor(plugin: PastoralVisitPlugin) {
    this.plugin = plugin;
  }

  start(): void {
    const app = this.plugin.app;
    this.plugin.registerEvent(app.workspace.on("file-open", () => this.reconcile()));
    this.plugin.registerEvent(app.workspace.on("active-leaf-change", () => this.reconcile()));
    this.plugin.registerEvent(
      app.metadataCache.on("changed", (file) => {
        // 반영 플래그가 바뀌면 버튼 상태 갱신
        if (file instanceof TFile) this.reconcile();
      }),
    );
    app.workspace.onLayoutReady(() => this.reconcile());
  }

  stop(): void {
    for (const el of this.buttons.values()) el.remove();
    this.buttons.clear();
  }

  private reconcile(): void {
    const app = this.plugin.app;
    const seen = new Set<WorkspaceLeaf>();

    for (const leaf of app.workspace.getLeavesOfType("markdown")) {
      seen.add(leaf);
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) continue;

      const file = view.file;
      const fm = file ? app.metadataCache.getFileCache(file)?.frontmatter : undefined;
      const shouldShow = !!file && fm?.type === NOTE_TYPE.visit && !fm?.반영;

      const existing = this.buttons.get(leaf);
      if (shouldShow && !existing) {
        const el = view.addAction("upload", "성도 노트에 반영", () => {
          if (view.file) void openSyncFlow(this.plugin, view.file);
        });
        el.addClass("a4p-pv-sync-action");
        this.buttons.set(leaf, el);
      } else if (!shouldShow && existing) {
        existing.remove();
        this.buttons.delete(leaf);
      }
    }

    // 닫힌 leaf의 잔존 버튼 정리
    for (const [leaf, el] of this.buttons) {
      if (!seen.has(leaf)) {
        el.remove();
        this.buttons.delete(leaf);
      }
    }
  }
}
