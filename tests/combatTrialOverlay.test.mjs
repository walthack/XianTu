// 战斗试玩（src/dev/combatTrial）：覆盖后的 s04_02 合同能被真实引擎走完整条拍，且任何状态都不卡死。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const S04 = 'lcq.stage_04';
const EVENT = 'lcq.event.s04_02';
const stageMod = async () => JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${S04}.json`, import.meta.url), 'utf8'));
const rt = save => save.世界.状态.剧本模组;

async function fresh(mode = 'B', extra = {}) {
  const { createCombatTrialSave } = await loadTs('../src/dev/combatTrial/overlay.ts');
  return createCombatTrialSave(await stageMod(), { mode, generatedAt: '2026-10-04T12:00:00.000Z', ...extra });
}

async function click(save, actionId) {
  const runtime = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const action = runtime.getCurrentStoryEventActions(save).find(item => item.actionId === actionId);
  assert.ok(action, `动作 ${actionId} 不可见；当前可见：${JSON.stringify(runtime.getCurrentStoryEventActions(save).map(item => item.actionId))}`);
  rt(save).worldTurn++;
  const progress = runtime.recordStoryEventStructuredAction(save, action);
  assert.equal(progress.attempted, true, `动作 ${actionId} 未结算：${progress.reason}`);
  return runtime.advanceScenarioRuntime(save).saveData;
}

async function visible(save) {
  const { getCurrentStoryEventActions } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  return getCurrentStoryEventActions(save).map(item => item.actionId);
}

test('覆盖后的 04 关通过模组校验，且只替换 s04_02 的合同', async () => {
  const { overlayCombatTrialStage } = await loadTs('../src/dev/combatTrial/overlay.ts');
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const original = await stageMod();
  const overlaid = overlayCombatTrialStage(original);
  parseScenarioMod(overlaid);
  const ids = overlaid.scenario.events.find(event => event.id === EVENT).playerCompletionContract.actions.map(action => action.id);
  assert.deepEqual(ids, ['trial_engage', 'trial_after_win', 'trial_after_lose', 'trial_after_rout']);
  // 其它事件原样不动
  for (const event of original.scenario.events.filter(item => item.id !== EVENT)) {
    assert.deepEqual(overlaid.scenario.events.find(item => item.id === event.id), event);
  }
  // 每个动作都带非空的固定文本（缺文本时 forceFixed 会静默退回请求模型）
  for (const action of overlaid.scenario.events.find(event => event.id === EVENT).playerCompletionContract.actions) {
    assert.equal(action.forceFixed, true, `${action.id} 必须 forceFixed`);
    assert.ok(typeof action.fallbackText === 'string' && action.fallbackText.length > 40, `${action.id} 固定文本缺失`);
  }
  // 固定文本必须自己满足自己声明的语义检查
  for (const action of overlaid.scenario.events.find(event => event.id === EVENT).playerCompletionContract.actions.filter(item => item.factChecks)) {
    for (const group of action.factChecks) assert.ok(group.some(word => action.fallbackText.includes(word)), `${action.id} 的固定文本不含 ${group.join('/')}`);
  }
  // 入参不被修改
  assert.equal(original.scenario.events.find(event => event.id === EVENT).playerCompletionContract.actions[0].id, 'advance_declared_objective');
});

test('04 关数据形状变化时覆盖函数报清晰的错，而不是静默产出坏档', async () => {
  const { overlayCombatTrialStage } = await loadTs('../src/dev/combatTrial/overlay.ts');
  const broken = await stageMod();
  broken.scenario.events.find(event => event.id === EVENT).playerCompletionContract.actions[0].id = 'renamed';
  assert.throws(() => overlayCombatTrialStage(broken), /04 关数据形状已变/);
  const wrongStage = { ...(await stageMod()), manifest: { id: 'lcq.stage_01' } };
  assert.throws(() => overlayCombatTrialStage(wrongStage), /战斗试玩需要内置模组/);
});

test('开局：s04_02 是当前事件，只有「迎向雾里」一个按钮；存档带试玩签名和战斗状态', async () => {
  const save = await fresh('A');
  assert.deepEqual(await visible(save), ['trial_engage']);
  assert.equal(save.系统.扩展.清羽记开局.kind, 'qingyu-demo-v1');
  assert.equal(save.系统.扩展.战斗试玩.mode, 'A');
  assert.equal(save.系统.扩展.战斗试玩.status, 'idle');
  assert.equal(save.角色.身份.名字, '程宗扬');
  assert.equal(save.角色.身份.先天六司.气运, 6);
  assert.equal(save.元数据.时间.小时, 6);
});

test('遇敌后战斗没有结果前没有可完成的收尾动作（只剩兜底的留意四周）', async () => {
  let save = await fresh();
  save = await click(save, 'trial_engage');
  assert.ok(rt(save).eventActionStates[EVENT].preparations.includes('combat_engaged'));
  assert.ok(!rt(save).completedEventIds.includes(EVENT));
  const ids = await visible(save);
  assert.equal(ids.filter(id => id.startsWith('trial_after_')).length, 0);
  assert.deepEqual(ids.filter(id => !id.startsWith('idle:')), []);
});

for (const [result, actionId] of [['win', 'trial_after_win'], ['lose', 'trial_after_lose'], ['rout', 'trial_after_rout']]) {
  test(`战斗结果 ${result}：恰有一个收尾动作可见，点完事件完成、账本落账、终点卡片条件成立`, async () => {
    const { isNanhuangDemoFinished } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
    let save = await fresh();
    const day0 = save.元数据.时间.日;
    save = await click(save, 'trial_engage');
    assert.equal(isNanhuangDemoFinished(save), false);
    rt(save).flags['trial.combat.result'] = result;
    assert.deepEqual((await visible(save)).filter(id => id.startsWith('trial_after_')), [actionId]);
    save = await click(save, actionId);
    assert.ok(rt(save).completedEventIds.includes(EVENT));
    assert.equal(isNanhuangDemoFinished(save), true);
    assert.ok(rt(save).sceneLedger.worldFacts.includes('商队已与鬼王峒结怨'));
    const injuries = rt(save).sceneLedger.injuries;
    const names = Object.keys(injuries);
    if (result === 'win') assert.deepEqual(names, []);
    if (result === 'lose') assert.equal(names.length, 1);
    if (result === 'rout') assert.equal(names.length, 1);
    // 收尾动作的「清晨」时段不会把时钟推到次日
    assert.equal(save.元数据.时间.日, day0);
  });
}

test('战斗未分结果时写入非法结果值不会放出任何收尾动作', async () => {
  let save = await fresh();
  save = await click(save, 'trial_engage');
  rt(save).flags['trial.combat.result'] = 'bogus';
  assert.deepEqual((await visible(save)).filter(id => id.startsWith('trial_after_')), []);
});
