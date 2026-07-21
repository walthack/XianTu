import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stageUrl = new URL(
  '../src/modules/scenarioMods/builtins/data/lyg.dingtao_beijing.json',
  import.meta.url,
);
const ORDER = Array.from({ length: 8 }, (_, index) => `lyg.event.s01_0${index + 1}`);

function fixture(stage, eventId) {
  const index = ORDER.indexOf(eventId);
  assert.ok(index >= 0, `unsupported fixture event ${eventId}`);
  const flags = { ...stage.scenario.initialFlags };
  for (const completedId of ORDER.slice(0, index)) {
    flags[`event.${completedId.split('.').at(-1)}.done`] = true;
  }
  return {
    角色: { 身份: { 名字: 'R2-11跨事件验收角色' }, 位置: { 描述: '洛都宫城' }, 属性: { 声望: 0 } },
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
          activeEventIds: [eventId],
          completedEventIds: ORDER.slice(0, index),
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

async function playRoute(stage, eventId, opportunityId, actions) {
  const {
    advanceScenarioRuntime,
    recordStoryOpportunityPlayerAction,
    trackStoryOpportunity,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  let save = advanceScenarioRuntime(fixture(stage, eventId)).saveData;
  assert.equal(trackStoryOpportunity(save, opportunityId).ok, true, `${eventId} opportunity must surface`);
  const steps = [];
  for (const action of actions) {
    const result = recordStoryOpportunityPlayerAction(save, action);
    assert.equal(result.progressed, true, `${eventId}: ${action}`);
    steps.push(result.stepId);
    save = advanceScenarioRuntime(save).saveData;
  }
  return { save, steps, advanceScenarioRuntime };
}

test('s01_06 records player protection but waits for the canonical deadline to settle death', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const eventId = 'lyg.event.s01_06';
  const opportunityId = 'opportunity.lyg.s01_06.royal_escape';
  let { save, steps, advanceScenarioRuntime } = await playRoute(stage, eventId, opportunityId, [
    '我先与郭解确认宫道和接应路线。',
    '我亲自护送定陶王撤离刺杀压力。',
    '我完成交接，并承担后续护持。',
  ]);
  assert.deepEqual(steps, ['confirm_escape_route', 'escort_emperor', 'handoff_guardianship']);
  assert.equal(runtimeOf(save).flags['event.s01_06.done'], false, 'player input cannot make the death occur early');
  save = JSON.parse(JSON.stringify(save));

  for (let guard = 0; guard < 10 && !runtimeOf(save).completedEventIds.includes(eventId); guard++) {
    save = advanceScenarioRuntime(save).saveData;
  }
  save = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
  const runtime = runtimeOf(save);
  assert.equal(runtime.completedEventIds.includes(eventId), true);
  assert.equal(runtime.offscreenResolvedEventIds.includes(eventId), false);
  assert.equal(runtime.eventTimeline[eventId].outcome, 'participated');
  assert.equal(
    runtime.eventTimeline[eventId].occurredAtTurn - runtime.eventTimeline[eventId].eligibleAtTurn,
    6,
  );
  assert.equal(runtime.actorEngine.entitlements.filter(item => item.key === 'permission.lyg.guo_jie.youxia_dispatch').length, 1);
});

test('s01_07 preserves an uncertain border report until its canonical deadline', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const eventId = 'lyg.event.s01_07';
  const opportunityId = 'opportunity.lyg.s01_07.border_warning';
  let { save, steps, advanceScenarioRuntime } = await playRoute(stage, eventId, opportunityId, [
    '我先核对边报的消息来源。',
    '这份边警仍未经核实，真假难辨。',
    '我接下边警，交给贾文和维持联络线。',
  ]);
  assert.deepEqual(steps, ['verify_border_source', 'preserve_uncertainty', 'handoff_border_contact']);
  assert.equal(runtimeOf(save).flags['event.s01_07.done'], false, 'handoff does not prematurely assert Dong Zhuo death');

  for (let guard = 0; guard < 10 && !runtimeOf(save).completedEventIds.includes(eventId); guard++) {
    save = advanceScenarioRuntime(save).saveData;
  }
  const runtime = runtimeOf(save);
  assert.equal(runtime.completedEventIds.includes(eventId), true);
  assert.equal(runtime.offscreenResolvedEventIds.includes(eventId), false);
  assert.equal(runtime.eventTimeline[eventId].outcome, 'participated');
  assert.equal(
    runtime.eventTimeline[eventId].occurredAtTurn - runtime.eventTimeline[eventId].eligibleAtTurn,
    5,
  );
  assert.equal(runtime.actorEngine.entitlements.filter(item => item.key === 'permission.lyg.jia_wenhe.border_warning').length, 1);
});

test('s01_08 settles immediately only after the private knowledge-boundary conversation', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const eventId = 'lyg.event.s01_08';
  const opportunityId = 'opportunity.lyg.s01_08.verify_shengji';
  const { save, steps } = await playRoute(stage, eventId, opportunityId, [
    '我避开旁人，与阮香凝单独交谈。',
    '我逐项区分她的亲知事实、定陶王反应与仍待核验的推断。',
  ]);
  const runtime = runtimeOf(save);
  assert.deepEqual(steps, ['speak_in_private', 'separate_fact_from_inference']);
  assert.equal(runtime.completedEventIds.includes(eventId), true);
  assert.equal(runtime.eventTimeline[eventId].outcome, 'participated');
  assert.equal(runtime.offscreenResolvedEventIds.includes(eventId), false);
  assert.equal(runtime.actorEngine.entitlements.filter(item => item.key === 'permission.lyg.ruan_xiangning.source_check').length, 1);
});

test('s01_08 persistent completion route cannot expire into an engine-owned deadlock', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const eventId = 'lyg.event.s01_08';
  const opportunityId = 'opportunity.lyg.s01_08.verify_shengji';
  const {
    advanceScenarioRuntime,
    recordStoryOpportunityPlayerAction,
    trackStoryOpportunity,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  let save = advanceScenarioRuntime(fixture(stage, eventId)).saveData;
  for (let turn = 0; turn < 8; turn++) save = advanceScenarioRuntime(save).saveData;
  assert.equal(runtimeOf(save).actorEngine.opportunityStates[opportunityId].status, 'available');
  assert.equal(trackStoryOpportunity(save, opportunityId).ok, true);
  for (let turn = 0; turn < 7; turn++) save = advanceScenarioRuntime(save).saveData;
  assert.equal(runtimeOf(save).actorEngine.opportunityStates[opportunityId].status, 'tracked');

  assert.equal(recordStoryOpportunityPlayerAction(save, '我与阮香凝私下核验这条线索。').progressed, true);
  save = advanceScenarioRuntime(save).saveData;
  assert.equal(
    recordStoryOpportunityPlayerAction(save, '我逐项区分亲知事实、定陶王反应与推断。').completed,
    true,
  );
  save = advanceScenarioRuntime(save).saveData;
  assert.equal(runtimeOf(save).completedEventIds.includes(eventId), true);
});

test('timeline settlement validates deadlines and all migrated events reject LLM done writes', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const invalid = structuredClone(stage);
  delete invalid.scenario.events.find(item => item.id === 'lyg.event.s01_06').timeline.deadlineTurns;
  assert.equal(
    validateScenarioMod(invalid).issues.some(item => item.code === 'missing_deadline'),
    true,
  );
  const conflictingExpiry = structuredClone(stage);
  conflictingExpiry.scenario.events.find(item => item.id === 'lyg.event.s01_08')
    .worldActor.opportunities[0].expiresAfterTurns = 4;
  assert.equal(
    validateScenarioMod(conflictingExpiry).issues.some(item => item.code === 'conflicting_expiry'),
    true,
  );

  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { guardScenarioModCommands } = await loadTs('../src/modules/scenarioMods/canonGuard.ts');
  for (const suffix of ['s01_06', 's01_07', 's01_08']) {
    const eventId = `lyg.event.${suffix}`;
    const save = advanceScenarioRuntime(fixture(stage, eventId)).saveData;
    const result = guardScenarioModCommands(save, [{
      action: 'set',
      key: `世界.状态.剧本模组.flags.event.${suffix}.done`,
      value: true,
    }]);
    assert.deepEqual(result.accepted, []);
    assert.match(result.rejected[0].reason, /本地引擎独占写入/);
  }
});
