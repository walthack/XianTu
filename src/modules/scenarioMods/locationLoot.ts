import type { SaveData } from '@/types/game';
import defaults from '../../../mod-kit/location-loot.qingyu.json';
import { canonicalLocationId } from './travel/locationIds';
import { currentLocation } from './travel/travelLedger';
import { settleScenarioInventoryTransfers } from './inventoryTransactions';
import { DEFAULT_CURRENCIES, type DefaultCurrencyId } from '../../utils/currencySystem';
import { scenarioPlayerId } from './playerIdentity';

export interface LocationLootEntry {
  id: string; itemId?: string; category: 'key' | 'common' | 'rare' | 'currency' | 'boss';
  currency?: '铜铢' | '银铢' | '金铢'; large?: boolean; weight?: number; chance?: number;
  quantity: [number, number]; once?: boolean; afterEventIds?: string[];
}
export interface LocationLootTable {
  version: number;
  rules: { maxSearches: number; commonSlots: number[]; rareChance: number; largeCurrencyChance: number; maxCopperPerSearch: number; /** boss 场景专属：每次搜刮各自独立判定的缺省几率（条目 chance 可覆盖）。 */ bossChance?: number; /** 搜到仙品/神品时队友评价的触发概率。 */ companionRemarkChance?: number };
  locations: Record<string, { name: string; status: 'pending' | 'ready'; entries: LocationLootEntry[]; maxCopper?: number; kind?: 'ordinary' | 'special'; /** 可选：本地点的稀有几率，覆盖 rules.rareChance。 */ rareChance?: number }>;
}
export interface LocationLootReceipt {
  id: string; locationId: string; attempt: number; seed: number; turn: number;
  drops: Array<{ entryId: string; itemId?: string; name: string; quantity: number; currency?: string; grade?: string;
    /** 队友评价信号（2026-10-20）：只给品级与在场队友 id，评价怎么说交主持模型按各自性格写。 */
    队友评价?: { 品级: string; 在场队友: string[] } }>;
  companionRemark?: { itemId: string; grade: string; companionIds: string[] };
}
export interface LocationLootState {
  version: 1; seed: number; searches: Record<string, number>; claimed: string[];
  claimedItemIds: string[]; receipts: LocationLootReceipt[];
}
export const QINGYU_LOOT_TABLE = defaults as unknown as LocationLootTable;
export function isLocationLootInput(input: string): boolean {
  const text = input.trim();
  if (/^(?:我)?(?:要|想|试着|打算)?搜刮(?:这里|此处|当前地点|一番|一下)?[。！!\s]*$/.test(text)) return true;
  // 2026-10-20 用户定：boss 不做死亡掉落；打倒后「搜尸身／搜周围」都走本地点搜刮池。
  const clause = /^(?:我)?(?:又|再)?(?:要|想|试着|打算|去|上前)?(?:搜刮|搜查|搜一搜|搜搜|翻找|搜)(?:一下|一番)?(?:[^，。！!？?\s]{0,8}?的?)?(?:尸身|尸体|尸首|遗骸|残骸|身上|周围|四周|附近|周遭|现场|战场|这里|此处)(?:一下|一番)?[。！!\s]*$/;
  if (clause.test(text)) return true;
  // 2026-10-20 5e8f 真机：「我回到龙神的尸身旁，搜查尸身，翻找四周」整句不匹配，落到叙事模型。
  // 按逗号/顿号拆句：至少一句是搜刮句，其余只能是走近、蹲下这类靠近动作（不夹带逃跑、潜行、攻击等别的意图）。
  const parts = text.split(/[，,、；;。！!…]+/).map(p => p.trim()).filter(Boolean);
  if (parts.length < 2 || !parts.some(p => clause.test(p))) return false;
  const approach = /^(?:我)?(?:又|再)?(?:回到|走到|来到|走近|靠近|凑近|上前到?|蹲下|俯身|弯腰|蹲在)[^，。！!？?\s]{0,12}?(?:旁|边|前|身边|跟前|旁边)?(?:蹲下|俯身)?$/;
  // 补充搜找句（「在龙颅和龙脑处翻找有什么能带走的东西」）：含搜找动词、不夹带逃跑/潜行/攻击/偷藏。
  const extraSearch = (p: string) => /搜刮|搜查|搜寻|翻找|翻检|摸索|找找|带走/.test(p) && !/逃|潜|跑|离开|攻|杀|打|偷|藏|躲|撤/.test(p);
  return parts.every(p => clause.test(p) || approach.test(p) || extraSearch(p));
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
    if (!['key', 'common', 'rare', 'currency', 'boss'].includes(e.category) || (e.category === 'currency' && e.currency && !['铜铢', '银铢', '金铢'].includes(e.currency)) || (e.weight !== undefined && e.weight <= 0) || (e.chance !== undefined && (!Number.isFinite(e.chance) || e.chance < 0 || e.chance > 1))) throw new Error('搜刮分类、币种或概率配置无效');
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
  // 2026-10-20 boss 场景专属：只在 boss 倒下后（afterEventIds）、各只一次（once），按份数入账，几率高于普通稀有槽。
  for (const e of eligible.filter(e => e.category === 'boss')) if (roll() < (e.chance ?? table.rules.bossChance ?? 0)) picked.push(e);
  for (const chance of table.rules.commonSlots) if (roll() < chance) pick(eligible.filter(e => e.category === 'common' || (e.category === 'currency' && !e.large)));
  // 稀有几率：地点可选覆盖 rareChance（boss 地 / 宫殿等高价值场景），缺省用全局 rules.rareChance。
  if (roll() < (location.rareChance ?? table.rules.rareChance)) pick(eligible.filter(e => e.category === 'rare'));
  if (roll() < table.rules.largeCurrencyChance) pick(eligible.filter(e => e.category === 'currency' && e.large));
  const receipt: LocationLootReceipt = { id, locationId, attempt, seed, turn, drops: [] };
  let moneyLeft = Math.max(0, location.kind === 'special' ? location.maxCopper ?? 80 : Math.min(80, location.maxCopper ?? table.rules.maxCopperPerSearch));
  for (const entry of picked) {
    const [lo, hi] = entry.quantity;
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 1 || hi < lo) throw new Error('搜刮数量区间无效');
    let quantity = ['key', 'rare'].includes(entry.category) ? 1 : lo + Math.floor(roll() * (hi - lo + 1));
    if (entry.category === 'currency') {
      const currency = entry.currency || '铜铢';
      const rate = DEFAULT_CURRENCIES[currency as DefaultCurrencyId]?.价值度 ?? 1;
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
  // 搜到仙品/神品：按配置概率给一个队友评价信号（无队友、凡品、珍品不触发）。
  const best = receipt.drops.filter(d => d.itemId && REMARK_GRADES.includes(gradeOf(runtime, d.itemId)))
    .sort((a, b) => REMARK_GRADES.indexOf(gradeOf(runtime, b.itemId!)) - REMARK_GRADES.indexOf(gradeOf(runtime, a.itemId!)))[0];
  const mates = best ? presentCompanionIds(save, runtime) : [];
  if (best && mates.length && roll() < Number(table.rules.companionRemarkChance ?? 0)) {
    const grade = gradeOf(runtime, best.itemId!);
    best.grade = grade; best.队友评价 = { 品级: grade, 在场队友: mates };
    receipt.companionRemark = { itemId: best.itemId!, grade, companionIds: mates };
  }
  state.searches[locationId] = attempt;
  state.receipts.push(receipt);
  runtime.locationLoot = state;
  return { status: 'settled' as const, receipt, text: lootReceiptText(receipt) };
}
/** 触发队友评价的品级（四品里只有仙品、神品）。 */
const REMARK_GRADES = ['仙品', '神品'];
function gradeOf(runtime: any, itemId: string): string {
  return String((runtime?.canon?.items || []).find((i: any) => i?.id === itemId)?.grade || '');
}
/** 在场队友：当前进行中事件的相关角色，去掉主角与已离队/已故的人。 */
export function presentCompanionIds(save: SaveData, runtime: any): string[] {
  const player = scenarioPlayerId(save);
  const gone = new Set<string>([...(runtime?.departedCast || []).map((d: any) => typeof d === 'string' ? d : d?.id)].filter(Boolean));
  const ids = new Set<string>();
  for (const id of runtime?.activeEventIds || []) {
    const ev = (runtime?.events || []).find((e: any) => e?.id === id);
    for (const c of ev?.relatedCharacterIds || []) if (c && c !== player && !gone.has(c)) ids.add(c);
  }
  const protagonist = (runtime?.canon?.characters || []).find((c: any) => c?.isProtagonist)?.id;
  if (protagonist) ids.delete(protagonist);
  return [...ids];
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
