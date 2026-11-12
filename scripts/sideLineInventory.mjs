// 非主线拍盘点（Node，不开浏览器）：沿 tests/mainlineWalker.mjs 的默认主链推进，在每一步之前的状态上用源码函数列出「此刻可做的非主线拍」。
// 文件名不以 smoke- 开头，不会被 e2e-smoke 当成脚本发现；scripts/smoke-full-chain.mjs --side 也 import 这里的读法。
//   - 线拍（questLines：清羽三条支线／人物线，lines-*.json）：可做＝R.getCurrentStoryExplorationActions 里出现本拍 eventId 的动作（引擎此刻真能执行）；
//     规则上开着＝questLineOffer 非空（入口/requires/窗口都满足，但人可能不在地点、拍不在本关）。
//   - 人物任务与高光（packs/characters/character-beats.json）：挂在主线事件上；可做＝该事件成为焦点（右栏「这一拍谁有戏」按 characterBeatsAt 出行），做完＝该事件完成。
//   - 二级线提示：右栏当前线卡 lineCompassView（当前线＋「别处还有事（N）」）。
//   - 常驻入口：碧鲮海藻丝（syncPersistentLineEntries，人在碧鲮村时补进事件）、驿馆会合（y5 留下后 05b 补拍）。
// 用法：node scripts/sideLineInventory.mjs [--json 结果文件]
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.MODULE_DEV_DEFAULTS ??= true;
const quietSync = fn => { const k = ['log', 'info', 'warn', 'error', 'debug'], o = k.map(x => console[x]); k.forEach(x => { console[x] = () => {}; }); try { return fn(); } finally { k.forEach((x, i) => { console[x] = o[i]; }); } };
const quiet = async fn => { const k = ['log', 'info', 'warn', 'error', 'debug'], o = k.map(x => console[x]); k.forEach(x => { console[x] = () => {}; }); try { return await fn(); } finally { k.forEach((x, i) => { console[x] = o[i]; }); } };
const { loadTs } = await import('../tests/loadTs.mjs');
const W = await quiet(() => import('../tests/mainlineWalker.mjs'));
const [R, QL, QC, QV, CQ, LC, PE, TL] = await quiet(() => Promise.all([
  '../src/modules/scenarioMods/runtime.ts', '../src/modules/scenarioMods/questLines.ts', '../src/modules/scenarioMods/questLineContext.ts',
  '../src/modules/scenarioMods/questLineView.ts', '../src/modules/scenarioMods/characterQuests.ts', '../src/modules/scenarioMods/lineCompass.ts',
  '../src/modules/scenarioMods/persistentLineEntries.ts', '../src/modules/scenarioMods/travel/travelLedger.ts',
].map(p => loadTs(p))));
export { R, QL, QC, QV, CQ, LC, PE, TL };

export const LINE_BEATS = QL.QUEST_LINES.flatMap(line => line.beats.map(beat => ({ line, beat })));
const beatOfEvent = new Map(LINE_BEATS.map(x => [x.beat.eventId, x]));
export const lineBeatOfEvent = id => beatOfEvent.get(id);
export const CHAR_BEATS = [
  ...CQ.CHARACTER_QUESTS.flatMap(q => q.beats.map((b, i) => ({ kind: 'quest', id: `${q.id}#${i + 1}`, name: q.name, status: b.status, eventIds: b.eventIds, summary: b.reviewSummary }))),
  ...CQ.CHARACTER_HIGHLIGHTS.map((h, i) => ({ kind: 'highlight', id: `hl#${i + 1}`, name: h.name, status: 'ready', eventIds: h.eventIds, summary: h.reviewSummary })),
];
const rt = save => save.世界.状态.剧本模组;
const locOf = save => quietSync(() => TL.currentLocation(save).canonicalLocationId) || save.角色?.位置?.地点ID || '';

/** 这份状态上此刻的非主线入口（只读；advanceScenarioRuntime 克隆后读，同 MainGamePanel 的口径）。 */
export function sideSnapshot(save) {
  const live = quietSync(() => R.advanceScenarioRuntime(structuredClone(save)).saveData);
  const r = rt(live), focus = R.getScenarioFocusEvent(r);
  const explore = quietSync(() => R.getCurrentStoryExplorationActions(live));
  const doable = explore.filter(a => beatOfEvent.has(a.eventId)).map(a => ({ beatId: beatOfEvent.get(a.eventId).beat.id, lineId: beatOfEvent.get(a.eventId).line.id, eventId: a.eventId, actionId: a.actionId, label: a.label }));
  const offered = LINE_BEATS.filter(({ beat }) => quietSync(() => QC.questLineOffer(live, beat.eventId, focus?.id))).map(({ beat }) => beat.id);
  const view = quietSync(() => QV.questLineView(live));
  const compass = quietSync(() => LC.lineCompassView(live, { focusEventId: focus?.id, atLocationId: locOf(live), compassPointer: () => '' }));
  return {
    stage: r.modId, focus: focus?.id ?? null, location: locOf(live), doable, offered,
    sidebarCharacter: view.character.map(c => ({ beatId: c.beatId, name: c.name, objective: c.objective, actions: c.actions.map(a => a.actionId) })),
    sidebarSecondary: view.secondary.map(s => s.id),
    charBeatsHere: focus ? CQ.characterBeatsAt(focus.id) : [],
    compass: { current: compass.current?.name ?? null, step: compass.current?.step ?? null, others: compass.others.map(o => o.name), entryHints: compass.entryHints.map(h => h.lineId) },
    receipts: Object.keys(r.questLineState?.receipts || {}), expired: Object.keys(r.questLineState?.expired || {}),
  };
}

/** 沿主链走一遍，按拍汇总窗口。 */
export async function inventory() {
  return W.withFixedHost(async () => quiet(async () => {
    const mods = await W.loadMainlineMods();
    let save = W.formalNewSave(mods.find(m => m.manifest.id === 'lcq.stage_01'));
    const beats = new Map(), compassSeen = new Map(), charSeen = new Map(), stagesSeen = [];
    const done = new Set();
    let n = 0;
    for (; n < 6000; n++) {
      const s = rt(save);
      if (stagesSeen.at(-1) !== s.modId) stagesSeen.push(s.modId);
      if (s.modId === 'lyl.heimohai_festival' || (s.modId === mods.at(-1)?.manifest?.id && W.unsettledRailBeats(s)?.length === 0)) { /* 终关判定由 walker 口径决定，下面统一 */ }
      const snap = sideSnapshot(save);
      const at = { step: n, stage: snap.stage, focus: snap.focus, location: snap.location };
      for (const d of snap.doable) {
        const b = beats.get(d.beatId) || { first: at, last: at, actions: new Set(), labels: new Set(), offeredFirst: null };
        b.last = at; b.actions.add(d.actionId); b.labels.add(d.label); beats.set(d.beatId, b);
      }
      for (const id of snap.offered) { const b = beats.get(id) || { first: null, last: null, actions: new Set(), labels: new Set(), offeredFirst: null }; b.offeredFirst ||= at; b.offeredLast = at; beats.set(id, b); }
      for (const id of snap.expired) { const b = beats.get(id); if (b && !b.expiredAt) b.expiredAt = at; }
      // 从未开过的拍：在它声明的关里逐条记 requires 子条件、线入口、关窗是否曾成立（诊断「默认路线做不到」的原因）。
      for (const { line, beat } of LINE_BEATS) {
        if (beat.stageId && beat.stageId !== s.modId) continue;
        const ctx = quietSync(() => QC.questLineContext(save, snap.focus || undefined));
        const conds = { entry: line.entry, ...(beat.closeWhen || line.closeWhen ? { closeWhen: beat.closeWhen || line.closeWhen } : {}),
          ...Object.fromEntries(('all' in (beat.requires || {}) ? beat.requires.all : beat.requires ? [beat.requires] : []).map((c, i) => [`requires.${i}:${JSON.stringify(c)}`, c])) };
        const b = beats.get(beat.id) || { first: null, last: null, actions: new Set(), labels: new Set(), offeredFirst: null };
        b.condEver ||= {};
        for (const [k, c] of Object.entries(conds)) b.condEver[k] ||= QL.lineConditionMet(c, ctx);
        beats.set(beat.id, b);
      }
      for (const c of snap.sidebarCharacter) { const b = beats.get(c.beatId); if (b) b.sidebar = true; }
      if (snap.compass.current || snap.compass.others.length) {
        const key = `${snap.compass.current}|${snap.compass.step}|${snap.compass.others.length}`;
        if (!compassSeen.has(snap.stage)) compassSeen.set(snap.stage, new Set());
        compassSeen.get(snap.stage).add(key);
      }
      if (snap.focus) for (const cb of CHAR_BEATS) if (cb.eventIds.includes(snap.focus) && !charSeen.has(cb.id)) charSeen.set(cb.id, at);
      for (const id of [...s.completedEventIds]) done.add(id);
      if (s.modId === 'lcq.stage_01' && n === 0) {}
      const stop = s.modId === (await finalId()) && W.unsettledRailBeats(s)?.length === 0;
      if (stop) break;
      save = W.step(save, mods, n).save;
    }
    for (const id of R.getScenarioFocusEvent(rt(save)) ? [] : []) done.add(id);
    // 编年史里的完成（跨关）。
    const PR = await loadTs('../src/modules/scenarioMods/playerLedgerRules.ts');
    for (const id of PR.orderedDoneEventIds(rt(save))) done.add(id);
    const finalState = { stage: rt(save).modId, receipts: Object.keys(rt(save).questLineState?.receipts || {}), expired: rt(save).questLineState?.expired || {} };
    return { steps: n, stagesSeen, beats, compassSeen, charSeen, done, finalState };
  }));
}
let FINAL_ID;
async function finalId() { if (!FINAL_ID) FINAL_ID = (await loadTs('../src/modules/scenarioMods/heimohaiFestival.ts')).FESTIVAL.finalStageId; return FINAL_ID; }

const fmt = at => at ? `${at.stage.replace(/^(lcq|lyl|lyg)\./, '')}／${String(at.focus || '—').replace(/^(lcq|lyl|lyg)\.event\./, '')}（步 ${at.step}）` : '—';
/** 入口（按设计）：人物线拍＝右栏「这一拍谁有戏」展开「回应／明确略过」按钮；支线拍＝任务模式下探索按钮被撤，只有手打（判定请求带探索候选）。 */
export const designedEntry = line => line.kind === 'character' ? '右栏「这一拍谁有戏」→「回应：…」按钮（填入输入框后发送）' : '手打（任务模式撤探索按钮；「可投的门路」默认隐藏）→ 意图判定候选里的探索动作';

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), ji = args.indexOf('--json'), jsonOut = ji >= 0 ? args[ji + 1] : null;
  const inv = await inventory();
  const rows = LINE_BEATS.map(({ line, beat }) => {
    const b = inv.beats.get(beat.id) || {};
    return { line: line.id, lineName: line.name, kind: line.kind, beat: beat.id, stageId: beat.stageId || null, locationId: beat.locationId || null,
      firstDoable: b.first || null, lastDoable: b.last || null, offeredFirst: b.offeredFirst || null, offeredLast: b.offeredLast || null, expiredAt: b.expiredAt || null,
      actions: [...(b.actions || [])], labels: [...(b.labels || [])], sidebar: !!b.sidebar, entry: designedEntry(line),
      condEver: b.condEver || null, requires: beat.requires || null, lineEntry: line.entry, closeWhen: beat.closeWhen || line.closeWhen || null, presentActorIds: beat.presentActorIds || null };
  });
  console.log(`[盘点] walker ${inv.steps} 步；途经 ${inv.stagesSeen.length} 关；收尾 ${inv.finalState.stage}`);
  console.log('\n## 线拍（questLines）');
  for (const r of rows) console.log(`- ${r.line} ${r.beat}［本关 ${r.stageId}］可做 ${fmt(r.firstDoable)} → ${fmt(r.lastDoable)}；规则开 ${fmt(r.offeredFirst)} → ${fmt(r.offeredLast)}；过期 ${fmt(r.expiredAt)}；动作 ${r.actions.join(',') || '—'}；右栏 ${r.sidebar}`);
  console.log('\n## 人物任务／高光（挂主线事件）');
  const charRows = CHAR_BEATS.map(cb => ({ ...cb, focusAt: inv.charSeen.get(cb.id) || null, done: cb.eventIds.some(id => inv.done.has(id)) }));
  for (const c of charRows.filter(c => c.kind === 'quest')) console.log(`- ${c.id} ${c.name} [${c.status}] ${c.eventIds.join('|')}：焦点 ${fmt(c.focusAt)}；默认路线完成 ${c.done}`);
  const hl = charRows.filter(c => c.kind === 'highlight');
  console.log(`- 高光 ${hl.length} 条，默认路线成为焦点 ${hl.filter(c => c.focusAt).length}、完成 ${hl.filter(c => c.done).length}：${hl.filter(c => c.focusAt).map(c => `${c.name}@${fmt(c.focusAt)}`).join('；')}`);
  console.log('\n## 二级线提示（当前线卡）');
  for (const [stage, set] of inv.compassSeen) console.log(`- ${stage}：${[...set].join(' ／ ')}`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ steps: inv.steps, stagesSeen: inv.stagesSeen, rows, charRows, compass: Object.fromEntries([...inv.compassSeen].map(([k, v]) => [k, [...v]])), finalState: inv.finalState }, null, 2));
}
