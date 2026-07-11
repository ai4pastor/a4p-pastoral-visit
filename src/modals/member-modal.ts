import { Modal, Setting, normalizePath } from "obsidian";
import type PastoralVisitPlugin from "../main";
import { createMemberNote, suggestAltName } from "../member-note";
import { NewMemberInput } from "../types";
import { nfc } from "../utils";

/** 기본 선택지 — 인덱스에 실사용 값이 있으면 그것을 우선 */
const FALLBACK_직분 = ["성도", "집사", "권사", "장로", "전도사", "청년"];
const FALLBACK_세례 = ["세례", "유아세례", "입교"];
const FALLBACK_신급 = ["새신자", "학습교인", "세례교인", "등록교인"];

const DIRECT_INPUT = "__direct__";

export class MemberModal extends Modal {
  private plugin: PastoralVisitPlugin;
  private input: NewMemberInput = {
    이름: "",
    성별: "",
    생년월일: "",
    연락처: "",
    구역: "",
    직분: "",
    등록일: "",
    세례여부: "",
    결혼여부: "",
    신급: "",
    가족수: "",
    가족관계: "",
  };
  private warnEl!: HTMLElement;

  constructor(plugin: PastoralVisitPlugin) {
    super(plugin.app);
    this.plugin = plugin;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("a4p-pv-modal");
    this.titleEl.setText("새 성도 등록");

    const today = new Date();
    this.input.등록일 = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    // ── 필수 영역 ──
    new Setting(contentEl).setName("이름").setDesc("파일명이 됩니다.").addText((text) => {
      text.setPlaceholder("홍길동").onChange((v) => {
        this.input.이름 = v.trim();
        this.checkDuplicate();
      });
      text.inputEl.focus();
    });

    this.warnEl = contentEl.createDiv({ cls: "a4p-pv-modal-warn" });

    new Setting(contentEl).setName("성별").addDropdown((drop) => {
      drop.addOption("", "선택");
      drop.addOption("남", "남");
      drop.addOption("여", "여");
      drop.onChange((v) => (this.input.성별 = v));
    });

    new Setting(contentEl)
      .setName("생년월일")
      .setDesc("YYYY-MM-DD")
      .addText((text) => text.setPlaceholder("1977-12-06").onChange((v) => (this.input.생년월일 = v.trim())));

    new Setting(contentEl)
      .setName("연락처")
      .addText((text) => text.setPlaceholder("010-0000-0000").onChange((v) => (this.input.연락처 = v.trim())));

    this.addChoiceField(contentEl, "구역", this.plugin.index.distinctMemberValues("구역"), (v) => {
      this.input.구역 = v;
      this.checkDuplicate();
    });
    this.addChoiceField(
      contentEl,
      "직분",
      this.withFallback(this.plugin.index.distinctMemberValues("직분"), FALLBACK_직분),
      (v) => (this.input.직분 = v),
    );

    // ── 선택 영역 (접힘) ──
    const details = contentEl.createEl("details", { cls: "a4p-pv-modal-details" });
    details.createEl("summary", { text: "상세 정보 (선택)" });

    new Setting(details)
      .setName("등록일")
      .setDesc("기본값: 오늘")
      .addText((text) => text.setValue(this.input.등록일).onChange((v) => (this.input.등록일 = v.trim())));

    this.addChoiceField(
      details,
      "세례여부",
      this.withFallback(this.plugin.index.distinctMemberValues("세례여부"), FALLBACK_세례),
      (v) => (this.input.세례여부 = v),
    );

    new Setting(details).setName("결혼여부").addDropdown((drop) => {
      drop.addOption("", "선택");
      drop.addOption("기혼", "기혼");
      drop.addOption("미혼", "미혼");
      drop.onChange((v) => (this.input.결혼여부 = v));
    });

    this.addChoiceField(
      details,
      "신급",
      this.withFallback(this.plugin.index.distinctMemberValues("신급"), FALLBACK_신급),
      (v) => (this.input.신급 = v),
    );

    new Setting(details)
      .setName("가족수")
      .addText((text) => text.setPlaceholder("4").onChange((v) => (this.input.가족수 = v.trim())));

    new Setting(details)
      .setName("가족관계")
      .setDesc("예: [[박순옥]] (배우자) — 기존 성도는 wikilink로")
      .addText((text) =>
        text.setPlaceholder("[[박순옥]] (배우자)").onChange((v) => (this.input.가족관계 = v.trim())),
      );

    // ── 버튼 ──
    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("등록")
          .setCta()
          .onClick(() => void this.submit()),
      )
      .addButton((btn) => btn.setButtonText("취소").onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
  }

  /** 기존 값 드롭다운 + 직접입력 텍스트 전환 */
  private addChoiceField(
    parent: HTMLElement,
    label: string,
    options: string[],
    onChange: (v: string) => void,
  ): void {
    const setting = new Setting(parent).setName(label);
    setting.addDropdown((drop) => {
      drop.addOption("", "선택");
      for (const opt of options) drop.addOption(opt, opt);
      drop.addOption(DIRECT_INPUT, "직접 입력…");
      drop.onChange((v) => {
        if (v === DIRECT_INPUT) {
          drop.selectEl.style.display = "none";
          setting.addText((text) => {
            text.setPlaceholder(`${label} 직접 입력`).onChange((t) => onChange(t.trim()));
            text.inputEl.focus();
          });
          onChange("");
        } else {
          onChange(v);
        }
      });
    });
  }

  private withFallback(scanned: string[], fallback: string[]): string[] {
    return scanned.length > 0 ? scanned : fallback;
  }

  /** 동명이인 선제 감지 — 경고 + 대안 파일명 제안 */
  private checkDuplicate(): void {
    this.warnEl.empty();
    if (!this.input.이름) return;
    const path = normalizePath(`${this.plugin.settings.memberFolder}/${nfc(this.input.이름)}.md`);
    if (this.app.vault.getAbstractFileByPath(path)) {
      const alt = suggestAltName(this.input.이름, this.input.구역);
      this.warnEl.createEl("p", {
        text: `⚠ "${this.input.이름}" 노트가 이미 있습니다. 기존 노트는 덮어쓰지 않습니다.`,
      });
      const suggestion = this.warnEl.createEl("p");
      suggestion.appendText(`제안: `);
      const btn = suggestion.createEl("button", { text: `"${alt}" 사용` });
      btn.addEventListener("click", () => {
        const nameInput = this.contentEl.querySelector<HTMLInputElement>("input");
        if (nameInput) nameInput.value = alt;
        this.input.이름 = alt;
        this.checkDuplicate();
      });
    }
  }

  private async submit(): Promise<void> {
    if (!this.input.이름) {
      this.warnEl.empty();
      this.warnEl.createEl("p", { text: "⚠ 이름을 입력하세요." });
      return;
    }
    const path = normalizePath(`${this.plugin.settings.memberFolder}/${nfc(this.input.이름)}.md`);
    if (this.app.vault.getAbstractFileByPath(path)) {
      this.checkDuplicate();
      return;
    }
    const file = await createMemberNote(this.plugin, this.input);
    if (file) this.close();
  }
}
