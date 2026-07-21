import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stageUrl = new URL(
  '../src/modules/scenarioMods/builtins/data/lyg.dingtao_beijing.json',
  import.meta.url,
);
const EVENT_ID = 'lyg.event.s01_05';
const OPPORTUNITY_ID = 'opportunity.lyg.s01_05.first_edict';

function fixture(stage) {
  return {
    角色: { 身份: { 名字: 'R2-11测试角色' }, 位置: { 描述: '昭阳宫外' }, 属性: { 声望: 0 } },
    社交: { 关系: {}, 记忆: { 短期记忆: [], 中期记忆: [], 长期记忆: [], 隐式中期记忆: [] } },
    系统: { 扩展: {}, 历史: { 叙事: [] } },
    世界: {
      信息: { 世界名称: stage.world.name, 地点信息: [], 势力信息: [] },
      状态: {
        剧本模组: {
          modId: stage.manifest.id,
          modName: stage.manifest.name,
          mode: 'strict',
          currentChapterId: 'lyg.chapter.s01',
          chapters: structuredClone(stage.scenario.chapters),
          events: structuredClone(stage.scenario.events),
          flags: { ...stage.scenario.initialFlags },
          activeEventIds: [EVENT_ID],
          completedEventIds: [
            'lyg.event.s01_01',
            'lyg.event.s01_02',
            'lyg.event.s01_03',
            'lyg.event.s01_04',
          ],
          completedChapterIds: [],
          offscreenResolvedEventIds: [],
          chronicle: [],
          stallTurns: 0,
          worldTurn: 0,
          canon: structuredClone(stage.canon),
        },
      },
    },
  };
}

function runtimeOf(save) {
  return save.世界.状态.剧本模组;
}

test('R2-11 option 1 settles s01_05 from player actions only, one step per resolved turn', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const {
    advanceScenarioRuntime,
    recordStoryOpportunityPlayerAction,
    trackStoryOpportunity,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');

  let save = advanceScenarioRuntime(fixture(stage)).saveData;
  assert.equal(trackStoryOpportunity(save, OPPORTUNITY_ID).ok, true);
  const prompt = buildScenarioStoryPrompt(save);
  assert.match(prompt, /本地引擎进度=0\/3/);
  assert.match(prompt, /严禁输出或建议写入本事件 done/);

  const fullCardText = '我前往昭阳宫，在安民、选材、定都中明确优先保下一项，并承担站队后果。';
  assert.deepEqual(
    recordStoryOpportunityPlayerAction(save, fullCardText),
    {
      progressed: true,
      completed: false,
      opportunityId: OPPORTUNITY_ID,
      stepId: 'enter_zhaoyang_hall',
    },
    'one all-matching sentence must not skip the remaining sequence',
  );
  assert.equal(
    recordStoryOpportunityPlayerAction(save, '我改选安民。').progressed,
    false,
    'a second call in the same world turn must not advance another step',
  );
  save = advanceScenarioRuntime(save).saveData;
  assert.equal(runtimeOf(save).flags['event.s01_05.done'], false);

  assert.equal(recordStoryOpportunityPlayerAction(save, '我拒绝选择，三项都不选。').progressed, false);
  save = advanceScenarioRuntime(save).saveData;
  assert.equal(recordStoryOpportunityPlayerAction(save, '我明确优先选择安民。').stepId, 'choose_edict_priority');
  save = advanceScenarioRuntime(save).saveData;

  // JSON 往返证明进度属于存档状态，不依赖当前进程或 LLM 上下文。
  save = JSON.parse(JSON.stringify(save));
  const final = recordStoryOpportunityPlayerAction(save, '我公开支持安民并承担站队后果。');
  assert.equal(final.completed, true);
  save = advanceScenarioRuntime(save).saveData;

  const runtime = runtimeOf(save);
  assert.equal(runtime.flags['event.s01_05.done'], true);
  assert.equal(runtime.completedEventIds.includes(EVENT_ID), true);
  assert.equal(runtime.offscreenResolvedEventIds.includes(EVENT_ID), false);
  assert.equal(runtime.actorEngine.receipts.some(item =>
    item.opportunityId === OPPORTUNITY_ID && item.outcome === 'participated'
  ), true);
  assert.equal(runtime.actorEngine.entitlements.some(item =>
    item.key === 'permission.lyg.jia_wenhe.exchange_judgement'
  ), true);
});

test('R2-11 protects migrated event done from LLM commands while leaving other events on the legacy path', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { guardScenarioModCommands } = await loadTs('../src/modules/scenarioMods/canonGuard.ts');
  const save = advanceScenarioRuntime(fixture(stage)).saveData;

  const migrated = {
    action: 'set',
    key: '世界.状态.剧本模组.flags.event.s01_05.done',
    value: true,
  };
  const result = guardScenarioModCommands(save, [migrated]);
  assert.deepEqual(result.accepted, []);
  assert.match(result.rejected[0].reason, /本地引擎独占写入/);

  const { buildChainCandidates } = await loadTs('../src/services/eventReconcileService.ts');
  assert.deepEqual(
    buildChainCandidates(runtimeOf(save)),
    [],
    'legacy LLM reconciliation must stop at, rather than skip over, an engine-owned event',
  );
});

test('R2-11 action matching rejects explicit refusal and negative safety claims', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const {
    advanceScenarioRuntime,
    recordStoryOpportunityPlayerAction,
    trackStoryOpportunity,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');

  const edict = advanceScenarioRuntime(fixture(stage)).saveData;
  assert.equal(trackStoryOpportunity(edict, OPPORTUNITY_ID).ok, true);
  assert.equal(recordStoryOpportunityPlayerAction(edict, '我不去昭阳宫，也不再介入。').progressed, false);

  const court = advanceScenarioRuntime(fixture(stage)).saveData;
  const courtId = 'opportunity.lyg.s01_05.court_entry';
  assert.equal(trackStoryOpportunity(court, courtId).ok, true);
  assert.equal(
    recordStoryOpportunityPlayerAction(court, '我告诉霍子孟：定陶王并不安全，我不能证明。').progressed,
    false,
  );
});

test('R2-11 structured engine actions survive model changes and reject stale selections', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const {
    advanceScenarioRuntime,
    getTrackedStoryOpportunityActions,
    recordStoryOpportunityStructuredAction,
    trackStoryOpportunity,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  let save = advanceScenarioRuntime(fixture(stage)).saveData;
  assert.equal(trackStoryOpportunity(save, OPPORTUNITY_ID).ok, true);

  const first = getTrackedStoryOpportunityActions(save);
  assert.equal(first.length, 1);
  assert.equal(first[0].source, 'opportunity_engine');
  assert.equal(first[0].stepId, 'enter_zhaoyang_hall');
  assert.equal(first[0].timeCost, 1);
  assert.equal(recordStoryOpportunityStructuredAction(save, first[0]).progressed, true);
  assert.equal(recordStoryOpportunityStructuredAction(save, first[0]).reason, 'already_progressed');

  save = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
  const priorities = getTrackedStoryOpportunityActions(save);
  assert.deepEqual(priorities.map(item => item.actionId), [
    'prioritize_relief',
    'prioritize_talent',
    'prioritize_capital',
  ]);
  assert.equal(
    recordStoryOpportunityStructuredAction(save, first[0]).reason,
    'stale_step',
    'an old button cannot advance a newer step',
  );
  assert.equal(recordStoryOpportunityStructuredAction(save, priorities[1]).progressed, true);
  assert.equal(
    runtimeOf(save).actorEngine.opportunityStates[OPPORTUNITY_ID]
      .completionChoices.choose_edict_priority,
    'prioritize_talent',
    'the concrete policy choice must be replayable state, not prose only',
  );
});

test('R2-11 validator rejects ambiguous or non-settleable opportunity completion contracts', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const eventOf = value => value.scenario.events.find(item => item.id === EVENT_ID);
  const opportunityOf = value => eventOf(value).worldActor.opportunities[0];

  const emptyMatcher = structuredClone(stage);
  opportunityOf(emptyMatcher).completionContract.steps[0].matchAny = [];
  delete opportunityOf(emptyMatcher).completionContract.steps[0].matchAll;
  assert.equal(
    validateScenarioMod(emptyMatcher).issues.some(item => item.code === 'empty_matcher'),
    true,
  );

  const unsupportedCompletion = structuredClone(stage);
  eventOf(unsupportedCompletion).completion.push({
    path: 'flags.event.s01_05.extra',
    operator: 'eq',
    value: true,
  });
  assert.equal(
    validateScenarioMod(unsupportedCompletion).issues.some(item => item.code === 'unsupported_completion'),
    true,
  );

  const badTimeCost = structuredClone(stage);
  opportunityOf(badTimeCost).completionContract.steps[0].actions[0].timeCost = 2;
  assert.equal(
    validateScenarioMod(badTimeCost).issues.some(item => item.code === 'invalid_value'),
    true,
  );
});
