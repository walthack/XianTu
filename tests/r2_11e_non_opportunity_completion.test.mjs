import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stageUrl = new URL(
  '../src/modules/scenarioMods/builtins/data/lyg.dingtao_beijing.json',
  import.meta.url,
);
const EVENT_ID = 'lyg.event.s01_09';

function fixture(stage, charm = 6) {
  const flags = { ...stage.scenario.initialFlags };
  for (let index = 1; index <= 8; index++) flags[`event.s01_0${index}.done`] = true;
  return {
    角色: {
      身份: { 名字: 'R2-11E验收角色', 先天六司: { 魅力: charm } },
      位置: { 描述: '洛都宫城' },
      属性: { 声望: 0 },
    },
    社交: { 关系: {}, 记忆: { 短期记忆: [], 中期记忆: [], 长期记忆: [], 隐式中期记忆: [] } },
    系统: { 扩展: {}, 历史: { 叙事: [] } },
    世界: {
      信息: { 世界名称: stage.world.name, 地点信息: [], 势力信息: [] },
      状态: {
        剧本模组: {
          modId: stage.manifest.id,
          modName: stage.manifest.name,
          mode: 'strict',
          currentChapterId: 'lyg.chapter.dingtao_beijing',
          chapters: structuredClone(stage.scenario.chapters),
          events: structuredClone(stage.scenario.events),
          flags,
          activeEventIds: [EVENT_ID],
          completedEventIds: Array.from({ length: 8 }, (_, index) => `lyg.event.s01_0${index + 1}`),
          completedChapterIds: [],
          offscreenResolvedEventIds: [],
          chronicle: [],
          stallTurns: 0,
          worldTurn: 0,
          nextStageId: stage.manifest.nextStageId,
          canon: structuredClone(stage.canon),
        },
      },
    },
  };
}

const runtimeOf = save => save.世界.状态.剧本模组;

test('non-opportunity event exposes a stable engine action and settles a successful local check', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const {
    advanceScenarioRuntime,
    getCurrentStoryEventActions,
    recordStoryEventStructuredAction,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  let save = advanceScenarioRuntime(fixture(stage, 6)).saveData;
  const actions = getCurrentStoryEventActions(save);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].source, 'event_engine');
  assert.equal(actions[0].eventId, EVENT_ID);

  const result = recordStoryEventStructuredAction(save, actions[0]);
  assert.deepEqual(
    { attempted: result.attempted, completed: result.completed, outcome: result.outcome },
    { attempted: true, completed: true, outcome: 'success' },
  );
  save = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
  const runtime = runtimeOf(save);
  assert.equal(runtime.completedEventIds.includes(EVENT_ID), true);
  assert.equal(runtime.offscreenResolvedEventIds.includes(EVENT_ID), false);
  assert.equal(runtime.flags['event.s01_09.done'], true);
  assert.equal(runtime.eventActionStates[EVENT_ID].attempts[0].outcome, 'success');
});

test('an unmet local condition records partial participation without blocking the canon event', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const {
    advanceScenarioRuntime,
    getCurrentStoryEventActions,
    recordStoryEventStructuredAction,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  let save = advanceScenarioRuntime(fixture(stage, 3)).saveData;
  const action = getCurrentStoryEventActions(save)[0];
  const result = recordStoryEventStructuredAction(save, action);
  assert.equal(result.outcome, 'partial');
  assert.equal(result.completed, true);
  save = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
  const state = runtimeOf(save).eventActionStates[EVENT_ID];
  assert.equal(state.lastOutcome, 'partial');
  assert.match(state.attempts[0].detail, /政治余波/);
  assert.equal(runtimeOf(save).completedEventIds.includes(EVENT_ID), true);
});

test('ignoring a non-opportunity event reaches its absolute cutoff and settles offscreen', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  let save = advanceScenarioRuntime(fixture(stage)).saveData;
  for (let guard = 0; guard < 10 && !runtimeOf(save).offscreenResolvedEventIds.includes(EVENT_ID); guard++) {
    save = advanceScenarioRuntime(save).saveData;
  }
  const runtime = runtimeOf(save);
  assert.equal(runtime.offscreenResolvedEventIds.includes(EVENT_ID), true);
  assert.equal(runtime.completedEventIds.includes(EVENT_ID), false);
  assert.equal(runtime.flags['event.s01_09.done'], false);
  assert.equal(runtime.eventTimeline[EVENT_ID].outcome, 'offscreen');
});

test('event action rejects a stale contract and LLM completion writes', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const {
    advanceScenarioRuntime,
    getCurrentStoryEventActions,
    recordStoryEventStructuredAction,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { guardScenarioModCommands } = await loadTs('../src/modules/scenarioMods/canonGuard.ts');
  const save = advanceScenarioRuntime(fixture(stage)).saveData;
  const action = getCurrentStoryEventActions(save)[0];
  save.角色.身份.先天六司.魅力 = 3;
  assert.equal(recordStoryEventStructuredAction(save, action).reason, 'stale_condition');
  save.角色.身份.先天六司.魅力 = 6;
  runtimeOf(save).events.find(item => item.id === EVENT_ID)
    .playerCompletionContract.actions[0].successWhen[0].value = 7;
  assert.equal(recordStoryEventStructuredAction(save, action).reason, 'stale_contract');

  const command = {
    action: 'set',
    key: '世界.状态.剧本模组.flags.event.s01_09.done',
    value: true,
  };
  const guarded = guardScenarioModCommands(save, [command]);
  assert.deepEqual(guarded.accepted, []);
  assert.match(guarded.rejected[0].reason, /本地判定合同/);
});

test('validator rejects a local event contract without a deterministic condition', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const event = stage.scenario.events.find(item => item.id === EVENT_ID);
  event.playerCompletionContract.actions[0].successWhen = [];
  assert.equal(
    validateScenarioMod(stage).issues.some(item => item.code === 'required_array'
      && item.path.endsWith('successWhen')),
    true,
  );
});
