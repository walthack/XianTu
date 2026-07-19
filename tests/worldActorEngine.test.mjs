import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stageUrl = new URL('../src/modules/scenarioMods/builtins/data/lyg.dingtao_beijing.json', import.meta.url);

function actorContract() {
  return {
    pressure: {
      id: 'world.demo.enthronement', scope: 'state', summary: '登基在即',
      intensity: 3, canonPolicy: 'process_only',
    },
    agendas: [
      {
        id: 'agenda.demo.dong', characterId: 'character.dong', goal: '完成拥立',
        nextAction: '布置宫门', visibleSignal: '宫门开始核印', offscreenAction: '世界自行拥立',
      },
      {
        id: 'agenda.demo.jia', characterId: 'character.jia', goal: '安排新政',
        nextAction: '递出草案', visibleSignal: '无名短札送到案前', offscreenAction: '自行排序草案',
      },
    ],
    opportunities: [{
      id: 'opportunity.demo.edict', title: '第一道诏令',
      characterIds: ['character.jia'], whyNow: '诏令即将落定', nextStep: '选择政策侧重',
      stakes: '必须承担站队后果', rewardPreview: '打开谋议入口', futureHint: '获得后续方案',
      actionText: '我选择介入第一道诏令。', rewardKey: 'permission.demo.council',
      rewardLabel: '可交换判断',
    }],
  };
}

function save() {
  return {
    角色: { 位置: { 描述: '昭阳宫' }, 属性: { 声望: 0 } },
    社交: { 关系: {} },
    系统: { 扩展: {}, 历史: { 叙事: [] } },
    世界: { 状态: { 剧本模组: {
      modId: 'demo.world-actor',
      modName: '世界演员测试',
      mode: 'strict',
      currentChapterId: 'chapter.demo',
      chapters: [{ id: 'chapter.demo', title: '拥立', summary: '新帝即位', eventIds: ['event.e1', 'event.e2'] }],
      events: [
        {
          id: 'event.e1', name: '拥立新帝', description: '新帝即将登基', critical: true, axisSeq: 1,
          objective: '参与新帝登基',
          completion: [{ path: 'flags.event.e1.done', operator: 'eq', value: true }],
          worldActor: actorContract(),
        },
        {
          id: 'event.e2', name: '登基余波', description: '处理登基余波', critical: true, axisSeq: 2,
          conditions: [{ path: 'flags.event.e1.done', operator: 'eq', value: true }],
          completion: [{ path: 'flags.event.e2.done', operator: 'eq', value: true }],
        },
      ],
      activeEventIds: ['event.e1'], completedEventIds: [], completedChapterIds: [],
      flags: { 'event.e1.done': false, 'event.e2.done': false },
      canon: {
        characters: [
          { id: 'character.dong', name: '董卓' },
          { id: 'character.jia', name: '贾文和' },
        ],
        factions: [],
        locations: [],
      },
    } } },
  };
}

test('Dingtao built-in validates with a single-stage world actor contract', async () => {
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const raw = JSON.parse(await readFile(stageUrl, 'utf8'));
  const result = validateScenarioMod(raw);
  assert.equal(result.valid, true, JSON.stringify(result.issues, null, 2));
  const event = raw.scenario.events.find(item => item.id === 'lyg.event.s01_05');
  assert.deepEqual(event.worldActor.decisionCore.actors.map(item => item.characterId), [
    'liuchao.character.dong_zhuo',
    'liuchao.character.jia_wenhe',
    'liuchao.character.huo_zi_meng',
    'liuchao.character.lv_zhi',
  ]);
  assert.equal(event.worldActor.agendas, undefined, 's01_05 must not fall back to hand-written agenda rotation');
  const knownFacts = event.worldActor.decisionCore.actionBindings.flatMap(item => item.knownFacts);
  assert.equal(knownFacts.some(item => /阮香凝|凝玉姬|黑魔海玉姬/.test(item)), false, 'NPC knowledge must not leak Ruan');
});

test('s01_05 deterministic core derives four distinct actions with explainable scores and hard canon elimination', async () => {
  const {
    NPC_ACTION_LIBRARY,
    applyNpcDecisionActorState,
    applyNpcDecisionEffects,
    decideNpcActions,
  } = await loadTs('../src/modules/scenarioMods/npcDecisionCore.ts');
  const raw = JSON.parse(await readFile(stageUrl, 'utf8'));
  const core = raw.scenario.events.find(item => item.id === 'lyg.event.s01_05').worldActor.decisionCore;
  assert.equal(NPC_ACTION_LIBRARY.length >= 30 && NPC_ACTION_LIBRARY.length <= 50, true);

  const first = decideNpcActions(core);
  const replay = decideNpcActions(structuredClone(core), structuredClone(core.situation.initialValues));
  assert.deepEqual(replay, first, 'same situation must replay byte-for-byte');
  assert.deepEqual(first.decisions.map(item => item.actionId), [
    'secure_palace_access',
    'prepare_fallback_route',
    'negotiate_court_procedure',
    'test_loyalty',
  ]);

  for (const decision of first.decisions) {
    assert.equal(decision.candidates.filter(item => item.eligible).length >= 2, true);
    const runnerUp = decision.candidates.filter(item => item.eligible)
      .sort((a, b) => b.score - a.score)[1];
    assert.equal(decision.score > runnerUp.score, true, `${decision.actorId} winner must beat a visible runner-up`);
    assert.equal(Object.values(decision.candidates[0].breakdown).every(Number.isFinite), true);
  }
  const dong = first.decisions[0];
  const forbidden = dong.candidates.find(item => item.actionId === 'force_succession');
  assert.equal(forbidden.eligible, false);
  assert.equal(forbidden.score, undefined, 'canon conflict must be eliminated before scoring');
  assert.match(forbidden.eliminatedReason, /^forbiddenBefore:/);

  const changed = applyNpcDecisionEffects(core, core.situation.initialValues, first.decisions);
  assert.deepEqual(Object.keys(changed).sort(), ['courtLegitimacy', 'militaryTension']);
  const actorState = applyNpcDecisionActorState(core, core.actors, first.decisions);
  assert.equal(core.actors[0].resources.troops, 5, 'canon config must remain immutable');
  assert.equal(actorState[0].resources.troops, 3, 'winning action cost must settle into NPC state');
  assert.equal(actorState[0].agendas[0].clock, 3, 'agenda clock caps at its escalation ladder');
  assert.equal(actorState[1].resources.intelligence, 4);
  assert.throws(() => applyNpcDecisionEffects(core, changed, [{
    ...dong, effects: { globalPopulation: -1 },
  }]), /outside the stage situation whitelist/);
});

test('NPC decision core has no LLM or network dependency', async () => {
  const source = await readFile(new URL('../src/modules/scenarioMods/npcDecisionCore.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /aiService|tavern|axios|fetch\s*\(/i);
});

test('Dingtao new save skips initial completed beats and opens on the enthronement actor slice', async () => {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const {
    applyStrictScenarioInitializationToSave,
    buildStrictScenarioInitialization,
  } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const { advanceScenarioRuntime, getNarrativeAnchorEvent } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const mod = parseScenarioMod(JSON.parse(await readFile(stageUrl, 'utf8')));
  const initialization = buildStrictScenarioInitialization(mod, '2026-07-19T00:00:00.000Z');
  const initialized = applyStrictScenarioInitializationToSave({
    角色: { 位置: { 描述: '旧地点' } },
    社交: { 关系: {} },
    世界: { 信息: {}, 状态: {} },
    系统: { 扩展: {} },
  }, initialization);
  const beforeAdvance = initialized.世界.状态.剧本模组;
  assert.deepEqual(beforeAdvance.completedEventIds.slice(0, 4), [
    'lyg.event.s01_01',
    'lyg.event.s01_02',
    'lyg.event.s01_03',
    'lyg.event.s01_04',
  ]);

  const advanced = advanceScenarioRuntime(initialized).saveData;
  const runtime = advanced.世界.状态.剧本模组;
  assert.equal(getNarrativeAnchorEvent(runtime).id, 'lyg.event.s01_05');
  assert.equal(getNarrativeAnchorEvent(runtime).objective, '到昭阳宫参与新帝登基');
  assert.equal(runtime.activeEventIds.includes('lyg.event.s01_01'), false);
  assert.equal(runtime.actorEngine.anchorEventId, 'lyg.event.s01_05');
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const prompt = buildScenarioStoryPrompt(advanced);
  assert.match(prompt, /控制宫门并召集登基见证者/);
  assert.match(prompt, /knownFacts=/);
  assert.match(prompt, /mustNotInvent=/);
});

test('tracking an opportunity awards one persistent permission only after player completion', async () => {
  const { advanceScenarioRuntime, trackStoryOpportunity } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const data = save();
  const initialized = advanceScenarioRuntime(data).saveData;
  const rt = initialized.世界.状态.剧本模组;
  assert.equal(rt.actorEngine.activeAgendaId, 'agenda.demo.dong');

  const tracked = trackStoryOpportunity(initialized, 'opportunity.demo.edict');
  assert.equal(tracked.ok, true);
  assert.match(tracked.actionText, /第一道诏令/);

  rt.flags['event.e1.done'] = true;
  const completed = advanceScenarioRuntime(initialized).saveData;
  const engine = completed.世界.状态.剧本模组.actorEngine;
  assert.equal(engine.entitlements.length, 1);
  assert.equal(engine.entitlements[0].key, 'permission.demo.council');
  assert.equal(engine.receipts[0].outcome, 'participated');

  const reloaded = JSON.parse(JSON.stringify(completed));
  const repeated = advanceScenarioRuntime(reloaded).saveData.世界.状态.剧本模组.actorEngine;
  assert.equal(repeated.entitlements.length, 1, 'same milestone must not be farmable');
  assert.equal(repeated.receipts.length, 1);
});

test('world cadence rotates agendas while offscreen completion closes a tracked opportunity without reward', async () => {
  const { advanceScenarioRuntime, trackStoryOpportunity } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  let data = advanceScenarioRuntime(save()).saveData;
  data = advanceScenarioRuntime(data).saveData;
  data = advanceScenarioRuntime(data).saveData;
  assert.equal(data.世界.状态.剧本模组.worldPush.scheduledAtTurn, 3);
  assert.equal(data.世界.状态.剧本模组.actorEngine.activeAgendaId, 'agenda.demo.jia');

  trackStoryOpportunity(data, 'opportunity.demo.edict');
  const rt = data.世界.状态.剧本模组;
  rt.activeEventIds = ['event.e2'];
  rt.offscreenResolvedEventIds = ['event.e1'];
  const settled = advanceScenarioRuntime(data).saveData.世界.状态.剧本模组.actorEngine;
  assert.equal(settled.entitlements.length, 0);
  assert.equal(settled.receipts[0].outcome, 'offscreen');
  assert.match(settled.receipts[0].detail, /未授予权限/);
});

test('s01_05 untracked stall threshold resolves offscreen before a same-turn done flag can claim participation', async () => {
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const raw = JSON.parse(await readFile(stageUrl, 'utf8'));
  let data = save();
  data.世界.状态.剧本模组 = {
    modId: raw.manifest.id,
    currentChapterId: 'lyg.chapter.s01',
    chapters: structuredClone(raw.scenario.chapters),
    events: structuredClone(raw.scenario.events),
    flags: { ...raw.scenario.initialFlags },
    activeEventIds: ['lyg.event.s01_05'],
    completedEventIds: ['lyg.event.s01_01', 'lyg.event.s01_02', 'lyg.event.s01_03', 'lyg.event.s01_04'],
    completedChapterIds: [],
    offscreenResolvedEventIds: [],
    stallTurns: 6,
    worldTurn: 9,
    nextStageId: raw.manifest.nextStageId,
  };
  data = advanceScenarioRuntime(data).saveData;
  data.世界.状态.剧本模组.stallTurns = 7;
  data.世界.状态.剧本模组.flags['event.s01_05.done'] = true;

  const result = advanceScenarioRuntime(data);
  const runtime = result.saveData.世界.状态.剧本模组;
  assert.equal(runtime.offscreenResolvedEventIds.includes('lyg.event.s01_05'), true);
  assert.equal(runtime.completedEventIds.includes('lyg.event.s01_05'), false);
  assert.equal(runtime.actorEngine.entitlements.length, 0);
  assert.equal(runtime.actorEngine.receipts[0].outcome, 'offscreen');
  assert.match(runtime.actorEngine.receipts[0].detail, /未伪记为玩家亲历/);
  const worldEntry = runtime.chronicle.find(item => item.type === 'world');
  assert.match(worldEntry.detail, /董卓已经拥立定陶王为帝/);
  assert.doesNotMatch(worldEntry.detail, /到昭阳宫参与/);
});

test('tracked s01_05 route remains participant-owned at the stall threshold', async () => {
  const { advanceScenarioRuntime, trackStoryOpportunity } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const raw = JSON.parse(await readFile(stageUrl, 'utf8'));
  let data = save();
  data.世界.状态.剧本模组 = {
    modId: raw.manifest.id,
    currentChapterId: 'lyg.chapter.s01',
    chapters: structuredClone(raw.scenario.chapters),
    events: structuredClone(raw.scenario.events),
    flags: { ...raw.scenario.initialFlags },
    activeEventIds: ['lyg.event.s01_05'],
    completedEventIds: ['lyg.event.s01_01', 'lyg.event.s01_02', 'lyg.event.s01_03', 'lyg.event.s01_04'],
    completedChapterIds: [],
    offscreenResolvedEventIds: [],
    stallTurns: 6,
    worldTurn: 9,
    nextStageId: raw.manifest.nextStageId,
  };
  data = advanceScenarioRuntime(data).saveData;
  assert.equal(trackStoryOpportunity(data, 'opportunity.lyg.s01_05.first_edict').ok, true);
  data.世界.状态.剧本模组.stallTurns = 7;
  data.世界.状态.剧本模组.flags['event.s01_05.done'] = true;
  const settled = advanceScenarioRuntime(data).saveData.世界.状态.剧本模组;
  assert.equal(settled.completedEventIds.includes('lyg.event.s01_05'), true);
  assert.equal(settled.offscreenResolvedEventIds.includes('lyg.event.s01_05'), false);
  assert.equal(settled.actorEngine.entitlements.some(item => item.key === 'permission.lyg.jia_wenhe.exchange_judgement'), true);
});

test('story prompt exposes actor signal and tracked opportunity without changing the canon result', async () => {
  const { advanceScenarioRuntime, trackStoryOpportunity } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const initialized = advanceScenarioRuntime(save()).saveData;
  trackStoryOpportunity(initialized, 'opportunity.demo.edict');
  const prompt = buildScenarioStoryPrompt(initialized);

  assert.match(prompt, /世界演员合同·process_only/);
  assert.match(prompt, /宫门开始核印/);
  assert.match(prompt, /玩家已追踪机会·本轮最高优先级/);
  assert.match(prompt, /不得提前授予“可交换判断”/);
  assert.match(prompt, /不得改写“拥立新帝”的既定结果/);
});
