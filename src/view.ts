import { ItemView, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import type PastoralVisitPlugin from "./main";
import { VISIT_STATUS } from "./constants";
import { MemberEntry, ActionItem, PrayerItem } from "./types";
import { VisitModal } from "./modals/visit-modal";
import { MemberModal } from "./modals/member-modal";
import { PrayerDigestModal } from "./modals/prayer-digest-modal";
import { openSyncFlow } from "./sync";
import { renderSensitive } from "./mask";
import { filterMembers } from "./briefing-core";
import { gatherBriefing } from "./briefing";
import { badge, BadgeTone, renderEmpty, safeIcon } from "./ui";
import { birthdayDday, daysSince, formatRelativeKo, monthsBetween } from "./utils";

export const VIEW_TYPE_PASTORAL_VISIT = "a4p-pastoral-visit-panel";

const DEBOUNCE_MS = 150;

type Tab = "dashboard" | "members" | "actions" | "prayers";

interface CardSpec {
  /** lucide 아이콘 id */
  icon: string;
  /** 아이콘 미존재 시 폴백 */
  iconFallback?: string;
  /** 순수 한국어 제목 (이모지·건수 없이) */
  title: string;
  count?: number;
  badgeTone?: BadgeTone;
  /** true면 <details>로 만들고 접힘 상태를 설정에 저장 */
  collapsible?: boolean;
  /** 접힘 상태 저장 키 (collapsible일 때 필수) */
  key?: string;
}

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
  /** 성도 탭 검색어 */
  private memberQuery = "";
  /** 선택된 성도 (null=목록, 있으면 브리핑 — 탭 내 전환) */
  private selectedMemberPath: string | null = null;

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

    // 키보드 접근: 행에서 Enter/Space = 클릭 (위임 1개)
    this.bodyEl.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const target = e.target as HTMLElement;
      if (target.classList?.contains("a4p-pv-row")) {
        e.preventDefault();
        target.click();
      }
    });

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
    const tabs: Array<{ id: Tab; icon: string; fallback?: string; label: string }> = [
      { id: "dashboard", icon: "layout-dashboard", fallback: "home", label: "대시보드" },
      { id: "members", icon: "users", label: "성도" },
      { id: "actions", icon: "list-checks", fallback: "check-square", label: "후속조치" },
      { id: "prayers", icon: "hand-heart", fallback: "heart", label: "기도" },
    ];
    for (const t of tabs) {
      const btn = this.tabsEl.createEl("button", {
        cls: `a4p-pv-tab${this.tab === t.id ? " is-active" : ""}`,
      });
      safeIcon(btn.createSpan({ cls: "a4p-pv-tab-icon" }), t.icon, t.fallback);
      btn.createSpan({ text: t.label, cls: "a4p-pv-tab-label" });
      btn.addEventListener("click", () => {
        this.tab = t.id;
        this.renderTabs();
        void this.render();
      });
    }
  }

  private async render(): Promise<void> {
    // 리렌더 깜빡임·스크롤 점프 억제: 높이 고정 후 렌더 완료 시 해제
    const prevHeight = this.bodyEl.offsetHeight;
    if (prevHeight > 0) this.bodyEl.style.minHeight = `${prevHeight}px`;
    this.bodyEl.empty();
    if (this.tab === "dashboard") await this.renderDashboard();
    else if (this.tab === "members") await this.renderMembers();
    else if (this.tab === "actions") await this.renderActions();
    else await this.renderPrayers();
    this.bodyEl.style.minHeight = "";
  }

  /** 외부 진입점(커맨드·컨텍스트 메뉴)에서 특정 성도의 브리핑 표시 */
  showBriefing(memberPath: string): void {
    this.tab = "members";
    this.selectedMemberPath = memberPath;
    this.renderTabs();
    void this.render();
  }

  // ── 대시보드 ──

  private async renderDashboard(): Promise<void> {
    const body = this.bodyEl;
    const today = new Date();
    const s = this.plugin.settings;
    const members = this.plugin.index.membersList();

    // 1. 미완 후속조치
    const pending = await this.plugin.actions.pending();
    const actionCard = this.card(body, {
      icon: "list-checks",
      iconFallback: "check-square",
      title: "미완 후속조치",
      count: pending.length,
      badgeTone: "accent",
      collapsible: true,
      key: "actions",
    });
    if (pending.length === 0) {
      renderEmpty(actionCard, { icon: "circle-check", text: "밀린 후속조치가 없습니다" });
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
    const neededCard = this.card(body, {
      icon: "door-open",
      iconFallback: "footprints",
      title: "심방 필요",
      count: needed.length,
      collapsible: true,
      key: "needed",
    });
    if (needed.length === 0) {
      renderEmpty(neededCard, { icon: "circle-check", text: "심방 필요 성도가 없습니다." });
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
    const staleCard = this.card(body, {
      icon: "hourglass",
      iconFallback: "clock",
      title: `장기 미심방 — ${s.staleVisitMonths}개월 이상`,
      count: stale.length,
      badgeTone: "warn",
      collapsible: true,
      key: "stale",
    });
    if (stale.length === 0) {
      renderEmpty(staleCard, { icon: "circle-check", text: "해당 성도가 없습니다." });
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
    const birthCard = this.card(body, {
      icon: "cake",
      title: `생일 — ${s.birthdayWindowDays}일 이내`,
      count: birthdays.length,
      collapsible: true,
      key: "birthdays",
    });
    if (birthdays.length === 0) {
      renderEmpty(birthCard, { icon: "circle-check", text: "다가오는 생일이 없습니다." });
    } else {
      for (const { m, dday } of birthdays) {
        const row = this.rowEl(birthCard);
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
    const newCard = this.card(body, {
      icon: "sprout",
      title: "새등록 성도 — 심방 전",
      count: newcomers.length,
      badgeTone: "accent",
      collapsible: true,
      key: "newcomers",
    });
    if (newcomers.length === 0) {
      renderEmpty(newCard, {
        icon: "circle-check",
        text: "정착 심방을 기다리는 새등록 성도가 없습니다.",
      });
    } else {
      for (const m of newcomers) this.renderMemberRow(newCard, m, today);
    }

    // 6. 미반영 일지
    const unsynced = this.plugin.index.unsyncedVisits();
    const unsyncedCard = this.card(body, {
      icon: "file-clock",
      iconFallback: "pen-line",
      title: "미반영 일지",
      count: unsynced.length,
      badgeTone: "warn",
      collapsible: true,
      key: "unsynced",
    });
    if (unsynced.length === 0) {
      renderEmpty(unsyncedCard, { icon: "circle-check", text: "모든 일지가 반영됐습니다." });
    } else {
      for (const v of unsynced) {
        const row = this.rowEl(unsyncedCard);
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
    const prayerCard = this.card(body, {
      icon: "hand-heart",
      iconFallback: "heart",
      title: "진행 중인 기도제목",
      count: activePrayers.length,
      collapsible: true,
      key: "prayers",
    });
    if (activePrayers.length === 0) {
      renderEmpty(prayerCard, { icon: "inbox", text: "수집된 기도제목이 없습니다." });
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
    const recentCard = this.card(body, {
      icon: "history",
      title: "최근 심방 5건",
      collapsible: true,
      key: "recent",
    });
    for (const v of recent) {
      const row = this.rowEl(recentCard);
      row.createSpan({ text: `${v.fm.날짜 ?? ""} — ${v.basename}`, cls: "a4p-pv-row-main" });
      row.addEventListener("click", () => void this.openPath(v.path));
    }

    // 하단: Bases 위임 링크
    const footer = body.createDiv({ cls: "a4p-pv-footer" });
    const baseLink = footer.createEl("a");
    safeIcon(baseLink.createSpan({ cls: "a4p-pv-footer-icon" }), "bar-chart-3", "table-2");
    baseLink.createSpan({ text: "성도 관리.base 열기 (통계·분석)" });
    baseLink.addEventListener("click", (e) => {
      e.preventDefault();
      void this.plugin.app.workspace.openLinkText(
        `${this.plugin.settings.memberFolder}/성도 관리.base`,
        "",
        true,
      );
    });
  }

  // ── 성도 탭 ──

  private async renderMembers(): Promise<void> {
    const body = this.bodyEl;
    if (this.selectedMemberPath) {
      await this.renderBriefing(body, this.selectedMemberPath);
      return;
    }

    const search = body.createEl("input", {
      type: "search",
      cls: "a4p-pv-member-search",
      placeholder: "이름·구역·직분 검색",
    });
    search.value = this.memberQuery;
    const listEl = body.createDiv();

    const renderList = () => {
      listEl.empty();
      const today = new Date();
      const matched = filterMembers(this.plugin.index.membersList(), this.memberQuery);
      if (matched.length === 0) {
        renderEmpty(
          listEl,
          this.memberQuery
            ? { icon: "inbox", text: "검색 결과가 없습니다." }
            : {
                icon: "inbox",
                text: "등록된 성도가 없습니다.",
                cta: { label: "새 성도 등록", onClick: () => new MemberModal(this.plugin).open() },
              },
          true,
        );
        return;
      }
      for (const m of matched) {
        this.renderMemberRow(listEl, m, today, undefined, {
          onClick: () => {
            this.selectedMemberPath = m.path;
            void this.render();
          },
          showOpenBtn: true,
        });
      }
    };

    search.addEventListener("input", () => {
      this.memberQuery = search.value;
      renderList();
    });
    renderList();
  }

  // ── 심방 브리핑 ──

  private async renderBriefing(body: HTMLElement, memberPath: string): Promise<void> {
    const back = body.createEl("button", { cls: "a4p-pv-back-btn" });
    safeIcon(back.createSpan({ cls: "a4p-pv-chip-icon" }), "arrow-left");
    back.createSpan({ text: "성도 목록" });
    back.addEventListener("click", () => {
      this.selectedMemberPath = null;
      void this.render();
    });

    const model = await gatherBriefing(this.plugin, memberPath);
    if (!model) {
      renderEmpty(body, { icon: "inbox", text: "성도 노트를 찾을 수 없습니다." }, true);
      return;
    }

    // 헤더: 이름 + 심방상태 뱃지 + 인적 사항
    const header = body.createDiv({ cls: "a4p-pv-briefing-header" });
    const nameEl = header.createDiv({ cls: "a4p-pv-briefing-name" });
    nameEl.createSpan({ text: model.name });
    if (model.status) {
      nameEl.createSpan({
        text: model.status,
        cls: `a4p-pv-status-badge${model.status === VISIT_STATUS.needed ? " is-needed" : ""}`,
      });
    }
    const metaParts = [
      model.직분,
      model.구역,
      model.age !== null ? `${model.age}세` : null,
    ].filter(Boolean);
    if (metaParts.length > 0) {
      header.createDiv({ text: metaParts.join(" · "), cls: "a4p-pv-briefing-meta" });
    }
    // 민감정보 — 반드시 renderSensitive 경유 (마스킹 강제)
    const senParts: string[] = [];
    if (model.phone) senParts.push(this.renderSensitive(model.phone, "phone"));
    if (model.birth) {
      const dday =
        model.birthdayDday !== null && model.birthdayDday <= this.plugin.settings.birthdayWindowDays
          ? ` (생일 ${model.birthdayDday === 0 ? "오늘!" : `D-${model.birthdayDday}`})`
          : "";
      senParts.push(this.renderSensitive(model.birth, "birth") + dday);
    }
    if (senParts.length > 0) {
      header.createDiv({ text: senParts.join(" · "), cls: "a4p-pv-briefing-meta" });
    }
    const noteParts = [
      model.registeredMonths !== null ? `등록 ${model.registeredMonths}개월` : null,
      model.serviceThisYear ? `봉사: ${model.serviceThisYear}` : null,
    ].filter(Boolean);
    if (noteParts.length > 0) {
      header.createDiv({ text: noteParts.join(" · "), cls: "a4p-pv-briefing-meta" });
    }

    // 1. 마지막 심방
    const lastCard = this.card(body, { icon: "history", title: "마지막 심방" });
    if (model.lastVisit) {
      const lv = model.lastVisit;
      const row = this.rowEl(lastCard);
      row.createSpan({
        text: [lv.date, lv.type].filter(Boolean).join(" · "),
        cls: "a4p-pv-row-main",
      });
      row.createSpan({ text: lv.relative, cls: "a4p-pv-row-meta" });
      row.addEventListener("click", () => void this.openPath(lv.path));
    } else {
      renderEmpty(lastCard, { icon: "inbox", text: "심방 기록이 없습니다." });
    }

    // 2. 미완 후속조치
    const actionCard = this.card(body, {
      icon: "list-checks",
      iconFallback: "check-square",
      title: "미완 후속조치",
      count: model.pendingActions.length,
      badgeTone: "accent",
    });
    if (model.pendingActions.length === 0) {
      renderEmpty(actionCard, { icon: "circle-check", text: "밀린 후속조치가 없습니다" });
    } else {
      for (const item of model.pendingActions) this.renderActionRow(actionCard, item, true);
    }

    // 3. 최근 기도제목
    const prayerCard = this.card(body, {
      icon: "hand-heart",
      iconFallback: "heart",
      title: "최근 기도제목",
      count: model.recentPrayers.length,
    });
    if (model.recentPrayers.length === 0) {
      renderEmpty(prayerCard, { icon: "inbox", text: "최근 일지에 기도제목이 없습니다." });
    } else {
      for (const item of model.recentPrayers) this.renderPrayerRow(prayerCard, item, true);
    }

    // 4. 가족
    if (model.family.length > 0) {
      const famCard = this.card(body, {
        icon: "users",
        title: "가족",
        count: model.family.length,
      });
      const today = new Date();
      for (const f of model.family) {
        const row = this.rowEl(famCard);
        const main = row.createSpan({ cls: "a4p-pv-row-main" });
        main.createSpan({ text: f.display, cls: "a4p-pv-row-name" });
        const famMeta = [
          f.label,
          f.status,
          f.lastVisit ? `마지막 심방 ${formatRelativeKo(f.lastVisit, today)}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        if (famMeta) main.createSpan({ text: ` ${famMeta}`, cls: "a4p-pv-row-meta" });
        if (f.memberPath) {
          const target = f.memberPath;
          row.addEventListener("click", () => {
            this.selectedMemberPath = target;
            void this.render();
          });
        } else {
          row.title = "성도 노트로 해석되지 않는 링크입니다";
        }
      }
    }

    // 5. 심방 이력 타임라인
    const timelineCard = this.card(body, {
      icon: "calendar-days",
      iconFallback: "calendar",
      title: "심방 이력",
      count: model.timeline.length,
      collapsible: true,
      key: "briefing-timeline",
    });
    if (model.timeline.length === 0) {
      renderEmpty(timelineCard, { icon: "inbox", text: "심방 이력이 없습니다." });
    } else {
      for (const t of model.timeline) {
        const row = this.rowEl(timelineCard);
        row.createSpan({ text: t.date, cls: "a4p-pv-timeline-date" });
        row.createSpan({
          text: [t.type, t.place].filter(Boolean).join(" · "),
          cls: "a4p-pv-row-main",
        });
        row.addEventListener("click", () => void this.openPath(t.path));
      }
    }

    // 하단 CTA
    const cta = body.createEl("button", {
      text: "이 성도 심방일지 작성",
      cls: "a4p-pv-briefing-cta mod-cta",
    });
    cta.addEventListener("click", () => new VisitModal(this.plugin, memberPath).open());
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
      renderEmpty(body, { icon: "circle-check", text: "미완 후속조치가 없습니다" }, true);
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
      { id: "answered", label: "응답·마침" },
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

    const digestBtn = chips.createEl("button", { cls: "a4p-pv-chip" });
    safeIcon(digestBtn.createSpan({ cls: "a4p-pv-chip-icon" }), "file-output", "file-text");
    digestBtn.createSpan({ text: "주간 모음" });
    digestBtn.title = "주간 기도제목 모음 노트 생성 (미리보기 후)";
    digestBtn.addEventListener("click", () => new PrayerDigestModal(this.plugin).open());

    let prayers = await this.plugin.prayers.scanAll();
    if (this.prayerFilter === "active") prayers = prayers.filter((p) => !p.answered);
    else if (this.prayerFilter === "answered") prayers = prayers.filter((p) => p.answered);

    if (prayers.length === 0) {
      if (this.prayerFilter === "answered") {
        renderEmpty(body, { icon: "circle-check", text: "응답 표시된 기도제목이 없습니다." }, true);
      } else {
        renderEmpty(
          body,
          {
            icon: "inbox",
            text: "수집된 기도제목이 없습니다. 심방일지의 기도제목 섹션에 불릿으로 기록하면 여기에 모입니다.",
            cta: { label: "심방일지 작성", onClick: () => new VisitModal(this.plugin).open() },
          },
          true,
        );
      }
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
      const card = this.card(body, { icon: "user", title: memberName, count: items.length });
      for (const item of items) this.renderPrayerRow(card, item, true);
    }
  }

  private renderPrayerRow(parent: HTMLElement, item: PrayerItem, detailed: boolean): void {
    const row = this.rowEl(parent, "a4p-pv-prayer-row");

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
    const meta = row.createSpan({
      text: metaParts.filter(Boolean).join(" · "),
      cls: "a4p-pv-row-meta",
    });
    if (item.answered && item.answeredDate) {
      const mark = meta.createSpan({ cls: "a4p-pv-answered-mark" });
      mark.appendText(" ");
      safeIcon(mark.createSpan(), "check");
      mark.appendText(item.answeredDate);
    }

    main.addEventListener("click", () => void this.openPath(item.visitPath, item.line));
  }

  // ── 공용 렌더러 ──

  private card(parent: HTMLElement, spec: CardSpec): HTMLElement {
    const collapsible = spec.collapsible === true;
    const card = parent.createEl(collapsible ? "details" : "div", { cls: "a4p-pv-card" });
    if (collapsible) {
      (card as HTMLDetailsElement).open =
        !spec.key || !this.plugin.settings.collapsedCards.includes(spec.key);
    }
    const head = card.createEl(collapsible ? "summary" : "div", { cls: "a4p-pv-card-head" });
    if (collapsible) safeIcon(head.createSpan({ cls: "a4p-pv-card-chevron" }), "chevron-right");
    safeIcon(head.createSpan({ cls: "a4p-pv-card-icon" }), spec.icon, spec.iconFallback);
    head.createSpan({ text: spec.title, cls: "a4p-pv-card-title" });
    if (spec.count !== undefined) badge(head, spec.count, spec.badgeTone ?? "neutral");

    if (collapsible && spec.key) {
      const key = spec.key;
      card.addEventListener("toggle", () => {
        const open = (card as HTMLDetailsElement).open;
        const list = this.plugin.settings.collapsedCards;
        const has = list.includes(key);
        if (open && has) this.plugin.settings.collapsedCards = list.filter((k) => k !== key);
        else if (!open && !has) this.plugin.settings.collapsedCards = [...list, key];
        else return;
        void this.plugin.persist();
      });
    }
    return card;
  }

  /** 키보드 접근 가능한 행 요소 */
  private rowEl(parent: HTMLElement, extraCls = ""): HTMLElement {
    const row = parent.createDiv({ cls: `a4p-pv-row${extraCls ? ` ${extraCls}` : ""}` });
    row.tabIndex = 0;
    return row;
  }

  private renderMemberRow(
    parent: HTMLElement,
    m: MemberEntry,
    today: Date,
    lastVisit?: string,
    opts?: {
      /** 행 클릭 동작 재정의 (기본: 성도 노트 열기) */
      onClick?: () => void;
      /** 노트 열기 버튼 별도 표시 (행 클릭이 다른 동작일 때) */
      showOpenBtn?: boolean;
    },
  ): HTMLElement {
    const row = this.rowEl(parent);
    const last = lastVisit ?? this.plugin.index.lastVisitDateOf(m.path);
    const meta = [m.fm.구역, last ? `마지막 심방 ${formatRelativeKo(last, today)}` : "심방 기록 없음"]
      .filter(Boolean)
      .join(" · ");
    const main = row.createSpan({ cls: "a4p-pv-row-main" });
    main.createSpan({ text: m.name, cls: "a4p-pv-row-name" });
    main.createSpan({ text: ` ${meta}`, cls: "a4p-pv-row-meta" });

    if (opts?.showOpenBtn) {
      const openBtn = row.createEl("button", { cls: "a4p-pv-row-btn" });
      setIcon(openBtn, "file-text");
      openBtn.title = "성도 노트 열기";
      openBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        void this.openMember(m);
      });
    }

    const visitBtn = row.createEl("button", { cls: "a4p-pv-row-btn" });
    setIcon(visitBtn, "pen-line");
    visitBtn.title = "심방일지 작성";
    visitBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      new VisitModal(this.plugin, m.path).open();
    });

    row.addEventListener("click", opts?.onClick ?? (() => void this.openMember(m)));
    return row;
  }

  private renderActionRow(parent: HTMLElement, item: ActionItem, detailed: boolean): void {
    const row = this.rowEl(parent, "a4p-pv-action-row");
    const checkbox = row.createEl("input", { type: "checkbox" });
    checkbox.checked = item.checked;
    checkbox.addEventListener("click", (e) => {
      e.stopPropagation();
      void this.plugin.actions.toggle(item).then(() => this.scheduleRender());
    });

    const main = row.createSpan({ cls: "a4p-pv-row-main" });
    main.setText(item.text);
    const metaParts = [item.memberName, item.visitDate];
    const showElapsed = detailed && item.daysElapsed > 0;
    if (showElapsed && item.daysElapsed < 30) metaParts.push(`${item.daysElapsed}일 경과`);
    const meta = row.createSpan({
      text: metaParts.filter(Boolean).join(" · "),
      cls: "a4p-pv-row-meta",
    });
    // 30일 이상 방치는 경고 뱃지로 승격 (칩 필터 "30일↑ 경과"와 시각 언어 통일)
    if (showElapsed && item.daysElapsed >= 30) badge(meta, item.daysElapsed, "warn").appendText("일");

    main.addEventListener("click", () => void this.openPath(item.visitPath, item.line));
  }

  /** 민감정보 표시 단일 헬퍼 — 마스킹 설정 강제 (직접 setText 금지 규율) */
  private renderSensitive(value: string, kind: "phone" | "birth"): string {
    return renderSensitive(value, kind, this.plugin.settings.maskSensitiveFields);
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
