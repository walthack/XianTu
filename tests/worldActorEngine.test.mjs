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
  const forbiddenTerms = event.worldActor.decisionCore.narrativeGuard.forbiddenTerms;
  assert.equal(forbiddenTerms.includes('黑魔海'), false, 'the organization name is already known to the protagonist');
  assert.equal(forbiddenTerms.includes('盛姬'), true, 'the unrevealed caregiver name remains protected');
});

test('decision-core validator rejects ambiguous bindings, coercive limits, and broken actor references', async () => {
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const source = JSON.parse(await readFile(stageUrl, 'utf8'));
  const coreOf = value => value.scenario.events.find(item => item.id === 'lyg.event.s01_05').worldActor.decisionCore;

  const coercive = structuredClone(source);
  coreOf(coercive).maxVisibleActions = '3';
  assert.equal(validateScenarioMod(coercive).issues.some(item => item.path.endsWith('maxVisibleActions')), true);

  const duplicate = structuredClone(source);
  coreOf(duplicate).actionBindings.push(structuredClone(coreOf(duplicate).actionBindings[0]));
  assert.equal(validateScenarioMod(duplicate).issues.some(item => item.code === 'duplicate_binding'), true);

  const brokenReference = structuredClone(source);
  coreOf(brokenReference).actionBindings[0].actorIds = ['liuchao.character.typo'];
  assert.equal(validateScenarioMod(brokenReference).issues.some(item => item.code === 'unknown_reference'), true);

  const brokenAssociation = structuredClone(source);
  coreOf(brokenAssociation).narrativeGuard.forbiddenAssociations[0].maxDistance = 0;
  assert.equal(
    validateScenarioMod(brokenAssociation).issues.some(item => item.path.endsWith('maxDistance')),
    true,
  );

  const unknownKnowledge = structuredClone(source);
  coreOf(unknownKnowledge).actionBindings[0].requiresKnowledge.push('knowledge.lyg.missing');
  assert.equal(validateScenarioMod(unknownKnowledge).issues.some(item => item.code === 'unknown_knowledge'), true);

  const invalidStateActor = structuredClone(source);
  coreOf(invalidStateActor).actionBindings[0].stateEffects.relationships[0].actorId =
    'liuchao.character.guo_jie';
  assert.equal(
    validateScenarioMod(invalidStateActor).issues.some(item =>
      item.code === 'unknown_reference' && item.path.endsWith('actorId')),
    true,
  );

  const invalidResource = structuredClone(source);
  coreOf(invalidResource).actionBindings[0].stateEffects.resources = { globalPopulation: -1 };
  assert.equal(validateScenarioMod(invalidResource).issues.some(item => item.code === 'unknown_resource'), true);

  const secretProjection = structuredClone(source);
  const secretCore = secretProjection.scenario.events
    .find(item => item.id === 'lyg.event.s01_08').worldActor.decisionCore;
  const secretId = Object.entries(secretCore.knowledgeFacts)
    .find(([, fact]) => fact.access === 'secret')[0];
  secretCore.actionBindings[0].knownFactIds.push(secretId);
  assert.equal(
    validateScenarioMod(secretProjection).issues.some(item => item.code === 'secret_knowledge_exposure'),
    true,
  );
});

test('s01_05 deterministic core derives four distinct actions with explainable scores and hard canon elimination', async () => {
  const {
    NPC_ACTION_LIBRARY,
    applyNpcDecisionActorState,
    applyNpcDecisionEffects,
    applyNpcDecisionEffectsWithAudit,
    decideNpcActions,
    selectVisibleNpcDecisionIds,
  } = await loadTs('../src/modules/scenarioMods/npcDecisionCore.ts');
  const raw = JSON.parse(await readFile(stageUrl, 'utf8'));
  const core = raw.scenario.events.find(item => item.id === 'lyg.event.s01_05').worldActor.decisionCore;
  assert.equal(NPC_ACTION_LIBRARY.length >= 30 && NPC_ACTION_LIBRARY.length <= 50, true);

  const first = decideNpcActions(core);
  const replay = decideNpcActions(structuredClone(core), structuredClone(core.situation.initialValues));
  assert.deepEqual(replay, first, 'same situation must replay byte-for-byte');
  const changedBinding = structuredClone(core);
  changedBinding.actionBindings[0].reason += '（修订）';
  assert.notEqual(decideNpcActions(changedBinding).inputHash, first.inputHash, 'binding changes must alter the audit hash');
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
  const tense = decideNpcActions(core, { courtLegitimacy: 42, militaryTension: 100 });
  assert.notEqual(
    tense.decisions[0].candidates.find(item => item.actionId === 'secure_palace_access').score,
    first.decisions[0].candidates.find(item => item.actionId === 'secure_palace_access').score,
    'situation values must participate in utility scoring',
  );
  assert.deepEqual(
    selectVisibleNpcDecisionIds(first.decisions, 3),
    first.decisions.filter(item => item.visibility !== 'hidden').slice(0, 3).map(item => item.id),
  );
  assert.equal(selectVisibleNpcDecisionIds(first.decisions, 4).some(id => /lv_zhi/.test(id)), false);
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
  const nextRound = decideNpcActions(core, changed, actorState);
  assert.equal(nextRound.decisions[0].phase, 'completed');
  assert.equal(nextRound.decisions[0].actionId, 'secure_palace_access');
  const completedState = applyNpcDecisionActorState(core, actorState, nextRound.decisions);
  const followingRound = decideNpcActions(core, changed, completedState);
  assert.equal(
    followingRound.decisions[0].candidates.find(item => item.actionId === 'secure_palace_access').eliminatedReason,
    'cooldown:1',
    'completed multi-turn action must not restart immediately',
  );
  assert.deepEqual(applyNpcDecisionEffects(core, changed, [{
    ...dong, effects: { globalPopulation: -1 },
  }]), changed, 'legacy snapshot effects outside the whitelist degrade by skipping');
  const auditedLegacyEffect = applyNpcDecisionEffectsWithAudit(core, changed, [{
    ...dong, effects: { globalPopulation: -1 },
  }]);
  assert.deepEqual(auditedLegacyEffect.situationValues, changed);
  assert.deepEqual(auditedLegacyEffect.rejectedEffects, [{
    decisionId: dong.id,
    key: 'globalPopulation',
    delta: -1,
    reason: 'effect_not_whitelisted',
  }]);
  assert.equal(
    applyNpcDecisionEffects(core, { courtLegitimacy: 99, militaryTension: 99 }, first.decisions).courtLegitimacy,
    100,
    'situation effects must respect declared bounds',
  );
});

test('NPC decision core has no LLM or network dependency', async () => {
  const source = await readFile(new URL('../src/modules/scenarioMods/npcDecisionCore.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /aiService|tavern|axios|fetch\s*\(/i);
});

test('event timeline separates eligibility, activation, occurrence, public reveal, and player knowledge', async () => {
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  let data = save();
  const runtime = data.世界.状态.剧本模组;
  runtime.activeEventIds = [];
  runtime.events = [{
    id: 'event.e1',
    name: '定时世界事件',
    description: '消息尚未传到玩家处',
    critical: true,
    conditions: [],
    completion: [{ path: 'flags.event.e1.done', operator: 'eq', value: true }],
    timeline: {
      kind: 'canon_anchor',
      notBeforeTurns: 2,
      deadlineTurns: 4,
      reveal: { publicAfterTurns: 2, playerKnowledge: 'public_report' },
    },
    offscreenResolution: {
      id: 'offscreen.demo.timed',
      afterStallTurns: 99,
      flagKey: 'world.demo.timed_resolved',
      resolvedEventIds: ['event.e1'],
      worldDelta: '定时事件已经发生，但消息尚在路上。',
      evidence: '程序时间合同',
    },
  }];
  runtime.chapters = [{
    id: 'chapter.demo',
    title: '时间合同',
    summary: '测试',
    eventIds: ['event.e1'],
  }];
  runtime.flags = { 'event.e1.done': false };
  runtime.steeringCooldown = 20;

  data = advanceScenarioRuntime(data).saveData;
  assert.equal(data.世界.状态.剧本模组.activeEventIds.length, 0, 'notBefore must keep the event dormant');
  data = advanceScenarioRuntime(data).saveData;
  assert.equal(data.世界.状态.剧本模组.activeEventIds.length, 0);
  data = advanceScenarioRuntime(data).saveData;
  assert.deepEqual(data.世界.状态.剧本模组.activeEventIds, ['event.e1']);
  assert.equal(data.世界.状态.剧本模组.eventTimeline['event.e1'].activatedAtTurn, 2);

  data = advanceScenarioRuntime(data).saveData;
  data = advanceScenarioRuntime(data).saveData;
  let timed = data.世界.状态.剧本模组;
  assert.equal(timed.offscreenResolvedEventIds.includes('event.e1'), true, 'deadline must ignore frozen stall');
  assert.equal(timed.eventTimeline['event.e1'].occurredAtTurn, 4);
  assert.equal(timed.eventTimeline['event.e1'].playerLearnedAtTurn, undefined);
  assert.equal(timed.divergences[0].revealed, false);
  assert.doesNotMatch(buildScenarioStoryPrompt(data), /定时事件已经发生/);
  assert.equal((timed.chronicle || []).some(item => /定时事件已经发生/.test(item.detail || '')), false);

  data = advanceScenarioRuntime(data).saveData;
  data = advanceScenarioRuntime(data).saveData;
  timed = data.世界.状态.剧本模组;
  assert.equal(timed.eventTimeline['event.e1'].publiclyRevealedAtTurn, 6);
  assert.equal(timed.eventTimeline['event.e1'].playerLearnedAtTurn, 6);
  assert.equal(timed.divergences[0].revealed, true);
  assert.match(buildScenarioStoryPrompt(data), /定时事件已经发生/);
  assert.equal(timed.chronicle.some(item => /定时事件已经发生/.test(item.detail || '')), true);
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
  assert.match(prompt, /角色主张，绝不等同或写回世界真值/);

  const drifted = structuredClone(advanced);
  drifted.世界.状态.剧本模组.actorEngine.decisionConfigHash = 'legacy-config';
  const migrated = advanceScenarioRuntime(drifted).saveData.世界.状态.剧本模组.actorEngine;
  assert.equal(migrated.configMigrations.at(-1).fromHash, 'legacy-config');
  assert.equal(migrated.configMigrations.at(-1).toHash, migrated.decisionConfigHash);
  assert.equal(migrated.decisionRound, 0, 'config migration must explicitly rebuild from round zero');
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

test('tracking initializes round zero but expires instead of freezing offscreen resolution forever', async () => {
  const {
    advanceScenarioRuntime,
    trackStoryOpportunity,
    TRACKED_OPPORTUNITY_MAX_TURNS,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const raw = JSON.parse(await readFile(stageUrl, 'utf8'));
  const data = save();
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
    stallTurns: 7,
    worldTurn: 9,
    nextStageId: raw.manifest.nextStageId,
  };
  assert.equal(trackStoryOpportunity(data, 'opportunity.lyg.s01_05.first_edict').ok, true);
  const before = data.世界.状态.剧本模组;
  assert.equal(before.actorEngine.decisionRound, 0);
  assert.equal(before.actorEngine.decisions.length, 4, 'tracking must not create a round-0 prompt gap');
  const legacyMissingTurn = structuredClone(data);
  delete legacyMissingTurn.世界.状态.剧本模组.actorEngine.trackedAtTurn;
  const legacySettled = advanceScenarioRuntime(legacyMissingTurn).saveData.世界.状态.剧本模组;
  assert.equal(
    legacySettled.offscreenResolvedEventIds.includes('lyg.event.s01_05'),
    true,
    'legacy tracking without trackedAtTurn must expire instead of freezing forever',
  );
  before.worldTurn = before.actorEngine.trackedAtTurn + TRACKED_OPPORTUNITY_MAX_TURNS + 1;
  const settled = advanceScenarioRuntime(data).saveData.世界.状态.剧本模组;
  assert.equal(settled.offscreenResolvedEventIds.includes('lyg.event.s01_05'), true);
  assert.equal(settled.actorEngine.entitlements.length, 0);
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
