// REPORT-8091-f9737e0d 复测修复回归。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const json = p => JSON.parse(read(p));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: {
  '@': fileURLToPath(new URL('../src', import.meta.url)),
  './characterStore': fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts', import.meta.url)),
  '@/stores/characterStore': fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts', import.meta.url)),
} });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const load = p => jiti.import(new URL('../src/' + p, import.meta.url).pathname);
const R = await load('modules/scenarioMods/runtime.ts');
const NI = await load('modules/scenarioMods/naturalIntentRouter.ts');
const { parseScenarioMod } = await load('modules/scenarioMods/validator.ts');
const init = await load('modules/scenarioMods/strictInitializer.ts');
const { createMinimalSaveDataV3 } = await load('utils/dataRepair.ts');
const rt = s => s.世界.状态.剧本模组;
const quiet = fn => { const log = console.log; console.log = () => {}; try { return fn(); } finally { console.log = log; } };

// ───────────── P1 新开档 s01_03「受伤军士」不结算 ─────────────
// 「入六朝」新档：s01_01/s01_02 正常，s01_03 二十多回合不结算。真机驱动是把建议原句填进输入框再发送（按钮选择没带上），
// 走的是手打文字解析：建议原句「我上前查看那位伤者。」不含该拍任何作者短语（查看伤者/扶住伤者…），永远对不上。
// s01_01 的原句恰好命中短语、s01_02 靠 4 回合场外时钟到点结清，所以只在 s01_03（没有场外时钟）卡死。
// 与 3285eece / f9737e0d 无关：建议原句、s01_03 短语与 resolveStoryEventActionFromPlayerText 在两提交前（4c8245a5）就是这样。
const liuchaoNewGameAt = eventId => quiet(() => {
  const mod = parseScenarioMod(json('src/modules/scenarioMods/builtins/data/lcq.stage_01.json'));
  let s = R.advanceScenarioRuntime(init.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), init.buildStrictScenarioInitialization(mod))).saveData;
  for (let i = 0; i < 20 && !rt(s).activeEventIds.includes(eventId); i++) {
    const [a] = R.getCurrentStoryEventActions(s);
    if (a?.source === 'event_engine') R.recordStoryEventStructuredAction(s, a);
    s = R.advanceScenarioRuntime(s).saveData;
  }
  assert.ok(rt(s).activeEventIds.includes(eventId), eventId);
  return s;
});

test('P1 s01_03：手打/填入建议原句与点按建议同样结算（复现：旧解析对不上原句）', () => {
  const s = liuchaoNewGameAt('lcq.event.s01_03');
  const [suggested] = R.getCurrentStoryEventActions(s);
  assert.equal(suggested.playerLine, '我上前查看那位伤者。');
  assert.equal(R.resolveStoryEventActionFromPlayerText(structuredClone(s), suggested.playerLine), undefined, '复现：作者短语对不上建议原句');
  const typed = NI.resolveStoryEventActionFromText(s, suggested.playerLine);
  assert.equal(typed?.eventId, 'lcq.event.s01_03');
  assert.equal(typed?.actionId, suggested.actionId);
  // 标点/空白不同也算同一句；不是原句的照旧走作者短语，否定优先不变。
  assert.equal(NI.resolveStoryEventActionFromText(s, ' 我上前查看那位伤者 ')?.actionId, suggested.actionId);
  assert.equal(NI.resolveStoryEventActionFromText(s, '我扶住伤者')?.actionId, suggested.actionId);
  assert.equal(NI.resolveStoryEventActionFromText(s, '我转身离开，不管伤兵'), undefined);
  const settled = quiet(() => R.recordStoryEventStructuredAction(s, typed));
  assert.equal(settled.completed, true);
  const next = quiet(() => R.advanceScenarioRuntime(s).saveData);
  assert.ok(rt(next).completedEventIds.includes('lcq.event.s01_03'));
});

test('P1 通用：入六朝 s01 各拍建议原句手打都能对上本拍（s01_02/06 原句同样不在作者短语里）', () => {
  for (const id of ['lcq.event.s01_01', 'lcq.event.s01_02', 'lcq.event.s01_03', 'lcq.event.s01_04', 'lcq.event.s01_06']) {
    const s = liuchaoNewGameAt(id);
    const actions = R.getCurrentStoryEventActions(s).filter(a => a.eventId === id);
    assert.ok(actions.length, id);
    for (const a of actions) assert.equal(NI.resolveStoryEventActionFromText(s, a.playerLine)?.actionId, a.actionId, `${id} ${a.playerLine}`);
  }
});

test('P1 发送入口：自然意图别名与发送兜底都用认原句的解析', () => {
  const panel = read('src/components/dashboard/MainGamePanel.vue');
  assert.match(panel, /resolveFromText: resolveStoryEventActionFromText,/);
  assert.match(panel, /scenarioSaveAtSend \? resolveStoryEventActionFromText\(scenarioSaveAtSend, userMessage\)/);
  assert.doesNotMatch(panel, /resolveStoryEventActionFromPlayerText/);
});


// ───────────── ② 汉 08 舞都→洛都：剧情路程特例优先于国内片刻 ─────────────
// 回归来源：3285eece 把地图国内路线一律改成片刻，名单节点（questRouteDays.eventIds）只在罗盘里保住天数，地图「前往此地」也成了片刻。
const M = await load('modules/scenarioMods/travel/mapTravel.ts');
const AT = await load('modules/scenarioMods/actionTime.ts');
const RD = await load('modules/scenarioMods/travel/routeDays.ts');
const { GAME_NUMBERS: N } = await load('modules/sceneModule/numbers.ts');
const travelUi = json('mod-kit/cross-country-travel-ui.json');
const fixture = name => json('tests/fixtures/' + name).saves[0].存档数据;
const minutesOf = t => (((t.年 * 12 + t.月) * 30 + t.日) * 24 + t.小时) * 60 + t.分钟;
const MOMENT = N.story.actionTime.minutes.moment;
const WUDU = 'liuchao.location.wudu', LUOYANG = 'lyl.location.luoyang', HAN08 = 'lyl.event.taiquan_afterfall_08_beat';
const resolved = { judgementResolution: { status: 'resolved', outcome: 'success', kind: 'explore' } };
/** 汉线进线后跟主线走到 08 拍在舞都、罗盘指向洛都。 */
const hanAt08 = () => quiet(() => {
  let s = R.advanceScenarioRuntime(fixture('checkpoints/current-han-entry.json')).saveData;
  for (let i = 0; i < 12; i++) {
    const [a] = R.getCurrentStoryEventActions(s);
    if (a?.eventId === HAN08 && a.actionId.startsWith('travel:')) return { s, compass: a };
    assert.ok(a, `第${i}拍有主线动作`);
    R.recordStoryEventStructuredAction(s, a, resolved);
    rt(s).worldTurn++; s = R.advanceScenarioRuntime(s).saveData;
  }
  assert.fail('没走到汉 08 罗盘');
});

test('② 汉 08 进行中：地图点洛都按剧情路程天数，弹窗文案取 questRouteMapLabel，实际扣的天数与罗盘一致', () => {
  const { s, compass } = hanAt08();
  assert.equal(s.角色.位置.locationId, WUDU);
  const days = RD.domesticTravelDays(WUDU, LUOYANG);
  assert.ok(days >= 10 && days <= 12, `舞都→洛都约 11 日，实际 ${days}`);
  const preview = M.mapTravelPreview(s, LUOYANG);
  assert.equal(preview.days, days);
  assert.equal(preview.label, travelUi.questRouteMapLabel.replace('{days}', String(days)));
  assert.notEqual(preview.label, travelUi.domesticMapLabel);
  const map = structuredClone(s), before = minutesOf(map.元数据.时间);
  assert.equal(M.settleMapTravel(map, M.selectMapTravel(map, LUOYANG)), true);
  assert.equal(minutesOf(map.元数据.时间) - before, days * 1440, '地图实际扣的天数＝弹窗天数');
  assert.equal(map.角色.位置.locationId, LUOYANG);
  // 罗盘同口径。
  assert.equal(AT.questTravelMinutes(s, { eventAction: { ...compass, travelFromLocationId: WUDU } }), days * 1440);
});

test('② 特例只认名单节点进行中且目的地正是该拍地点：08 完成后、或去别处，照旧国内片刻', () => {
  const { s } = hanAt08();
  const done = structuredClone(s);
  rt(done).activeEventIds = rt(done).activeEventIds.filter(id => id !== HAN08);
  rt(done).completedEventIds = [...rt(done).completedEventIds, HAN08];
  const preview = M.mapTravelPreview(done, LUOYANG);
  assert.equal(preview.label, travelUi.domesticMapLabel);
  const before = minutesOf(done.元数据.时间);
  assert.equal(M.settleMapTravel(done, M.selectMapTravel(done, LUOYANG)), true);
  assert.equal(minutesOf(done.元数据.时间) - before, MOMENT);
  const src = read('src/modules/scenarioMods/travel/mapTravel.ts');
  assert.match(src, /questRouteDays\.eventIds/);
  assert.doesNotMatch(src, /剧情路程，约/, '文案只在 mod-kit');
});

// ───────────── ③ 手打「我去长安」国内移动：直接移动、耗时片刻，与地图/罗盘一致 ─────────────
// 根因：手打国内地点既不是当前罗盘目标（解析不出剧情移动），又没有地图选择，整句交给模型叙述——模型按提示词只写「打开地图按脚程算」，
// 人不动、时间照常按片刻扣。地图「前往此地」与罗盘建议都会真的挪人。
const CHANGAN = 'liuchao.location.changan', LIUXIANPING = 'lyg.location.liuxianping';
const tangAtLiuxianping = () => quiet(() => R.advanceScenarioRuntime(fixture('checkpoints/current-tang-entry.json')).saveData);

test('③ 手打「我去长安」：剧情罗盘接不住时按地图同一结算——到唐·长安、只耗片刻、正文补本地回执', () => {
  const s = tangAtLiuxianping();
  assert.equal(s.角色.位置.locationId, LIUXIANPING);
  assert.equal(NI.resolveStoryEventActionFromText(structuredClone(s), '我去长安'), undefined, '复现：不是当前罗盘目标，旧路径交给模型');
  const sel = M.domesticTypedTravel(s, '我去长安');
  assert.equal(sel?.toId, CHANGAN);
  const typed = structuredClone(s), map = structuredClone(s), before = minutesOf(s.元数据.时间);
  assert.equal(M.settleDomesticTypedTravel(typed, sel, '我去长安'), true);
  assert.equal(M.settleMapTravel(map, M.selectMapTravel(map, CHANGAN)), true);
  assert.equal(typed.角色.位置.locationId, CHANGAN);
  assert.equal(typed.角色.位置.描述, map.角色.位置.描述);
  assert.equal(minutesOf(typed.元数据.时间) - before, MOMENT);
  assert.equal(minutesOf(map.元数据.时间) - before, MOMENT, '与地图同耗时');
  const row = typed.系统.历史.叙事.at(-1);
  assert.equal(row.content, travelUi.domesticTypedArrival.replace('{name}', '长安').replace('{where}', typed.角色.位置.描述));
  assert.equal(row.userIntent, '我去长安');
});

test('③ 否定、问句、假设、跨国、原地都不当国内移动；发送入口在模型之前接住', () => {
  const s = tangAtLiuxianping();
  for (const text of ['我不想去长安', '别去长安', '要去长安吗？', '如果去长安会怎样', '我去临安', '我去留仙坪', '我看看四周'])
    assert.equal(M.domesticTypedTravel(s, text), undefined, text);
  assert.equal(M.domesticTypedTravel(s, '我动身前往长安。')?.toId, CHANGAN);
  const panel = read('src/components/dashboard/MainGamePanel.vue');
  const at = panel.indexOf('domesticTypedTravel(saveData, typed)'), intent = panel.indexOf('const intent = await resolveNaturalIntent(');
  assert.ok(at > 0 && at < intent, '手打国内移动在意图模型与叙事之前结算');
  assert.match(panel, /!resolveStoryEventActionFromText\(structuredClone\(saveData\), typed\) && !resolveWuyuanOpenWorldSelectionFromText\(saveData, typed\)/, '罗盘/开放世界优先');
  assert.ok(travelUi.domesticTypedArrival.includes('{where}'));
});
