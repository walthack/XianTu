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

test('local and offscreen-critical actors wake on different deterministic budgets', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { applyNpcDecisionActorState, decideNpcActions } =
    await loadTs('../src/modules/scenarioMods/npcDecisionCore.ts');
  const core = coreOf(stage, 'lyg.event.s01_06');
  const context = {
    round: 0,
    presentCharacterIds: ['liuchao.character.guo_jie'],
    affectedFactionIds: ['liuchao.faction.wu_zong'],
    majorEvent: true,
  };
  const opening = decideNpcActions(core, core.situation.initialValues, core.actors, context);
  assert.deepEqual(opening.wakeAudit.map(item => [item.actorId, item.awake, item.reason]), [
    ['liuchao.character.guo_jie', true, 'local_presence'],
    ['liuchao.character.jian_yu_ji', true, 'offscreen_major_event'],
  ]);

  const actors = applyNpcDecisionActorState(core, core.actors, opening.decisions);
  const next = decideNpcActions(core, core.situation.initialValues, actors, {
    ...context,
    round: 1,
    majorEvent: false,
  });
  assert.equal(next.wakeAudit[0].reason, 'active_action');
  assert.deepEqual(next.wakeAudit[1], {
    actorId: 'liuchao.character.jian_yu_ji',
    awake: false,
    reason: 'sleeping',
  });
  assert.deepEqual(next.decisions.map(item => item.actorId), ['liuchao.character.guo_jie']);
});

test('faction cadence, minor relevance, and group budgets are explicit', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { decideNpcActions, evaluateNpcWake } =
    await loadTs('../src/modules/scenarioMods/npcDecisionCore.ts');
  const core = coreOf(stage, 'lyg.event.s01_07');
  const base = {
    presentCharacterIds: ['liuchao.character.dong_zhuo'],
    affectedFactionIds: ['liuchao.faction.liangzhou_army'],
  };
  const sleeping = decideNpcActions(core, core.situation.initialValues, core.actors, { ...base, round: 1 });
  assert.equal(sleeping.wakeAudit.find(item => /jia_wenhe/.test(item.actorId)).awake, false);
  const cadence = decideNpcActions(core, core.situation.initialValues, core.actors, { ...base, round: 3 });
  assert.equal(cadence.wakeAudit.find(item => /jia_wenhe/.test(item.actorId)).reason, 'faction_cadence');
  assert.notEqual(cadence.inputHash, sleeping.inputHash);

  const prototype = structuredClone(core.actors[0]);
  prototype.wake = { tier: 'minor', factionIds: ['liuchao.faction.liangzhou_army'] };
  assert.equal(evaluateNpcWake(prototype, { round: 1, namedCharacterIds: [prototype.characterId] }).reason, 'minor_named');
  assert.equal(evaluateNpcWake(prototype, { round: 1, affectedFactionIds: ['liuchao.faction.liangzhou_army'] }).reason, 'minor_faction');
  prototype.wake = { tier: 'group', cadenceTurns: 3, factionIds: ['liuchao.faction.liangzhou_army'] };
  assert.equal(evaluateNpcWake(prototype, { round: 2, affectedFactionIds: ['liuchao.faction.liangzhou_army'] }).awake, false);
  assert.equal(evaluateNpcWake(prototype, { round: 3, affectedFactionIds: ['liuchao.faction.liangzhou_army'] }).reason, 'group_faction_cadence');
});

test('wake state survives serialization and legacy cores remain always awake', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { applyNpcDecisionActorState, decideNpcActions } =
    await loadTs('../src/modules/scenarioMods/npcDecisionCore.ts');
  const core = coreOf(stage, 'lyg.event.s01_06');
  const first = decideNpcActions(core);
  assert.equal(first.wakeAudit.every(item => item.reason === 'no_context'), true);
  const actors = applyNpcDecisionActorState(core, core.actors, first.decisions);
  const restored = JSON.parse(JSON.stringify(actors));
  const next = decideNpcActions(core, core.situation.initialValues, restored, {
    round: 1,
    presentCharacterIds: [],
    affectedFactionIds: [],
  });
  assert.equal(next.wakeAudit.find(item => /guo_jie/.test(item.actorId)).reason, 'active_action');
});

test('validator rejects invalid wake cadence and references', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const invalid = structuredClone(stage);
  const actor = coreOf(invalid, 'lyg.event.s01_07').actors[1];
  actor.wake = {
    tier: 'group',
    cadenceTurns: 1,
    factionIds: ['missing.faction'],
    locationIds: ['missing.location'],
  };
  const issues = validateScenarioMod(invalid).issues;
  assert.equal(issues.some(item => item.path.endsWith('.wake.cadenceTurns') && item.code === 'invalid_range'), true);
  assert.equal(issues.filter(item => item.path.includes('.wake.') && item.code === 'unknown_reference').length, 2);
});
