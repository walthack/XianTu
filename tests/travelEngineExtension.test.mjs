import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const engine = () => loadTs('../src/modules/scenarioMods/openWorldSlice.ts');

// 小型南荒样例：白夷区（自由段 _01 后开、_14 前关）与碧鲮区，之间一条只能强制的 journey。
function definition() {
  return {
    id: 'test.nanhuang',
    initialZoneId: 'baiyi',
    areas: [
      {
        id: 'area.baiyi', name: '白夷', continent: '南荒',
        freeRoamWhen: { after: ['e.s04b_01'], until: ['e.s04b_14'] },
        background: [
          { when: [], text: '送亲队伍刚到白夷。' },
          { when: ['e.s04b_10'], text: '地宫之事过后，寨中戒备。' },
        ],
      },
      { id: 'area.biyu', name: '碧鲮', continent: '南荒' },
    ],
    zones: [
      { id: 'baiyi', name: '白夷寨', areaId: 'area.baiyi', worldLocationId: 'liuchao.location.baiyi' },
      { id: 'huamiao_house', name: '花苗人住处', parentZoneId: 'baiyi', kind: 'interior' },
      { id: 'underground', name: '地宫', parentZoneId: 'baiyi', kind: 'interior', heardWhen: ['e.s04b_09'] },
      { id: 'biyu', name: '碧鲮村', areaId: 'area.biyu', worldLocationId: 'liuchao.location.biyu', heardWhen: ['e.s03b_01'] },
    ],
    routes: [
      { id: 'r.house', fromZoneId: 'baiyi', toZoneId: 'huamiao_house', label: '去花苗人住处', turnCost: 1 },
      { id: 'r.house_back', fromZoneId: 'huamiao_house', toZoneId: 'baiyi', label: '回寨中', turnCost: 1 },
      { id: 'r.underground', fromZoneId: 'baiyi', toZoneId: 'underground', label: '下地宫', turnCost: 1, unlockWhen: ['e.s04b_10'] },
      {
        id: 'r.to_biyu', fromZoneId: 'baiyi', toZoneId: 'biyu', label: '同往碧鲮', turnCost: 1,
        kind: 'journey', dayCost: 'several', forcedBy: { afterEventDone: 'e.s04b_14' },
        companions: ['祁远'], summary: '商队离开白夷，沿山路南下。',
      },
      {
        id: 'r.biyu_known', fromZoneId: 'huamiao_house', toZoneId: 'biyu', label: '另一条', turnCost: 1,
        kind: 'journey', dayCost: 2, forcedBy: { stageTransition: 'a→b' },
      },
    ],
    notices: [], actors: [], problems: [], actions: [],
  };
}

async function freshState(def) {
  const { hydrateOpenWorldSliceRuntime } = await engine();
  const state = hydrateOpenWorldSliceRuntime({}, def);
  state.knownZoneIds.push('huamiao_house', 'underground', 'biyu');
  state.knownRouteIds.push('r.house', 'r.house_back', 'r.underground', 'r.to_biyu');
  return state;
}

test('journey 只能强制：玩家主动走被拒，也不出现在可选目的地', async () => {
  const { settleOpenWorldTravel, matchOpenWorldTravelInput, getOpenWorldSliceView } = await engine();
  const def = definition();
  const state = await freshState(def);
  assert.equal(settleOpenWorldTravel(state, def, 'r.to_biyu', 'p:1').reason, 'forced_only');
  assert.equal(state.currentZoneId, 'baiyi');
  assert.equal(matchOpenWorldTravelInput(state, def, '我去碧鲮村').status, 'none');
  assert.deepEqual(getOpenWorldSliceView(state, def).destinations.map(item => item.routeId).sort(), ['r.house', 'r.underground']);
});

test('强制 journey 回执记天数；several 记占位 3 天并打标；旧档 hydrate 保留', async () => {
  const { settleOpenWorldForcedTravel, hydrateOpenWorldSliceRuntime, routeDayCost, SEVERAL_DAYS_PLACEHOLDER } = await engine();
  const def = definition();
  const state = await freshState(def);
  const settled = settleOpenWorldForcedTravel(state, def, 'r.to_biyu', 'e.s04b_14');
  assert.equal(settled.status, 'settled');
  assert.equal(settled.receipt.receiptId, 'forced:e.s04b_14:r.to_biyu');
  assert.equal(settled.receipt.dayCost, SEVERAL_DAYS_PLACEHOLDER);
  assert.equal(settled.receipt.dayCostSeveral, true);
  assert.equal(settled.receipt.turnCost, 1, 'journey 只占一轮');
  assert.equal(state.currentZoneId, 'biyu');
  const reloaded = hydrateOpenWorldSliceRuntime(JSON.parse(JSON.stringify(state)), def);
  assert.equal(reloaded.travelReceipts[0].dayCost, 3);
  assert.equal(reloaded.travelReceipts[0].dayCostSeveral, true);
  assert.deepEqual(routeDayCost(def.routes[4]), { days: 2, several: false });
  assert.deepEqual(routeDayCost(def.routes[0]), { days: 0, several: false }, 'local 不计天');
});

test('forcedBy 能按前一拍完成或转关找到路线', async () => {
  const { forcedRoutesFor } = await engine();
  const def = definition();
  assert.deepEqual(forcedRoutesFor(def, { afterEventDone: 'e.s04b_14' }).map(item => item.id), ['r.to_biyu']);
  assert.deepEqual(forcedRoutesFor(def, { stageTransition: 'a→b' }).map(item => item.id), ['r.biyu_known']);
  assert.deepEqual(forcedRoutesFor(def, { afterEventDone: 'e.none' }), []);
});

test('地点三态：到过／听闻／隐藏推导；世界地点按规范 id 比较，未定义的一律隐藏', async () => {
  const { zoneVisibility, worldLocationVisibility, settleOpenWorldForcedTravel } = await engine();
  const def = definition();
  const state = await freshState(def);
  assert.equal(zoneVisibility(state, def, 'baiyi', []), 'visited', '当前所在算到过');
  assert.equal(zoneVisibility(state, def, 'underground', []), 'hidden');
  assert.equal(zoneVisibility(state, def, 'underground', ['e.s04b_09']), 'heard');
  assert.equal(zoneVisibility(state, def, 'nope', ['e.s04b_09']), 'hidden');
  assert.equal(worldLocationVisibility(state, def, 'liuchao.location.biyu_village', []), 'hidden');
  assert.equal(worldLocationVisibility(state, def, 'liuchao.location.biyu_village', ['e.s03b_01']), 'heard', '别名 biyu 与 biyu_village 视为同一处');
  assert.equal(worldLocationVisibility(state, def, 'liuchao.location.liuligu', ['e.s03b_01']), 'hidden', '定义里没有的南荒地点 fail closed');
  settleOpenWorldForcedTravel(state, def, 'r.to_biyu', 'e.s04b_14');
  assert.equal(worldLocationVisibility(state, def, 'liuchao.location.biyu', []), 'visited');
  assert.equal(zoneVisibility(state, def, 'baiyi', []), 'visited', '回执起点也算到过');
});

test('自由段与「到过·当前不可前往」：只在当前区、自由段开放、路线已解锁时可前往', async () => {
  const { zoneTravelStatus, settleOpenWorldTravel, settleOpenWorldForcedTravel } = await engine();
  const def = definition();
  const state = await freshState(def);
  assert.equal(settleOpenWorldTravel(state, def, 'r.house', 'p:1').status, 'settled');
  assert.equal(settleOpenWorldTravel(state, def, 'r.house_back', 'p:2').status, 'settled');
  assert.deepEqual(zoneTravelStatus(state, def, 'huamiao_house', ['e.s04b_01']), { visibility: 'visited', current: false, canTravel: true });
  assert.deepEqual(zoneTravelStatus(state, def, 'huamiao_house', []), {
    visibility: 'visited', current: false, canTravel: false, label: '到过·当前不可前往',
  }, '自由段未开');
  assert.equal(zoneTravelStatus(state, def, 'huamiao_house', ['e.s04b_01', 'e.s04b_14']).canTravel, false, '自由段已关');
  assert.deepEqual(zoneTravelStatus(state, def, 'baiyi', ['e.s04b_01']), { visibility: 'visited', current: true, canTravel: false });
  assert.equal(zoneTravelStatus(state, def, 'underground', ['e.s04b_01', 'e.s04b_09']).visibility, 'heard');
  settleOpenWorldForcedTravel(state, def, 'r.to_biyu', 'e.s04b_14');
  assert.deepEqual(zoneTravelStatus(state, def, 'huamiao_house', ['e.s04b_01', 'e.s04b_14']), {
    visibility: 'visited', current: false, canTravel: false, label: '到过·当前不可前往',
  }, '离开白夷后不能回去');
});

test('行旅区：自由段窗口、按时点分段的背景、路线解锁', async () => {
  const { areaFreeRoamOpen, areaBackground, areaIdOf, routeUnlocked } = await engine();
  const def = definition();
  const [baiyi, biyu] = def.areas;
  assert.equal(areaIdOf(def, 'huamiao_house'), 'area.baiyi', '子节点沿父节点继承行旅区');
  assert.equal(areaFreeRoamOpen(baiyi, []), false);
  assert.equal(areaFreeRoamOpen(baiyi, ['e.s04b_01']), true);
  assert.equal(areaFreeRoamOpen(baiyi, ['e.s04b_01', 'e.s04b_14']), false);
  assert.equal(areaFreeRoamOpen(biyu, ['e.s04b_14']), false, '没声明自由段的区不开放');
  assert.equal(areaBackground(baiyi, []), '送亲队伍刚到白夷。');
  assert.equal(areaBackground(baiyi, ['e.s04b_10']), '地宫之事过后，寨中戒备。');
  assert.equal(areaBackground(biyu, []), '');
  assert.equal(routeUnlocked(def.routes[2], []), false);
  assert.equal(routeUnlocked(def.routes[2], ['e.s04b_10']), true);
  assert.equal(routeUnlocked(def.routes[0], []), true);
});

test('advanceClock：分钟沿用 N10；journey 按天；数日写相对日并保留到下一次具体天数', async () => {
  const { advanceClock, RELATIVE_DAY_LABEL } = await loadTs('../src/modules/scenarioMods/travel/travelLedger.ts');
  const { normalizeGameTime } = await loadTs('../src/utils/time.ts');
  const save = { 元数据: { 时间: { 年: 1, 月: 7, 日: 29, 小时: 23, 分钟: 59 } } };
  const minute = advanceClock(save, { minutes: 1 }, 'module_turn');
  assert.deepEqual(minute.oldValue, { 年: 1, 月: 7, 日: 29, 小时: 23, 分钟: 59 });
  assert.deepEqual(save.元数据.时间, { 年: 1, 月: 7, 日: 30, 小时: 0, 分钟: 0 });
  advanceClock(save, { days: 'several' }, 'forced:e.s04b_14:r.to_biyu');
  assert.deepEqual(save.元数据.时间, { 年: 1, 月: 8, 日: 3, 小时: 0, 分钟: 0, 相对日: RELATIVE_DAY_LABEL });
  advanceClock(save, { minutes: 5 }, 'module_turn');
  assert.equal(save.元数据.时间.相对日, '数日后', '到达后普通回合仍用相对日，不暴露占位天数');
  assert.equal(normalizeGameTime(save.元数据.时间).相对日, '数日后');
  advanceClock(save, { days: 1 }, 'forced:x:y');
  assert.deepEqual(save.元数据.时间, { 年: 1, 月: 8, 日: 4, 小时: 0, 分钟: 5 });
  assert.equal(advanceClock({}, { minutes: 1 }, 'x'), null);
  assert.deepEqual(normalizeGameTime({ 年: 1, 月: 1, 日: 1, 小时: 0, 分钟: 61 }), { 年: 1, 月: 1, 日: 1, 小时: 1, 分钟: 1 }, '无相对日时形状不变');
});
