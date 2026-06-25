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

test('validates faction relationship declarations', async () => {
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const raw = await loadFixture();

  raw.canon.factionRelationships = [
    { fromFactionId: 'faction.taiyi', toFactionId: 'faction.missing', relation: '敌对', score: -40, direction: 'bidirectional' },
  ];
  const missingRef = validateScenarioMod(raw);
  assert.ok(missingRef.issues.some(issue => issue.path.endsWith('.toFactionId') && issue.code === 'missing_reference'));

  raw.canon.factionRelationships = [
    { fromFactionId: 'faction.taiyi', toFactionId: 'faction.taiyi', relation: '中立', score: 0 },
  ];
  assert.ok(validateScenarioMod(raw).issues.some(issue => issue.code === 'self_relationship'));

  raw.canon.factionRelationships = [
    { fromFactionId: 'faction.taiyi', toFactionId: 'faction.taiyi', relation: '中立', score: 200 },
  ];
  assert.ok(validateScenarioMod(raw).issues.some(issue => issue.code === 'invalid_score'));
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

test('rejects invalid canonical creation preset boundaries', async () => {
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const fixture = await loadFixture();
  fixture.scenario.opening.creationPreset = {
    characterName: '程宗扬',
    gender: '男',
    race: '人族',
    age: 0,
    talentTier: { name: '异世来客', description: '现代来客。' },
    origin: { name: '现代来客', description: '来自另一个世界。' },
    spiritRoot: { name: '生死根', description: '唯一异能。', tier: '唯一异能' },
    talents: [],
    attributes: { rootBone: 11, spirituality: 5, comprehension: 5, fortune: 5, charm: 5, temperament: 5 },
  };

  const result = validateScenarioMod(fixture);

  assert.equal(result.valid, false);
  assert.ok(result.issues.some(issue => issue.path === 'scenario.opening.creationPreset.age'));
  assert.ok(result.issues.some(issue => issue.path === 'scenario.opening.creationPreset.talents'));
  assert.ok(result.issues.some(issue => issue.path === 'scenario.opening.creationPreset.attributes.rootBone'));
});

test('rejects scenario map and character profile values outside native boundaries', async () => {
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const fixture = await loadFixture();
  fixture.world.continents[0].bounds = [{ x: 1, y: 1 }, { x: 2, y: 2 }];
  fixture.canon.locations[0].coordinates = { x: 10001, y: 4960 };
  fixture.canon.characters[0].profile.attributes.charm = 11;

  const result = validateScenarioMod(fixture);

  assert.equal(result.valid, false);
  assert.ok(result.issues.some(issue => issue.path === 'world.continents[0].bounds' && issue.code === 'too_few_points'));
  assert.ok(result.issues.some(issue => issue.path === 'canon.locations[0].coordinates.x' && issue.code === 'invalid_number'));
  assert.ok(result.issues.some(issue => issue.path === 'canon.characters[0].profile.attributes.charm' && issue.code === 'invalid_number'));
});
