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
