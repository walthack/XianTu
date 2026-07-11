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

test('Canon Rail stage_01 follows source order #9 then #10 and cannot close early', async () => {
  const { advanceScenarioRuntime, getNarrativeAnchorEvent } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const event = (id, axisSeq, done) => ({
    id, name: id, description: id, axisSeq, axisBeat: id,
    completion: [{ path: `flags.event.${id.split('.').at(-1)}.done`, operator: 'eq', value: true }],
  });
  const s06 = event('lcq.event.s01_06', 18);
  const s05 = event('lcq.event.s01_05', 19);
  const ids = ['lcq.event.s01_01', 'lcq.event.s01_02', 'lcq.event.s01_03', 'lcq.event.s01_04', s06.id, s05.id];
  const save = {
    世界: { 状态: { 剧本模组: {
      modId: 'lcq.stage_01',
      chapters: [{ id: 'lcq.chapter.stage_01', eventIds: ids, completion: [{ path: 'flags.event.s01_06.done', operator: 'eq', value: true }] }],
      events: [
        ...ids.slice(0, 4).map((id, index) => event(id, index + 1)), s05, s06,
      ],
      currentChapterId: 'lcq.chapter.stage_01', activeEventIds: [s06.id],
      completedEventIds: ids.slice(0, 4), completedChapterIds: [],
      flags: { 'event.s01_06.done': false, 'event.s01_05.done': false },
    } } },
  };

  assert.equal(getNarrativeAnchorEvent(save.世界.状态.剧本模组).id, s06.id);
  save.世界.状态.剧本模组.flags['event.s01_06.done'] = true;
  const afterNine = advanceScenarioRuntime(save);
  const rt = afterNine.saveData.世界.状态.剧本模组;
  assert.deepEqual(afterNine.transitions, [
    { type: 'event_completed', id: s06.id },
    { type: 'event_activated', id: s05.id },
  ]);
  assert.equal(rt.currentChapterId, 'lcq.chapter.stage_01', '第 #9 节完成不能提前收章');
  assert.equal(getNarrativeAnchorEvent(rt).id, s05.id);

  rt.flags['event.s01_05.done'] = true;
  const afterTen = advanceScenarioRuntime(afterNine.saveData);
  assert.ok(afterTen.transitions.some(t => t.type === 'chapter_completed' && t.id === 'lcq.chapter.stage_01'));
});

test('Canon Rail event contracts are carried into reconciliation candidates', async () => {
  const { buildChainCandidates } = await loadTs('../src/services/eventReconcileService.ts');
  const candidates = buildChainCandidates({
    modId: 'lcq.stage_01',
    events: [{
      id: 'lcq.event.s01_02', name: '段强被射杀', axisSeq: 2, axisBeat: '段强遭半兽人袭击身亡',
      completion: [{ path: 'flags.event.s01_02.done', operator: 'eq', value: true }],
    }],
    completedEventIds: [], flags: { 'event.s01_02.done': false },
  });
  assert.deepEqual(candidates[0].completionEvidence, ['段强', '半兽人', '射杀']);
  assert.match(candidates[0].mustReach, /段强/);
});

test('Canon Rail stage_02 uses the reviewed source order and repaired battle node', async () => {
  const { getCanonRailProfile } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
  const profile = getCanonRailProfile({ modId: 'lcq.stage_02' });
  assert.deepEqual(profile.orderedEventIds, [
    'lcq.event.s02_01', 'lcq.event.s02_03', 'lcq.event.s02_02',
    'lcq.event.s02_04', 'lcq.event.s02_05', 'lcq.event.s02_06',
  ]);
  assert.match(profile.contracts.find(c => c.eventId === 'lcq.event.s02_03').mustReach, /秦军/);
});

test('Canon Rail rejects direct LLM completion flags; reconciliation remains the only route', async () => {
  const { guardScenarioModCommands } = await loadTs('../src/modules/scenarioMods/canonGuard.ts');
  const save = await buildRuntimeSave();
  const runtime = save.世界.状态.剧本模组;
  runtime.modId = 'lcq.stage_01';
  runtime.events[0].id = 's01_01';
  runtime.events[0].completion = [{ path: 'flags.event.s01_01.done', operator: 'eq', value: true }];
  runtime.chapters[0].eventIds = ['s01_01'];
  runtime.activeEventIds = ['s01_01'];
  const result = guardScenarioModCommands(save, [{
    action: 'set', key: '世界.状态.剧本模组.flags.event.s01_01.done', value: true,
  }]);
  assert.equal(result.accepted.length, 0);
  assert.match(result.rejected[0].reason, /事件核验器/);
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

test('canon guard rejects malformed and out-of-sequence scenario event flags', async () => {
  const { guardScenarioModCommands } = await loadTs('../src/modules/scenarioMods/canonGuard.ts');
  const save = await buildRuntimeSave();
  const runtime = save.世界.状态.剧本模组;
  runtime.events.push({
    id: 'event.future',
    name: '后续事件',
    description: '不属于当前章节。',
    completion: [{ path: 'flags.event.event.future.done', operator: 'eq', value: true }],
  });
  runtime.chapters.push({
    id: 'chapter.future',
    title: '后续章',
    summary: '后续章节。',
    eventIds: ['event.future'],
  });

  const currentEventDone = { action: 'set', key: '世界.状态.剧本模组.flags.event.event.firstmeeting.done', value: true };
  const malformedEventFlag = { action: 'set', key: '世界.状态.剧本模组.flags.event.event.firstmeeting', value: true };
  const futureEventDone = { action: 'set', key: '世界.状态.剧本模组.flags.event.event.future.done', value: true };
  const typoEventDone = { action: 'set', key: '世界.状态.剧本模组.flags.event.event.future_future.done', value: true };
  const resetCurrentEvent = { action: 'set', key: '世界.状态.剧本模组.flags.event.event.firstmeeting.done', value: false };

  const result = guardScenarioModCommands(save, [
    currentEventDone,
    malformedEventFlag,
    futureEventDone,
    typoEventDone,
    resetCurrentEvent,
  ]);

  assert.deepEqual(result.accepted, [currentEventDone]);
  assert.deepEqual(result.rejected.map(item => item.command), [
    malformedEventFlag,
    futureEventDone,
    typoEventDone,
    resetCurrentEvent,
  ]);
  assert.ok(result.rejected[0].reason.includes('.done'));
  assert.ok(result.rejected[1].reason.includes('不得越级完成'));
  assert.ok(result.rejected[2].reason.includes('未知剧本事件'));
  assert.ok(result.rejected[3].reason.includes('只能写入 true'));
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

test('completed chapter events deterministically settle its standard chapter flag and activate the next chapter', async () => {
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = { 世界: { 状态: { 剧本模组: {
    currentChapterId: 'c1',
    chapters: [
      { id: 'c1', eventIds: ['e1'], completion: [{ path: 'flags.chapter.c1.done', operator: 'eq', value: true }] },
      { id: 'c2', eventIds: [], activation: [{ path: 'flags.chapter.c1.done', operator: 'eq', value: true }] },
    ],
    events: [{ id: 'e1', completion: [{ path: 'flags.event.e1.done', operator: 'eq', value: true }] }],
    activeEventIds: ['e1'], completedEventIds: [], completedChapterIds: [],
    flags: { 'event.e1.done': true, 'chapter.c1.done': false },
  } } } };
  const { saveData, transitions } = advanceScenarioRuntime(save);
  const runtime = saveData.世界.状态.剧本模组;
  assert.equal(runtime.flags['chapter.c1.done'], true);
  assert.equal(runtime.currentChapterId, 'c2');
  assert.deepEqual(transitions.map(t => t.type), ['event_completed', 'chapter_completed', 'chapter_activated']);
});

test('stage_07 non-critical Qin Hui material event remains data but does not become the mainline anchor', async () => {
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const orphan = 'lcq.event.s07_debut_qinhui';
  const save = { 世界: { 状态: { 剧本模组: {
    modId: 'lcq.stage_07_qingyuan_jiankang', currentChapterId: 'c1',
    chapters: [{ id: 'c1', eventIds: [orphan] }],
    events: [{ id: orphan, completion: [{ path: 'flags.event.s07_debut_qinhui.done', operator: 'eq', value: true }] }],
    activeEventIds: [orphan], completedEventIds: [], completedChapterIds: [], flags: {},
  } } } };
  const { saveData } = advanceScenarioRuntime(save);
  const runtime = saveData.世界.状态.剧本模组;
  assert.equal(runtime.events.length, 1);
  assert.deepEqual(runtime.chapters[0].eventIds, [orphan]);
  assert.deepEqual(runtime.activeEventIds, [orphan]);
});

test('legacy chapter with only active non-critical material auto-advances after its critical chain was already completed', async () => {
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const critical = id => ({ id, critical: true, completion: [{ path: `flags.${id}.done`, operator: 'eq', value: true }] });
  const material = { id: 'qinhui', critical: false, completion: [{ path: 'flags.qinhui.done', operator: 'eq', value: true }] };
  const save = { 世界: { 状态: { 剧本模组: {
    currentChapterId: 'qingyuan',
    chapters: [
      { id: 'qingyuan', eventIds: ['e1', 'e2', 'qinhui'], completion: [{ path: 'flags.chapter.qingyuan.done', operator: 'eq', value: true }] },
      { id: 'jiankang', eventIds: [], activation: [{ path: 'flags.chapter.qingyuan.done', operator: 'eq', value: true }] },
    ],
    events: [critical('e1'), critical('e2'), material],
    activeEventIds: ['qinhui'], completedEventIds: ['e1', 'e2'], completedChapterIds: [],
    flags: { 'e1.done': true, 'e2.done': true, 'qinhui.done': false, 'chapter.qingyuan.done': false },
  } } } };
  const { saveData } = advanceScenarioRuntime(save);
  const runtime = saveData.世界.状态.剧本模组;
  assert.equal(runtime.currentChapterId, 'jiankang');
  assert.equal(runtime.flags['chapter.qingyuan.done'], true);
  assert.ok(!runtime.activeEventIds.includes('qinhui'));
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

test('canon guard rejects deleting a canon character from the roster', async () => {
  const { guardScenarioModCommands } = await loadTs('../src/modules/scenarioMods/canonGuard.ts');
  const save = await buildRuntimeSave();
  const result = guardScenarioModCommands(save, [
    { action: 'delete', key: '社交.关系.程宗扬' },
    { action: 'delete', key: '社交.关系.程宗扬.记忆.0' }, // 删子字段(如一条记忆)不拦
  ]);
  assert.equal(result.rejected.length, 1);
  assert.match(result.rejected[0].reason, /正典人物不可删除/);
  assert.equal(result.accepted.length, 1);
});

test('global alias identity guard recalls 青骓 as 崔茂 and removes person-to-weapon narration', async () => {
  const { findRegistryIdentitiesByContext, stripNarrativeEntityTypeConflicts } = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
  const identities = findRegistryIdentitiesByContext('星月湖八骏正在议事');
  assert.ok(identities.some(item => item.canonicalName === '崔茂' && item.aliases.includes('青骓')));
  const guarded = stripNarrativeEntityTypeConflicts('青骓乃岳帅佩剑。程宗扬转身离开。');
  assert.equal(guarded.text, '程宗扬转身离开。');
  assert.match(guarded.conflicts[0], /青骓/);
});

test('timeline guard prevents NPC memory from naming an unintroduced canonical character', async () => {
  const { stripNarrativeUnintroducedCharacters } = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
  const guarded = stripNarrativeUnintroducedCharacters('小紫忽然提起潘金莲的旧事。她望向窗外。', ['小紫']);
  assert.equal(guarded.text, '她望向窗外。');
  assert.match(guarded.conflicts[0], /潘金莲/);
});

test('narrative canon guards keep alias-named allies and ordinary martial sentences intact', async () => {
  const { stripNarrativeEntityTypeConflicts, stripNarrativeUnintroducedCharacters } = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
  assert.equal(stripNarrativeEntityTypeConflicts('青骓为他牵来一匹战马。').text, '青骓为他牵来一匹战马。');
  assert.equal(stripNarrativeEntityTypeConflicts('崔茂作势要拔出腰间佩剑。').text, '崔茂作势要拔出腰间佩剑。');
  const guarded = stripNarrativeUnintroducedCharacters('碧奴开口。那贱婢竟敢。龙神般威武。潘金莲来了。', ['碧奴']);
  assert.equal(guarded.text, '碧奴开口。那贱婢竟敢。龙神般威武。');
});

test('milestone rewards grant titles on stage_ready at story-correct stage; AI cannot self-grant', async () => {
  const { applyMilestoneRewards, formatEarnedTitles } = await loadTs('../src/modules/scenarioMods/milestoneRewards.ts');
  const { guardScenarioModCommands } = await loadTs('../src/modules/scenarioMods/canonGuard.ts');
  const save = { 角色: { 身份: {} }, 世界: { 状态: { 剧本模组: { modId: 'lyl.luoyang_coup', flags: {} } } } };

  // 非 stage_ready 不授
  assert.equal(applyMilestoneRewards(save, [{ type: 'event_completed', id: 'x' }]).length, 0);
  // stage_ready(封侯关) → 授予 舞阳侯，幂等
  const granted = applyMilestoneRewards(save, [{ type: 'stage_ready', id: 'lyl.han_palace_endgame' }]);
  assert.equal(granted.length, 1);
  assert.deepEqual(save.角色.身份.称号, ['汉国舞阳侯']);
  assert.equal(applyMilestoneRewards(save, [{ type: 'stage_ready', id: 'x' }]).length, 0, '幂等');
  assert.match(formatEarnedTitles(save), /汉国舞阳侯/);
  // 无称号时不渲染
  assert.equal(formatEarnedTitles({ 角色: { 身份: {} } }), '');

  // AI 不能自封：set 角色.身份.称号 被 canonGuard 拒
  const guardSave = await buildRuntimeSave();
  const result = guardScenarioModCommands(guardSave, [
    { action: 'set', key: '角色.身份.称号', value: ['伪帝'] },
    { action: 'add', key: '角色.身份.称号.0', value: '伪帝' },
  ]);
  assert.equal(result.rejected.length, 2, '称号路径受保护');
});

test('milestone rewards revoke transient titles at story-correct point (买官→政变作废)', async () => {
  const { applyMilestoneRewards } = await loadTs('../src/modules/scenarioMods/milestoneRewards.ts');
  const save = { 角色: { 身份: {} }, 世界: { 状态: { 剧本模组: { modId: 'lyl.luoyang_cloud_secret', flags: {} } } } };
  // 天石关完成 → 买官全套到手
  applyMilestoneRewards(save, [{ type: 'stage_ready', id: 'next' }]);
  assert.ok(save.角色.身份.称号.includes('汉国关内侯（买官）'));
  assert.ok(save.角色.身份.称号.includes('汉国大行令（领事·加常侍郎）'));
  // 封侯关完成 → 买官爵作废 + 舞阳侯到手
  save.世界.状态.剧本模组.modId = 'lyl.luoyang_coup';
  applyMilestoneRewards(save, [{ type: 'stage_ready', id: 'next' }]);
  assert.deepEqual(save.角色.身份.称号, ['汉国舞阳侯'], '买官爵被剥夺,只剩舞阳侯');
});
