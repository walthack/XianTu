/**
 * 物品的使用效果：读物品总表里的 effectTags / onUse，把 onUse 指向的状态按角色 id 写到目标身上。
 * 只做“物品 → 状态”这一步；扣背包、好感、记忆、判定属于自由行动结算（后续步骤），这里不动。
 * 总表定义取 definition（不看关卡变体）：同一件物品在各关卡里的效果标签不变。
 */
import type { SaveData } from '@/types/game';
import { contentDefinition } from '../entityCatalog';
import { applyActorStatus, type ApplyStatusResult } from './actorStatus';

export interface ItemOnUse { statusId: string; doses?: number; minutes?: number }
export interface ItemEffect { tags: string[]; onUse: ItemOnUse[] }

export function itemEffectOf(itemId: string): ItemEffect {
  const def = contentDefinition('item', itemId) as { effectTags?: string[]; onUse?: ItemOnUse[] } | undefined;
  return { tags: [...(def?.effectTags || [])], onUse: (def?.onUse || []).map(use => ({ ...use })) };
}

export function applyItemOnUse(save: SaveData, actorId: string, itemId: string, sourceId?: string): ApplyStatusResult[] {
  return itemEffectOf(itemId).onUse.map(use => applyActorStatus(save, actorId, use.statusId, { sourceId: sourceId ?? itemId, doses: use.doses, ...(use.minutes !== undefined ? { minutes: use.minutes } : {}) }));
}
