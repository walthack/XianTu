// 包格式：mapRoutes 路线条目认可选的 via（途经坐标，只管赶路回放的画法、不影响天数）；非法 via 编译即报错。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { compileContentPacks } from '../scripts/content-packs.mjs';
const root = resolve(import.meta.dirname, '..');
const route = { id: 'test.route.via', fromId: 'liuchao.location.jiankang', toId: 'liuchao.location.lin_an', dayCost: 12 };
const withRoute = async (r, fn) => {
  await mkdir(join(root, '_newbot_tmp'), { recursive: true });
  const dir = await mkdtemp(join(root, '_newbot_tmp/map-route-via-'));
  try {
    await mkdir(join(dir, 'new'));
    await writeFile(join(dir, 'new/manifest.json'), JSON.stringify({ schemaVersion: 1, id: 'acceptance.via', contracts: [], drafts: [], statuses: [], stages: [], overlays: [], questLines: [], entities: [], mapRoutes: ['routes.json'] }));
    await writeFile(join(dir, 'new/routes.json'), JSON.stringify([r]));
    await fn(() => compileContentPacks({ packsDir: dir }));
  } finally { await rm(dir, { recursive: true, force: true }); }
};
test('不带 via 的路线照旧通过', () => withRoute(route, async compile => {
  const out = await compile();
  assert.deepEqual(out.mapRoutes, [route]);
}));
test('带 via 的路线通过校验，via 原样进 catalog', () => withRoute({ ...route, via: [{ x: 6500, y: 6200 }, { x: 7000, y: 6000.5 }] }, async compile => {
  const out = await compile();
  assert.deepEqual(out.mapRoutes[0].via, [{ x: 6500, y: 6200 }, { x: 7000, y: 6000.5 }]);
  assert.equal(out.mapRoutes[0].dayCost, 12, 'via 不影响天数');
}));
for (const [why, via] of [
  ['不是数组', { x: 1, y: 2 }],
  ['空数组', []],
  ['缺 y', [{ x: 1 }]],
  ['坐标不是数', [{ x: '1', y: 2 }]],
  ['坐标非有限', [{ x: 1, y: null }]],
  ['负坐标', [{ x: -1, y: 2 }]],
  ['超出地图 10000', [{ x: 10001, y: 2 }]],
  ['多余字段', [{ x: 1, y: 2, days: 3 }]],
  ['点是数组', [[1, 2]]],
]) test(`非法 via 报错：${why}`, () => withRoute({ ...route, via }, async compile => {
  await assert.rejects(compile, /invalid map route test\.route\.via/);
}));
test('未知字段仍报错（只多认 via 一个）', () => withRoute({ ...route, waypoints: [{ x: 1, y: 2 }] }, async compile => {
  await assert.rejects(compile, /invalid map route/);
}));
