import type PastoralVisitPlugin from "./main";
import {
  BriefingModel,
  ResolvedFamily,
  buildBriefingModel,
  parseFamilyRelations,
} from "./briefing-core";

/**
 * 심방 브리핑 수집기 — 기존 인덱스/스캐너 결과를 성도 단위로 재조립한다.
 * 읽기 전용: vault를 변경하지 않는다.
 */
export async function gatherBriefing(
  plugin: PastoralVisitPlugin,
  memberPath: string,
): Promise<BriefingModel | null> {
  const member = plugin.index.members.get(memberPath);
  if (!member) return null;
  const visits = plugin.index.visitsOf(memberPath);
  const actions = await plugin.actions.scanAll();
  const prayers = await plugin.prayers.scanAll();
  const family = resolveFamily(plugin, member.fm.가족관계, memberPath);
  return buildBriefingModel(member, visits, actions, prayers, family, new Date());
}

/** `가족관계` wikilink들을 성도 노트로 해석 (member-index.resolveMemberPath 패턴) */
function resolveFamily(
  plugin: PastoralVisitPlugin,
  value: unknown,
  fromPath: string,
): ResolvedFamily[] {
  return parseFamilyRelations(value).map((rel) => {
    const dest = plugin.app.metadataCache.getFirstLinkpathDest(rel.linkTarget, fromPath);
    const entry = dest ? plugin.index.members.get(dest.path) : undefined;
    return {
      ...rel,
      memberPath: entry ? entry.path : null,
      status:
        typeof entry?.fm.심방상태 === "string" && entry.fm.심방상태 ? entry.fm.심방상태 : null,
      lastVisit: entry ? plugin.index.lastVisitDateOf(entry.path) : null,
    };
  });
}
