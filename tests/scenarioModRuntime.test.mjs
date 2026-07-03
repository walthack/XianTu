import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const fixtureUrl = new URL('./fixtures/scenario-mod/minimal.json', import.meta.url);

async function loadRuntimeMod() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const raw = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  raw.scenario.initialFlags = { phase: 0, met: false, resolved: false };
  raw.manifest.nextStageId = 'liuchao.next';
  raw.manifest.nextStageName = '六朝·下一关';
  raw.scenario.events[0].conditions = [{ path: 'flags.met', operator: 'eq', value: true }];
  raw.scenario.events[0].completion = [{ path: 'flags.resolved', operator: 'eq', value: true }];
  raw.scenario.events[0].axisBeat = '玩家与程宗扬完成初会。';
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

test('runtime emits stage_ready once after all key plot events are complete', async () => {
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = await buildRuntimeSave();
  const runtime = save.世界.状态.剧本模组;
  runtime.completedChapterIds = ['chapter.arrival', 'chapter.aftermath'];
  runtime.completedEventIds = ['event.firstmeeting'];
  runtime.currentChapterId = null;
  runtime.activeEventIds = [];
  runtime.flags.phase = 99;

  const ready = advanceScenarioRuntime(save);

  assert.deepEqual(ready.transitions, [{ type: 'stage_ready', id: 'liuchao.next' }]);
  assert.equal(ready.saveData.世界.状态.剧本模组.nextStageReadyId, 'liuchao.next');

  const repeated = advanceScenarioRuntime(ready.saveData);
  assert.deepEqual(repeated.transitions, []);
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

test('nested LLM-written flags and string booleans satisfy conditions (regression: stuck stage_04 save)', async () => {
  const { evaluateScenarioCondition } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const runtime = {
    // initialFlags 扁平陈旧 false + LLM set 出的嵌套 true 并存 → 嵌套(较新)优先
    flags: { 'event.s04_01.done': false, event: { s04_01: { done: true }, s04_07: { done: 'true' } } },
    chapters: [], events: [], completedChapterIds: [], activeEventIds: [], completedEventIds: [], currentChapterId: null,
  };
  const save = {};
  assert.equal(evaluateScenarioCondition({ path: 'flags.event.s04_01.done', operator: 'eq', value: true }, save, runtime), true);
  // 字符串 "true" 也应满足 eq true
  assert.equal(evaluateScenarioCondition({ path: 'flags.event.s04_07.done', operator: 'eq', value: true }, save, runtime), true);
});

test('early-set done flags settle never-activated critical events; stage becomes ready (dead-lock regression)', async () => {
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const mk = i => ({ id: `e${i}`, critical: true, completion: [{ path: `flags.event.e${i}.done`, operator: 'eq', value: true }] });
  const save = { 世界: { 状态: { 剧本模组: {
    currentChapterId: 'c1',
    chapters: [{ id: 'c1', eventIds: ['e1', 'e2'], completion: [{ path: 'flags.event.e2.done', operator: 'eq', value: true }] }],
    events: [mk(1), mk(2)],
    activeEventIds: ['e1'], completedEventIds: [], completedChapterIds: [],
    flags: { 'event.e1.done': false, event: { e1: { done: true }, e2: { done: 'true' } } },
    nextStageId: 'stage2',
  } } } };
  const { saveData } = advanceScenarioRuntime(save);
  const rt = saveData.世界.状态.剧本模组;
  assert.ok(rt.completedEventIds.includes('e1'), 'active event completes via nested flag');
  assert.ok(rt.completedEventIds.includes('e2'), 'never-activated critical event settles via string-true flag');
  assert.equal(rt.nextStageReadyId, 'stage2', 'stage_ready fires');
});

test('canon guard protects core identity fields (gender/race/灵根/出生日期) of canon characters', async () => {
  const { guardScenarioModCommands } = await loadTs('../src/modules/scenarioMods/canonGuard.ts');
  const save = await buildRuntimeSave();
  const rejected = [
    { action: 'set', key: '社交.关系.程宗扬.灵根', value: '风灵根' },
    { action: 'set', key: '社交.关系.程宗扬.性别', value: '女' },
    { action: 'set', key: '社交.关系.程宗扬.出生日期.年', value: 180 },
  ];
  const allowed = { action: 'set', key: '社交.关系.程宗扬.好感度', value: 50 };
  const result = guardScenarioModCommands(save, [...rejected, allowed]);
  assert.equal(result.rejected.length, 3, '灵根/性别/出生日期 应被拒');
  assert.deepEqual(result.accepted, [allowed], '好感度等可变字段放行');
});
