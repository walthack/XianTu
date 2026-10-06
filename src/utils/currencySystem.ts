import {GAME_NUMBERS} from '../modules/sceneModule/numbers';
import type { CurrencyAsset, CurrencySettings, Inventory } from '@/types/game';

import table from '../../mod-kit/entity-catalog/currencies.json';
export const DEFAULT_BASE_CURRENCY_ID = '铜铢';
export type DefaultCurrencyId = '铜铢'|'银铢'|'金铢';
export const DEFAULT_CURRENCIES = Object.fromEntries(table.entries.map(e => [e.definition.walletKey,{币种:e.definition.walletKey,名称:e.definition.name,get 价值度(){return GAME_NUMBERS.currency[e.id as keyof typeof GAME_NUMBERS.currency];},图标:e.definition.icon}])) as Record<DefaultCurrencyId,Omit<CurrencyAsset,'数量'>>;

/** 旧币名 → 六朝正典铢系（旧档 1:1 迁移；比值差异属叙事口径，不做折算）。 */
const LEGACY_CURRENCY_RENAMES: Record<string, DefaultCurrencyId> = {
  铜币: '铜铢',
  银两: '银铢',
  金锭: '金铢',
};

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(min, Math.min(max, value));
  if (typeof value === 'string') {
    const n = Number(value.trim());
    if (Number.isFinite(n)) return Math.max(min, Math.min(max, n));
  }
  return fallback;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function ensureCurrencySettings(backpack: any): CurrencySettings {
  const raw = backpack?.货币设置;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    backpack.货币设置 = { 禁用币种: [], 基准币种: DEFAULT_BASE_CURRENCY_ID };
    return backpack.货币设置 as CurrencySettings;
  }
  if (!Array.isArray(raw.禁用币种)) raw.禁用币种 = [];
  raw.禁用币种 = raw.禁用币种.filter((v: any) => typeof v === 'string' && v.trim());
  if (typeof raw.基准币种 !== 'string' || !raw.基准币种.trim()) raw.基准币种 = DEFAULT_BASE_CURRENCY_ID;
  return raw as CurrencySettings;
}

export function ensureCurrencyWallet(backpack: any): Record<string, CurrencyAsset> {
  const raw = backpack?.货币;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    backpack.货币 = {};
    return backpack.货币 as Record<string, CurrencyAsset>;
  }
  return raw as Record<string, CurrencyAsset>;
}

export function normalizeCurrencyAsset(id: string, value: any): CurrencyAsset | null {
  const keyId = normalizeString(id);
  if (!keyId) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const 币种 = normalizeString(value.币种) || keyId;
  const 名称 = normalizeString(value.名称) || keyId;
  const 数量 = clampNumber(value.数量, 0, 9e15, 0);
  const 价值度 = clampNumber(value.价值度, 0, 9e15, 0);
  const 描述 = normalizeString(value.描述) || undefined;
  const 图标 = normalizeString(value.图标) || undefined;

  return { 币种, 名称, 数量, 价值度, 描述, 图标 };
}

export function ensureDefaultCurrencies(backpack: any) {
  const settings = ensureCurrencySettings(backpack);
  const wallet = ensureCurrencyWallet(backpack);
  const disabled = new Set(settings.禁用币种);

  for (const [id, def] of Object.entries(DEFAULT_CURRENCIES)) {
    const existing = wallet[id];
    if (existing == null || typeof existing !== 'object') {
      if (disabled.has(id)) continue;
      wallet[id] = { ...def, 数量: 0 };
    } else {
      const normalized = normalizeCurrencyAsset(id, existing);
      wallet[id] = normalized ? { ...def, ...normalized, 数量: normalized.数量 } : { ...def, 数量: 0 };
      wallet[id].价值度 = def.价值度;
      if (!wallet[id].名称) wallet[id].名称 = def.名称;
      if (!wallet[id].图标) wallet[id].图标 = def.图标;
    }
  }
}

/** 旧世俗币名(铜币/银两/金锭)迁移为六朝正典铢系；数量并入新币种，删除旧键。幂等。 */
export function migrateLegacyCurrencyNames(backpack: any) {
  if (!backpack || typeof backpack !== 'object') return;
  const wallet = ensureCurrencyWallet(backpack);
  for (const [oldId, newId] of Object.entries(LEGACY_CURRENCY_RENAMES)) {
    const old = wallet[oldId];
    if (!old || typeof old !== 'object') continue;
    const qty = clampNumber((old as any).数量, 0, 9e15, 0);
    const def = DEFAULT_CURRENCIES[newId];
    const existing = wallet[newId];
    const existingQty = existing ? clampNumber((existing as any).数量, 0, 9e15, 0) : 0;
    wallet[newId] = { ...def, 数量: existingQty + qty };
    delete wallet[oldId];
  }
}

export function normalizeBackpackCurrencies(backpack: any) {
  if (!backpack || typeof backpack !== 'object') return;

  ensureCurrencySettings(backpack);
  backpack.货币设置.基准币种 = DEFAULT_BASE_CURRENCY_ID;
  delete backpack.灵石;
  ensureCurrencyWallet(backpack);

  // 0) 旧世俗币名 → 六朝铢系（铜币/银两/金锭 → 铜铢/银铢/金铢）
  migrateLegacyCurrencyNames(backpack);

  // 不折算旧灵石资产。


  // 2) 规范化 wallet（剔除无效项）
  const wallet = backpack.货币 as Record<string, any>;
  const normalizedWallet: Record<string, CurrencyAsset> = {};
  for (const [id, raw] of Object.entries(wallet)) {
    const normalized = normalizeCurrencyAsset(id, raw);
    if (!normalized || !(id in DEFAULT_CURRENCIES)) continue;
    normalizedWallet[id] = normalized;
  }
  backpack.货币 = normalizedWallet;

  // 3) 补默认币种（尊重禁用列表）
  ensureDefaultCurrencies(backpack);

  // 仅保留铢系钱包。

}

export function normalizeInventoryCurrencies(inventory: Inventory | null | undefined) {
  if (!inventory || typeof inventory !== 'object') return;
  normalizeBackpackCurrencies(inventory as any);
}
