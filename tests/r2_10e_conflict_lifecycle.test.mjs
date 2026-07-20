import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stageUrl = new URL(
  '../src/modules/scenarioMods/builtins/data/lyg.dingtao_beijing.json',
  import.meta.url,
);

function coreOf(stage, eventId) {
  return stage.scenario.events.find(event => event.id === eventId).worldActor.decisionCore;
}

test('s01_06 resolves attack against defense once and blocks loser effects', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const {
    applyNpcDecisionActorState,
    applyNpcDecisionEffects,
    decideNpcActions,
  } = await loadTs('../src/modules/scenarioMods/npcDecisionCore.ts');
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const core = coreOf(stage, 'lyg.event.s01_06');
  const round = decideNpcActions(core);
  const guo = round.decisions.find(item => item.actorId === 'liuchao.character.guo_jie');
  const jian = round.decisions.find(item => item.actorId === 'liuchao.character.jian_yu_ji');

  assert.equal(guo.actionId, 'protect_principal');
  assert.equal(jian.actionId, 'sabotage_agenda');
  assert.equal(guo.outcome, 'succeeded');
  assert.equal(jian.outcome, 'blocked');
  assert.equal(guo.conflict.domain, 'royal_guard');
  assert.equal(jian.conflict.opponentDecisionId, guo.id);
  assert.equal(guo.conflict.ownStrength > guo.conflict.opponentStrength, true);
  assert.deepEqual(jian.effects, {});
  assert.equal(jian.stateEffects, undefined);

  const situation = applyNpcDecisionEffects(core, core.situation.initialValues, round.decisions);
  assert.deepEqual(situation, {
    royalSafety: 55,
    assailantPressure: 73,
  });
  const actors = applyNpcDecisionActorState(core, core.actors, round.decisions);
  const guoState = actors.find(item => item.characterId === guo.actorId);
  const jianState = actors.find(item => item.characterId === jian.actorId);
  assert.deepEqual(guoState.activeAction, {
    actionId: 'protect_principal',
    remainingTurns: 1,
    score: guo.score,
  });
  assert.equal(jianState.activeAction, undefined);
  assert.equal(jianState.actionCooldowns.sabotage_agenda, 1);
  assert.equal(jianState.knowledge.includes('knowledge.lyg.s01_06.guard_pattern_observed'), false);

  const promptSave = {
    角色: { 位置: { 描述: '洛都宫城' }, 属性: { 声望: 0 } },
    社交: { 关系: {} },
    系统: { 扩展: {}, 历史: { 叙事: [] } },
    世界: { 状态: { 剧本模组: {
      modId: stage.manifest.id,
      currentChapterId: 'lyg.chapter.dingtao_beijing',
      chapters: structuredClone(stage.scenario.chapters),
      events: structuredClone(stage.scenario.events),
      activeEventIds: ['lyg.event.s01_06'],
      completedEventIds: [],
      completedChapterIds: [],
      flags: {},
      actorEngine: {
        anchorEventId: 'lyg.event.s01_06',
        decisions: round.decisions,
        visibleDecisionIds: [guo.id],
        entitlements: [],
      },
      canon: structuredClone(stage.canon),
    } } },
  };
  const prompt = buildScenarioStoryPrompt(promptSave);
  assert.match(prompt, /对手=未公开反制/);
  assert.doesNotMatch(prompt, new RegExp(jian.id.replaceAll('.', '\\.')));
});

test('duration three advances started → continuing → completed and applies effects only once', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const {
    applyNpcDecisionActorState,
    applyNpcDecisionEffects,
    decideNpcActions,
  } = await loadTs('../src/modules/scenarioMods/npcDecisionCore.ts');
  const core = structuredClone(coreOf(stage, 'lyg.event.s01_05'));
  core.actionBindings.find(item =>
    item.actionId === 'secure_palace_access'
    && item.actorIds.includes('liuchao.character.dong_zhuo')).durationTurns = 3;

  const first = decideNpcActions(core);
  assert.equal(first.decisions[0].phase, 'started');
  let situation = applyNpcDecisionEffects(core, core.situation.initialValues, first.decisions);
  let actors = applyNpcDecisionActorState(core, core.actors, first.decisions);
  const afterFirst = structuredClone(situation);
  assert.equal(actors[0].activeAction.remainingTurns, 2);

  const second = decideNpcActions(core, situation, JSON.parse(JSON.stringify(actors)));
  assert.equal(second.decisions[0].phase, 'continuing');
  assert.deepEqual(second.decisions[0].effects, {});
  situation = applyNpcDecisionEffects(core, situation, second.decisions);
  actors = applyNpcDecisionActorState(core, actors, second.decisions);
  assert.deepEqual(situation, afterFirst, 'continuation must not reapply start effects');
  assert.equal(actors[0].activeAction.remainingTurns, 1);

  const third = decideNpcActions(core, situation, actors);
  assert.equal(third.decisions[0].phase, 'completed');
  actors = applyNpcDecisionActorState(core, actors, third.decisions);
  assert.equal(actors[0].activeAction, undefined);
  assert.equal(actors[0].actionCooldowns.secure_palace_access, 1);
});

test('a stronger counter interrupts an in-flight action after JSON reload', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const {
    applyNpcDecisionActorState,
    decideNpcActions,
  } = await loadTs('../src/modules/scenarioMods/npcDecisionCore.ts');
  const core = coreOf(stage, 'lyg.event.s01_06');
  const first = decideNpcActions(core);
  let actors = applyNpcDecisionActorState(core, core.actors, first.decisions);
  actors = JSON.parse(JSON.stringify(actors));
  const guo = actors.find(item => item.characterId === 'liuchao.character.guo_jie');
  const jian = actors.find(item => item.characterId === 'liuchao.character.jian_yu_ji');
  guo.activeAction.score = -100;
  jian.actionCooldowns = {};

  const counter = decideNpcActions(core, core.situation.initialValues, actors);
  const guoDecision = counter.decisions.find(item => item.actorId === guo.characterId);
  const jianDecision = counter.decisions.find(item => item.actorId === jian.characterId);
  assert.equal(guoDecision.phase, 'completed');
  assert.equal(guoDecision.outcome, 'blocked');
  assert.equal(jianDecision.actionId, 'sabotage_agenda');
  assert.equal(jianDecision.outcome, 'succeeded');
  const settled = applyNpcDecisionActorState(core, actors, counter.decisions);
  assert.equal(settled.find(item => item.characterId === guo.characterId).activeAction, undefined);
  assert.equal(
    settled.find(item => item.characterId === jian.characterId)
      .knowledge.includes('knowledge.lyg.s01_06.guard_pattern_observed'),
    true,
  );
});

test('conflict configuration is part of deterministic replay and validator rejects invalid contracts', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { decideNpcActions } = await loadTs('../src/modules/scenarioMods/npcDecisionCore.ts');
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const core = coreOf(stage, 'lyg.event.s01_06');
  const first = decideNpcActions(core);
  assert.deepEqual(decideNpcActions(structuredClone(core)), first);
  const changed = structuredClone(core);
  changed.actionBindings[0].interaction.power += 1;
  assert.notEqual(decideNpcActions(changed).inputHash, first.inputHash);

  const invalid = structuredClone(stage);
  coreOf(invalid, 'lyg.event.s01_06').actionBindings[0].interaction.stance = 'observe';
  assert.equal(
    validateScenarioMod(invalid).issues.some(item =>
      item.path.endsWith('interaction.stance') && item.code === 'invalid_enum'),
    true,
  );
});
