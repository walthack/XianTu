// 地图入口关走完后返回出发关（通用机制；秦线是第一个使用者）。夹具：tests/fixtures/qin-replay/（只读，不改不删）。
// 判定：mapEntryReturnTarget（stage_ready 的条件去掉 nextStageId）；执行：strictInitializer.transitionFromMapEntryStage。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(
  "export async function load(url, context, next) { if (url.endsWith('.mp3')) return { format: 'module', source: 'export default ' + JSON.stringify(url), shortCircuit: true }; return next(url, context); }"));
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
const { loadTs } = await import('./loadTs.mjs');
const quiet = async fn => { const k = ['log', 'info', 'warn', 'error', 'debug'], o = k.map(x => console[x]); k.forEach(x => { console[x] = () => {}; }); try { return await fn(); } finally { k.forEach((x, i) => { console[x] = o[i]; }); } };

const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const T = await loadTs('../src/modules/scenarioMods/actionTime.ts');
const M = await loadTs('../src/modules/scenarioMods/travel/mapTravel.ts');
const L = await loadTs('../src/modules/scenarioMods/ledgerConditions.ts');
const E = await loadTs('../src/modules/scenarioMods/mapEntries.ts');
const RET = await loadTs('../src/modules/scenarioMods/mapEntryReturn.ts');
const S = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const F = await loadTs('../src/modules/scenarioMods/heimohaiFestival.ts');
const LO = await loadTs('../src/modules/scenarioMods/lineOutcomes.ts');
const packs = await loadTs('../src/modules/contentPacks/index.ts');
const { unwrapDadBundle } = await loadTs('../src/utils/dadBundle.ts');
const { isSaveDataV3, migrateSaveDataToLatest } = await loadTs('../src/utils/saveMigration.ts');
const { validateSaveDataV3 } = await loadTs('../src/utils/saveValidationV3.ts');
const { assertEntitySaveFormat } = await loadTs('../src/modules/scenarioMods/entitySaveFormat.ts');
const fallback = await loadTs('../src/utils/saveLoadFallback.ts');
const repairs = await loadTs('../src/modules/scenarioMods/loadRepairs.ts');
const calendar = await loadTs('../src/utils/calendarMigration.ts');

const QIN = 'lyg.qin_xianyang';
const XIANYANG = 'liuchao.location.xianyang';
const HOOK = 'liuchao.event.qin_hook_fangshi_rumor';
const DEP = 'lyl.taiquan_sacred_fruit';
const DEP_FOCUS = 'lyl.event.taiquan_sacred_fruit_07';
const q = name => `liuchao.event.qin_${name}`;
const QIN_RAIL = ['hook_fangshi_rumor', 'enter_xianyang', 'find_xu', 'entry_camp', 'king_refuses', 'xu_auspice', 'new_year_banquet',
  'palace_sealed', 'succession_fight', 'purge_hunted', 'heimohai_message', 'xiaoling_villa', 'bo_family', 'close_default'].map(q);
const NAMES = {
  'qin-before-entry': '秦线旧档-入秦前-未达阈值',
  'qin-entry-ready': '秦线旧档-入秦阈值已达-口信已记下',
  'qin-rail-mid': '秦线旧档-秦关中段',
  'qin-rail-end': '秦线旧档-秦关rail走完',
};
const DEP_MOD = packs.applyContentPackOverlays(JSON.parse(readFileSync(new URL(`../src/modules/scenarioMods/builtins/data/${DEP}.json`, import.meta.url), 'utf8')));
const MODS = [DEP_MOD, ...packs.CONTENT_PACKS.stages];
const ENTRY = packs.CONTENT_PACKS.mapEntries.find(e => e.id === 'qin');

const read = key => JSON.parse(readFileSync(new URL(`./fixtures/qin-replay/${key}.json`, import.meta.url), 'utf8'));
const rt = save => save.世界.状态.剧本模组;
const progress = save => {
  const s = rt(save);
  return { modId: s.modId, chapter: s.currentChapterId ?? null, completed: s.completedEventIds, active: s.activeEventIds,
    completedChapters: s.completedChapterIds, flags: s.flags, nextStageReadyId: s.nextStageReadyId ?? null, location: save.角色.位置 };
};

function importBundle(bundle, expectedName) {
  const unwrapped = unwrapDadBundle(bundle);
  assert.equal(unwrapped.payload.saves[0].存档名, expectedName);
  const raw = unwrapped.payload.saves[0].存档数据;
  const save = isSaveDataV3(raw) ? raw : migrateSaveDataToLatest(raw).migrated;
  assert.equal(validateSaveDataV3(save).isValid, true);
  assert.doesNotThrow(() => assertEntitySaveFormat(save));
  return save;
}

async function loadLikeGame(save, label) {
  const disk = JSON.parse(JSON.stringify(save));
  return quiet(async () => {
    const outcome = await fallback.validateLoadedSave('map-entry-return', label, disk, { keep: 0, readBackup: async () => null });
    assert.equal(outcome.status, 'ok', `${label} 读档校验未通过`);
    repairs.applyLoadRepairs(outcome.data);
    assertEntitySaveFormat(outcome.data);
    calendar.migrateCalendar(outcome.data);
    return outcome.data;
  });
}
const load = key => loadLikeGame(importBundle(read(key), NAMES[key]), key);

function advanceOneBeat(save, tag) {
  let s = R.advanceScenarioRuntime(save).saveData;
  const focus = R.getScenarioFocusEvent(rt(s));
  const actions = R.getCurrentStoryEventActions(s);
  const action = actions.find(a => focus?.playerCompletionContract?.actions.some(c => c.id === a.actionId)) || actions[0];
  if (action) assert.equal(R.recordStoryEventStructuredAction(s, action).attempted, true);
  T.settleActionTime(s, { action_time: { tier: '片刻' } }, { timeActionId: `map-entry-return-test:${tag}` }, null, false, false);
  s = R.advanceScenarioRuntime(s).saveData;
  return { save: s, focus: focus?.id ?? null, action };
}

const isWorldline = key => key.startsWith('branch.') || key.startsWith('scene.') || key.startsWith('character.') || key.endsWith('.void')
  || key.startsWith('world.baihu.') || key.startsWith('line.') || key.startsWith('deadline.')
  || packs.contentPackPersistentFlagIds().has(key) || key.startsWith('event.gamble_bond_signed.');

/** 返回后的共同断言（A2–A11）；before = 返回前存档。 */
function assertReturned(after, before) {
  const resume = before.系统.扩展.mapEntryResume, base = resume.runtime, cur = rt(before), s = rt(after);
  assert.equal(s.modId, DEP);
  assert.equal(after.系统.扩展.剧本模组.modId, DEP);
  assert.equal(after.系统.扩展.mapEntryResume, undefined);
  assert.deepEqual(after.角色.位置, resume.position);
  assert.equal(after.世界.信息.世界名称, S.buildStrictScenarioInitialization(DEP_MOD).worldInfo.世界名称);
  for (const field of ['completedEventIds', 'activeEventIds', 'currentChapterId', 'chapters', 'events', 'travelLedger']) {
    assert.deepEqual(s[field], base[field], field);
  }
  // 时钟取出发关快照；返回时与普通切关一样推进一轮，所以 +1。
  assert.equal(s.worldTurn, base.worldTurn + 1);
  assert.equal(R.getScenarioFocusEvent(s)?.id, DEP_FOCUS);
  // flags：世界线取入口关值，出发关自己的 flag 不变，入口关的关内 flag 不带回。
  assert.equal(s.flags['line.qin.outcome'], 'unresolved');
  for (const [key, value] of Object.entries(base.flags)) if (!isWorldline(key)) assert.deepEqual(s.flags[key], value, key);
  for (const key of Object.keys(cur.flags)) if (!isWorldline(key) && !(key in base.flags)) assert.ok(!(key in s.flags), key);
  // 编年史：入口关全部记录 + 一条返回记录。
  assert.deepEqual(s.chronicle.slice(0, cur.chronicle.length), cur.chronicle);
  const back = s.chronicle.find(e => e.id === 'chronicle.mapEntryReturn.qin');
  assert.ok(back && back.stageId === QIN && back.type === 'stage');
  assert.equal(back.title, packs.packText(ENTRY.returnChronicleTextId).replace('{stage}', base.modName));
  assert.equal(L.resolveLedgerPath(`done.${q('close_default')}`, s, after).value, true);
  for (const field of ['playerIdentities', 'playerKnowledge', 'acquaintances']) {
    for (const [id, value] of Object.entries(cur[field] || {})) assert.deepEqual(s[field][id], value, `${field}.${id}`);
  }
  assert.deepEqual(after.元数据.时间, before.元数据.时间, '返回不计时');
  // 不能再次入秦，口信不重投。
  assert.equal(M.selectMapTravel(after, XIANYANG), undefined);
  assert.equal(E.mapEntryReady(after, ENTRY), false);
  const transitions = [];
  E.syncMapEntryMessages(after, s, transitions);
  assert.deepEqual(transitions, []);
  assert.ok(!s.activeEventIds.includes(HOOK));
  // 大祭与线卡。
  assert.equal(F.qinClosedByFestival(after, s), false);
  assert.equal(F.festivalView(after).blocked, '');
  assert.ok(LO.lineOutcomeTiers().includes('unresolved'));
  assert.equal(LO.lineClosed('qin', s), true);
  // 返回过场走 stageEntryPresentation；从入口关指回出发关。
  const presentation = R.getStageEntryPresentation(after);
  assert.equal(presentation?.toStageId, DEP);
  assert.equal(presentation?.fromStageId, QIN);
  assert.equal(presentation?.text, packs.packText(ENTRY.returnTextId));
  assert.equal(presentation?.enteredAtTurn, s.worldTurn);
}

test('内容包：qin 入口声明了返回文案，三段文本都在 texts 里且带扩写标记', () => {
  for (const field of ['returnLabelTextId', 'returnTextId', 'returnChronicleTextId']) {
    assert.equal(typeof ENTRY[field], 'string', field);
    assert.match(packs.packText(ENTRY[field]), /^【扩写/, field);
  }
  assert.match(packs.packText(ENTRY.returnTextId), /^【扩写·待剧情策划】/);
});

test('A0 ⚠核实：rail-end 读入后 hasPendingProductionCriticalEvent 为假（条件拍未触发不挡返回）', async () => {
  const save = await load('qin-rail-end');
  assert.equal(R.hasPendingProductionCriticalEvent(rt(save)), false);
  assert.equal(rt(save).currentChapterId, null);
  assert.deepEqual(rt(save).activeEventIds, []);
});

test('A qin-rail-end 读入 → 返回出发关', async () => {
  const save = await load('qin-rail-end');
  const before = structuredClone(save);
  const offer = RET.getMapEntryReturnOffer(save);
  assert.ok(offer);
  assert.equal(offer.entryId, 'qin');
  assert.equal(offer.label, packs.packText(ENTRY.returnLabelTextId).replace('{stage}', before.系统.扩展.mapEntryResume.runtime.modName));
  assert.ok(!offer.label.includes('{stage}'));
  const result = await quiet(async () => S.transitionFromMapEntryStage(save, MODS));
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.from, QIN);
  assert.equal(result.to, DEP);
  assert.deepEqual(save, before, '不改入参存档');
  const after = result.saveData;
  assertReturned(after, before);
  assert.equal(RET.getMapEntryReturnOffer(after), null);
  // A12 返回后推进一拍，JSON 往返再读一致。
  const step = await quiet(async () => advanceOneBeat(after, 'after-return'));
  assert.equal(step.focus, DEP_FOCUS);
  assert.ok(step.action, '出发关当前拍应有可执行动作');
  const reloaded = await loadLikeGame(JSON.parse(JSON.stringify(step.save)), 'after-return:reload');
  assert.deepEqual(progress(reloaded), progress(step.save));
  // A13 再调一次：幂等拒绝。
  const again = S.transitionFromMapEntryStage(after, MODS);
  assert.equal(again.ok, false);
  assert.equal(again.saveData, after);
});

test('B 整链：qin-entry-ready → 地图入秦 → 推进到返回报价出现 → 返回', async () => {
  const save = await load('qin-entry-ready');
  const selection = M.selectMapTravel(save, XIANYANG);
  assert.ok(selection);
  assert.equal(await quiet(async () => M.settleMapTravel(save, selection)), true);
  assert.equal(rt(save).modId, QIN);
  let s = save;
  for (let i = 0; i < 40 && !RET.getMapEntryReturnOffer(s); i++) s = (await quiet(async () => advanceOneBeat(s, `chain-${i}`))).save;
  assert.ok(RET.getMapEntryReturnOffer(s), '40 拍内应出现返回报价');
  assert.deepEqual(rt(s).completedEventIds, QIN_RAIL);
  const before = structuredClone(s);
  const result = await quiet(async () => S.transitionFromMapEntryStage(s, MODS));
  assert.equal(result.ok, true, result.reason);
  assertReturned(result.saveData, before);
});

test('C 反例：rail 未走完、没有续点、续点被删、gameOver、仍有激活事件、条目不声明返回', async () => {
  const mid = await load('qin-rail-mid');
  assert.equal(RET.getMapEntryReturnOffer(mid), null);
  assert.equal(S.transitionFromMapEntryStage(mid, MODS).ok, false);
  for (const key of ['qin-entry-ready', 'qin-before-entry']) {
    const save = await load(key);
    assert.equal(RET.getMapEntryReturnOffer(save), null, key);
    assert.equal(S.transitionFromMapEntryStage(save, MODS).ok, false, key);
  }
  const end = await load('qin-rail-end');
  const noResume = structuredClone(end); delete noResume.系统.扩展.mapEntryResume;
  assert.equal(RET.getMapEntryReturnOffer(noResume), null);
  const over = structuredClone(end); rt(over).gameOver = { endingId: 'test' };
  assert.equal(RET.getMapEntryReturnOffer(over), null);
  const busy = structuredClone(end); rt(busy).activeEventIds = [q('close_default')];
  assert.equal(RET.getMapEntryReturnOffer(busy), null);
  const chained = structuredClone(end); rt(chained).nextStageId = DEP;
  assert.equal(RET.getMapEntryReturnOffer(chained), null, '入口关自带下一关时走正常启程');
  const missingMod = S.transitionFromMapEntryStage(end, packs.CONTENT_PACKS.stages);
  assert.equal(missingMod.ok, false, '找不到出发关模组时拒绝');
  const { returnLabelTextId, ...undeclared } = ENTRY;
  const list = packs.CONTENT_PACKS.mapEntries, at = list.indexOf(ENTRY);
  list[at] = undeclared;
  try { assert.equal(RET.getMapEntryReturnOffer(end), null); } finally { list[at] = ENTRY; }
  assert.ok(returnLabelTextId);
});

test('编年史门：入秦前的编年史不挡第一次入口；有入口关记录才挡', async () => {
  const save = await load('qin-entry-ready');
  assert.ok(!(rt(save).chronicle || []).some(e => e?.stageId === QIN));
  assert.equal(E.mapEntryReady(save, ENTRY), true);
  const visited = structuredClone(save);
  (rt(visited).chronicle ||= []).push({ id: 'test.visited', type: 'stage', stageId: QIN, title: 'x', sequence: 99 });
  assert.equal(E.mapEntryReady(visited, ENTRY), false);
});
