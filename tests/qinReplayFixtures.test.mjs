// 秦线旧档回放（tests/fixtures/qin-replay/*.json；出处 scripts/generate-qin-replay-fixtures.mjs，基线 b668792f，秦线声明化搬迁之前）。
// 夹具入库即「旧档」：本测试只读入库夹具，**不重跑生成器比对**；以后改了行为就改这里的期望并在 PR 写明原因，不改不删夹具。
// 四份夹具同一条链：入秦前未达阈值 → 阈值达成且口信已「先记下」→ 地图入秦走到第一幕中段 → 秦 rail 14 拍走完。
// 与原始口径的差异（引擎现状，详见 impl-summary）：夹具 1 未投递口信、无烘焙的 compass.qinEntryReady；
// 夹具 3 没有救过虞氏姐妹（结构化动作够不到 lyl.event.rescue_yu_sisters），秦关条件拍全部未触发；
// 夹具 4 的 nextStageReadyId 为 null（地图入秦的秦关 nextStageId 为空）；回主链走 mapEntryReturn，不走 nextStageReadyId（tests/mapEntryReturn.test.mjs）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

// musicLibrary.ts 直接 import 曲目 .mp3（webpack 资源）；Node 下只把它当成 URL 字符串模块。
register('data:text/javascript,' + encodeURIComponent(
  "export async function load(url, context, next) { if (url.endsWith('.mp3')) return { format: 'module', source: 'export default ' + JSON.stringify(url), shortCircuit: true }; return next(url, context); }"));
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
const { loadTs } = await import('./loadTs.mjs');
const quiet = async fn => { const k = ['log', 'info', 'warn', 'error', 'debug'], o = k.map(x => console[x]); k.forEach(x => { console[x] = () => {}; }); try { return await fn(); } finally { k.forEach((x, i) => { console[x] = o[i]; }); } };

const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const T = await loadTs('../src/modules/scenarioMods/actionTime.ts');
const M = await loadTs('../src/modules/scenarioMods/travel/mapTravel.ts');
const L = await loadTs('../src/modules/scenarioMods/ledgerConditions.ts');
const NV = await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
const MUSIC = await loadTs('../src/utils/musicLibrary.ts');
const { unwrapDadBundle } = await loadTs('../src/utils/dadBundle.ts');
const { isSaveDataV3, migrateSaveDataToLatest } = await loadTs('../src/utils/saveMigration.ts');
const { validateSaveDataV3 } = await loadTs('../src/utils/saveValidationV3.ts');
const { assertEntitySaveFormat } = await loadTs('../src/modules/scenarioMods/entitySaveFormat.ts');
const fallback = await loadTs('../src/utils/saveLoadFallback.ts');
const repairs = await loadTs('../src/modules/scenarioMods/loadRepairs.ts');
const { getMapEntryReturnOffer } = await loadTs('../src/modules/scenarioMods/mapEntryReturn.ts');
const calendar = await loadTs('../src/utils/calendarMigration.ts');

const QIN = 'lyg.qin_xianyang';
const XIANYANG = 'liuchao.location.xianyang';
const HOOK = 'liuchao.event.qin_hook_fangshi_rumor';
const q = name => `liuchao.event.qin_${name}`;
const FIXTURES = {
  'qin-before-entry': { name: '秦线旧档-入秦前-未达阈值', stage: 'lyl.taiquan_sacred_fruit', focus: 'lyl.event.taiquan_sacred_fruit_06' },
  'qin-entry-ready': { name: '秦线旧档-入秦阈值已达-口信已记下', stage: 'lyl.taiquan_sacred_fruit', focus: 'lyl.event.taiquan_sacred_fruit_07' },
  'qin-rail-mid': { name: '秦线旧档-秦关中段', stage: QIN, focus: q('succession_fight') },
  'qin-rail-end': { name: '秦线旧档-秦关rail走完', stage: QIN, focus: null },
};
const QIN_EVENT_IDS = ['hook_fangshi_rumor', 'enter_xianyang', 'entry_envoy', 'find_xu', 'entry_camp', 'king_refuses', 'xu_auspice',
  'yu_sisters_refuge', 'new_year_banquet', 'palace_sealed', 'succession_fight', 'purge_hunted', 'yu_sisters_act2', 'heimohai_message',
  'ningyu_coldtrace', 'xiaoling_villa', 'bo_family', 'close_default'].map(q);
const QIN_CHAPTER_IDS = ['prologue', 'act1', 'act2', 'act3'].map(c => `lyg.chapter.qin_xianyang_${c}`);
const QIN_RAIL = ['hook_fangshi_rumor', 'enter_xianyang', 'find_xu', 'entry_camp', 'king_refuses', 'xu_auspice', 'new_year_banquet',
  'palace_sealed', 'succession_fight', 'purge_hunted', 'heimohai_message', 'xiaoling_villa', 'bo_family', 'close_default'].map(q);
// 搬迁前界面章名快照（storyChapterTitle，fallback 取烘焙章对象里该事件所属章的 title）。
const PROLOGUE = '咸阳传闻', ACT1 = '年节封宫', ACT2 = '清洗', ACT3 = '掌秦';
const QIN_CHAPTER_TITLES = {
  [q('hook_fangshi_rumor')]: PROLOGUE, [q('enter_xianyang')]: PROLOGUE, [q('entry_envoy')]: PROLOGUE, [q('find_xu')]: PROLOGUE,
  [q('entry_camp')]: PROLOGUE, [q('king_refuses')]: PROLOGUE, [q('xu_auspice')]: PROLOGUE,
  [q('yu_sisters_refuge')]: ACT1, [q('new_year_banquet')]: ACT1, [q('palace_sealed')]: ACT1, [q('succession_fight')]: ACT1,
  [q('purge_hunted')]: ACT2, [q('yu_sisters_act2')]: ACT2, [q('heimohai_message')]: ACT2, [q('ningyu_coldtrace')]: ACT2,
  [q('xiaoling_villa')]: ACT2, [q('bo_family')]: ACT2,
  [q('close_default')]: ACT3,
};

const read = key => JSON.parse(readFileSync(new URL(`./fixtures/qin-replay/${key}.json`, import.meta.url), 'utf8'));
const rt = save => save.世界.状态.剧本模组;
const progress = save => {
  const s = rt(save);
  return { modId: s.modId, chapter: s.currentChapterId ?? null, completed: s.completedEventIds, active: s.activeEventIds,
    completedChapters: s.completedChapterIds, flags: s.flags, nextStageReadyId: s.nextStageReadyId ?? null, location: save.角色.位置 };
};

/** 导入链：unwrapDadBundle →（非 V3 才）migrateSaveDataToLatest → validateSaveDataV3 → assertEntitySaveFormat。 */
function importBundle(bundle, expectedName) {
  const unwrapped = unwrapDadBundle(bundle);
  assert.equal(unwrapped.type, 'saves');
  assert.equal(unwrapped.payload.saves.length, 1);
  assert.equal(unwrapped.payload.saves[0].存档名, expectedName);
  const raw = unwrapped.payload.saves[0].存档数据;
  const save = isSaveDataV3(raw) ? raw : migrateSaveDataToLatest(raw).migrated;
  const validation = validateSaveDataV3(save);
  assert.equal(validation.isValid, true, JSON.stringify(validation));
  assert.doesNotThrow(() => assertEntitySaveFormat(save));
  return save;
}

/**
 * 游戏读档链（characterStore.loadGame → gameStateStore.loadFromSaveData 的同一批纯函数）：落盘形状（JSON 往返）→
 * validateLoadedSave → applyLoadRepairs → assertEntitySaveFormat → migrateCalendar。
 * migrateNarrativeDetailOnLoad 走 IndexedDB 本地副本，Node 下不可用，不在此链（夹具无叙事正文）。
 */
async function loadLikeGame(save, label) {
  const disk = JSON.parse(JSON.stringify(save));
  return quiet(async () => {
    const outcome = await fallback.validateLoadedSave('qin-replay', label, disk, { keep: 0, readBackup: async () => null });
    assert.equal(outcome.status, 'ok', `${label} 读档校验未通过`);
    repairs.applyLoadRepairs(outcome.data);
    assertEntitySaveFormat(outcome.data);
    calendar.migrateCalendar(outcome.data);
    return outcome.data;
  });
}

/** 推进一拍：同步 runtime → 当前主拍的一次真实合同动作（没有主拍时只走时钟）→ 结算片刻 → 再同步。 */
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
  T.settleActionTime(s, { action_time: { tier: '片刻' } }, { timeActionId: `qin-replay-test:${tag}` }, null, false, false);
  s = R.advanceScenarioRuntime(s).saveData;
  return { save: s, focus: focus?.id ?? null, action, receipt };
}

const chapterTitles = runtime => Object.fromEntries(runtime.events.map(e =>
  [e.id, NV.storyChapterTitle(runtime.modId, e.id, runtime.chapters.find(c => (c.eventIds || []).includes(e.id))?.title ?? '')]));

for (const [key, meta] of Object.entries(FIXTURES)) {
  test(`${key}：导入链/读档修补链通过，读后进度不变`, async () => {
    const bundle = read(key);
    assert.deepEqual(Object.keys(bundle).sort(), ['saves', 'type']);
    const save = importBundle(bundle, meta.name);
    assert.equal(rt(save).modId, meta.stage);
    assert.equal(R.getScenarioFocusEvent(rt(save))?.id ?? null, meta.focus);
    const loaded = await loadLikeGame(save, key);
    assert.deepEqual(progress(loaded), progress(save));
  });

  test(`${key}：读入后推进一拍，JSON 往返再读一次状态一致`, async () => {
    const loaded = await loadLikeGame(importBundle(read(key), meta.name), key);
    const step = await quiet(async () => advanceOneBeat(loaded, key));
    if (meta.focus) {
      assert.equal(step.focus, meta.focus);
      assert.ok(step.action, `${key} 主拍应有可执行动作`);
    } else {
      assert.equal(step.action, undefined, 'rail 走完后不再有主拍动作');
    }
    const roundTrip = JSON.parse(JSON.stringify(step.save));
    assert.doesNotThrow(() => importBundle({ type: 'saves', saves: [{ 存档名: meta.name, 存档数据: roundTrip }] }, meta.name));
    const reloaded = await loadLikeGame(roundTrip, `${key}:reload`);
    assert.deepEqual(progress(reloaded), progress(step.save));
    assert.deepEqual(rt(reloaded).events, rt(step.save).events);
    assert.deepEqual(rt(reloaded).chapters, rt(step.save).chapters);
  });
}

test('qin-before-entry：已有两线收束、qinEntryReady 未就绪；口信未投递，Q-1 未烘进 runtime，地图不开咸阳', async () => {
  const save = await loadLikeGame(importBundle(read('qin-before-entry'), FIXTURES['qin-before-entry'].name), 'qin-before-entry');
  assert.equal(L.resolveLedgerPath('compass.qinEntryReady', rt(save), save).value, false);
  assert.equal(L.resolveLedgerPath('compass.anyLineClosed', rt(save), save).value, true);
  for (const id of ['lcq.event.s05b_wuer_suli_depart', 'lcq.event.s09_10_separation']) assert.equal(L.resolveLedgerPath(`done.${id}`, rt(save), save).value, true, id);
  assert.equal(L.resolveLedgerPath('done.lyl.event.taiquan_sacred_fruit_06', rt(save), save).value, false);
  assert.ok(!rt(save).events.some(e => e.id === HOOK));
  assert.equal(save.系统.扩展.mapEntryMessages, undefined);
  assert.equal(M.selectMapTravel(save, XIANYANG), undefined);
});

test('qin-entry-ready：qinEntryReady 就绪，Q-1 已投递并「先记下」，烘焙条件仍是 compass.qinEntryReady；地图入秦切入咸阳', async () => {
  const save = await loadLikeGame(importBundle(read('qin-entry-ready'), FIXTURES['qin-entry-ready'].name), 'qin-entry-ready');
  assert.equal(L.resolveLedgerPath('compass.qinEntryReady', rt(save), save).value, true);
  const hook = rt(save).events.find(e => e.id === HOOK);
  assert.deepEqual(hook.conditions, [{ path: 'compass.qinEntryReady', operator: 'eq', value: true }]);
  assert.equal(hook.critical, false);
  assert.equal(hook.exploration, true);
  assert.ok(rt(save).completedEventIds.includes(HOOK));
  assert.deepEqual(save.系统.扩展.mapEntryMessages, { qin: { delivered: true, done: true } });
  const before = structuredClone(rt(save));
  const selection = M.selectMapTravel(save, XIANYANG);
  assert.ok(selection, '地图咸阳入口应可用');
  assert.equal(await quiet(async () => M.settleMapTravel(save, selection)), true);
  assert.equal(rt(save).modId, QIN);
  assert.equal(save.角色.位置.locationId, XIANYANG);
  assert.deepEqual(save.系统.扩展.mapEntryResume.runtime, before);
  assert.ok(rt(save).completedEventIds.includes(HOOK));
  assert.equal(R.getScenarioFocusEvent(rt(save))?.id, q('enter_xianyang'));
  assert.equal(M.selectMapTravel(save, XIANYANG), undefined);
});

test('qin-rail-mid：第一幕中段（封宫已完成、焦点夺位），可沿默认 rail 完成下一拍；条件拍均未触发', async () => {
  const save = await loadLikeGame(importBundle(read('qin-rail-mid'), FIXTURES['qin-rail-mid'].name), 'qin-rail-mid');
  const s = rt(save);
  assert.equal(s.currentChapterId, QIN_CHAPTER_IDS[0], '秦 rail profile 钉在序幕章（搬迁前形状）');
  assert.deepEqual(s.completedEventIds, QIN_RAIL.slice(0, 8));
  assert.deepEqual(s.activeEventIds, [q('succession_fight')]);
  assert.ok(s.chapters.find(c => c.id === QIN_CHAPTER_IDS[1]).eventIds.includes(q('succession_fight')));
  // 未救虞氏姐妹、未持汉武阳侯身份、无入队规则：四个条件拍都不在激活/完成里。
  assert.equal(L.resolveLedgerPath('done.lyl.event.rescue_yu_sisters', s, save).value, false);
  for (const id of [q('entry_envoy'), q('yu_sisters_refuge'), q('yu_sisters_act2'), q('ningyu_coldtrace')]) {
    assert.ok(!s.activeEventIds.includes(id) && !s.completedEventIds.includes(id), id);
  }
  const step = await quiet(async () => advanceOneBeat(save, 'mid-next'));
  assert.equal(step.focus, q('succession_fight'));
  assert.equal(step.receipt.completed, true);
  assert.ok(rt(step.save).completedEventIds.includes(q('succession_fight')));
  assert.equal(R.getScenarioFocusEvent(rt(step.save))?.id, q('purge_hunted'));
  assert.ok(!rt(step.save).activeEventIds.includes(q('yu_sisters_act2')));
});

test('qin-rail-end：rail 14 拍走完、line.qin.outcome=unresolved；nextStageReadyId 为空，回主链走 mapEntryReturn，不走 nextStageReadyId', async () => {
  const save = await loadLikeGame(importBundle(read('qin-rail-end'), FIXTURES['qin-rail-end'].name), 'qin-rail-end');
  const s = rt(save);
  assert.deepEqual(s.completedEventIds, QIN_RAIL);
  assert.deepEqual(s.activeEventIds, []);
  assert.deepEqual(s.completedChapterIds, QIN_CHAPTER_IDS);
  assert.equal(s.currentChapterId, null);
  assert.equal(s.flags['line.qin.outcome'], 'unresolved');
  assert.equal(L.resolveLedgerPath('line.qin.outcome', s, save).value, 'unresolved');
  assert.equal(L.resolveLedgerPath(`done.${q('close_default')}`, s, save).value, true);
  assert.equal(s.nextStageId ?? null, null);
  assert.equal(s.nextStageReadyId ?? null, null);
  assert.equal(save.系统.扩展.mapEntryResume.runtime.modId, 'lyl.taiquan_sacred_fruit');
  assert.ok(getMapEntryReturnOffer(save));
  assert.equal(s.gameOver ?? false, false);
});

for (const key of ['qin-rail-mid', 'qin-rail-end']) {
  test(`${key}：秦关每个事件的界面章名快照；删掉烘焙事件的 presentation 后章名不变`, async () => {
    const save = await loadLikeGame(importBundle(read(key), FIXTURES[key].name), key);
    const s = rt(save);
    assert.deepEqual(chapterTitles(s), QIN_CHAPTER_TITLES);
    const stripped = structuredClone(s);
    for (const event of stripped.events) delete event.presentation;
    assert.deepEqual(chapterTitles(stripped), QIN_CHAPTER_TITLES);
  });
}

test('qin-rail-mid：烘焙的秦事件 id 集合与章 id 集合', () => {
  const s = rt(importBundle(read('qin-rail-mid'), FIXTURES['qin-rail-mid'].name));
  assert.deepEqual(s.events.map(e => e.id), QIN_EVENT_IDS);
  assert.deepEqual(s.chapters.map(c => c.id), QIN_CHAPTER_IDS);
  assert.deepEqual(s.chapters.map(c => c.title), [PROLOGUE, ACT1, ACT2, ACT3]);
  assert.ok(!s.events.some(e => 'presentation' in e), '搬迁前烘焙事件没有 presentation 字段');
});

test('序幕章配乐：lyg.chapter.qin_xianyang_prologue 解析为 court', () => {
  assert.equal(MUSIC.resolveMusicMoodForChapter('lyg.chapter.qin_xianyang_prologue'), 'court');
});
