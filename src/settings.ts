import { App, PluginSettingTab, Setting, TFolder } from "obsidian";
import type PastoralVisitPlugin from "./main";
import { NOTE_TYPE } from "./constants";
import { copyGitignoreSuggestion, runPrivacyCheck } from "./privacy-check";
import { FolderSuggest } from "./folder-suggest";

export interface PastoralVisitSettings {
  /** 성도 노트 폴더 (교인노트 스캔 대상) */
  memberFolder: string;
  /** 심방일지 폴더 */
  visitFolder: string;
  /** 장기 미심방 기준 (개월) */
  staleVisitMonths: number;
  /** 새등록 성도 기준 (일) */
  newMemberDays: number;
  /** 생일 알림 범위 (일) */
  birthdayWindowDays: number;
  /** 민감정보 화면 마스킹 */
  maskSensitiveFields: boolean;
  /** 심방유형 목록 */
  visitTypes: string[];
  /** 일지 생성 시 world/route 분류 자동 삽입 */
  insertWordClassification: boolean;
  /** 기록 최소화 온보딩 Notice 표시 여부 */
  onboardingShown: boolean;
}

export const DEFAULT_SETTINGS: PastoralVisitSettings = {
  memberFolder: "400. Education & Ministry/460. 성도",
  visitFolder: "400. Education & Ministry/460. 성도/심방일지",
  staleVisitMonths: 6,
  newMemberDays: 90,
  birthdayWindowDays: 14,
  maskSensitiveFields: true,
  visitTypes: ["정기심방", "특별심방", "위로심방"],
  insertWordClassification: true,
  onboardingShown: false,
};

export class PastoralVisitSettingTab extends PluginSettingTab {
  plugin: PastoralVisitPlugin;

  constructor(app: App, plugin: PastoralVisitPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ── ① 폴더 경로 ──
    new Setting(containerEl).setName("폴더 경로").setHeading();

    let statusEl: HTMLElement;

    new Setting(containerEl)
      .setName("성도 노트 폴더")
      .setDesc("볼트 루트 기준. 이 폴더의 교인노트(type: 교인노트)를 관리합니다. 클릭하면 폴더 목록이 뜹니다.")
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_SETTINGS.memberFolder)
          .setValue(this.plugin.settings.memberFolder)
          .onChange(async (value) => {
            this.plugin.settings.memberFolder = value.trim();
            await this.plugin.persist();
            this.plugin.index?.requestFullScan();
          });
        new FolderSuggest(this.app, text.inputEl);
      });

    new Setting(containerEl)
      .setName("심방일지 폴더")
      .setDesc("심방일지가 생성·스캔되는 폴더입니다. 클릭하면 폴더 목록이 뜹니다.")
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_SETTINGS.visitFolder)
          .setValue(this.plugin.settings.visitFolder)
          .onChange(async (value) => {
            this.plugin.settings.visitFolder = value.trim();
            await this.plugin.persist();
            this.plugin.index?.requestFullScan();
          });
        new FolderSuggest(this.app, text.inputEl);
      })
      .addButton((btn) =>
        btn
          .setButtonText("검증")
          .setCta()
          .onClick(() => {
            this.renderValidation(statusEl, this.validateFolders());
          }),
      );

    statusEl = containerEl.createDiv({ cls: "a4p-pv-settings-status" });

    // ── ② 대시보드 기준값 ──
    new Setting(containerEl).setName("대시보드 기준값").setHeading();

    new Setting(containerEl)
      .setName("장기 미심방 기준 (개월)")
      .setDesc("마지막 심방이 이 기간을 넘긴 성도를 대시보드에 표시합니다.")
      .addText((text) =>
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.staleVisitMonths))
          .setValue(String(this.plugin.settings.staleVisitMonths))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (Number.isFinite(n) && n > 0) {
              this.plugin.settings.staleVisitMonths = n;
              await this.plugin.persist();
            }
          }),
      );

    new Setting(containerEl)
      .setName("새등록 성도 기준 (일)")
      .setDesc("등록일이 이 기간 이내이면서 심방 기록이 없는 성도를 표시합니다.")
      .addText((text) =>
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.newMemberDays))
          .setValue(String(this.plugin.settings.newMemberDays))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (Number.isFinite(n) && n > 0) {
              this.plugin.settings.newMemberDays = n;
              await this.plugin.persist();
            }
          }),
      );

    new Setting(containerEl)
      .setName("생일 알림 범위 (일)")
      .setDesc("이 기간 안에 생일이 있는 성도를 대시보드에 표시합니다.")
      .addText((text) =>
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.birthdayWindowDays))
          .setValue(String(this.plugin.settings.birthdayWindowDays))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (Number.isFinite(n) && n > 0) {
              this.plugin.settings.birthdayWindowDays = n;
              await this.plugin.persist();
            }
          }),
      );

    // ── ③ 개인정보 ──
    new Setting(containerEl).setName("개인정보").setHeading();

    new Setting(containerEl)
      .setName("민감정보 화면 마스킹")
      .setDesc(
        "패널·모달에서 연락처와 생년월일을 가립니다 (010-****-1234). 파일 내용은 변경하지 않습니다. 화면 공유·프로젝션 시 노출 사고를 막아줍니다.",
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.maskSensitiveFields).onChange(async (value) => {
          this.plugin.settings.maskSensitiveFields = value;
          await this.plugin.persist();
        }),
      );

    this.renderPrivacyCheck(containerEl);

    // ── ④ 고급 ──
    new Setting(containerEl).setName("고급").setHeading();

    new Setting(containerEl)
      .setName("심방유형 목록")
      .setDesc("쉼표로 구분합니다. 심방일지 작성 모달의 선택지가 됩니다.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.visitTypes.join(", "))
          .setValue(this.plugin.settings.visitTypes.join(", "))
          .onChange(async (value) => {
            const types = value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            if (types.length > 0) {
              this.plugin.settings.visitTypes = types;
              await this.plugin.persist();
            }
          }),
      );

    new Setting(containerEl)
      .setName("WORD 분류 자동 삽입")
      .setDesc(
        "노트 생성 시 world/route 프론트매터(📩 208 상담 & 목양 / 📝기록)를 자동으로 넣습니다. WORD 분류 체계를 쓰지 않는 볼트라면 끄세요.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.insertWordClassification)
          .onChange(async (value) => {
            this.plugin.settings.insertWordClassification = value;
            await this.plugin.persist();
          }),
      );
  }

  /** 폴더 존재 + type별 노트 수 검증 */
  private validateFolders(): { ok: boolean; messages: string[] } {
    const messages: string[] = [];
    let ok = true;

    const checks: Array<{ label: string; path: string; type: string }> = [
      { label: "성도 노트 폴더", path: this.plugin.settings.memberFolder, type: NOTE_TYPE.member },
      { label: "심방일지 폴더", path: this.plugin.settings.visitFolder, type: NOTE_TYPE.visit },
    ];

    for (const check of checks) {
      const folder = this.app.vault.getAbstractFileByPath(check.path);
      if (!(folder instanceof TFolder)) {
        messages.push(`✗ ${check.label}: 폴더를 찾을 수 없습니다 — ${check.path || "(비어 있음)"}`);
        ok = false;
        continue;
      }
      let count = 0;
      const prefix = check.path + "/";
      for (const file of this.app.vault.getMarkdownFiles()) {
        if (file.path !== check.path && !file.path.startsWith(prefix)) continue;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (fm?.type === check.type) count++;
      }
      messages.push(`✓ ${check.label}: ${check.type} ${count}건`);
      if (count === 0) {
        messages.push(`  ⚠ ${check.type}(type: ${check.type})가 한 건도 없습니다. 경로를 확인하세요.`);
      }
    }

    return { ok, messages };
  }

  private renderValidation(el: HTMLElement, result: { ok: boolean; messages: string[] }): void {
    el.empty();
    for (const message of result.messages) {
      el.createEl("p", { text: message, cls: "a4p-pv-settings-status-line" });
    }
    if (result.ok) {
      el.createEl("p", {
        text: "모든 점검을 통과했습니다. 바로 사용할 수 있습니다.",
        cls: "a4p-pv-settings-status-line",
      });
    }
  }

  /** 동기화·git 노출 점검 — 경고만, 자동 수정 없음 */
  private renderPrivacyCheck(containerEl: HTMLElement): void {
    let resultEl: HTMLElement;

    new Setting(containerEl)
      .setName("동기화·git 노출 점검")
      .setDesc(
        "성도 폴더가 git 추적이나 클라우드 동기화 대상인지 검사합니다. 검사만 하고 아무것도 자동으로 바꾸지 않습니다.",
      )
      .addButton((btn) =>
        btn.setButtonText("점검").onClick(async () => {
          btn.setDisabled(true);
          const result = await runPrivacyCheck(this.plugin);
          btn.setDisabled(false);
          resultEl.empty();
          for (const message of result.messages) {
            resultEl.createEl("p", { text: message, cls: "a4p-pv-settings-status-line" });
          }
          if (result.gitignoreSuggestion) {
            const copyBtn = resultEl.createEl("button", {
              text: `.gitignore 제안 문구 복사: ${result.gitignoreSuggestion}`,
            });
            copyBtn.addEventListener("click", () =>
              void copyGitignoreSuggestion(result.gitignoreSuggestion!),
            );
          }
        }),
      );

    resultEl = containerEl.createDiv({ cls: "a4p-pv-settings-status" });
  }
}
