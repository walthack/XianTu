import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const CURRENT_REGISTRY_VERSION = JSON.parse(
  await readFile(new URL('../src/modules/scenarioMods/builtins/character-registry.json', import.meta.url), 'utf8'),
).version;

const cases = [
  {
    file: 'lcq.stage_10_jiangzhou_shadow_war.json',
    eventId: 'lcq.event.s10_04_left_army_review',
    opportunityId: 'opportunity.lcq.s10_04.close_supply_gap',
    situationKeys: ['leakRisk', 'supplyContinuity'],
    expectedActions: ['audit_resources', 'gather_intelligence'],
    actorIds: ['liuchao.character.meng_fei_qing', 'liuchao.character.xiao_zi'],
    timelineKind: 'emergent',
    completionActionIds: ['audit_supply_records', 'split_supply_route'],
    rewardKey: 'permission.lcq.xingyue.logistics_review',
  },
  {
    file: 'lyl.luoyang_cloud_secret.json',
    eventId: 'lyl.event.s05_09',
    opportunityId: 'opportunity.lyl.s05_09.salvage_convoy',
    situationKeys: ['cargoSecurity', 'escortPressure'],
    expectedActions: ['open_safe_route', 'protect_principal'],
    actorIds: ['liuchao.character.yun_cang_feng', 'liuchao.character.yun_dan_liu'],
    timelineKind: 'window',
    completionActionIds: ['escort_wounded', 'open_segmented_route'],
    rewardKey: 'permission.lyl.yun_convoy.emergency_route',
  },
];

function setNested(root, path, value) {
  const keys = path.split('.');
  let cursor = root;
  for (const key of keys.slice(0, -1)) cursor = cursor[key] ||= {};
  cursor[keys.at(-1)] = value;
}

function fixture(stage, eventId) {
  const index = stage.scenario.events.findIndex(event => event.id === eventId);
  const completed = stage.scenario.events.slice(0, index).map(event => event.id);
  const flags = structuredClone(stage.scenario.initialFlags);
  for (const event of stage.scenario.events.slice(0, index)) {
    for (const condition of event.completion || []) {
      if (condition.operator === 'eq' && condition.value === true) setNested(flags, condition.path.replace(/^flags\./, ''), true);
    }
  }
  const chapter = stage.scenario.chapters.find(item => item.eventIds.includes(eventId));
  return {
    角色: { 身份: { 名字: 'R2-10H跨书验收' }, 位置: { 描述: '当前事件地点' }, 属性: { 声望: 0 } },
    社交: { 关系: {}, 记忆: { 短期记忆: [], 中期记忆: [], 长期记忆: [], 隐式中期记忆: [] } },
    系统: { 扩展: {}, 历史: { 叙事: [] } },
    世界: {
      信息: { 世界名称: stage.world.name, 地点信息: [], 势力信息: [] },
      状态: {
        剧本模组: {
          modId: stage.manifest.id,
          currentChapterId: chapter.id,
          chapters: structuredClone(stage.scenario.chapters),
          events: structuredClone(stage.scenario.events),
          flags,
          activeEventIds: [eventId],
          completedEventIds: completed,
          completedChapterIds: [],
          offscreenResolvedEventIds: [],
          chronicle: [],
          stallTurns: 0,
          worldTurn: 0,
          reconciledRegistryVersion: CURRENT_REGISTRY_VERSION,
          nextStageId: stage.manifest.nextStageId,
          canon: structuredClone(stage.canon),
        },
      },
    },
  };
}

const runtimeOf = save => save.世界.状态.剧本模组;

function assertByteIdentical(actual, expected, message) {
  if (actual === expected) return;
  let offset = 0;
  while (offset < actual.length && offset < expected.length && actual[offset] === expected[offset]) offset++;
  const start = Math.max(0, offset - 80);
  const end = offset + 120;
  assert.fail(`${message}; first byte difference at ${offset}\nactual: ${actual.slice(start, end)}\nexpected: ${expected.slice(start, end)}`);
}

test('Qingyu and Yunlong reuse one deterministic core for different event structures', async () => {
  const { decideNpcActions } = await loadTs('../src/modules/scenarioMods/npcDecisionCore.ts');
  for (const item of cases) {
    const stage = JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${item.file}`, import.meta.url), 'utf8'));
    const event = stage.scenario.events.find(candidate => candidate.id === item.eventId);
    const core = event.worldActor.decisionCore;
    const context = {
      round: 0,
      presentCharacterIds: event.relatedCharacterIds,
      affectedFactionIds: event.worldActor.pressure.factionIds,
      currentLocationId: event.locationId,
      majorEvent: true,
    };
    const first = decideNpcActions(core, core.situation.initialValues, core.actors, context);
    const reloadedCore = JSON.parse(JSON.stringify(core));
    const reloadedContext = JSON.parse(JSON.stringify(context));
    const replay = decideNpcActions(
      reloadedCore,
      JSON.parse(JSON.stringify(core.situation.initialValues)),
      JSON.parse(JSON.stringify(core.actors)),
      reloadedContext,
    );
    assertByteIdentical(JSON.stringify(replay), JSON.stringify(first), `${item.eventId} must replay byte-for-byte after JSON reload`);
    assert.deepEqual(Object.keys(core.situation.initialValues).sort(), item.situationKeys);
    assert.deepEqual(first.decisions.map(decision => decision.actionId), item.expectedActions);
    assert.equal(first.wakeAudit.every(audit => audit.awake), true);
    assert.equal(event.timeline.kind, item.timelineKind);
  }
});

test('cross-book wake budgets really skip absent actors and replay identically', async () => {
  const { decideNpcActions } = await loadTs('../src/modules/scenarioMods/npcDecisionCore.ts');
  for (const item of cases) {
    const stage = JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${item.file}`, import.meta.url), 'utf8'));
    const event = stage.scenario.events.find(candidate => candidate.id === item.eventId);
    const core = event.worldActor.decisionCore;
    const sleepingContext = {
      round: 1,
      presentCharacterIds: [],
      affectedFactionIds: [],
      namedCharacterIds: [],
      majorEvent: false,
    };
    const skipped = decideNpcActions(core, core.situation.initialValues, core.actors, sleepingContext);
    const replay = decideNpcActions(
      JSON.parse(JSON.stringify(core)),
      JSON.parse(JSON.stringify(core.situation.initialValues)),
      JSON.parse(JSON.stringify(core.actors)),
      JSON.parse(JSON.stringify(sleepingContext)),
    );
    assertByteIdentical(JSON.stringify(replay), JSON.stringify(skipped), `${item.eventId} sleeping replay diverged`);
    assert.equal(skipped.wakeAudit.every(audit => !audit.awake && audit.reason === 'sleeping'), true);
    assert.deepEqual(skipped.decisions, []);
  }
});

test('cross-book runtime remains byte-identical through JSON reload across multiple rounds', async () => {
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  for (const item of cases) {
    const stage = JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${item.file}`, import.meta.url), 'utf8'));
    let left = fixture(stage, item.eventId);
    let right = JSON.parse(JSON.stringify(left));
    for (let round = 0; round < 3; round++) {
      left = advanceScenarioRuntime(JSON.parse(JSON.stringify(left))).saveData;
      right = advanceScenarioRuntime(JSON.parse(JSON.stringify(right))).saveData;
      assertByteIdentical(JSON.stringify(right), JSON.stringify(left), `${item.eventId} runtime diverged after JSON round ${round + 1}`);
      assert.equal(runtimeOf(left).actorEngine.decisionInputHash, runtimeOf(right).actorEngine.decisionInputHash);
    }
  }
});

test('cross-book opportunity triggers surface without LLM and retain book-local state', async () => {
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  for (const item of cases) {
    const stage = JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${item.file}`, import.meta.url), 'utf8'));
    const save = advanceScenarioRuntime(fixture(stage, item.eventId)).saveData;
    const engine = runtimeOf(save).actorEngine;
    assert.equal(engine.anchorEventId, item.eventId);
    assert.equal(engine.opportunityStates[item.opportunityId].status, 'available');
    assert.deepEqual(Object.keys(engine.situationValues).sort(), item.situationKeys);
    assert.equal(engine.decisions.every(decision => decision.memories.length === 0), true);
    assert.deepEqual(engine.npcStates.map(actor => actor.characterId).sort(), item.actorIds.sort());
  }
});

test('cross-book opportunities complete through engine actions and preserve wake, lifecycle and memory evidence', async () => {
  const {
    advanceScenarioRuntime,
    getTrackedStoryOpportunityActions,
    recordStoryOpportunityStructuredAction,
    trackStoryOpportunity,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  for (const item of cases) {
    const stage = JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${item.file}`, import.meta.url), 'utf8'));
    let save = advanceScenarioRuntime(fixture(stage, item.eventId)).saveData;
    assert.equal(trackStoryOpportunity(save, item.opportunityId).ok, true);
    let actions = getTrackedStoryOpportunityActions(save);
    const first = actions.find(action => action.actionId === item.completionActionIds[0]);
    assert.ok(first);
    assert.equal(recordStoryOpportunityStructuredAction(save, first).progressed, true);
    assert.equal(recordStoryOpportunityStructuredAction(save, first).reason, 'already_progressed');

    save = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
    const during = runtimeOf(save).actorEngine;
    assert.equal(during.wakeAudit.every(audit => audit.awake), true);
    assert.equal(during.decisions.every(decision => decision.durationTurns === 2), true);
    actions = getTrackedStoryOpportunityActions(save);
    const second = actions.find(action => action.actionId === item.completionActionIds[1]);
    assert.ok(second);
    assert.equal(recordStoryOpportunityStructuredAction(save, second).completed, true);

    save = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
    const runtime = runtimeOf(save);
    assert.equal(runtime.completedEventIds.includes(item.eventId), true);
    assert.equal(runtime.offscreenResolvedEventIds.includes(item.eventId), false);
    assert.equal(runtime.actorEngine.entitlements.filter(entry => entry.key === item.rewardKey).length, 1);
    assert.equal(runtime.actorEngine.receipts.some(receipt =>
      receipt.anchorEventId === item.eventId && receipt.outcome === 'participated'), true);
    for (const actorId of item.actorIds) {
      const episodes = runtime.actorEngine.actorMemory[actorId]?.episodes || [];
      assert.equal(episodes.some(episode => episode.tags.includes('player:participated')), true);
    }
  }
});

test('emergent Qingyu event waits while Yunlong window reaches its declared offscreen result', async () => {
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const [qingyuCase, yunlongCase] = cases;
  const qingyuStage = JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${qingyuCase.file}`, import.meta.url), 'utf8'));
  let qingyu = fixture(qingyuStage, qingyuCase.eventId);
  for (let turn = 0; turn < 8; turn++) qingyu = advanceScenarioRuntime(qingyu).saveData;
  assert.equal(runtimeOf(qingyu).offscreenResolvedEventIds.includes(qingyuCase.eventId), false);
  assert.equal(runtimeOf(qingyu).completedEventIds.includes(qingyuCase.eventId), false);
  assert.equal(runtimeOf(qingyu).actorEngine.entitlements.length, 0);

  const yunlongStage = JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${yunlongCase.file}`, import.meta.url), 'utf8'));
  let yunlong = fixture(yunlongStage, yunlongCase.eventId);
  for (let turn = 0; turn < 7; turn++) yunlong = advanceScenarioRuntime(yunlong).saveData;
  const runtime = runtimeOf(yunlong);
  assert.equal(runtime.offscreenResolvedEventIds.includes(yunlongCase.eventId), true);
  assert.equal(runtime.completedEventIds.includes(yunlongCase.eventId), false);
  assert.equal(runtime.actorEngine.entitlements.length, 0);
  assert.equal(runtime.actorEngine.receipts.some(receipt => receipt.outcome === 'offscreen'), true);
  assert.equal(runtime.eventTimeline[yunlongCase.eventId].outcome, 'offscreen');
});

test('both cross-book world actors pass schema and do not expose future invariant outcomes', async () => {
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  for (const item of cases) {
    const stage = JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${item.file}`, import.meta.url), 'utf8'));
    assert.deepEqual(validateScenarioMod(stage).issues, []);
    const event = stage.scenario.events.find(candidate => candidate.id === item.eventId);
    const save = fixture(stage, item.eventId);
    runtimeOf(save).actorEngine = {
      anchorEventId: item.eventId,
      surfacedAgendaIds: [],
      receipts: [],
      entitlements: [],
      decisions: [],
      visibleDecisionIds: [],
    };
    const prompt = buildScenarioStoryPrompt(save);
    for (const forbidden of event.worldActor.decisionCore.canonPolicy.forbiddenBefore) {
      assert.match(prompt, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.match(prompt, /不得改写/);
  }
});
