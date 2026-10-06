import type { SaveData } from '@/types/game';
import defaults from '../../../mod-kit/location-loot.qingyu.json';
import { canonicalLocationId } from './travel/locationIds';
import { currentLocation } from './travel/travelLedger';
import { settleScenarioInventoryTransfers } from './inventoryTransactions';

export interface LocationLootEntry {
  id: string; itemId?: string; category: 'key' | 'common' | 'rare' | 'currency';
  currency?: '铜铢' | '银铢' | '金铢'; large?: boolean; weight?: number; chance?: number;
  quantity: [number, number]; once?: boolean; afterEventIds?: string[];
}
export interface LocationLootTable {
  version: number;
  rules: { maxSearches: number; commonSlots: number[]; rareChance: number; largeCurrencyChance: number; maxCopperPerSearch: number };
  locations: Record<string, { name: string; status: 'pending' | 'ready'; entries: LocationLootEntry[]; maxCopper?: number; kind?: 'ordinary' | 'special' }>;
}
export interface LocationLootReceipt {
  id: string; locationId: string; attempt: number; seed: number; turn: number;
  drops: Array<{ entryId: string; itemId?: string; name: string; quantity: number; currency?: string }>;
}
export interface LocationLootState {
  version: 1; seed: number; searches: Record<string, number>; claimed: string[];
  claimedItemIds: string[]; receipts: LocationLootReceipt[];
}
export const QINGYU_LOOT_TABLE = defaults as unknown as LocationLootTable;
export function isLocationLootInput(input: string): boolean {
  return /^(?:我)?(?:要|想|试着|打算)?搜刮(?:这里|此处|当前地点|一番|一下)?[。！!\s]*$/.test(input.trim());
}
function hash(text: string): number {
  let n = 2166136261;
  for (const c of text) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
/** 存档身份与创建时刻派生初始种子；首个成功搜刮时持久化，重载/重试不改骰。 */
export function settleLocationLoot(save: SaveData, table = QINGYU_LOOT_TABLE) {
  const runtime = (save as any).世界?.状态?.剧本模组;
  const locationId = canonicalLocationId(currentLocation(save, runtime?.canon?.locations).locationId);
  const location = locationId ? table.locations[locationId] : undefined;
  if (!runtime || !locationId || !location || location.status !== 'ready') return { status: 'pending' as const, text: '此处的搜刮清单尚未配置，本次不消耗搜刮次数。' };
  const initialSeed = hash(JSON.stringify([(save as any).角色?.身份, (save as any).元数据?.创建时间, (save as any).元数据?.版本]));
  const state: LocationLootState = runtime.locationLoot || { version: 1, seed: initialSeed, searches: {}, claimed: [], claimedItemIds: [], receipts: [] };
  const turn = Number(runtime.worldTurn) || 0;
  const id = `loot:${locationId}:${turn}`;
  const replay = state.receipts.find(r => r.id === id);
  if (replay) return { status: 'replay' as const, receipt: replay, text: lootReceiptText(replay) };
  if ((state.searches[locationId] || 0) >= table.rules.maxSearches) return { status: 'exhausted' as const, text: '你已经仔细搜刮过这里三次，没有新的搜刮机会。' };
  const attempt = (state.searches[locationId] || 0) + 1;
  let rng = hash(`${state.seed}:${locationId}:${attempt}`);
  const seed = rng;
  const roll = () => { rng = (rng + 0x6D2B79F5) >>> 0; let t = Math.imul(rng ^ (rng >>> 15), 1 | rng); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const knownItems = new Set((runtime.canon?.items || []).filter((i: any) => !i.storyItem).map((i: any) => i.id));
  // 当前关进度切关会清空；行旅账保留已结算事件，不反向污染当前关 rail。
  const completed = new Set([...(runtime.completedEventIds || []), ...(runtime.travelLedger?.doneEventIds || [])]);
  // Palace search and the F10 reward are independent sources; search's own once marker remains authoritative.
  const independentBattleLoot = (e: LocationLootEntry) => locationId === 'liuchao.location.gui_wang_gong'
    && e.category !== 'key' && ['lcq.item.f10_broken_axe', 'lcq.item.nh_niche_crystal'].includes(e.itemId || '');
  const eligible = location.entries.filter(e => e.id && (e.category === 'currency' || (e.itemId && knownItems.has(e.itemId)))
    && (!e.afterEventIds || e.afterEventIds.every(id => completed.has(id)))
    && (!(e.once || e.category === 'key') || (!state.claimed.includes(`${locationId}:${e.id}`)
      && !(e.itemId && !independentBattleLoot(e) && (state.claimedItemIds.includes(e.itemId) || Number((save as any).角色?.背包?.物品?.[e.itemId]?.数量) > 0 || (runtime.inventoryTransferReceipts || []).some((r: any) => r.itemId === e.itemId))))));
  for (const e of eligible) if (!Number.isInteger(e.quantity?.[0]) || !Number.isInteger(e.quantity?.[1]) || e.quantity[0] < 1 || e.quantity[1] < e.quantity[0] || !Number.isFinite(e.weight ?? 1)) throw new Error('搜刮条目配置无效');
  for (const e of eligible) {
    if (!['key', 'common', 'rare', 'currency'].includes(e.category) || (e.category === 'currency' && e.currency && !['铜铢', '银铢', '金铢'].includes(e.currency)) || (e.weight !== undefined && e.weight <= 0) || (e.chance !== undefined && (!Number.isFinite(e.chance) || e.chance < 0 || e.chance > 1))) throw new Error('搜刮分类、币种或概率配置无效');
  }
  if (!Number.isInteger(table.rules.maxSearches) || table.rules.maxSearches < 1 || ![...table.rules.commonSlots, table.rules.rareChance, table.rules.largeCurrencyChance].every(p => Number.isFinite(p) && p >= 0 && p <= 1)) throw new Error('搜刮规则配置无效');
  const picked: LocationLootEntry[] = [];
  const pick = (entries: LocationLootEntry[]) => {
    const pool = entries.filter(e => !picked.includes(e));
    const total = pool.reduce((n, e) => n + Math.max(0, e.weight ?? 1), 0);
    if (!total) return;
    let cursor = roll() * total;
    for (const entry of pool) { cursor -= Math.max(0, entry.weight ?? 1); if (cursor < 0) { picked.push(entry); return; } }
  };
  for (const e of eligible.filter(e => e.category === 'key')) if (roll() < (e.chance ?? 1)) picked.push(e);
  for (const chance of table.rules.commonSlots) if (roll() < chance) pick(eligible.filter(e => e.category === 'common' || (e.category === 'currency' && !e.large)));
  if (roll() < table.rules.rareChance) pick(eligible.filter(e => e.category === 'rare'));
  if (roll() < table.rules.largeCurrencyChance) pick(eligible.filter(e => e.category === 'currency' && e.large));
  const receipt: LocationLootReceipt = { id, locationId, attempt, seed, turn, drops: [] };
  let moneyLeft = Math.max(0, location.kind === 'special' ? location.maxCopper ?? 80 : Math.min(80, location.maxCopper ?? table.rules.maxCopperPerSearch));
  for (const entry of picked) {
    const [lo, hi] = entry.quantity;
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 1 || hi < lo) throw new Error('搜刮数量区间无效');
    let quantity = ['key', 'rare'].includes(entry.category) ? 1 : lo + Math.floor(roll() * (hi - lo + 1));
    if (entry.category === 'currency') {
      const currency = entry.currency || '铜铢';
      const rate = currency === '金铢' ? 2000 : currency === '银铢' ? 100 : 1;
      quantity = Math.min(quantity, Math.floor(moneyLeft / rate));
      if (!quantity) continue;
      moneyLeft -= quantity * rate;
      const backpack = (save as any).角色.背包 ||= {};
      const currencies = backpack.货币 ||= {};
      const record = currencies[currency] ||= { 币种: currency, 名称: currency, 数量: 0 };
      record.数量 = (Number(record.数量) || 0) + quantity;
      receipt.drops.push({ entryId: entry.id, name: currency, currency, quantity });
    } else {
      const settlements = settleScenarioInventoryTransfers(save, runtime, { inventoryTransfers: [{ transferId: `${id}:${entry.id}`, itemId: entry.itemId!, quantity }] }, { eventId: id, actionId: 'scavenge', outcome: 'success' });
      if (!settlements.length) continue;
      receipt.drops.push({ entryId: entry.id, itemId: entry.itemId, name: settlements[0].receipt.itemName, quantity });
      if (entry.category === 'key') state.claimedItemIds.push(entry.itemId!);
    }
    if (entry.once || entry.category === 'key') state.claimed.push(`${locationId}:${entry.id}`);
  }
  state.searches[locationId] = attempt;
  state.receipts.push(receipt);
  runtime.locationLoot = state;
  return { status: 'settled' as const, receipt, text: lootReceiptText(receipt) };
}
export function lootReceiptText(receipt: LocationLootReceipt): string {
  return receipt.drops.length ? `你搜刮后收好${receipt.drops.map(d => `${d.name}×${d.quantity}`).join('、')}。` : '你仔细搜刮了一番，没有找到可带走的东西。';
}

/** 演出只允许收好本次回执物，不约束玩家观察清单外的物件。 */
export function validateLootNarrative(text: string, receipt: LocationLootReceipt, items: Array<{ id: string; name: string }> = []): void {
  if (receipt.drops.some(drop => !text.includes(drop.name))) throw new Error('搜刮正文遗漏本次已入账物品');
  const clauses = text.split(/[。！？\n]/);
  const labels = ['铜铢', '银铢', '金铢', ...Object.values(QINGYU_LOOT_TABLE.locations).flatMap(loc => loc.entries.map(entry => entry.currency || items.find(item => item.id === entry.itemId)?.name))];
  const allowed = new Set(receipt.drops.map(drop => drop.name));
  for (const clause of clauses) {
    if (!/(?:你|我)[^。！？]{0,20}(?:找到|收好|收下|带走|获得|得到|拿到|装进|拾起|捡起|收入)/.test(clause) || /没有|没找到|未找到|不能带走|只看|没有带走/.test(clause)) continue;
    if (labels.some(name => name && clause.includes(name) && !allowed.has(name))) throw new Error('搜刮正文声称取得回执外物品');
  }
}
