/**
 * 药铺／商人进货（配置 game-numbers.shop，来自 mod-kit/numbers-progress.json）：在所列地点按配置价格买药。
 * 价格、库存地点全在配置；本文件不写数值。扣金铢、给物品走存档背包；不在售地点、金铢不足都不成交、不扣费。
 */
import type { SaveData } from '@/types/game';
import { DEFAULT_CURRENCIES } from '../../utils/currencySystem';
import { GAME_NUMBERS } from '../sceneModule/numbers';
import { catalogItem } from './entityCatalog';
import { itemSaveQuality } from './itemGrades';
import { canonicalLocationId } from './travel/locationIds';
import { currentLocation } from './travel/travelLedger';

export interface ShopSite { name: string; stock: Array<{ itemId: string; price: number }> }
export const shopConfig = (): { sites: Record<string, ShopSite> } => (GAME_NUMBERS as unknown as { shop: { sites: Record<string, ShopSite> } }).shop;

export function shopHere(save: SaveData): { locationId: string; site: ShopSite } | undefined {
  const runtime = (save as any).世界?.状态?.剧本模组;
  const id = canonicalLocationId(currentLocation(save, runtime?.canon?.locations).locationId);
  const site = id ? shopConfig().sites[id] : undefined;
  return id && site ? { locationId: id, site } : undefined;
}

export type PurchaseResult = { ok: true; paid: number; itemId: string } | { ok: false; reason: 'no_shop' | 'not_sold' | 'no_money' | 'bad_quantity' };

export function purchaseItem(save: SaveData, itemId: string, quantity = 1): PurchaseResult {
  if (!Number.isInteger(quantity) || quantity < 1) return { ok: false, reason: 'bad_quantity' };
  const here = shopHere(save);
  if (!here) return { ok: false, reason: 'no_shop' };
  const line = here.site.stock.find(row => row.itemId === itemId);
  if (!line) return { ok: false, reason: 'not_sold' };
  const inventory = (save as any).角色?.背包;
  const gold = Number(inventory?.货币?.金铢?.数量) || 0, total = line.price * quantity;
  if (!inventory || gold < total) return { ok: false, reason: 'no_money' };
  const runtime = (save as any).世界?.状态?.剧本模组;
  const item = catalogItem(itemId, runtime?.modId);
  if (!item) return { ok: false, reason: 'not_sold' };
  inventory.货币.金铢 = { ...DEFAULT_CURRENCIES.金铢, ...inventory.货币.金铢, 数量: gold - total };
  inventory.物品 ||= {};
  const held = inventory.物品[itemId];
  if (held) held.数量 = (Number(held.数量) || 0) + quantity;
  else inventory.物品[itemId] = { 物品ID: item.id, 名称: item.name, 类型: '丹药', 品质: itemSaveQuality((item as any).grade, () => ({ quality: '凡', grade: 1 })), 数量: quantity, 描述: item.description, 已装备: false };
  return { ok: true, paid: total, itemId };
}
