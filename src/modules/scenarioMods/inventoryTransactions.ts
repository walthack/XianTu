import type { SaveData } from '@/types/game';

import type { ScenarioModItem, ScenarioPlayerCompletionEffects, ScenarioPlayerCompletionOutcome } from './schema';

export interface ScenarioInventoryTransferReceipt {
  transferId: string;
  itemId: string;
  itemName: string;
  quantity: number;
  sourceEventId: string;
  actionId: string;
  outcome: ScenarioPlayerCompletionOutcome;
  settledAtTurn: number;
}

export interface ScenarioInventorySettlement {
  receipt: ScenarioInventoryTransferReceipt;
  key: string;
  oldValue: unknown;
  newValue: unknown;
}

interface InventoryTransactionRuntime {
  worldTurn?: number;
  canon?: { items?: ScenarioModItem[] };
  inventoryTransferReceipts?: ScenarioInventoryTransferReceipt[];
}

const QUALITY_MAP: Record<string, { quality: string; grade: number }> = {
  神器: { quality: '神', grade: 10 }, 神级: { quality: '神', grade: 10 }, 神品: { quality: '神', grade: 9 },
  仙品: { quality: '仙', grade: 9 }, 唯一: { quality: '仙', grade: 9 }, 极品: { quality: '仙', grade: 8 },
  天品: { quality: '天', grade: 7 }, 天级: { quality: '天', grade: 7 }, 上品: { quality: '天', grade: 6 },
  地品: { quality: '地', grade: 5 }, 地级: { quality: '地', grade: 5 },
  玄品: { quality: '玄', grade: 4 }, 玄级: { quality: '玄', grade: 4 }, 灵品: { quality: '玄', grade: 4 },
  中品: { quality: '黄', grade: 3 }, 黄品: { quality: '黄', grade: 3 }, 黄级: { quality: '黄', grade: 3 },
  下品: { quality: '凡', grade: 1 }, 凡品: { quality: '凡', grade: 0 }, 凡: { quality: '凡', grade: 0 },
};

function parseQuality(grade?: string): { quality: string; grade: number } {
  if (grade && QUALITY_MAP[grade]) return { ...QUALITY_MAP[grade] };
  for (const quality of ['神', '仙', '天', '地', '玄', '黄', '凡']) {
    if (grade?.includes(quality)) return { quality, grade: 3 };
  }
  return { quality: '凡', grade: 0 };
}

function inventoryType(type: ScenarioModItem['type']): '装备' | '丹药' | '材料' | '其他' {
  if (type === 'weapon' || type === 'armor') return '装备';
  if (type === 'consumable') return '丹药';
  if (type === 'material') return '材料';
  return '其他';
}

function canonicalInventoryItem(item: ScenarioModItem, quantity: number, existing?: Record<string, unknown>) {
  return {
    ...(existing || {}),
    物品ID: item.id,
    名称: item.name,
    类型: inventoryType(item.type),
    品质: parseQuality(item.grade),
    数量: quantity,
    描述: item.description || '',
    已装备: existing?.已装备 === true,
    ...(item.attributeBonus ? { 装备增幅: structuredClone(item.attributeBonus) } : {}),
  };
}

function ensureInventory(saveData: SaveData): Record<string, Record<string, unknown>> {
  const root = saveData as unknown as {
    角色?: { 背包?: { 物品?: unknown } };
  };
  const role = (root.角色 ??= {});
  const backpack = (role.背包 ??= {});
  if (!backpack.物品 || typeof backpack.物品 !== 'object' || Array.isArray(backpack.物品)) backpack.物品 = {};
  return backpack.物品 as Record<string, Record<string, unknown>>;
}

/**
 * 结算剧本动作明确声明的物品转移。
 *
 * - 物品数据只取模组 catalog，不从正文猜名字/品级。
 * - transferId 已有回执时 no-op，重试、刷新和重复处理不会多发。
 * - 背包与回执在同一个本地调用中写入；LLM 不能参与或改写结果。
 */
export function settleScenarioInventoryTransfers(
  saveData: SaveData,
  runtime: InventoryTransactionRuntime,
  effects: ScenarioPlayerCompletionEffects | undefined,
  source: {
    eventId: string;
    actionId: string;
    outcome: ScenarioPlayerCompletionOutcome;
  },
): ScenarioInventorySettlement[] {
  const transfers = effects?.inventoryTransfers || [];
  if (transfers.length === 0) return [];

  const catalog = new Map((runtime.canon?.items || []).map(item => [item.id, item]));
  const receipts = runtime.inventoryTransferReceipts ||= [];
  const settledIds = new Set(receipts.map(receipt => receipt.transferId));
  const inventory = ensureInventory(saveData);
  const settlements: ScenarioInventorySettlement[] = [];
  const turn = Math.max(0, Number(runtime.worldTurn) || 0);

  for (const transfer of transfers) {
    if (settledIds.has(transfer.transferId)) continue;
    const item = catalog.get(transfer.itemId);
    const quantity = Number(transfer.quantity);
    if (!item || !Number.isInteger(quantity) || quantity < 1) continue;

    const oldValue = inventory[item.id] ? structuredClone(inventory[item.id]) : undefined;
    const oldQuantity = Number(inventory[item.id]?.数量);
    const nextQuantity = (Number.isFinite(oldQuantity) && oldQuantity > 0 ? oldQuantity : 0) + quantity;
    const newValue = canonicalInventoryItem(item, nextQuantity, inventory[item.id]);
    inventory[item.id] = newValue;

    const receipt: ScenarioInventoryTransferReceipt = {
      transferId: transfer.transferId,
      itemId: item.id,
      itemName: item.name,
      quantity,
      sourceEventId: source.eventId,
      actionId: source.actionId,
      outcome: source.outcome,
      settledAtTurn: turn,
    };
    receipts.push(receipt);
    settledIds.add(transfer.transferId);
    settlements.push({
      receipt,
      key: `角色.背包.物品.${item.id}`,
      oldValue,
      newValue: structuredClone(newValue),
    });
  }

  return settlements;
}
