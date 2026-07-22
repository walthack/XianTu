import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const dataUrl = new URL('../src/modules/scenarioMods/builtins/data/', import.meta.url);
const EXPECTED = new Map([
  ['opportunity.lcq.s10_04.counterintelligence_probe', {
    stageId: 'lcq.stage_10_jiangzhou_shadow_war', eventId: 'lcq.event.s10_04_left_army_review',
    actorId: 'liuchao.character.xiao_zi', selectedActionId: 'gather_intelligence',
  }],
  ['opportunity.lyl.s05_09.preserve_ambush_evidence', {
    stageId: 'lyl.luoyang_cloud_secret', eventId: 'lyl.event.s05_09',
    actorId: 'liuchao.character.yun_cang_feng', selectedActionId: 'open_safe_route',
  }],
  ['opportunity.lyg.s01_07.withdrawal_logistics', {
    stageId: 'lyg.dingtao_beijing', eventId: 'lyg.event.s01_07',
    actorId: 'liuchao.character.jia_wenhe', selectedActionId: 'reserve_supplies',
  }],
]);

async function loadAllStages() {
  const files = (await readdir(dataUrl)).filter(name => name.endsWith('.json')).sort();
  return Promise.all(files.map(async name => JSON.parse(await readFile(new URL(name, dataUrl), 'utf8'))));
}

function singleEventFixture(stage, event) {
  return {
    角色: { 身份: { 名字: 'R2-11W机会卡验收' }, 位置: { 描述: '当前事件地点' }, 属性: { 声望: 0 } },
    社交: { 关系: {}, 记忆: { 短期记忆: [], 中期记忆: [], 长期记忆: [], 隐式中期记忆: [] } },
    系统: { 扩展: {}, 历史: { 叙事: [] } },
    世界: { 信息: { 世界名称: stage.world.name, 地点信息: [], 势力信息: [] }, 状态: { 剧本模组: {
      modId: stage.manifest.id,
      currentChapterId: 'test.chapter',
      chapters: [{ id: 'test.chapter', title: '测试章节', summary: '', eventIds: [event.id] }],
      events: [structuredClone(event)],
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

test('curated opportunity inventory grows from seven to ten without mechanical event-card parity', async () => {
  const stages = await loadAllStages();
  const opportunities = stages.flatMap(stage => stage.scenario.events.flatMap(event =>
    (event.worldActor?.opportunities || []).map(opportunity => ({ stage, event, opportunity }))));
  assert.equal(opportunities.length, 10);
  assert.equal(opportunities.length < stages.flatMap(stage => stage.scenario.events).length, true);
  assert.deepEqual(
    new Set(opportunities.filter(item => EXPECTED.has(item.opportunity.id)).map(item => item.opportunity.id)),
    new Set(EXPECTED.keys()),
  );
});

test('each new card is bound to a real deterministic actor decision and a structured two-step contract', async () => {
  const stages = await loadAllStages();
  const { decideNpcActions } = await loadTs('../src/modules/scenarioMods/npcDecisionCore.ts');
  for (const [opportunityId, expected] of EXPECTED) {
    const stage = stages.find(item => item.manifest.id === expected.stageId);
    const event = stage.scenario.events.find(item => item.id === expected.eventId);
    const opportunity = event.worldActor.opportunities.find(item => item.id === opportunityId);
    const bindings = event.worldActor.decisionCore.actionBindings;
    assert.equal(bindings.some(binding => opportunity.trigger.actionIds.includes(binding.actionId)
      && binding.actorIds.some(actorId => opportunity.trigger.actorIds.includes(actorId))), true, opportunityId);

    const decisions = decideNpcActions(event.worldActor.decisionCore).decisions;
    assert.equal(decisions.some(decision => decision.actorId === expected.actorId
      && decision.actionId === expected.selectedActionId), true, `${opportunityId}: default decision`);
    assert.equal(opportunity.trigger.actorIds.includes(expected.actorId), true, `${opportunityId}: trigger actor`);
    assert.equal(opportunity.trigger.actionIds.includes(expected.selectedActionId), true, `${opportunityId}: trigger action`);
    assert.equal(opportunity.completionContract.steps.length, 2, opportunityId);
    for (const step of opportunity.completionContract.steps) {
      assert.equal(step.actions.length >= 1, true, `${opportunityId}:${step.id}`);
      assert.equal(step.actions.every(action => action.timeCost === 1), true, `${opportunityId}:${step.id}:timeCost`);
    }
  }
});

test('production runtime actually surfaces all three new cards from their default NPC decisions', async () => {
  const stages = await loadAllStages();
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  for (const [opportunityId, expected] of EXPECTED) {
    const stage = stages.find(item => item.manifest.id === expected.stageId);
    const event = stage.scenario.events.find(item => item.id === expected.eventId);
    const save = advanceScenarioRuntime(singleEventFixture(stage, event)).saveData;
    const engine = save.世界.状态.剧本模组.actorEngine;
    assert.equal(engine.opportunityStates[opportunityId].status, 'available', opportunityId);
    assert.equal(engine.decisions.some(decision => decision.actorId === expected.actorId
      && decision.actionId === expected.selectedActionId), true, opportunityId);
  }
});

test('all builtins remain schema-valid after curated card expansion', async () => {
  const stages = await loadAllStages();
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  for (const stage of stages) {
    const result = validateScenarioMod(stage);
    assert.deepEqual(result.issues, [], `${stage.manifest.id}: ${JSON.stringify(result.issues)}`);
  }
});
