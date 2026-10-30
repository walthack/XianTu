import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './loadTs.mjs';
const { GAME_NUMBERS: n } = await loadTs('../src/modules/sceneModule/numbers.ts');
const { nationClosedLineCount, lineClosed } = await loadTs('../src/modules/scenarioMods/lineOutcomes.ts');
const { resolveLedgerPath } = await loadTs('../src/modules/scenarioMods/ledgerConditions.ts');
const { validateAgainstRegistry } = await loadTs('../src/modules/sceneModule/numbersRegistry.ts');
const { validateLineCompassTable, validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
const { CONTENT_PACKS: packs } = await loadTs('../src/modules/contentPacks/index.ts');
const { lineCompassView } = await loadTs('../src/modules/scenarioMods/lineCompass.ts');
const ids = n.story.lineCompass.anyLineClosed.lineIds;
const closers = ids.map(id => packs.lineCompass.lines.find(l => l.lineId === id).closedWhen[0].path.slice(5));
const rt = events => ({ flags: {}, completedEventIds: events, chronicle: [] });
for (const count of [0, 2, 3, 5]) test(`秦入口 ${count} 条正常收束`, () => {
  const runtime = rt(closers.slice(0, count));
  assert.equal(nationClosedLineCount(runtime), count);
  assert.equal(resolveLedgerPath('compass.qinEntryReady', runtime).value, count >= 3);
  assert.equal(resolveLedgerPath('compass.anyLineClosed', runtime).value, count > 0);
});
test('秦、太泉不计；宋的太泉事件仅算宋；重复事件和收束档去重', () => {
  const runtime = rt([...closers.slice(0, 3), ...closers.slice(0, 3)]);
  runtime.flags = { 'line.qin.outcome': 'resolved', 'line.taiquan.outcome': 'resolved', 'line.song.outcome': 'unresolved' };
  assert.equal(nationClosedLineCount(runtime), 3);
  assert.equal(nationClosedLineCount({ ...rt([]), flags: runtime.flags }), 1);
  assert.equal(nationClosedLineCount({ ...rt([]), flags: { 'line.qin.outcome': 'resolved', 'line.taiquan.outcome': 'unresolved' } }), 0);
});
test('配置失败终点无需改代码；不屏蔽原 closedWhen；同线多失败只算一次', () => {
  const failures = n.story.lineOutcome.failureClosureEvents.nanhuang;
  try {
    // 合同夹具，不把这两个事件裁定为正式失败终点。
    failures.push('test.failure.a', 'test.failure.b');
    assert.equal(lineClosed('nanhuang', rt([closers[0]])), true);
    assert.equal(nationClosedLineCount(rt(['test.failure.a', 'test.failure.b', closers[0]])), 1);
    assert.equal(lineClosed('nanhuang', rt(['test.failure.a']), { tiers: ['resolved'] }), false);
    assert.equal(nationClosedLineCount(rt(['test.failure.a', closers[1], closers[2]])), 3);
  } finally { failures.splice(0); }
});
test('合法成功/失败档混合计数；非法档不算；配置线清单防御性去重', () => {
  const runtime = { ...rt([]), flags: { 'line.nanhuang.outcome': 'resolved', 'line.jin.outcome': 'unresolved', 'line.song.outcome': 'bad' } };
  ids.push(ids[0]);
  try { assert.equal(nationClosedLineCount(runtime), 2); } finally { ids.pop(); }
});
test('秦入口数值注册校验边界、线清单、失败映射', () => {
  assert.deepEqual(validateAgainstRegistry(n), []);
  for (const value of [0, 1.5, 6]) {
    const tree = structuredClone(n); tree.story.lineCompass.qinEntry.minClosedLines = value;
    assert.ok(validateAgainstRegistry(tree).some(e => e.includes('qinEntry.minClosedLines')));
  }
  for (const value of [['nanhuang'], [...ids, 'qin'], [...ids, 'taiquan'], [...ids, ids[0]]]) {
    const tree = structuredClone(n); tree.story.lineCompass.anyLineClosed.lineIds = value;
    assert.ok(validateAgainstRegistry(tree).some(e => e.includes('anyLineClosed.lineIds')));
  }
  const tree = structuredClone(n); tree.story.lineOutcome.failureClosureEvents.nanhuang = ['x', 'x'];
  assert.ok(validateAgainstRegistry(tree).some(e => e.includes('failureClosureEvents')));
});
test('派生路径 validator 接受 qinEntryReady，只许布尔比较', () => {
  const table = structuredClone(packs.lineCompass);
  table.lines[0].knownWhen = [{ path: 'compass.qinEntryReady', operator: 'eq', value: true }];
  assert.deepEqual(validateLineCompassTable(table, packs.texts, packs.lineCompassPlaces), []);
  table.lines[0].knownWhen[0].value = 3;
  assert.ok(validateLineCompassTable(table, packs.texts, packs.lineCompassPlaces).some(e => e.code === 'invalid_value'));
});
test('Q-1 两终结选择、三线条件；Q-2 跨关读 done', () => {
  const stage = packs.stages.find(s => s.manifest.id === 'lyg.qin_xianyang');
  assert.equal(validateScenarioMod(stage).valid, true);
  const event = stage.scenario.events.find(e => e.id === 'liuchao.event.qin_hook_fangshi_rumor');
  assert.deepEqual(event.conditions, [{ path: 'compass.qinEntryReady', operator: 'eq', value: true }]);
  assert.deepEqual(event.playerCompletionContract.actions.map(a => a.label), ['这就动身去咸阳', '先记下，手头的事办完再说']);
  assert.ok(event.playerCompletionContract.actions.every(a => a.kind !== 'prepare'));
  assert.deepEqual(event.playerCompletionContract.settleOn, ['success']);
  assert.ok(stage.scenario.events.find(e => e.id === 'liuchao.event.qin_enter_xianyang').conditions.some(c => c.path === 'done.liuchao.event.qin_hook_fangshi_rumor'));
});
test('未入秦的右栏提示不受汉身份、其他线焦点影响；未知/已入秦不出入口句', () => {
  const runtime = rt(['liuchao.event.qin_hook_fangshi_rumor']);
  runtime.modId = 'lcq.stage_07_qingyuan_jiankang';
  runtime.playerIdentities = { 'liuchao.identity.han.marquis_wuyang': { status: 'active' } };
  const view = () => lineCompassView({ 世界: { 状态: { 剧本模组: runtime } } }, { focusEventId: 'lcq.event.s07_02_kill_wu', compassPointer: () => '别处' });
  assert.deepEqual(view().entryHints, [{ lineId: 'qin', text: '去咸阳，找那个方士问问' }]);
  runtime.modId = 'lyg.qin_xianyang'; assert.deepEqual(view().entryHints, []);
  runtime.modId = 'lcq.stage_07_qingyuan_jiankang'; runtime.completedEventIds = []; assert.deepEqual(view().entryHints, []);
});

for (const actionId of ['go_now', 'later']) test(`隔离秦关合同：${actionId} 单独完成 Q-1，不自动移动，不再给传话动作`, async () => {
  const { buildStrictScenarioInitialization } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const { getCurrentStoryEventActions, recordStoryEventStructuredAction, advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const stage = packs.stages.find(s => s.manifest.id === 'lyg.qin_xianyang');
  const init = buildStrictScenarioInitialization(stage);
  const runtime = init.runtimeState;
  runtime.completedEventIds = [...closers.slice(0, 3)];
  runtime.activeEventIds = ['liuchao.event.qin_hook_fangshi_rumor'];
  const save = { 元数据: { 时间: { 年: 220, 月: 1, 日: 1, 小时: 12, 分钟: 0 } }, 角色: { 身份: {}, 属性: {}, 位置: init.initialLocation, 背包: { 金钱: {}, 物品: {} } }, 社交: { 关系: {} }, 系统: { 扩展: {} }, 世界: { 状态: { 剧本模组: runtime } } };
  const position = structuredClone(save.角色.位置);
  const selection = getCurrentStoryEventActions(save).find(a => a.actionId === actionId);
  assert.ok(selection);
  assert.equal(recordStoryEventStructuredAction(save, selection).completed, true);
  assert.deepEqual(save.角色.位置, position);
  const after = advanceScenarioRuntime(save).saveData;
  assert.ok(after.世界.状态.剧本模组.completedEventIds.includes('liuchao.event.qin_hook_fangshi_rumor'));
  assert.ok(getCurrentStoryEventActions(after).every(a => a.eventId !== 'liuchao.event.qin_hook_fangshi_rumor'));
});
