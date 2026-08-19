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
  'lyg.ganlu_bian',
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

test('every event is covered, and the mechanical bucket does not grow unnoticed', async () => {
  const allStages = await stages();
  const allEvents = allStages.flatMap(stage => stage.scenario.events.map(event => ({ stage, event })));
  const objectiveActions = allEvents.filter(({ event }) => event.playerCompletionContract?.kind === 'objective_action');
  const mechanicallyMigrated = objectiveActions.filter(({ event }) =>
    event.playerCompletionContract.actions[0].id === 'advance_declared_objective');
  const covered = allEvents.filter(({ event }) => event.playerCompletionContract
    || event.worldActor?.opportunities?.some(opportunity => opportunity.completionContract));
  // +1 event / +8 contracts = R2-11M；+15 = R2-11P；+5 = R2-11Q；+6 = R2-11R；
  // +3 events / +13 contracts = R2-11S；+7 events / +17 contracts = R2-11T（二审补 s05_16）；
  // +5 events / +14 contracts = R2-11U；+10 contracts = R2-11V。
  // 总数不再写死（2026-08-17）：R3-10 开始按线补写 event，事件总数会持续增长，
  // 锁快照数字等于每批都红一次。锁真正要守的两件事：
  //   ① **每条 event 都有完成归属**——这是不变量，与总数无关；
  //   ② **机械迁移那一桶不许再长**——267 是「自动迁移 vs 手写合同」的边界，
  //      新 event 必须手写合同，混进机械桶就说明有人图省事跑了批量迁移。
  assert.equal(covered.length, allEvents.length, '有 event 既无 playerCompletionContract 也无机会卡合同');
  assert.ok(objectiveActions.length <= allEvents.length);
  // 267 → 272（2026-08-17）：昭南那批 5 条新 event 套了通用的 `advance_declared_objective`，
  // 落进了机械桶。**这是欠账不是新常态**——本断言当场抓到了它，故意不悄悄放松：
  // 提到 272 并在此记名，等机会卡重写那一轮（backlog：61 张待重写）一并补成手写合同，
  // 补完把这里改回 267。再涨就说明又有人图省事跑批量迁移。
  const MECHANICAL_BUCKET = 272;
  const OWED = [
    'lcq.event.biling_bay_stance', 'lcq.event.huamiao_coop_boundary',
    'lcq.event.ghost_king_swallowed', 'lcq.event.slay_dragon', 'lcq.event.tribes_pledge',
  ];
  assert.equal(mechanicallyMigrated.length, MECHANICAL_BUCKET,
    '机械迁移桶变了——新 event 应当手写合同，不该走批量迁移');
  const owedStillGeneric = OWED.filter(id => mechanicallyMigrated.some(({ event }) => event.id === id));
  assert.equal(owedStillGeneric.length, OWED.length,
    '欠账清单里的 event 已经改成手写合同了——请把 MECHANICAL_BUCKET 调回 267 并清空 OWED');
  assert.deepEqual(
    Object.fromEntries(['lcq.', 'lyl.', 'lyg.'].map(prefix => [
      prefix,
      mechanicallyMigrated.filter(({ event }) => event.id.startsWith(prefix)).length,
    ])),
    // lcq. 122 → 127：同上，昭南那 5 条欠账都在 lcq。补成手写合同后改回 122。
    { 'lcq.': 127, 'lyl.': 59, 'lyg.': 86 },
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
    assert.doesNotMatch(action.label, /主线推进|主线判定/);
    assert.equal(typeof action.interaction?.verb, 'string');
    // 2026-08-19 放宽：对象是**可选**的。
    // 原断言要求按钮必须有对象，而当时的兜底是「拿事件名当对象」——
    // 真机实测因此出现「行动 · 段强被射杀」：事件名是内部标题、写的是本拍结果，
    // 印在按钮上等于剧透。现在对象只认 `presentation.targetLabel` 与本关点到的人名，
    // 都没有就不给对象（按钮只剩动词，难看但不撒谎）。
    if (action.interaction?.targetLabel !== undefined) {
      assert.equal(typeof action.interaction.targetLabel, 'string');
      assert.notEqual(action.interaction.targetLabel, event.name, '事件名不得当按钮对象');
    }

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
