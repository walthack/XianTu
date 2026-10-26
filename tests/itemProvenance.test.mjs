// 道具来路去重 T5 写入侧（身份账补充设计稿 2026-10-26 §2.3 / §2.8）：唯一道具组得过就不再发（口径 story.itemProvenance.dedupeBy），
// 改发带 :redirect，判断出错照发并记 LCQ-SAV-025。道具组均为测试夹具（setPlayerLedgerRulesForTest），仓库规则表首版为空。
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

// 顺序加载：并发 loadTs 会各自实例化 numbers.ts / playerLedgerRules.ts，热改与夹具就看不到同一份
const loaded = (async () => {
  const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
  const rules = await loadTs('../src/modules/scenarioMods/playerLedgerRules.ts');
  const provenance = await loadTs('../src/modules/scenarioMods/itemProvenance.ts');
  const inventory = await loadTs('../src/modules/scenarioMods/inventoryTransactions.ts');
  const contracts = await loadTs('../src/modules/scenarioMods/fixedInventoryContracts.ts');
  const log = await loadTs('../src/modules/diagnostics/log.ts');
  const store = await loadTs('../src/modules/diagnostics/store.ts');
  return { numbers, rules, provenance, inventory, contracts, log, store };
})();

/** SAV-025 须带 detail.reason 写持久日志（recent 新的在前） */
const logged = async (reason) => (await loaded).store.logStore.recent(100).filter(e => e.code === 'LCQ-SAV-025' && e.detail?.reason === reason);
const quiet = async (fn) => { const warn = console.warn; const seen = []; console.warn = (...a) => seen.push(a.join(' ')); try { return [await fn(), seen]; } finally { console.warn = warn; } };

const YY_LYG = 'lyg.item.np044';
const YY_LYL = 'lyl.item.np036';
const PEARL = 'test.item.pearl_redirect';
const GROUP = 'liuchao.itemgroup.yinyang_fish';
const ITEMS = [
  { id: YY_LYG, name: '阴阳鱼', description: '燕歌行里的阴阳鱼。', type: 'other', grade: '仙品' },
  { id: YY_LYL, name: '阴阳鱼', description: '云龙吟里的阴阳鱼。', type: 'other', grade: '仙品' },
  { id: PEARL, name: '替代宝珠', description: '改发用的测试物品。', type: 'other', grade: '凡品' },
  { id: 'test.item.plain', name: '寻常干粮', description: '不入组的物品。', type: 'consumable', grade: '凡品' },
];
const table = (itemGroups) => ({ version: 1, identityGrants: [], identityRevokes: [], lineOutcomes: [], itemGroups });
const yyGroup = (patch = {}) => ({ id: GROUP, itemIds: [YY_LYG, YY_LYL], ...patch });

function save(items = ITEMS) {
  return { 角色: { 背包: { 物品: {} } }, 世界: { 状态: { 剧本模组: { worldTurn: 3, canon: { items: structuredClone(items) }, inventoryTransferReceipts: [] } } } };
}
const rtOf = (s) => s.世界.状态.剧本模组;
const grant = (transferId, itemId) => ({ inventoryTransfers: [{ transferId, itemId, quantity: 1 }] });
const src = (eventId, actionId = 'take') => ({ eventId, actionId, outcome: 'success' });

/** 用夹具规则表跑 fn，结束复原仓库权威 */
async function withRules(itemGroups, fn) {
  const { rules } = await loaded;
  rules.setPlayerLedgerRulesForTest(table(itemGroups));
  try { return await fn(); } finally { rules.setPlayerLedgerRulesForTest(undefined); }
}
async function withDedupeBy(mode, fn) {
  const { numbers } = await loaded;
  const before = numbers.GAME_NUMBERS.story.itemProvenance.dedupeBy;
  numbers.applyGameNumbers({ story: { itemProvenance: { dedupeBy: mode } } });
  try { return await fn(); } finally { numbers.applyGameNumbers({ story: { itemProvenance: { dedupeBy: before } } }); }
}

test('仓库规则表 itemGroups 首版为空，dedupeBy 取总策划审定值 everObtained', async () => {
  const { rules, numbers, provenance } = await loaded;
  assert.deepEqual(rules.playerLedgerRules().itemGroups, []);
  assert.equal(numbers.GAME_NUMBERS.story.itemProvenance.dedupeBy, 'everObtained');
  assert.equal(provenance.itemDedupeBy(), 'everObtained');
  assert.deepEqual(provenance.itemGrantVerdict(save(), rtOf(save()), YY_LYG), { action: 'grant' });
});

test('规则表为空时发放行为与现状逐字相同', async () => {
  const { inventory } = await loaded;
  const s = save();
  const first = inventory.settleScenarioInventoryTransfers(s, rtOf(s), grant('e.lyg.yy', YY_LYG), src('e.lyg'));
  const second = inventory.settleScenarioInventoryTransfers(s, rtOf(s), grant('e.lyl.yy', YY_LYL), src('e.lyl'));
  const again = inventory.settleScenarioInventoryTransfers(s, rtOf(s), grant('e.lyl.yy2', YY_LYL), src('e.lyl2'));
  assert.deepEqual([first.length, second.length, again.length], [1, 1, 1]);
  assert.deepEqual(rtOf(s).inventoryTransferReceipts.map(r => [r.transferId, r.itemId, r.sourceEventId]), [
    ['e.lyg.yy', YY_LYG, 'e.lyg'], ['e.lyl.yy', YY_LYL, 'e.lyl'], ['e.lyl.yy2', YY_LYL, 'e.lyl2'],
  ]);
  assert.equal(s.角色.背包.物品[YY_LYL].数量, 2);
  assert.deepEqual(first[0], {
    receipt: { transferId: 'e.lyg.yy', itemId: YY_LYG, itemName: '阴阳鱼', quantity: 1, sourceEventId: 'e.lyg', actionId: 'take', outcome: 'success', settledAtTurn: 3 },
    key: `角色.背包.物品.${YY_LYG}`,
    oldValue: undefined,
    newValue: s.角色.背包.物品[YY_LYG],
  });
});

test('同组异书 id 先到先得，后到跳过且不生成 settlement', async () => {
  const { inventory } = await loaded;
  await withRules([yyGroup()], () => {
    const s = save();
    assert.equal(inventory.settleScenarioInventoryTransfers(s, rtOf(s), grant('e.lyl.yy', YY_LYL), src('e.lyl')).length, 1);
    assert.deepEqual(inventory.settleScenarioInventoryTransfers(s, rtOf(s), grant('e.lyg.yy', YY_LYG), src('e.lyg')), []);
    assert.equal(s.角色.背包.物品[YY_LYG], undefined);
    assert.deepEqual(rtOf(s).inventoryTransferReceipts.map(r => r.transferId), ['e.lyl.yy']);
    // 不入组的物品照发
    assert.equal(inventory.settleScenarioInventoryTransfers(s, rtOf(s), grant('e.food', 'test.item.plain'), src('e.food')).length, 1);
  });
});

test('同一调用内同组两件只发一件', async () => {
  const { inventory } = await loaded;
  await withRules([yyGroup()], () => {
    const s = save();
    const effects = { inventoryTransfers: [{ transferId: 't.a', itemId: YY_LYG, quantity: 1 }, { transferId: 't.b', itemId: YY_LYL, quantity: 1 }] };
    const out = inventory.settleScenarioInventoryTransfers(s, rtOf(s), effects, src('e.both'));
    assert.deepEqual(out.map(x => x.receipt.itemId), [YY_LYG]);
    assert.deepEqual(Object.keys(s.角色.背包.物品), [YY_LYG]);
  });
});

test('whenHeld=redirect 改发且 transferId 带 :redirect，重试不重复改发', async () => {
  const { inventory } = await loaded;
  await withRules([yyGroup({ whenHeld: 'redirect', redirectItemId: PEARL })], () => {
    const s = save();
    inventory.settleScenarioInventoryTransfers(s, rtOf(s), grant('e.lyg.yy', YY_LYG), src('e.lyg'));
    const out = inventory.settleScenarioInventoryTransfers(s, rtOf(s), grant('e.lyl.yy', YY_LYL), src('e.lyl', 'invest'));
    assert.equal(out.length, 1);
    assert.deepEqual({ ...out[0].receipt }, { transferId: 'e.lyl.yy:redirect', itemId: PEARL, itemName: '替代宝珠', quantity: 1, sourceEventId: 'e.lyl', actionId: 'invest', outcome: 'success', settledAtTurn: 3 });
    assert.equal(out[0].key, `角色.背包.物品.${PEARL}`);
    assert.equal(s.角色.背包.物品[YY_LYL], undefined);
    assert.deepEqual(inventory.settleScenarioInventoryTransfers(s, rtOf(s), grant('e.lyl.yy', YY_LYL), src('e.lyl', 'invest')), []);
    assert.equal(s.角色.背包.物品[PEARL].数量, 1);
  });
});

test('redirect 物品不在本关物品表时记 SAV-025 redirect_missing 并跳过', async () => {
  const { inventory, log } = await loaded;
  await withRules([yyGroup({ whenHeld: 'redirect', redirectItemId: PEARL })], async () => {
    await log.resetLogState();
    const s = save(ITEMS.filter(i => i.id !== PEARL));
    inventory.settleScenarioInventoryTransfers(s, rtOf(s), grant('e.lyg.yy', YY_LYG), src('e.lyg'));
    const [out, warnings] = await quiet(() => inventory.settleScenarioInventoryTransfers(s, rtOf(s), grant('e.lyl.yy', YY_LYL), src('e.lyl')));
    assert.deepEqual(out, []);
    assert.deepEqual(Object.keys(s.角色.背包.物品), [YY_LYG]);
    assert.ok(warnings.some(w => /LCQ-SAV-025/.test(w)), warnings.join(' | '));
    const [hit] = await logged('redirect_missing');
    assert.deepEqual({ groupId: hit.detail.groupId, itemId: hit.detail.itemId, redirectItemId: hit.detail.redirectItemId, firstFrom: hit.detail.firstFrom, transferId: hit.detail.transferId, module: hit.module, level: hit.level },
      { groupId: GROUP, itemId: YY_LYL, redirectItemId: PEARL, firstFrom: 'e.lyg', transferId: 'e.lyl.yy', module: 'itemProvenance', level: 'warn' });
  });
});

test('dedupeBy=everObtained 时已用掉仍不重发；currentlyHeld 时重发', async () => {
  const { inventory, provenance } = await loaded;
  await withRules([yyGroup()], async () => {
    const run = () => {
      const s = save();
      inventory.settleScenarioInventoryTransfers(s, rtOf(s), grant('e.lyg.yy', YY_LYG), src('e.lyg'));
      delete s.角色.背包.物品[YY_LYG]; // 已融进丹田
      return [s, inventory.settleScenarioInventoryTransfers(s, rtOf(s), grant('e.lyl.yy', YY_LYL), src('e.lyl'))];
    };
    const [s1, skipped] = run();
    assert.deepEqual(skipped, []);
    assert.deepEqual(provenance.itemGrantVerdict(s1, rtOf(s1), YY_LYL), { action: 'skip', groupId: GROUP, firstFrom: 'e.lyg' });
    // 只有背包现存、没有回执（旧档缺口）也算得过
    const held = save();
    held.角色.背包.物品[YY_LYG] = { 物品ID: YY_LYG, 名称: '阴阳鱼', 数量: 1 };
    assert.deepEqual(provenance.itemGrantVerdict(held, rtOf(held), YY_LYL), { action: 'skip', groupId: GROUP, firstFrom: provenance.HELD_WITHOUT_RECEIPT });
    held.角色.背包.物品[YY_LYG].数量 = 0;
    assert.deepEqual(provenance.itemGrantVerdict(held, rtOf(held), YY_LYL), { action: 'grant' });

    await withDedupeBy('currentlyHeld', () => {
      assert.equal(provenance.itemDedupeBy(), 'currentlyHeld');
      const [, regranted] = run();
      assert.deepEqual(regranted.map(x => x.receipt.itemId), [YY_LYL]);
      // 背包现存时仍跳过
      const s = save();
      inventory.settleScenarioInventoryTransfers(s, rtOf(s), grant('e.lyg.yy', YY_LYG), src('e.lyg'));
      assert.deepEqual(inventory.settleScenarioInventoryTransfers(s, rtOf(s), grant('e.lyl.yy', YY_LYL), src('e.lyl')), []);
    });
  });
});

test('判断抛错时按原逻辑发放并记 SAV-025 check_failed', async () => {
  const { inventory, rules, log } = await loaded;
  rules.setPlayerLedgerRulesForTest({ ...table([]), get itemGroups() { throw new Error('规则表坏了'); } });
  try {
    await log.resetLogState();
    const s = save();
    const [out] = await quiet(() => [
      ...inventory.settleScenarioInventoryTransfers(s, rtOf(s), grant('e.lyg.yy', YY_LYG), src('e.lyg')),
      ...inventory.settleScenarioInventoryTransfers(s, rtOf(s), grant('e.lyl.yy', YY_LYL), src('e.lyl')),
    ]);
    assert.deepEqual(out.map(x => x.receipt.itemId), [YY_LYG, YY_LYL]);
    const hits = await logged('check_failed');
    assert.deepEqual(hits.map(h => [h.detail.itemId, h.detail.transferId, h.module]).sort(), [[YY_LYG, 'e.lyg.yy', 'itemProvenance'], [YY_LYL, 'e.lyl.yy', 'itemProvenance']]);
  } finally {
    rules.setPlayerLedgerRulesForTest(undefined);
  }
});

function* permutations(list) {
  if (list.length <= 1) { yield list; return; }
  for (let i = 0; i < list.length; i += 1) {
    for (const rest of permutations([...list.slice(0, i), ...list.slice(i + 1)])) yield [list[i], ...rest];
  }
}

test('七线全排列（5040 种顺序）同组物品只发一次，from 等于最先结算的事件', async () => {
  const { inventory } = await loaded;
  const lines = ['nanhuang', 'jin', 'song', 'han', 'tang', 'qin', 'taiquan'];
  const ids = lines.map(line => `test.item.${line}.yinyang`);
  const items = ids.map(id => ({ id, name: '阴阳鱼', description: '', type: 'other', grade: '仙品' }));
  await withRules([{ id: GROUP, itemIds: ids }], () => {
    let count = 0;
    for (const order of permutations(lines)) {
      count += 1;
      const s = save(items);
      const granted = order.flatMap(line => inventory.settleScenarioInventoryTransfers(s, rtOf(s), grant(`e.${line}.yy`, `test.item.${line}.yinyang`), src(`e.${line}`)));
      assert.equal(granted.length, 1, order.join('>'));
      assert.equal(granted[0].receipt.sourceEventId, `e.${order[0]}`);
      assert.deepEqual(rtOf(s).inventoryTransferReceipts.map(r => r.sourceEventId), [`e.${order[0]}`]);
      assert.deepEqual(Object.keys(s.角色.背包.物品), [`test.item.${order[0]}.yinyang`]);
    }
    assert.equal(count, 5040);
  });
});

test('跳过的物品不进 AIBS 授权清单（buildItemReferenceContext 入参不含）', async () => {
  const { inventory, contracts } = await loaded;
  await withRules([yyGroup()], () => {
    const s = save();
    inventory.settleScenarioInventoryTransfers(s, rtOf(s), grant('e.lyg.yy', YY_LYG), src('e.lyg'));
    const settlements = inventory.settleScenarioInventoryTransfers(s, rtOf(s), {
      inventoryTransfers: [{ transferId: 'e.lyl.yy', itemId: YY_LYL, quantity: 1 }, { transferId: 'e.lyl.food', itemId: 'test.item.plain', quantity: 1 }],
    }, src('e.lyl'));
    // 与 AIBidirectionalSystem.ts 取授权清单的口径相同：只来自本拍 settlement
    const grantedIds = settlements.map(x => x.receipt.itemId);
    const grantedNames = settlements.map(x => x.receipt.itemName);
    const context = contracts.buildItemReferenceContext(s, grantedIds, grantedNames);
    assert.deepEqual(context.authorizedGrantIds, ['test.item.plain']);
    assert.deepEqual(context.authorizedGrantNames, ['寻常干粮']);
    assert.equal(context.authorizedGrantIds.includes(YY_LYL), false);
  });
});
