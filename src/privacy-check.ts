import { FileSystemAdapter, Notice } from "obsidian";
import type PastoralVisitPlugin from "./main";

export interface PrivacyCheckResult {
  ok: boolean;
  messages: string[];
  /** .gitignore 추가 제안 문구 (있을 때만) */
  gitignoreSuggestion: string | null;
}

/**
 * 동기화·git 노출 점검 — 경고만 표시하고 아무것도 자동 수정하지 않는다.
 * 성도 정보는 민감 개인정보이므로, 공개 저장소·공유형 동기화에 실리는 것을 사전에 알린다.
 */
export async function runPrivacyCheck(plugin: PastoralVisitPlugin): Promise<PrivacyCheckResult> {
  const messages: string[] = [];
  let gitignoreSuggestion: string | null = null;
  let ok = true;

  const adapter = plugin.app.vault.adapter;
  const memberFolder = plugin.settings.memberFolder;

  // ① git 저장소 여부 + .gitignore에 성도 폴더 제외돼 있는지
  try {
    if (await adapter.exists(".git")) {
      let ignored = false;
      if (await adapter.exists(".gitignore")) {
        const gitignore = await adapter.read(".gitignore");
        ignored = gitignore
          .split("\n")
          .some((line) => line.trim() && memberFolder.startsWith(line.trim().replace(/\/$/, "")));
      }
      if (ignored) {
        messages.push("✓ 볼트가 git 저장소이지만 성도 폴더는 .gitignore로 제외돼 있습니다.");
      } else {
        ok = false;
        messages.push(
          "⚠ 볼트가 git 저장소이고 성도 폴더가 추적 대상입니다. 원격 저장소에 푸시하면 성도 개인정보가 함께 올라갑니다.",
        );
        gitignoreSuggestion = `${memberFolder}/`;
      }
    } else {
      messages.push("✓ 볼트가 git 저장소가 아닙니다.");
    }
  } catch {
    messages.push("· git 여부를 확인할 수 없습니다.");
  }

  // ② 클라우드 동기화 폴더 안에 있는지 (경로 문자열 검사)
  if (adapter instanceof FileSystemAdapter) {
    const basePath = adapter.getBasePath();
    const cloudMarkers: Array<{ marker: string; name: string }> = [
      { marker: "Mobile Documents", name: "iCloud" },
      { marker: "iCloud", name: "iCloud" },
      { marker: "Dropbox", name: "Dropbox" },
      { marker: "Google Drive", name: "Google Drive" },
      { marker: "GoogleDrive", name: "Google Drive" },
      { marker: "OneDrive", name: "OneDrive" },
    ];
    const found = cloudMarkers.find((c) => basePath.includes(c.marker));
    if (found) {
      ok = false;
      messages.push(
        `⚠ 볼트가 ${found.name} 동기화 폴더 안에 있습니다. 성도 정보가 클라우드에 올라간다는 뜻입니다 — 계정 2단계 인증과 기기 잠금을 꼭 확인하세요.`,
      );
    } else {
      messages.push("✓ 알려진 클라우드 동기화 폴더 경로가 아닙니다.");
    }
  } else {
    messages.push("· 모바일 환경에서는 동기화 경로 검사를 건너뜁니다.");
  }

  messages.push(
    "ℹ 가장 확실한 보호는 OS 차원 암호화(macOS FileVault, Windows BitLocker)와 기기 잠금입니다.",
  );

  return { ok, messages, gitignoreSuggestion };
}

/** .gitignore 제안 문구를 클립보드로 */
export async function copyGitignoreSuggestion(suggestion: string): Promise<void> {
  await navigator.clipboard.writeText(suggestion);
  new Notice(`.gitignore에 추가할 문구를 복사했습니다: ${suggestion}`);
}
