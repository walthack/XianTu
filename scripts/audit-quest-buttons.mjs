#!/usr/bin/env node
// 离线审计（不调模型、不开浏览器）：任务引导开、按钮化方案 B（用户 2026-11-14 暂定）下，主线每一拍「开场时」主面板能给出什么主线按钮。
// 沿 tests/mainlineWalker.mjs 的整链推进（formalNewSave + step，与 mainlineWalkToEnding 同一条主链）逐拍走，
// 每个焦点拍第一次成为焦点时，按 MainGamePanel.scenarioEngineActionOptions 同口径（runtime 动作 → questActionGate 过滤）分类：
//   action      有主线动作按钮（含关键拍卡／分支选择承接的动作，另列）
//   travel      只有「前往」按钮（runtime questTravelSelection）；跨国目的地另标 crossCountry（点了走地图，不直送）
//   none        本拍有合同动作，但全被 questActionGate 滤掉、又没有前往按钮——玩家面前没有主线按钮
//   other       本拍没有主线合同动作（等待／机会卡／五原地方动作等，不在本审计范围）
// 用法：node scripts/audit-quest-buttons.mjs [--json 输出文件]
import { writeFileSync } from 'node:fs';
import { loadTs } from '../tests/loadTs.mjs';

globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
const quiet = async fn => { const k = ['log', 'info', 'warn', 'debug'], o = k.map(x => console[x]); k.forEach(x => { console[x] = () => {}; }); try { return await fn(); } finally { k.forEach((x, i) => { console[x] = o[i]; }); } };

const { step, rt, formalNewSave, loadMainlineMods, unsettledRailBeats, withFixedHost } = await quiet(() => import('../tests/mainlineWalker.mjs'));
const [R, QL, GN, MT, KB, BD, W, BG, ENV, TL] = await quiet(() => Promise.all([
  '../src/modules/scenarioMods/runtime.ts', '../src/modules/scenarioMods/questLog.ts', '../src/modules/sceneModule/numbers.ts',
  '../src/modules/scenarioMods/travel/mapTravel.ts', '../src/modules/scenarioMods/keyBeatCards.ts', '../src/modules/scenarioMods/branchDecision.ts',
  '../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts', '../src/modules/scenarioMods/baihuGambleRefusal.ts',
  '../src/modules/scenarioMods/eventNarrativeView.ts', '../src/modules/scenarioMods/travel/travelLedger.ts',
].map(p => loadTs(p))));
const FINAL = (await loadTs('../src/modules/scenarioMods/heimohaiFestival.ts')).FESTIVAL.finalStageId;
GN.GAME_NUMBERS.story.quest.enabled = true; // 模拟内测构建（enabledDev=true）；只改本进程内存。

const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const strip = (v, p) => String(v || '').startsWith(p) ? String(v).slice(p.length) : String(v || '');

/** 与 MainGamePanel.scenarioEngineActionOptions／engineButtonOptions 同口径（只看主线部分）。 */
function classify(save) {
  const state = rt(save), event = R.getScenarioFocusEvent(state);
  if (!event) return null;
  const raw = R.getCurrentStoryEventActions(save).filter(a => a.eventId === event.id);
  const travel = raw.find(a => a.actionId.startsWith('travel:'));
  const open = W.getWuyuanOpenWorldSelections(save);
  const contract = raw.filter(a => !a.actionId.startsWith('travel:') && !(open.length && a.eventId === 'lcq.event.s02_04'));
  const gated = contract.map(a => ({ a, gate: QL.questActionGate(save, a) }));
  const shown = gated.filter(x => x.gate.ok).map(x => x.a);
  const here = TL.currentLocation(save);
  const base = { stage: state.modId, eventId: event.id, at: here.canonicalLocationId || save.角色?.位置?.locationId || '', atText: save.角色?.位置?.描述 || '' };
  if (travel) {
    const cross = MT.crossCountryStoryTravel(save, travel);
    return { ...base, kind: 'travel', target: travel.actionId.slice(7), label: travel.label, crossCountry: Boolean(cross) };
  }
  if (shown.length) {
    const card = KB.getActiveKeyBeatCard(save);
    const branch = BD.detectBranchDecision([...R.getCurrentStoryEventActions(save).filter(a => QL.questActionGate(save, a).ok), ...R.getCurrentStoryExplorationActions(save), ...R.getTrackedStoryOpportunityActions(save), ...open, ...BG.getBaihuGambleRefusalSelections(save)]);
    const buttons = shown.filter(a => !KB.isKeyBeatCardAction(a));
    // 粗判（不含 runtime 的 sameSceneLocation）：人不在 event.locationId 却有动作按钮——runtime 没给前往（商路拍、五原、无罗盘短语等），动作照常可点。
    const offSite = Boolean(event.locationId && !QL.atLocation(base.at, event.locationId) && !QL.atLocation(event.locationId, base.at));
    return { ...base, kind: 'action', buttons: buttons.length, keyBeatCard: Boolean(card), branch: Boolean(branch), offSite, eventLocation: event.locationId || '', route: ENV.storyRouteLocation(event.id) || '' };
  }
  if (!contract.length) return { ...base, kind: 'other' };
  // none：说明为什么 runtime 没给 travel。
  const blocked = gated.map(({ a, gate }) => {
    const c = QL.questBeatSpec(a.eventId)?.actions?.[a.actionId]?.completion || {};
    return { actionId: a.actionId, where: c.where, who: c.who, gateWhere: gate.where, gateWho: gate.who };
  });
  const needWhere = blocked.find(b => b.gateWhere === false)?.where;
  const whereId = strip(needWhere, 'place:');
  const runtimeTarget = event.playerCompletionContract?.actions?.find(x => contract.some(a => a.actionId === x.id))?.locationId || event.locationId;
  let why;
  if (blocked.every(b => b.gateWhere !== false)) why = '人在场但要见的人不在（who 闸门）；前往按钮解决不了';
  else if (ENV.storyRouteLocation(event.id)) why = `商路拍（routeLocation=${ENV.storyRouteLocation(event.id)}），runtime 不给前往`;
  else if (event.id === 'lcq.event.s02_04') why = '五原开放世界拍，移动由地方动作承担';
  else if (!runtimeTarget) why = '事件与合同动作都没写 locationId，runtime 不给前往';
  else if (QL.atLocation(base.at, runtimeTarget) || QL.atLocation(runtimeTarget, base.at)) why = `runtime 按 locationId=${runtimeTarget} 判为已到场，与任务数据 completion.where=${whereId} 不一致`;
  else why = '有目标地点但罗盘短语／地点名为空（questCompassPhrases 未给出「去某地」）';
  return { ...base, kind: 'none', need: whereId, needName: QL.locationName(whereId), runtimeTarget: runtimeTarget || '', blocked, why };
}

const result = await quiet(() => withFixedHost(async () => {
  const mods = await loadMainlineMods();
  let save = formalNewSave(mods.find(m => m.manifest.id === 'lcq.stage_01'));
  const seen = new Set(), rows = [];
  let n = 0, travelFollow = null;
  for (; n < 6000; n++) {
    const state = rt(save);
    if (state.modId === FINAL && unsettledRailBeats(state)?.length === 0) break;
    const row = classify(save);
    if (row && !seen.has(row.eventId)) { seen.add(row.eventId); rows.push(row); if (row.kind === 'travel') travelFollow = row; }
    else if (row && travelFollow && row.eventId === travelFollow.eventId && !travelFollow.after) travelFollow.after = row.kind === 'travel' ? 'travel' : row.kind;
    save = step(save, mods, n).save;
  }
  return { steps: n, rows, finalStage: rt(save).modId };
}));

const count = k => result.rows.filter(r => r.kind === k).length;
const lines = [];
lines.push(`整链 ${result.steps} 步，终关 ${result.finalStage}；焦点拍 ${result.rows.length} 个。`);
lines.push(`开场：有动作按钮 ${count('action')}；只有前往 ${count('travel')}（其中跨国走地图 ${result.rows.filter(r => r.kind === 'travel' && r.crossCountry).length}）；什么主线按钮都没有 ${count('none')}；无主线合同动作（other）${count('other')}。`);
lines.push(`有动作按钮的拍里：关键拍卡在场 ${result.rows.filter(r => r.kind === 'action' && r.keyBeatCard).length}，分支选择 ${result.rows.filter(r => r.kind === 'action' && r.branch).length}。`);
const after = result.rows.filter(r => r.kind === 'travel');
lines.push(`有动作按钮但人不在 event.locationId（粗判）${result.rows.filter(r => r.kind === 'action' && r.offSite).length}：${result.rows.filter(r => r.kind === 'action' && r.offSite).map(r => `${r.eventId}@${r.at}→${r.eventLocation}${r.route ? '(商路)' : ''}`).join('；')}`);
lines.push(`只有前往的拍，点前往后的下一步：${JSON.stringify(after.reduce((m, r) => (m[r.after || '(未观察到)'] = (m[r.after || '(未观察到)'] || 0) + 1, m), {}))}`);
lines.push('', '## 什么主线按钮都没有的拍');
for (const r of result.rows.filter(x => x.kind === 'none')) lines.push(`- ${r.stage} ${r.eventId}：要求 ${r.need || '-'}（${r.needName || '-'}）；当时 ${r.at}（${r.atText}）；runtime 目标 ${r.runtimeTarget || '-'}；原因：${r.why}；闸门 ${JSON.stringify(r.blocked.map(b => [b.actionId, b.gateWhere, b.gateWho]))}`);
lines.push('', '## 只有前往且跨国（走地图）的拍');
for (const r of result.rows.filter(x => x.kind === 'travel' && x.crossCountry)) lines.push(`- ${r.stage} ${r.eventId}：${r.at} → ${r.target}`);
console.log(lines.join('\n'));
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(result, null, 2));
