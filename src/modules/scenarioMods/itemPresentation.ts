import type { RuntimeState } from './runtime';
import type { ItemPresentationCondition } from './schema/content';
import { catalogItem } from './entityCatalog';

export type ItemInstance = { 物品ID?: string; 名称?: string; 描述?: string; 数量?: number };

/** 背包展示只需这两块只读数据；完整存档也可直接传入。 */
export interface ItemPresentationView {
  角色?: { 背包?: { 物品?: unknown } | null };
  世界?: { 状态?: { 剧本模组?: unknown } | null };
}
export type EventCompletionFacts = Partial<Pick<RuntimeState, 'completedEventIds' | 'chronicle' | 'travelLedger'>>;

/** 本关与跨关共享的“曾经完成”依据，不从叙事或物品名称推断。 */
export function eventEverCompleted(runtime: EventCompletionFacts | null | undefined, eventId: string, stageId?: string): boolean {
  return !!(runtime?.completedEventIds?.includes(eventId)
    || runtime?.travelLedger?.doneEventIds?.includes(eventId)
    || runtime?.chronicle?.some(entry => entry.type === 'event' && entry.id === `chronicle.${stageId || entry.stageId}.${eventId}`));
}

/** 旧背包可能含空槽、标量或数组；它们不参与物品扫描。 */
export function inventoryItemEntries(items: unknown): Array<[string, ItemInstance]> {
  return Object.entries((items || {}) as Record<string, unknown>).filter((entry): entry is [string, ItemInstance] =>
    !!entry[1] && typeof entry[1] === 'object' && !Array.isArray(entry[1]));
}

/** 展示态只读派生，不覆盖入包实例，不增加存档字段。后列的状态优先。 */
export function resolveItemPresentation(save: ItemPresentationView | null | undefined, itemId: string, instance?: ItemInstance): { name: string; description: string } {
  const runtime = save?.世界?.状态?.剧本模组 as RuntimeState | undefined;
  const inventory = inventoryItemEntries(save?.角色?.背包?.物品);
  const held = inventory.find(([key, item]) => (item.物品ID || key) === itemId)?.[1];
  const item = instance || held;
  const definition = catalogItem(itemId);
  const matches = (condition: ItemPresentationCondition): boolean => {
    switch (condition.kind) {
      case 'held': return !!held && Number(held.数量) > 0;
      case 'preparation': return !!runtime?.eventActionStates?.[condition.eventId]?.preparations?.includes(condition.preparation);
      case 'eventCompleted': return eventEverCompleted(runtime, condition.eventId, condition.stageId);
    }
  };
  const state = definition?.states?.slice().reverse().find(state => state.when.every(matches));
  return {
    name: state?.name || item?.名称 || definition?.name || itemId,
    description: state?.description || item?.描述 || definition?.description || '',
  };
}
