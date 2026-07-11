import { Notice, TFile } from "obsidian";
import type PastoralVisitPlugin from "./main";
import { HEADING_LABELS, HeadingConfig, NOTE_TYPE } from "./constants";
import { nfc } from "./utils";

/** 분석에 실제로 쓰이는 헤딩만 감시 (기본정보·심방정보 등 정보성 섹션은 제외) */
const WATCHED_KEYS: Array<keyof HeadingConfig> = ["conversation", "prayer", "followUp"];

/**
 * 심방일지의 표준 헤딩이 사라지면 경고 Notice.
 * - 성도 노트의 섹션 임베드는 헤딩 텍스트가 주소이므로, 헤딩이 바뀌면 임베드가 깨진다.
 * - 편집 중 스팸 방지: 파일별로 "새로 사라진 헤딩"에만 1회 경고하고,
 *   복구되면 추적을 초기화해 다시 사라질 때 재경고한다.
 */
export class HeadingWatcher {
  private plugin: PastoralVisitPlugin;
  /** path → 마지막으로 경고한 누락 헤딩 집합 */
  private warned = new Map<string, Set<string>>();

  constructor(plugin: PastoralVisitPlugin) {
    this.plugin = plugin;
  }

  start(): void {
    this.plugin.registerEvent(
      this.plugin.app.metadataCache.on("changed", (file) => {
        if (file instanceof TFile) this.check(file);
      }),
    );
    this.plugin.registerEvent(
      this.plugin.app.vault.on("delete", (file) => this.warned.delete(file.path)),
    );
    this.plugin.registerEvent(
      this.plugin.app.vault.on("rename", (_file, oldPath) => this.warned.delete(oldPath)),
    );
  }

  private check(file: TFile): void {
    if (!this.plugin.settings.warnHeadingChanges) return;

    const cache = this.plugin.app.metadataCache.getFileCache(file);
    if (cache?.frontmatter?.type !== NOTE_TYPE.visit) return;

    const present = new Set(
      (cache.headings ?? [])
        .filter((h) => h.level === 2)
        .map((h) => nfc(h.heading.trim())),
    );

    const h = this.plugin.settings.headings;
    const missing = new Set<string>();
    for (const key of WATCHED_KEYS) {
      const anchor = nfc(h[key].replace(/^##\s*/, "").trim());
      if (!present.has(anchor)) missing.add(anchor);
    }

    const prev = this.warned.get(file.path) ?? new Set<string>();
    const newlyMissing = Array.from(missing).filter((m) => !prev.has(m));

    if (newlyMissing.length > 0) {
      const labels = WATCHED_KEYS.filter((key) =>
        newlyMissing.includes(nfc(h[key].replace(/^##\s*/, "").trim())),
      ).map((key) => `"${h[key]}"(${HEADING_LABELS[key].replace(/ \(.+\)$/, "")})`);
      new Notice(
        `⚠ ${file.basename}: 표준 헤딩 ${labels.join(", ")}이(가) 없습니다.\n성도 노트의 임베드와 요약·후속조치 분석이 이 섹션을 찾지 못합니다. 헤딩을 되돌리거나, 설정 → 분석 헤딩에서 이름을 맞춰 주세요.`,
        10000,
      );
    }

    if (missing.size === 0) this.warned.delete(file.path);
    else this.warned.set(file.path, missing);
  }
}
