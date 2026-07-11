import { Notice, TFile, normalizePath } from "obsidian";
import type PastoralVisitPlugin from "./main";
import { ensureFolder } from "./member-note";
import { DigestEntry, buildPrayerDigest } from "./prayers-core";
import { PrayerItem } from "./types";
import { daysSince, formatYymmdd } from "./utils";

export interface DigestParams {
  /** 수집 범위 (주) */
  weeks: number;
  /** 응답 표시 항목 포함 (감사 제목) */
  includeAnswered: boolean;
}

export interface DigestPlan {
  content: string;
  fileName: string;
  folder: string;
  activeCount: number;
  totalCount: number;
  rangeLabel: string;
}

/** 수집 → 콘텐츠 조립 (생성 전 미리보기용 — 파일은 만들지 않음) */
export async function planPrayerDigest(
  plugin: PastoralVisitPlugin,
  params: DigestParams,
): Promise<DigestPlan> {
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const rangeDays = params.weeks * 7;

  const all = await plugin.prayers.scanAll();
  const inRange = all.filter((p) => {
    const days = daysSince(p.visitDate, now);
    if (days === null || days > rangeDays) return false;
    return params.includeAnswered || !p.answered;
  });

  // 성도별 그룹 (가나다 순), 항목은 최근 심방 순
  const byMember = new Map<string, PrayerItem[]>();
  for (const p of inRange) {
    const key = p.memberName || "(성도 미상)";
    if (!byMember.has(key)) byMember.set(key, []);
    byMember.get(key)!.push(p);
  }
  const entries: DigestEntry[] = Array.from(byMember.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "ko"))
    .map(([memberName, items]) => {
      const member = plugin.index.membersList().find((m) => m.name === memberName);
      const memberMeta = [member?.fm.직분, member?.fm.구역].filter(Boolean).join(" · ");
      return {
        memberName,
        memberMeta,
        items: items.map((i) => ({
          text: i.text,
          group: i.group,
          visitDate: i.visitDate,
          visitBasename: i.visitBasename,
          answered: i.answered,
          answeredDate: i.answeredDate,
        })),
      };
    });

  const rangeStart = new Date(now.getTime() - rangeDays * 86400000);
  const rangeStartStr = `${rangeStart.getFullYear()}-${String(rangeStart.getMonth() + 1).padStart(2, "0")}-${String(rangeStart.getDate()).padStart(2, "0")}`;
  const rangeLabel = `최근 ${params.weeks}주 (${rangeStartStr} ~ ${dateStr})`;

  const content = buildPrayerDigest(entries, {
    dateStr,
    rangeLabel,
    includeAnswered: params.includeAnswered,
    insertWordClassification: plugin.settings.insertWordClassification,
    worldValue: plugin.settings.wordWorldValue,
    routeValue: plugin.settings.wordRouteValue,
  });

  return {
    content,
    fileName: `${formatYymmdd(dateStr)}_주간기도제목`,
    folder: plugin.settings.prayerDigestFolder.trim().replace(/^\/+|\/+$/g, ""),
    activeCount: inRange.filter((p) => !p.answered).length,
    totalCount: inRange.length,
    rangeLabel,
  };
}

/** 모음 노트 생성 + 열기 (같은 날 재생성 시 `이름 (2)` 증분 — 덮어쓰기 금지) */
export async function createPrayerDigest(
  plugin: PastoralVisitPlugin,
  plan: DigestPlan,
): Promise<TFile | null> {
  const app = plugin.app;
  await ensureFolder(app, plan.folder);

  let path = "";
  for (let i = 0; i < 50; i++) {
    const suffix = i === 0 ? "" : ` (${i + 1})`;
    const candidate = normalizePath(`${plan.folder}/${plan.fileName}${suffix}.md`);
    if (!app.vault.getAbstractFileByPath(candidate)) {
      path = candidate;
      break;
    }
  }
  if (!path) {
    new Notice("같은 이름의 노트가 너무 많아 새 파일명을 만들 수 없습니다.");
    return null;
  }

  let file: TFile;
  try {
    const created = await app.vault.create(path, plan.content);
    if (!(created instanceof TFile)) throw new Error("생성 결과를 확인할 수 없습니다.");
    file = created;
  } catch (e) {
    new Notice(`기도 모음 생성 실패: ${e instanceof Error ? e.message : "알 수 없는 오류"}`, 8000);
    return null;
  }

  await app.workspace.getLeaf(true).openFile(file);
  new Notice(`주간 기도제목 모음 생성됨 (진행 중 ${plan.activeCount}건)`);
  return file;
}
