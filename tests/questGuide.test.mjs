// 任务引导取代主线按钮（设计稿 2026-11-03「任务引导取代主线按钮」；用户 2026-11-03 定）回归。
// 开关 story.quest.enabled 默认关：关时与现状逐项一致；开时 stage_02 样板有任务日志与地图标记，手打（在对的地方）可从 s01 末推进到王哲传功之后。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.location = { search: '', hostname: 'localhost' };
const quiet = fn => { const log = console.log, info = console.info, warn = console.warn; console.log = console.info = console.warn = () => {}; try { return fn(); } finally { Object.assign(console, { log, info, warn }); } };
const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const init = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const cp = await loadTs('../src/modules/contentPacks/index.ts');
const ec = await loadTs('../src/modules/scenarioMods/entityCatalog.ts');
const cr = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
const NI = await loadTs('../src/modules/scenarioMods/naturalIntentRouter.ts');
const BP = await loadTs('../src/modules/scenarioMods/beatProgress.ts');
const Q = await loadTs('../src/modules/scenarioMods/questLog.ts');
const { GAME_NUMBERS } = await loadTs('../src/modules/sceneModule/numbers.ts');
const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
const { resetLogState } = await loadTs('../src/modules/diagnostics/log.ts');
const { logStore } = await loadTs('../src/modules/diagnostics/store.ts');
const rt = s => s.世界.状态.剧本模组;
const QC = GAME_NUMBERS.story.quest;
const withQuest = (on, fn) => {
  const prev = QC.enabled; QC.enabled = on;
  let out;
  try { out = fn(); } catch (error) { QC.enabled = prev; throw error; }
  if (out && typeof out.then === 'function') return out.finally(() => { QC.enabled = prev; });
  QC.enabled = prev; return out;
};

const STAGES = ['lcq.stage_01', 'lcq.stage_02', 'lcq.stage_03', 'lcq.stage_03b_snake_flower_bridge'];
const MODS = STAGES.map(id => {
  const mod = ec.resolveScenarioContent(cp.applyContentPackOverlays(JSON.parse(read(`src/modules/scenarioMods/builtins/data/${id}.json`))));
  cr.resolveScenarioCharacters(mod.canon?.characters, mod.manifest.id);
  return mod;
});
const SHUAI_ZHANG = 'lcq.location.shuai_zhang';
const newSave = () => quiet(() => R.advanceScenarioRuntime(init.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), init.buildStrictScenarioInitialization(MODS[0]))).saveData);
const moveTo = (s, locationId, text) => { s.角色.位置 = { ...(s.角色.位置 || {}), 描述: text, locationId }; };
// 一回合＝MainGamePanel.sendMessage 的本地部分（同 reportEf57）：到点对齐 → 启程文字 → 本拍动作（对不上记 miss／notThere）→ 推进 → 回合收尾（开关开：任务日志分级；关：两种空转提示）。
function turn(save, input, clicked) {
  const trace = {};
  BP.applyBeatDeadlines(rt(save).events);
  BP.prepareBeatDeadlineTurn(save);
  const typed = clicked ? undefined : BP.resolveBeatText(save, input);
  if (typed?.action.kind === 'departure') {
    const t = quiet(() => init.transitionToNextScenarioStage(save, MODS));
    assert.ok(t.ok, t.reason);
    return { save: t.saveData, trace: { departed: 'text', via: typed.via } };
  }
  rt(save).worldTurn++;
  const action = clicked || (typed?.action.kind === 'event' ? typed.action.selection : undefined);
  trace.via = clicked ? 'button' : typed ? typed.via : BP.beatTextNotThere(save, input) ? 'notThere' : BP.beatActionTable(save).actions.length ? 'miss' : 'none';
  if (trace.via === 'miss' || trace.via === 'notThere') trace.notice = BP.beatMissNotice(save);
  quiet(() => { if (action) { R.recordStoryEventStructuredAction(save, action); trace.event = action.eventId; trace.action = action.actionId; } });
  const before = structuredClone(save);
  save.系统.历史.叙事.push({ type: 'gm', content: '风从草原尽头吹来。' });
  save = quiet(() => R.advanceScenarioRuntime(save).saveData);
  trace.deadline = BP.deadlineResolvedThisTurn(before, save);
  trace.idleNotice = BP.noteStageDepartureIdleTurn(save) || BP.noteBeatActionIdleTurn(save);
  trace.quest = Q.noteQuestIdleTurn(save);
  trace.arrived = Q.questArrivedDeparture(before, save, MODS);
  return { save, trace };
}
const clickInput = save => {
  const offer = R.getStageDepartureOffer(save);
  if (offer) return { input: offer.label };
  const focus = R.getScenarioFocusEvent(rt(save));
  const actions = R.getCurrentStoryEventActions(save).filter(a => a.eventId === focus?.id);
  const ids = new Set((focus?.playerCompletionContract?.actions || []).map(a => a.id));
  const a = actions.find(x => ids.has(x.actionId)) || actions.find(x => x.actionId.startsWith('travel:'));
  return { input: a?.playerLine || '我看看四周', clicked: a };
};
/** s01 末：s01_05 结算、stage_01 收束待启程（人在帅帐）。 */
const toStageReady = () => {
  let s = newSave();
  for (let i = 0; i < 12 && !rt(s).nextStageReadyId; i++) { const c = clickInput(s); s = turn(s, c.input, c.clicked).save; }
  assert.equal(rt(s).nextStageReadyId, 'lcq.stage_02');
  return s;
};

test('配置：story.quest 进 mod-kit 并登记，开关默认关；分级回合 3/6/8、标记默认开；作者数据自检 0 问题', () => {
  assert.equal(QC.enabled, false, '功能开关默认关');
  assert.deepEqual(QC.hintTurns, [3, 6]);
  assert.equal(QC.approachTurns, 8);
  assert.equal(QC.showMarkersDefault, true);
  assert.doesNotMatch(QC.missNotice, /\{actions\}/, '不列动作');
  assert.match(QC.missNotice, /任务日志/);
  const progress = JSON.parse(read('mod-kit/numbers-progress.json')).story.quest;
  const merged = JSON.parse(read('mod-kit/game-numbers.qingyu.json')).story.quest;
  assert.deepEqual(progress, merged, '兼容生成物与分包一致');
  const registry = read('src/modules/sceneModule/numbersRegistry.ts');
  for (const field of Object.keys(progress).filter(k => k !== 'note')) assert.ok(registry.includes(`'story.quest.${field}'`), field);
  assert.deepEqual(Q.validateQuestData(), []);
  assert.ok(Q.validateQuestData({ beats: { x: { objective: '一'.repeat(QC.objectiveMaxChars + 1), marker: 'hidden' } } }).length >= 2);
  const s02 = Q.questBeatSpec('lcq.event.s02_01');
  assert.equal(s02.actions.advance_declared_objective.completion.where, SHUAI_ZHANG);
  assert.doesNotMatch(s02.objective, /请传我功法|传功于你/, '目标不写怎么说、不写结果');
});

test('开关关：任务日志、标记、门槛、分级都是空操作；短语、miss 提示、空转提示与现状一致', () => {
  withQuest(false, () => {
    let s = toStageReady();
    assert.deepEqual(Q.questLogView(s, MODS), { current: [], done: [] });
    assert.deepEqual(Q.questMarkers(s, MODS), []);
    assert.deepEqual(Q.noteQuestIdleTurn(s), {});
    assert.equal(s.系统.扩展.questLog, undefined, '不写状态');
    assert.equal(BP.resolveBeatText(s, '我收拾行装，准备上路'), undefined, '启程短语（quests.json）关时不认');
    assert.equal(BP.resolveBeatText(s, '收拾行装，继续旅程')?.action.kind, 'departure', '按钮文字照旧＝点启程');
    assert.equal(Q.questArrivedDeparture(s, s, MODS), undefined);
    s = turn(s, '收拾行装，继续旅程').save;
    assert.equal(rt(s).modId, 'lcq.stage_02');
    const focus = R.getScenarioFocusEvent(rt(s));
    assert.equal(focus.id, 'lcq.event.s02_01');
    assert.equal(BP.resolveBeatText(s, '我向王哲请教他要交代的事'), undefined, 'quests.json 短语关时不认');
    assert.equal(BP.beatTextNotThere(s, '我接过锦囊，听清并认下王哲的托付。'), false);
    assert.equal(Q.questActionGate(s, { eventId: focus.id, actionId: 'advance_declared_objective' }).ok, true);
    assert.match(BP.beatMissNotice(s), /可做：.*王哲/, 'miss 提示照旧列出按钮文字');
    // 主线按钮空转提示照旧（actionIdleTurns 回合）
    const N = GAME_NUMBERS.story.beatProgress.actionIdleTurns;
    const notices = [];
    for (let i = 0; i < N + 1; i++) { const out = turn(s, '我在帐中四处看看。'); s = out.save; notices.push(out.trace.idleNotice); assert.deepEqual(out.trace.quest, {}); }
    assert.ok(notices[N]?.includes('点「'), JSON.stringify(notices));
    assert.equal(s.系统.扩展.questLog, undefined);
  });
});

test('开关关：逐拍点按钮的路线与开关开时 s01 段完全相同（s01 没写任务数据，开关只换提示文案）', () => {
  const walk = on => withQuest(on, () => {
    let s = newSave(); const log = [];
    for (let i = 0; i < 12 && !rt(s).nextStageReadyId; i++) { const c = clickInput(s); const out = turn(s, c.input, c.clicked); s = out.save; log.push([rt(s).modId, out.trace.event, out.trace.action, out.trace.via]); }
    return { log, done: rt(s).completedEventIds };
  });
  assert.deepEqual(walk(true), walk(false));
});

test('开关开：s01 末任务日志写下一关目标、地图标落点；落点就是当前地，手打启程短语切关；到达落点即切关', () => withQuest(true, () => {
  const s = toStageReady();
  Q.noteQuestIdleTurn(s);
  const view = Q.questLogView(s, MODS);
  assert.equal(view.current.length, 1);
  assert.equal(view.current[0].key, 'departure:lcq.stage_02');
  assert.equal(view.current[0].objective, Q.questArrivalSpec('lcq.stage_02').objective);
  assert.deepEqual(Q.questMarkers(s, MODS).map(m => [m.locationId, m.line, m.color]), [[SHUAI_ZHANG, 'main', QC.markerStyle.main.color]]);
  assert.equal(BP.resolveBeatText(s, '我收拾行装，准备上路')?.action.kind, 'departure');
  assert.equal(BP.resolveBeatText(s, '收拾行装，继续旅程')?.action.kind, 'departure', '原启程文字照旧');
  assert.equal(BP.resolveBeatText(s, '我先不走，再歇一会'), undefined, '否定优先');
  // 到达即切：从别处来到下一关开场落点（同国）
  const away = structuredClone(s);
  moveTo(away, 'lcq.location.grassland', '中立边陲·草原');
  assert.equal(Q.questArrivedDeparture(away, s, MODS), 'lcq.stage_02');
  assert.equal(Q.questArrivedDeparture(s, s, MODS), undefined, '本来就在落点：到达无从触发');
  assert.equal(Q.questArrivedDeparture(s, away, MODS), undefined, '离开落点不算');
}));

test('开关开：s01 末一路手打推进到王哲传功之后；stage_02 有任务日志与地图标记，已完成栏写结果', () => withQuest(true, async () => {
  await resetLogState();
  let s = toStageReady();
  let out = turn(s, '我收拾行装，准备上路');
  assert.equal(out.trace.departed, 'text');
  s = out.save;
  assert.equal(rt(s).modId, 'lcq.stage_02');
  assert.equal(R.getScenarioFocusEvent(rt(s)).id, 'lcq.event.s02_01');
  const entry = Q.questLogView(s, MODS).current[0];
  assert.deepEqual([entry.eventId, entry.title, entry.objective, entry.place, entry.authored], ['lcq.event.s02_01', '王哲传功', '去帅帐找王哲，听他当面交代', '帅帐', true]);
  assert.deepEqual(entry.hints, [], '拍刚激活不放提示');
  const markers = Q.questMarkers(s, MODS);
  assert.ok(markers.length >= 1 && markers.every(m => m.locationId === SHUAI_ZHANG && m.key === 'lcq.event.s02_01'), JSON.stringify(markers));
  // 没对上：不推进，提示只说见任务日志、不列动作
  out = turn(s, '我在帐外看看天色。');
  s = out.save;
  assert.equal(out.trace.via, 'miss');
  assert.equal(out.trace.notice, QC.missNotice);
  assert.doesNotMatch(out.trace.notice, /王哲|可做/);
  assert.ok(!rt(s).completedEventIds.includes('lcq.event.s02_01'));
  // 手打命中（人在帅帐、王哲同场）
  out = turn(s, '我向王哲请教他要交代的事');
  s = out.save;
  assert.equal(out.trace.via, 'alias');
  assert.equal(out.trace.event, 'lcq.event.s02_01');
  assert.ok(rt(s).completedEventIds.includes('lcq.event.s02_01'), '王哲传功已结算');
  assert.notEqual(R.getScenarioFocusEvent(rt(s))?.id, 'lcq.event.s02_01');
  const done = Q.questLogView(s, MODS).done;
  assert.equal(done[0]?.key, 'lcq.event.s02_01');
  assert.equal(done[0]?.result, Q.questBeatSpec('lcq.event.s02_01').doneText);
  assert.ok(!Q.questMarkers(s, MODS).some(m => m.key === 'lcq.event.s02_01'), '结算后撤标记');
  // 下一拍（没写任务数据）回落到拍自带 objective，并记 LCQ-SAV-057
  const next = Q.questLogView(s, MODS).current[0];
  assert.equal(next.authored, false);
  assert.equal(next.objective, R.getScenarioFocusEvent(rt(s)).objective);
  const missing = (await logStore.all()).filter(e => e.code === 'LCQ-SAV-057');
  assert.ok(missing.some(e => e.detail.beatKey === next.eventId), '缺目标文案记日志');
}));

test('开关开：人不在 where 不结算、记 notThere 不算 miss；空转 3/6 回合逐级放提示，8 回合王哲主动来找后同场即算到地', () => withQuest(true, async () => {
  await resetLogState();
  let s = turn(toStageReady(), '我收拾行装，准备上路').save;
  // 让本拍不走 runtime 的罗盘换移动（拍自带 locationId 时人不在就只给移动），单测 completion.where。
  const event = rt(s).events.find(e => e.id === 'lcq.event.s02_01');
  delete event.locationId;
  moveTo(s, 'lcq.location.grassland', '中立边陲·草原');
  const line = '我向王哲请教他要交代的事';
  assert.equal(Q.questActionGate(s, { eventId: 'lcq.event.s02_01', actionId: 'advance_declared_objective' }).where, false);
  assert.equal(BP.resolveBeatText(s, line), undefined, '人不在帅帐不结算');
  assert.equal(BP.resolveBeatText(s, '我接过锦囊，听清并认下王哲的托付。'), undefined, '原句也要先到地方');
  assert.equal(BP.beatTextNotThere(s, line), true);
  Q.noteQuestIdleTurn(s);
  const notes = [];
  for (let i = 1; i <= 8; i++) {
    const out = turn(s, i === 1 ? line : '我在草原上转转。');
    s = out.save;
    if (i === 1) assert.equal(out.trace.via, 'notThere');
    notes.push(out.trace.quest);
    if (i === 3) assert.deepEqual(Q.questLogView(s, MODS).current[0].hints, ['王哲在帅帐等你。']);
    if (i === 6) assert.equal(Q.questLogView(s, MODS).current[0].hints.length, 2);
  }
  assert.deepEqual(notes.map(n => n.notice ? 1 : 0), [0, 0, 1, 0, 0, 1, 0, 1], JSON.stringify(notes));
  assert.equal(notes[7].approach, Q.questBeatSpec('lcq.event.s02_01').approach.text);
  assert.ok(!rt(s).completedEventIds.includes('lcq.event.s02_01'), 'approach 不结算');
  assert.equal(Q.takeQuestApproachLead(s), notes[7].approach, '引子注入下一回合一次');
  assert.equal(Q.takeQuestApproachLead(s), undefined);
  assert.ok((await logStore.all()).some(e => e.code === 'LCQ-SAV-058'));
  // 王哲已来找：与王哲同场即算到地
  assert.equal(Q.questActionGate(s, { eventId: 'lcq.event.s02_01', actionId: 'advance_declared_objective' }).ok, true);
  const out = turn(s, line);
  assert.equal(out.trace.event, 'lcq.event.s02_01');
  assert.ok(rt(out.save).completedEventIds.includes('lcq.event.s02_01'));
}));

test('开关开：作者写明到点的拍（s01_06）到点前一回合日志预告「时机将过」，提示级回合数不小于到点的那一级不触发', () => withQuest(true, () => {
  let s = newSave();
  for (let i = 0; i < 20 && !rt(s).activeEventIds.includes('lcq.event.s01_06'); i++) { const c = clickInput(s); s = turn(s, c.input, c.clicked).save; }
  const turns = GAME_NUMBERS.story.beatProgress.deadlineTurns['lcq.event.s01_06'];
  const warns = [];
  let out;
  for (let i = 0; i < turns + 2; i++) {
    const entry = Q.questLogView(s, MODS).current.find(e => e.eventId === 'lcq.event.s01_06');
    if (!entry) break;
    warns.push(entry.warn || '');
    out = turn(s, '我在原地看看四周。');
    s = out.save;
    if (out.trace.deadline.includes('lcq.event.s01_06')) break;
  }
  assert.equal(warns.length, turns, JSON.stringify(warns));
  assert.deepEqual(warns.map(w => w ? 1 : 0), [...Array(turns - QC.deadlineWarnTurns).fill(0), ...Array(QC.deadlineWarnTurns).fill(1)]);
  assert.equal(warns.at(-1), QC.deadlineWarnText);
  assert.ok(rt(s).offscreenResolvedEventIds.includes('lcq.event.s01_06'), JSON.stringify([rt(s).completedEventIds, s.系统.扩展.questLog]));
  const done = Q.questLogView(s, MODS).done.find(e => e.key === 'lcq.event.s01_06');
  assert.equal(done?.result, QC.missedText, '到点收束的拍在已完成栏写「时机已过」');
}));

test('开关开：自由输入路由（naturalIntentRouter）与发送前判定同一张表、同一门槛', () => withQuest(true, () => {
  const s = turn(toStageReady(), '我收拾行装，准备上路').save;
  assert.equal(NI.resolveStoryEventActionFromText(s, '我向王哲请教他要交代的事')?.eventId, 'lcq.event.s02_01');
  const away = structuredClone(s);
  delete rt(away).events.find(e => e.id === 'lcq.event.s02_01').locationId;
  moveTo(away, 'lcq.location.grassland', '中立边陲·草原');
  assert.equal(NI.resolveStoryEventActionFromText(away, '我向王哲请教他要交代的事'), undefined);
}));
