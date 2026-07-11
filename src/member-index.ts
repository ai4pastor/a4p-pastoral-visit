import { TFile } from "obsidian";
import type PastoralVisitPlugin from "./main";
import { NOTE_TYPE } from "./constants";
import { MemberEntry, VisitEntry, MemberFrontmatter, VisitFrontmatter } from "./types";
import { nfc, parseWikilinkTarget } from "./utils";

/**
 * 성도·심방일지 인덱스 — metadataCache 기반 메모리 캐시.
 * 별도 DB 없음: 노트가 단일 진실이고, 이 클래스는 조회를 빠르게 할 뿐이다.
 */
export class MemberIndex {
  private plugin: PastoralVisitPlugin;
  /** key: TFile.path */
  members = new Map<string, MemberEntry>();
  visits = new Map<string, VisitEntry>();
  private changeListeners = new Set<() => void>();
  private initialized = false;

  constructor(plugin: PastoralVisitPlugin) {
    this.plugin = plugin;
  }

  /** onload에서 호출 — 레이아웃 준비 후 전수 스캔 + 이벤트 구독 */
  start(): void {
    const app = this.plugin.app;

    app.workspace.onLayoutReady(() => this.fullScan());
    // metadataCache가 늦게 완성되는 경우 커버 (한 번만)
    const resolvedRef = app.metadataCache.on("resolved", () => {
      if (!this.initialized) this.fullScan();
      app.metadataCache.offref(resolvedRef);
    });
    this.plugin.registerEvent(resolvedRef);

    this.plugin.registerEvent(
      app.metadataCache.on("changed", (file) => {
        if (!(file instanceof TFile)) return;
        if (!this.isInScope(file.path)) return;
        this.updateFile(file);
        this.notifyChange();
      }),
    );
    this.plugin.registerEvent(
      app.vault.on("rename", (file, oldPath) => {
        if (!(file instanceof TFile)) return;
        const wasTracked = this.members.delete(oldPath) || this.visits.delete(oldPath);
        if (this.isInScope(file.path)) this.updateFile(file);
        if (wasTracked || this.isInScope(file.path)) this.notifyChange();
      }),
    );
    this.plugin.registerEvent(
      app.vault.on("delete", (file) => {
        const removed = this.members.delete(file.path) || this.visits.delete(file.path);
        if (removed) this.notifyChange();
      }),
    );
  }

  /** 설정 변경 등으로 전체 재스캔이 필요할 때 */
  requestFullScan(): void {
    this.fullScan();
  }

  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  // ── 조회 API ──

  membersList(): MemberEntry[] {
    return Array.from(this.members.values());
  }

  visitsList(): VisitEntry[] {
    return Array.from(this.visits.values());
  }

  /** 특정 성도의 심방일지 목록 (날짜 오름차순) */
  visitsOf(memberPath: string): VisitEntry[] {
    return this.visitsList()
      .filter((v) => v.memberPath === memberPath)
      .sort((a, b) => String(a.fm.날짜 ?? "").localeCompare(String(b.fm.날짜 ?? "")));
  }

  /** 특정 성도의 마지막 심방 날짜 (없으면 null) */
  lastVisitDateOf(memberPath: string): string | null {
    const visits = this.visitsOf(memberPath);
    if (visits.length === 0) return null;
    const last = visits[visits.length - 1];
    return typeof last.fm.날짜 === "string" ? last.fm.날짜 : null;
  }

  /** 반영되지 않은 심방일지 */
  unsyncedVisits(): VisitEntry[] {
    return this.visitsList().filter((v) => !v.fm.반영);
  }

  /** 프론트매터 필드의 실사용 값 수집 (드롭다운 선택지 — 분류 오염 방지) */
  distinctMemberValues(field: string): string[] {
    const values = new Set<string>();
    for (const m of this.members.values()) {
      const v = m.fm[field];
      if (typeof v === "string" && v.trim()) values.add(v.trim());
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b, "ko"));
  }

  /** 최근 사용 장소 상위 N개 (서제스트용) */
  recentPlaces(limit = 5): string[] {
    const sorted = this.visitsList().sort((a, b) =>
      String(b.fm.날짜 ?? "").localeCompare(String(a.fm.날짜 ?? "")),
    );
    const places: string[] = [];
    for (const v of sorted) {
      const place = typeof v.fm.장소 === "string" ? v.fm.장소.trim() : "";
      if (place && !places.includes(place)) places.push(place);
      if (places.length >= limit) break;
    }
    return places;
  }

  // ── 내부 ──

  private isInScope(path: string): boolean {
    const s = this.plugin.settings;
    return (
      path.startsWith(nfc(s.memberFolder) + "/") || path.startsWith(nfc(s.visitFolder) + "/")
    );
  }

  private fullScan(): void {
    this.members.clear();
    this.visits.clear();
    for (const file of this.plugin.app.vault.getMarkdownFiles()) {
      if (this.isInScope(nfc(file.path))) this.updateFile(file);
    }
    this.initialized = true;
    this.notifyChange();
  }

  private updateFile(file: TFile): void {
    const fm = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
    this.members.delete(file.path);
    this.visits.delete(file.path);
    if (!fm) return;

    if (fm.type === NOTE_TYPE.member) {
      this.members.set(file.path, {
        path: file.path,
        name: nfc(file.basename),
        fm: fm as MemberFrontmatter,
      });
    } else if (fm.type === NOTE_TYPE.visit) {
      this.visits.set(file.path, {
        path: file.path,
        basename: nfc(file.basename),
        fm: fm as VisitFrontmatter,
        memberPath: this.resolveMemberPath(fm as VisitFrontmatter, file),
      });
    }
  }

  /** 일지의 `성도` wikilink → 성도 노트 경로 해석 */
  private resolveMemberPath(fm: VisitFrontmatter, visitFile: TFile): string | null {
    const linkpath = parseWikilinkTarget(fm.성도);
    if (!linkpath) return null;
    const dest = this.plugin.app.metadataCache.getFirstLinkpathDest(linkpath, visitFile.path);
    return dest ? dest.path : null;
  }

  private notifyChange(): void {
    for (const listener of this.changeListeners) listener();
  }
}
