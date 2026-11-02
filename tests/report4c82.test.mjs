// REPORT-8091-4c8245a5 复测修复回归。
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
const M = await load('modules/scenarioMods/travel/mapTravel.ts');
const AT = await load('modules/scenarioMods/actionTime.ts');
const RD = await load('modules/scenarioMods/travel/routeDays.ts');
const { GAME_NUMBERS: N } = await load('modules/sceneModule/numbers.ts');
const travelUi = json('mod-kit/cross-country-travel-ui.json');
const rt = s => s.世界.状态.剧本模组;
const fixture = name => json('tests/fixtures/' + name).saves[0].存档数据;
const minutesOf = t => (((t.年 * 12 + t.月) * 30 + t.日) * 24 + t.小时) * 60 + t.分钟;
const MOMENT = N.story.actionTime.minutes.moment;
const CHANGAN = 'liuchao.location.changan', LIUXIANPING = 'lyg.location.liuxianping';
const resolved = { judgementResolution: { status: 'resolved', outcome: 'success', kind: 'explore' } };

// ───────────── P1 国内移动只耗片刻（唐·留仙坪→长安） ─────────────
// 两轮路径：75eaaee0 走的是罗盘建议「去长安 · 见石超 · 见祁远」（3/29 14:58→15:13，15 分钟）；
// 4c8245a5 走的是世界地图点长安「前往此地」（弹窗「约10日路程」，224/3/28→4/8）。地图国内代表点折天来自 cd167d7a（试玩69），不是近四个提交。
const tangAtLiuxianping = () => {
  const s = R.advanceScenarioRuntime(fixture('checkpoints/current-tang-entry.json')).saveData;
  assert.equal(s.角色.位置.locationId, LIUXIANPING);
  return s;
};
/** 跟主线走到罗盘给出「去长安」。 */
function tangChanganCompass() {
  let s = tangAtLiuxianping(), a;
  for (let i = 0; i < 12; i++) {
    [a] = R.getCurrentStoryEventActions(s);
    assert.ok(a, `第${i}拍有主线动作`);
    if (a.actionId.startsWith('travel:')) break;
    R.recordStoryEventStructuredAction(s, a, resolved);
    rt(s).worldTurn++; s = R.advanceScenarioRuntime(s).saveData;
  }
  assert.equal(a.actionId, 'travel:' + CHANGAN);
  return { s, a };
}
/** 罗盘动作落账＋按界面口径结算耗时；模型故意给「一日」，确认国内罗盘不看模型档也不折天。 */
function settleCompass(s, a, id) {
  const from = s.角色.位置.locationId, before = minutesOf(s.元数据.时间);
  assert.equal(R.recordStoryEventStructuredAction(s, a, resolved).attempted, true);
  AT.settleActionTime(s, { action_time: { tier: '一日' } }, { eventAction: { ...a, travelFromLocationId: from }, timeActionId: id }, undefined, false, false, undefined);
  return minutesOf(s.元数据.时间) - before;
}

test('P1 地图：唐·留仙坪点长安，弹窗不显示「约N日」（显示 mod-kit 国内文案），确认后只耗片刻、到唐·长安', () => {
  const s = tangAtLiuxianping();
  assert.ok(RD.domesticTravelDays(LIUXIANPING, CHANGAN) >= 2, '两地坐标本可折成多日，确认不是距离太近');
  const preview = M.mapTravelPreview(s, CHANGAN);
  assert.equal(preview.label, travelUi.domesticMapLabel);
  assert.equal(preview.days, null);
  assert.doesNotMatch(preview.label, /约\d+日/);
  const before = minutesOf(s.元数据.时间);
  assert.equal(M.settleMapTravel(s, M.selectMapTravel(s, CHANGAN)), true);
  assert.equal(minutesOf(s.元数据.时间) - before, MOMENT);
  assert.equal(s.角色.位置.locationId, CHANGAN);
  assert.equal(s.角色.位置.描述, '唐·长安');
});

test('P1 地图：国内路线（含作者登记路线）一律片刻；跨国按天数', () => {
  assert.equal(M.mapRouteMinutes({ id: 'authored', fromId: LIUXIANPING, toId: CHANGAN, dayCost: 7 }), MOMENT);
  assert.equal(M.mapRouteMinutes({ id: 'x', fromId: CHANGAN, toId: 'liuchao.location.lin_an', dayCost: 9 }), 9 * 1440);
});

test('P1 地图跨国仍按天数：唐·留仙坪→宋·临安弹窗「约N日路程」，结算 N 日', () => {
  const s = tangAtLiuxianping(), to = 'liuchao.location.lin_an';
  const preview = M.mapTravelPreview(s, to);
  assert.match(preview.label, /^约\d+日路程$/);
  assert.ok(preview.days >= 1);
  const before = minutesOf(s.元数据.时间);
  assert.equal(M.settleMapTravel(s, M.selectMapTravel(s, to)), true);
  assert.equal(minutesOf(s.元数据.时间) - before, preview.days * 1440);
  assert.equal(s.角色.位置.locationId, to);
});

test('P1 罗盘建议：留仙坪「去长安」只耗片刻（不按模型「一日」，也不按路程折天）', () => {
  const { s, a } = tangChanganCompass();
  assert.equal(AT.questTravelMinutes(s, { eventAction: { ...a, travelFromLocationId: LIUXIANPING } }), undefined);
  assert.equal(settleCompass(s, a, 'compass-changan'), MOMENT);
  assert.equal(s.角色.位置.locationId, CHANGAN);
});

test('P1 手打：留仙坪手打「我去长安」解析到罗盘同一移动动作，只耗片刻', () => {
  const { s, a } = tangChanganCompass(), text = '我去长安';
  const typed = R.resolveStoryEventActionFromPlayerText(structuredClone(s), text);
  assert.equal(typed?.actionId, a.actionId, '手打解析到罗盘同一动作');
  assert.equal(M.crossCountryStoryTravel(s, typed), undefined, '国内不引去地图');
  assert.equal(M.mapPreparationNotice(s, text), undefined, '国内手打不出跨国提示');
  assert.equal(settleCompass(s, typed, 'typed-changan'), MOMENT);
  assert.equal(s.角色.位置.locationId, CHANGAN);
});

test('P1 名单节点仍按路程天数：汉 08 舞都→洛都折天；同段路挂别的节点不折天', () => {
  assert.deepEqual(N.story.actionTime.questRouteDays.eventIds, ['lyl.event.taiquan_afterfall_08_beat']);
  const han = fixture('checkpoints/current-han-entry.json');
  const days = RD.domesticTravelDays('liuchao.location.wudu', 'lyl.location.luoyang');
  assert.ok(days >= 1);
  const han08 = { source: 'event_engine', eventId: 'lyl.event.taiquan_afterfall_08_beat', actionId: 'travel:lyl.location.luoyang', travelFromLocationId: 'liuchao.location.wudu' };
  assert.equal(AT.questTravelMinutes(han, { eventAction: han08 }), days * 1440);
  assert.equal(AT.questTravelMinutes(han, { eventAction: { ...han08, eventId: 'lyl.event.taiquan_afterfall_07_beat' } }), undefined);
});

test('P1 文案进 mod-kit：国内地图标签取 cross-country-travel-ui.json，地图国内分支不再按坐标折天', () => {
  assert.ok(travelUi.domesticMapLabel && !/\d+日/.test(travelUi.domesticMapLabel));
  const src = read('src/modules/scenarioMods/travel/mapTravel.ts');
  assert.match(src, /label: travelUi\.domesticMapLabel/);
  assert.doesNotMatch(src, /rule\.minDays/);
});
