// 搜刮按游戏天数回刷 + 随机战「战后搜尸」另计（用户 2026-10-28 13:48 第5条；总策划 2026-10-28：稀有物只给一次、搜满提示「过些日子再来」）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './loadTs.mjs';
const { settleLocationLoot, grantLootSpoils } = await loadTs('../src/modules/scenarioMods/locationLoot.ts');
const N = await loadTs('../src/modules/sceneModule/numbers.ts');
const registry = await loadTs('../src/modules/sceneModule/numbersRegistry.ts');
const LOC = 'liuchao.location.wuyuan';
const ITEMS = ['key', 'food', 'rare', 'rare2', 'boss', 'trinket'];
function save(day) {
  const s = { 元数据: { 创建时间: '2026-10-04' }, 角色: { 身份: { 名字: '程宗扬' }, 位置: { 描述: '中州·五原' }, 背包: { 物品: {}, 货币: {} } }, 世界: { 状态: { 剧本模组: { modId: 'lcq.stage_02', worldTurn: 1, completedEventIds: [], canon: { locations: [{ id: LOC, name: '五原', region: '中州' }], items: ITEMS.map(id => ({ id: 'item.' + id, name: id, type: 'other', grade: '凡品' })) } } } } };
  if (day !== undefined) setDay(s, day);
  return s;
}
const rt = s => s.世界.状态.剧本模组;
const setDay = (s, day) => { s.元数据.时间 = { 年: 0, 月: 1, 日: day }; };
function table(entries = [], rules = {}, extra = {}) { return { version: 1, rules: { maxSearches: 3, commonSlots: [.65, .25], rareChance: .03, largeCurrencyChance: .02, maxCopperPerSearch: 80, ...rules }, locations: { [LOC]: { name: '五原', status: 'ready', entries }, ...extra } }; }
const food = { id: 'food', itemId: 'item.food', category: 'common', quantity: [1, 2] };
const cash = { id: 'cash', category: 'currency', currency: '铜铢', quantity: [5, 5] };
const key = { id: 'key', itemId: 'item.key', category: 'key', chance: 1, quantity: [1, 1] };
const boss = { id: 'boss', itemId: 'item.boss', category: 'boss', chance: 1, quantity: [1, 1] };
const rare = { id: 'rare', itemId: 'item.rare', category: 'rare', quantity: [1, 1] };
const large = { id: 'large', category: 'currency', currency: '铜铢', large: true, chance: 1, quantity: [10, 10] };
const rich = () => table([food, cash, key, boss, rare, large], { commonSlots: [1, 1], rareChance: 1, largeCurrencyChance: 1 });
const search = (s, t) => { rt(s).worldTurn++; return settleLocationLoot(s, t); };
const ALL = ['common', 'smallCurrency', 'rare', 'largeCurrency', 'key', 'boss'];
async function withNumbers(patch, restore, fn) { N.applyGameNumbers(patch); try { return await fn(); } finally { N.applyGameNumbers(restore); } }
const OLD_EXHAUSTED = '你已经仔细搜刮过这里三次，没有新的搜刮机会。';

test('① 无游戏时间：三次后 exhausted，文案与旧版一字不差、不提回刷', () => {
  const s = save(), t = table([food]);
  for (let i = 0; i < 3; i++) assert.equal(search(s, t).status, 'settled');
  const r = search(s, t);
  assert.equal(r.status, 'exhausted');
  assert.equal(r.text, OLD_EXHAUSTED);
  assert.equal(rt(s).locationLoot.windows, undefined);
});

test('② 第 D 天搜满：D+interval-1 天仍 exhausted（带「过些日子再来」），D+interval 天开新一轮', () => {
  const D = 40, interval = N.GAME_NUMBERS.loot.respawn.intervalDays, s = save(D), t = table([food]);
  for (let i = 0; i < 3; i++) search(s, t);
  assert.deepEqual(rt(s).locationLoot.windows[LOC], { cycle: 0, startDay: D });
  setDay(s, D + interval - 1);
  const ex = search(s, t);
  assert.equal(ex.status, 'exhausted');
  assert.equal(ex.text, OLD_EXHAUSTED + N.GAME_NUMBERS.loot.texts.respawnHint);
  assert.match(ex.text, /过些日子再来/);
  setDay(s, D + interval);
  const r = search(s, t);
  assert.equal(r.status, 'settled');
  assert.equal(r.receipt.cycle, 1);
  assert.equal(r.receipt.kind, 'search');
  assert.equal(rt(s).locationLoot.searches[LOC], 1);
  assert.equal(rt(s).locationLoot.windows[LOC].startDay, D + interval);
  search(s, t); search(s, t);
  assert.equal(search(s, t).status, 'exhausted');
});

test('③ 回刷轮只出普通物与小钱；首轮照旧能出 key / boss / rare / 大额钱', () => {
  const first = save(10);
  const drops0 = settleLocationLoot(first, rich()).receipt.drops.map(d => d.entryId);
  for (const id of ['key', 'boss', 'rare', 'large']) assert.ok(drops0.includes(id), id);
  const s = save(100);
  rt(s).locationLoot = { version: 1, seed: 12345, searches: { [LOC]: 3 }, claimed: [], claimedItemIds: [], receipts: [], windows: { [LOC]: { cycle: 0, startDay: 10 } } };
  for (let i = 0; i < 3; i++) {
    const r = search(s, rich());
    assert.equal(r.receipt.cycle, 1);
    assert.ok(r.receipt.drops.length > 0);
    for (const d of r.receipt.drops) assert.ok(['food', 'cash'].includes(d.entryId), d.entryId);
  }
});

test('④ 首轮拿到的 once / key / 稀有物，即使回刷分类全开也不再出现', async () => {
  const trinket = { id: 'trinket', itemId: 'item.trinket', category: 'common', once: true, quantity: [1, 1], weight: 1000 };
  const t = table([food, key, boss, rare, trinket], { commonSlots: [1], rareChance: 1 });
  await withNumbers({ loot: { respawn: { categories: ALL } } }, { loot: { respawn: { categories: ['common', 'smallCurrency'] } } }, () => {
    const s = save(1);
    const got = search(s, t).receipt.drops.map(d => d.entryId);
    for (const id of ['key', 'boss', 'rare', 'trinket']) assert.ok(got.includes(id), id);
    for (let day = 31; day <= 151; day += 30) {
      setDay(s, day);
      for (let i = 0; i < 3; i++) {
        const r = search(s, t);
        assert.equal(r.status, 'settled');
        for (const d of r.receipt.drops) assert.equal(d.entryId, 'food');
      }
    }
  });
});

test('稀有物一律只给一次：不带 once 的 rare 首轮三次内也不重复', () => {
  const s = save(), t = table([rare], { rareChance: 1 });
  assert.deepEqual(search(s, t).receipt.drops.map(d => d.entryId), ['rare']);
  assert.equal(search(s, t).receipt.drops.length, 0);
  assert.equal(search(s, t).receipt.drops.length, 0);
  const two = save(), t2 = table([rare, { ...rare, id: 'rare2', itemId: 'item.rare2' }], { rareChance: 1 });
  const got = [search(two, t2), search(two, t2), search(two, t2)].flatMap(r => r.receipt.drops.map(d => d.entryId));
  assert.deepEqual(got.sort(), ['rare', 'rare2']);
});

test('⑤ 确定性：克隆两份逐字相同；同一档 cycle 0 与 cycle 1 的第 1 次 seed 不同', () => {
  const run = s => { const out = []; for (let i = 0; i < 3; i++) out.push(search(s, table([food, cash]))); setDay(s, 31); for (let i = 0; i < 3; i++) out.push(search(s, table([food, cash]))); return out; };
  const a = save(1), b = structuredClone(a);
  const ra = run(a), rb = run(b);
  assert.deepEqual(ra, rb);
  assert.deepEqual(a, b);
  assert.equal(ra[0].receipt.cycle, 0); assert.equal(ra[3].receipt.cycle, 1);
  assert.equal(ra[0].receipt.attempt, 1); assert.equal(ra[3].receipt.attempt, 1);
  assert.notEqual(ra[0].receipt.seed, ra[3].receipt.seed);
});

test('cycle 0 盐串不变：有时间与无时间的首轮骰面一致（老档不改骰）', () => {
  const a = save(), b = save(5), t = table([food, cash]);
  for (let i = 0; i < 3; i++) {
    const ra = search(a, t).receipt, rb = search(b, t).receipt;
    assert.equal(ra.seed, rb.seed);
    assert.deepEqual(ra.drops, rb.drops);
  }
});

test('⑥ respawn.enabled=false 后永不回刷，搜满不提「过些日子再来」', async () => {
  await withNumbers({ loot: { respawn: { enabled: false } } }, { loot: { respawn: { enabled: true } } }, () => {
    const s = save(1), t = table([food]);
    for (let i = 0; i < 3; i++) search(s, t);
    for (const day of [31, 61, 1000]) {
      setDay(s, day);
      const r = search(s, t);
      assert.equal(r.status, 'exhausted');
      assert.equal(r.text, OLD_EXHAUSTED);
    }
  });
});

test('⑦ 战后搜尸：另计不占次数、只出普通物与小钱、同一 sourceId 只给一次、pending 地点不给', () => {
  const s = save(1), t = rich();
  assert.equal(grantLootSpoils(s, { locationId: LOC, sourceId: 'enc.1' }, t), true);
  const r = search(s, t);
  assert.equal(r.status, 'settled');
  assert.equal(r.receipt.kind, 'spoils');
  assert.equal(r.receipt.sourceId, 'enc.1');
  assert.equal(r.receipt.id, 'loot:spoils:enc.1');
  assert.ok(r.receipt.drops.length > 0);
  for (const d of r.receipt.drops) assert.ok(['food', 'cash'].includes(d.entryId), d.entryId);
  assert.equal(rt(s).locationLoot.searches[LOC] || 0, 0);
  assert.equal(rt(s).locationLoot.windows?.[LOC], undefined);
  assert.equal(rt(s).locationLoot.spoils[LOC], undefined);
  assert.deepEqual(rt(s).locationLoot.spoilsClaimed, ['enc.1']);
  // 同一回合再搜按重放返回
  assert.equal(settleLocationLoot(s, t).status, 'replay');
  for (let i = 0; i < 3; i++) { const n = search(s, t); assert.equal(n.status, 'settled'); assert.equal(n.receipt.kind, 'search'); }
  assert.equal(search(s, t).status, 'exhausted');
  assert.equal(grantLootSpoils(s, { locationId: LOC, sourceId: 'enc.1' }, t), false);
  // 搜满后新的一场仍能搜尸
  assert.equal(grantLootSpoils(s, { locationId: LOC, sourceId: 'enc.2' }, t), true);
  assert.equal(search(s, t).receipt.kind, 'spoils');
  const pending = save(1), tp = table([food], {}, { 'liuchao.location.elsewhere': { name: '别处', status: 'pending', entries: [] } });
  assert.equal(grantLootSpoils(pending, { locationId: 'liuchao.location.elsewhere', sourceId: 'enc.3' }, tp), false);
  assert.equal(rt(pending).locationLoot, undefined);
});

test('战后搜尸凭据每地点只留最近一场；spoils.enabled=false 时不发也不用', async () => {
  const s = save(1), t = table([food], { commonSlots: [1] });
  grantLootSpoils(s, { locationId: LOC, sourceId: 'a' }, t);
  grantLootSpoils(s, { locationId: LOC, sourceId: 'b' }, t);
  assert.equal(rt(s).locationLoot.spoils[LOC].sourceId, 'b');
  await withNumbers({ loot: { spoils: { enabled: false } } }, { loot: { spoils: { enabled: true } } }, () => {
    assert.equal(grantLootSpoils(s, { locationId: LOC, sourceId: 'c' }, t), false);
    const r = search(s, t);
    assert.equal(r.receipt.kind, 'search');
    assert.equal(rt(s).locationLoot.searches[LOC], 1);
  });
});

test('⑧ 旧档：searches=3 且无 windows，首次进来从今天起算、不立刻回刷', () => {
  const s = save(500), t = table([food]);
  rt(s).locationLoot = { version: 1, seed: 99, searches: { [LOC]: 3 }, claimed: [], claimedItemIds: [], receipts: [] };
  assert.equal(search(s, t).status, 'exhausted');
  assert.deepEqual(rt(s).locationLoot.windows[LOC], { cycle: 0, startDay: 500 });
  setDay(s, 529);
  assert.equal(search(s, t).status, 'exhausted');
  setDay(s, 530);
  assert.equal(search(s, t).receipt.cycle, 1);
});

test('⑨ numbers：loot 段在 progress 包登记；intervalDays=0 被拒；分类不在白名单时搜刮报配置无效', async () => {
  assert.equal(N.GAME_NUMBERS.loot.respawn.intervalDays, 30);
  assert.deepEqual(N.GAME_NUMBERS.loot.respawn.categories, ['common', 'smallCurrency']);
  assert.ok(registry.REQUIRED_TOP.some(t => t.key === 'loot' && t.section === 'progress'));
  assert.ok(registry.SECTION_KEYS.progress.includes('loot'));
  assert.throws(() => N.applyGameNumbers({ loot: { respawn: { intervalDays: 0 } } }), err => err.code === 'LCQ-NUM-008' && /intervalDays/.test(err.message));
  assert.equal(N.GAME_NUMBERS.loot.respawn.intervalDays, 30);
  assert.throws(() => N.applyGameNumbers({ loot: { spoils: { categories: [] } } }), err => err.code === 'LCQ-NUM-008');
  await withNumbers({ loot: { respawn: { categories: ['common', 'treasure'] } } }, { loot: { respawn: { categories: ['common', 'smallCurrency'] } } }, () => {
    const s = save(1);
    assert.throws(() => settleLocationLoot(s, table([food])), /搜刮规则配置无效/);
    assert.equal(rt(s).locationLoot, undefined);
  });
  const tree = structuredClone(N.GAME_NUMBERS);
  delete tree.loot;
  assert.ok(registry.validateAgainstRegistry(tree, 'cold').some(e => e === '缺段：loot'));
});
