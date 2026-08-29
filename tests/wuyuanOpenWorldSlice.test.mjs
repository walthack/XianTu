import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

function captureEvent() {
  return {
    id: 'lcq.event.s02_04', name: '五原落奴', description: '点心铺里有人从两面逼近。',
    objective: '先保住性命并看清他们把人往哪里带', critical: true,
    completion: [{ path: 'flags.event.s02_04.done', operator: 'eq', value: true }],
    playerCompletionContract: {
      kind: 'objective_action', settleOn: ['success'], actions: [{
        id: 'advance_declared_objective', label: '应付逼近的人', actionText: '我应付眼前逼近的人', timeCost: 1,
        outcomeText: { success: '本地引擎结算既定拍。', partial: '部分推进。', failure: '未推进。' },
      }],
    },
  };
}

function save(storyMode) {
  const event = captureEvent();
  return {
    角色: { 位置: { 描述: '中州·五原·五原露天市集' } },
    世界: { 状态: { 剧本模组: {
      modId: 'lcq.stage_02', ...(storyMode ? { storyMode } : {}), worldTurn: 10,
      currentChapterId: 'lcq.chapter.s02',
      chapters: [{ id: 'lcq.chapter.s02', eventIds: [event.id] }], events: [event],
      completedChapterIds: [], activeEventIds: [event.id],
      completedEventIds: ['lcq.event.s02_02', 'lcq.event.s02_03'],
      flags: { 'event.s02_02.done': true, 'event.s02_03.done': true, 'event.s02_04.done': false },
      canon: { locations: [
        { id: 'lcq.location.command_tent', name: '帅帐' },
        { id: 'liuchao.location.wuyuan', name: '五原城' },
      ] },
    } } },
  };
}

function warCampSave(extra = {}) {
  const event = captureEvent();
  event.locationId = 'liuchao.location.wuyuan';
  event.objective = '五原城里有人把你当成逃奴，先应付眼前的盘问与拉扯';
  return {
    角色: { 位置: { 描述: '中州·帅帐' } },
    世界: { 状态: { 剧本模组: {
      modId: 'lcq.stage_02',
      worldTurn: 20,
      currentChapterId: 'lcq.chapter.s02',
      chapters: [{ id: 'lcq.chapter.s02', eventIds: ['lcq.event.s02_01', 'lcq.event.s02_03', 'lcq.event.s02_02', event.id] }],
      events: [
        { id: 'lcq.event.s02_01', completion: [{ path: 'flags.event.s02_01.done', operator: 'eq', value: true }] },
        { id: 'lcq.event.s02_03', completion: [{ path: 'flags.event.s02_03.done', operator: 'eq', value: true }] },
        { id: 'lcq.event.s02_02', completion: [{ path: 'flags.event.s02_02.done', operator: 'eq', value: true }] },
        event,
      ],
      completedChapterIds: [],
      ...extra,
      canon: { locations: [
        { id: 'lcq.location.command_tent', name: '帅帐' },
        { id: 'liuchao.location.wuyuan', name: '五原城' },
      ] },
    } } },
  };
}

test('wuyuan slice starts only after the war/shuaizhang phase and contains no gate or Wang Zhe', async () => {
  const { ensureWuyuanOpenWorldSlice, WUYUAN_OPEN_WORLD_DEFINITION } = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
  const tooEarly = save();
  tooEarly.世界.状态.剧本模组.completedEventIds = [];
  tooEarly.世界.状态.剧本模组.activeEventIds = ['lcq.event.s02_03'];
  tooEarly.世界.状态.剧本模组.flags = { 'event.s02_02.done': false, 'event.s02_03.done': false, 'event.s02_04.done': false };
  assert.equal(ensureWuyuanOpenWorldSlice(tooEarly), undefined);
  const serialized = JSON.stringify(WUYUAN_OPEN_WORLD_DEFINITION);
  assert.equal(serialized.includes('王哲'), false);
  assert.equal(serialized.includes('城门盘查'), false);
  assert.equal(serialized.includes('帅帐'), false);
});

test('s02_03_done_s02_02_active_at_shuaizhang_does_not_enable_wuyuan', async () => {
  const {
    ensureWuyuanOpenWorldSlice, getWuyuanOpenWorldSelections,
  } = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
  const current = warCampSave({
    completedEventIds: ['lcq.event.s02_01', 'lcq.event.s02_03'],
    activeEventIds: ['lcq.event.s02_02'],
    flags: {
      'event.s02_01.done': true,
      'event.s02_03.done': true,
      'event.s02_02.done': false,
      'event.s02_04.done': false,
    },
  });
  assert.equal(ensureWuyuanOpenWorldSlice(current), undefined);
  assert.equal(current.世界.状态.剧本模组.openWorldSlice, undefined);
  const selections = getWuyuanOpenWorldSelections(current);
  assert.equal(selections.length, 0);
  assert.equal(selections.some(item => item.label.includes('点心铺')), false);
  assert.equal(current.角色.位置.描述, '中州·帅帐');
});

test('arrive_wuyuan_market_does_not_complete_s02_04_or_reveal_water_prison', async () => {
  const {
    getWuyuanOpenWorldSelections, resolveWuyuanOpenWorldSelectionFromText, settleWuyuanOpenWorldSelection,
    getWuyuanOpenWorldPrompt, WUYUAN_MARKET_ARRIVAL_ID,
  } = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
  const { resolveStoryEventActionFromPlayerText } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const current = warCampSave({
    completedEventIds: ['lcq.event.s02_01', 'lcq.event.s02_03', 'lcq.event.s02_02'],
    activeEventIds: ['lcq.event.s02_04'],
    flags: {
      'event.s02_01.done': true,
      'event.s02_03.done': true,
      'event.s02_02.done': true,
      'event.s02_04.done': false,
    },
  });
  assert.equal(resolveStoryEventActionFromPlayerText(current, '我去五原城。'), undefined);
  const beforePastry = getWuyuanOpenWorldSelections(current);
  assert.equal(beforePastry.some(item => item.label.includes('点心铺')), false);
  const selection = resolveWuyuanOpenWorldSelectionFromText(current, '我去五原城。');
  assert.equal(selection?.identityId, WUYUAN_MARKET_ARRIVAL_ID);
  const settled = settleWuyuanOpenWorldSelection(current, selection);
  assert.equal(settled.settled, true);
  assert.equal(current.角色.位置.描述, '中州·五原·五原露天市集');
  assert.ok((current.世界.状态.剧本模组.openWorldSlice?.travelReceipts || []).length >= 1);
  assert.equal(current.世界.状态.剧本模组.flags['event.s02_04.done'], false);
  assert.deepEqual(current.世界.状态.剧本模组.activeEventIds, ['lcq.event.s02_04']);
  assert.equal(current.世界.状态.剧本模组.completedEventIds.includes('lcq.event.s02_05'), false);
  const after = getWuyuanOpenWorldSelections(current);
  assert.equal(after.some(item => item.kind === 'travel' && item.label.includes('点心铺')), true);
  assert.doesNotMatch(getWuyuanOpenWorldPrompt(current), /白湖商馆水牢/);
});

test('market exposes explicit known travel and authored notices without revealing White Lake', async () => {
  const { getWuyuanOpenWorldSelections, getWuyuanOpenWorldPrompt } = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
  const current = save();
  const selections = getWuyuanOpenWorldSelections(current);
  assert.equal(selections.filter(item => item.kind === 'travel').length, 1);
  assert.equal(selections.filter(item => item.kind === 'notice').length, 2);
  assert.match(getWuyuanOpenWorldPrompt(current), /当前位置：五原露天市集/);
  assert.doesNotMatch(getWuyuanOpenWorldPrompt(current), /白湖商馆水牢/);
});

test('active slice protects player position from model commands and projects only player-readable context', async () => {
  const { ensureWuyuanOpenWorldSlice } = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
  const { compileScenarioProtectedPaths } = await loadTs('../src/modules/scenarioMods/canonGuard.ts');
  const { buildScenarioStoryPrompt, createScenarioPromptState } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const current = save();
  ensureWuyuanOpenWorldSlice(current);
  assert.equal(current.角色.位置.描述, '中州·五原·五原露天市集');
  assert.ok(compileScenarioProtectedPaths(current).includes('角色.位置'));
  const promptState = createScenarioPromptState(current);
  assert.equal(promptState.世界.状态.剧本模组.openWorldSlice, undefined);
  const prompt = buildScenarioStoryPrompt(current);
  assert.match(prompt, /# 五原局部行动账（本地真值）/);
  assert.match(prompt, /当前位置：五原露天市集/);
  assert.doesNotMatch(prompt, /lcq\.route\./);
});

test('reading the rumor unlocks a slower named route, and unspecified destination becomes ambiguous', async () => {
  const {
    getWuyuanOpenWorldSelections, settleWuyuanOpenWorldSelection, resolveWuyuanOpenWorldSelectionFromText,
  } = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
  const current = save();
  const rumor = getWuyuanOpenWorldSelections(current).find(item =>
    item.kind === 'notice' && item.identityId === 'lcq.notice.wuyuan.pastry_back_alley');
  assert.equal(settleWuyuanOpenWorldSelection(current, rumor).settled, true);
  const routes = getWuyuanOpenWorldSelections(current).filter(item => item.kind === 'travel');
  assert.equal(routes.length, 2);
  assert.equal(resolveWuyuanOpenWorldSelectionFromText(current, '我去点心铺'), undefined);
  assert.equal(resolveWuyuanOpenWorldSelectionFromText(current, '我走后巷去点心铺').identityId, 'lcq.route.wuyuan.market_to_pastry_alley');
});

test('travel is explicit and both local solutions converge to the canon capture only in companion mode', async () => {
  const {
    getWuyuanOpenWorldSelections, settleWuyuanOpenWorldSelection,
  } = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
  const companion = save();
  const travel = getWuyuanOpenWorldSelections(companion).find(item => item.kind === 'travel');
  settleWuyuanOpenWorldSelection(companion, travel);
  const localActions = getWuyuanOpenWorldSelections(companion).filter(item => item.kind === 'problem_action');
  assert.equal(localActions.length, 2);
  const settled = settleWuyuanOpenWorldSelection(companion, localActions[1]);
  assert.equal(settled.settled, true);
  assert.equal(settled.canonEventCompleted, true);
  assert.equal(companion.世界.状态.剧本模组.openWorldSlice.problemStates['lcq.problem.wuyuan.pastry_capture'], 'captured_injured');

  const world = save('world_sim');
  const worldTravel = getWuyuanOpenWorldSelections(world).find(item => item.kind === 'travel');
  settleWuyuanOpenWorldSelection(world, worldTravel);
  const worldAction = getWuyuanOpenWorldSelections(world).find(item => item.kind === 'problem_action');
  const worldSettled = settleWuyuanOpenWorldSelection(world, worldAction);
  assert.equal(worldSettled.settled, true);
  assert.equal(worldSettled.canonEventCompleted, undefined);
  assert.equal(world.世界.状态.剧本模组.eventActionStates, undefined);
});

test('completed canon beats settle forced routes instead of teleporting', async () => {
  const { ensureWuyuanOpenWorldSlice } = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
  const current = save();
  ensureWuyuanOpenWorldSlice(current);
  current.世界.状态.剧本模组.completedEventIds.push('lcq.event.s02_04');
  const water = ensureWuyuanOpenWorldSlice(current);
  assert.equal(water.currentZoneId, 'lcq.zone.wuyuan.water_prison');
  assert.equal(current.角色.位置.描述, '中州·五原·白湖商馆水牢');
  const capture = water.travelReceipts.find(item => item.causeEventId === 'lcq.event.s02_04');
  assert.equal(capture?.mode, 'forced');
  assert.equal(capture?.toZoneId, 'lcq.zone.wuyuan.water_prison');
  assert.match(water.chronicle.at(-1).text, /^因为.+，所以.+$/);
  current.世界.状态.剧本模组.completedEventIds.push('lcq.event.s02_05');
  assert.equal(ensureWuyuanOpenWorldSlice(current).currentZoneId, 'lcq.zone.wuyuan.water_prison');
  current.世界.状态.剧本模组.completedEventIds.push('lcq.event.s02_06');
  const hall = ensureWuyuanOpenWorldSlice(current);
  assert.equal(hall.currentZoneId, 'lcq.zone.wuyuan.baihu_hall');
  assert.equal(current.角色.位置.描述, '中州·五原·白湖商馆内院');
  current.世界.状态.剧本模组.completedEventIds.push('lcq.event.baihu_shangguan_escape');
  const street = ensureWuyuanOpenWorldSlice(current);
  assert.equal(street.currentZoneId, 'lcq.zone.wuyuan.baihu_front_street');
  assert.equal(current.角色.位置.描述, '中州·五原·白湖商馆门前街');
  const hops = street.travelReceipts.filter(item => item.causeEventId === 'lcq.event.baihu_shangguan_escape');
  assert.deepEqual(hops.map(item => item.routeId), [
    'lcq.route.baihu.hall_to_gate',
    'lcq.route.baihu.exit_front_gate',
  ]);
});

test('ensureWuyuan normalizes same-version v1 receipts missing mode', async () => {
  const { ensureWuyuanOpenWorldSlice } = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
  const current = save();
  current.世界.状态.剧本模组.openWorldSlice = {
    version: 1,
    sliceId: 'lcq.open_world.wuyuan_v1',
    currentZoneId: 'lcq.zone.wuyuan.market',
    knownZoneIds: ['lcq.zone.wuyuan.market', 'lcq.zone.wuyuan.pastry_shop'],
    knownRouteIds: ['lcq.route.wuyuan.market_to_pastry_street'],
    requirements: [],
    elapsedTurns: 3,
    travelReceipts: [{
      receiptId: 'legacy-travel',
      routeId: 'lcq.route.wuyuan.market_to_pastry_street',
      fromZoneId: 'lcq.zone.wuyuan.market',
      toZoneId: 'lcq.zone.wuyuan.pastry_shop',
      departedAtTurn: 1,
      arrivedAtTurn: 2,
      turnCost: 1,
    }],
    noticeReceipts: [],
    actionReceipts: [],
    consequenceReceipts: [],
    pendingConsequences: [],
    problemStates: {},
    actorStates: {},
    chronicle: [],
  };
  const state = ensureWuyuanOpenWorldSlice(current);
  assert.equal(state.travelReceipts[0].mode, 'player');
});

test('escape hops commit only after completedEventIds are advanced', async () => {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const { createQingyuOpeningPlaytestSave } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const { transitionToNextScenarioStage } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const {
    getCurrentStoryEventActions, getScenarioFocusEvent,
    recordStoryEventStructuredAction, advanceScenarioRuntime,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { ensureWuyuanOpenWorldSlice } = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
  const [raw01, raw02] = await Promise.all([
    readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_01.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_02.json', import.meta.url), 'utf8'),
  ]);
  let saveData = createQingyuOpeningPlaytestSave(parseScenarioMod(JSON.parse(raw01)));
  const runtimeOf = current => current.世界?.状态?.剧本模组;
  const contractAction = current => {
    const event = getScenarioFocusEvent(runtimeOf(current));
    const contractIds = new Set((event?.playerCompletionContract?.actions || []).map(action => action.id));
    return getCurrentStoryEventActions(current).find(item => contractIds.has(item.actionId));
  };
  for (let step = 0; step < 40; step += 1) {
    if (runtimeOf(saveData)?.nextStageReadyId === 'lcq.stage_02') break;
    recordStoryEventStructuredAction(saveData, contractAction(saveData));
    saveData = advanceScenarioRuntime(saveData).saveData;
  }
  const transitioned = transitionToNextScenarioStage(saveData, [parseScenarioMod(JSON.parse(raw02))]);
  saveData = advanceScenarioRuntime(transitioned.saveData).saveData;
  for (const beat of [
    'lcq.event.s02_01', 'lcq.event.s02_03', 'lcq.event.s02_02', 'lcq.event.s02_04',
    'lcq.event.s02_05', 'lcq.event.s02_06', 'lcq.event.ningyu_enters_gamble',
    'lcq.event.sudaji_south_pact', 'lcq.event.gamble_bond_signed',
    'lcq.event.charge_sudaji_fee', 'lcq.event.free_ajiman',
  ]) {
    for (let step = 0; step < 8; step += 1) {
      if ((runtimeOf(saveData).completedEventIds || []).includes(beat)) break;
      const selection = getCurrentStoryEventActions(saveData).find(item => item.eventId === beat) || contractAction(saveData);
      recordStoryEventStructuredAction(saveData, selection);
      saveData = advanceScenarioRuntime(saveData).saveData;
    }
  }
  const escape = getCurrentStoryEventActions(saveData).find(item => item.actionId === 'walk_out_wuyuan_shangguan');
  assert.ok(escape);
  recordStoryEventStructuredAction(saveData, escape);
  const tooEarly = ensureWuyuanOpenWorldSlice(saveData);
  assert.notEqual(tooEarly?.currentZoneId, 'lcq.zone.wuyuan.baihu_front_street');
  saveData = advanceScenarioRuntime(saveData).saveData;
  const committed = ensureWuyuanOpenWorldSlice(saveData);
  assert.equal(committed.currentZoneId, 'lcq.zone.wuyuan.baihu_front_street');
  const hops = committed.travelReceipts.filter(item => item.causeEventId === 'lcq.event.baihu_shangguan_escape');
  assert.deepEqual(hops.map(item => item.routeId), [
    'lcq.route.baihu.hall_to_gate',
    'lcq.route.baihu.exit_front_gate',
  ]);
  assert.equal(saveData.角色.位置.描述, '中州·五原·白湖商馆门前街');
});

test('delayed response is tied to the chosen process and is idempotent across refresh', async () => {
  const { getWuyuanOpenWorldSelections, settleWuyuanOpenWorldSelection, ensureWuyuanOpenWorldSlice } = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
  const current = save();
  settleWuyuanOpenWorldSelection(current, getWuyuanOpenWorldSelections(current).find(item => item.kind === 'travel'));
  settleWuyuanOpenWorldSelection(current, getWuyuanOpenWorldSelections(current).find(item => item.identityId === 'lcq.action.wuyuan.delay_and_observe'));
  current.世界.状态.剧本模组.worldTurn += 4;
  const state = ensureWuyuanOpenWorldSlice(current);
  assert.equal(state.actorStates['liuchao.character.ning_yu'].status, '留意玩家是否能在受制时保持清醒');
  const count = state.consequenceReceipts.length;
  ensureWuyuanOpenWorldSlice(current);
  assert.equal(state.consequenceReceipts.length, count);
});
