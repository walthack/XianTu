import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './loadTs.mjs';
import {
  COPY_FIELDS, auditBuiltinCharacterReferences, classifyInlineCopies, loadBuiltinStages,
} from '../scripts/character-inline-copies.mjs';

const { resolveScenarioCharacters } = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
const stages = loadBuiltinStages();

test('builtins carry no hand-written character fields that disagree with the master table', () => {
  const { copies, diverged } = auditBuiltinCharacterReferences(stages);
  assert.deepEqual(diverged, []);
  assert.ok(copies.length > 0, 'expected registry-backed inline copies to exist');
});

test('a hand-written inline value that the master table overrides is flagged; table-silent characters are not', () => {
  const mod = structuredClone(stages.find(m => m.manifest.id === 'lcq.stage_02'));
  const { copies } = classifyInlineCopies(mod);
  const target = copies[0];
  const character = mod.canon.characters.find(c => c.id === target.id);

  character.profile.personality = ['手写出来的另一套性格'];
  const flagged = classifyInlineCopies(mod).diverged.find(d => d.id === target.id);
  assert.ok(flagged, 'hand-written divergence must be reported');
  assert.deepEqual(flagged.supplied, target.supplied);

  mod.canon.characters.push({ id: 'fixture.not_in_registry', name: '总表里没有的人', profile: { personality: ['手写即唯一来源'] } });
  assert.equal(classifyInlineCopies(mod).diverged.some(d => d.id === 'fixture.not_in_registry'), false);
});

test('dropping every inline copy leaves the resolved characters of all builtin stages unchanged', () => {
  let dropped = 0;
  for (const mod of stages) {
    const stageId = mod.manifest.id;
    const { copies } = classifyInlineCopies(mod);
    dropped += copies.length;
    const slim = structuredClone(mod.canon?.characters || []);
    for (const copy of copies) {
      COPY_FIELDS.find(f => f.path === copy.field).remove(slim.find(c => c.id === copy.id));
    }
    const full = structuredClone(mod.canon?.characters || []);
    resolveScenarioCharacters(full, stageId);
    resolveScenarioCharacters(slim, stageId);
    assert.deepEqual(slim, full, stageId);
  }
  assert.ok(dropped > 0);
});
