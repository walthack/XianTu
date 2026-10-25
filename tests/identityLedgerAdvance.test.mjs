// 身份账 T3（身份账设计稿 2026-10-25 §3.4 ①、§7 方案 A）：advanceScenarioRuntime 在编年史落账之后同步身份账与收束档，
// 本回合刚完成的事件当场入账，下一个节点选变体时就能读到。规则均为测试夹具。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
const { setPlayerLedgerRulesForTest } = await loadTs('../src/modules/scenarioMods/playerLedgerRules.ts');
const { evaluateLedgerCondition } = await loadTs('../src/modules/scenarioMods/ledgerConditions.ts');

const ZHUSHI = 'liuchao.identity.song.baochao_zhushi';
const EVENT = 'event.firstmeeting';

async function buildSave() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const { applyStrictScenarioInitializationToSave, buildStrictScenarioInitialization } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const raw = JSON.parse(await readFile(new URL('./fixtures/scenario-mod/minimal.json', import.meta.url), 'utf8'));
  raw.scenario.initialFlags = { met: false, resolved: false };
  raw.scenario.events[0].conditions = [{ path: 'flags.met', operator: 'eq', value: true }];
  raw.scenario.events[0].completion = [{ path: 'flags.resolved', operator: 'eq', value: true }];
  raw.scenario.events[0].axisBeat = '玩家与程宗扬完成初会。';
  const save = applyStrictScenarioInitializationToSave(
    { 角色: { 位置: { 描述: '旧地点' } }, 世界: { 信息: {}, 状态: {} }, 系统: { 扩展: {} } },
    buildStrictScenarioInitialization(parseScenarioMod(raw), '2026-06-22T00:00:00.000Z'),
  );
  save.世界.状态.剧本模组.flags.met = true;
  return advanceScenarioRuntime(save).saveData;
}

async function withRules(rules, fn) {
  setPlayerLedgerRulesForTest(rules);
  try { return await fn(); } finally { setPlayerLedgerRulesForTest(undefined); }
}

test('advanceScenarioRuntime 当回合完成事件即入账', () => withRules({
  version: 1,
  identityGrants: [{ eventId: EVENT, identityId: ZHUSHI }],
  identityRevokes: [],
  lineOutcomes: [{ eventId: EVENT, lineId: 'song', outcome: 'resolved' }],
}, async () => {
  const save = await buildSave();
  const before = save.世界.状态.剧本模组;
  assert.deepEqual(before.activeEventIds, [EVENT]);
  assert.equal(before.playerIdentities, undefined, '事件未完成不入账');

  before.flags.resolved = true;
  const advanced = advanceScenarioRuntime(save);
  const rt = advanced.saveData.世界.状态.剧本模组;
  assert.ok(advanced.transitions.some(t => t.type === 'event_completed' && t.id === EVENT));
  const record = rt.playerIdentities[ZHUSHI];
  assert.equal(record.status, 'active');
  assert.equal(record.acquiredAtEventId, EVENT);
  assert.equal(record.history[0].atStageId, rt.modId);
  assert.equal(record.backfilled, undefined, '每回合同步不是回填');
  assert.equal(rt.flags['line.song.outcome'], 'resolved');
  // 同回合读取：变体条件即刻命中
  assert.equal(evaluateLedgerCondition({ path: `identity.${ZHUSHI}`, operator: 'eq', value: true }, rt), true);
  assert.equal(evaluateLedgerCondition({ path: `identity.${ZHUSHI}.from`, operator: 'eq', value: EVENT }, rt), true);
  // 再推进一轮：幂等
  const again = advanceScenarioRuntime(advanced.saveData).saveData.世界.状态.剧本模组;
  assert.equal(again.playerIdentities[ZHUSHI].history.length, 1);
}));

test('账本同步失败不阻断回合', () => withRules({ version: 1, identityGrants: { length: 1 }, identityRevokes: [], lineOutcomes: [] }, async () => {
  const save = await buildSave();
  save.世界.状态.剧本模组.flags.resolved = true;
  const warn = console.warn;
  const warned = [];
  console.warn = (...args) => warned.push(String(args[0]));
  try {
    const advanced = advanceScenarioRuntime(save);
    assert.ok(advanced.transitions.some(t => t.type === 'event_completed' && t.id === EVENT), '回合照常推进');
    assert.deepEqual(advanced.saveData.世界.状态.剧本模组.completedEventIds, [EVENT]);
  } finally {
    console.warn = warn;
  }
  assert.ok(warned.some(w => w.includes('[identityLedger] 账本同步失败')), warned.join('\n'));
}));
