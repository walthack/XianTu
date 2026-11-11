import type { CanonRailContract, CanonRailProfile } from './canonRail';

/** 加拍表条目：插在 afterEventId 之后或 beforeEventId 之前；TS 表（DEFAULT_LINE_EXTRA_RAIL_BEATS）与包 manifest.railExtraBeats 同形。 */
export interface CanonRailExtraBeats {
  modId: string;
  afterEventId?: string;
  beforeEventId?: string;
  eventIds: string[];
  contracts: CanonRailContract[];
}

/**
 * 把加拍并进 rail 档（不改入参）。运行时（canonRail.ts）与内容包编译器（scripts/content-packs.mjs，经 jiti）共用这一份，
 * 不 import catalog，编译器在 catalog 缺失时也能加载。
 */
export function mergeExtraRailBeats(profiles: CanonRailProfile[], extraBeats: readonly CanonRailExtraBeats[]): CanonRailProfile[] {
  return profiles.map(profile => {
    const extras = extraBeats.filter(item => item.modId === profile.modId);
    if (!extras.length) return profile;
    let orderedEventIds = [...profile.orderedEventIds];
    let contracts = [...profile.contracts];
    for (const extra of extras) {
      const already = extra.eventIds.filter(id => orderedEventIds.includes(id));
      if (already.length) {
        throw new Error(`${profile.modId} extra rail beat already present: ${already.join(', ')}`);
      }
      if (extra.contracts.length !== extra.eventIds.length) {
        throw new Error(`${profile.modId} extra rail beat contracts must match eventIds`);
      }
      const anchorId = extra.afterEventId || extra.beforeEventId;
      const afterIndex = anchorId ? orderedEventIds.indexOf(anchorId) : -1;
      if (afterIndex < 0) {
        throw new Error(`${profile.modId} extra rail beat missing insertion anchor ${anchorId}`);
      }
      const insertAt = afterIndex + (extra.beforeEventId ? 0 : 1);
      orderedEventIds = [
        ...orderedEventIds.slice(0, insertAt),
        ...extra.eventIds,
        ...orderedEventIds.slice(insertAt),
      ];
      contracts = [
        ...contracts.slice(0, insertAt),
        ...extra.contracts,
        ...contracts.slice(insertAt),
      ];
    }
    return { ...profile, orderedEventIds, contracts };
  });
}
