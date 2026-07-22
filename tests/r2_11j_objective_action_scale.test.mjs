import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const dataUrl = new URL('../src/modules/scenarioMods/builtins/data/', import.meta.url);
const isolatedStageIds = new Set([
  'lcq.stage_03',
  'lcq.stage_05',
  'lcq.stage_06',
  'lyg.ganlu_bian',
  'lyg.shixiang_ambush',
  'lyl.lin_an_black_sea',
  'lyl.luoyang_coup',
  'lyl.taiquan_expedition',
]);

/**
 * 已按交接档流程逐拍重建来源、并经人工裁定的隔离关。
 * 只有列入此集的关才允许带完成合同；其余隔离关必须保持零合同，直到来源重建完成。
 * 重建产物见 `docs/R2-11M-*`。列入此集不等于解除隔离——默认 Canon Rail 仍然跳过这些关。
 */
const sourceRebuiltStageIds = new Set([
  'lcq.stage_03',
  'lcq.stage_05',
  'lcq.stage_06',
  'lyl.lin_an_black_sea',
  'lyl.luoyang_coup',
  'lyl.taiquan_expedition',
  'lyg.shixiang_ambush',
]);

async function stages() {
  const files = (await readdir(dataUrl)).filter(file => file.endsWith('.json')).sort();
  return Promise.all(files.map(async file => JSON.parse(await readFile(new URL(file, dataUrl), 'utf8'))));
}

function setNested(root, path, value) {
  const keys = path.split('.');
  let cursor = root;
  for (const key of keys.slice(0, -1)) cursor = cursor[key] ||= {};
  cursor[keys.at(-1)] = value;
}

function fixture(stage, event) {
  const others = stage.scenario.events.filter(item => item.id !== event.id);
  const flags = structuredClone(stage.scenario.initialFlags);
  for (const item of others) {
    for (const completion of item.completion || []) {
      if (completion.operator === 'eq' && completion.value === true && completion.path.startsWith('flags.')) {
        setNested(flags, completion.path.slice('flags.'.length), true);
      }
    }
  }
  const chapter = stage.scenario.chapters.find(item => item.eventIds?.includes(event.id));
  return {
    角色: { 身份: { 名字: 'R2-11J批量验收' }, 位置: { 描述: '当前事件地点' }, 属性: { 声望: 0 } },
    社交: { 关系: {}, 记忆: { 短期记忆: [], 中期记忆: [], 长期记忆: [], 隐式中期记忆: [] } },
    系统: { 扩展: {}, 历史: { 叙事: [] } },
    世界: {
      信息: { 世界名称: stage.world.name, 地点信息: [], 势力信息: [] },
      状态: {
        剧本模组: {
          modId: stage.manifest.id,
          modName: stage.manifest.name,
          mode: 'strict',
          currentChapterId: chapter?.id,
          chapters: structuredClone(stage.scenario.chapters),
          events: structuredClone(stage.scenario.events),
          flags,
          activeEventIds: [event.id],
          completedEventIds: others.map(item => item.id),
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

function singleEventFixture(stage, event) {
  const save = fixture(stage, event);
  const runtime = runtimeOf(save);
  runtime.chapters = [{ id: 'test.chapter', title: '测试章节', summary: '', eventIds: [event.id] }];
  runtime.currentChapterId = 'test.chapter';
  runtime.events = [structuredClone(event)];
  runtime.completedEventIds = [];
  runtime.activeEventIds = [event.id];
  const completion = event.completion[0];
  runtime.flags[completion.path.slice('flags.'.length)] = false;
  setNested(runtime.flags, completion.path.slice('flags.'.length), false);
  return save;
}

test('objective-action migrations cover 379 events while preserving the 267-event mechanical boundary', async () => {
  const allStages = await stages();
  const allEvents = allStages.flatMap(stage => stage.scenario.events.map(event => ({ stage, event })));
  const objectiveActions = allEvents.filter(({ event }) => event.playerCompletionContract?.kind === 'objective_action');
  const mechanicallyMigrated = objectiveActions.filter(({ event }) =>
    event.playerCompletionContract.actions[0].id === 'advance_declared_objective');
  const covered = allEvents.filter(({ event }) => event.playerCompletionContract
    || event.worldActor?.opportunities?.some(opportunity => opportunity.completionContract));
  // +1 event / +8 contracts = R2-11M；+15 = R2-11P；+5 = R2-11Q；+6 = R2-11R；
  // +3 events / +13 contracts = R2-11S；+7 events / +17 contracts = R2-11T（二审补 s05_16）；
  // +5 events / +14 contracts = R2-11U。
  assert.equal(allEvents.length, 396);
  assert.equal(objectiveActions.length, 379);
  assert.equal(mechanicallyMigrated.length, 267);
  assert.equal(covered.length, 386);
  assert.deepEqual(
    Object.fromEntries(['lcq.', 'lyl.', 'lyg.'].map(prefix => [
      prefix,
      mechanicallyMigrated.filter(({ event }) => event.id.startsWith(prefix)).length,
    ])),
    { 'lcq.': 122, 'lyl.': 59, 'lyg.': 86 },
  );
  // 隔离关只挡机械迁移：批量脚本不得把旧自由稿目标自动合法化（裁定 #61/#62）。
  // 逐拍重建过来源的隔离关（R2-11M 起）可以有人工撰写的合同，但永远不能是 advance_declared_objective。
  assert.equal(mechanicallyMigrated.some(({ stage }) => isolatedStageIds.has(stage.manifest.id)), false);
  const contractedIsolatedStageIds = new Set(covered
    .map(({ stage }) => stage.manifest.id)
    .filter(stageId => isolatedStageIds.has(stageId)));
  assert.deepEqual([...contractedIsolatedStageIds].sort(), [...sourceRebuiltStageIds].sort());
  assert.equal(mechanicallyMigrated.some(({ event }) => event.completionEvidence?.length), false);
  assert.equal(mechanicallyMigrated.every(({ event }) => event.playerCompletionContract.actions[0].label === event.objective), true);
});

test('one migrated objective action per book completes only through the engine and replays byte-identically', async () => {
  const allStages = await stages();
  const {
    advanceScenarioRuntime,
    getCurrentStoryEventActions,
    recordStoryEventStructuredAction,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { guardScenarioModCommands } = await loadTs('../src/modules/scenarioMods/canonGuard.ts');

  for (const prefix of ['lcq.', 'lyl.', 'lyg.']) {
    const stage = allStages.find(candidate => candidate.scenario.events.some(event =>
      event.id.startsWith(prefix) && event.playerCompletionContract?.kind === 'objective_action'));
    const event = stage.scenario.events.find(item =>
      item.id.startsWith(prefix) && item.playerCompletionContract?.kind === 'objective_action');
    let save = advanceScenarioRuntime(singleEventFixture(stage, event)).saveData;
    const action = getCurrentStoryEventActions(save)[0];
    assert.equal(action.actionId, 'advance_declared_objective');
    assert.equal(action.expectedOutcome, 'success');
    assert.match(action.label, /^【主线推进】/);

    const completionPath = event.completion[0].path;
    const guarded = guardScenarioModCommands(save, [{
      action: 'set',
      key: `世界.状态.剧本模组.${completionPath}`,
      value: true,
    }]);
    assert.deepEqual(guarded.accepted, []);
    assert.match(guarded.rejected[0].reason, /确定性合同/);

    const result = recordStoryEventStructuredAction(save, action);
    assert.deepEqual(
      { attempted: result.attempted, completed: result.completed, outcome: result.outcome },
      { attempted: true, completed: true, outcome: 'success' },
    );
    const left = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
    const right = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
    assert.equal(JSON.stringify(right), JSON.stringify(left));
    save = left;
    assert.equal(runtimeOf(save).completedEventIds.includes(event.id), true);
    assert.equal(runtimeOf(save).offscreenResolvedEventIds.includes(event.id), false);
  }
});

test('three curated highlights require all declared steps across JSON reloads', async () => {
  const allStages = await stages();
  const {
    advanceScenarioRuntime,
    getCurrentStoryEventActions,
    recordStoryEventStructuredAction,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  for (const eventId of ['lcq.event.s02_02', 'lcq.event.s04_05', 'lyg.event.highlight_banchao_lamb_leg']) {
    const stage = allStages.find(candidate => candidate.scenario.events.some(event => event.id === eventId));
    const event = stage.scenario.events.find(item => item.id === eventId);
    assert.equal(event.playerCompletionContract.actions.length, 3);
    let save = advanceScenarioRuntime(singleEventFixture(stage, event)).saveData;
    for (let step = 0; step < 3; step++) {
      const actions = getCurrentStoryEventActions(save);
      assert.equal(actions.length, 1, JSON.stringify({
        eventId,
        step,
        activeEventIds: runtimeOf(save).activeEventIds,
        completedEventIds: runtimeOf(save).completedEventIds,
        state: runtimeOf(save).eventActionStates?.[eventId],
      }));
      assert.equal(actions[0].actionId, event.playerCompletionContract.actions[step].id, `${eventId} step ${step + 1}`);
      const result = recordStoryEventStructuredAction(save, actions[0]);
      assert.equal(result.outcome, 'success');
      assert.equal(result.completed, step === 2);
      save = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
    }
    const runtime = runtimeOf(save);
    assert.equal(runtime.completedEventIds.includes(eventId), true);
    assert.equal(runtime.eventActionStates[eventId].attemptCount, 3);
    assert.deepEqual(runtime.eventActionStates[eventId].preparations, ['sequence_step_1', 'sequence_step_2']);
  }
});
