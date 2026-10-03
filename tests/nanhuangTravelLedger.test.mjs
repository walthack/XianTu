import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const S03B = 'lcq.stage_03b_snake_flower_bridge';
const S04 = 'lcq.stage_04';
const S04B = 'lcq.stage_04b_lingfei_baiyi_crisis';
const stage = async id => JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`, import.meta.url), 'utf8'));
const rt = save => save.世界.状态.剧本模组;

async function opened(id) {
  const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
  const { buildStrictScenarioInitialization, applyStrictScenarioInitializationToSave } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  return advanceScenarioRuntime(applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), buildStrictScenarioInitialization(await stage(id)))).saveData;
}

/** 按真实合同动作走完本关；记下每拍出现时的位置，以及是否曾需要罗盘移动。 */
async function walk(save) {
  const { getCurrentStoryEventActions, recordStoryEventStructuredAction, advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const seen = [];
  let compassMoves = 0;
  for (let n = 0; n < 200 && !rt(save).nextStageReadyId; n++) {
    const actions = getCurrentStoryEventActions(save);
    const action = actions.find(item => !item.judgement && !item.actionId.startsWith('travel:') && !item.actionId.startsWith('idle:')
      && rt(save).events.find(event => event.id === item.eventId)?.playerCompletionContract?.actions.some(entry => entry.id === item.actionId))
      || actions.find(item => item.actionId.startsWith('travel:'));
    assert.ok(action, `stalled: ${JSON.stringify(actions.map(item => item.actionId))}`);
    if (action.actionId.startsWith('travel:')) compassMoves += 1;
    else if (!seen.some(item => item.eventId === action.eventId)) seen.push({ eventId: action.eventId, at: save.角色.位置.描述 });
    rt(save).worldTurn++;
    assert.equal(recordStoryEventStructuredAction(save, action).attempted, true);
    save = advanceScenarioRuntime(save).saveData;
  }
  return { save, seen, compassMoves };
}

const at = (seen, short) => seen.find(item => item.eventId === `lcq.event.${short}`)?.at;

test('03b：蛇彝村→巨藤→花苗寨→熊耳铺全走强制回执，不需要罗盘移动；数日路段写相对日', async () => {
  const start = await opened(S03B);
  assert.equal(rt(start).travelLedger.state.currentZoneId, 'nh.sheyi', '开局按现位置建账');
  const { save, seen, compassMoves } = await walk(start);
  assert.equal(compassMoves, 0);
  assert.equal(at(seen, 's03b_snake_flower_bridge_01'), '南荒·蛇彝村');
  assert.equal(at(seen, 's03b_snake_flower_bridge_05'), '南荒·万古巨藤');
  assert.equal(at(seen, 's03b_snake_flower_bridge_06'), '南荒·花苗寨');
  assert.equal(at(seen, 's03b_yinzhu_xiongerpu'), '南荒·熊耳铺');
  const receipts = rt(save).travelLedger.state.travelReceipts.filter(item => item.turnCost > 0).map(item => item.receiptId);
  assert.deepEqual(receipts, [
    'forced:lcq.event.s03b_snake_flower_bridge_04:nh.r.after.s03b_04',
    'forced:lcq.event.s03b_snake_flower_bridge_05:nh.r.after.s03b_05',
    'forced:lcq.event.s03b_wanwu_night:nh.r.after.wanwu_night',
  ]);
  assert.equal(save.元数据.时间.相对日, '数日后');
  assert.match(rt(save).travelLedger.lastCard.text, /【路途】花苗寨 → 熊耳铺｜.*｜耗时：数日/);
});

test('真实切关 03b→04：账跨关携带，转关路线落回执，位置在山涧', async () => {
  const { transitionToNextScenarioStage } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const { save } = await walk(await opened(S03B));
  const moved = transitionToNextScenarioStage(save, [parseScenarioMod(await stage(S04))]);
  assert.equal(moved.ok, true, moved.reason);
  const ledger = rt(moved.saveData).travelLedger;
  assert.equal(ledger.state.currentZoneId, 'nh.shan_jian');
  assert.ok(ledger.state.travelReceipts.some(item => item.receiptId === `forced:stage:${S03B}→${S04}:nh.r.stage.03b_04`));
  assert.ok(ledger.doneEventIds.includes('lcq.event.s03b_yinzhu_xiongerpu'), '跨关累积已完成拍');
  assert.equal(moved.saveData.角色.位置.描述, '南荒·南荒山涧');
});

test('04b：白夷→山谷→碧鲮→海神殿→古道→入峒全走强制回执；三态随进度推导', async () => {
  const { getNanhuangLocationStates } = await loadTs('../src/modules/scenarioMods/travel/travelLedger.ts');
  const { save, seen, compassMoves } = await walk(await opened(S04B));
  assert.equal(compassMoves, 0);
  assert.equal(at(seen, 's04b_lingfei_baiyi_crisis_13'), '南荒·白夷族');
  assert.equal(at(seen, 's04b_lingfei_baiyi_crisis_14'), '南荒·南荒山谷');
  assert.equal(at(seen, 's04b_lingfei_baiyi_crisis_15'), '南荒·碧鲮族');
  assert.equal(at(seen, 'haishen_hall_merfolk'), '南荒·海神殿');
  assert.equal(at(seen, 'regroup_caravan_envoy'), '南荒·碧鲮族');
  assert.equal(at(seen, 'enter_dong_with_migu'), '南荒·鬼王峒');
  const states = Object.fromEntries(getNanhuangLocationStates(save).map(item => [item.zoneId, item]));
  assert.equal(states['nh.guiwang_dong'].current, true);
  assert.equal(states['nh.gui_wang_gong'].visibility, 'heard', '第85章提及后听闻；进峒≠到宫');
  assert.equal(states['nh.jingshen_tai'].visibility, 'hidden');
  assert.equal(states['nh.baiyi'].label, '到过·当前不可前往');
  assert.equal(states['nh.yeao'].visibility, 'hidden');
});

test('旧档首次接入：按现位置建账，已完成拍只补 0 耗时回执，不推进日历、不挪位置', async () => {
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  let save = await opened(S04B);
  const { save: walked } = await walk(save);
  save = structuredClone(walked);
  delete rt(save).travelLedger;
  save.角色.位置.描述 = '南荒·鬼王峒';
  const time = structuredClone(save.元数据.时间);
  const next = advanceScenarioRuntime(save).saveData;
  const ledger = rt(next).travelLedger;
  assert.equal(ledger.backfilled, true);
  assert.equal(ledger.state.currentZoneId, 'nh.guiwang_dong');
  assert.ok(ledger.state.travelReceipts.length > 0 && ledger.state.travelReceipts.every(item => item.turnCost === 0));
  assert.deepEqual(next.元数据.时间, time);
  assert.equal(next.角色.位置.描述, '南荒·鬼王峒');
});

test('02→03b 转关：没有账时从五原建账；路途卡固定文本；数日写相对日；重复结算幂等', async () => {
  const { settleNanhuangStageTransition } = await loadTs('../src/modules/scenarioMods/travel/travelLedger.ts');
  const save = await opened(S03B);
  delete rt(save).travelLedger;
  save.元数据.时间 = { 年: 1, 月: 5, 日: 7, 小时: 8, 分钟: 0 };
  const cards = settleNanhuangStageTransition(save, rt(save), 'lcq.stage_02', S03B, undefined);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].text, '【路途】五原城 → 蛇彝村｜出五原，经白龙江口南下，入南荒，渡河，到蛇彝村。｜耗时：数日');
  assert.deepEqual(save.元数据.时间, { 年: 1, 月: 5, 日: 10, 小时: 8, 分钟: 0, 相对日: '数日后' });
  assert.equal(save.角色.位置.描述, '南荒·蛇彝村');
  assert.deepEqual(settleNanhuangStageTransition(save, rt(save), 'lcq.stage_02', S03B, undefined), [], '重试不重复记账');
  assert.equal(rt(save).travelLedger.state.travelReceipts.length, 1);
  assert.equal(save.元数据.时间.日, 10);
});
