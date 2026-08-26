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

test('任务栏罗盘写清去帅帐见王哲，走到即推进，不靠诊治原句', async () => {
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
  assert.equal(byTravel?.eventId, 'lcq.event.s01_05', '去帅帐即可落账，不必打出诊治原句');
  assert.equal(resolveStoryEventActionFromPlayerText(next, '随便走走')?.eventId, undefined);

  const walked = structuredClone(next);
  walked.角色.位置.描述 = '中州·帅帐';
  const afterArrival = advanceScenarioRuntime(walked).saveData;
  const arrived = afterArrival.世界.状态.剧本模组;
  assert.ok(arrived.completedEventIds.includes('lcq.event.s01_05'), '走到帅帐应结清见王哲，不要求诊治原句');

  const clicked = structuredClone(next);
  const recorded = recordStoryEventStructuredAction(clicked, byTravel);
  assert.equal(recorded.completed, true);
  const afterClick = advanceScenarioRuntime(clicked).saveData;
  assert.ok(afterClick.世界.状态.剧本模组.completedEventIds.includes('lcq.event.s01_05'));
  assert.match(String(afterClick.角色.位置.描述), /帅帐/);
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
  assert.equal(action.playerLine, action.label, '点按填入必须与按钮文案一致');
  assert.equal(action.playerLine.includes('我让对方诊治'), false);
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
  assert.equal(wang.playerLine, wang.label);
});

test('交接窗不挡去帅帐：自由输入仍落账并改地点', async () => {
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
  assert.equal(recorded.completed, true);
  const after = advanceScenarioRuntime(save).saveData;
  assert.ok(after.世界.状态.剧本模组.completedEventIds.includes('lcq.event.s01_05'));
  assert.match(String(after.角色.位置.描述), /帅帐/);
});

test('同地激活的拍不会因为人已经在场而立刻结清', async () => {
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = await playtestSave();
  const first = save.世界.状态.剧本模组.activeEventIds.slice();
  const next = advanceScenarioRuntime(save).saveData;
  assert.deepEqual(next.世界.状态.剧本模组.activeEventIds, first);
});
