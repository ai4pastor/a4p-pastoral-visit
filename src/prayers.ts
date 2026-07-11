import { Notice, TFile } from "obsidian";
import type PastoralVisitPlugin from "./main";
import { parsePrayers, togglePrayerLine } from "./prayers-core";
import { PrayerItem } from "./types";

interface CacheEntry {
  mtime: number;
  items: PrayerItem[];
}

/** 기도제목 스캐너 — ActionScanner와 동일한 mtime 캐시 패턴 */
export class PrayerScanner {
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

  /** 전체 일지의 기도제목 수집 (최근 심방 순) */
  async scanAll(): Promise<PrayerItem[]> {
    const results: PrayerItem[] = [];
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
      const items: PrayerItem[] = parsePrayers(
        content,
        this.plugin.settings.headings.prayer,
      ).map((p) => ({
        visitPath: visit.path,
        visitBasename: visit.basename,
        memberName,
        visitDate,
        line: p.line,
        raw: p.raw,
        text: p.text,
        group: p.group,
        answered: p.answered,
        answeredDate: p.answeredDate,
      }));
      this.cache.set(visit.path, { mtime: file.stat.mtime, items });
      results.push(...items);
    }
    return results.sort((a, b) => b.visitDate.localeCompare(a.visitDate));
  }

  /**
   * 응답 표시 토글 — 라인 끝 `✅ 날짜` 마커 추가/제거.
   * 사용자의 명시적 클릭이 승인이므로 확인 모달 없이 실행 (단일 라인, 비파괴 원칙 내 예외).
   */
  async toggle(item: PrayerItem): Promise<boolean> {
    const file = this.plugin.app.vault.getAbstractFileByPath(item.visitPath);
    if (!(file instanceof TFile)) {
      new Notice("일지 파일을 찾을 수 없습니다.");
      return false;
    }
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    let stale = false;
    await this.plugin.app.vault.process(file, (content) => {
      const result = togglePrayerLine(content, item.line, item.raw, today);
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
