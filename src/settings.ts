import { App, PluginSettingTab, Setting, TFolder } from "obsidian";
import type PastoralVisitPlugin from "./main";
import {
  DEFAULT_HEADINGS,
  HEADING_LABELS,
  HeadingConfig,
  NOTE_TYPE,
  embedAnchorsOf,
} from "./constants";
import { looseHeadingText, nfc } from "./utils";
import { copyGitignoreSuggestion, runPrivacyCheck } from "./privacy-check";
import { FileSuggest, FolderSuggest } from "./folder-suggest";
import { WordValues, parseWordValues } from "./word-config";

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
  /** WORD 분류법 템플릿/체계 노트 경로 (분석 대상) */
  wordTemplatePath: string;
  /** 노트 생성 시 넣을 world 값 (예: "[[📩 208 상담 & 목양]]") */
  wordWorldValue: string;
  /** 노트 생성 시 넣을 route 값 (예: "[[📝기록]]") */
  wordRouteValue: string;
  /** 기록 최소화 온보딩 Notice 표시 여부 */
  onboardingShown: boolean;
  /** 주간 기도제목 모음 저장 폴더 */
  prayerDigestFolder: string;
  /** 기도 모음 기본 수집 범위 (주) */
  prayerDigestWeeks: number;
  /** 분석·생성에 쓰는 헤딩 구성 (커스터마이즈 가능) */
  headings: HeadingConfig;
  /** 헤딩 변경 감지 경고 */
  warnHeadingChanges: boolean;
  /** 대시보드에서 접어둔 카드 키 목록 (개인화) */
  collapsedCards: string[];
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
  wordTemplatePath: "900. Settings/901. Templates/Template-WORD-분류법.md",
  wordWorldValue: "[[📩 208 상담 & 목양]]",
  wordRouteValue: "[[📝기록]]",
  onboardingShown: false,
  prayerDigestFolder: "400. Education & Ministry/460. 성도/기도모음",
  prayerDigestWeeks: 4,
  headings: { ...DEFAULT_HEADINGS },
  warnHeadingChanges: true,
  collapsedCards: [],
};

export class PastoralVisitSettingTab extends PluginSettingTab {
  plugin: PastoralVisitPlugin;
  private wordParsed: WordValues | null = null;
  private wordStatusEl!: HTMLElement;
  private wordChoicesEl!: HTMLElement;

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

    new Setting(containerEl)
      .setName("기도 모음 폴더")
      .setDesc("주간 기도제목 모음 노트가 생성되는 폴더입니다. 클릭하면 폴더 목록이 뜹니다.")
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_SETTINGS.prayerDigestFolder)
          .setValue(this.plugin.settings.prayerDigestFolder)
          .onChange(async (value) => {
            this.plugin.settings.prayerDigestFolder = value.trim();
            await this.plugin.persist();
          });
        new FolderSuggest(this.app, text.inputEl);
      });

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

    // ── ④ WORD 분류 ──
    this.renderWordSettings(containerEl);

    // ── ⑤ 분석 헤딩 ──
    this.renderHeadingSettings(containerEl);

    // ── ⑤ 고급 ──
    new Setting(containerEl).setName("고급").setHeading();

    new Setting(containerEl)
      .setName("헤딩 변경 감지 경고")
      .setDesc("심방일지에서 표준 헤딩이 사라지면 알림을 띄웁니다 (임베드·분석이 깨지는 것을 예방).")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.warnHeadingChanges).onChange(async (value) => {
          this.plugin.settings.warnHeadingChanges = value;
          await this.plugin.persist();
        }),
      );

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

  }

  /**
   * WORD 분류 설정 — 분류법 템플릿을 분석해 world/route 유효 값을 추출하고 선택.
   * 수강생마다 번호·순서가 다르므로 하드코딩하지 않고 각자의 템플릿에서 읽는다.
   */
  private renderWordSettings(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("WORD 분류").setHeading();

    new Setting(containerEl)
      .setName("WORD 분류 자동 삽입")
      .setDesc("노트 생성 시 world/route 프론트매터를 자동으로 넣습니다. WORD 분류 체계를 쓰지 않는 볼트라면 끄세요.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.insertWordClassification)
          .onChange(async (value) => {
            this.plugin.settings.insertWordClassification = value;
            await this.plugin.persist();
          }),
      );

    new Setting(containerEl)
      .setName("WORD 분류법 템플릿 경로")
      .setDesc(
        "본인 볼트의 WORD 분류법 템플릿(또는 분류 체계 노트) 경로입니다. 클릭하면 파일 목록이 뜹니다. '분석'을 누르면 이 노트에서 world(📩)·route(📝) 유효 값을 읽어 아래 선택지로 제공합니다 — 분류법에 정의된 값만 사용하기 위함입니다.",
      )
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_SETTINGS.wordTemplatePath)
          .setValue(this.plugin.settings.wordTemplatePath)
          .onChange(async (value) => {
            this.plugin.settings.wordTemplatePath = value.trim();
            await this.plugin.persist();
          });
        new FileSuggest(this.app, text.inputEl);
      })
      .addButton((btn) =>
        btn
          .setButtonText("분석")
          .setCta()
          .onClick(() => void this.analyzeWordTemplate()),
      );

    this.wordStatusEl = containerEl.createDiv({ cls: "a4p-pv-settings-status" });
    this.wordChoicesEl = containerEl.createDiv();
    this.renderWordChoices();
  }

  /** 템플릿 분석 → 선택지 갱신 */
  private async analyzeWordTemplate(): Promise<void> {
    this.wordStatusEl.empty();
    const path = this.plugin.settings.wordTemplatePath;
    const file = this.app.vault.getFileByPath(path);
    if (!file) {
      this.wordStatusEl.createEl("p", {
        text: `✗ 노트를 찾을 수 없습니다 — ${path || "(비어 있음)"}`,
        cls: "a4p-pv-settings-status-line",
      });
      return;
    }
    const content = await this.app.vault.cachedRead(file);
    this.wordParsed = parseWordValues(content);

    const lines = [
      `✓ 분석 완료: world ${this.wordParsed.world.length}개 · route ${this.wordParsed.route.length}개 발견`,
    ];
    if (this.wordParsed.world.length === 0) {
      lines.push("⚠ world 값(📩)을 찾지 못했습니다. 분류법 노트가 맞는지 확인하세요.");
    }
    if (this.wordParsed.route.length === 0) {
      lines.push("⚠ route 값(📝)을 찾지 못했습니다. 현재 값을 그대로 사용합니다.");
    }
    for (const line of lines) {
      this.wordStatusEl.createEl("p", { text: line, cls: "a4p-pv-settings-status-line" });
    }
    this.renderWordChoices();
  }

  /** world/route 선택 드롭다운 — 분석 결과 + 현재 값 병합 */
  private renderWordChoices(): void {
    const el = this.wordChoicesEl;
    el.empty();

    const worldOptions = this.mergeOptions(
      this.wordParsed?.world ?? [],
      this.plugin.settings.wordWorldValue,
    );
    const routeOptions = this.mergeOptions(
      this.wordParsed?.route ?? [],
      this.plugin.settings.wordRouteValue,
    );

    new Setting(el)
      .setName("world 값")
      .setDesc("심방 노트에 들어갈 world 분류입니다. 분석 후 목록에서 고르세요.")
      .addDropdown((drop) => {
        for (const opt of worldOptions) drop.addOption(opt, opt.replace(/^\[\[|\]\]$/g, ""));
        drop.setValue(this.plugin.settings.wordWorldValue).onChange(async (value) => {
          this.plugin.settings.wordWorldValue = value;
          await this.plugin.persist();
        });
      });

    new Setting(el)
      .setName("route 값")
      .setDesc("보통 기록 단계(📝기록)를 사용합니다.")
      .addDropdown((drop) => {
        for (const opt of routeOptions) drop.addOption(opt, opt.replace(/^\[\[|\]\]$/g, ""));
        drop.setValue(this.plugin.settings.wordRouteValue).onChange(async (value) => {
          this.plugin.settings.wordRouteValue = value;
          await this.plugin.persist();
        });
      });
  }

  /** 분석된 선택지에 현재 저장값을 포함시켜 선택 상태가 유지되게 */
  private mergeOptions(parsed: string[], current: string): string[] {
    return parsed.includes(current) ? parsed : [current, ...parsed];
  }

  /** 분석 헤딩 커스터마이즈 + 검증 */
  private renderHeadingSettings(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName("분석 헤딩")
      .setDesc(
        "플러그인이 요약 추출·후속조치 수집·임베드·반영에 사용하는 헤딩입니다. 교회에서 쓰는 이름이 다르면 여기서 바꾸세요. 반드시 '## '로 시작해야 합니다. ⚠ 헤딩을 바꾸면 새로 만드는 노트부터 적용되며, 기존 노트의 임베드는 옛 헤딩을 그대로 사용합니다.",
      )
      .setHeading();

    const keys = Object.keys(DEFAULT_HEADINGS) as Array<keyof HeadingConfig>;
    for (const key of keys) {
      new Setting(containerEl)
        .setName(HEADING_LABELS[key])
        .addText((text) => {
          text
            .setPlaceholder(DEFAULT_HEADINGS[key])
            .setValue(this.plugin.settings.headings[key])
            .onChange(async (value) => {
              this.plugin.settings.headings[key] = value.trim() || DEFAULT_HEADINGS[key];
              await this.plugin.persist();
            });
          text.inputEl.addClass("a4p-pv-heading-input");
        });
    }

    let headingStatusEl: HTMLElement;

    new Setting(containerEl)
      .setName("헤딩 검증")
      .setDesc("형식(## 시작·중복 없음)과 실제 노트들에서 각 헤딩이 발견되는 비율을 검사합니다.")
      .addButton((btn) =>
        btn
          .setButtonText("검증")
          .setCta()
          .onClick(() => {
            this.renderValidation(headingStatusEl, this.validateHeadings());
          }),
      )
      .addButton((btn) =>
        btn.setButtonText("기본값 복원").onClick(async () => {
          this.plugin.settings.headings = { ...DEFAULT_HEADINGS };
          await this.plugin.persist();
          this.display(); // 입력란 갱신
        }),
      );

    headingStatusEl = containerEl.createDiv({ cls: "a4p-pv-settings-status" });
  }

  /**
   * 헤딩 구성 검증:
   * ① 형식 — '## ' 시작, 빈 값 없음, 서로 중복 없음
   * ② 커버리지 — 실제 심방일지/성도 노트에서 각 헤딩이 발견되는 건수
   */
  private validateHeadings(): { ok: boolean; messages: string[] } {
    const messages: string[] = [];
    let ok = true;
    const h = this.plugin.settings.headings;
    const keys = Object.keys(h) as Array<keyof HeadingConfig>;

    // ① 형식 검사
    const seen = new Map<string, keyof HeadingConfig>();
    for (const key of keys) {
      const value = h[key];
      if (!value.trim()) {
        messages.push(`✗ ${HEADING_LABELS[key]}: 비어 있습니다.`);
        ok = false;
        continue;
      }
      if (!/^##\s+\S/.test(value)) {
        messages.push(`✗ ${HEADING_LABELS[key]}: '## '로 시작하는 2단계 헤딩이어야 합니다 — "${value}"`);
        ok = false;
      }
      const normalized = nfc(value.trim());
      const dup = seen.get(normalized);
      if (dup) {
        messages.push(`✗ ${HEADING_LABELS[key]}: "${HEADING_LABELS[dup]}"와 헤딩이 중복됩니다.`);
        ok = false;
      } else {
        seen.set(normalized, key);
      }
    }
    if (ok) messages.push("✓ 형식 검사 통과 (## 시작 · 중복 없음)");

    // ② 커버리지 — metadataCache의 헤딩 목록으로 실제 노트 대조
    const visitKeys: Array<keyof HeadingConfig> = [
      "basicInfo", "visitInfo", "conversation", "prayer", "church", "observation", "followUp",
    ];
    const memberKeys: Array<keyof HeadingConfig> = ["memberVisitLog", "memberEmbeds"];

    // 이모지 유무를 무시한 느슨 비교 (분석 로직과 동일 기준)
    const countHeading = (paths: string[], heading: string): number => {
      const target = looseHeadingText(heading);
      let count = 0;
      for (const path of paths) {
        const file = this.app.vault.getFileByPath(path);
        if (!file) continue;
        const headings = this.app.metadataCache.getFileCache(file)?.headings ?? [];
        if (headings.some((hd) => hd.level === 2 && looseHeadingText(hd.heading) === target)) count++;
      }
      return count;
    };

    const visitPaths = this.plugin.index.visitsList().map((v) => v.path);
    const memberPaths = this.plugin.index.membersList().map((m) => m.path);

    if (visitPaths.length > 0) {
      for (const key of visitKeys) {
        const found = countHeading(visitPaths, h[key]);
        const mark = found === 0 ? "⚠" : "✓";
        messages.push(`${mark} ${HEADING_LABELS[key]}: 심방일지 ${visitPaths.length}건 중 ${found}건에서 발견`);
        if (found === 0) messages.push(`  → 이 헤딩으로는 기존 일지를 분석할 수 없습니다. 헤딩명을 확인하세요.`);
      }
    } else {
      messages.push("· 심방일지가 없어 커버리지 검사를 건너뜁니다.");
    }

    if (memberPaths.length > 0) {
      for (const key of memberKeys) {
        const found = countHeading(memberPaths, h[key]);
        const mark = found === 0 ? "⚠" : "✓";
        messages.push(`${mark} ${HEADING_LABELS[key]}: 성도 노트 ${memberPaths.length}건 중 ${found}건에서 발견`);
      }
    }

    messages.push(`ℹ 임베드 앵커 3종: ${embedAnchorsOf(h).join(" · ")}`);
    return { ok, messages };
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
