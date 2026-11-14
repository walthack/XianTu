// 跨国「前往」按钮（用户 2026-11-14 选 a）：点了不填输入框，直接打开地图并带上落点（?goto=），地图面板按它选中地点；其余按钮照旧填输入框。
// clickEngineOption 直接截 MainGamePanel.vue 源码执行（同 questButtonsPlanB 的 cut 做法）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { loadTs } from './loadTs.mjs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const M = await loadTs('../src/modules/scenarioMods/travel/mapTravel.ts');
const panel = read('src/components/dashboard/MainGamePanel.vue');
const map = read('src/components/dashboard/GameMapPanel.vue');
const save = R.advanceScenarioRuntime(JSON.parse(read('tests/fixtures/checkpoints/current-han-entry.json')).saves[0].存档数据).saveData;

const start = panel.indexOf('const clickEngineOption = '), end = panel.indexOf('const selectScenarioEngineAction = ', start);
assert.ok(start >= 0 && end > start);
const build = new Function('gameStateStore', 'crossCountryStoryTravel', 'crossCountryStoryTravelToast', 'selectScenarioEngineAction', 'toast', 'router',
  ts.transpileModule(panel.slice(start, end) + '\nreturn clickEngineOption;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText);
const click = option => {
  const seen = { filled: [], pushed: [], toasts: [] };
  build({ toSaveData: () => save }, M.crossCountryStoryTravel, M.crossCountryStoryTravelToast, o => seen.filled.push(o),
    { info: t => seen.toasts.push(t) }, { push: async to => { seen.pushed.push(to); } })(option);
  return seen;
};

test('跨国前往按钮：打开地图并带上落点，不填输入框', () => {
  assert.equal(save.角色.位置.locationId, 'liuchao.location.wudu');
  const option = { source: 'event_engine', eventId: 'x', actionId: 'travel:liuchao.location.jiankang' };
  const target = M.crossCountryStoryTravel(save, option);
  assert.equal(target?.mapTargetId, 'liuchao.location.jiankang');
  const seen = click(option);
  assert.deepEqual(seen.pushed, [{ path: '/game/world-map', query: { goto: 'liuchao.location.jiankang' } }]);
  assert.deepEqual(seen.filled, []);
  assert.match(seen.toasts[0], /建康/);
});

test('非跨国的按钮（普通动作、探索、机会）照旧填输入框，不开地图', () => {
  for (const option of [
    { source: 'event_engine', eventId: 'x', actionId: 'advance_declared_objective' },
    { source: 'exploration_engine', eventId: 'x', actionId: 'travel:liuchao.location.jiankang' },
    { source: 'opportunity_engine', actionText: '去建康' },
    { source: 'event_engine', eventId: 'x', actionId: 'travel:liuchao.location.wudu' },
  ]) {
    const seen = click(option);
    assert.deepEqual(seen.pushed, [], JSON.stringify(option));
    assert.deepEqual(seen.filled, [option]);
  }
});

test('接线：主面板按钮点的是 clickEngineOption；地图面板读 ?goto= 选中地点', () => {
  assert.match(panel, /@click="branchDecision \? confirmBranchDecision\(option\) : clickEngineOption\(option\)"/);
  assert.match(map, /if \(route\?\.query\?\.goto\) selectGotoLocation\(\);/);
  assert.match(map, /watch\(\(\) => route\?\.query\?\.goto, key => \{ if \(key\) selectGotoLocation\(\); \}\);/);
  assert.match(map, /selectedLocation\.value = location;/);
});
