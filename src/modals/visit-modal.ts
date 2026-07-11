import { Modal, Setting } from "obsidian";
import type PastoralVisitPlugin from "../main";
import { NewVisitInput } from "../types";
import { createVisitNote } from "../visit-note";
import { MemberEntry } from "../types";

export class VisitModal extends Modal {
  private plugin: PastoralVisitPlugin;
  private input: NewVisitInput;
  private warnEl!: HTMLElement;
  /** 성도 노트에서 진입 시 프리필 */
  private prefillPath: string | null;

  constructor(plugin: PastoralVisitPlugin, prefillMemberPath?: string) {
    super(plugin.app);
    this.plugin = plugin;
    this.prefillPath = prefillMemberPath ?? null;
    const today = new Date();
    this.input = {
      memberPath: "",
      memberName: "",
      날짜: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
      장소: "",
      동행: "",
      심방유형: plugin.settings.visitTypes[0] ?? "정기심방",
    };
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("a4p-pv-modal");
    this.titleEl.setText("심방일지 작성");

    const members = this.plugin.index
      .membersList()
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));

    // 프리필
    if (this.prefillPath) {
      const entry = this.plugin.index.members.get(this.prefillPath);
      if (entry) this.setMember(entry);
    }

    // ── 성도 선택 ──
    new Setting(contentEl)
      .setName("성도")
      .setDesc("심방 대상 성도를 선택합니다.")
      .addDropdown((drop) => {
        drop.addOption("", "선택");
        for (const m of members) drop.addOption(m.path, m.name);
        if (this.input.memberPath) drop.setValue(this.input.memberPath);
        drop.onChange((path) => {
          const entry = this.plugin.index.members.get(path);
          if (entry) this.setMember(entry);
          else {
            this.input.memberPath = "";
            this.input.memberName = "";
          }
        });
      });

    this.warnEl = contentEl.createDiv({ cls: "a4p-pv-modal-warn" });

    // ── 날짜 ──
    new Setting(contentEl)
      .setName("날짜")
      .setDesc("YYYY-MM-DD (기본값: 오늘)")
      .addText((text) => text.setValue(this.input.날짜).onChange((v) => (this.input.날짜 = v.trim())));

    // ── 장소 (최근 사용값 서제스트) ──
    const placeSetting = new Setting(contentEl).setName("장소");
    placeSetting.addText((text) => {
      text.setPlaceholder("자택 거실").onChange((v) => (this.input.장소 = v.trim()));
      const listId = "a4p-pv-place-list";
      text.inputEl.setAttr("list", listId);
      const datalist = placeSetting.settingEl.createEl("datalist");
      datalist.id = listId;
      for (const place of this.plugin.index.recentPlaces()) {
        datalist.createEl("option", { value: place });
      }
    });

    // ── 동행 ──
    new Setting(contentEl)
      .setName("동행")
      .setDesc("선택 사항")
      .addText((text) => text.setPlaceholder("이재훈 장로").onChange((v) => (this.input.동행 = v.trim())));

    // ── 심방유형 ──
    new Setting(contentEl).setName("심방유형").addDropdown((drop) => {
      for (const t of this.plugin.settings.visitTypes) drop.addOption(t, t);
      drop.setValue(this.input.심방유형).onChange((v) => (this.input.심방유형 = v));
    });

    // ── 버튼 ──
    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("일지 생성")
          .setCta()
          .onClick(() => void this.submit()),
      )
      .addButton((btn) => btn.setButtonText("취소").onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private setMember(entry: MemberEntry): void {
    this.input.memberPath = entry.path;
    this.input.memberName = entry.name;
  }

  private async submit(): Promise<void> {
    this.warnEl.empty();
    if (!this.input.memberPath) {
      this.warnEl.createEl("p", { text: "⚠ 성도를 선택하세요." });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.input.날짜)) {
      this.warnEl.createEl("p", { text: "⚠ 날짜는 YYYY-MM-DD 형식으로 입력하세요." });
      return;
    }
    const file = await createVisitNote(this.plugin, this.input);
    if (file) this.close();
  }
}
