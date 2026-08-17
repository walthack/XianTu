import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const dataUrl = new URL('../src/modules/scenarioMods/builtins/data/', import.meta.url);
const QUARANTINED_STAGE_IDS = new Set([
  'lcq.stage_03', 'lcq.stage_05', 'lcq.stage_06',
  'lyg.ganlu_bian', 'lyg.shixiang_ambush',
  'lyl.lin_an_black_sea', 'lyl.luoyang_coup', 'lyl.taiquan_expedition',
]);

async function loadAllStages() {
  const files = (await readdir(dataUrl)).filter(name => name.endsWith('.json')).sort();
  return Promise.all(files.map(async name => JSON.parse(await readFile(new URL(name, dataUrl), 'utf8'))));
}

function fixture(stage, event) {
  const chapter = stage.scenario.chapters.find(item => item.eventIds?.includes(event.id));
  return {
    角色: { 身份: { 名字: 'R2-11X全局收口' }, 位置: { 描述: '当前事件地点' }, 属性: { 声望: 0 } },
    社交: { 关系: {}, 记忆: { 短期记忆: [], 中期记忆: [], 长期记忆: [], 隐式中期记忆: [] } },
    系统: { 扩展: {}, 历史: { 叙事: [] } },
    世界: { 信息: { 世界名称: stage.world.name, 地点信息: [], 势力信息: [] }, 状态: { 剧本模组: {
      modId: stage.manifest.id,
      currentChapterId: chapter?.id,
      chapters: structuredClone(stage.scenario.chapters),
      events: structuredClone(stage.scenario.events),
      flags: structuredClone(stage.scenario.initialFlags),
      activeEventIds: [event.id],
      completedEventIds: [],
      completedChapterIds: [],
      offscreenResolvedEventIds: [],
      chronicle: [],
      stallTurns: 0,
      worldTurn: 0,
      canon: structuredClone(stage.canon),
    } } },
  };
}

test('every event has exactly one deterministic completion owner', async () => {
  const stages = await loadAllStages();
  const rows = stages.flatMap(stage => stage.scenario.events.map(event => ({ stage, event })));
  const objective = rows.filter(({ event }) => event.playerCompletionContract?.kind === 'objective_action');
  const localCondition = rows.filter(({ event }) => event.playerCompletionContract?.kind === 'local_condition');
  const opportunityOnly = rows.filter(({ event }) => !event.playerCompletionContract
    && event.worldActor?.opportunities?.some(opportunity => opportunity.completionContract));
  const uncovered = rows.filter(({ event }) => !event.playerCompletionContract
    && !event.worldActor?.opportunities?.some(opportunity => opportunity.completionContract));

  assert.equal(stages.length, 37);
  // 总数不写死（同 r2_11j，2026-08-17）：按线补写 event 会让它持续增长。
  // 保留的是两个**小而固定的集合**——它们是例外，例外变多才该警觉。
  assert.equal(localCondition.length, 1, 'local_condition 只该有一条（R2-11E 那个）');
  assert.equal(opportunityOnly.length, 6, '只靠机会卡兜底的 event 只该有 6 条');
  assert.ok(objective.length >= 389, 'objective_action 只增不减');
  assert.deepEqual(uncovered, []);
  for (const { event } of rows) {
    assert.equal(event.completion.length, 1, event.id);
    assert.equal(event.completion[0].operator, 'eq', event.id);
    assert.equal(event.completion[0].value, true, event.id);
    assert.match(event.completion[0].path, /^flags\./, event.id);
  }
});

test('all opportunities are explicit, contracted, and decision-bound', async () => {
  const stages = await loadAllStages();
  const rows = stages.flatMap(stage => stage.scenario.events.flatMap(event =>
    (event.worldActor?.opportunities || []).map(opportunity => ({ event, opportunity }))));
  assert.equal(rows.length, 61);
  for (const { event, opportunity } of rows) {
    assert.equal(Boolean(opportunity.trigger), true, opportunity.id);
    assert.equal(Boolean(opportunity.completionContract), true, opportunity.id);
    const bindings = event.worldActor.decisionCore.actionBindings;
    assert.equal(bindings.some(binding => opportunity.trigger.actionIds?.includes(binding.actionId)
      && binding.actorIds.some(actorId => opportunity.trigger.actorIds?.includes(actorId))), true, opportunity.id);
  }
});

test('LLM direct completion is rejected for every event and all eight rebuilt stages stay quarantined', async () => {
  const stages = await loadAllStages();
  const { guardScenarioModCommands } = await loadTs('../src/modules/scenarioMods/canonGuard.ts');
  const { isDefaultLineQuarantinedStageId } = await loadTs('../src/modules/scenarioMods/canonRail.ts');

  for (const stageId of QUARANTINED_STAGE_IDS) assert.equal(isDefaultLineQuarantinedStageId(stageId), true, stageId);
  for (const stage of stages) {
    for (const event of stage.scenario.events) {
      const completionPath = event.completion[0].path;
      const guarded = guardScenarioModCommands(fixture(stage, event), [{
        action: 'set',
        key: `世界.状态.剧本模组.${completionPath}`,
        value: true,
      }]);
      assert.deepEqual(guarded.accepted, [], event.id);
      assert.equal(guarded.rejected.length, 1, event.id);
    }
  }
});
