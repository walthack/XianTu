import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const fixtureUrl = new URL('./fixtures/scenario-mod/minimal.json', import.meta.url);

async function loadMod() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  return parseScenarioMod(JSON.parse(await readFile(fixtureUrl, 'utf8')));
}

test('accepts a playable scenario without diagnostics', async () => {
  const { analyzeScenarioMod } = await loadTs('../src/modules/scenarioMods/analyzer.ts');
  const result = analyzeScenarioMod(await loadMod());

  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
});

test('reports flags used by conditions but missing from initialFlags', async () => {
  const { analyzeScenarioMod } = await loadTs('../src/modules/scenarioMods/analyzer.ts');
  const mod = await loadMod();
  mod.scenario.events[0].conditions.push({ path: 'flags.missing', operator: 'eq', value: true });

  const result = analyzeScenarioMod(mod);

  assert.equal(result.valid, false);
  assert.ok(result.issues.some(issue => issue.code === 'uninitialized_flag' && issue.severity === 'error'));
});

test('rejects a non-terminal chapter that cannot complete', async () => {
  const { analyzeScenarioMod } = await loadTs('../src/modules/scenarioMods/analyzer.ts');
  const mod = await loadMod();
  mod.scenario.chapters.push({ id: 'chapter.later', title: '后章', summary: '后续章节。' });

  const result = analyzeScenarioMod(mod);

  assert.equal(result.valid, false);
  assert.ok(result.issues.some(issue => issue.code === 'blocking_chapter_without_completion'));
});

test('warns about orphan and reused events without failing analysis', async () => {
  const { analyzeScenarioMod } = await loadTs('../src/modules/scenarioMods/analyzer.ts');
  const mod = await loadMod();
  mod.scenario.events.push({ id: 'event.orphan', name: '孤立事件', description: '不会进入章节。' });
  mod.scenario.chapters.push({
    id: 'chapter.second',
    title: '第二章',
    summary: '复用事件。',
    eventIds: ['event.firstmeeting'],
  });
  mod.scenario.chapters[0].completion = [{ path: 'flags.chapter.started', operator: 'eq', value: true }];

  const result = analyzeScenarioMod(mod);

  assert.equal(result.valid, true);
  assert.ok(result.issues.some(issue => issue.code === 'orphan_event' && issue.severity === 'warning'));
  assert.ok(result.issues.some(issue => issue.code === 'reused_event' && issue.severity === 'warning'));
});

test('detects unreachable chapters and cyclic completion dependencies', async () => {
  const { analyzeScenarioMod } = await loadTs('../src/modules/scenarioMods/analyzer.ts');
  const mod = await loadMod();
  mod.scenario.initialFlags = { 'a.done': false, 'b.done': false };
  mod.scenario.chapters = [
    {
      id: 'chapter.a',
      title: '甲',
      summary: '等待乙。',
      activation: [{ path: 'flags.b.done', operator: 'eq', value: true }],
      completion: [{ path: 'flags.a.done', operator: 'eq', value: true }],
    },
    {
      id: 'chapter.b',
      title: '乙',
      summary: '等待甲。',
      activation: [{ path: 'flags.a.done', operator: 'eq', value: true }],
      completion: [{ path: 'flags.b.done', operator: 'eq', value: true }],
    },
  ];
  mod.scenario.events = [];

  const result = analyzeScenarioMod(mod);

  assert.equal(result.valid, false);
  assert.ok(result.issues.some(issue => issue.code === 'no_initial_chapter'));
  assert.ok(result.issues.some(issue => issue.code === 'unreachable_chapter'));
  assert.ok(result.issues.some(issue => issue.code === 'chapter_cycle'));
});
