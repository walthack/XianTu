// 其余各线旧档回放（tests/fixtures/lines-replay/*.json；出处 scripts/generate-lines-replay-fixtures.mjs，基线 cdbe3e23，
// 塞外／昭南／晋国／太泉／汉国／唐国搬进内容包之前）。
// 夹具入库即「旧档」：本测试只读入库夹具，**不重跑生成器比对**、不 import 生成器；以后改了行为就改这里的期望并在 PR 写明原因，不改不删夹具。
// 期望值是生成时由现行实现算出、写进 <name>.trace.json 末条 checkpoint 的 expect（导出一次不再重生）。
// 十二份夹具同一条正式新档整链（推进循环照抄 tests/mainlineWalker.mjs，576 步走到唐终关），每条线两份：
//   mid＝该线某一关 rail 前 k 拍完成；end＝该线最后一关 rail 走完、下一关就绪（唐 end 是整链终关，没有下一关）。
// 本批没有派生夹具：trace[0].nonEngineProgress 恒为空。
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

const POINTER = '<<COMPASS_POINTER>>';
/** 夹具表（生成时的实际状态；railDone＝mid 档 rail 已结算的拍数；next＝end 档正式切关后的关）。 */
const FIXTURES = {
  'saiwai-mid': { save: '塞外旧档-五原关rail九拍', stage: 'lcq.stage_02', focus: 'lcq.event.charge_sudaji_fee', railDone: 9 },
  'saiwai-end': { save: '塞外旧档-五原关收束-下一关就绪', stage: 'lcq.stage_02', focus: null, ready: 'lcq.stage_03', next: 'lcq.stage_03b_snake_flower_bridge' },
  'zhaonan-mid': { save: '昭南旧档-白夷危局rail十七拍', stage: 'lcq.stage_04b_lingfei_baiyi_crisis', focus: 'lcq.event.xieyi_biling_war', railDone: 17 },
  'zhaonan-end': { save: '昭南旧档-鬼王宫收束-下一关就绪', stage: 'lcq.stage_05b', focus: null, ready: 'lcq.stage_06', next: 'lcq.stage_07_qingyuan_jiankang' },
  'jin-mid': { save: '晋国旧档-清远建康rail九拍', stage: 'lcq.stage_07_qingyuan_jiankang', focus: 'lcq.event.jin_panjiang_shaozhu', railDone: 9 },
  'jin-end': { save: '晋国旧档-商路脱身收束-江州暗战就绪', stage: 'lcq.stage_09_trade_and_escape', focus: null, ready: 'lcq.stage_10_jiangzhou_shadow_war', next: 'lcq.stage_10_jiangzhou_shadow_war' },
  'taiquan-mid': { save: '太泉旧档-赤阳圣果rail七拍', stage: 'lyl.taiquan_sacred_fruit', focus: 'lyl.event.taiquan_sacred_fruit_06', railDone: 7 },
  'taiquan-end': { save: '太泉旧档-太泉余波收束-洛都就绪', stage: 'lyl.taiquan_afterfall', focus: null, ready: 'lyl.luoyang_cloud_secret', next: 'lyl.luoyang_cloud_secret' },
  'han-mid': { save: '汉国旧档-汉宫rail九拍', stage: 'lyl.han_palace_endgame', focus: 'lyl.event.han_palace_endgame_02_beat', railDone: 9 },
  'han-end': { save: '汉国旧档-汉嗣收束-长安就绪', stage: 'lyg.han_succession', focus: null, ready: 'lyg.changgan_begins', next: 'lyg.changgan_begins' },
  'tang-mid': { save: '唐国旧档-长安插曲rail十四拍', stage: 'lyg.changgan_interlude', focus: 'lyg.event.changgan_interlude_02_beat', railDone: 14 },
  'tang-end': { save: '唐国旧档-石驼林终关rail走完', stage: 'lyg.shituolin_endgame', focus: null, ready: null, next: null, final: true },
};

// 关源：S0 时在 builtins/data（套内容包 overlay，同运行时与生成器）。搬迁后只换这里的读取来源。
const dataDir = new URL('../src/modules/scenarioMods/builtins/data/', import.meta.url);
const MODS = readdirSync(dataDir).filter(f => f.endsWith('.json')).sort()
  .map(f => P.applyContentPackOverlays(JSON.parse(readFileSync(new URL(f, dataDir), 'utf8'))));

const readBundle = key => JSON.parse(readFileSync(new URL(`./fixtures/lines-replay/${key}.json`, import.meta.url), 'utf8'));
const readTrace = key => JSON.parse(readFileSync(new URL(`./fixtures/lines-replay/${key}.trace.json`, import.meta.url), 'utf8'));
const checkpoint = key => readTrace(key).at(-1);
const rt = save => save.世界.状态.剧本模组;
const progress = save => {
  const s = rt(save);
  return { modId: s.modId, chapter: s.currentChapterId ?? null, completed: s.completedEventIds, active: s.activeEventIds,
    completedChapters: s.completedChapterIds, flags: s.flags, nextStageReadyId: s.nextStageReadyId ?? null, location: save.角色.位置 };
};
/** 同生成器 fixtureSummary 的口径。 */
const lineOutcomes = s => Object.fromEntries(Object.entries(s.flags || {}).filter(([k]) => /^line\.[^.]+\.outcome$/.test(k)).sort(([a], [b]) => (a < b ? -1 : 1)));
const summary = save => {
  const s = rt(save);
  return { stage: s.modId, chapter: s.currentChapterId ?? null, focus: R.getScenarioFocusEvent(s)?.id ?? null,
    completed: s.completedEventIds.length, active: s.activeEventIds.length, closedLines: O.closedLineIds(s), lineOutcomes: lineOutcomes(s),
    nextStageId: s.nextStageId ?? null, nextStageReadyId: s.nextStageReadyId ?? null, stallTurns: s.stallTurns ?? 0, location: save.角色.位置?.locationId ?? null };
};
const checkpointSummary = key => { const { kind, fixture, expect, ...rest } = checkpoint(key); return rest; };

/** 导入链：unwrapDadBundle →（非 V3 才）migrateSaveDataToLatest → validateSaveDataV3 → assertEntitySaveFormat。 */
function importBundle(bundle, expectedName) {
  const unwrapped = unwrapDadBundle(bundle);
  assert.equal(unwrapped.type, 'saves');
  assert.deepEqual(unwrapped.payload.saves.map(s => s.存档名), [expectedName]);
  const raw = unwrapped.payload.saves[0].存档数据;
  const save = isSaveDataV3(raw) ? raw : migrateSaveDataToLatest(raw).migrated;
  const validation = validateSaveDataV3(save);
  assert.equal(validation.isValid, true, JSON.stringify(validation));
  assert.doesNotThrow(() => assertEntitySaveFormat(save));
  return save;
}
const importFixture = key => importBundle(readBundle(key), FIXTURES[key].save);

/** 游戏读档链（同 tests/songReplayFixtures.test.mjs）：JSON 往返 → validateLoadedSave → applyLoadRepairs → assertEntitySaveFormat → migrateCalendar。 */
async function loadLikeGame(save, label) {
  const disk = JSON.parse(JSON.stringify(save));
  return quiet(async () => {
    const outcome = await fallback.validateLoadedSave('lines-replay', label, disk, { keep: 0, readBackup: async () => null });
    assert.equal(outcome.status, 'ok', `${label} 读档校验未通过`);
    repairs.applyLoadRepairs(outcome.data);
    assertEntitySaveFormat(outcome.data);
    calendar.migrateCalendar(outcome.data);
    return outcome.data;
  });
}
const loadFixture = async key => loadLikeGame(importFixture(key), key);

/** 推进一拍：同步 runtime → 当前主拍的一次真实合同动作（没有就只走时钟）→ 结算片刻 → 再同步（同宋回放）。 */
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
  T.settleActionTime(s, { action_time: { tier: '片刻' } }, { timeActionId: `lines-replay-test:${tag}` }, null, false, false);
  s = R.advanceScenarioRuntime(s).saveData;
  return { save: s, focus: focus?.id ?? null, action, receipt };
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
const bakedPresentation = s => ({ events: s.events.filter(e => 'presentation' in e).map(e => e.id), chapters: s.chapters.filter(c => 'presentation' in c).map(c => c.id) });

/** rail 结算口径同 mainlineWalker.unsettledRailBeats。 */
function unsettledRailBeats(state) {
  const rail = CR.getCanonRailProfile(state);
  if (!rail?.orderedEventIds?.length) return null;
  return rail.orderedEventIds.filter(id => {
    if (state.completedEventIds.includes(id) || (state.offscreenResolvedEventIds || []).includes(id)) return false;
    const condition = state.events.find(e => e.id === id)?.completion?.[0];
    return !(condition?.path?.startsWith('flags.') && condition.path.endsWith('.done')
      && state.flags[condition.path.slice('flags.'.length).replace(/\.done$/, '.void')] === true);
  });
}

for (const [key, meta] of Object.entries(FIXTURES)) {
  test(`${key}：导入链/读档修补链通过，读后进度不变；trace 与盘上一致、无手工改动`, async () => {
    const save = importFixture(key);
    assert.equal(rt(save).modId, meta.stage);
    assert.equal(R.getScenarioFocusEvent(rt(save))?.id ?? null, meta.focus);
    assert.deepEqual(summary(save), checkpointSummary(key));
    const trace = readTrace(key);
    assert.equal(trace[0].kind, 'source');
    assert.deepEqual(trace[0].nonEngineProgress, [], '本批夹具全部由引擎真实推进');
    const loaded = await loadLikeGame(save, key);
    assert.deepEqual(progress(loaded), progress(save));
    // 进度：mid 恰好 rail 前 k 拍结算；end rail 全部结算、下一关就绪
    const rail = CR.getCanonRailProfile(rt(loaded)).orderedEventIds;
    assert.deepEqual(unsettledRailBeats(rt(loaded)), meta.railDone ? rail.slice(meta.railDone) : []);
    if (meta.railDone) assert.equal(checkpoint(key).expect.railDone, meta.railDone);
    else assert.equal(rt(loaded).nextStageReadyId ?? null, meta.ready);
  });

  test(`${key}：读入后推进一拍，JSON 往返再读一次状态一致`, async () => {
    const loaded = await loadFixture(key);
    const step = await quiet(async () => advanceOneBeat(loaded, key));
    if (meta.focus) {
      assert.equal(step.focus, meta.focus);
      assert.ok(step.action, `${key} 主拍应有可执行动作`);
    }
    const roundTrip = JSON.parse(JSON.stringify(step.save));
    assert.doesNotThrow(() => importBundle({ type: 'saves', saves: [{ 存档名: meta.save, 存档数据: roundTrip }] }, meta.save));
    const reloaded = await loadLikeGame(roundTrip, `${key}:reload`);
    assert.deepEqual(progress(reloaded), progress(step.save));
    assert.deepEqual(rt(reloaded).events, rt(step.save).events);
    assert.deepEqual(rt(reloaded).chapters, rt(step.save).chapters);
  });

  test(`${key}：按烘焙对象算的章名/配乐/目标同 trace，删掉烘焙事件与章的 presentation 后不变；线卡视图同 trace`, async () => {
    const save = await loadFixture(key);
    const s = rt(save), expect = checkpoint(key).expect;
    assert.deepEqual(bakedPresentation(s), expect.bakedPresentation);
    assert.deepEqual(presentationOf(s), expect.presentation);
    const stripped = structuredClone(s);
    for (const item of [...stripped.events, ...stripped.chapters]) delete item.presentation;
    assert.deepEqual(presentationOf(stripped), expect.presentation);
    const view = LC.lineCompassView(save, { focusEventId: R.getScenarioFocusEvent(s)?.id, atLocationId: save.角色.位置?.locationId, compassPointer: () => POINTER });
    assert.deepEqual(view, expect.lineCompass);
    if (meta.focus) assert.ok(expect.presentation.chapterTitles[meta.focus], `${key} 焦点拍有章名`);
  });

  if (meta.next) {
    test(`${key}：正式切关进 ${meta.next}，摘要同 trace`, async () => {
      const save = await loadFixture(key);
      assert.equal(QL.nextStageModOf(save, MODS)?.manifest.id, meta.next);
      const result = await quiet(async () => I.transitionToNextScenarioStage(save, MODS));
      assert.ok(result.ok, result.reason);
      assert.equal(rt(result.saveData).modId, meta.next);
      assert.deepEqual(summary(result.saveData), checkpoint(key).expect.afterTransition);
    });
  }
}

test('tang-end：整链终关 rail 走完，没有下一关；切关探针同 trace', async () => {
  const save = await loadFixture('tang-end');
  const result = await quiet(async () => I.transitionToNextScenarioStage(structuredClone(save), MODS));
  assert.deepEqual({ ok: !!result.ok, reason: result.reason ?? null }, checkpoint('tang-end').expect.transitionProbe);
  assert.equal(result.ok, false);
  assert.deepEqual(O.closedLineIds(rt(save)), ['nanhuang', 'jin', 'song', 'han', 'tang']);
});

test('十二份夹具出自同一条整链：各份 trace 是终关 trace 的前缀；跳过的隔离关不出现在链上', () => {
  const full = readTrace('tang-end').slice(0, -1);
  assert.equal(full.length, 577, '1 条 source + 576 步（同 mainlineWalker）');
  for (const key of Object.keys(FIXTURES)) {
    const t = readTrace(key).slice(0, -1);
    assert.deepEqual(t.slice(1), full.slice(1, t.length), key);
  }
  const entered = full.filter(x => x.kind === 'stage').map(x => x.to);
  for (const id of ['lcq.stage_03', 'lcq.stage_05', 'lcq.stage_06', 'lyl.luoyang_coup', 'lyg.shixiang_ambush', 'lyg.ganlu_bian']) {
    assert.equal(CR.isDefaultLineQuarantinedStageId(id), true, id);
    assert.ok(!entered.includes(id), `${id} 不在链上`);
  }
});
