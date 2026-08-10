import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stageUrl = new URL('../src/modules/scenarioMods/builtins/data/lyg.mijing_rumen.json', import.meta.url);
const RUMOR_EVENT_ID = 'lyg.event.yangwuhou_rumor';
const PAYOFF_EVENT_ID = 'lyg.event.s02_09';

async function initializedStage() {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const {
    applyStrictScenarioInitializationToSave,
    buildStrictScenarioInitialization,
  } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const initialization = buildStrictScenarioInitialization(parseScenarioMod(stage), '2026-08-10T00:00:00.000Z');
  return applyStrictScenarioInitializationToSave({
    角色: { 身份: { 名字: '程宗扬' }, 位置: { 描述: '洛都街巷' }, 属性: { 声望: 0 } },
    社交: { 关系: {}, 记忆: { 短期记忆: [], 中期记忆: [], 长期记忆: [], 隐式中期记忆: [] } },
    系统: { 扩展: {}, 历史: { 叙事: [] } },
    世界: { 信息: {}, 状态: {} },
  }, initialization);
}

test('G1A exposes only the explicit non-critical exploration event beside the main anchor', async () => {
  const {
    advanceScenarioRuntime,
    getCurrentStoryEventActions,
    getCurrentStoryExplorationActions,
    getNarrativeAnchorEvent,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  let save = await initializedStage();
  save = advanceScenarioRuntime(save).saveData;
  const runtime = save.世界.状态.剧本模组;

  assert.notEqual(getNarrativeAnchorEvent(runtime)?.id, RUMOR_EVENT_ID);
  assert.equal(getCurrentStoryEventActions(save).length, 1);
  assert.deepEqual(
    getCurrentStoryExplorationActions(save).map(action => [action.source, action.eventId, action.actionId]),
    [
      ['exploration_engine', RUMOR_EVENT_ID, 'trace_rumor_privately'],
      ['exploration_engine', RUMOR_EVENT_ID, 'listen_to_street_rumor'],
    ],
  );
});

test('validator rejects dangling or colliding path receipts', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const actions = stage.scenario.events.find(event => event.id === RUMOR_EVENT_ID).playerCompletionContract.actions;
  actions[0].outcomeEffects.success.pathReceipts[0].consumeAtEventIds = [];
  actions[1].outcomeEffects.success.pathReceipts[0].receiptId = actions[0].outcomeEffects.success.pathReceipts[0].receiptId;
  actions[1].outcomeEffects.success.pathReceipts[0].mutexGroupId = 'shared.mutex';
  actions[1].outcomeEffects.success.pathReceipts[0].dimension = 'identity';
  const result = validateScenarioMod(stage);
  assert.equal(result.valid, false);
  assert.equal(result.issues.some(issue => issue.code === 'required_array'), true);
  assert.equal(result.issues.some(issue => issue.code === 'duplicate_id'), true);
  assert.equal(result.issues.some(issue => issue.code === 'invalid_owner'), true);
  assert.equal(result.issues.some(issue => issue.code === 'invalid_enum'), true);
});

test('private tracing writes confirmed knowledge and one path receipt without completing the main anchor', async () => {
  const {
    advanceScenarioRuntime,
    getCurrentStoryExplorationActions,
    getNarrativeAnchorEvent,
    recordStoryEventStructuredAction,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  let save = advanceScenarioRuntime(await initializedStage()).saveData;
  const anchorBefore = getNarrativeAnchorEvent(save.世界.状态.剧本模组)?.id;
  const action = getCurrentStoryExplorationActions(save).find(item => item.actionId === 'trace_rumor_privately');
  assert.ok(action);
  assert.deepEqual(recordStoryEventStructuredAction(save, action), {
    attempted: true,
    completed: true,
    eventId: RUMOR_EVENT_ID,
    actionId: 'trace_rumor_privately',
    outcome: 'success',
  });
  let runtime = save.世界.状态.剧本模组;
  assert.equal(runtime.playerKnowledge[`${RUMOR_EVENT_ID}.knowledge.private_origin`].status, 'confirmed');
  assert.equal(runtime.pathReceipts[`${RUMOR_EVENT_ID}.path.private_trace`].choiceId, 'trace_rumor_privately');
  assert.equal(getCurrentStoryExplorationActions(save).length, 0, 'the mutually exclusive event closes after one route');
  assert.deepEqual(recordStoryEventStructuredAction(save, action), {
    attempted: false,
    completed: true,
    eventId: RUMOR_EVENT_ID,
    reason: 'already_completed',
  });
  assert.equal(Object.keys(runtime.playerKnowledge).filter(id => id.startsWith(`${RUMOR_EVENT_ID}.knowledge.`)).length, 1,
    'replay must not duplicate exploration knowledge');
  assert.equal(Object.keys(runtime.pathReceipts).length, 1, 'replay must not duplicate path receipts');

  save = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
  runtime = save.世界.状态.剧本模组;
  assert.equal(runtime.completedEventIds.includes(RUMOR_EVENT_ID), true);
  assert.equal(getNarrativeAnchorEvent(runtime)?.id, anchorBefore);
  assert.equal(runtime.lastSettledBeat, undefined, 'an optional exploration must not create a mainline handoff');
});

test('street listening stays rumor-only and its receipt is consumed as narrative context at s02_09', async () => {
  const {
    advanceScenarioRuntime,
    getCurrentStoryExplorationActions,
    recordStoryEventStructuredAction,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  let save = advanceScenarioRuntime(await initializedStage()).saveData;
  const action = getCurrentStoryExplorationActions(save).find(item => item.actionId === 'listen_to_street_rumor');
  assert.ok(action);
  assert.equal(recordStoryEventStructuredAction(save, action).completed, true);
  save = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
  const runtime = save.世界.状态.剧本模组;
  const fact = runtime.playerKnowledge[`${RUMOR_EVENT_ID}.knowledge.public_spread`];
  assert.equal(fact.status, 'rumor');
  assert.doesNotMatch(fact.claim, /出自王蕙手笔/);

  const railIds = runtime.events.filter(event => event.critical !== false).map(event => event.id);
  const predecessors = railIds.filter(id => id !== PAYOFF_EVENT_ID);
  runtime.completedEventIds = [...new Set([...runtime.completedEventIds, ...predecessors])];
  runtime.activeEventIds = [PAYOFF_EVENT_ID];
  const prompt = buildScenarioStoryPrompt(save);
  assert.match(prompt, /洛都街巷正在把《阳武侯小史》附会成“皇叔”血统故事/);
  assert.match(prompt, /未核实传闻/);
  assert.match(prompt, /路径回执·本节点消费/);
  assert.match(prompt, /街巷听风/);
  assert.match(prompt, /不改变“.*”发生与否/);
});

test('ignoring exploration leaves no epistemic state', async () => {
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = advanceScenarioRuntime(await initializedStage()).saveData;
  const runtime = save.世界.状态.剧本模组;
  assert.deepEqual(runtime.pathReceipts, {});
  assert.equal(Object.keys(runtime.playerKnowledge || {}).some(id => id.includes('yangwuhou_rumor')), false);

  const { validateCommand } = await loadTs('../src/utils/commandValidator.ts');
  const blocked = validateCommand({
    action: 'set',
    key: '世界.状态.剧本模组.pathReceipts.path.fake',
    value: { label: '模型伪造路径' },
  }, 0);
  assert.equal(blocked.valid, false, 'path receipts are engine-owned state');
});
