// 道具来路去重 T5 写入侧（身份账补充设计稿 2026-10-26 §2.3 / §2.8）：唯一道具组得过就不再发（口径 story.itemProvenance.dedupeBy），
// 改发带 :redirect，判断出错照发并记 LCQ-SAV-025。道具组均为测试夹具（setPlayerLedgerRulesForTest），仓库规则表首版为空。
// T6 读取侧与旧档窄回填（§2.3 / §2.4 / §6 Q5）：item.<g>[.from] 只看回执；读档把背包现存、没回执的唯一道具补成回填回执；done.* 不推断回填。
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
  const ledger = await loadTs('../src/modules/scenarioMods/ledgerConditions.ts');
  const repairs = await loadTs('../src/modules/scenarioMods/loadRepairs.ts');
  const runtime = await loadTs('../src/modules/scenarioMods/runtime.ts');
  return { numbers, rules, provenance, inventory, contracts, log, store, ledger, repairs, runtime };
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

test('item.<g> 与 item.<g>.from 读取', async () => {
  const { inventory, ledger, provenance } = await loaded;
  await withRules([yyGroup()], () => {
    const s = save();
    const rt = rtOf(s);
    const read = (path, operator = 'eq', value) => ledger.evaluateLedgerCondition({ path, operator, ...(operator === 'exists' ? {} : { value }) }, rt);
    // 没得过：item.<g> 为 false（不是 undefined），.from 不存在
    assert.deepEqual(ledger.parseLedgerPath(`item.${GROUP}.from`), { kind: 'item', id: GROUP, field: 'from' });
    assert.deepEqual(ledger.resolveLedgerPath(`item.${GROUP}`, rt), { handled: true, value: false });
    assert.equal(read(`item.${GROUP}`, 'eq', false), true);
    assert.equal(read(`item.${GROUP}.from`, 'exists'), false);
    // 读取不看背包：只有背包现存、没有回执时仍为 false（旧档靠读档回填补齐）
    s.角色.背包.物品[YY_LYG] = { 物品ID: YY_LYG, 名称: '阴阳鱼', 数量: 1 };
    assert.equal(read(`item.${GROUP}`, 'eq', true), false);
    delete s.角色.背包.物品[YY_LYG];

    inventory.settleScenarioInventoryTransfers(s, rt, grant('loot.yy', YY_LYL), src('loot:lyl.cave'));
    inventory.settleScenarioInventoryTransfers(s, rt, grant('e.food', 'test.item.plain'), src('e.food'));
    // groupId 展开成组内全部 itemId；itemId 只读自己，不并入所属组
    assert.equal(read(`item.${GROUP}`, 'eq', true), true);
    assert.equal(read(`item.${GROUP}`, 'neq', true), false);
    assert.equal(read(`item.${YY_LYL}`, 'eq', true), true);
    assert.equal(read(`item.${YY_LYG}`, 'eq', true), false);
    assert.equal(read('item.test.item.plain', 'eq', true), true);
    // .from＝最早一条回执的 sourceEventId（搜刮为 loot:*）
    assert.equal(read(`item.${GROUP}.from`, 'eq', 'loot:lyl.cave'), true);
    assert.equal(read(`item.${GROUP}.from`, 'neq', 'e.lyg'), true);
    assert.equal(read(`item.${GROUP}.from`, 'exists'), true);
    assert.equal(provenance.firstItemReceipt(rt, GROUP).transferId, 'loot.yy');
    // item.<g> 恒为 boolean，exists 不支持（不命中）
    assert.equal(read(`item.${GROUP}`, 'exists'), false);
    // 回填回执的来路读作 backfill
    const old = save();
    old.角色.背包.物品[YY_LYG] = { 物品ID: YY_LYG, 名称: '阴阳鱼', 数量: 1 };
    provenance.backfillItemReceipts(old, rtOf(old));
    assert.equal(ledger.evaluateLedgerCondition({ path: `item.${GROUP}.from`, operator: 'eq', value: provenance.BACKFILL_SOURCE }, rtOf(old)), true);
  });
});

test('读取时规则表抛错按 itemId 原样读并只记一次 SAV-025 check_failed', async () => {
  const { rules, ledger, log } = await loaded;
  rules.setPlayerLedgerRulesForTest({ ...table([]), get itemGroups() { throw new Error('规则表坏了'); } });
  try {
    await log.resetLogState();
    const rt = { inventoryTransferReceipts: [{ transferId: 't', itemId: YY_LYG, sourceEventId: 'e.lyg' }] };
    const [values] = await quiet(() => [
      ledger.resolveLedgerPath(`item.${GROUP}`, rt).value,
      ledger.resolveLedgerPath(`item.${YY_LYG}.from`, rt).value,
      ledger.resolveLedgerPath(`item.${GROUP}`, rt).value,
    ]);
    assert.deepEqual(values, [false, 'e.lyg', false]);
    const hits = await logged('check_failed');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].detail.phase, 'read');
    assert.equal(hits[0].module, 'itemProvenance');
  } finally {
    rules.setPlayerLedgerRulesForTest(undefined);
  }
});

test('读档：背包持有但无回执的组成员补回填回执且幂等', async () => {
  const { repairs, inventory, provenance } = await loaded;
  await withRules([yyGroup()], () => {
    const s = save();
    const rt = rtOf(s);
    rt.worldTurn = 7;
    s.角色.背包.物品[YY_LYG] = { 物品ID: YY_LYG, 名称: '阴阳鱼', 数量: 1 };
    s.角色.背包.物品['test.item.plain'] = { 物品ID: 'test.item.plain', 名称: '寻常干粮', 数量: 3 };
    const first = repairs.applyLoadRepairs(s);
    assert.equal(first.itemReceiptsBackfilled, 1, '只回填唯一道具组成员，不入组的不动');
    assert.deepEqual(rt.inventoryTransferReceipts, [{
      transferId: `backfill:${YY_LYG}`, itemId: YY_LYG, itemName: '阴阳鱼', quantity: 1,
      sourceEventId: 'backfill', actionId: 'backfill', outcome: 'success', settledAtTurn: 7,
    }]);
    // 幂等：再读档不追加；背包与 done.* 均不动
    assert.equal(repairs.applyLoadRepairs(s).itemReceiptsBackfilled, 0);
    assert.equal(rt.inventoryTransferReceipts.length, 1);
    assert.equal(s.角色.背包.物品[YY_LYG].数量, 1);
    assert.equal(rt.completedEventIds, undefined);
    assert.equal(rt.chronicle, undefined);
    // 回填后写入侧按回执跳过同组异书 id，来路为 backfill
    assert.deepEqual(provenance.itemGrantVerdict(s, rt, YY_LYL), { action: 'skip', groupId: GROUP, firstFrom: 'backfill' });
    assert.deepEqual(inventory.settleScenarioInventoryTransfers(s, rt, grant('e.lyl.yy', YY_LYL), src('e.lyl')), []);

    // 已有回执的成员不回填；数量为 0 的不回填
    const held = save();
    inventory.settleScenarioInventoryTransfers(held, rtOf(held), grant('e.lyg.yy', YY_LYG), src('e.lyg'));
    held.角色.背包.物品[YY_LYL] = { 物品ID: YY_LYL, 数量: 0 };
    assert.equal(repairs.applyLoadRepairs(held).itemReceiptsBackfilled, 0);
    assert.deepEqual(rtOf(held).inventoryTransferReceipts.map(r => r.transferId), ['e.lyg.yy']);
  });
  // 规则表为空（仓库首版）时不建字段
  const fresh = save();
  delete rtOf(fresh).inventoryTransferReceipts;
  fresh.角色.背包.物品[YY_LYG] = { 物品ID: YY_LYG, 数量: 1 };
  assert.equal(repairs.applyLoadRepairs(fresh).itemReceiptsBackfilled, 0);
  assert.equal(rtOf(fresh).inventoryTransferReceipts, undefined);
});

test('读档回填失败记 SAV-025 backfill_failed，不抛、不写半截', async () => {
  const { repairs, log } = await loaded;
  await withRules([yyGroup()], async () => {
    await log.resetLogState();
    const s = save();
    s.角色.背包.物品[YY_LYG] = { 物品ID: YY_LYG, 数量: 1 };
    rtOf(s).inventoryTransferReceipts = { broken: true };
    const [result] = await quiet(() => repairs.applyLoadRepairs(s));
    assert.equal(result.itemReceiptsBackfilled, 0);
    assert.deepEqual(rtOf(s).inventoryTransferReceipts, { broken: true });
    const [hit] = await logged('backfill_failed');
    assert.equal(hit.module, 'itemProvenance');
    assert.equal(hit.level, 'warn');
  });
});

test('Q5：done.* 不推断回填，非首关且编年史无事件条目时只打调试日志', async () => {
  const { provenance, ledger, repairs } = await loaded;
  const rt = { modId: 'lcq.stage_05', flags: {}, completedEventIds: [], chronicle: [{ id: 'chronicle.stage.lcq.stage_04.lcq.stage_05', type: 'stage', stageId: 'lcq.stage_04', sequence: 1 }] };
  assert.equal(provenance.noteChronicleGap(rt), true);
  assert.equal(provenance.noteChronicleGap({ ...rt, modId: 'lcq.stage_01' }), false, '首关不算缺口');
  assert.equal(provenance.noteChronicleGap({ ...rt, chronicle: [{ id: 'chronicle.lcq.stage_04.lcq.event.s02_01', type: 'event', stageId: 'lcq.stage_04', sequence: 1 }] }), false);
  const s = { 角色: { 背包: { 物品: {} } }, 世界: { 状态: { 剧本模组: structuredClone(rt) } } };
  repairs.applyLoadRepairs(s);
  assert.deepEqual(rtOf(s).completedEventIds, [], '不按关卡顺序推断 done.*');
  assert.equal(ledger.evaluateLedgerCondition({ path: 'done.lcq.event.s02_01', operator: 'eq', value: true }, rtOf(s)), false);
});

test('回填回执不影响锦囊 transferId 判断', async () => {
  const { provenance, runtime } = await loaded;
  const JIN_NANG = 'lcq.item.jin_nang';
  await withRules([{ id: 'liuchao.itemgroup.jin_nang', itemIds: [JIN_NANG] }], () => {
    const s = save([{ id: JIN_NANG, name: '锦囊', description: '', type: 'other', grade: '凡品' }]);
    s.角色.背包.物品[JIN_NANG] = { 物品ID: JIN_NANG, 名称: '锦囊', 数量: 1 };
    rtOf(s).flags = {};
    assert.equal(provenance.backfillItemReceipts(s, rtOf(s)), 1);
    assert.equal(rtOf(s).inventoryTransferReceipts[0].transferId, `backfill:${JIN_NANG}`);
    // 回填回执不是锦囊发放回执：重复领取判断照旧（无锦囊回执＝不拦）
    assert.equal(runtime.previewRepeatSilkPouchClaimNarrative(s, { playerActionText: '我当面收下锦囊' }), '');
    // 已有真锦囊回执的不回填，判断照旧命中
    const real = save([{ id: JIN_NANG, name: '锦囊', description: '', type: 'other', grade: '凡品' }]);
    real.角色.背包.物品[JIN_NANG] = { 物品ID: JIN_NANG, 名称: '锦囊', 数量: 1 };
    rtOf(real).flags = {};
    rtOf(real).inventoryTransferReceipts = [{ transferId: 'lcq.event.s02_01.inventory.jin_nang', itemId: JIN_NANG, itemName: '锦囊', quantity: 1, sourceEventId: 'lcq.event.s02_01', actionId: 'take', outcome: 'success', settledAtTurn: 1 }];
    assert.equal(provenance.backfillItemReceipts(real, rtOf(real)), 0);
    assert.notEqual(runtime.previewRepeatSilkPouchClaimNarrative(real, { playerActionText: '我当面收下锦囊' }), '');
  });
});
