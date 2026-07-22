import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('character registry sourceHash covers materialized entries and stage-derived ids', async () => {
  const registry = JSON.parse(await readFile(
    new URL('../src/modules/scenarioMods/builtins/character-registry.json', import.meta.url),
    'utf8',
  ));
  const expected = createHash('sha256')
    .update(JSON.stringify(registry.characters))
    .digest('hex')
    .slice(0, 16);

  assert.equal(registry.sourceHash, expected);
  assert.match(registry.version, new RegExp(`-${expected}$`));
});
