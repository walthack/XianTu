import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createPinia, setActivePinia } from 'pinia';

import { loadTs } from './loadTs.mjs';

test('scenario creation preset replaces generic character creation selections', async () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
    clear: () => storage.clear(),
  };
  setActivePinia(createPinia());
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const { useCharacterCreationStore } = await loadTs('../src/stores/characterCreationStore.ts');
  const mod = parseScenarioMod(JSON.parse(await readFile(new URL('../mod-kit/lcq-act1-arrival.json', import.meta.url), 'utf8')));
  const store = useCharacterCreationStore();

  store.selectScenarioMod(mod);

  assert.equal(store.characterPayload.character_name, '程宗扬');
  assert.equal(store.characterPayload.current_age, 20);
  assert.equal(store.selectedTalentTier.name, '异世来客');
  assert.equal(store.selectedOrigin.name, '现代来客');
  assert.equal(store.selectedSpiritRoot.name, '生死根');
  assert.deepEqual(store.selectedTalents.map(talent => talent.name), ['务实机敏', '现代思维']);
  assert.deepEqual(store.attributes, {
    root_bone: 5,
    spirituality: 4,
    comprehension: 6,
    fortune: 6,
    charm: 5,
    temperament: 6,
  });
  assert.equal(store.remainingTalentPoints, 0, 'canonical presets bypass the generic point budget');

  store.setAttribute('root_bone', 10);
  assert.equal(store.attributes.root_bone, 5, 'locked preset attributes cannot be changed');
});
