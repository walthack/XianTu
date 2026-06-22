import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const templates = [
  new URL('../mod-kit/templates/strict.template.json', import.meta.url),
  new URL('../mod-kit/templates/expand.template.json', import.meta.url),
];

test('Mod Kit templates remain importable by the application validator', async () => {
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');

  for (const template of templates) {
    const input = JSON.parse(await readFile(template, 'utf8'));
    const result = validateScenarioMod(input);
    assert.equal(result.valid, true, `${template.pathname}: ${JSON.stringify(result.issues, null, 2)}`);
  }
});

test('Mod Kit JSON Schema matches the current contract identity', async () => {
  const schemaUrl = new URL('../mod-kit/schema/xiantu.scenario-mod.v1.schema.json', import.meta.url);
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.properties.schema.const, 'xiantu.scenario-mod');
  assert.equal(schema.properties.version.const, 1);
  assert.deepEqual(schema.$defs.rules.properties.mode.enum, ['strict', 'expand']);
  assert.ok(schema.$defs.rules.properties.contentAccess);
  assert.deepEqual(schema.$defs.contentAccessRule.properties.policy.enum, ['restricted', 'exclusive']);
  assert.ok(schema.$defs.opening.properties.playerCharacterId);
  assert.deepEqual(schema.$defs.characterAffiliation.properties.category.enum, ['sect', 'military', 'state', 'clan', 'organization']);
  assert.ok(schema.$defs.event.properties.completion);
});
