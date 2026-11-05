// 六朝 s02 尾拍「抵达无声蛇彝村」（2026-11-05 用户批准混合修）：
// A 商路拍出「前往蛇彝村」；玩家在新拍上过一回合后被推迟的强制路线自动结算（凝羽 y3 支线开着也不挡路）；event.locationId 改为蛇彝村。
// B confirm/settle 都带模型侧 describe、都进判定候选，settle 不再以 confirm 为前置（判中 settle 即视为已见寂静）。
// C 点心铺两个应对声明作者判定类别（掷骰第一档）。全部本地回放，不调模型。
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './loadTs.mjs';
const quiet = async fn => { const k = ['log', 'info', 'warn', 'error', 'debug'], o = k.map(x => console[x]); k.forEach(x => { console[x] = () => {}; }); try { return await fn(); } finally { k.forEach((x, i) => { console[x] = o[i]; }); } };
const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const W = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
const T = await loadTs('../src/modules/scenarioMods/actionTime.ts');
const BP = await loadTs('../src/modules/scenarioMods/beatProgress.ts');
const cp = await loadTs('../src/modules/contentPacks/index.ts');
const { GAME_NUMBERS } = await loadTs('../src/modules/sceneModule/numbers.ts');
const { freshPrologueCheckpoint } = await import('../scripts/generate-prologue-checkpoint.mjs');
const EV = 'lcq.event.silent_sheyi_village', SHEYI = 'lcq.location.sheyi_village';
const rt = s => s.世界.状态.剧本模组;
const advance = (s, id) => { T.settleActionTime(s, {}, { timeActionId: id }, null, false, false); return R.advanceScenarioRuntime(s).saveData; };

/** 与 /workspace/probe/sheyi.mjs 同一回放：从序章检查点按合同动作走到蛇彝村拍（停在任何动作之前）。 */
async function reachSheyi() {
  return quiet(async () => {
    let { save } = await freshPrologueCheckpoint();
    const pa = W.getWuyuanOpenWorldSelections(save).find(a => a.kind === 'problem_action');
    W.settleWuyuanOpenWorldSelection(save, pa); save = R.advanceScenarioRuntime(save).saveData;
    for (let n = 0; n < 200; n++) {
      const ev = R.getScenarioFocusEvent(rt(save));
      if (ev?.id === EV) return save;
      const acts = R.getCurrentStoryEventActions(save);
      const a = acts.find(x => ev?.playerCompletionContract?.actions.some(c => c.id === x.actionId)) || acts.find(x => x.actionId.startsWith('travel:'));
      assert.ok(a, `no action at ${ev?.id}`);
      assert.ok(R.recordStoryEventStructuredAction(save, a).attempted);
      save = advance(save, `cp:${n}`);
    }
    throw new Error('silent_sheyi_village not reached');
  });
}
const base = await reachSheyi();
const fresh = () => structuredClone(base);

test('到拍时：仍在黑石滩（凝羽 y3 窗口保留一回合），出「前往蛇彝村」按钮', () => {
  const s = fresh();
  assert.equal(rt(s).travelLedger.state.currentZoneId, 'nh.black_shoal');
  assert.ok(rt(s).travelLedger.deferredDepartureEventIds.includes('lcq.event.rainforest_black_shoal'));
  const acts = R.getCurrentStoryEventActions(s);
  assert.deepEqual(acts.map(a => a.actionId), [`travel:${SHEYI}`]);
  assert.match(acts[0].actionText, /蛇彝村/);
  assert.equal(rt(s).events.find(e => e.id === EV).locationId, SHEYI);
});

test('点「前往」：落到蛇彝村，被推迟的强制路线结算，confirm 与 settle 都可做', async () => {
  let s = fresh();
  const go = R.getCurrentStoryEventActions(s)[0];
  await quiet(() => { assert.equal(R.recordStoryEventStructuredAction(s, go).attempted, true); s = advance(s, 'go'); });
  assert.equal(rt(s).travelLedger.state.currentZoneId, 'nh.sheyi');
  assert.match(s.角色.位置.描述, /蛇彝村/);
  assert.ok(rt(s).travelLedger.doneEventIds.includes('lcq.event.rainforest_black_shoal'));
  assert.deepEqual(R.getCurrentStoryEventActions(s).map(a => a.actionId), ['confirm_sheyi_dark_and_silent', 'settle_caravan_in_silent_sheyi']);
});

test('不点按钮、手打一回合：被推迟的路线自动结算，不再死锁在黑石滩', async () => {
  let s = fresh();
  await quiet(() => { s = advance(s, 'typed'); });
  assert.equal(rt(s).travelLedger.state.currentZoneId, 'nh.sheyi');
  assert.match(s.角色.位置.描述, /蛇彝村/);
  assert.ok(R.getCurrentStoryEventActions(s).some(a => a.actionId === 'settle_caravan_in_silent_sheyi'));
});

test('判中 settle 直接完成本拍（视为已见寂静，不必先 confirm）', async () => {
  let s = fresh();
  await quiet(() => { s = advance(s, 'typed'); });
  const settle = R.getCurrentStoryEventActions(s).find(a => a.actionId === 'settle_caravan_in_silent_sheyi');
  const r = await quiet(() => R.recordStoryEventStructuredAction(s, settle));
  assert.equal(r.completed, true);
  await quiet(() => { s = advance(s, 'settle'); });
  assert.ok(rt(s).completedEventIds.includes(EV));
});

test('拍子判定候选含 confirm 与 settle，各带按意思的 describe（不加词表）', async () => {
  const QC = GAME_NUMBERS.story.quest, prev = QC.enabled; QC.enabled = true;
  try {
    let s = fresh();
    // 序章试玩档关了任务引导：按正式档看判定（同 beatIntentSettle s02_04 用例）。
    for (const p of cp.CONTENT_PACKS.playtests) if (p.openingTextId) delete s.系统.扩展[p.extensionKey];
    await quiet(() => { s = advance(s, 'typed'); });
    const plan = BP.beatKeyTurn(s, '我沿着旧车辙尝试进寨，把商队安置下来。');
    assert.ok(plan, 'beat judge plan');
    assert.deepEqual(plan.actions.map(a => a.id), ['confirm_sheyi_dark_and_silent', 'settle_caravan_in_silent_sheyi']);
    assert.match(plan.actions[0].do, /任何方式查看或试探村寨/);
    assert.match(plan.actions[1].do, /安顿/);
    const ev = rt(s).events.find(e => e.id === EV);
    for (const a of ev.playerCompletionContract.actions) {
      assert.equal(a.intentMatch?.matchAny, undefined, '不加词表');
      assert.equal(a.intentMatch?.rejectIf, undefined);
    }
    assert.equal(ev.playerCompletionContract.actions[1].requiresPreparation, undefined);
  } finally { QC.enabled = prev; }
});

test('点心铺两个应对声明作者判定类别（掷骰第一档），不改结局', async () => {
  const { save } = await quiet(() => freshPrologueCheckpoint());
  const acts = W.getWuyuanOpenWorldSelections(save).filter(a => a.kind === 'problem_action');
  const kinds = Object.fromEntries(acts.map(a => [a.identityId, a.judgement?.kind]));
  assert.deepEqual(kinds, { 'lcq.action.wuyuan.delay_and_observe': 'social', 'lcq.action.wuyuan.break_for_exit': 'escape' });
});
