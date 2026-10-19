/**
 * 已验证剧情动作的固定交易（从冻结的 runtime.ts settleEarlyStoryTrade 迁出数值，2026-10-19 小批解冻）。
 * 交易表与金额只读数值配置 story.trades；回执 trade.<eventId>.<actionId> 避免读档 / 重复结算再次收付。
 */
import type { SaveData } from '@/types/game';
import { DEFAULT_CURRENCIES } from '../../utils/currencySystem';
import { catalogItem } from './entityCatalog';
import { GAME_NUMBERS } from '../sceneModule/numbers';

export interface StoryTrade { eventId: string; actionId: string; goldDelta?: number; grantItemId?: string; removeItemId?: string }

export const storyTrades = (): StoryTrade[] => ((GAME_NUMBERS as any).story?.trades || []) as StoryTrade[];

export function settleStoryTrade(saveData: SaveData, runtime: { flags: Record<string, any>; modId?: string }, eventId: string, actionId: string): void {
  const key = `trade.${eventId}.${actionId}`;
  if (runtime.flags[key]) return;
  const trade = storyTrades().find(t => t.eventId === eventId && t.actionId === actionId);
  if (!trade) return;
  const inventory = (saveData as any).角色?.背包;
  if (!inventory) return;
  if (Number.isFinite(trade.goldDelta) && trade.goldDelta) {
    inventory.货币 ||= {};
    const gold = inventory.货币.金铢 || { ...DEFAULT_CURRENCIES.金铢, 数量: 0 };
    inventory.货币.金铢 = { ...gold, ...DEFAULT_CURRENCIES.金铢, 数量: Math.max(0, (Number(gold.数量) || 0) + Number(trade.goldDelta)) };
  }
  inventory.物品 ||= {};
  if (trade.grantItemId) {
    const item = catalogItem(trade.grantItemId, runtime.modId)!;
    inventory.物品[trade.grantItemId] = { 物品ID: item.id, 名称: item.name, 类型: '其他', 品质: { quality: '凡', grade: 0 }, 数量: 1, 描述: item.description, 已装备: false };
  }
  if (trade.removeItemId) delete inventory.物品[trade.removeItemId];
  runtime.flags[key] = true;
}
