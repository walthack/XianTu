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
  const { getCurrentStoryEventActions, getCurrentStoryExplorationActions, recordStoryEventStructuredAction, advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const seen = [];
  let compassMoves = 0;
  for (let n = 0; n < 200 && !rt(save).nextStageReadyId; n++) {
    const actions = getCurrentStoryEventActions(save);
    // 完整行旅夹具先体验已批准的可选闲聊，再检验后续强制路线；跳过分支另有batch12夹具。
    const action = getCurrentStoryExplorationActions(save).find(item => item.eventId === 'lcq.event.zhu88_heimohai_chat') || actions.find(item => !item.judgement && !item.actionId.startsWith('travel:') && !item.actionId.startsWith('idle:')
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

test('03b：蛇彝村→巨藤→花苗寨→熊耳铺全走强制回执，不需要罗盘移动；三段累计三日，不再各记数日', async () => {
  const start = await opened(S03B);
  assert.equal(rt(start).travelLedger.state.currentZoneId, 'nh.sheyi', '开局按现位置建账');
  const { save, seen, compassMoves } = await walk(start);
  assert.equal(compassMoves, 0);
  assert.equal(at(seen, 's03b_snake_flower_bridge_01'), '南荒·蛇彝村');
  assert.equal(at(seen, 's03b_snake_flower_bridge_05'), '南荒·万古巨藤');
  assert.equal(at(seen, 's03b_snake_flower_bridge_06'), '南荒·花苗寨');
  assert.equal(at(seen, 's03b_yinzhu_xiongerpu'), '南荒·花苗寨');
  const receipts = rt(save).travelLedger.state.travelReceipts.filter(item => item.turnCost > 0).map(item => item.receiptId);
  assert.deepEqual(receipts, [
    'forced:lcq.event.s03b_snake_flower_bridge_04:nh.r.after.s03b_04',
    'forced:lcq.event.s03b_snake_flower_bridge_05:nh.r.after.s03b_05',
    'forced:lcq.event.s03b_yinzhu_xiongerpu::burn_yinzhu_victim:nh.r.after.wanwu_night',
  ]);
  assert.equal(save.元数据.时间.相对日, undefined);
  assert.ok(save.元数据.时间.日 - start.元数据.时间.日 >= 3, '三日行旅另含明确夜间场景的顺时推进');
  assert.match(rt(save).travelLedger.lastCard.text, /【路途】花苗寨 → 熊耳铺｜.*｜耗时：当日/);
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
  // 新关completedEventIds不携带旧关拍；搜刮前置依行旅历史继续有效。
  const { settleLocationLoot, QINGYU_LOOT_TABLE } = await loadTs('../src/modules/scenarioMods/locationLoot.ts');
  const prior = 'lcq.event.s03b_yinzhu_xiongerpu';
  assert.ok(!rt(moved.saveData).completedEventIds.includes(prior));
  const loot = structuredClone(QINGYU_LOOT_TABLE);
  loot.rules.commonSlots = [1, 0]; loot.rules.rareChance = 0; loot.rules.largeCurrencyChance = 0;
  loot.locations['liuchao.location.shan_jian'].entries = [{ id: 'cross-stage-herb', itemId: 'lcq.item.nh_mountain_herb', category: 'common', quantity: [1, 1], afterEventIds: [prior] }];
  assert.equal(settleLocationLoot(moved.saveData, loot).receipt.drops[0].itemId, 'lcq.item.nh_mountain_herb');

  for (const name of ['凝羽', '武二郎', '祁远', '吴战威', '易彪', '谢艺', '云苍峰']) assert.ok(ledger.lastCard.companions.includes(name), name);
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

test('02→03b 转关只接续到达，不重复南下天数；旧档也不补收', async () => {
  const { settleNanhuangStageTransition } = await loadTs('../src/modules/scenarioMods/travel/travelLedger.ts');
  const save = await opened(S03B);
  delete rt(save).travelLedger;
  const time = structuredClone(save.元数据.时间);
  assert.deepEqual(settleNanhuangStageTransition(save, rt(save), 'lcq.stage_02', S03B, undefined), []);
  assert.deepEqual(save.元数据.时间, time);
  assert.equal(save.角色.位置.描述, '南荒·蛇彝村');
});

 test('departure from Wuyuan immediately creates the travel card/calendar receipt and replays only once', async () => {
  const { syncNanhuangRailTravel } = await loadTs('../src/modules/scenarioMods/travel/travelLedger.ts');
  const save = await opened('lcq.stage_02');
  save.角色.位置.描述 = '中州·五原·白湖商馆门前街';
  delete rt(save).travelLedger;
  rt(save).completedEventIds = ['lcq.event.wuerlang_joins'];
  save.元数据.时间 = { 年: 200, 月: 1, 日: 1, 小时: 8, 分钟: 0 };
  syncNanhuangRailTravel(save, rt(save));
  assert.equal(save.元数据.时间.日, 4);
  assert.equal(rt(save).travelLedger.state.currentZoneId, 'nh.iron_bridge');
  assert.match(rt(save).travelLedger.lastCard.text, /五原城 → 铁索桥.*耗时：三日/);
  const receiptCount = rt(save).travelLedger.state.travelReceipts.length;
  const time = structuredClone(save.元数据.时间);
  syncNanhuangRailTravel(save, rt(save));
  assert.deepEqual(save.元数据.时间, time);
  assert.equal(rt(save).travelLedger.state.travelReceipts.length, receiptCount);
});

 test('heard locations, active Saan boundary, departure companions and fractional days follow approved itinerary', async () => {
  const { getNanhuangLocationStates, settleNanhuangForcedTravel, advanceClock } = await loadTs('../src/modules/scenarioMods/travel/travelLedger.ts');
  const { QINGYU_NANHUANG_DEFINITION: def } = await loadTs('../src/modules/scenarioMods/travel/defs/qingyuNanhuang.ts');
  const save = await opened(S03B);
  let states = Object.fromEntries(getNanhuangLocationStates(save).map(x => [x.zoneId, x]));
  assert.equal(states['nh.baiyi'].visibility, 'hidden');
  rt(save).completedEventIds.push('lcq.event.s03b_snake_flower_bridge_04');
  states = Object.fromEntries(getNanhuangLocationStates(save).map(x => [x.zoneId, x]));
  for (const id of ['nh.baiyi','nh.xiongerpu']) assert.equal(states[id].visibility, 'heard');
  save.社交.关系 = { 祁远: { 当前位置: { 描述: save.角色.位置.描述 } }, 谢艺: { 当前位置: { 描述: '中州·别处' } } };
  rt(save).activeEventIds = [];
  rt(save).events.find(e => e.id === 'lcq.event.s03b_snake_flower_bridge_04').relatedCharacterIds = ['liuchao.character.qi_yuan'];
  const { currentTravelCompanions } = await loadTs('../src/modules/scenarioMods/travel/travelLedger.ts');
  const companions = currentTravelCompanions(save, rt(save));
  assert.ok(companions.includes('祁远'));
  assert.ok(!companions.includes('谢艺'), '无随队回执且位置明确在别处的人不加入');
  const cards = settleNanhuangForcedTravel(save, rt(save), { afterEventDone: 'lcq.event.s03b_snake_flower_bridge_04' });
  assert.deepEqual(cards[0].companions, companions);
  save.社交.关系.祁远.当前位置.描述 = '别处';
  assert.deepEqual(cards[0].companions, companions, 'card keeps the departure snapshot');
  save.元数据.时间 = { 年: 200, 月: 1, 日: 1, 小时: 8, 分钟: 0 };
  advanceClock(save, { days: 1.5 }, 'test');
  assert.equal(save.元数据.时间.日, 2); assert.equal(save.元数据.时间.小时, 20);
  const fifth = await opened('lcq.stage_05b');
  rt(fifth).travelLedger.state.currentZoneId = 'nh.guiwang_dong';
  rt(fifth).activeEventIds = ['lcq.event.s05b_03_saan_secret_path'];
  assert.equal(getNanhuangLocationStates(fifth).find(x => x.zoneId === 'nh.guiwang_inn').canTravel, false);
  assert.match(def.routes.find(x => x.id === 'nh.r.after.coop_pact').label, /弥骨/);
  assert.equal(def.routes.find(x => x.id === 'nh.r.after.coop_pact').dayCost, 5);
});

test('real Wuerlang contract completion starts the itinerary before Iron Bridge; five road beats stay unskipped', async () => {
  const { getCanonRailProfile } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
  const { getCurrentStoryEventActions, getCurrentStoryExplorationActions, recordStoryEventStructuredAction, advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { fixedBeatNarrative } = await loadTs('../src/modules/scenarioMods/fixedEndingNarratives.ts');
  let save = await opened('lcq.stage_02');
  save.角色.位置.描述 = '中州·五原·白湖商馆门前街';
  delete rt(save).travelLedger;
  const rail = getCanonRailProfile(rt(save)).orderedEventIds;
  for (const id of rail.slice(0, rail.indexOf('lcq.event.wuerlang_joins'))) {
    rt(save).completedEventIds.push(id);
    const e = rt(save).events.find(e => e.id === id);
    for (const c of e?.completion || []) if (c.path.startsWith('flags.')) rt(save).flags[c.path.slice(6)] = c.value;
  }
  save = advanceScenarioRuntime(save).saveData;
  const day = save.元数据.时间.日;
  for (let i = 0; i < 4 && !rt(save).completedEventIds.includes('lcq.event.wuerlang_joins'); i++) {
    const action = getCurrentStoryEventActions(save)[0];
    assert.equal(action.eventId, 'lcq.event.wuerlang_joins');
    rt(save).worldTurn++;
    assert.equal(recordStoryEventStructuredAction(save, action).attempted, true);
    save = advanceScenarioRuntime(save).saveData;
  }
  assert.equal(save.元数据.时间.日, day + 3);
  assert.match(rt(save).travelLedger.lastCard.text, /五原城 → 铁索桥/);
  assert.ok(rt(save).travelLedger.lastCard.companions.includes('凝羽'));
  assert.ok(rt(save).travelLedger.lastCard.companions.includes('武二郎'), 'runtime join receipt supplies the member omitted from the early canon card');
  const roadIds = ['iron_bridge_ambush','ningyu_regicide_offer','zixi_taiyi_intercept','rainforest_black_shoal','silent_sheyi_village'];
  for (const id of roadIds) {
    assert.ok(!rt(save).completedEventIds.includes('lcq.event.' + id));
    for (const action of rt(save).events.find(e => e.id === 'lcq.event.' + id).playerCompletionContract.actions) assert.equal(fixedBeatNarrative('lcq.event.' + id, action.id), undefined);
  }
});

test('叶媪村后五日与散峒半日推进日历、显示卡面，重放不重复收费', async () => {
  const { settleNanhuangForcedTravel } = await loadTs('../src/modules/scenarioMods/travel/travelLedger.ts');
  for (const [stageId, from, eventId, duration, day, hour] of [
    [S04, 'nh.yeao', 'lcq.event.s04_04', '五日', 6, 8],
    ['lcq.stage_05b', 'nh.guiwang_dong', 'lcq.event.tribes_pledge', '半日', 1, 20],
  ]) {
    const save = await opened(stageId);
    rt(save).travelLedger.state.currentZoneId = from;
    save.元数据.时间 = { 年: 200, 月: 1, 日: 1, 小时: 8, 分钟: 0 };
    const cards = settleNanhuangForcedTravel(save, rt(save), { afterEventDone: eventId });
    assert.equal(cards.length, 1, eventId);
    assert.ok(cards[0].text.includes(`耗时：${duration}`), cards[0].text);
    assert.equal(save.元数据.时间.日, day, eventId);
    assert.equal(save.元数据.时间.小时, hour, eventId);
    const time = structuredClone(save.元数据.时间);
    const count = rt(save).travelLedger.state.travelReceipts.length;
    assert.deepEqual(settleNanhuangForcedTravel(save, rt(save), { afterEventDone: eventId }), []);
    assert.deepEqual(save.元数据.时间, time);
    assert.equal(rt(save).travelLedger.state.travelReceipts.length, count);
  }
});


test('真实切关04b→05b在事件清空后仍携带出发队伍，排除离场者', async () => {
  const { transitionToNextScenarioStage } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const first = await walk(await opened(S03B));
  const fourth = transitionToNextScenarioStage(first.save, [parseScenarioMod(await stage(S04))]);
  assert.equal(fourth.ok, true, fourth.reason);
  const fourthDone = await walk(fourth.saveData);
  const fourthB = transitionToNextScenarioStage(fourthDone.save, [parseScenarioMod(await stage(S04B))]);
  assert.equal(fourthB.ok, true, fourthB.reason);
  const { save } = await walk(fourthB.saveData);
  const before = [...rt(save).travelLedger.lastCard.companions];
  const moved = transitionToNextScenarioStage(save, [parseScenarioMod(await stage('lcq.stage_05')), parseScenarioMod(await stage('lcq.stage_05b'))]);
  assert.equal(moved.ok, true, moved.reason);
  const names = rt(moved.saveData).travelLedger.lastCard.companions;
  for (const name of ['凝羽', '武二郎', '谢艺', '云苍峰']) assert.ok(names.includes(name), name);
  for (const name of before) assert.ok(names.includes(name), name);
  for (const name of ['阿葭', '段强', '易虎', '石刚']) assert.ok(!names.includes(name), name);
});
