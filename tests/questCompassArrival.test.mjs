import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stageUrl = new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_01.json', import.meta.url);

async function loadStage() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  return parseScenarioMod(JSON.parse(await readFile(stageUrl, 'utf8')));
}

async function playtestSave() {
  const { createQingyuOpeningPlaytestSave } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  return createQingyuOpeningPlaytestSave(await loadStage());
}

function skipToCommandTent(rt) {
  // 正典轨是 s01_01..04 → s01_06 月霜寒毒 → s01_05 见王哲。
  const prior = ['lcq.event.s01_01', 'lcq.event.s01_02', 'lcq.event.s01_03', 'lcq.event.s01_04', 'lcq.event.s01_06'];
  rt.completedEventIds = prior;
  for (const id of prior) rt.flags[`event.${id.slice('lcq.event.'.length)}.done`] = true;
  rt.activeEventIds = [];
}

test('任务栏罗盘写清去帅帐见王哲；到达≠完成，到帐后须另做真实动作', async () => {
  const { formatQuestCompass } = await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
  const {
    getCurrentStoryEventActions,
    advanceScenarioRuntime,
    resolveStoryEventActionFromPlayerText,
    recordStoryEventStructuredAction,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = await playtestSave();
  skipToCommandTent(save.世界.状态.剧本模组);
  let next = advanceScenarioRuntime(save).saveData;
  assert.ok(next.世界.状态.剧本模组.activeEventIds.includes('lcq.event.s01_05'));
  const atGrassland = 'lcq.location.grassland';
  const event = next.世界.状态.剧本模组.events.find(item => item.id === 'lcq.event.s01_05');
  const compass = formatQuestCompass(event, next.世界.状态.剧本模组, atGrassland);
  assert.match(compass, /去帅帐/);
  assert.match(compass, /见王哲/);
  assert.equal(compass.includes('程宗扬'), false);
  const actions = getCurrentStoryEventActions(next);
  assert.ok(actions.some(action => /去帅帐/.test(action.label) && /见王哲/.test(action.label)));

  next = advanceScenarioRuntime(next).saveData;
  assert.ok(next.世界.状态.剧本模组.activeEventIds.includes('lcq.event.s01_05'), '还在草原不得因人已在场而结清见王哲');

  const byTravel = resolveStoryEventActionFromPlayerText(next, '去帅帐');
  assert.equal(byTravel?.eventId, 'lcq.event.s01_05');
  assert.match(byTravel.actionId, /^travel:/, '去帅帐只换成移动，不是合同动作');
  assert.equal(resolveStoryEventActionFromPlayerText(next, '见王哲')?.actionId, byTravel.actionId, '见王哲同样只算移动');
  assert.equal(resolveStoryEventActionFromPlayerText(next, '随便走走')?.eventId, undefined);

  const walked = structuredClone(next);
  walked.角色.位置.描述 = '中州·帅帐';
  const afterArrival = advanceScenarioRuntime(walked).saveData;
  const arrived = afterArrival.世界.状态.剧本模组;
  assert.equal(arrived.completedEventIds.includes('lcq.event.s01_05'), false, '走到帅帐不得结清见王哲');
  assert.ok(arrived.activeEventIds.includes('lcq.event.s01_05'));

  const clicked = structuredClone(next);
  const recorded = recordStoryEventStructuredAction(clicked, byTravel);
  assert.equal(recorded.attempted, true);
  assert.equal(recorded.completed, false, '点去帅帐只移动');
  assert.match(String(clicked.角色.位置.描述), /帅帐/);
  assert.deepEqual(
    clicked.世界.状态.剧本模组.questArrivalReceipts.map(item => item.id),
    ['arrive:lcq.event.s01_05:lcq.location.command_tent'],
  );
  assert.equal(recordStoryEventStructuredAction(clicked, byTravel).attempted, false, '重复点击不重复记账');
  assert.equal(clicked.世界.状态.剧本模组.questArrivalReceipts.length, 1);
  const afterClick = advanceScenarioRuntime(clicked).saveData;
  assert.equal(afterClick.世界.状态.剧本模组.completedEventIds.includes('lcq.event.s01_05'), false);
  const onSite = getCurrentStoryEventActions(afterClick).filter(item => item.eventId === 'lcq.event.s01_05');
  assert.ok(onSite.length > 0 && onSite.every(item => !item.actionId.startsWith('travel:')), '到帐后显示合同动作');
  assert.equal(onSite.some(item => /去帅帐/.test(item.label)), false);
  const done = recordStoryEventStructuredAction(afterClick, onSite[0]);
  assert.equal(done.completed, true, '到场后另做真实动作才完成');
});

test('人已在目标地点时任务栏不写去该地，去帅帐按钮填入与标签一致', async () => {
  const { formatQuestCompass } = await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
  const { getCurrentStoryEventActions, advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = await playtestSave();
  const openingEvent = save.世界.状态.剧本模组.events.find(item => item.id === 'lcq.event.s01_01');
  const openingCompass = formatQuestCompass(openingEvent, save.世界.状态.剧本模组, 'lcq.location.grassland');
  assert.equal(openingCompass.includes('去草原'), false, '已在草原不得再写去草原');
  assert.match(openingCompass, /见段强|稳住|何处/);

  const rt = save.世界.状态.剧本模组;
  const prior = ['lcq.event.s01_01', 'lcq.event.s01_02', 'lcq.event.s01_03', 'lcq.event.s01_04', 'lcq.event.s01_06'];
  rt.completedEventIds = prior;
  for (const id of prior) rt.flags[`event.${id.slice('lcq.event.'.length)}.done`] = true;
  rt.activeEventIds = [];
  const next = advanceScenarioRuntime(save).saveData;
  const action = getCurrentStoryEventActions(next).find(item => item.eventId === 'lcq.event.s01_05' && item.source === 'event_engine');
  assert.ok(action, '见王哲拍应有主线按钮');
  assert.match(action.label, /去帅帐/);
  assert.match(action.label, /见王哲/);
  assert.equal(action.playerLine.includes(action.label), false, '玩家填入不得直接塞罗盘');
  assert.equal(action.playerLine.includes('我让对方诊治'), false);
  assert.match(action.playerLine, /^我/);
});

test('见月霜结清后立刻有去帅帐主线按钮合同', async () => {
  const {
    advanceScenarioRuntime,
    getCurrentStoryEventActions,
    recordStoryEventStructuredAction,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = await playtestSave();
  const rt = save.世界.状态.剧本模组;
  const prior = ['lcq.event.s01_01', 'lcq.event.s01_02', 'lcq.event.s01_03', 'lcq.event.s01_04'];
  rt.completedEventIds = prior;
  for (const id of prior) rt.flags[`event.${id.slice('lcq.event.'.length)}.done`] = true;
  rt.activeEventIds = [];
  let next = advanceScenarioRuntime(save).saveData;
  assert.ok(next.世界.状态.剧本模组.activeEventIds.includes('lcq.event.s01_06'));
  const frost = getCurrentStoryEventActions(next).find(item => item.eventId === 'lcq.event.s01_06' && item.source === 'event_engine');
  assert.ok(frost);
  assert.equal(recordStoryEventStructuredAction(next, frost).completed, true);
  next = advanceScenarioRuntime(next).saveData;
  const wang = getCurrentStoryEventActions(next).find(item => item.eventId === 'lcq.event.s01_05' && item.source === 'event_engine');
  assert.ok(wang);
  assert.match(wang.label, /去帅帐/);
  assert.equal(wang.playerLine.includes(wang.label), false);
  assert.match(wang.playerLine, /^我/);
});

test('交接窗不挡去帅帐：自由输入仍落移动并改地点，但不结清', async () => {
  const {
    advanceScenarioRuntime,
    hasPendingStoryBeatHandoff,
    resolveStoryEventActionFromPlayerText,
    recordStoryEventStructuredAction,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = await playtestSave();
  const rt = save.世界.状态.剧本模组;
  const prior = ['lcq.event.s01_01', 'lcq.event.s01_02', 'lcq.event.s01_03', 'lcq.event.s01_04', 'lcq.event.s01_06'];
  rt.completedEventIds = prior;
  for (const id of prior) rt.flags[`event.${id.slice('lcq.event.'.length)}.done`] = true;
  rt.activeEventIds = ['lcq.event.s01_05'];
  rt.lastSettledBeat = {
    eventId: 'lcq.event.s01_06',
    settledAtTurn: 8,
    targetEventId: 'lcq.event.s01_05',
  };
  assert.equal(hasPendingStoryBeatHandoff(save), true);
  const mapped = resolveStoryEventActionFromPlayerText(save, '我去帅帐。');
  assert.equal(mapped?.eventId, 'lcq.event.s01_05', '交接窗不得挡住 TES 去帅帐');
  const recorded = recordStoryEventStructuredAction(save, mapped);
  assert.equal(recorded.attempted, true);
  assert.equal(recorded.completed, false);
  const after = advanceScenarioRuntime(save).saveData;
  assert.equal(after.世界.状态.剧本模组.completedEventIds.includes('lcq.event.s01_05'), false);
  assert.match(String(after.角色.位置.描述), /帅帐/);
});

test('同地激活的拍不会因为人已经在场而立刻结清', async () => {
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = await playtestSave();
  const first = save.世界.状态.剧本模组.activeEventIds.slice();
  const next = advanceScenarioRuntime(save).saveData;
  assert.deepEqual(next.世界.状态.剧本模组.activeEventIds, first);
});

// 最小夹具：一拍、两处地点。actions 由各用例给。
function miniSave(actions, position) {
  const event = {
    id: 'lcq.event.mini', name: '小拍', description: '小拍', objective: '在渡口把事办了', critical: true,
    locationId: 'lcq.location.ferry',
    completion: [{ path: 'flags.event.mini.done', operator: 'eq', value: true }],
    playerCompletionContract: { kind: 'player_action', settleOn: ['success'], actions },
  };
  return {
    角色: { 位置: { 描述: position } },
    世界: { 状态: { 剧本模组: {
      modId: 'lcq.stage_mini', worldTurn: 3, currentChapterId: 'lcq.chapter.mini',
      chapters: [{ id: 'lcq.chapter.mini', eventIds: [event.id] }], events: [event],
      completedChapterIds: [], activeEventIds: [event.id], completedEventIds: [],
      flags: { 'event.mini.done': false },
      canon: { locations: [
        { id: 'lcq.location.camp', name: '营地' },
        { id: 'lcq.location.ferry', name: '渡口' },
      ] },
    } } },
  };
}

const outcomeText = { success: '成。', partial: '半成。', failure: '不成。' };
const LINEAR = [
  { id: 'look', kind: 'prepare', grantsPreparation: 'looked', label: '看清渡口', actionText: '我先看清渡口', timeCost: 1, outcomeText },
  { id: 'board', requiresPreparation: ['looked'], label: '登船', actionText: '我登船', timeCost: 1, outcomeText },
];

test('固定顺序的多步合同：人不在场只给移动，不能远程做任何一步，也不会被瞬移', async () => {
  const { getCurrentStoryEventActions, recordStoryEventStructuredAction, resolveStoryEventActionFromPlayerText } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = miniSave(structuredClone(LINEAR), '南荒·营地');
  const actions = getCurrentStoryEventActions(save);
  assert.deepEqual(actions.map(item => item.actionId), ['travel:lcq.location.ferry']);
  // 在场时拿到的真实按钮，人离开后再点（过期按钮）：不落账、不瞬移。
  const onSite = miniSave(structuredClone(LINEAR), '南荒·渡口');
  const [stale] = getCurrentStoryEventActions(onSite);
  assert.equal(stale.actionId, 'look');
  const remote = recordStoryEventStructuredAction(save, stale);
  assert.equal(remote.attempted, false);
  assert.equal(remote.reason, 'not_on_site');
  assert.equal(save.角色.位置.描述, '南荒·营地', '远程点合同动作不得瞬移');
  assert.equal(save.世界.状态.剧本模组.eventActionStates?.['lcq.event.mini']?.preparations?.length || 0, 0, '也不得记下准备');
  assert.equal(resolveStoryEventActionFromPlayerText(save, '去渡口')?.actionId, 'travel:lcq.location.ferry');

  assert.equal(recordStoryEventStructuredAction(save, actions[0]).completed, false);
  assert.equal(save.角色.位置.描述, '南荒·渡口');
  const [look] = getCurrentStoryEventActions(save);
  assert.equal(look.actionId, 'look', '到场后才是第一步');
  assert.equal(recordStoryEventStructuredAction(save, look).attempted, true);
});

test('位置解析不出时 fail closed 按不在场；五原区内节点算在五原城，真实动作照常给', async () => {
  const { getCurrentStoryEventActions } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const single = [{ id: 'do', label: '把事办了', actionText: '我把事办了', timeCost: 1, outcomeText }];
  const lost = miniSave(structuredClone(single), '__unresolvable__');
  assert.deepEqual(getCurrentStoryEventActions(lost).map(item => item.actionId), ['travel:lcq.location.ferry']);

  const city = miniSave(structuredClone(single), '中州·五原·点心铺');
  const rt = city.世界.状态.剧本模组;
  rt.canon.locations.push({ id: 'liuchao.location.wuyuan', name: '五原城' });
  rt.events[0].locationId = 'liuchao.location.wuyuan';
  assert.deepEqual(getCurrentStoryEventActions(city).map(item => item.actionId), ['do'], '五原区内即在场');
  city.角色.位置.描述 = '中州·五原·白湖商馆水牢';
  assert.deepEqual(getCurrentStoryEventActions(city).map(item => item.actionId), ['do']);
});

test('到场但这一拍没有可用动作：给一句固定的世界内提示，不给空列表；点它只过一回合', async () => {
  const { getCurrentStoryEventActions, recordStoryEventStructuredAction } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const blocked = [{ id: 'board', requiresPreparation: ['never'], label: '登船', actionText: '我登船', timeCost: 1, outcomeText }];
  const save = miniSave(blocked, '南荒·渡口');
  const actions = getCurrentStoryEventActions(save);
  assert.equal(actions.length, 1);
  const [idle] = actions;
  assert.equal(idle.actionId, 'idle:lcq.event.mini');
  assert.match(idle.label, /眼下还没有能着手的事/);
  assert.doesNotMatch(idle.label, /合同|动作|事件|引擎/, '提示是世界内的话');
  const before = JSON.stringify(save.世界.状态.剧本模组.eventActionStates || {});
  const result = recordStoryEventStructuredAction(save, idle);
  assert.equal(result.attempted, true);
  assert.equal(result.completed, false);
  assert.equal(JSON.stringify(save.世界.状态.剧本模组.eventActionStates || {}), before, '不碰合同状态');
  assert.equal(recordStoryEventStructuredAction(save, { ...idle, actionId: 'idle:lcq.event.other' }).attempted, false, '过期提示不落账');

  const away = miniSave(structuredClone(blocked), '南荒·营地');
  assert.deepEqual(getCurrentStoryEventActions(away).map(item => item.actionId), ['travel:lcq.location.ferry'], '不在场时仍先给移动');
});

test('单步合同同理：过期按钮在人离场后不落账、不瞬移', async () => {
  const { getCurrentStoryEventActions, recordStoryEventStructuredAction } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const single = [{ id: 'do', label: '把事办了', actionText: '我把事办了', timeCost: 1, outcomeText }];
  const [stale] = getCurrentStoryEventActions(miniSave(structuredClone(single), '南荒·渡口'));
  const away = miniSave(structuredClone(single), '南荒·营地');
  assert.equal(recordStoryEventStructuredAction(away, stale).reason, 'not_on_site');
  assert.equal(away.角色.位置.描述, '南荒·营地');
  assert.notEqual(away.世界.状态.剧本模组.flags['event.mini.done'], true);
});
