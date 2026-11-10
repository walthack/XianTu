// REPORT-8091-68fe9d20 P1-2：完成 s02_04 后强制落到白湖商馆水牢（作者设计）。C01（#188 放行改写）：草原四年改由时间线
// 插入事件在进五原城路线时拨一次（王哲陨落之后），s02_04 只作兜底、正常流程不再跳；水牢挂在白湖庄园下。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.location = { search: '', hostname: 'localhost' };
const quiet = async fn => { const k = ['log', 'info', 'warn', 'error'], o = k.map(x => console[x]); k.forEach(x => { console[x] = () => {}; }); try { return await fn(); } finally { k.forEach((x, i) => { console[x] = o[i]; }); } };
const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const W = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
const { freshPrologueCheckpoint } = await import('../scripts/generate-prologue-checkpoint.mjs');
const year = s => s.元数据.时间.年;

test('四年跳在进五原城路线时发生一次并排队过场；s02_04 结算与重复结算都不再跳', async () => {
  let { save, trace } = await quiet(() => freshPrologueCheckpoint());
  const rt = () => save.世界.状态.剧本模组;
  assert.equal(R.getScenarioFocusEvent(rt())?.id, 'lcq.event.s02_04');
  assert.ok(trace.some(t => t.local === 'lcq.route.wuyuan.arrive_market'));
  assert.equal(year(save), 224);
  assert.equal(rt().timeSkipInterlude?.eventId, 'qingyu.insert.grassland_four_years', '过场排队，接进本回合正文');
  delete rt().timeSkipInterlude;
  const action = W.getWuyuanOpenWorldSelections(save).find(a => a.kind === 'problem_action');
  await quiet(() => { W.settleWuyuanOpenWorldSelection(save, action); save = R.advanceScenarioRuntime(save).saveData; });
  assert.equal(year(save), 224);
  assert.equal(rt().timeSkipInterlude, undefined, 's02_04 不再排过场');
  assert.equal(R.getScenarioFocusEvent(rt())?.id, 'lcq.event.s02_05');
  await quiet(() => { W.settleWuyuanOpenWorldSelection(save, action); save = R.advanceScenarioRuntime(save).saveData; });
  assert.equal(year(save), 224, '重复结算不再跳年');
});

test('水牢挂在白湖庄园下，与过渡文本落点一致', () => {
  const loc = JSON.parse(readFileSync(new URL('../mod-kit/entity-catalog/locations.json', import.meta.url), 'utf8'));
  const text = JSON.stringify(loc);
  assert.match(text, /"name":"白湖商馆水牢"[^}]*"parentZoneId":"lcq\.zone\.wuyuan\.baihu_compound"/);
  const texts = JSON.parse(readFileSync(new URL('../src/modules/contentPacks/packs/qingyu/texts.json', import.meta.url), 'utf8'));
  assert.match(texts['qingyu.prologue.fourYears'], /白湖商馆的人又把你押回城边那座庄园，推进石屋底下的地牢/);
});
