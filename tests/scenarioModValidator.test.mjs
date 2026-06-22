import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const fixtureUrl = new URL('./fixtures/scenario-mod/minimal.json', import.meta.url);

async function loadFixture() {
  return JSON.parse(await readFile(fixtureUrl, 'utf8'));
}

test('accepts the minimum complete Scenario Mod fixture', async () => {
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const fixture = await loadFixture();
  const before = JSON.stringify(fixture);
  const result = validateScenarioMod(fixture);

  assert.equal(result.valid, true, JSON.stringify(result.issues, null, 2));
  assert.equal(result.value.manifest.id, 'liuchao.jiankang');
  assert.equal(JSON.stringify(fixture), before, 'validation must not mutate imported data');
});

test('validates native player and NPC relationship declarations', async () => {
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const raw = await loadFixture();
  raw.canon.playerRelationships[0].favorability = -100;
  raw.canon.relationships[0].score = 100;
  const valid = validateScenarioMod(raw);
  assert.equal(valid.valid, true);

  raw.canon.playerRelationships[0].favorability = 101;
  raw.canon.relationships[0].toCharacterId = 'character.missing';
  const invalid = validateScenarioMod(raw);
  assert.ok(invalid.issues.some(issue => issue.code === 'invalid_score'));
  assert.ok(invalid.issues.some(issue => issue.path.endsWith('.toCharacterId') && issue.code === 'missing_reference'));
});

test('rejects unsupported schemas and versions', async () => {
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const fixture = await loadFixture();
  fixture.schema = 'another.schema';
  fixture.version = 99;

  const result = validateScenarioMod(fixture);
  assert.equal(result.valid, false);
  assert.deepEqual(result.issues.map(issue => issue.code), ['invalid_schema', 'unsupported_version']);
});

test('rejects duplicate IDs across entity collections', async () => {
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const fixture = await loadFixture();
  fixture.content.skills[0].id = fixture.canon.characters[0].id;

  const result = validateScenarioMod(fixture);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some(issue => issue.code === 'duplicate_global_id'));
});

test('reports dangling entity references with their full path', async () => {
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const fixture = await loadFixture();
  fixture.canon.characters[0].locationId = 'location.missing';

  const result = validateScenarioMod(fixture);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some(issue =>
    issue.code === 'missing_reference' && issue.path === 'canon.characters[0].locationId'
  ));
});

test('validates content access identities and content references', async () => {
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const fixture = await loadFixture();
  fixture.rules.contentAccess[0].contentId = 'skill.missing';
  fixture.rules.contentAccess[0].allowedCharacterIds = ['character.missing'];

  const result = validateScenarioMod(fixture);

  assert.equal(result.valid, false);
  assert.ok(result.issues.some(issue => issue.path === 'rules.contentAccess[0].contentId' && issue.code === 'missing_reference'));
  assert.ok(result.issues.some(issue => issue.path === 'rules.contentAccess[0].allowedCharacterIds[0]' && issue.code === 'missing_reference'));
});

test('validates categorized character affiliations and faction references', async () => {
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const fixture = await loadFixture();
  fixture.canon.characters[0].affiliations.push({
    factionId: 'faction.missing',
    category: 'unknown_category',
  });

  const result = validateScenarioMod(fixture);

  assert.equal(result.valid, false);
  assert.ok(result.issues.some(issue => issue.path === 'canon.characters[0].affiliations[1].category' && issue.code === 'invalid_enum'));
  assert.ok(result.issues.some(issue => issue.path === 'canon.characters[0].affiliations[1].factionId' && issue.code === 'missing_reference'));
});

test('exclusive content resolves to one canonical identity including mapped players', async () => {
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const fixture = await loadFixture();
  fixture.scenario.opening.playerCharacterId = 'character.chengzongyang';
  fixture.rules.contentAccess[0].playerAllowed = true;

  const result = validateScenarioMod(fixture);

  assert.equal(result.valid, true, JSON.stringify(result.issues, null, 2));
});

test('rejects exclusive content with multiple allowed identities', async () => {
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const fixture = await loadFixture();
  fixture.rules.contentAccess[0].playerAllowed = true;

  const result = validateScenarioMod(fixture);

  assert.equal(result.valid, false);
  assert.ok(result.issues.some(issue => issue.code === 'invalid_exclusive_holders'));
});

test('rejects unsafe locked paths and condition paths', async () => {
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const fixture = await loadFixture();
  fixture.rules.lockedFields.push('canon.__proto__.name');
  fixture.scenario.events[0].conditions[0].path = 'flags.constructor.enabled';

  const result = validateScenarioMod(fixture);
  assert.equal(result.valid, false);
  assert.equal(result.issues.filter(issue => issue.code === 'invalid_path').length, 2);
});

test('parseScenarioMod throws a useful aggregate error', async () => {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');

  assert.throws(
    () => parseScenarioMod({}),
    error => error instanceof Error && error.message.includes('manifest') && error.message.includes('scenario'),
  );
});

test('validates event completion conditions', async () => {
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const fixture = await loadFixture();
  fixture.scenario.events[0].completion = [{ path: 'flags.done', operator: 'unsupported' }];

  const result = validateScenarioMod(fixture);

  assert.equal(result.valid, false);
  assert.ok(result.issues.some(issue => issue.path === 'scenario.events[0].completion[0].operator'));
});
