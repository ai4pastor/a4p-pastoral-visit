/**
 * 대시보드 카드 카운트 — src/view.ts 155-342의 로직을 메모리 모델에 대해 재계산.
 */
import { VISIT_STATUS } from "../../../src/constants";
import { parseFollowUps } from "../../../src/actions-core";
import { parsePrayers } from "../../../src/prayers-core";
import { birthdayDday, daysSince, monthsBetween } from "../../../src/utils";
import { toLocalDate } from "./dates";

export interface ModelMember {
  name: string;
  status: string | null;
  birth: string | null;
  registered: string | null;
}
export interface ModelVisit {
  member: string;
  date: string;
  synced: boolean;
  content: string;
  basename: string;
}

export interface CardReport {
  pendingFollowUps: Array<{ member: string; date: string; days: number; text: string }>;
  needed: string[];
  stale: Array<{ name: string; last: string; months: number; status: string | null }>;
  birthdays: Array<{ name: string; dday: number }>;
  newcomers: string[];
  unsynced: string[];
  prayersActive: number;
  prayersAnswered: number;
  recent: string[];
  statusDist: Record<string, number>;
  duplicateNames: string[];
}

export function computeCards(
  members: ModelMember[],
  visits: ModelVisit[],
  anchor: string,
  opts = { staleMonths: 6, newDays: 90, birthdayDays: 14 },
): CardReport {
  const today = toLocalDate(anchor);
  const lastVisit = (name: string) => {
    const vs = visits.filter((v) => v.member === name).sort((a, b) => a.date.localeCompare(b.date));
    return vs.length ? vs[vs.length - 1].date : null;
  };

  const pendingFollowUps = visits
    .flatMap((v) =>
      parseFollowUps(v.content)
        .filter((f) => !f.checked)
        .map((f) => ({ member: v.member, date: v.date, days: daysSince(v.date, today) ?? 0, text: f.text })),
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const needed = members.filter((m) => m.status === VISIT_STATUS.needed).map((m) => m.name);

  const stale = members
    .map((m) => ({ m, last: lastVisit(m.name) }))
    .filter(({ m, last }) => {
      if (m.status === VISIT_STATUS.notNeeded || !last) return false;
      const months = monthsBetween(last, today);
      return months !== null && months >= opts.staleMonths;
    })
    .sort((a, b) => (a.last ?? "").localeCompare(b.last ?? ""))
    .map(({ m, last }) => ({ name: m.name, last: last!, months: monthsBetween(last!, today) ?? 0, status: m.status }));

  const birthdays = members
    .map((m) => ({ name: m.name, dday: m.birth ? birthdayDday(m.birth, today) : null }))
    .filter((x): x is { name: string; dday: number } => x.dday !== null && x.dday <= opts.birthdayDays)
    .sort((a, b) => a.dday - b.dday);

  const newcomers = members
    .filter((m) => {
      const reg = m.registered ? daysSince(m.registered, today) : null;
      return reg !== null && reg <= opts.newDays && !visits.some((v) => v.member === m.name);
    })
    .map((m) => m.name);

  const unsynced = visits.filter((v) => !v.synced).map((v) => v.basename);

  let prayersActive = 0;
  let prayersAnswered = 0;
  for (const v of visits) {
    for (const p of parsePrayers(v.content)) p.answered ? prayersAnswered++ : prayersActive++;
  }

  const recent = [...visits]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
    .map((v) => v.basename);

  const statusDist: Record<string, number> = {};
  for (const m of members) statusDist[m.status || "(빈값)"] = (statusDist[m.status || "(빈값)"] ?? 0) + 1;

  const seen = new Map<string, number>();
  for (const m of members) seen.set(m.name, (seen.get(m.name) ?? 0) + 1);
  const duplicateNames = [...seen.entries()].filter(([, n]) => n > 1).map(([n]) => n);

  return { pendingFollowUps, needed, stale, birthdays, newcomers, unsynced, prayersActive, prayersAnswered, recent, statusDist, duplicateNames };
}

export function formatCards(r: CardReport): string {
  const L: string[] = [];
  L.push(`후속조치 미완 ${r.pendingFollowUps.length}건 (최상단: ${r.pendingFollowUps[0] ? `${r.pendingFollowUps[0].member} ${r.pendingFollowUps[0].days}일 경과` : "-"})`);
  L.push(`심방 필요 ${r.needed.length}명: ${r.needed.join(", ")}`);
  L.push(`장기 미심방 ${r.stale.length}명: ${r.stale.map((s) => `${s.name}(${s.last}, ${s.months}개월, ${s.status})`).join(", ")}`);
  L.push(`생일 14일 이내 ${r.birthdays.length}명: ${r.birthdays.map((b) => `${b.name} D-${b.dday}`).join(", ")}`);
  L.push(`새등록 심방 전 ${r.newcomers.length}명: ${r.newcomers.join(", ")}`);
  L.push(`미반영 일지 ${r.unsynced.length}건: ${r.unsynced.join(", ")}`);
  L.push(`기도제목 진행 ${r.prayersActive} / 응답 ✅ ${r.prayersAnswered}`);
  L.push(`최근 심방 5건: ${r.recent.join(", ")}`);
  L.push(`심방상태 분포: ${Object.entries(r.statusDist).map(([k, v]) => `${k} ${v}`).join(" / ")}`);
  if (r.duplicateNames.length) L.push(`⚠ 중복 이름: ${r.duplicateNames.join(", ")}`);
  return L.join("\n");
}
