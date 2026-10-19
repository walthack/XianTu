/**
 * 物品的使用效果：读物品总表里的 effectTags / onUse，把 onUse 指向的状态按角色 id 写到目标身上。
 * 只做“物品 → 状态”这一步；扣背包、好感、记忆、判定属于自由行动结算（后续步骤），这里不动。
 * 总表定义取 definition（不看关卡变体）：同一件物品在各关卡里的效果标签不变。
 */
import type { SaveData } from '@/types/game';
import { contentDefinition } from '../entityCatalog';
import { applyActorStatus, type ApplyStatusResult } from './actorStatus';
import type { StatusParams } from '../../sceneModule/types';
import { GAME_NUMBERS } from '../../sceneModule/numbers';

export interface ItemOnUse { statusId: string; doses?: number; minutes?: number; params?: StatusParams }
export interface ItemEffect { tags: string[]; onUse: ItemOnUse[] }

export function itemEffectOf(itemId: string): ItemEffect {
  const def = contentDefinition('item', itemId) as { effectTags?: string[]; onUse?: ItemOnUse[] } | undefined;
  return { tags: [...(def?.effectTags || [])], onUse: (def?.onUse || []).map(use => ({ ...use })) };
}

export function applyItemOnUse(save: SaveData, actorId: string, itemId: string, sourceId?: string): ApplyStatusResult[] {
  return itemEffectOf(itemId).onUse.map(use => applyActorStatus(save, actorId, use.statusId, { sourceId: sourceId ?? itemId, doses: use.doses, ...(use.minutes !== undefined ? { minutes: use.minutes } : {}), ...(use.params ? { params: use.params } : {}) }));
}

/** 用带 tag 标签的药解除 statusId 时要改挂的状态（status.itemTagDowngrade）；没有降级＝直接解除。 */
/** 这些标签里是否有任何一个带降级规则（决定该变体要不要备 done_downgraded 文本）。 */
export function tagsHaveDowngrade(tags: readonly string[]): boolean {
  const table = (GAME_NUMBERS.status as unknown as { itemTagDowngrade?: Record<string, Record<string, string> | string> }).itemTagDowngrade || {};
  return tags.some(tag => { const row = table[tag]; return !!row && typeof row === 'object' && Object.keys(row).length > 0; });
}
export function tagDowngradeOf(tag: string, statusId: string): string | undefined {
  const table = (GAME_NUMBERS.status as unknown as { itemTagDowngrade?: Record<string, Record<string, string> | string> }).itemTagDowngrade || {};
  const row = table[tag];
  return row && typeof row === 'object' ? row[statusId] : undefined;
}
