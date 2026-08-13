import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stageUrl = new URL('../mod-kit/generated/deepseek-v4-flash/yange/stages/lyg.dingtao_beijing.json', import.meta.url);

async function loadStage() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  return parseScenarioMod(JSON.parse(await readFile(stageUrl, 'utf8')));
}

async function loadRawStage() {
  return JSON.parse(await readFile(stageUrl, 'utf8'));
}

function baseSave() {
  return {
    角色: {
      身份: {
        先天六司: { 根骨: 8, 灵性: 7, 气运: 6, 悟性: 7, 心性: 6, 魅力: 5 },
        后天六司: {},
      },
      属性: { 气血: { 当前: 100, 上限: 100 }, 神识: { 当前: 100, 上限: 100 } },
      位置: { 描述: '汉国·长秋宫外', 灵气浓度: 50, x: 0, y: 0 },
    },
    社交: { 关系: {} },
    世界: { 信息: {}, 状态: {} },
    系统: { 扩展: {} },
  };
}

async function buildSave(storyMode) {
  const mod = await loadStage();
  const { applyStrictScenarioInitializationToSave, buildStrictScenarioInitialization } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const initialization = buildStrictScenarioInitialization(
    mod,
    '2026-08-13T00:00:00.000Z',
    storyMode ? { storyMode } : undefined,
  );
  return applyStrictScenarioInitializationToSave(baseSave(), initialization);
}

function establishSuccession(save) {
  const runtime = save.世界.状态.剧本模组;
  runtime.flags['world.r2_9.lyg_event_s01_05.offscreen_resolved'] = true;
  runtime.offscreenResolvedEventIds = ['lyg.event.s01_05'];
  return runtime;
}

test('world mode is opt-in at new-save initialization and old/default saves remain canon_companion', async () => {
  const companion = await buildSave();
  const world = await buildSave('world_sim');
  assert.equal(companion.世界.状态.剧本模组.storyMode, undefined);
  assert.equal(companion.世界.状态.剧本模组.worldSimulation, undefined);
  assert.equal(world.世界.状态.剧本模组.storyMode, 'world_sim');
  assert.equal(world.世界.状态.剧本模组.worldSimulation.version, 1);
  assert.deepEqual(world.世界.状态.剧本模组.worldSimulationState, { actionReceipts: [] });
});

test('creation resolver forwards the explicit world mode but keeps the default byte-compatible path', async () => {
  const mod = await loadStage();
  const { resolveInitialWorldInfo } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const companion = await resolveInitialWorldInfo(mod, async () => { throw new Error('strict mod must not call AI world generation'); });
  const world = await resolveInitialWorldInfo(
    mod,
    async () => { throw new Error('strict mod must not call AI world generation'); },
    { storyMode: 'world_sim' },
  );
  assert.equal(companion.strictInitialization.runtimeState.storyMode, undefined);
  assert.equal(world.strictInitialization.runtimeState.storyMode, 'world_sim');
  assert.equal(world.strictInitialization.runtimeState.worldSimulation.version, 1);
});

test('isolated demo runner exercises the production default and two-phase IF paths without persistence', async () => {
  const { reactive } = await import('vue');
  const mod = await loadStage();
  const {
    WORLD_SIMULATION_DEMO_SITUATIONS,
    confirmWorldSimulationDemoCandidate,
    createWorldSimulationDemoSave,
    prepareWorldSimulationDemoCandidate,
    runDefaultWorldSimulationDemo,
  } = await loadTs('../src/modules/scenarioMods/worldSimulationDemo.ts');

  const defaults = runDefaultWorldSimulationDemo(mod);
  const defaultRuntime = defaults.saveData.世界.状态.剧本模组;
  assert.ok(defaults.steps > 0 && defaults.steps <= 48);
  assert.deepEqual(defaultRuntime.offscreenResolvedEventIds.slice(-3), [
    'lyg.event.s01_05', 'lyg.event.s01_06', 'lyg.event.s01_07',
  ]);
  assert.equal(defaultRuntime.flags['event.s01_05.done'], false);
  assert.equal(defaultRuntime.flags['event.s01_06.done'], false);
  assert.equal(defaultRuntime.flags['event.s01_07.done'], false);
  assert.equal(defaults.saveData.系统.扩展.开发验收.persistence, 'memory-only');

  const candidate = prepareWorldSimulationDemoCandidate(
    createWorldSimulationDemoSave(mod),
    WORLD_SIMULATION_DEMO_SITUATIONS.guoJie,
    '我立即牵制剑玉姬并救下郭解',
  ).saveData;
  assert.equal(candidate.世界.状态.剧本模组.flags['branch.lyg.if_guojie_longrest.active'], undefined);
  assert.equal(candidate.世界.状态.剧本模组.worldSimulationState.pendingDivergence.branchId, 'lyg.if_guojie_longrest');
  const confirmed = confirmWorldSimulationDemoCandidate(reactive(candidate));
  assert.equal(confirmed.世界.状态.剧本模组.flags['branch.lyg.if_guojie_longrest.active'], true);
  assert.ok(confirmed.世界.状态.剧本模组.offscreenResolvedEventIds.includes('lyg.event.s01_06'));

  const dongCandidate = prepareWorldSimulationDemoCandidate(
    createWorldSimulationDemoSave(mod),
    WORLD_SIMULATION_DEMO_SITUATIONS.dongZhuo,
    '我用疗伤手段稳住董卓并救治董卓',
  ).saveData;
  const dongConfirmed = confirmWorldSimulationDemoCandidate(dongCandidate);
  assert.equal(dongConfirmed.世界.状态.剧本模组.flags['branch.lyg.if_dongzhuo_longrest.active'], true);
  assert.equal(dongConfirmed.世界.状态.剧本模组.flags['character.dong_zhuo.status'], 'longrest');
});

test('player playtest save is a persistent isolated profile with a normal opening and exportable feedback', async () => {
  const mod = await loadStage();
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const {
    createWorldSimulationPlaytestSave,
    formatWorldSimulationPlaytestFeedback,
    isWorldSimulationPlaytestSave,
    WORLD_SIMULATION_PLAYTEST_KIND,
  } = await loadTs('../src/modules/scenarioMods/worldSimulationPlaytest.ts');
  let save = createWorldSimulationPlaytestSave(mod, '2026-08-13T00:00:00.000Z');
  assert.equal(isWorldSimulationPlaytestSave(save), true);
  assert.equal(save.系统.扩展.六朝世界试玩.kind, WORLD_SIMULATION_PLAYTEST_KIND);
  assert.equal(save.系统.扩展.六朝世界试玩.persistence, 'isolated-local');
  assert.equal(save.系统.扩展.开发验收, undefined);
  assert.match(save.系统.历史.叙事[0].content, /用自己的话|世界会在每次重要行动后继续运转/);
  assert.equal(save.角色.身份.名字, '程宗扬');

  for (let turn = 0; turn < 48; turn += 1) save = advanceScenarioRuntime(save).saveData;
  save.系统.扩展.六朝世界试玩.feedback = { freedom: 4, canonFeel: 5, coherence: 4, notes: '测试反馈' };
  const report = formatWorldSimulationPlaytestFeedback(save);
  assert.match(report, /世界回合：/);
  assert.match(report, /自由感（1-5）：4/);
  assert.match(report, /补充：测试反馈/);
});

test('world focus follows settled world outcomes instead of player done flags', async () => {
  const { getScenarioFocusEvent, getNarrativeAnchorEvent } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = await buildSave('world_sim');
  const runtime = save.世界.状态.剧本模组;
  assert.equal(getScenarioFocusEvent(runtime).id, 'lyg.event.s01_05');
  assert.equal(runtime.flags['event.s01_05.done'], false);

  establishSuccession(save);
  assert.equal(getScenarioFocusEvent(runtime).id, 'lyg.event.s01_06');
  assert.equal(getNarrativeAnchorEvent(runtime), null, 'focus is readable even before the next Canon Rail activation pass');

  runtime.flags['world.r2_10.lyg_event_s01_06.occurred'] = true;
  runtime.offscreenResolvedEventIds.push('lyg.event.s01_06');
  assert.equal(getScenarioFocusEvent(runtime).id, 'lyg.event.s01_07');
  assert.equal(runtime.flags['event.s01_06.done'], false, 'world progression must not forge player participation');
});

test('route A: zero-LLM non-intervention lets all three world situations settle offscreen without player completion', async () => {
  const { advanceScenarioRuntime, getScenarioFocusEvent } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  let save = await buildSave('world_sim');
  for (let turn = 0; turn < 28; turn += 1) save = advanceScenarioRuntime(save).saveData;
  const runtime = save.世界.状态.剧本模组;
  assert.equal(runtime.flags['world.r2_9.lyg_event_s01_05.offscreen_resolved'], true);
  assert.equal(runtime.flags['world.r2_10.lyg_event_s01_06.occurred'], true);
  assert.equal(runtime.flags['world.r2_10.lyg_event_s01_07.occurred'], true);
  assert.ok(runtime.offscreenResolvedEventIds.includes('lyg.event.s01_05'));
  assert.ok(runtime.offscreenResolvedEventIds.includes('lyg.event.s01_06'));
  assert.ok(runtime.offscreenResolvedEventIds.includes('lyg.event.s01_07'));
  assert.equal(runtime.flags['event.s01_05.done'], false);
  assert.equal(runtime.flags['event.s01_06.done'], false);
  assert.equal(runtime.flags['event.s01_07.done'], false);
  assert.equal(runtime.flags['branch.lyg.if_guojie_longrest.active'], undefined);
  assert.equal(runtime.flags['branch.lyg.if_dongzhuo_longrest.active'], undefined);
  assert.equal(getScenarioFocusEvent(runtime), null, 'an exhausted world contract must not reactivate the next Canon Rail event');
  assert.notEqual(runtime.actorEngine?.anchorEventId, 'lyg.event.s01_08');
});

test('only a locally signed successful rescue judgement can create and confirm Guo Jie IF', async () => {
  const { buildLocalJudgementPreflight } = await loadTs('../src/utils/judgementPreflight.ts');
  const { persistPendingJudgement, resolvePendingJudgement } = await loadTs('../src/utils/judgementEngine.ts');
  const {
    confirmWorldSimulationDivergence,
    settleWorldSimulationJudgement,
  } = await loadTs('../src/modules/scenarioMods/worldSimulation.ts');
  const save = await buildSave('world_sim');
  const runtime = establishSuccession(save);

  const proposal = buildLocalJudgementPreflight('我立即牵制剑玉姬并救下郭解', save, 4);
  assert.equal(proposal.canonPolicy, 'route_process_only');
  assert.equal(proposal.authorityReceipt.kind, 'world_sim_intervention');
  assert.equal(proposal.authorityReceipt.outcomeId, 'outcome.lyg.guo_jie');
  persistPendingJudgement(save, proposal);
  const resolution = resolvePendingJudgement(save, proposal.id, { currentTurn: 4, testOutcome: 'great_success' });
  assert.deepEqual(settleWorldSimulationJudgement(save, resolution), { pending: true, expired: false });
  assert.equal(runtime.flags['branch.lyg.if_guojie_longrest.active'], undefined, 'success alone is not confirmation');

  assert.deepEqual(confirmWorldSimulationDivergence(save), { ok: true });
  assert.equal(runtime.flags['branch.lyg.if_guojie_longrest.active'], true);
  assert.equal(runtime.flags['character.guo_jie.status'], 'longrest');
  assert.equal(runtime.divergences.at(-1).branchId, 'lyg.if_guojie_longrest');
  assert.equal(confirmWorldSimulationDivergence(save).ok, false, 'a consumed pending record cannot be applied twice');
});

test('a confirmed survival IF permanently closes the replaced deadline instead of later writing the old death', async () => {
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { buildLocalJudgementPreflight } = await loadTs('../src/utils/judgementPreflight.ts');
  const { persistPendingJudgement, resolvePendingJudgement } = await loadTs('../src/utils/judgementEngine.ts');
  const { confirmWorldSimulationDivergence, settleWorldSimulationJudgement } = await loadTs('../src/modules/scenarioMods/worldSimulation.ts');
  let save = await buildSave('world_sim');
  let safety = 0;
  while (!save.世界.状态.剧本模组.activeEventIds.includes('lyg.event.s01_06') && safety < 20) {
    save = advanceScenarioRuntime(save).saveData;
    safety += 1;
  }
  assert.ok(save.世界.状态.剧本模组.activeEventIds.includes('lyg.event.s01_06'), 'test must exercise the real active Rail deadline path');
  const proposal = buildLocalJudgementPreflight('我立即牵制剑玉姬并救下郭解', save, 4);
  persistPendingJudgement(save, proposal);
  const resolution = resolvePendingJudgement(save, proposal.id, { currentTurn: 4, testOutcome: 'great_success' });
  settleWorldSimulationJudgement(save, resolution);
  assert.equal(confirmWorldSimulationDivergence(save).ok, true);
  assert.ok(save.世界.状态.剧本模组.offscreenResolvedEventIds.includes('lyg.event.s01_06'));
  for (let turn = 0; turn < 12; turn += 1) save = advanceScenarioRuntime(save).saveData;
  const runtime = save.世界.状态.剧本模组;
  assert.equal(runtime.flags['world.r2_10.lyg_event_s01_06.occurred'], undefined);
  assert.equal(runtime.flags['character.guo_jie.status'], 'longrest');
  assert.equal(runtime.divergences.filter(item => item.eventId === 'lyg.event.s01_06').length, 1);
  assert.equal(runtime.divergences.find(item => item.eventId === 'lyg.event.s01_06').branchId, 'lyg.if_guojie_longrest');
});

test('world mode never falls through to the legacy Canon Rail explicit-IF judgement path', async () => {
  const { buildLocalJudgementPreflight } = await loadTs('../src/utils/judgementPreflight.ts');
  const save = await buildSave('world_sim');
  establishSuccession(save);
  const proposal = buildLocalJudgementPreflight('我要救下定陶王不死', save, 4);
  assert.equal(proposal, null);
});

test('world mode never exposes source-event completion actions or stale Rail judgement metadata', async () => {
  const {
    getCurrentStoryEventActions,
    getCurrentStoryExplorationActions,
    recordStoryEventStructuredAction,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { buildLocalJudgementPreflight } = await loadTs('../src/utils/judgementPreflight.ts');
  const save = await buildSave('world_sim');
  const runtime = establishSuccession(save);
  const sourceContract = runtime.events.find(event => event.playerCompletionContract)?.playerCompletionContract;
  assert.ok(sourceContract);
  runtime.events.find(event => event.id === 'lyg.event.s01_06').playerCompletionContract = structuredClone(sourceContract);

  const fakeExploration = structuredClone(runtime.events.find(event => event.id === 'lyg.event.s01_06'));
  fakeExploration.id = 'lyg.event.fake_exploration';
  fakeExploration.critical = false;
  fakeExploration.exploration = {};
  runtime.events.push(fakeExploration);
  runtime.activeEventIds.push(fakeExploration.id);
  runtime.chapters.find(chapter => chapter.id === runtime.currentChapterId).eventIds.push(fakeExploration.id);

  assert.deepEqual(getCurrentStoryEventActions(save), []);
  assert.deepEqual(getCurrentStoryExplorationActions(save), []);
  assert.deepEqual(recordStoryEventStructuredAction(save, {
    source: 'exploration_engine',
    eventId: fakeExploration.id,
  }), { attempted: false, completed: false, reason: 'world_sim' });
  const genericRisk = buildLocalJudgementPreflight('我潜入守卫森严的府邸', save, 4);
  assert.ok(genericRisk);
  assert.equal(genericRisk.canonPolicy, 'free');
  assert.equal(genericRisk.sourceEventId, undefined);
  assert.equal(genericRisk.authorityReceipt, undefined);
});

test('failed or partial rescues never create an IF candidate', async () => {
  const { buildLocalJudgementPreflight } = await loadTs('../src/utils/judgementPreflight.ts');
  const { persistPendingJudgement, resolvePendingJudgement } = await loadTs('../src/utils/judgementEngine.ts');
  const { settleWorldSimulationJudgement } = await loadTs('../src/modules/scenarioMods/worldSimulation.ts');
  for (const outcome of ['failure', 'partial']) {
    const save = await buildSave('world_sim');
    establishSuccession(save);
    const proposal = buildLocalJudgementPreflight('我设法救治郭解', save, 4);
    persistPendingJudgement(save, proposal);
    const resolution = resolvePendingJudgement(save, proposal.id, { currentTurn: 4, testOutcome: outcome });
    assert.deepEqual(settleWorldSimulationJudgement(save, resolution), { pending: false, expired: false });
    assert.equal(save.世界.状态.剧本模组.worldSimulationState.pendingDivergence, undefined);
    assert.equal(save.世界.状态.剧本模组.flags['branch.lyg.if_guojie_longrest.active'], undefined);
  }
});

test('a default deadline that settles before confirmation expires the old rescue receipt', async () => {
  const { buildLocalJudgementPreflight } = await loadTs('../src/utils/judgementPreflight.ts');
  const { persistPendingJudgement, resolvePendingJudgement } = await loadTs('../src/utils/judgementEngine.ts');
  const { confirmWorldSimulationDivergence, settleWorldSimulationJudgement } = await loadTs('../src/modules/scenarioMods/worldSimulation.ts');
  const save = await buildSave('world_sim');
  const runtime = establishSuccession(save);
  const proposal = buildLocalJudgementPreflight('我立即救下郭解', save, 4);
  persistPendingJudgement(save, proposal);
  const resolution = resolvePendingJudgement(save, proposal.id, { currentTurn: 4, testOutcome: 'perfect' });
  assert.equal(settleWorldSimulationJudgement(save, resolution).pending, true);

  runtime.flags['world.r2_10.lyg_event_s01_06.occurred'] = true;
  runtime.offscreenResolvedEventIds.push('lyg.event.s01_06');
  const confirmation = confirmWorldSimulationDivergence(save);
  assert.equal(confirmation.ok, false);
  assert.match(confirmation.reason, /已经先行结算/);
  assert.equal(runtime.flags['branch.lyg.if_guojie_longrest.active'], undefined);
  assert.equal(runtime.worldSimulationState.pendingDivergence, undefined);
});

test('Dong Zhuo rescue uses the same deterministic gate and survives JSON reload without rerolling', async () => {
  const { buildLocalJudgementPreflight } = await loadTs('../src/utils/judgementPreflight.ts');
  const { persistPendingJudgement, resolvePendingJudgement } = await loadTs('../src/utils/judgementEngine.ts');
  const { confirmWorldSimulationDivergence, settleWorldSimulationJudgement } = await loadTs('../src/modules/scenarioMods/worldSimulation.ts');
  let save = await buildSave('world_sim');
  const runtime = establishSuccession(save);
  runtime.flags['world.r2_10.lyg_event_s01_06.occurred'] = true;
  runtime.offscreenResolvedEventIds.push('lyg.event.s01_06');
  const proposal = buildLocalJudgementPreflight('我用疗伤手段稳住董卓并救治董卓', save, 9);
  assert.equal(proposal.kind, 'cultivate');
  persistPendingJudgement(save, proposal);
  const resolution = resolvePendingJudgement(save, proposal.id, { currentTurn: 9, testOutcome: 'success' });
  settleWorldSimulationJudgement(save, resolution);
  save = JSON.parse(JSON.stringify(save));
  assert.equal(confirmWorldSimulationDivergence(save).ok, true);
  assert.equal(save.世界.状态.剧本模组.flags['branch.lyg.if_dongzhuo_longrest.active'], true);
  assert.equal(save.世界.状态.剧本模组.flags['character.dong_zhuo.status'], 'longrest');
});

test('world prompt projects situations and receipts but never grants Canon Rail completion authority', async () => {
  const { buildScenarioStoryPrompt, createScenarioPromptState } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const save = await buildSave('world_sim');
  establishSuccession(save);
  const prompt = buildScenarioStoryPrompt(save, '我观察宫城动静');
  assert.match(prompt, /六朝世界模式·本地真值/);
  assert.match(prompt, /刺杀窗口已经打开/);
  assert.match(prompt, /已成立且必须保留.*定陶王的政治继统/);
  assert.doesNotMatch(prompt, /Canon Rail/);
  assert.doesNotMatch(prompt, /完成写入键/);
  assert.doesNotMatch(prompt, /斩线回轨/);
  const projected = createScenarioPromptState(save);
  assert.equal(projected.世界.状态.剧本模组.worldSimulation, undefined, 'future author contract must not leak through generic state JSON');
});

test('world mode rejects all LLM writes to scenario flags', async () => {
  const { guardScenarioModCommands } = await loadTs('../src/modules/scenarioMods/canonGuard.ts');
  const save = await buildSave('world_sim');
  const result = guardScenarioModCommands(save, [{
    action: 'set', key: '世界.状态.剧本模组.flags.branch.lyg.if_guojie_longrest.active', value: true,
  }]);
  assert.equal(result.accepted.length, 0);
  assert.match(result.rejected[0].reason, /只能由本地引擎结算/);
});

test('world mode without a stage contract stays fail-closed instead of falling back to companion prompting', async () => {
  const { isWorldSimulationRuntime, getCurrentWorldSituation } = await loadTs('../src/modules/scenarioMods/worldSimulation.ts');
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const save = await buildSave('world_sim');
  delete save.世界.状态.剧本模组.worldSimulation;
  assert.equal(isWorldSimulationRuntime(save.世界.状态.剧本模组), true);
  assert.equal(getCurrentWorldSituation(save.世界.状态.剧本模组), undefined);
  const prompt = buildScenarioStoryPrompt(save);
  assert.match(prompt, /当前世界合同没有可用局势/);
  assert.doesNotMatch(prompt, /Canon Rail|完成写入键|本拍必须达成/);
});

test('an existing pending divergence blocks a second intervention receipt from replacing it', async () => {
  const { buildLocalJudgementPreflight } = await loadTs('../src/utils/judgementPreflight.ts');
  const { persistPendingJudgement, resolvePendingJudgement } = await loadTs('../src/utils/judgementEngine.ts');
  const { findWorldSimulationIntervention, settleWorldSimulationJudgement } = await loadTs('../src/modules/scenarioMods/worldSimulation.ts');
  const save = await buildSave('world_sim');
  establishSuccession(save);
  const proposal = buildLocalJudgementPreflight('我立即牵制剑玉姬并救下郭解', save, 4);
  persistPendingJudgement(save, proposal);
  const first = resolvePendingJudgement(save, proposal.id, { currentTurn: 4, testOutcome: 'great_success' });
  assert.equal(settleWorldSimulationJudgement(save, first).pending, true);
  const original = structuredClone(save.世界.状态.剧本模组.worldSimulationState.pendingDivergence);
  assert.equal(findWorldSimulationIntervention(save, '出手拦住剑玉姬并救下郭解'), undefined);
  const forgedSecond = { ...first, id: `${first.id}.second` };
  assert.deepEqual(settleWorldSimulationJudgement(save, forgedSecond), { pending: false, expired: true });
  assert.deepEqual(save.世界.状态.剧本模组.worldSimulationState.pendingDivergence, original);
});

test('confirmation checks the existing IF registry before writing any divergence or character flags', async () => {
  const { buildLocalJudgementPreflight } = await loadTs('../src/utils/judgementPreflight.ts');
  const { persistPendingJudgement, resolvePendingJudgement } = await loadTs('../src/utils/judgementEngine.ts');
  const { confirmWorldSimulationDivergence, settleWorldSimulationJudgement } = await loadTs('../src/modules/scenarioMods/worldSimulation.ts');
  const save = await buildSave('world_sim');
  const runtime = establishSuccession(save);
  const proposal = buildLocalJudgementPreflight('我立即牵制剑玉姬并救下郭解', save, 4);
  persistPendingJudgement(save, proposal);
  const resolution = resolvePendingJudgement(save, proposal.id, { currentTurn: 4, testOutcome: 'perfect' });
  settleWorldSimulationJudgement(save, resolution);
  runtime.worldSimulationState.pendingDivergence.branchId = 'lyg.if.unknown';
  const beforeFlags = structuredClone(runtime.flags);
  assert.equal(confirmWorldSimulationDivergence(save).ok, false);
  assert.deepEqual(runtime.flags, beforeFlags);
  assert.equal(runtime.divergences, undefined);
});

test('validator rejects world contracts that read outside flags engine state or omit a settlement predicate', async () => {
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const invalidPath = await loadRawStage();
  invalidPath.scenario.worldSimulation.situations[0].settledWhenAny[0][0].path = '角色.属性.气血.当前';
  assert.equal(validateScenarioMod(invalidPath).issues.some(issue =>
    issue.path.endsWith('settledWhenAny[0][0].path') && issue.code === 'invalid_path'), true);
  const emptyDefault = await loadRawStage();
  emptyDefault.scenario.worldSimulation.forkableOutcomes[0].defaultWhen = [];
  assert.equal(validateScenarioMod(emptyDefault).issues.some(issue =>
    issue.path.endsWith('forkableOutcomes[0].defaultWhen') && issue.code === 'required_array'), true);
  const unknownBranch = await loadRawStage();
  unknownBranch.scenario.worldSimulation.forkableOutcomes[0].replacementBranches[0].branchId = 'lyg.if.unknown';
  assert.equal(validateScenarioMod(unknownBranch).issues.some(issue =>
    issue.path.endsWith('replacementBranches[0].branchId') && issue.code === 'unknown_reference'), true);
  const unknownResolution = await loadRawStage();
  unknownResolution.scenario.worldSimulation.forkableOutcomes[0].defaultResolutionId = 'offscreen.unknown';
  assert.equal(validateScenarioMod(unknownResolution).issues.some(issue =>
    issue.path.endsWith('defaultResolutionId') && issue.code === 'unknown_reference'), true);
});

test('dingtao world contract carries two unknown-outcome omens and the validator rejects a spoiling deadline', async () => {
  const raw = await loadRawStage();
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const enthronement = raw.scenario.worldSimulation.situations.find(item => item.id === 'world-sim.lyg.s01_05.enthronement').omen;
  const crisis = raw.scenario.events.find(item => item.id === 'lyg.event.s01_06').timeline.omen;
  assert.equal(enthronement.id, 'omen.lyg.s01_05.enthronement_accelerating');
  assert.equal(crisis.id, 'omen.lyg.s01_06.guo_jie_crisis');
  const omenText = `${JSON.stringify(enthronement)}${JSON.stringify(crisis)}`;
  assert.match(omenText, /宫门|换防|护送|仪仗|诏令|见证官|钟鼓/);
  assert.doesNotMatch(omenText, /身亡|会死|必定登基|已经称帝|剑玉姬/);
  assert.equal(validateScenarioMod(raw).valid, true);

  const invalid = await loadRawStage();
  invalid.scenario.events.find(item => item.id === 'lyg.event.s01_06').timeline.omen.afterTurns = 6;
  assert.equal(validateScenarioMod(invalid).issues.some(issue =>
    issue.path.endsWith('.omen.afterTurns') && issue.code === 'invalid_range'), true);
  invalid.scenario.events.find(item => item.id === 'lyg.event.s01_06').timeline.omen = { id: 'omen.bad', afterTurns: 1 };
  assert.equal(validateScenarioMod(invalid).issues.some(issue =>
    issue.path.endsWith('.omen.presentation') && issue.code === 'required_object'), true);

  const spoiler = await loadRawStage();
  spoiler.scenario.events.find(item => item.id === 'lyg.event.s01_06').timeline.omen.presentation.text = '宫人断言郭解必死，剩余 2 回合。';
  const spoilerIssues = validateScenarioMod(spoiler).issues;
  assert.equal(spoilerIssues.some(issue => issue.code === 'spoiler_outcome'), true);
  assert.equal(spoilerIssues.some(issue => issue.code === 'meta_language'), true);
});

test('dingtao enthronement omen fires once before settlement and writes no truth or knowledge', async () => {
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { getWorldSimulationPresentationNotices, formatWorldSimulationPrompt } = await loadTs('../src/modules/scenarioMods/worldSimulation.ts');
  let save = await buildSave('world_sim');
  let due;
  for (let turn = 0; turn < 6; turn += 1) {
    const next = advanceScenarioRuntime(save);
    if (next.transitions.some(item => item.type === 'event_omen')) {
      due = next;
      break;
    }
    save = next.saveData;
    assert.equal(next.saveData.世界.状态.剧本模组.flags['world.r2_9.lyg_event_s01_05.offscreen_resolved'], undefined);
  }
  assert.ok(due, 'enthronement omen must fire before the default deadline');
  const omenTransitions = due.transitions.filter(item => item.type === 'event_omen');
  assert.deepEqual(omenTransitions.map(item => item.id), ['omen.lyg.s01_05.enthronement_accelerating']);
  const runtime = due.saveData.世界.状态.剧本模组;
  const notices = getWorldSimulationPresentationNotices(runtime, [
    { action: 'event_omen', newValue: 'omen.lyg.s01_05.enthronement_accelerating' },
  ]);
  assert.equal(notices[0].kind, 'omen');
  assert.match(notices[0].detail, /仪仗|诏令|见证官|钟鼓/);
  assert.doesNotMatch(notices[0].detail, /必定登基|已经称帝/);
  assert.match(formatWorldSimulationPrompt(runtime), /剧情内征兆·仅演出/);
  assert.equal(runtime.flags['event.s01_05.done'], false);
  assert.equal(runtime.flags['world.r2_9.lyg_event_s01_05.offscreen_resolved'], undefined);
  assert.equal((runtime.divergences || []).length, 0);
  assert.ok(!runtime.playerKnowledge || !Object.keys(runtime.playerKnowledge).some(id => id.includes('omen')));

  const reloaded = JSON.parse(JSON.stringify(due.saveData));
  const again = advanceScenarioRuntime(reloaded);
  assert.equal(again.transitions.some(item => item.type === 'event_omen'), false);
  assert.deepEqual(again.saveData.世界.状态.剧本模组.worldSimulationState.deliveredOmenIds, [
    'omen.lyg.s01_05.enthronement_accelerating',
  ]);
});

test('dingtao Guo Jie omen waits for the assassination window and is skipped if that batch already settled', async () => {
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { getWorldSimulationPresentationNotices } = await loadTs('../src/modules/scenarioMods/worldSimulation.ts');
  let save = await buildSave('world_sim');
  const runtime = establishSuccession(save);
  runtime.activeEventIds = ['lyg.event.s01_06'];
  runtime.eventTimeline = { 'lyg.event.s01_06': { eligibleAtTurn: 4 } };
  runtime.worldTurn = 5;
  const before = advanceScenarioRuntime(save);
  assert.equal(before.transitions.some(item => item.id === 'omen.lyg.s01_06.guo_jie_crisis'), false);

  save = before.saveData;
  save.世界.状态.剧本模组.worldTurn = 6;
  const due = advanceScenarioRuntime(save);
  assert.ok(due.transitions.some(item => item.type === 'event_omen' && item.id === 'omen.lyg.s01_06.guo_jie_crisis'));
  const notices = getWorldSimulationPresentationNotices(due.saveData.世界.状态.剧本模组, [
    { action: 'event_omen', newValue: 'omen.lyg.s01_06.guo_jie_crisis' },
  ]);
  assert.match(notices[0].detail, /换防|护送|逼近/);
  assert.doesNotMatch(notices[0].detail, /身亡|会死|剑玉姬/);

  const settled = await buildSave('world_sim');
  const settledRuntime = establishSuccession(settled);
  settledRuntime.activeEventIds = ['lyg.event.s01_06'];
  settledRuntime.eventTimeline = { 'lyg.event.s01_06': { eligibleAtTurn: 0 } };
  settledRuntime.worldTurn = 6;
  const sameBatch = advanceScenarioRuntime(settled);
  assert.equal(sameBatch.transitions.some(item => item.type === 'world_event_resolved'), true);
  assert.equal(sameBatch.transitions.some(item => item.id === 'omen.lyg.s01_06.guo_jie_crisis'), false);
  assert.ok(sameBatch.saveData.世界.状态.剧本模组.offscreenResolvedEventIds.includes('lyg.event.s01_06'));
});

test('validator rejects a worldSimulation contract on an expand mod', async () => {
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const raw = await loadRawStage();
  raw.rules.mode = 'expand';
  const result = validateScenarioMod(raw);
  assert.equal(result.valid, false);
  assert.equal(result.issues.some(issue =>
    issue.path === 'scenario.worldSimulation' && issue.code === 'mode_mismatch'), true);
});
