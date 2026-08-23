import assert from 'node:assert/strict';
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
    世界: { 状态: { 剧本模组: {
      modId: 'lcq.stage_02', ...(storyMode ? { storyMode } : {}), worldTurn: 10,
      currentChapterId: 'lcq.chapter.s02',
      chapters: [{ id: 'lcq.chapter.s02', eventIds: [event.id] }], events: [event],
      completedChapterIds: [], activeEventIds: [event.id],
      completedEventIds: ['lcq.event.s02_03'], flags: { 'event.s02_04.done': false },
    } } },
  };
}

test('wuyuan slice starts only after the war/shuaizhang phase and contains no gate or Wang Zhe', async () => {
  const { ensureWuyuanOpenWorldSlice, WUYUAN_OPEN_WORLD_DEFINITION } = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
  const tooEarly = save();
  tooEarly.世界.状态.剧本模组.completedEventIds = [];
  tooEarly.世界.状态.剧本模组.activeEventIds = ['lcq.event.s02_03'];
  assert.equal(ensureWuyuanOpenWorldSlice(tooEarly), undefined);
  const serialized = JSON.stringify(WUYUAN_OPEN_WORLD_DEFINITION);
  assert.equal(serialized.includes('王哲'), false);
  assert.equal(serialized.includes('城门盘查'), false);
  assert.equal(serialized.includes('帅帐'), false);
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
  current.角色 = { 位置: { 描述: '旧位置' } };
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

test('completed canon beats deterministically project water-prison and hall location with causal receipts', async () => {
  const { ensureWuyuanOpenWorldSlice } = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
  const current = save();
  ensureWuyuanOpenWorldSlice(current);
  current.世界.状态.剧本模组.completedEventIds.push('lcq.event.s02_04');
  const water = ensureWuyuanOpenWorldSlice(current);
  assert.equal(water.currentZoneId, 'lcq.zone.wuyuan.water_prison');
  assert.match(water.chronicle.at(-1).text, /^因为.+，所以.+$/);
  current.世界.状态.剧本模组.completedEventIds.push('lcq.event.s02_05');
  assert.equal(ensureWuyuanOpenWorldSlice(current).currentZoneId, 'lcq.zone.wuyuan.baihu_hall');
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
