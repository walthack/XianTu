/**
 * 运行时读角色（含敌人种类、场上实例）的属性：总表基础属性 ⊕ 当前阶段档覆盖项，代码与战斗都读这份合并结果。
 *
 * 当前阶段 = 存档里 runtime.canon.characters（本关阶段档的物化副本）。覆盖项是阶段档上的 `stats` 对象；
 * 阶段档旧有的顶层 `level`（整数）按同一规则当作 stats.level 的覆盖项，显式写了 stats.level 则以 stats 为准。
 * 阶段档没有这个 id（敌人种类通常没有）= 只有基础属性。总表里也没有 = 没有属性（调用方按同级回落）。
 * 合并规则见 characterStatsMerge.ts 与 docs/CHARACTER-DATA-STRUCTURE.md §8。
 */
import { getRegistryBaseStats, getRegistryCanonicalId } from './characterResolver';
import { kindIdOf } from './actorInstances';
import { combatLevelOf, mergeCharacterStats, type CharacterStats, type MergeResult } from './characterStatsMerge';
import { statsRules } from './characterStatsRules';

interface StageProfile { id?: string; level?: unknown; stats?: unknown }

/** 阶段档上的覆盖项：旧顶层 level（仅整数）+ stats；stats 优先。 */
export function stageOverrideOf(profile: StageProfile | undefined): Record<string, unknown> | undefined {
  if (!profile) return undefined;
  const legacy = Number.isInteger(profile.level) ? { level: profile.level } : {};
  const stats = profile.stats && typeof profile.stats === 'object' && !Array.isArray(profile.stats) ? profile.stats as Record<string, unknown> : {};
  const merged = { ...legacy, ...stats };
  return Object.keys(merged).length ? merged : undefined;
}

/**
 * 某个 id（人物 id、敌人种类 id、旧 id 别名、实例 id 都可）在当前阶段的属性。
 * 总表和阶段档都没有这个 id 时返回 undefined。
 */
export function resolveActorStats(runtime: { canon?: { characters?: StageProfile[] } } | undefined, id: string): (MergeResult & { canonicalId: string }) | undefined {
  const canonicalId = getRegistryCanonicalId(id);
  const kindId = kindIdOf(id);
  const profile = runtime?.canon?.characters?.find(c => c.id === kindId || (canonicalId !== undefined && c.id === canonicalId));
  const base = getRegistryBaseStats(id);
  const override = stageOverrideOf(profile);
  if (canonicalId === undefined && !override) return undefined;
  return { ...mergeCharacterStats(base, override, statsRules()), canonicalId: canonicalId ?? kindId };
}

export { combatLevelOf };
export type { CharacterStats };
