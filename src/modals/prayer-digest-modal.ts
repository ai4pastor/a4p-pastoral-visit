import { Modal, Setting } from "obsidian";
import type PastoralVisitPlugin from "../main";
import { DigestPlan, createPrayerDigest, planPrayerDigest } from "../prayer-digest";

/**
 * 주간 기도제목 모음 — 미리보기 후 승인 생성 (dry-run 원칙).
 */
export class PrayerDigestModal extends Modal {
  private plugin: PastoralVisitPlugin;
  private weeks: number;
  private includeAnswered = false;
  private previewEl!: HTMLElement;
  private plan: DigestPlan | null = null;

  constructor(plugin: PastoralVisitPlugin) {
    super(plugin.app);
    this.plugin = plugin;
    this.weeks = plugin.settings.prayerDigestWeeks;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("a4p-pv-modal");
    this.titleEl.setText("주간 기도제목 모음 생성");

    new Setting(contentEl)
      .setName("수집 범위 (주)")
      .setDesc("최근 N주 사이의 심방일지에서 기도제목을 모읍니다.")
      .addText((text) =>
        text.setValue(String(this.weeks)).onChange((v) => {
          const n = parseInt(v, 10);
          if (Number.isFinite(n) && n > 0 && n <= 52) {
            this.weeks = n;
            void this.refreshPreview();
          }
        }),
      );

    new Setting(contentEl)
      .setName("응답 표시 항목 포함")
      .setDesc("✅ 표시된 기도제목도 감사 제목으로 함께 실습니다.")
      .addToggle((toggle) =>
        toggle.setValue(this.includeAnswered).onChange((v) => {
          this.includeAnswered = v;
          void this.refreshPreview();
        }),
      );

    this.previewEl = contentEl.createDiv({ cls: "a4p-pv-sync-preview" });

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("생성")
          .setCta()
          .onClick(() => void this.submit()),
      )
      .addButton((btn) => btn.setButtonText("취소").onClick(() => this.close()));

    void this.refreshPreview();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async refreshPreview(): Promise<void> {
    this.plan = await planPrayerDigest(this.plugin, {
      weeks: this.weeks,
      includeAnswered: this.includeAnswered,
    });
    const el = this.previewEl;
    el.empty();
    el.createEl("p", {
      text: `생성 위치: ${this.plan.folder}/${this.plan.fileName}.md · ${this.plan.rangeLabel} · 진행 중 ${this.plan.activeCount}건${this.includeAnswered ? ` / 전체 ${this.plan.totalCount}건` : ""}`,
      cls: "a4p-pv-preview-label",
    });
    if (this.plan.totalCount === 0) {
      el.createEl("p", {
        text: "⚠ 수집된 기도제목이 없습니다. 범위를 늘려 보세요.",
        cls: "a4p-pv-preview-warn",
      });
    }
    const box = el.createEl("pre", { cls: "a4p-pv-preview-box a4p-pv-preview-scroll" });
    // 프론트매터 제외한 본문만 미리보기
    box.setText(this.plan.content.replace(/^---[\s\S]*?---\n+/, ""));
  }

  private async submit(): Promise<void> {
    if (!this.plan) return;
    if (this.weeks !== this.plugin.settings.prayerDigestWeeks) {
      this.plugin.settings.prayerDigestWeeks = this.weeks;
      await this.plugin.persist();
    }
    const file = await createPrayerDigest(this.plugin, this.plan);
    if (file) this.close();
  }
}
