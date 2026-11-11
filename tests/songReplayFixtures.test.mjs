// 宋线旧档回放（tests/fixtures/song-replay/*.json；出处 scripts/generate-song-replay-fixtures.mjs，基线 da0edee9，宋线搬进内容包之前）。
// 夹具入库即「旧档」：本测试只读入库夹具，**不重跑生成器比对**、不 import 生成器；以后改了行为就改这里的期望并在 PR 写明原因，不改不删夹具。
// 期望值是生成时由现行实现算出、写进 <name>.trace.json 末条 checkpoint 的 expect（导出一次不再重生）。
// 六份夹具同一条正式新档链：晋 stage_09 收束 → 烈山中段（附入关档）→ 江州撤退入关（派生：s01_01/02 旧形状）→ 临安初抵五拍 → 小瀛洲收束 →
// 隔离关黑魔海（派生：旧版切关进入、删烘焙 intentMatch；附江州撤退收束档）。派生改动逐条记在 trace[0].nonEngineProgress。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { register } from 'node:module';

// musicLibrary.ts 直接 import 曲目 .mp3（webpack 资源）；Node 下只把它当成 URL 字符串模块（同 tests/qinReplayFixtures.test.mjs）。
register('data:text/javascript,' + encodeURIComponent(
  "export async function load(url, context, next) { if (url.endsWith('.mp3')) return { format: 'module', source: 'export default ' + JSON.stringify(url), shortCircuit: true }; return next(url, context); }"));
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
const { loadTs } = await import('./loadTs.mjs');
const quiet = async fn => { const k = ['log', 'info', 'warn', 'error', 'debug'], o = k.map(x => console[x]); k.forEach(x => { console[x] = () => {}; }); try { return await fn(); } finally { k.forEach((x, i) => { console[x] = o[i]; }); } };

const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const I = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const P = await loadTs('../src/modules/contentPacks/index.ts');
const T = await loadTs('../src/modules/scenarioMods/actionTime.ts');
const O = await loadTs('../src/modules/scenarioMods/lineOutcomes.ts');
const CR = await loadTs('../src/modules/scenarioMods/canonRail.ts');
const NV = await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
const MUSIC = await loadTs('../src/utils/musicLibrary.ts');
const FQ = await loadTs('../src/modules/scenarioMods/fixedQuestObjectives.ts');
const LC = await loadTs('../src/modules/scenarioMods/lineCompass.ts');
const QL = await loadTs('../src/modules/scenarioMods/questLog.ts');
const { unwrapDadBundle } = await loadTs('../src/utils/dadBundle.ts');
const { isSaveDataV3, migrateSaveDataToLatest } = await loadTs('../src/utils/saveMigration.ts');
const { validateSaveDataV3 } = await loadTs('../src/utils/saveValidationV3.ts');
const { assertEntitySaveFormat } = await loadTs('../src/modules/scenarioMods/entitySaveFormat.ts');
const fallback = await loadTs('../src/utils/saveLoadFallback.ts');
const repairs = await loadTs('../src/modules/scenarioMods/loadRepairs.ts');
const calendar = await loadTs('../src/utils/calendarMigration.ts');

const JIN_09 = 'lcq.stage_09_trade_and_escape', S10 = 'lcq.stage_10_jiangzhou_shadow_war', LIESHAN = 'lcq.stage_11_lieshan_battle';
const RETREAT = 'lyl.jiangzhou_retreat', BLACK_SEA = 'lyl.lin_an_black_sea', LINAN = 'lyl.lin_an_bridge';
const XYZ = 'lyl.xiaoyingzhou_blacksea_trap', SACRED = 'lyl.taiquan_sacred_fruit';
const POINTER = '<<COMPASS_POINTER>>';
const FIXTURES = {
  'song-before-entry': { saves: ['宋线旧档-晋关收束-江州暗战就绪'], stage: JIN_09, focus: null },
  'song-jiangzhou-mid': { saves: ['宋线旧档-烈山关中段', '宋线旧档-烈山关入关'], stage: LIESHAN, focus: 'lcq.event.s11_06_snow_battle' },
  'song-retreat-legacy': { saves: ['宋线旧档-江州撤退-旧位置无短语'], stage: RETREAT, focus: 'lyl.event.s01_01', derived: true },
  'song-linan-mid': { saves: ['宋线旧档-临安初抵五拍'], stage: LINAN, focus: 'lyl.event.decode_bianmenwa_note' },
  'song-line-end': { saves: ['宋线旧档-小瀛洲收束-太泉圣果就绪'], stage: XYZ, focus: null },
  'song-quarantine': { saves: ['宋线旧档-停在隔离关黑魔海', '宋线旧档-江州撤退收束-下一关隔离'], stage: BLACK_SEA, focus: 'lyl.event.debut_ruan_sisters', derived: true },
};

// 宋关源：S0 时在 builtins/data（套内容包 overlay，同运行时与生成器）。搬迁后只换这里的读取来源。
const dataDir = new URL('../src/modules/scenarioMods/builtins/data/', import.meta.url);
const MODS = readdirSync(dataDir).filter(f => f.endsWith('.json')).sort()
  .map(f => P.applyContentPackOverlays(JSON.parse(readFileSync(new URL(f, dataDir), 'utf8'))));
const modOf = id => MODS.find(m => m.manifest.id === id);
const sourceEvent = (stageId, eventId) => modOf(stageId).scenario.events.find(e => e.id === eventId);

const readBundle = key => JSON.parse(readFileSync(new URL(`./fixtures/song-replay/${key}.json`, import.meta.url), 'utf8'));
const readTrace = key => JSON.parse(readFileSync(new URL(`./fixtures/song-replay/${key}.trace.json`, import.meta.url), 'utf8'));
const checkpoint = key => readTrace(key).at(-1);
const rt = save => save.世界.状态.剧本模组;
const progress = save => {
  const s = rt(save);
  return { modId: s.modId, chapter: s.currentChapterId ?? null, completed: s.completedEventIds, active: s.activeEventIds,
    completedChapters: s.completedChapterIds, flags: s.flags, nextStageReadyId: s.nextStageReadyId ?? null, location: save.角色.位置 };
};
/** 同生成器 fixtureSummary 的口径。 */
const summary = save => {
  const s = rt(save);
  return { stage: s.modId, chapter: s.currentChapterId ?? null, focus: R.getScenarioFocusEvent(s)?.id ?? null,
    completed: s.completedEventIds.length, active: s.activeEventIds.length, closedLines: O.closedLineIds(s),
    songOutcome: s.flags?.['line.song.outcome'] ?? null, nextStageId: s.nextStageId ?? null, nextStageReadyId: s.nextStageReadyId ?? null,
    stallTurns: s.stallTurns ?? 0, location: save.角色.位置?.locationId ?? null };
};
const checkpointSummary = key => { const { kind, fixture, expect, ...rest } = checkpoint(key); return rest; };

/** 导入链：unwrapDadBundle →（非 V3 才）migrateSaveDataToLatest → validateSaveDataV3 → assertEntitySaveFormat。返回 bundle 里全部存档。 */
function importBundle(bundle, expectedNames) {
  const unwrapped = unwrapDadBundle(bundle);
  assert.equal(unwrapped.type, 'saves');
  assert.deepEqual(unwrapped.payload.saves.map(s => s.存档名), expectedNames);
  return unwrapped.payload.saves.map(entry => {
    const raw = entry.存档数据;
    const save = isSaveDataV3(raw) ? raw : migrateSaveDataToLatest(raw).migrated;
    const validation = validateSaveDataV3(save);
    assert.equal(validation.isValid, true, JSON.stringify(validation));
    assert.doesNotThrow(() => assertEntitySaveFormat(save));
    return save;
  });
}
const importFixture = key => importBundle(readBundle(key), FIXTURES[key].saves);

/** 游戏读档链（同 tests/qinReplayFixtures.test.mjs）：JSON 往返 → validateLoadedSave → applyLoadRepairs → assertEntitySaveFormat → migrateCalendar。 */
async function loadLikeGame(save, label) {
  const disk = JSON.parse(JSON.stringify(save));
  return quiet(async () => {
    const outcome = await fallback.validateLoadedSave('song-replay', label, disk, { keep: 0, readBackup: async () => null });
    assert.equal(outcome.status, 'ok', `${label} 读档校验未通过`);
    repairs.applyLoadRepairs(outcome.data);
    assertEntitySaveFormat(outcome.data);
    calendar.migrateCalendar(outcome.data);
    return outcome.data;
  });
}
const loadFixture = async (key, index = 0) => loadLikeGame(importFixture(key)[index], `${key}#${index}`);

/** 推进一拍：同步 runtime → 当前主拍的一次真实合同动作（没有就只走时钟）→ 结算片刻 → 再同步。 */
function advanceOneBeat(save, tag) {
  let s = R.advanceScenarioRuntime(save).saveData;
  const focus = R.getScenarioFocusEvent(rt(s));
  const actions = R.getCurrentStoryEventActions(s);
  const action = actions.find(a => focus?.playerCompletionContract?.actions.some(c => c.id === a.actionId)) || actions[0];
  let receipt = null;
  if (action) {
    receipt = R.recordStoryEventStructuredAction(s, action);
    assert.equal(receipt.attempted, true, JSON.stringify(receipt));
  }
  T.settleActionTime(s, { action_time: { tier: '片刻' } }, { timeActionId: `song-replay-test:${tag}` }, null, false, false);
  s = R.advanceScenarioRuntime(s).saveData;
  return { save: s, focus: focus?.id ?? null, action, receipt };
}

/** 同生成器 lieshanOffscreenProbe：停滞轮数拨到阈值推进一轮。legacy＝删掉烘焙的 offscreenResolution，只剩 runtime 旧兼容层。 */
function lieshanOffscreenProbe(save, variant) {
  const s = structuredClone(save);
  if (variant === 'legacy') for (const e of rt(s).events) delete e.offscreenResolution;
  rt(s).stallTurns = 10;
  const after = R.advanceScenarioRuntime(s).saveData, a = rt(after);
  const d = (a.divergences || []).find(x => x.id === 'offscreen.lcq.xingyuehu_war');
  return { flag: a.flags['world.xingyuehu_war.offscreen_resolved'] ?? null, offscreenResolvedEventIds: a.offscreenResolvedEventIds ?? [],
    completed: a.completedEventIds, active: a.activeEventIds, divergence: d ? { eventId: d.eventId, worldDelta: d.worldDelta, evidence: d.evidence } : null };
}

/** 同生成器 presentationOf：只按烘焙对象 + 现行展示表算章名/配乐/目标。 */
function presentationOf(s) {
  const chapterOf = id => s.chapters.find(c => (c.eventIds || []).includes(id));
  return {
    chapterTitles: Object.fromEntries(s.events.map(e => [e.id, NV.storyChapterTitle(s.modId, e.id, chapterOf(e.id)?.title ?? '')])),
    chapterMusic: Object.fromEntries(s.chapters.map(c => [c.id, MUSIC.resolveMusicMoodForChapter(c.id)])),
    eventMusic: Object.fromEntries(s.events.map(e => [e.id, MUSIC.resolveMusicMoodForScenario(chapterOf(e.id)?.id ?? null, [e])])),
    currentMusic: MUSIC.resolveMusicMoodForScenario(s.currentChapterId, s.events.filter(e => s.activeEventIds.includes(e.id))),
    objectives: Object.fromEntries(s.events.map(e => [e.id, FQ.resolveFixedQuestObjective(e)])),
  };
}

const intentOf = (event, actionId = 'advance_declared_objective') => event.playerCompletionContract?.actions?.find(a => a.id === actionId)?.intentMatch;

for (const [key, meta] of Object.entries(FIXTURES)) {
  test(`${key}：导入链/读档修补链通过，读后进度不变；trace 与盘上一致`, async () => {
    const saves = importFixture(key);
    assert.equal(rt(saves[0]).modId, meta.stage);
    assert.equal(R.getScenarioFocusEvent(rt(saves[0]))?.id ?? null, meta.focus);
    assert.deepEqual(summary(saves[0]), checkpointSummary(key));
    const trace = readTrace(key);
    assert.equal(trace[0].kind, 'source');
    assert.equal(trace[0].nonEngineProgress.length > 0, Boolean(meta.derived), '只有派生夹具有手工改动，且必须逐条记下');
    for (const [i, save] of saves.entries()) {
      const loaded = await loadLikeGame(save, `${key}#${i}`);
      assert.deepEqual(progress(loaded), progress(save), `${key}#${i}`);
    }
  });

  test(`${key}：读入后推进一拍，JSON 往返再读一次状态一致`, async () => {
    const loaded = await loadFixture(key);
    const step = await quiet(async () => advanceOneBeat(loaded, key));
    if (meta.focus) {
      assert.equal(step.focus, meta.focus);
      assert.ok(step.action, `${key} 主拍应有可执行动作`);
    } else {
      assert.equal(step.action, undefined, '本关收束、待切关时不再有主拍动作');
    }
    const roundTrip = JSON.parse(JSON.stringify(step.save));
    assert.doesNotThrow(() => importBundle({ type: 'saves', saves: [{ 存档名: meta.saves[0], 存档数据: roundTrip }] }, [meta.saves[0]]));
    const reloaded = await loadLikeGame(roundTrip, `${key}:reload`);
    assert.deepEqual(progress(reloaded), progress(step.save));
    assert.deepEqual(rt(reloaded).events, rt(step.save).events);
    assert.deepEqual(rt(reloaded).chapters, rt(step.save).chapters);
  });
}

test('song-before-entry：晋 stage_09 收束、江州暗战就绪；正式切关入宋，结果同 trace', async () => {
  const save = await loadFixture('song-before-entry');
  const s = rt(save);
  assert.equal(s.nextStageReadyId, S10);
  assert.deepEqual(O.closedLineIds(s), ['nanhuang', 'jin']);
  assert.equal(CR.isDefaultLineQuarantinedStageId(S10), false);
  assert.equal(QL.nextStageModOf(save, MODS)?.manifest.id, S10);
  const result = await quiet(async () => I.transitionToNextScenarioStage(save, MODS));
  assert.ok(result.ok, result.reason);
  assert.deepEqual(summary(result.saveData), checkpoint('song-before-entry').expect.afterTransition);
  assert.equal(R.getScenarioFocusEvent(rt(result.saveData))?.id, 'lcq.event.s10_01_jiangzhou_order');
  assert.ok(rt(result.saveData).chronicle.some(c => c.id === `chronicle.stage.${JIN_09}.${S10}`));
});

test('song-jiangzhou-mid：烈山缺席战报——入关档两种合同都结算（旧兼容层在环）；中段档合同主已完成，不结算', async () => {
  const expect = checkpoint('song-jiangzhou-mid').expect;
  const [mid, entry] = await Promise.all([loadFixture('song-jiangzhou-mid', 0), loadFixture('song-jiangzhou-mid', 1)]);
  assert.deepEqual(rt(mid).completedEventIds, CR.getCanonRailProfile({ modId: LIESHAN }).orderedEventIds.slice(0, 5));
  const { offscreenDeclared, offscreenLegacy, ...entrySummary } = expect.entry;
  assert.deepEqual(summary(entry), entrySummary);
  assert.equal(rt(entry).modId, LIESHAN);
  assert.deepEqual(rt(entry).completedEventIds, []);
  // 档里烘焙了声明式合同（搬迁前形状）；legacy 变体删掉后一条都不剩，结算只可能来自 runtime 的 legacyOffscreenResolution
  for (const save of [mid, entry]) {
    assert.deepEqual(rt(save).events.filter(e => e.offscreenResolution).map(e => e.offscreenResolution.id),
      ['offscreen.lcq.xingyuehu_war', 'offscreen.lcq.sanchuankou_result_rumor']);
  }
  await quiet(async () => {
    assert.deepEqual(lieshanOffscreenProbe(entry, 'declared'), offscreenDeclared);
    assert.deepEqual(lieshanOffscreenProbe(entry, 'legacy'), offscreenLegacy);
    assert.deepEqual(lieshanOffscreenProbe(mid, 'declared'), expect.mid.offscreenDeclared);
    assert.deepEqual(lieshanOffscreenProbe(mid, 'legacy'), expect.mid.offscreenLegacy);
  });
  assert.equal(offscreenLegacy.flag, true);
  assert.equal(offscreenLegacy.offscreenResolvedEventIds.length, 10);
  assert.match(offscreenLegacy.divergence.worldDelta, /你未赴烈山/);
  assert.equal(expect.mid.offscreenLegacy.flag, null);
  assert.equal(expect.mid.offscreenDeclared.flag, null);
});

test('song-retreat-legacy：旧位置、无 intentMatch 的 s01_01/02 经 repairReport8091Route 升到现行内置合同；不补记完成', async () => {
  const trace = readTrace('song-retreat-legacy');
  const legacyShapes = trace.at(-1).expect.legacyShapes;
  const [raw] = importFixture('song-retreat-legacy');
  for (const id of ['lyl.event.s01_01', 'lyl.event.s01_02']) {
    const baked = rt(raw).events.find(e => e.id === id);
    assert.equal(baked.locationId, legacyShapes[id].locationId, `${id} 盘上是旧位置`);
    assert.deepEqual(baked.playerCompletionContract, legacyShapes[id].playerCompletionContract);
    assert.equal(intentOf(baked), undefined, `${id} 盘上没有 intentMatch`);
  }
  assert.equal(legacyShapes['lyl.event.s01_01'].locationId, 'liuchao.location.jinming_zhai');
  assert.equal(legacyShapes['lyl.event.s01_02'].locationId, 'liuchao.location.jiangzhou');
  assert.ok(trace[0].nonEngineProgress.every(c => c.path.includes('lyl.event.s01_0')), '手工改动只限 s01_01/02');

  const loaded = await loadFixture('song-retreat-legacy');
  for (const id of ['lyl.event.s01_01', 'lyl.event.s01_02']) {
    const baked = rt(loaded).events.find(e => e.id === id), source = sourceEvent(RETREAT, id);
    assert.equal(baked.locationId, source.locationId, id);
    assert.equal(baked.objective, source.objective, id);
    assert.deepEqual(baked.playerCompletionContract, source.playerCompletionContract, id);
    assert.ok(intentOf(baked), `${id} 读档后有 intentMatch`);
  }
  assert.deepEqual(rt(loaded).completedEventIds, []);
  // 幂等：再修一遍不变
  const again = structuredClone(loaded);
  await quiet(async () => repairs.applyLoadRepairs(again));
  assert.deepEqual(rt(again).events, rt(loaded).events);
  // 升级后当前拍可以用现行短语对上
  const actions = R.getCurrentStoryEventActions(loaded);
  assert.ok(actions.some(a => a.eventId === 'lyl.event.s01_01' && a.actionId === 'advance_declared_objective'));
});

test('song-retreat-legacy：位置已是新值、只缺 intentMatch 的旧合同走 backfillMissingIntentMatch 回填；有尝试的不补', async () => {
  const [raw] = importFixture('song-retreat-legacy');
  const s = rt(raw), s0101 = s.events.find(e => e.id === 'lyl.event.s01_01'), source = sourceEvent(RETREAT, 'lyl.event.s01_01');
  // s01_01 的旧合同与现行只差 intentMatch：把位置拨回新值，repairReport8091Route 就不认它，只剩回填这条路
  s0101.locationId = source.locationId;
  const probe = structuredClone(s);
  repairs.repairReport8091Route(probe);
  assert.equal(intentOf(probe.events.find(e => e.id === 'lyl.event.s01_01')), undefined, 'repairReport8091Route 不动新位置的拍');
  const filled = await quiet(async () => repairs.backfillMissingIntentMatch(probe));
  assert.ok(filled >= 1);
  assert.deepEqual(intentOf(probe.events.find(e => e.id === 'lyl.event.s01_01')), intentOf(source));
  // 已有尝试的拍不补
  const tried = structuredClone(s);
  tried.eventActionStates = { ...(tried.eventActionStates || {}), 'lyl.event.s01_01': { attemptCount: 1, attempts: [{ actionId: 'advance_declared_objective' }], preparations: [] } };
  await quiet(async () => repairs.backfillMissingIntentMatch(tried));
  assert.equal(intentOf(tried.events.find(e => e.id === 'lyl.event.s01_01')), undefined);
});

test('song-linan-mid：初抵临安 rail 前 5 拍；章名/配乐/目标同 trace，删掉烘焙事件与章的展示字段后不变', async () => {
  const save = await loadFixture('song-linan-mid');
  const s = rt(save);
  assert.equal(s.currentChapterId, 'lyl.chapter.lin_an_bridge_arrival');
  assert.deepEqual(s.completedEventIds, CR.getCanonRailProfile({ modId: LINAN }).orderedEventIds.slice(0, 5));
  assert.ok(!s.events.some(e => 'presentation' in e), '搬迁前烘焙事件没有 presentation');
  assert.ok(!s.chapters.some(c => 'presentation' in c), '搬迁前烘焙章没有 presentation');
  const expected = checkpoint('song-linan-mid').expect.presentation;
  assert.deepEqual(presentationOf(s), expected);
  const stripped = structuredClone(s);
  for (const item of [...stripped.events, ...stripped.chapters]) delete item.presentation;
  assert.deepEqual(presentationOf(stripped), expected);
  // 现状钉点：首章承重拍「初抵临安」、随迁的登场卡「临安疑线」；章配乐 court
  assert.equal(expected.chapterTitles['lyl.event.linan_arrive_fengbo'], '初抵临安');
  assert.equal(expected.chapterTitles['lyl.event.debut_jingli'], '临安疑线');
  assert.equal(expected.chapterMusic['lyl.chapter.lin_an_bridge_arrival'], 'court');
  assert.equal(Object.keys(expected.chapterTitles).length, 29);
});

test('song-line-end：小瀛洲 rail 走完、太泉圣果就绪；线卡视图（下一步表）同 trace，正式切关进太泉圣果', async () => {
  const save = await loadFixture('song-line-end');
  const s = rt(save), expect = checkpoint('song-line-end').expect;
  const rail = CR.getCanonRailProfile({ modId: XYZ }).orderedEventIds;
  assert.ok(rail.every(id => s.completedEventIds.includes(id)), '小瀛洲 rail 全部完成');
  assert.equal(s.nextStageReadyId, SACRED);
  // 现状：宋线收束档不在小瀛洲写出（line.song.outcome 仍为空，宋线到太泉圣果关才收）；线卡当前线是宋、下一步为空
  assert.equal(s.flags['line.song.outcome'] ?? null, null);
  assert.equal(O.lineClosed('song', s), false);
  const view = LC.lineCompassView(save, { focusEventId: R.getScenarioFocusEvent(s)?.id, atLocationId: save.角色.位置?.locationId, compassPointer: () => POINTER });
  assert.deepEqual(view, expect.lineCompass);
  assert.equal(view.current?.lineId, 'song');
  const result = await quiet(async () => I.transitionToNextScenarioStage(save, MODS));
  assert.ok(result.ok, result.reason);
  assert.deepEqual(summary(result.saveData), expect.afterTransition);
});

test('song-quarantine：停在隔离关黑魔海的旧档读档补回 intentMatch；下一关是临安（非隔离）', async () => {
  const trace = readTrace('song-quarantine');
  const [raw] = importFixture('song-quarantine');
  assert.equal(CR.isDefaultLineQuarantinedStageId(BLACK_SEA), true, '隔离集合已恢复');
  // trace＝主链截到江州撤退收束点，再接一条派生切关
  const { traceLen } = trace.at(-1).expect.retreatReady;
  assert.equal(trace.length, traceLen + 2);
  assert.deepEqual(trace.at(-2), { kind: 'stage', from: RETREAT, to: BLACK_SEA, derived: true });
  assert.deepEqual(trace.slice(1, traceLen), readTrace('song-line-end').slice(1, traceLen), '派生点之前与主链一致');
  const stripped = trace[0].nonEngineProgress.filter(c => c.path.endsWith('.intentMatch'));
  assert.ok(stripped.length >= 1);
  const ids = stripped.map(c => c.path.match(/events\[id=([^\]]+)\]/)[1]);
  for (const id of ids) assert.equal(intentOf(rt(raw).events.find(e => e.id === id), 'acknowledge_offscreen_interlude'), undefined, `${id} 盘上没有 intentMatch`);
  const loaded = await loadFixture('song-quarantine');
  for (const id of ids) {
    assert.deepEqual(intentOf(rt(loaded).events.find(e => e.id === id), 'acknowledge_offscreen_interlude'),
      intentOf(sourceEvent(BLACK_SEA, id), 'acknowledge_offscreen_interlude'), `${id} 读档后补回内置短语`);
  }
  assert.equal(rt(loaded).nextStageId, LINAN);
  assert.equal(QL.nextStageModOf(loaded, MODS)?.manifest.id, LINAN);
});

test('song-quarantine：从江州撤退收束档沿链跳过隔离关黑魔海，切关与任务日志都落到临安', async () => {
  const save = await loadFixture('song-quarantine', 1);
  const { traceLen, ...expected } = checkpoint('song-quarantine').expect.retreatReady;
  assert.deepEqual(summary(save), expected);
  assert.equal(rt(save).nextStageReadyId, BLACK_SEA);
  assert.equal(QL.nextStageModOf(save, MODS)?.manifest.id, LINAN);
  const result = await quiet(async () => I.transitionToNextScenarioStage(save, MODS));
  assert.ok(result.ok, result.reason);
  assert.equal(result.to, LINAN);
  assert.equal(rt(result.saveData).modId, LINAN);
  // 引擎链上（不派生）下一步就是这次切关：trace 里紧随其后的是 retreat → lin_an_bridge
  assert.deepEqual(readTrace('song-line-end')[traceLen], { kind: 'stage', from: RETREAT, to: LINAN });
});
