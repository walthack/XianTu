import type { CurrencyAsset, CurrencySettings, Inventory } from '@/types/game';

export const DEFAULT_BASE_CURRENCY_ID = '灵石_下品';

export type DefaultCurrencyId =
  | '灵石_下品'
  | '灵石_中品'
  | '灵石_上品'
  | '灵石_极品'
  | '铜铢'
  | '银铢'
  | '金铢';

// 世俗币按六朝原文正典：铜铢/银铢/金铢，1银铢=100铜铢，1金铢=20银铢(=2000铜铢)，千枚铜铢=1贯。
// 灵石↔铢 锚定为游戏约定：1下品灵石≈10金铢（金铢价值度0.1，与旧"金锭"同量级，旧档1:1迁移不失值）。
export const DEFAULT_CURRENCIES: Record<DefaultCurrencyId, Omit<CurrencyAsset, '数量'>> = {
  灵石_下品: { 币种: '灵石_下品', 名称: '下品灵石', 价值度: 1, 描述: '修士通用货币（基准单位）', 图标: 'Gem' },
  灵石_中品: { 币种: '灵石_中品', 名称: '中品灵石', 价值度: 100, 描述: '约等于 100 下品灵石', 图标: 'Gem' },
  灵石_上品: { 币种: '灵石_上品', 名称: '上品灵石', 价值度: 10000, 描述: '约等于 100 中品灵石', 图标: 'Gem' },
  灵石_极品: { 币种: '灵石_极品', 名称: '极品灵石', 价值度: 1000000, 描述: '约等于 100 上品灵石', 图标: 'Gem' },
  铜铢: { 币种: '铜铢', 名称: '铜铢', 价值度: 0.00005, 描述: '六朝世俗小额货币；千枚为一贯', 图标: 'Coins' },
  银铢: { 币种: '银铢', 名称: '银铢', 价值度: 0.005, 描述: '六朝世俗中额货币（1银铢=100铜铢）', 图标: 'HandCoins' },
  金铢: { 币种: '金铢', 名称: '金铢', 价值度: 0.1, 描述: '六朝世俗大额货币（1金铢=20银铢；日常罕用）', 图标: 'BadgeDollarSign' },
};

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
      if (wallet[id].价值度 <= 0) wallet[id].价值度 = def.价值度;
      if (!wallet[id].名称) wallet[id].名称 = def.名称;
      if (!wallet[id].图标) wallet[id].图标 = def.图标;
    }
  }
}

export function migrateLegacySpiritStonesToWallet(backpack: any) {
  if (!backpack || typeof backpack !== 'object') return;
  ensureCurrencySettings(backpack);
  const wallet = ensureCurrencyWallet(backpack);

  const legacy = backpack.灵石;
  const hasLegacy = legacy && typeof legacy === 'object' && !Array.isArray(legacy);

  const legacyLow = hasLegacy ? clampNumber(legacy.下品, 0, 9e15, 0) : 0;
  const legacyMid = hasLegacy ? clampNumber(legacy.中品, 0, 9e15, 0) : 0;
  const legacyHigh = hasLegacy ? clampNumber(legacy.上品, 0, 9e15, 0) : 0;
  const legacySupreme = hasLegacy ? clampNumber(legacy.极品, 0, 9e15, 0) : 0;
  const legacySum = legacyLow + legacyMid + legacyHigh + legacySupreme;

  const walletLow = clampNumber(wallet['灵石_下品']?.数量, 0, 9e15, 0);
  const walletMid = clampNumber(wallet['灵石_中品']?.数量, 0, 9e15, 0);
  const walletHigh = clampNumber(wallet['灵石_上品']?.数量, 0, 9e15, 0);
  const walletSupreme = clampNumber(wallet['灵石_极品']?.数量, 0, 9e15, 0);
  const walletSum = walletLow + walletMid + walletHigh + walletSupreme;

  // 迁移策略：
  // - wallet 里没有任何灵石字段：直接迁移
  // - wallet 里有默认币种但全为 0，而 legacy 有数值：认为是“未迁移但已初始化默认币种”，仍然迁移
  const walletHasStoneKey =
    '灵石_下品' in wallet ||
    '灵石_中品' in wallet ||
    '灵石_上品' in wallet ||
    '灵石_极品' in wallet;

  if (hasLegacy && legacySum > 0 && (!walletHasStoneKey || walletSum === 0)) {
    wallet['灵石_下品'] = { ...(DEFAULT_CURRENCIES.灵石_下品 as any), ...wallet['灵石_下品'], 数量: legacyLow };
    wallet['灵石_中品'] = { ...(DEFAULT_CURRENCIES.灵石_中品 as any), ...wallet['灵石_中品'], 数量: legacyMid };
    wallet['灵石_上品'] = { ...(DEFAULT_CURRENCIES.灵石_上品 as any), ...wallet['灵石_上品'], 数量: legacyHigh };
    wallet['灵石_极品'] = { ...(DEFAULT_CURRENCIES.灵石_极品 as any), ...wallet['灵石_极品'], 数量: legacySupreme };
  }
}

export function syncWalletToLegacySpiritStones(backpack: any) {
  if (!backpack || typeof backpack !== 'object') return;
  const wallet = backpack.货币;
  if (!wallet || typeof wallet !== 'object' || Array.isArray(wallet)) return;

  const low = clampNumber(wallet['灵石_下品']?.数量, 0, 9e15, 0);
  const mid = clampNumber(wallet['灵石_中品']?.数量, 0, 9e15, 0);
  const high = clampNumber(wallet['灵石_上品']?.数量, 0, 9e15, 0);
  const supreme = clampNumber(wallet['灵石_极品']?.数量, 0, 9e15, 0);

  if (!backpack.灵石 || typeof backpack.灵石 !== 'object' || Array.isArray(backpack.灵石)) {
    backpack.灵石 = { 下品: 0, 中品: 0, 上品: 0, 极品: 0 };
  }
  backpack.灵石.下品 = low;
  backpack.灵石.中品 = mid;
  backpack.灵石.上品 = high;
  backpack.灵石.极品 = supreme;
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
  ensureCurrencyWallet(backpack);

  // 0) 旧世俗币名 → 六朝铢系（铜币/银两/金锭 → 铜铢/银铢/金铢）
  migrateLegacyCurrencyNames(backpack);

  // 1) 兼容旧存档：先把灵石四档迁移到货币里（仅在货币未初始化时）
  migrateLegacySpiritStonesToWallet(backpack);

  // 2) 规范化 wallet（剔除无效项）
  const wallet = backpack.货币 as Record<string, any>;
  const normalizedWallet: Record<string, CurrencyAsset> = {};
  for (const [id, raw] of Object.entries(wallet)) {
    const normalized = normalizeCurrencyAsset(id, raw);
    if (!normalized) continue;
    normalizedWallet[id] = normalized;
  }
  backpack.货币 = normalizedWallet;

  // 3) 补默认币种（尊重禁用列表）
  ensureDefaultCurrencies(backpack);

  // 4) 同步回旧字段，保证旧 UI/逻辑仍可用
  syncWalletToLegacySpiritStones(backpack);
}

export function normalizeInventoryCurrencies(inventory: Inventory | null | undefined) {
  if (!inventory || typeof inventory !== 'object') return;
  normalizeBackpackCurrencies(inventory as any);
}
