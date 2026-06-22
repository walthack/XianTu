import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const fixtureUrl = new URL('./fixtures/scenario-mod/minimal.json', import.meta.url);

async function loadRuntimeMod() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const raw = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  raw.scenario.initialFlags = { phase: 0, met: false, resolved: false };
  raw.scenario.events[0].conditions = [{ path: 'flags.met', operator: 'eq', value: true }];
  raw.scenario.events[0].completion = [{ path: 'flags.resolved', operator: 'eq', value: true }];
  raw.scenario.chapters[0].completion = [{ path: 'flags.phase', operator: 'gte', value: 1 }];
  raw.scenario.chapters.push({
    id: 'chapter.aftermath',
    title: '余波',
    summary: '初会之后，各方开始行动。',
    activation: [{ path: 'flags.phase', operator: 'gte', value: 1 }],
    eventIds: [],
  });
  return parseScenarioMod(raw);
}

async function buildRuntimeSave() {
  const mod = await loadRuntimeMod();
  const {
    applyStrictScenarioInitializationToSave,
    buildStrictScenarioInitialization,
  } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const initialization = buildStrictScenarioInitialization(mod, '2026-06-22T00:00:00.000Z');
  return applyStrictScenarioInitializationToSave({
    角色: { 位置: { 描述: '旧地点' } },
    世界: { 信息: {}, 状态: {} },
    系统: { 扩展: {} },
  }, initialization);
}

test('runtime activates, completes, and advances scenario content deterministically', async () => {
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = await buildRuntimeSave();
  const runtime = save.世界.状态.剧本模组;

  assert.equal(runtime.currentChapterId, 'chapter.arrival');
  assert.equal(runtime.chapters.length, 2);
  assert.deepEqual(runtime.activeEventIds, []);

  runtime.flags.met = true;
  const activated = advanceScenarioRuntime(save);
  assert.deepEqual(activated.transitions, [{ type: 'event_activated', id: 'event.firstmeeting' }]);
  assert.deepEqual(activated.saveData.世界.状态.剧本模组.activeEventIds, ['event.firstmeeting']);

  activated.saveData.世界.状态.剧本模组.flags.resolved = true;
  activated.saveData.世界.状态.剧本模组.flags.phase = 1;
  const advanced = advanceScenarioRuntime(activated.saveData);
  const nextRuntime = advanced.saveData.世界.状态.剧本模组;

  assert.deepEqual(advanced.transitions, [
    { type: 'event_completed', id: 'event.firstmeeting' },
    { type: 'chapter_completed', id: 'chapter.arrival' },
    { type: 'chapter_activated', id: 'chapter.aftermath' },
  ]);
  assert.equal(nextRuntime.currentChapterId, 'chapter.aftermath');
  assert.deepEqual(nextRuntime.completedChapterIds, ['chapter.arrival']);
  assert.deepEqual(nextRuntime.completedEventIds, ['event.firstmeeting']);
  assert.deepEqual(nextRuntime.activeEventIds, []);

  const reloaded = JSON.parse(JSON.stringify(advanced.saveData));
  assert.equal(reloaded.世界.状态.剧本模组.currentChapterId, 'chapter.aftermath');
});

test('condition evaluator supports flat dotted flags and save paths', async () => {
  const { evaluateScenarioCondition } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const runtime = {
    flags: { 'chapter.started': true, score: 3 },
    chapters: [], events: [], completedChapterIds: [], activeEventIds: [], completedEventIds: [], currentChapterId: null,
  };
  const save = { 角色: { 身份: { 名字: '沈默' } } };

  assert.equal(evaluateScenarioCondition({ path: 'flags.chapter.started', operator: 'eq', value: true }, save, runtime), true);
  assert.equal(evaluateScenarioCondition({ path: 'flags.score', operator: 'gt', value: 2 }, save, runtime), true);
  assert.equal(evaluateScenarioCondition({ path: '角色.身份.名字', operator: 'includes', value: '沈' }, save, runtime), true);
  assert.equal(evaluateScenarioCondition({ path: '角色.身份.名字', operator: 'exists' }, save, runtime), true);
});

test('canon guard permits only set commands below runtime flags', async () => {
  const { guardScenarioModCommands } = await loadTs('../src/modules/scenarioMods/canonGuard.ts');
  const save = await buildRuntimeSave();
  const allowed = { action: 'set', key: '世界.状态.剧本模组.flags.met', value: true };
  const rejected = [
    { action: 'add', key: '世界.状态.剧本模组.flags.phase', value: 1 },
    { action: 'set', key: '世界.状态.剧本模组.flags', value: {} },
    { action: 'set', key: '世界.状态.剧本模组.currentChapterId', value: 'chapter.aftermath' },
  ];

  const result = guardScenarioModCommands(save, [allowed, ...rejected]);
  assert.deepEqual(result.accepted, [allowed]);
  assert.equal(result.rejected.length, 3);
});
