import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stageUrl = new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_05b.json', import.meta.url);
const stage06Url = new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_06.json', import.meta.url);
const EVENT_ID = 'lcq.event.xieyi_entrustment';

function fixture(stage, extra = {}) {
  const flags = {
    ...stage.scenario.initialFlags,
    'event.s05b_12.done': true,
    'event.ghost_king_swallowed.done': true,
    'event.slay_dragon.done': true,
    'event.xieyi_entrustment.done': false,
    ...(extra.flags || {}),
  };
  return {
    角色: {
      身份: { 名字: '程宗扬', 先天六司: { 悟性: 8, 灵性: 6, 心性: 4 }, 后天六司: {} },
      位置: { 描述: '南荒·鬼王峒', 灵气浓度: 50 },
      属性: { 气血: { 当前: 80, 上限: 200 }, 神识: { 当前: 200, 上限: 400 } },
    },
    社交: { 关系: { 乐明珠: { 名字: '乐明珠', 当前位置: '南荒·鬼王峒', 实时关注: true } } },
    系统: { 扩展: {} },
    世界: {
      状态: {
        剧本模组: {
          modId: stage.manifest.id,
          flags,
          chapters: structuredClone(stage.scenario.chapters),
          currentChapterId: 'lcq.chapter.stage_05b_reversal',
          events: structuredClone(stage.scenario.events),
          activeEventIds: [EVENT_ID],
          completedEventIds: ['lcq.event.ghost_king_swallowed', 'lcq.event.slay_dragon'],
          completedChapterIds: [
            'lcq.chapter.stage_05b_investigation',
            'lcq.chapter.stage_05b_palace',
          ],
          offscreenResolvedEventIds: [],
          eventActionStates: {},
          departedCast: extra.departedCast || [],
          divergences: [],
          stallTurns: 0,
          worldTurn: 20,
          canon: {
            characters: [
              { id: 'liuchao.character.le_mingzhu', name: '乐明珠' },
              { id: 'liuchao.character.xie_yi', name: '谢艺' },
            ],
            locations: [{ id: 'liuchao.location.gui_wang_dong', name: '鬼王峒' }],
          },
        },
      },
    },
  };
}

const runtimeOf = save => save.世界.状态.剧本模组;

test('slay_dragon 已收窄为只收龙神死亡', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const slay = stage.scenario.events.find(event => event.id === 'lcq.event.slay_dragon');
  assert.match(slay.objective, /了结龙神/);
  assert.equal(/托付|星月湖交代|命运/.test(slay.objective), false);
  assert.equal(/把小紫与星月湖交代/.test(slay.description), false);
  const fate = stage.scenario.events.find(event => event.id === EVENT_ID);
  assert.ok(fate, '必须存在 xieyi_entrustment');
  assert.deepEqual(fate.playerCompletionContract.actions.map(item => item.id), ['accept_entrustment', 'rescue_xieyi']);
  assert.ok(fate.playerCompletionContract.actions.find(item => item.id === 'rescue_xieyi').judgement);
});

test('乐明珠不在场时隐藏救治，只留承接', async () => {
  const { getCurrentStoryEventActions } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const present = getCurrentStoryEventActions(fixture(stage));
  assert.deepEqual(present.map(item => item.actionId).sort(), ['accept_entrustment', 'rescue_xieyi']);
  const hidden = getCurrentStoryEventActions(fixture(stage, { departedCast: ['乐明珠'] }));
  assert.deepEqual(hidden.map(item => item.actionId), ['accept_entrustment']);
});

test('【承接】映射 s06_03 done + dead，不写 IF，不写 missing', async () => {
  const { getCurrentStoryEventActions, recordStoryEventStructuredAction } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const save = fixture(stage);
  const accept = getCurrentStoryEventActions(save).find(item => item.actionId === 'accept_entrustment');
  const result = recordStoryEventStructuredAction(save, accept);
  assert.equal(result.completed, true);
  assert.equal(result.outcome, 'success');
  const runtime = runtimeOf(save);
  assert.equal(runtime.flags['event.s06_03.done'], true);
  assert.equal(runtime.flags['event.s06_03.void'], undefined);
  assert.equal(runtime.flags['character.xie_yi.status'], 'dead');
  assert.equal(runtime.flags['branch.lcq.if_xieyi_longrest.active'], undefined);
  assert.equal(runtime.flags['world.xieyi_absence.active'], undefined);
  assert.equal((runtime.divergences || []).length, 0);
});

test('【救治】success+ 同事务 void + longrest IF；判定引擎不写 flags', async () => {
  const { prepareEventActionJudgement } = await loadTs('../src/utils/judgementPreflight.ts');
  const { resolvePendingJudgement, getJudgementState } = await loadTs('../src/utils/judgementEngine.ts');
  const { getCurrentStoryEventActions, recordStoryEventStructuredAction } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const save = fixture(stage);
  const rescue = getCurrentStoryEventActions(save).find(item => item.actionId === 'rescue_xieyi');
  const issued = prepareEventActionJudgement(save, rescue, 20);
  const flagsBefore = JSON.stringify(runtimeOf(save).flags);
  const resolution = resolvePendingJudgement(save, issued.proposal.id, { currentTurn: 20, testOutcome: 'success', roll: () => 18 });
  assert.equal(JSON.stringify(runtimeOf(save).flags), flagsBefore, '判定引擎不得写剧本模组.flags');
  assert.equal(save.角色.属性.气血.当前, 80, '不得套用自我疗伤回血');
  const result = recordStoryEventStructuredAction(save, rescue, { judgementResolution: resolution });
  assert.equal(result.completed, true);
  assert.equal(result.outcome, 'success');
  const runtime = runtimeOf(save);
  assert.equal(runtime.flags['event.s06_03.void'], true);
  assert.equal(runtime.flags['event.s06_03.done'], undefined);
  assert.equal(runtime.flags['character.xie_yi.status'], 'longrest');
  assert.equal(runtime.flags['branch.lcq.if_xieyi_longrest.active'], true);
  assert.equal(runtime.flags['world.xieyi_absence.active'], undefined);
  assert.equal(getJudgementState(save).pending, undefined);
});

test('救治 partial/failure 仍死亡；映射幂等', async () => {
  const { prepareEventActionJudgement } = await loadTs('../src/utils/judgementPreflight.ts');
  const { resolvePendingJudgement } = await loadTs('../src/utils/judgementEngine.ts');
  const { getCurrentStoryEventActions, recordStoryEventStructuredAction } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const save = fixture(stage);
  const rescue = getCurrentStoryEventActions(save).find(item => item.actionId === 'rescue_xieyi');
  const issued = prepareEventActionJudgement(save, rescue, 20);
  const resolution = resolvePendingJudgement(save, issued.proposal.id, { currentTurn: 20, testOutcome: 'partial', roll: () => 8 });
  const result = recordStoryEventStructuredAction(save, rescue, { judgementResolution: resolution });
  assert.equal(result.outcome, 'partial');
  assert.equal(result.completed, true);
  const runtime = runtimeOf(save);
  assert.equal(runtime.flags['event.s06_03.done'], true);
  assert.equal(runtime.flags['event.s06_03.void'], undefined);
  assert.equal(runtime.flags['character.xie_yi.status'], 'dead');
  runtime.worldTurn = 21;
  const again = recordStoryEventStructuredAction(save, rescue, { judgementResolution: resolution });
  assert.equal(again.reason, 'already_completed');
  assert.equal(runtime.flags['event.s06_03.void'], undefined);
});

test('取消救治判定不收束命运', async () => {
  const { prepareEventActionJudgement } = await loadTs('../src/utils/judgementPreflight.ts');
  const { cancelPendingJudgement } = await loadTs('../src/utils/judgementEngine.ts');
  const { getCurrentStoryEventActions } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const save = fixture(stage);
  const rescue = getCurrentStoryEventActions(save).find(item => item.actionId === 'rescue_xieyi');
  const issued = prepareEventActionJudgement(save, rescue, 20);
  cancelPendingJudgement(save, issued.proposal.id, 20);
  const runtime = runtimeOf(save);
  assert.equal(runtime.flags['event.s06_03.done'], undefined);
  assert.equal(runtime.flags['event.s06_03.void'], undefined);
  assert.deepEqual(
    getCurrentStoryEventActions(save).map(item => item.actionId).sort(),
    ['accept_entrustment', 'rescue_xieyi'],
  );
});

test('隔离 stage_06 看到 void 映射后不得再激活 s06_03', async () => {
  const { advanceScenarioRuntime, getCurrentStoryEventActions } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const stage06 = JSON.parse(await readFile(stage06Url, 'utf8'));
  const save = {
    角色: { 位置: { 描述: '南荒·鬼王峒' } },
    世界: {
      状态: {
        剧本模组: {
          modId: stage06.manifest.id,
          flags: { 'event.s06_03.void': true, 'character.xie_yi.status': 'longrest' },
          chapters: structuredClone(stage06.scenario.chapters),
          currentChapterId: stage06.scenario.chapters[0]?.id,
          events: structuredClone(stage06.scenario.events),
          activeEventIds: ['lcq.event.s06_03'],
          completedEventIds: [],
          completedChapterIds: [],
          offscreenResolvedEventIds: [],
          stallTurns: 0,
          worldTurn: 1,
        },
      },
    },
  };
  const next = advanceScenarioRuntime(save).saveData;
  const runtime = runtimeOf(next);
  assert.equal(runtime.activeEventIds.includes('lcq.event.s06_03'), false);
  assert.equal(getCurrentStoryEventActions(next).some(item => item.eventId === 'lcq.event.s06_03'), false);
});
