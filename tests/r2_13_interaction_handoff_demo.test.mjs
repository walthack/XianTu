import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stageUrl = new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_04.json', import.meta.url);
const mainPanelUrl = new URL('../src/components/dashboard/MainGamePanel.vue', import.meta.url);
const rightSidebarUrl = new URL('../src/components/dashboard/RightSidebar.vue', import.meta.url);
const FLOOD_EVENT_ID = 'lcq.event.s04_05';
const DETOX_EVENT_ID = 'lcq.event.s04_06';

const runtimeOf = save => save.世界.状态.剧本模组;

function fixture(stage) {
  const events = stage.scenario.events
    .filter(event => [FLOOD_EVENT_ID, DETOX_EVENT_ID].includes(event.id))
    .map(event => structuredClone(event));
  return {
    角色: {
      身份: { 名字: '固定动词 Demo' },
      位置: { 描述: '南荒山涧' },
      属性: { 声望: 0 },
    },
    社交: { 关系: {}, 记忆: { 短期记忆: [], 中期记忆: [], 长期记忆: [], 隐式中期记忆: [] } },
    系统: { 扩展: {}, 历史: { 叙事: [] } },
    世界: {
      信息: { 世界名称: stage.world.name, 地点信息: [], 势力信息: [] },
      状态: {
        剧本模组: {
          // Demo 关闭全局 Canon Rail profile，只验证这两个事件的本地依赖链。
          modId: 'demo.lcq.stage_04',
          modName: stage.manifest.name,
          currentChapterId: 'demo.chapter',
          chapters: [{
            id: 'demo.chapter',
            title: '洪灾余波',
            summary: '',
            eventIds: [FLOOD_EVENT_ID, DETOX_EVENT_ID],
          }],
          events,
          flags: {
            ...structuredClone(stage.scenario.initialFlags),
            'event.s04_04.done': true,
            'event.s04_05.done': false,
            'event.s04_06.done': false,
          },
          activeEventIds: [FLOOD_EVENT_ID],
          completedEventIds: [],
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

test('fixed verbs are presentation-only and carry the flood farewell into the Ningyu detox beat', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const {
    acknowledgeStoryBeatHandoff,
    advanceScenarioRuntime,
    getCurrentContractStep,
    getCurrentStoryEventActions,
    hasPendingStoryBeatHandoff,
    recordStoryEventStructuredAction,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const { validateNarrativePerformance } =
    await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');

  let save = advanceScenarioRuntime(fixture(stage)).saveData;
  // 用户裁定 2026-10-02：按钮不显示步骤进度；步数只留在 stepIndex/stepTotal 与给写手的分步边界里。
  const expectedFloodLabels = [
    '观察 · 易虎',
    '观察 · 易虎',
    '交谈 · 易彪',
  ];
  for (const [index, expectedLabel] of expectedFloodLabels.entries()) {
    const [action] = getCurrentStoryEventActions(save);
    assert.equal(action.label, `${expectedLabel} · ${stage.scenario.events.find(item => item.id === FLOOD_EVENT_ID).playerCompletionContract.actions[index].label}`);
    assert.equal(action.stepIndex, index + 1);
    assert.equal(action.stepTotal, 3);
    assert.doesNotMatch(action.label, /主线推进|主线判定/);
    assert.doesNotMatch(action.label, /第\s*\d+\s*\/\s*\d+\s*步/);
    const step = getCurrentContractStep(save);
    assert.equal(step.index, index + 1);
    assert.equal(step.total, 3);
    assert.equal(step.action.id, action.actionId);
    const prompt = buildScenarioStoryPrompt(save);
    assert.match(prompt, new RegExp(`本拍分步·第 ${index + 1}/3 步`));
    assert.match(prompt, new RegExp(`本轮只完整呈现第 ${index + 1} 步`));
    if (index === 0) {
      assert.match(prompt, /不得演出后续步骤（见证千斤坠与巨石重创；陪易彪完成岸边送别）/);
      assert.match(prompt, /renderGuard\.reservedFutureTerms=千斤坠\|巨石正中\|洪水吞没\|他是我哥\|认兄\|磕头/);
      assert.equal(validateNarrativePerformance('易虎骤然使出千斤坠。', '继续', prompt).valid, false);
      assert.equal(validateNarrativePerformance('洪流裹挟着巨石和断木。', '继续', prompt).valid, true);
    }
    if (index === 1) {
      assert.equal(validateNarrativePerformance('易彪跪在岸边磕头。', '继续', prompt).valid, false);
    }
    assert.equal(recordStoryEventStructuredAction(save, action).outcome, 'success');
    save = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
  }

  const runtime = runtimeOf(save);
  assert.equal(runtime.completedEventIds.includes(FLOOD_EVENT_ID), true);
  assert.equal(runtime.activeEventIds.includes(DETOX_EVENT_ID), true);
  assert.deepEqual(runtime.lastSettledBeat, {
    eventId: FLOOD_EVENT_ID,
    settledAtTurn: runtime.worldTurn,
    targetEventId: DETOX_EVENT_ID,
  });
  assert.equal(hasPendingStoryBeatHandoff(save), true);

  const [detoxAction] = getCurrentStoryEventActions(save);
  assert.equal(detoxAction.label, '交谈 · 乐明珠 · 请求乐明珠为凝羽解毒');
  assert.equal(detoxAction.playerLine, '我请乐明珠替凝羽解毒。');
  assert.equal(detoxAction.actionText, '我按当前主线目标行动：请求乐明珠为凝羽解毒');
  assert.equal(detoxAction.interaction.verb, 'talk');
  assert.equal(detoxAction.actionId, 'advance_declared_objective');
  assert.match(buildScenarioStoryPrompt(save), /跨拍承接·余波铺垫，不改真值/);
  assert.match(buildScenarioStoryPrompt(save), /renderGuard\.rejectUngroundedHandoffLosses=true/);
  assert.match(buildScenarioStoryPrompt(save), /当前没有结构化损失回执/);
  assert.match(buildScenarioStoryPrompt(save), /旱洪与易虎之死/);
  assert.match(buildScenarioStoryPrompt(save), /请求乐明珠为凝羽解毒/);
  assert.equal(acknowledgeStoryBeatHandoff(save, FLOOD_EVENT_ID), 'bridged');
  assert.equal(hasPendingStoryBeatHandoff(save), false);
  assert.doesNotMatch(buildScenarioStoryPrompt(save), /跨拍承接/);
  assert.match(
    buildScenarioStoryPrompt(
      save,
      `玩家输入：${detoxAction.playerLine}\n【本地事件判定已预结算】事件=${DETOX_EVENT_ID}；动作=${detoxAction.actionId}`,
    ),
    /跨拍承接·入口已由玩家触发，不改真值/,
  );
  assert.match(
    buildScenarioStoryPrompt(
      save,
      `玩家输入：${detoxAction.playerLine}\n【本地事件判定已预结算】事件=${DETOX_EVENT_ID}；动作=${detoxAction.actionId}`,
    ),
    /renderGuard\.rejectUngroundedHandoffLosses=true/,
  );

  assert.equal(recordStoryEventStructuredAction(save, detoxAction).completed, true);
  save = advanceScenarioRuntime(JSON.parse(JSON.stringify(save))).saveData;
  assert.equal(runtimeOf(save).completedEventIds.includes(DETOX_EVENT_ID), true);
});

test('handoff hides the next beat only through the first bridge and persists until its action is triggered', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { acknowledgeStoryBeatHandoff, hasPendingStoryBeatHandoff } =
    await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const save = fixture(stage);
  const runtime = runtimeOf(save);
  runtime.activeEventIds = [DETOX_EVENT_ID];
  runtime.lastSettledBeat = {
    eventId: FLOOD_EVENT_ID,
    settledAtTurn: 2,
    targetEventId: DETOX_EVENT_ID,
  };
  runtime.worldTurn = 4;
  assert.match(buildScenarioStoryPrompt(save), /跨拍承接·余波铺垫，不改真值/);
  assert.equal(hasPendingStoryBeatHandoff(save), true);

  assert.equal(acknowledgeStoryBeatHandoff(save, FLOOD_EVENT_ID), 'bridged');
  assert.equal(hasPendingStoryBeatHandoff(save), false);
  assert.equal(runtime.lastSettledBeat.bridgedAtTurn, 4);
  assert.doesNotMatch(buildScenarioStoryPrompt(save), /跨拍承接/);
  assert.doesNotMatch(buildScenarioStoryPrompt(save, '我请乐明珠替凝羽解毒。'), /入口已由玩家触发/);
  assert.match(
    buildScenarioStoryPrompt(
      save,
      `我请乐明珠替凝羽解毒。\n【本地事件判定已预结算】事件=${DETOX_EVENT_ID}；动作=advance_declared_objective`,
    ),
    /跨拍承接·入口已由玩家触发，不改真值/,
  );
  assert.equal(acknowledgeStoryBeatHandoff(save, FLOOD_EVENT_ID, DETOX_EVENT_ID), 'consumed');
  assert.equal(runtime.lastSettledBeat, undefined);

  runtime.offscreenResolvedEventIds = [FLOOD_EVENT_ID];
  runtime.activeEventIds = [DETOX_EVENT_ID];
  assert.equal(runtime.lastSettledBeat, undefined);
});

test('stage departure offer is a persistent direct command gated by the engine-owned ready id', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { getStageDepartureOffer } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = fixture(stage);
  const runtime = runtimeOf(save);
  assert.equal(getStageDepartureOffer(save), null);

  runtime.nextStageReadyId = runtime.nextStageId;
  runtime.currentChapterId = null;
  runtime.activeEventIds = [];
  const offer = getStageDepartureOffer(save);
  assert.deepEqual(offer, {
    nextStageId: runtime.nextStageId,
    label: '收拾行装，继续旅程',
  });
  assert.equal(offer.label, '收拾行装，继续旅程');
  runtime.worldTurn += 20;
  assert.deepEqual(getStageDepartureOffer(JSON.parse(JSON.stringify(save))), offer);

  runtime.nextStageReadyId = 'stale.stage';
  assert.equal(getStageDepartureOffer(save), null);
});

test('fixed verb derivation never changes the stored completion contract', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { advanceScenarioRuntime, getCurrentStoryEventActions } =
    await loadTs('../src/modules/scenarioMods/runtime.ts');
  const before = JSON.stringify(stage.scenario.events
    .filter(event => [FLOOD_EVENT_ID, DETOX_EVENT_ID].includes(event.id))
    .map(event => event.playerCompletionContract));
  const save = advanceScenarioRuntime(fixture(stage)).saveData;
  assert.equal(getCurrentStoryEventActions(save)[0].interaction.verb, 'observe');
  const after = JSON.stringify(stage.scenario.events
    .filter(event => [FLOOD_EVENT_ID, DETOX_EVENT_ID].includes(event.id))
    .map(event => event.playerCompletionContract));
  assert.equal(after, before);
});

test('real Canon Rail prompt treats later steps as a multi-round result, not a current-turn demand', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const save = fixture(stage);
  runtimeOf(save).modId = stage.manifest.id;
  const advanced = advanceScenarioRuntime(save).saveData;
  const prompt = buildScenarioStoryPrompt(advanced);
  assert.match(prompt, /以下是本拍跨多轮必须达成的完整结果（不是本轮要求）/);
  assert.match(prompt, /本轮只推进到第 1\/3 步/);
  assert.doesNotMatch(prompt, /主轴拍点中的动作、顺序、反差与收束必须逐项完整呈现/);
});

test('presentation router exposes the fixed verb vocabulary without changing deterministic payloads', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { advanceScenarioRuntime, getCurrentStoryEventActions } =
    await loadTs('../src/modules/scenarioMods/runtime.ts');
  const samples = [
    ['观察营门动静', '我观察营门动静。', 'observe'],
    ['请求乐明珠诊治', '我请求乐明珠诊治凝羽。', 'talk'],
    ['击退鬼王峒武士', '我协助武二郎击退鬼王峒武士。', 'attack'],
    ['使用解毒丹', '我取出解毒丹交给乐明珠。', 'use'],
    // 已在场的合同文案不是真移动，即使文字里含前往也显示行动。
    ['随乐明珠前往鬼王峒', '我随乐明珠前往鬼王峒。', 'act'],
    ['原地调息疗伤', '我原地调息疗伤。', 'rest'],
    ['处理眼前事务', '我处理眼前事务。', 'act'],
    ['查明夜晚发丝袭击事件', '我查明夜晚发丝袭击事件。', 'observe'],
    ['躲避鳄鱼袭击', '我躲避鳄鱼袭击。', 'act'],
  ];
  for (const [label, actionText, expectedVerb] of samples) {
    const save = fixture(stage);
    const runtime = runtimeOf(save);
    const event = runtime.events.find(item => item.id === FLOOD_EVENT_ID);
    event.playerCompletionContract.actions = [{
      id: 'demo_action',
      label,
      actionText,
      timeCost: 1,
      outcomeText: { success: '成功', partial: '部分', failure: '失败' },
    }];
    const advanced = advanceScenarioRuntime(save).saveData;
    const [selection] = getCurrentStoryEventActions(advanced);
    assert.equal(selection.interaction.verb, expectedVerb);
    assert.equal(selection.actionId, 'demo_action');
    assert.equal(selection.actionText, actionText);
  }
});

test('target fallback never echoes a long objective and event presentation stays outside the contract hash', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { advanceScenarioRuntime, getCurrentStoryEventActions } =
    await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = fixture(stage);
  const runtime = runtimeOf(save);
  const event = runtime.events.find(item => item.id === FLOOD_EVENT_ID);
  event.name = '这是一个超过十个汉字而不适合作为按钮目标的事件名称';
  event.objective = '在不预写灭村真相的前提下进入蛇彝村并安置商队';
  event.relatedCharacterIds = [];
  event.playerCompletionContract.actions = [{
    id: 'demo_action',
    label: '处理眼前事务',
    actionText: '我处理眼前事务。',
    timeCost: 1,
    outcomeText: { success: '成功', partial: '部分', failure: '失败' },
  }];
  let advanced = advanceScenarioRuntime(save).saveData;
  let [selection] = getCurrentStoryEventActions(advanced);
  assert.equal(selection.label, '行动 · 处理眼前事务');
  assert.doesNotMatch(selection.label, /灭村|蛇彝村|安置商队/);

  const eventAfter = runtimeOf(advanced).events.find(item => item.id === FLOOD_EVENT_ID);
  const contractBefore = JSON.stringify(eventAfter.playerCompletionContract);
  eventAfter.presentation = { targetLabel: '蛇彝村', playerLine: '我先安置商队。' };
  selection = getCurrentStoryEventActions(advanced)[0];
  assert.equal(selection.label, '行动 · 蛇彝村 · 处理眼前事务');
  assert.equal(selection.playerLine, '我先安置商队。');
  assert.equal(JSON.stringify(eventAfter.playerCompletionContract), contractBefore);
});

test('validator accepts event-level presentation and rejects non-string display fields', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  assert.equal(validateScenarioMod(stage).valid, true);
  const invalid = structuredClone(stage);
  invalid.scenario.events.find(event => event.id === DETOX_EVENT_ID).presentation = { playerLine: 42 };
  const result = validateScenarioMod(invalid);
  assert.equal(result.valid, false);
  assert.equal(result.issues.some(issue =>
    issue.path.endsWith('.presentation.playerLine')), true);

  const invalidGuard = structuredClone(stage);
  invalidGuard.scenario.events.find(event => event.id === DETOX_EVENT_ID).presentation.stepGuardTerms = {
    missing_action: ['未来结果'],
  };
  const guardResult = validateScenarioMod(invalidGuard);
  assert.equal(guardResult.valid, false);
  assert.equal(guardResult.issues.some(issue =>
    issue.path.endsWith('.presentation.stepGuardTerms.missing_action')
    && issue.code === 'invalid_reference'), true);
});

test('handoff keeps journal and next-beat buttons; successful sends clear the editable line', async () => {
  const [mainPanel, rightSidebar] = await Promise.all([
    readFile(mainPanelUrl, 'utf8'),
    readFile(rightSidebarUrl, 'utf8'),
  ]);
  assert.match(mainPanel, /const eventActions = getCurrentStoryEventActions\(save\)/);
  assert.doesNotMatch(mainPanel, /hasPendingStoryBeatHandoff\(save\) \? \[\] : getCurrentStoryEventActions\(save\)/);
  assert.match(rightSidebar, /const activeEvents = anchor \? \[anchor\] : \[\];/);
  assert.equal(rightSidebar.includes('hasPendingStoryBeatHandoff'), false);
  assert.match(rightSidebar, /getStageDepartureOffer/);
  assert.match(rightSidebar, /departure\?\.label && !events\.length\) events\.push\(departure\.label\)/);
  assert.match(
    mainPanel,
    /if \(!hasError && aiResponse\) \{[\s\S]{0,300}inputText\.value = '';[\s\S]{0,200}selectedScenarioEngineAction\.value = null;/,
  );
});
