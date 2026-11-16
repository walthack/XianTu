// 地图移动第一步「赶路过程」回放（纯表现）：路径、时长、进度→位置与日期行；天数与结算同源。
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: {
  '@': fileURLToPath(new URL('../src', import.meta.url)),
  './characterStore': fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts', import.meta.url)),
  '@/stores/characterStore': fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts', import.meta.url)),
} });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const load = p => jiti.import(new URL('../src/' + p, import.meta.url).pathname);
const P = await load('modules/scenarioMods/travel/travelPlayback.ts');
const from = { x: 1000, y: 1000 }, to = { x: 5000, y: 1000 };

test('时长：片刻约1秒，1–5日约2.5秒，再长按天数加、上限约6秒，「数日」按2.5秒', () => {
  assert.equal(P.travelPlaybackDuration(0), 1000);
  assert.equal(P.travelPlaybackDuration(1), 2500);
  assert.equal(P.travelPlaybackDuration(5), 2500);
  assert.equal(P.travelPlaybackDuration(29), 2500 + 24 * 100);
  assert.ok(P.travelPlaybackDuration(29) > P.travelPlaybackDuration(10));
  assert.equal(P.travelPlaybackDuration(60), 6000);
  assert.equal(P.travelPlaybackDuration(10000), 6000);
  assert.equal(P.travelPlaybackDuration('several'), 2500);
});

test('无途经点：两端点落在出发地/目的地，中间略带弧度（不是直线）', () => {
  const plan = P.travelPlaybackPlan({ from, to, days: 3, destinationName: '建康' });
  assert.deepEqual(plan.path[0], from);
  assert.deepEqual(plan.path.at(-1), to);
  const mid = plan.path[Math.floor(plan.path.length / 2)];
  assert.ok(Math.abs(mid.y - 1000) > 100, `弧线中点应偏离直线：${mid.y}`);
  assert.ok(Math.abs(mid.y - 1000) < 1000, '弧度只是略带');
});

test('有途经点：曲线经过每个途经点', () => {
  const via = [{ x: 2000, y: 3000 }, { x: 4000, y: 2500 }];
  const plan = P.travelPlaybackPlan({ from, to, days: 7, via, destinationName: '建康' });
  assert.deepEqual(plan.path[0], from);
  assert.deepEqual(plan.path.at(-1), to);
  for (const v of via) assert.ok(plan.path.some(p => Math.hypot(p.x - v.x, p.y - v.y) < 1e-6), `应经过 ${JSON.stringify(v)}`);
});

test('进度→位置：t=0 在出发地，t=1 在目的地，走过的路单调变长', () => {
  const plan = P.travelPlaybackPlan({ from, to, days: 29, destinationName: '建康' });
  assert.deepEqual(P.travelPlaybackFrame(plan, 0).point, from);
  const end = P.travelPlaybackFrame(plan, 1);
  assert.deepEqual(end.point, to);
  assert.equal(end.arrived, true);
  assert.equal(P.travelPlaybackFrame(plan, 0.5).arrived, false);
  let last = -1;
  for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const f = P.travelPlaybackFrame(plan, t);
    assert.ok(f.traveled.length >= 2);
    assert.deepEqual(f.traveled.at(-1), f.point);
    const d = Math.hypot(f.point.x - from.x, f.point.y - from.y);
    assert.ok(d > last, `t=${t} 应更远`); last = d;
  }
  assert.deepEqual(P.travelPlaybackFrame(plan, 2).point, to, '越界按抵达');
});

test('日期行：按天的路从第1日翻到第N日，抵达时写「第 N 日 · 抵达某地」，一天不多', () => {
  const plan = P.travelPlaybackPlan({ from, to, days: 29, destinationName: '建康' });
  assert.equal(P.travelPlaybackFrame(plan, 0).dayLine, '第 1 日 · 途中');
  assert.equal(P.travelPlaybackFrame(plan, 1).dayLine, '第 29 日 · 抵达建康');
  const days = new Set();
  for (let i = 0; i < 1000; i++) {
    const m = /^第 (\d+) 日 · 途中$/.exec(P.travelPlaybackFrame(plan, i / 1000).dayLine);
    assert.ok(m); days.add(Number(m[1]));
  }
  assert.ok(Math.max(...days) <= 29 && Math.min(...days) === 1);
  assert.ok(days.size > 20, '日期随进度往后翻');
  const one = P.travelPlaybackPlan({ from, to, days: 1, destinationName: '长安' });
  assert.equal(P.travelPlaybackFrame(one, 0.5).dayLine, '第 1 日 · 途中');
  assert.equal(P.travelPlaybackFrame(one, 1).dayLine, '第 1 日 · 抵达长安');
});

test('片刻与「数日」：只显示「途中 → 抵达某地」，不翻日期', () => {
  for (const days of [0, 'several']) {
    const plan = P.travelPlaybackPlan({ from, to, days, destinationName: '大明宫' });
    assert.equal(P.travelPlaybackFrame(plan, 0.4).dayLine, '途中');
    assert.equal(P.travelPlaybackFrame(plan, 1).dayLine, '抵达大明宫');
  }
});

test('同一点（出发地=目的地坐标重合）不出 NaN', () => {
  const plan = P.travelPlaybackPlan({ from, to: from, days: 0, destinationName: '此地' });
  const f = P.travelPlaybackFrame(plan, 0.5);
  assert.ok(Number.isFinite(f.point.x) && Number.isFinite(f.point.y));
});

test('模块是纯表现：不读存档、不碰 DOM、时长常量不进 mod-kit 配置', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/modules/scenarioMods/travel/travelPlayback.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /^import /m);
  assert.doesNotMatch(src, /\b(?:document|window|localStorage|SaveData)\b/);
});

test('回放天数与结算同源：跨国＝实际扣的天数、国内＝片刻（0）、落账前读、不改存档', async () => {
  const { loadTs } = await import('./loadTs.mjs');
  const { readFileSync } = await import('node:fs');
  const M = await loadTs('../src/modules/scenarioMods/travel/mapTravel.ts');
  const { gameTimeMinutes } = await loadTs('../src/utils/time.ts');
  const config = JSON.parse(readFileSync(new URL('../mod-kit/numbers-runtime.json', import.meta.url))).crossCountryTravel;
  const saveAt = id => ({元数据:{时间:{年:220,月:1,日:1,小时:0,分钟:0}},角色:{位置:{locationId:id}},系统:{扩展:{}},世界:{状态:{剧本模组:{worldTurn:1,completedEventIds:[]}}}});
  let checked = 0;
  for (const [a, fromId] of Object.entries(config.capitals)) for (const [b, toId] of Object.entries(config.capitals)) {
    if (a === b || !config.destinations[b]?.includes(toId)) continue;
    const s = saveAt(fromId), selection = M.selectMapTravel(s, toId);
    if (!selection) continue;
    const before = structuredClone(s), playback = M.mapTravelPlaybackRoute(s, selection);
    assert.deepEqual(s, before, '只读');
    const t0 = gameTimeMinutes(s.元数据.时间);
    assert.equal(M.settleMapTravel(s, selection), true);
    assert.equal(playback.days * 1440, gameTimeMinutes(s.元数据.时间) - t0, `${a}→${b}`);
    checked++;
  }
  assert.ok(checked > 10);
  // 国内：建康→江州（晋国两个落点）＝片刻
  const s = saveAt('liuchao.location.jiankang'), selection = M.selectMapTravel(s, 'liuchao.location.jiangzhou');
  assert.ok(selection);
  assert.deepEqual(M.mapTravelPlaybackRoute(s, selection), { days: 0 });
});
