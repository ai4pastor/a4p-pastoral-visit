import { Modal, Setting } from "obsidian";
import type PastoralVisitPlugin from "../main";
import { VISIT_STATUS } from "../constants";
import { planSync } from "../sync-core";
import { SyncContext, executeSync } from "../sync";
import { callout, renderDiff } from "../ui";

/**
 * 반영 미리보기 모달 — 성도 노트에 추가될 내용을 승인 전에 보여준다 (dry-run 원칙).
 */
export class SyncModal extends Modal {
  private plugin: PastoralVisitPlugin;
  private ctx: SyncContext;
  private summary: string;
  private updateStatus = true;
  private previewEl!: HTMLElement;

  constructor(plugin: PastoralVisitPlugin, ctx: SyncContext) {
    super(plugin.app);
    this.plugin = plugin;
    this.ctx = ctx;
    this.summary = ctx.suggestedSummary;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("a4p-pv-modal");
    this.titleEl.setText(`성도 노트에 반영 — ${this.ctx.memberName}`);

    // ── 요약 편집 ──
    new Setting(contentEl)
      .setName("요약 한 줄")
      .setDesc("심방 기록 목록에 표시됩니다. 자동 제안을 자유롭게 고치세요.")
      .addText((text) => {
        text.setValue(this.summary).onChange((v) => {
          this.summary = v.trim() || this.ctx.suggestedSummary;
          this.renderPreview();
        });
        text.inputEl.addClass("a4p-pv-summary-input");
      });

    // ── 미리보기 ──
    this.previewEl = contentEl.createDiv({ cls: "a4p-pv-sync-preview" });

    // ── 심방상태 갱신 ──
    new Setting(contentEl)
      .setName(`심방상태: ${this.ctx.currentStatus || "(없음)"} → ${VISIT_STATUS.done}`)
      .setDesc("성도 노트의 심방상태를 완료로 바꿉니다.")
      .addToggle((toggle) =>
        toggle.setValue(this.updateStatus).onChange((v) => (this.updateStatus = v)),
      );

    // ── 버튼 ──
    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("반영")
          .setCta()
          .onClick(() => void this.submit()),
      )
      .addButton((btn) => btn.setButtonText("취소").onClick(() => this.close()));

    void this.renderPreview();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async renderPreview(): Promise<void> {
    const el = this.previewEl;
    el.empty();

    // 실제 반영과 동일한 planSync로 미리보기 생성 (경고 포함)
    const memberContent = await this.app.vault.cachedRead(this.ctx.memberFile);
    const plan = planSync(
      memberContent,
      this.ctx.visitBasename,
      this.ctx.날짜,
      this.ctx.심방유형,
      this.summary,
      this.plugin.settings.headings,
      this.ctx.anchors,
    );

    if (plan.insertions.length > 0) {
      el.createEl("p", { text: "성도 노트에 추가될 내용:", cls: "a4p-pv-preview-label" });
      renderDiff(
        el,
        this.ctx.memberFile.name,
        plan.insertions.map((ins) => ({
          context: ins.sectionCreated ? `${ins.heading} (새 섹션)` : ins.heading,
          lines: ins.lines,
        })),
        `${plan.insertions.length}곳에 추가`,
      );
    }

    for (const warning of plan.warnings) {
      callout(el, "warn", warning);
    }
    if (plan.nothingToDo) {
      callout(el, "info", "본문은 이미 반영돼 있습니다. [반영]을 누르면 상태만 갱신합니다.");
    }
  }

  private async submit(): Promise<void> {
    const ok = await executeSync(this.plugin, this.ctx, this.summary, this.updateStatus);
    if (ok) this.close();
  }
}
