import { MarkdownView, Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, PastoralVisitSettings, PastoralVisitSettingTab } from "./settings";
import { MemberIndex } from "./member-index";
import { MemberModal } from "./modals/member-modal";
import { VisitModal } from "./modals/visit-modal";
import { NOTE_TYPE } from "./constants";
import { openSyncFlow } from "./sync";
import { ActionScanner } from "./actions";
import { PastoralVisitView, VIEW_TYPE_PASTORAL_VISIT } from "./view";
import { SyncBanner } from "./sync-banner";
import { setIcon } from "obsidian";

interface PersistedState {
  settings: PastoralVisitSettings;
}

export default class PastoralVisitPlugin extends Plugin {
  settings!: PastoralVisitSettings;
  index!: MemberIndex;
  actions!: ActionScanner;
  banner!: SyncBanner;
  private statusBarEl: HTMLElement | null = null;

  async onload() {
    await this.loadState();

    this.index = new MemberIndex(this);
    this.index.start();
    this.actions = new ActionScanner(this);
    this.actions.start();
    this.banner = new SyncBanner(this);
    this.banner.start();
    this.initStatusBar();

    this.addSettingTab(new PastoralVisitSettingTab(this.app, this));

    this.registerView(VIEW_TYPE_PASTORAL_VISIT, (leaf) => new PastoralVisitView(leaf, this));
    this.addRibbonIcon("heart-handshake", "심방 관리 패널", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "open-panel",
      name: "심방 관리 패널 열기",
      callback: () => void this.activateView(),
    });

    this.addCommand({
      id: "index-status",
      name: "인덱스 상태 확인",
      callback: () => {
        const members = this.index.membersList().length;
        const visits = this.index.visitsList().length;
        const unsynced = this.index.unsyncedVisits().length;
        new Notice(`성도 ${members}명 · 심방일지 ${visits}건 · 미반영 ${unsynced}건`);
      },
    });

    this.addCommand({
      id: "new-member",
      name: "새 성도 등록",
      callback: () => new MemberModal(this).open(),
    });

    this.addCommand({
      id: "new-visit",
      name: "심방일지 작성",
      callback: () => new VisitModal(this, this.activeMemberPath() ?? undefined).open(),
    });

    this.addCommand({
      id: "sync-visit",
      name: "심방일지 반영 (성도 노트에)",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
        if (!file) return false;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (fm?.type !== NOTE_TYPE.visit) return false;
        if (checking) return true;
        void openSyncFlow(this, file);
        return true;
      },
    });
  }

  onunload() {
    this.banner?.stop();
  }

  /** 상태바 마스킹 토글 아이콘 */
  private initStatusBar(): void {
    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.addClass("mod-clickable");
    this.statusBarEl.setAttr("aria-label", "민감정보 마스킹 토글");
    this.refreshStatusBar();
    this.statusBarEl.addEventListener("click", () => {
      this.settings.maskSensitiveFields = !this.settings.maskSensitiveFields;
      void this.persist();
      this.refreshStatusBar();
      new Notice(
        this.settings.maskSensitiveFields ? "민감정보 마스킹 켜짐" : "민감정보 마스킹 꺼짐",
      );
    });
  }

  private refreshStatusBar(): void {
    if (!this.statusBarEl) return;
    this.statusBarEl.empty();
    setIcon(this.statusBarEl, this.settings.maskSensitiveFields ? "eye-off" : "eye");
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: import("obsidian").WorkspaceLeaf | null =
      workspace.getLeavesOfType(VIEW_TYPE_PASTORAL_VISIT)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (!leaf) return;
      await leaf.setViewState({ type: VIEW_TYPE_PASTORAL_VISIT, active: true });
    }
    void workspace.revealLeaf(leaf);
  }

  /** 활성 노트가 교인노트면 그 경로 (심방일지 모달 프리필용) */
  activeMemberPath(): string | null {
    const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
    if (!file) return null;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    return fm?.type === NOTE_TYPE.member ? file.path : null;
  }

  async loadState() {
    const raw = ((await this.loadData()) ?? {}) as Partial<PersistedState>;
    const saved = raw.settings ?? ({} as Partial<PastoralVisitSettings>);
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...saved,
      visitTypes: saved.visitTypes ?? [...DEFAULT_SETTINGS.visitTypes],
    };
  }

  async persist() {
    const payload: PersistedState = { settings: this.settings };
    await this.saveData(payload);
  }
}
