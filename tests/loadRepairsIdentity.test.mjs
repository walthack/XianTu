// 身份账 T3（身份账设计稿 2026-10-25 §5）：读档回填身份账与收束档，只追加不覆盖，新写的标 backfilled。规则均为测试夹具。
// 道具来路 T6（补充设计稿 2026-10-26 §2.3）：返回值新增 itemReceiptsBackfilled。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const { applyLoadRepairs } = await loadTs('../src/modules/scenarioMods/loadRepairs.ts');
const { setPlayerLedgerRulesForTest } = await loadTs('../src/modules/scenarioMods/playerLedgerRules.ts');

const ZHUSHI = 'liuchao.identity.song.baochao_zhushi';
const JIN_INVEST = 'lcq.event.s02_04';
const JIN_OTHER = 'lcq.event.s02_05';
const RULES = {
  version: 1,
  identityGrants: [{ eventId: JIN_INVEST, identityId: ZHUSHI }],
  identityRevokes: [],
  lineOutcomes: [{ eventId: JIN_OTHER, lineId: 'jin', outcome: 'unresolved' }],
};

/** 旧档：上一关的事件只留在编年史里（completedEventIds 已按本关重置）。 */
function oldSave(patch = {}) {
  return { 世界: { 状态: { 剧本模组: {
    modId: 'stage.now', flags: {}, completedEventIds: [], events: [],
    chronicle: [
      { id: `chronicle.stage.jin.${JIN_INVEST}`, type: 'event', stageId: 'stage.jin', title: '注资', sequence: 1 },
      { id: `chronicle.stage.jin.${JIN_OTHER}`, type: 'event', stageId: 'stage.jin', title: '收束', sequence: 2 },
    ],
    ...patch,
  } } } };
}

function withRules(fn) {
  setPlayerLedgerRulesForTest(RULES);
  try { return fn(); } finally { setPlayerLedgerRulesForTest(undefined); }
}

test('旧档缺 playerIdentities 读档回填并标 backfilled', () => withRules(() => {
  const save = oldSave();
  const repairs = applyLoadRepairs(save);
  const rt = save.世界.状态.剧本模组;
  assert.equal(repairs.identitiesBackfilled, 2, '一条身份＋一条收束档');
  const record = rt.playerIdentities[ZHUSHI];
  assert.equal(record.status, 'active');
  assert.equal(record.acquiredAtEventId, JIN_INVEST);
  assert.equal(record.backfilled, true);
  assert.equal(record.history[0].backfilled, true);
  assert.equal(rt.flags['line.jin.outcome'], 'unresolved');
  // 幂等：再读一次不追加
  assert.equal(applyLoadRepairs(save).identitiesBackfilled, 0);
  assert.equal(rt.playerIdentities[ZHUSHI].history.length, 1);
  // 规则表没有道具组：不回填道具回执
  assert.equal(repairs.itemReceiptsBackfilled, 0);
  assert.equal(rt.inventoryTransferReceipts, undefined);
  // 没有进度的新档不建字段
  const fresh = oldSave({ chronicle: [] });
  assert.equal(applyLoadRepairs(fresh).identitiesBackfilled, 0);
  assert.equal(fresh.世界.状态.剧本模组.playerIdentities, undefined);
}));

test('已有记录不被回填覆盖', () => withRules(() => {
  const existing = {
    identityId: ZHUSHI, status: 'active', acquiredAtEventId: 'lcq.event.earlier',
    history: [{ eventId: 'lcq.event.earlier', op: 'grant', atStageId: 'stage.song', atWorldTurn: 3 }],
  };
  const save = oldSave({ playerIdentities: { [ZHUSHI]: structuredClone(existing) }, flags: { 'line.jin.outcome': 'resolved' } });
  const repairs = applyLoadRepairs(save);
  const rt = save.世界.状态.剧本模组;
  const record = rt.playerIdentities[ZHUSHI];
  assert.equal(repairs.identitiesBackfilled, 1, '规则表新增条目补成一条 reinforce');
  assert.equal(record.acquiredAtEventId, 'lcq.event.earlier', '来源不改');
  assert.equal(record.backfilled, undefined, '原记录不改标回填');
  assert.deepEqual(record.history[0], existing.history[0], '原 history 不动');
  assert.deepEqual(record.history.slice(1).map(h => [h.eventId, h.op, h.backfilled]), [[JIN_INVEST, 'reinforce', true]]);
  assert.equal(rt.flags['line.jin.outcome'], 'resolved', 'writeOnce：已收束不被回填覆盖');
}));

test('读档调用链包含身份同步', () => {
  // characterStore 读档 → applyLoadRepairs → syncPlayerLedgers({ backfilled: true })
  const store = readFileSync(new URL('../src/stores/characterStore.ts', import.meta.url), 'utf8');
  assert.match(store, /applyLoadRepairs\(targetSlot\.存档数据\)/);
  const repairs = readFileSync(new URL('../src/modules/scenarioMods/loadRepairs.ts', import.meta.url), 'utf8');
  assert.match(repairs, /syncPlayerLedgers\(rt, \{ backfilled: true \}\)/);
  assert.match(repairs, /backfillItemReceipts\(save, rt\)/);
  // 规则表为空（仓库首版）时读档不建字段、不报错
  const save = oldSave();
  assert.equal(applyLoadRepairs(save).identitiesBackfilled, 0);
  assert.equal(save.世界.状态.剧本模组.playerIdentities, undefined);
});

test('itemReceiptsBackfilled：背包现存的唯一道具补回填回执，与身份回填并列返回', () => {
  const ITEM = 'lyg.item.np044';
  setPlayerLedgerRulesForTest({ ...RULES, itemGroups: [{ id: 'liuchao.itemgroup.yinyang_fish', itemIds: [ITEM, 'lyl.item.np036'] }] });
  try {
    const save = oldSave();
    save.角色 = { 背包: { 物品: { [ITEM]: { 物品ID: ITEM, 名称: '阴阳鱼', 数量: 1 } } } };
    const repairs = applyLoadRepairs(save);
    assert.deepEqual([repairs.identitiesBackfilled, repairs.itemReceiptsBackfilled], [2, 1]);
    assert.deepEqual(save.世界.状态.剧本模组.inventoryTransferReceipts.map(r => [r.transferId, r.sourceEventId]), [[`backfill:${ITEM}`, 'backfill']]);
    assert.deepEqual(applyLoadRepairs(save).itemReceiptsBackfilled, 0, '幂等');
    // 没有剧本模组时字段照样在
    assert.deepEqual(applyLoadRepairs({}), { injuriesMigrated: false, storyStatuses: [], identitiesBackfilled: 0, itemReceiptsBackfilled: 0 });
  } finally {
    setPlayerLedgerRulesForTest(undefined);
  }
});
