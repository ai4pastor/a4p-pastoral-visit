import { ItemView, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import type PastoralVisitPlugin from "./main";
import { VISIT_STATUS } from "./constants";
import { MemberEntry, ActionItem, PrayerItem } from "./types";
import { VisitModal } from "./modals/visit-modal";
import { openSyncFlow } from "./sync";
import { maskBirth } from "./mask";
import { birthdayDday, daysSince, formatRelativeKo, monthsBetween } from "./utils";

export const VIEW_TYPE_PASTORAL_VISIT = "a4p-pastoral-visit-panel";

const DEBOUNCE_MS = 150;

type Tab = "dashboard" | "actions" | "prayers";

export class PastoralVisitView extends ItemView {
  private plugin: PastoralVisitPlugin;
  private tab: Tab = "dashboard";
  private bodyEl!: HTMLElement;
  private tabsEl!: HTMLElement;
  private renderTimer: number | null = null;
  private unsubscribe: (() => void) | null = null;
  /** 후속조치 탭 필터 */
  private actionFilter: "all" | "old" = "all";
  /** 기도 탭 필터 */
  private prayerFilter: "active" | "answered" | "all" = "active";

  constructor(leaf: WorkspaceLeaf, plugin: PastoralVisitPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_PASTORAL_VISIT;
  }

  getDisplayText(): string {
    return "심방 관리";
  }

  getIcon(): string {
    return "heart-handshake";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("a4p-pv-panel");

    this.tabsEl = container.createDiv({ cls: "a4p-pv-tabs" });
    this.bodyEl = container.createDiv({ cls: "a4p-pv-body" });

    this.renderTabs();
    this.unsubscribe = this.plugin.index.onChange(() => this.scheduleRender());
    void this.render();
  }

  async onClose(): Promise<void> {
    this.unsubscribe?.();
    if (this.renderTimer !== null) window.clearTimeout(this.renderTimer);
  }

  private scheduleRender(): void {
    if (this.renderTimer !== null) window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = null;
      void this.render();
    }, DEBOUNCE_MS);
  }

  private renderTabs(): void {
    this.tabsEl.empty();
    const tabs: Array<{ id: Tab; label: string }> = [
      { id: "dashboard", label: "🏠 대시보드" },
      { id: "actions", label: "✅ 후속조치" },
      { id: "prayers", label: "🙏 기도" },
    ];
    for (const t of tabs) {
      const btn = this.tabsEl.createEl("button", {
        text: t.label,
        cls: `a4p-pv-tab${this.tab === t.id ? " is-active" : ""}`,
      });
      btn.addEventListener("click", () => {
        this.tab = t.id;
        this.renderTabs();
        void this.render();
      });
    }
  }

  private async render(): Promise<void> {
    this.bodyEl.empty();
    if (this.tab === "dashboard") await this.renderDashboard();
    else if (this.tab === "actions") await this.renderActions();
    else await this.renderPrayers();
  }

  // ── 대시보드 ──

  private async renderDashboard(): Promise<void> {
    const body = this.bodyEl;
    const today = new Date();
    const s = this.plugin.settings;
    const members = this.plugin.index.membersList();

    // 1. 미완 후속조치
    const pending = await this.plugin.actions.pending();
    const actionCard = this.card(body, `✅ 미완 후속조치 (${pending.length})`);
    if (pending.length === 0) {
      actionCard.createEl("p", { text: "밀린 후속조치가 없습니다 👍", cls: "a4p-pv-empty" });
    } else {
      for (const item of pending.slice(0, 5)) this.renderActionRow(actionCard, item, false);
      if (pending.length > 5) {
        const more = actionCard.createEl("button", {
          text: `더보기 (${pending.length - 5})`,
          cls: "a4p-pv-more",
        });
        more.addEventListener("click", () => {
          this.tab = "actions";
          this.renderTabs();
          void this.render();
        });
      }
    }

    // 2. 심방 필요
    const needed = members.filter((m) => m.fm.심방상태 === VISIT_STATUS.needed);
    const neededCard = this.card(body, `❓ 심방 필요 (${needed.length})`);
    if (needed.length === 0) {
      neededCard.createEl("p", { text: "심방 필요 성도가 없습니다.", cls: "a4p-pv-empty" });
    } else {
      for (const m of needed.slice(0, 8)) this.renderMemberRow(neededCard, m, today);
      if (needed.length > 8) neededCard.createEl("p", { text: `… 외 ${needed.length - 8}명`, cls: "a4p-pv-empty" });
    }

    // 3. 장기 미심방
    const stale = members
      .map((m) => ({ m, last: this.plugin.index.lastVisitDateOf(m.path) }))
      .filter(({ m, last }) => {
        if (m.fm.심방상태 === VISIT_STATUS.notNeeded) return false;
        if (!last) return false; // 기록 자체가 없으면 "심방 필요" 카드 소관
        const months = monthsBetween(last, today);
        return months !== null && months >= s.staleVisitMonths;
      })
      .sort((a, b) => (a.last ?? "").localeCompare(b.last ?? ""));
    const staleCard = this.card(body, `⏳ 장기 미심방 — ${s.staleVisitMonths}개월 이상 (${stale.length})`);
    if (stale.length === 0) {
      staleCard.createEl("p", { text: "해당 성도가 없습니다.", cls: "a4p-pv-empty" });
    } else {
      for (const { m, last } of stale.slice(0, 8)) {
        const row = this.renderMemberRow(staleCard, m, today, last ?? undefined);
        if (m.fm.심방상태 === VISIT_STATUS.done) {
          const btn = row.createEl("button", { text: "필요로 되돌리기", cls: "a4p-pv-row-btn" });
          btn.title = "심방상태를 완료 → 필요로 바꿉니다";
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            void this.revertStatus(m);
          });
        }
      }
    }

    // 4. 생일
    const birthdays = members
      .map((m) => ({
        m,
        dday: typeof m.fm.생년월일 === "string" ? birthdayDday(m.fm.생년월일, today) : null,
      }))
      .filter((x): x is { m: MemberEntry; dday: number } => x.dday !== null && x.dday <= s.birthdayWindowDays)
      .sort((a, b) => a.dday - b.dday);
    const birthCard = this.card(body, `🎂 생일 — ${s.birthdayWindowDays}일 이내 (${birthdays.length})`);
    if (birthdays.length === 0) {
      birthCard.createEl("p", { text: "다가오는 생일이 없습니다.", cls: "a4p-pv-empty" });
    } else {
      for (const { m, dday } of birthdays) {
        const row = birthCard.createDiv({ cls: "a4p-pv-row" });
        const label = row.createSpan({ cls: "a4p-pv-row-main" });
        label.setText(`${m.name} — ${this.renderSensitive(String(m.fm.생년월일 ?? ""), "birth")} (${dday === 0 ? "오늘!" : `D-${dday}`})`);
        row.addEventListener("click", () => void this.openMember(m));
      }
    }

    // 5. 새등록 성도
    const newcomers = members.filter((m) => {
      const reg = typeof m.fm.등록일 === "string" ? daysSince(m.fm.등록일, today) : null;
      return reg !== null && reg <= s.newMemberDays && this.plugin.index.visitsOf(m.path).length === 0;
    });
    const newCard = this.card(body, `🌱 새등록 성도 — 심방 전 (${newcomers.length})`);
    if (newcomers.length === 0) {
      newCard.createEl("p", { text: "정착 심방을 기다리는 새등록 성도가 없습니다.", cls: "a4p-pv-empty" });
    } else {
      for (const m of newcomers) this.renderMemberRow(newCard, m, today);
    }

    // 6. 미반영 일지
    const unsynced = this.plugin.index.unsyncedVisits();
    const unsyncedCard = this.card(body, `📝 미반영 일지 (${unsynced.length})`);
    if (unsynced.length === 0) {
      unsyncedCard.createEl("p", { text: "모든 일지가 반영됐습니다.", cls: "a4p-pv-empty" });
    } else {
      for (const v of unsynced) {
        const row = unsyncedCard.createDiv({ cls: "a4p-pv-row" });
        row.createSpan({ text: v.basename, cls: "a4p-pv-row-main" });
        const btn = row.createEl("button", { text: "반영", cls: "a4p-pv-row-btn mod-cta" });
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const file = this.plugin.app.vault.getAbstractFileByPath(v.path);
          if (file instanceof TFile) void openSyncFlow(this.plugin, file);
        });
        row.addEventListener("click", () => void this.openPath(v.path));
      }
    }

    // 7. 진행 중인 기도제목 (상위 3 + 더보기)
    const prayers = await this.plugin.prayers.scanAll();
    const activePrayers = prayers.filter((p) => !p.answered);
    const prayerCard = this.card(body, `🙏 진행 중인 기도제목 (${activePrayers.length})`);
    if (activePrayers.length === 0) {
      prayerCard.createEl("p", { text: "수집된 기도제목이 없습니다.", cls: "a4p-pv-empty" });
    } else {
      for (const item of activePrayers.slice(0, 3)) this.renderPrayerRow(prayerCard, item, false);
      if (activePrayers.length > 3) {
        const more = prayerCard.createEl("button", {
          text: `더보기 (${activePrayers.length - 3})`,
          cls: "a4p-pv-more",
        });
        more.addEventListener("click", () => {
          this.tab = "prayers";
          this.renderTabs();
          void this.render();
        });
      }
    }

    // 8. 최근 심방 (접힘)
    const recent = this.plugin.index
      .visitsList()
      .sort((a, b) => String(b.fm.날짜 ?? "").localeCompare(String(a.fm.날짜 ?? "")))
      .slice(0, 5);
    const details = body.createEl("details", { cls: "a4p-pv-card" });
    details.createEl("summary", { text: "최근 심방 5건" });
    for (const v of recent) {
      const row = details.createDiv({ cls: "a4p-pv-row" });
      row.createSpan({ text: `${v.fm.날짜 ?? ""} — ${v.basename}`, cls: "a4p-pv-row-main" });
      row.addEventListener("click", () => void this.openPath(v.path));
    }

    // 하단: Bases 위임 링크
    const footer = body.createDiv({ cls: "a4p-pv-footer" });
    const baseLink = footer.createEl("a", { text: "📊 성도 관리.base 열기 (통계·분석)" });
    baseLink.addEventListener("click", (e) => {
      e.preventDefault();
      void this.plugin.app.workspace.openLinkText(
        `${this.plugin.settings.memberFolder}/성도 관리.base`,
        "",
        true,
      );
    });
  }

  // ── 후속조치 탭 ──

  private async renderActions(): Promise<void> {
    const body = this.bodyEl;
    const chips = body.createDiv({ cls: "a4p-pv-chips" });
    const chipDefs: Array<{ id: "all" | "old"; label: string }> = [
      { id: "all", label: "전체" },
      { id: "old", label: "30일↑ 경과" },
    ];
    for (const c of chipDefs) {
      const chip = chips.createEl("button", {
        text: c.label,
        cls: `a4p-pv-chip${this.actionFilter === c.id ? " is-active" : ""}`,
      });
      chip.addEventListener("click", () => {
        this.actionFilter = c.id;
        void this.render();
      });
    }

    let pending = await this.plugin.actions.pending();
    if (this.actionFilter === "old") pending = pending.filter((a) => a.daysElapsed >= 30);

    if (pending.length === 0) {
      body.createEl("p", { text: "미완 후속조치가 없습니다 👍", cls: "a4p-pv-empty" });
      return;
    }

    const list = body.createDiv({ cls: "a4p-pv-action-list" });
    for (const item of pending) this.renderActionRow(list, item, true);
  }

  // ── 기도 탭 ──

  private async renderPrayers(): Promise<void> {
    const body = this.bodyEl;
    const chips = body.createDiv({ cls: "a4p-pv-chips" });
    const chipDefs: Array<{ id: "active" | "answered" | "all"; label: string }> = [
      { id: "active", label: "진행 중" },
      { id: "answered", label: "응답·마침 ✅" },
      { id: "all", label: "전체" },
    ];
    for (const c of chipDefs) {
      const chip = chips.createEl("button", {
        text: c.label,
        cls: `a4p-pv-chip${this.prayerFilter === c.id ? " is-active" : ""}`,
      });
      chip.addEventListener("click", () => {
        this.prayerFilter = c.id;
        void this.render();
      });
    }

    let prayers = await this.plugin.prayers.scanAll();
    if (this.prayerFilter === "active") prayers = prayers.filter((p) => !p.answered);
    else if (this.prayerFilter === "answered") prayers = prayers.filter((p) => p.answered);

    if (prayers.length === 0) {
      body.createEl("p", {
        text:
          this.prayerFilter === "answered"
            ? "응답 표시된 기도제목이 없습니다."
            : "수집된 기도제목이 없습니다. 심방일지의 기도제목 섹션에 불릿으로 기록하면 여기에 모입니다.",
        cls: "a4p-pv-empty",
      });
      return;
    }

    // 성도별 그룹핑
    const byMember = new Map<string, PrayerItem[]>();
    for (const p of prayers) {
      const key = p.memberName || "(성도 미상)";
      if (!byMember.has(key)) byMember.set(key, []);
      byMember.get(key)!.push(p);
    }

    for (const [memberName, items] of byMember) {
      const card = this.card(body, `${memberName} (${items.length})`);
      for (const item of items) this.renderPrayerRow(card, item, true);
    }
  }

  private renderPrayerRow(parent: HTMLElement, item: PrayerItem, detailed: boolean): void {
    const row = parent.createDiv({ cls: "a4p-pv-row a4p-pv-prayer-row" });

    const checkbox = row.createEl("input", { type: "checkbox" });
    checkbox.checked = item.answered;
    checkbox.title = item.answered
      ? "응답 표시 해제 (일지의 ✅ 마커 제거)"
      : "응답됨/기도 마침으로 표시 (일지 라인 끝에 ✅ 날짜 기록)";
    checkbox.addEventListener("click", (e) => {
      e.stopPropagation();
      void this.plugin.prayers.toggle(item).then(() => this.scheduleRender());
    });

    const main = row.createSpan({ cls: "a4p-pv-row-main" });
    main.setText(item.text);
    if (item.answered) main.addClass("is-answered");

    const metaParts: string[] = [];
    if (!detailed && item.memberName) metaParts.push(item.memberName);
    if (item.group) metaParts.push(item.group);
    metaParts.push(item.visitDate);
    if (item.answered && item.answeredDate) metaParts.push(`✅ ${item.answeredDate}`);
    row.createSpan({ text: metaParts.filter(Boolean).join(" · "), cls: "a4p-pv-row-meta" });

    main.addEventListener("click", () => void this.openPath(item.visitPath, item.line));
  }

  // ── 공용 렌더러 ──

  private card(parent: HTMLElement, title: string): HTMLElement {
    const card = parent.createDiv({ cls: "a4p-pv-card" });
    card.createEl("div", { text: title, cls: "a4p-pv-card-title" });
    return card;
  }

  private renderMemberRow(
    parent: HTMLElement,
    m: MemberEntry,
    today: Date,
    lastVisit?: string,
  ): HTMLElement {
    const row = parent.createDiv({ cls: "a4p-pv-row" });
    const last = lastVisit ?? this.plugin.index.lastVisitDateOf(m.path);
    const meta = [m.fm.구역, last ? `마지막 심방 ${formatRelativeKo(last, today)}` : "심방 기록 없음"]
      .filter(Boolean)
      .join(" · ");
    const main = row.createSpan({ cls: "a4p-pv-row-main" });
    main.createSpan({ text: m.name, cls: "a4p-pv-row-name" });
    main.createSpan({ text: ` ${meta}`, cls: "a4p-pv-row-meta" });

    const visitBtn = row.createEl("button", { cls: "a4p-pv-row-btn" });
    setIcon(visitBtn, "pen-line");
    visitBtn.title = "심방일지 작성";
    visitBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      new VisitModal(this.plugin, m.path).open();
    });

    row.addEventListener("click", () => void this.openMember(m));
    return row;
  }

  private renderActionRow(parent: HTMLElement, item: ActionItem, detailed: boolean): void {
    const row = parent.createDiv({ cls: "a4p-pv-row a4p-pv-action-row" });
    const checkbox = row.createEl("input", { type: "checkbox" });
    checkbox.checked = item.checked;
    checkbox.addEventListener("click", (e) => {
      e.stopPropagation();
      void this.plugin.actions.toggle(item).then(() => this.scheduleRender());
    });

    const main = row.createSpan({ cls: "a4p-pv-row-main" });
    main.setText(item.text);
    const metaParts = [item.memberName, item.visitDate];
    if (detailed && item.daysElapsed > 0) metaParts.push(`${item.daysElapsed}일 경과`);
    row.createSpan({ text: metaParts.filter(Boolean).join(" · "), cls: "a4p-pv-row-meta" });

    main.addEventListener("click", () => void this.openPath(item.visitPath, item.line));
  }

  /** 민감정보 표시 단일 헬퍼 — 마스킹 설정 강제 (직접 setText 금지 규율) */
  private renderSensitive(value: string, kind: "phone" | "birth"): string {
    if (!this.plugin.settings.maskSensitiveFields) return value;
    return kind === "birth" ? maskBirth(value) : value;
  }

  // ── 액션 ──

  private async openMember(m: MemberEntry): Promise<void> {
    await this.openPath(m.path);
  }

  private async openPath(path: string, line?: number): Promise<void> {
    const file = this.plugin.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    const leaf = this.plugin.app.workspace.getLeaf(false);
    await leaf.openFile(file, line !== undefined ? { eState: { line } } : undefined);
  }

  /** 장기 미심방 카드: 심방상태 완료 → 필요 (사용자 명시 클릭 = 승인) */
  private async revertStatus(m: MemberEntry): Promise<void> {
    const file = this.plugin.app.vault.getAbstractFileByPath(m.path);
    if (!(file instanceof TFile)) return;
    await this.plugin.app.fileManager.processFrontMatter(file, (fm) => {
      fm["심방상태"] = VISIT_STATUS.needed;
    });
  }
}
