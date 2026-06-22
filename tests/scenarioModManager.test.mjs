import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const fixtureUrl = new URL('./fixtures/scenario-mod/minimal.json', import.meta.url);

async function fixtureText() {
  return readFile(fixtureUrl, 'utf8');
}

function memoryStorage(initial = null) {
  let value = initial;
  return {
    adapter: {
      async load() {
        return value ? structuredClone(value) : null;
      },
      async save(next) {
        value = structuredClone(next);
      },
    },
    read() {
      return value;
    },
  };
}

test('imports, lists and retrieves a Scenario Mod', async () => {
  const { ScenarioModManager } = await loadTs('../src/modules/scenarioMods/manager.ts');
  const storage = memoryStorage();
  const manager = new ScenarioModManager(storage.adapter, () => '2026-06-22T00:00:00.000Z');

  const imported = await manager.importText(await fixtureText());
  const listed = await manager.list();
  const found = await manager.get('liuchao.jiankang');

  assert.equal(imported.enabled, true);
  assert.equal(imported.importedAt, '2026-06-22T00:00:00.000Z');
  assert.equal(listed.length, 1);
  assert.equal(found.mod.manifest.name, '六朝·建康风云');
});

test('re-import replaces the same Mod while preserving enabled state', async () => {
  const { ScenarioModManager } = await loadTs('../src/modules/scenarioMods/manager.ts');
  const storage = memoryStorage();
  let timestamp = 0;
  const manager = new ScenarioModManager(storage.adapter, () => `time-${timestamp++}`);

  await manager.importText(await fixtureText());
  await manager.setEnabled('liuchao.jiankang', false);
  const raw = JSON.parse(await fixtureText());
  raw.manifest.version = '1.1.0';
  await manager.importText(JSON.stringify(raw));

  const listed = await manager.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].enabled, false);
  assert.equal(listed[0].mod.manifest.version, '1.1.0');
});

test('reviews warnings before import and identifies replacements', async () => {
  const { ScenarioModManager } = await loadTs('../src/modules/scenarioMods/manager.ts');
  const storage = memoryStorage();
  const manager = new ScenarioModManager(storage.adapter);
  await manager.importText(await fixtureText());
  const raw = JSON.parse(await fixtureText());
  raw.manifest.version = '1.1.0';
  raw.scenario.events.push({ id: 'event.orphan', name: '孤立事件', description: '未归属章节。' });

  const review = await manager.reviewText(JSON.stringify(raw));

  assert.equal(review.canImport, true);
  assert.equal(review.existing.mod.manifest.version, '1.0.0');
  assert.equal(review.mod.manifest.version, '1.1.0');
  assert.ok(review.diagnostics.some(issue => issue.code === 'orphan_event' && issue.severity === 'warning'));

  const imported = await manager.importReviewed(review);
  assert.equal(imported.mod.manifest.version, '1.1.0');
  assert.equal(imported.enabled, true);
});

test('imports a reviewed Mod passed through reactive proxy state', async () => {
  const { ScenarioModManager } = await loadTs('../src/modules/scenarioMods/manager.ts');
  const storage = memoryStorage();
  const manager = new ScenarioModManager(storage.adapter);
  const review = await manager.reviewText(await fixtureText());
  const reactiveReview = new Proxy(review, {});
  reactiveReview.mod = new Proxy(review.mod, {});

  const imported = await manager.importReviewed(reactiveReview);

  assert.equal(imported.mod.manifest.id, 'liuchao.jiankang');
  assert.equal((await manager.list()).length, 1);
});

test('review blocks static playability errors without persistence', async () => {
  const { ScenarioModManager } = await loadTs('../src/modules/scenarioMods/manager.ts');
  const storage = memoryStorage();
  const manager = new ScenarioModManager(storage.adapter);
  const raw = JSON.parse(await fixtureText());
  raw.scenario.events[0].conditions.push({ path: 'flags.missing', operator: 'eq', value: true });

  const review = await manager.reviewText(JSON.stringify(raw));

  assert.equal(review.canImport, false);
  assert.ok(review.diagnostics.some(issue => issue.code === 'uninitialized_flag'));
  await assert.rejects(() => manager.importReviewed(review), /Invalid Scenario Mod/);
  assert.equal(storage.read(), null);
});

test('invalid JSON and invalid Mod contracts are rejected without persistence', async () => {
  const { ScenarioModManager } = await loadTs('../src/modules/scenarioMods/manager.ts');
  const storage = memoryStorage();
  const manager = new ScenarioModManager(storage.adapter);

  await assert.rejects(() => manager.importText('{'), /有效 JSON/);
  await assert.rejects(() => manager.importText('{}'), /Invalid Scenario Mod/);
  assert.equal(storage.read(), null);
});

test('exports canonical JSON and removes stored Mods', async () => {
  const { ScenarioModManager } = await loadTs('../src/modules/scenarioMods/manager.ts');
  const storage = memoryStorage();
  const manager = new ScenarioModManager(storage.adapter);

  await manager.importText(await fixtureText());
  const exported = JSON.parse(await manager.exportText('liuchao.jiankang'));
  assert.equal(exported.schema, 'xiantu.scenario-mod');
  assert.equal(await manager.remove('liuchao.jiankang'), true);
  assert.equal(await manager.remove('liuchao.jiankang'), false);
  assert.deepEqual(await manager.list(), []);
});
