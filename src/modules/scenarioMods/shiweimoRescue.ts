/**
 * F02 诗薇莫救治规则（纯逻辑，数值读 story.shiweimo）。
 * 制服（被制住）或化解（松口退开）后到天亮为救治窗口；窗口内用珍品及以上带疗伤/解毒标签的药，或治疗技能达门槛并过判定，可救活。
 * 凡品无效；朱箓蛇丹不可用（用或给她看 → 好感降到 affinityOnShedanTruth）。
 * 只做判定；接到自由行动/剧情事件由宿主负责（未接线，见 PROJECT-STATUS）。
 */
import { GAME_NUMBERS } from '../sceneModule/numbers';
import { contentDefinition } from './entityCatalog';
import { itemTierOf, ITEM_TIERS } from './itemGrades';

export type ShiweimoEnding = '倒下' | '被制住' | '松口退开';
export type RescueTry =
  | { kind: 'item'; itemId: string }
  | { kind: 'skill'; skillLevel: number; roll: number };
export interface RescueVerdict { ok: boolean; reason: 'saved' | 'dead' | 'window_closed' | 'tier_too_low' | 'wrong_item' | 'forbidden' | 'skill_too_low' | 'skill_failed' | 'no_tries'; affinity?: number }

const cfg = () => (GAME_NUMBERS as any).story.shiweimo;
const order = (name?: string) => ITEM_TIERS.find(t => t.name === name || t.id === name)?.order ?? -1;

export function rescueWindowOpen(ending: ShiweimoEnding, hoursSinceEnd: number): boolean {
  return ending !== '倒下' && hoursSinceEnd >= 0 && hoursSinceEnd <= Number(cfg().rescueWindowHours);
}

export function judgeRescue(ending: ShiweimoEnding, hoursSinceEnd: number, attempt: RescueTry, skillTriesUsed = 0): RescueVerdict {
  const c = cfg();
  if (ending === '倒下') return { ok: false, reason: 'dead' };
  if (!rescueWindowOpen(ending, hoursSinceEnd)) return { ok: false, reason: 'window_closed' };
  const affinity = Number(c.affinityOnRescue?.[ending] ?? 0);
  if (attempt.kind === 'item') {
    if ((c.forbiddenItemIds as string[]).includes(attempt.itemId)) return { ok: false, reason: 'forbidden', affinity: Number(c.affinityOnShedanTruth) };
    const def = contentDefinition('item', attempt.itemId) as { effectTags?: string[]; grade?: string } | undefined;
    if (!def || !(def.effectTags || []).some(t => (c.itemTags as string[]).includes(t))) return { ok: false, reason: 'wrong_item' };
    const tier = itemTierOf(def.grade);
    if (!tier || tier.order < order(c.minItemTier)) return { ok: false, reason: 'tier_too_low' };
    return { ok: true, reason: 'saved', affinity };
  }
  if (skillTriesUsed >= Number(c.skillTries)) return { ok: false, reason: 'no_tries' };
  if (attempt.skillLevel < Number(c.skillThreshold)) return { ok: false, reason: 'skill_too_low' };
  return attempt.roll >= Number(c.skillDifficulty) ? { ok: true, reason: 'saved', affinity } : { ok: false, reason: 'skill_failed' };
}
