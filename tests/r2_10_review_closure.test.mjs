import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stageUrl = new URL(
  '../src/modules/scenarioMods/builtins/data/lyg.dingtao_beijing.json',
  import.meta.url,
);

function receipt(id, actorId, actionId, score) {
  return {
    id,
    actorId,
    actionId,
    label: actionId,
    reason: 'test',
    knownFactIds: [],
    knownFacts: [],
    attitudes: [],
    memories: [],
    mustNotInvent: [],
    visibleSignal: '',
    offscreenAction: '',
    visibility: 'public',
    durationTurns: 1,
    phase: 'instant',
    outcome: 'unopposed',
    score,
    candidates: [],
    effects: { pressure: 1 },
  };
}

test('validator enforces -100..100 attitudes and scoring clamps hostile legacy input', async () => {
  const stage = JSON.parse(await readFile(stageUrl, 'utf8'));
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const { decideNpcActions } = await loadTs('../src/modules/scenarioMods/npcDecisionCore.ts');
  const invalid = structuredClone(stage);
  const core = invalid.scenario.events.find(event => event.id === 'lyg.event.s01_08').worldActor.decisionCore;
  const actor = core.actors[0];
  actor.relationships['liuchao.character.cheng_zongyang'].trust = 1000;
  core.actionBindings[0].relationshipRequirements ||= [];
  core.actionBindings[0].relationshipRequirements.push({
    targetCharacterId: 'liuchao.character.cheng_zongyang',
    dimension: 'trust',
    min: -101,
  });
  core.actionBindings[0].stateEffects.relationships[0].deltas.trust = 101;
  const issues = validateScenarioMod(invalid).issues;
  assert.equal(issues.filter(issue => issue.code === 'invalid_range' && /trust|min/.test(issue.path)).length >= 3, true);

  const legacy = structuredClone(core);
  legacy.actionBindings[0].relationshipRequirements = [];
  legacy.actionBindings[0].stateEffects.relationships[0].deltas.trust = 1;
  const round = decideNpcActions(legacy);
  assert.equal(round.decisions[0].attitudes[0].value, 100);
  const normalized = structuredClone(legacy);
  normalized.actors[0].relationships['liuchao.character.cheng_zongyang'].trust = 100;
  assert.equal(decideNpcActions(normalized).decisions[0].score, round.decisions[0].score);
});

test('a blocked decision exits multi-party conflict and cannot block a third actor', async () => {
  const { resolveNpcActionConflicts } = await loadTs('../src/modules/scenarioMods/npcDecisionCore.ts');
  const core = {
    actionBindings: [
      { actionId: 'sabotage_agenda', actorIds: ['actor.a'], interaction: { domain: 'shared', stance: 'advance' } },
      { actionId: 'protect_principal', actorIds: ['actor.b'], interaction: { domain: 'shared', stance: 'defend' } },
      { actionId: 'block_road', actorIds: ['actor.c'], interaction: { domain: 'shared', stance: 'defend' } },
    ],
  };
  const decisions = [
    receipt('decision.a', 'actor.a', 'sabotage_agenda', 15),
    receipt('decision.b', 'actor.b', 'protect_principal', 20),
    receipt('decision.c', 'actor.c', 'block_road', 10),
  ];
  const resolved = resolveNpcActionConflicts(core, decisions);
  assert.equal(resolved.find(item => item.actorId === 'actor.a').outcome, 'blocked');
  assert.equal(resolved.find(item => item.actorId === 'actor.b').outcome, 'succeeded');
  assert.equal(resolved.find(item => item.actorId === 'actor.c').outcome, 'unopposed');
  assert.equal(resolved.find(item => item.actorId === 'actor.c').conflict, undefined);
});

test('relationship insertion order cannot change output under the same input hash', async () => {
  const { decideNpcActions } = await loadTs('../src/modules/scenarioMods/npcDecisionCore.ts');
  const actor = relationships => ({
    characterId: 'actor.audit',
    identity: { factionId: 'faction.audit', rank: 1 },
    personality: {},
    motives: {},
    resources: { influence: 2, wealth: 2, troops: 2, intelligence: 2 },
    relationships,
    knowledge: [],
    agendas: [],
    allowedActionIds: ['call_in_obligation'],
    evidence: {},
  });
  const core = relationships => ({
    situation: { whitelist: ['pressure'], initialValues: { pressure: 0 } },
    canonPolicy: { invariant: [], forbiddenBefore: [], processFreedom: [] },
    actors: [actor(relationships)],
    actionBindings: [{
      actionId: 'call_in_obligation',
      actorIds: ['actor.audit'],
      label: 'audit',
      reason: 'audit',
      knownFacts: [],
      mustNotInvent: [],
      visibleSignal: '',
      offscreenAction: '',
      visibility: 'public',
      durationTurns: 1,
    }],
    maxVisibleActions: 1,
  });
  const first = decideNpcActions(core({
    'target.a': { obligation: 100 },
    'target.b': { obligation: -100 },
    'target.c': { obligation: 1 },
  }));
  const reordered = decideNpcActions(core({
    'target.c': { obligation: 1 },
    'target.b': { obligation: -100 },
    'target.a': { obligation: 100 },
  }));
  assert.equal(first.inputHash, reordered.inputHash);
  assert.equal(JSON.stringify(first), JSON.stringify(reordered));
});
