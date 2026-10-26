// 身份账 T3（身份账设计稿 2026-10-25 §3.4 ①、§7 方案 A）：advanceScenarioRuntime 在编年史落账之后同步身份账与收束档，
// 本回合刚完成的事件当场入账，下一个节点选变体时就能读到。规则均为测试夹具。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
const { setPlayerLedgerRulesForTest } = await loadTs('../src/modules/scenarioMods/playerLedgerRules.ts');
const { evaluateLedgerCondition } = await loadTs('../src/modules/scenarioMods/ledgerConditions.ts');
const log = await loadTs('../src/modules/diagnostics/log.ts');
const { logStore } = await loadTs('../src/modules/diagnostics/store.ts');

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
  await log.resetLogState();
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
  // 带错误码写持久日志（LCQ-SAV-023），不再是裸 console.warn
  const logged = logStore.recent(100).filter(e => e.code === 'LCQ-SAV-023');
  assert.equal(logged.length, 1, warned.join('\n'));
  assert.equal(logged[0].module, 'identityLedger');
  assert.ok(logged[0].stack || logged[0].msg.includes('：'), '带上抛错原因');
  assert.ok(warned.some(w => w.startsWith('[LCQ-SAV-023]')), warned.join('\n'));
  await log.resetLogState();
}));

// T10（身份账补充设计稿 2026-10-26 §9 / §10-T10）：期限填 onDue.endingId 时，advanceScenarioRuntime 回合末 syncPlayerLedgers 锁存 due 即写 gameOver，
// runtime.ts 不改；下一回合 advance 见 gameOver 早退，不再推进。规则与数值均为测试夹具。
test('T10 当回合完成的刻度事件让期限到期：写 gameOver，下一回合不再推进', async () => {
  const { GAME_NUMBERS } = await loadTs('../src/modules/sceneModule/numbers.ts');
  const BINGU = 'liuchao.deadline.test_bingu';
  const ICE_GU = 'lcq.ending.death.ajiman_bond';
  const START = 'lcq.event.free_ajiman';
  const limits = GAME_NUMBERS.story.progressDeadline.limits;
  limits[BINGU] = { due: 1, urgentAt: 0 };
  try {
    await withRules({
      version: 1, identityGrants: [], identityRevokes: [], lineOutcomes: [],
      progressTicks: [{ eventId: EVENT, lineId: 'song' }],
      progressDeadlines: [{ id: BINGU, name: '测试冰蛊', startEventIds: [START], clearEventIds: ['lcq.event.charge_sudaji_fee'], onDue: { endingId: ICE_GU } }],
    }, async () => {
      const save = await buildSave();
      const before = save.世界.状态.剧本模组;
      before.chronicle = [...(before.chronicle || []), { id: `chronicle.${before.modId}.${START}`, type: 'event', stageId: before.modId, title: '', sequence: 0 }];
      assert.equal(advanceScenarioRuntime(save).saveData.世界.状态.剧本模组.gameOver, undefined, '刻度事件未完成不结束');
      before.flags.resolved = true;
      const advanced = advanceScenarioRuntime(save);
      const rt = advanced.saveData.世界.状态.剧本模组;
      assert.ok(advanced.transitions.some(t => t.type === 'event_completed' && t.id === EVENT));
      assert.equal(rt.flags[`deadline.${BINGU}.state`], 'due');
      assert.equal(rt.gameOver?.endingId, ICE_GU);
      assert.equal(rt.gameOver.sourceEventId, EVENT);
      assert.equal(rt.gameOver.title, '冰蛊');
      const after = advanceScenarioRuntime(advanced.saveData);
      assert.deepEqual(after.transitions, [], '本局已结束不再推进');
      assert.deepEqual(after.saveData.世界.状态.剧本模组.gameOver, rt.gameOver);
    });
  } finally {
    delete limits[BINGU];
  }
});
