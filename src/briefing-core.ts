/**
 * 심방 브리핑·성도 목록의 순수 로직 (obsidian 비의존, vitest 대상).
 * 데이터 수집(vault 접근)은 briefing.ts, 렌더링은 view.ts가 담당한다.
 */
import { ActionItem, MemberEntry, PrayerItem, VisitEntry } from "./types";
import { birthdayDday, formatRelativeKo, monthsBetween, nfc, parseDate } from "./utils";

/** 성도 목록 검색 — 이름/구역/직분 부분일치 (NFC 정규화), 가나다 정렬 */
export function filterMembers(members: MemberEntry[], query: string): MemberEntry[] {
  const q = nfc(query.trim());
  const matched = q
    ? members.filter((m) => {
        const fields = [m.name, m.fm.구역, m.fm.직분];
        return fields.some((f) => typeof f === "string" && nfc(f).includes(q));
      })
    : [...members];
  return matched.sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

/** 만 나이 — 생년월일이 유효하지 않으면 null */
export function ageFrom(birthStr: string, today: Date): number | null {
  const birth = parseDate(birthStr);
  if (!birth) return null;
  let age = today.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age < 0 ? null : age;
}

export interface FamilyRelation {
  /** wikilink 대상 (경로 미해석 링크패스) */
  linkTarget: string;
  /** 표시 이름 (별칭 우선) */
  display: string;
  /** 관계 라벨 — "배우자" 등, 없으면 "" */
  label: string;
}

const FAMILY_LINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]\s*(?:\(([^)]*)\))?/g;

/**
 * `가족관계` 프론트매터 해석 — 문자열/문자열 배열 모두 허용.
 * "[[박순옥]] (배우자), [[박아들]] (자녀)" 형식에서 다중 링크+라벨 추출.
 * (utils.parseWikilinkTarget은 첫 링크만 반환하므로 별도 함수)
 */
export function parseFamilyRelations(value: unknown): FamilyRelation[] {
  const sources: string[] = [];
  if (typeof value === "string") sources.push(value);
  else if (Array.isArray(value)) {
    for (const v of value) if (typeof v === "string") sources.push(v);
  }
  const out: FamilyRelation[] = [];
  for (const src of sources) {
    for (const m of src.matchAll(FAMILY_LINK_RE)) {
      const target = nfc(m[1].trim());
      if (!target) continue;
      const alias = m[2]?.trim();
      const base = target.split("/").pop() ?? target;
      out.push({
        linkTarget: target,
        display: alias || base,
        label: m[3]?.trim() ?? "",
      });
    }
  }
  return out;
}

/** 수집기가 가족 링크를 성도 노트로 해석해 붙인 결과 */
export interface ResolvedFamily extends FamilyRelation {
  /** 성도 노트로 해석된 경로 (미해석 시 null) */
  memberPath: string | null;
  /** 해석된 성도의 심방상태 */
  status: string | null;
  /** 해석된 성도의 마지막 심방일 */
  lastVisit: string | null;
}

export interface BriefingTimelineItem {
  date: string;
  type: string;
  place: string;
  path: string;
  basename: string;
}

export interface BriefingModel {
  name: string;
  직분: string | null;
  구역: string | null;
  /** 심방상태 */
  status: string | null;
  /** 만 나이 (생년월일 파생 — 원문 아님) */
  age: number | null;
  /** 생년월일 원문 — 표시는 반드시 renderSensitive 경유 */
  birth: string | null;
  /** 연락처 원문 — 표시는 반드시 renderSensitive 경유 */
  phone: string | null;
  /** 등록 후 개월 수 */
  registeredMonths: number | null;
  /** 생일까지 남은 일수 */
  birthdayDday: number | null;
  /** "{올해}년 봉사" 필드 값 */
  serviceThisYear: string | null;
  /** 마지막 심방 (없으면 null = "심방 기록 없음") */
  lastVisit: { date: string; relative: string; type: string; path: string; basename: string } | null;
  /** 이 성도의 미완 후속조치 (visitPath 집합 필터 — 동명이인 안전) */
  pendingActions: ActionItem[];
  /** 최근 심방일지 2건의 기도제목 */
  recentPrayers: PrayerItem[];
  family: ResolvedFamily[];
  /** 심방 이력 (날짜 내림차순) */
  timeline: BriefingTimelineItem[];
}

/** 브리핑 모델 조립 — 입력은 전부 기존 인덱스/스캐너 결과 */
export function buildBriefingModel(
  member: MemberEntry,
  /** 이 성도의 심방일지 (날짜 오름차순 — index.visitsOf 결과) */
  visits: VisitEntry[],
  /** 전체 후속조치 스캔 결과 */
  actions: ActionItem[],
  /** 전체 기도제목 스캔 결과 */
  prayers: PrayerItem[],
  family: ResolvedFamily[],
  today: Date,
): BriefingModel {
  const fm = member.fm;
  const visitPaths = new Set(visits.map((v) => v.path));

  const lastEntry = visits.length > 0 ? visits[visits.length - 1] : null;
  const lastDate = typeof lastEntry?.fm.날짜 === "string" ? lastEntry.fm.날짜 : null;
  const lastVisit =
    lastEntry && lastDate
      ? {
          date: lastDate,
          relative: formatRelativeKo(lastDate, today),
          type: typeof lastEntry.fm.심방유형 === "string" ? lastEntry.fm.심방유형 : "",
          path: lastEntry.path,
          basename: lastEntry.basename,
        }
      : null;

  const recentVisitPaths = new Set(visits.slice(-2).map((v) => v.path));

  const birth = typeof fm.생년월일 === "string" && fm.생년월일 ? fm.생년월일 : null;
  const registered = typeof fm.등록일 === "string" ? fm.등록일 : null;
  const serviceKey = `${today.getFullYear()}년 봉사`;
  const service = fm[serviceKey];

  return {
    name: member.name,
    직분: typeof fm.직분 === "string" && fm.직분 ? fm.직분 : null,
    구역: typeof fm.구역 === "string" && fm.구역 ? fm.구역 : null,
    status: typeof fm.심방상태 === "string" && fm.심방상태 ? fm.심방상태 : null,
    age: birth ? ageFrom(birth, today) : null,
    birth,
    phone: typeof fm.연락처 === "string" && fm.연락처 ? fm.연락처 : null,
    registeredMonths: registered ? monthsBetween(registered, today) : null,
    birthdayDday: birth ? birthdayDday(birth, today) : null,
    serviceThisYear: typeof service === "string" && service ? service : null,
    lastVisit,
    pendingActions: actions.filter((a) => visitPaths.has(a.visitPath) && !a.checked),
    recentPrayers: prayers.filter((p) => recentVisitPaths.has(p.visitPath)),
    family,
    timeline: [...visits]
      .reverse()
      .map((v) => ({
        date: typeof v.fm.날짜 === "string" ? v.fm.날짜 : "",
        type: typeof v.fm.심방유형 === "string" ? v.fm.심방유형 : "",
        place: typeof v.fm.장소 === "string" ? v.fm.장소 : "",
        path: v.path,
        basename: v.basename,
      })),
  };
}
