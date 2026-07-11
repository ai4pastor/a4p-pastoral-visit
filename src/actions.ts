import { Notice, TFile } from "obsidian";
import type PastoralVisitPlugin from "./main";
import { parseFollowUps, toggleFollowUpLine } from "./actions-core";
import { ActionItem } from "./types";
import { daysSince } from "./utils";

interface CacheEntry {
  mtime: number;
  items: ActionItem[];
}

/** 후속조치 스캐너 — 파일별 mtime 캐시 + metadataCache 이벤트 무효화 */
export class ActionScanner {
  private plugin: PastoralVisitPlugin;
  private cache = new Map<string, CacheEntry>();

  constructor(plugin: PastoralVisitPlugin) {
    this.plugin = plugin;
  }

  start(): void {
    this.plugin.registerEvent(
      this.plugin.app.metadataCache.on("changed", (file) => {
        this.cache.delete(file.path);
      }),
    );
    this.plugin.registerEvent(
      this.plugin.app.vault.on("delete", (file) => this.cache.delete(file.path)),
    );
    this.plugin.registerEvent(
      this.plugin.app.vault.on("rename", (_file, oldPath) => this.cache.delete(oldPath)),
    );
  }

  /** 전체 일지의 후속조치 수집 (미완만 필터링은 호출부에서) */
  async scanAll(): Promise<ActionItem[]> {
    const today = new Date();
    const results: ActionItem[] = [];
    for (const visit of this.plugin.index.visitsList()) {
      const file = this.plugin.app.vault.getAbstractFileByPath(visit.path);
      if (!(file instanceof TFile)) continue;

      const cached = this.cache.get(visit.path);
      if (cached && cached.mtime === file.stat.mtime) {
        results.push(...cached.items);
        continue;
      }

      const content = await this.plugin.app.vault.cachedRead(file);
      const visitDate = typeof visit.fm.날짜 === "string" ? visit.fm.날짜 : "";
      const memberName = visit.memberPath
        ? this.plugin.index.members.get(visit.memberPath)?.name ?? ""
        : "";
      const items: ActionItem[] = parseFollowUps(content, this.plugin.settings.headings.followUp).map((p) => ({
        visitPath: visit.path,
        visitBasename: visit.basename,
        memberName,
        visitDate,
        line: p.line,
        raw: p.raw,
        text: p.text,
        checked: p.checked,
        daysElapsed: visitDate ? daysSince(visitDate, today) ?? 0 : 0,
      }));
      this.cache.set(visit.path, { mtime: file.stat.mtime, items });
      results.push(...items);
    }
    return results;
  }

  /** 미완 후속조치 (일지 날짜 오래된 순) */
  async pending(): Promise<ActionItem[]> {
    const all = await this.scanAll();
    return all
      .filter((a) => !a.checked)
      .sort((a, b) => a.visitDate.localeCompare(b.visitDate));
  }

  /**
   * 체크 토글 — 라인 원문 일치 검증 후 해당 라인만 변경.
   * 사용자의 명시적 클릭이 승인이므로 확인 모달 없이 실행 (단일 라인, 비파괴 원칙 내 예외).
   */
  async toggle(item: ActionItem): Promise<boolean> {
    const file = this.plugin.app.vault.getAbstractFileByPath(item.visitPath);
    if (!(file instanceof TFile)) {
      new Notice("일지 파일을 찾을 수 없습니다.");
      return false;
    }
    let stale = false;
    await this.plugin.app.vault.process(file, (content) => {
      const result = toggleFollowUpLine(content, item.line, item.raw);
      stale = result.stale;
      return result.newContent;
    });
    this.cache.delete(item.visitPath);
    if (stale) {
      new Notice("일지가 수정되어 있어 변경하지 않았습니다. 목록을 새로고침합니다.");
      return false;
    }
    return true;
  }
}
