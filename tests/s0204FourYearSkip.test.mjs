// REPORT-8091-68fe9d20 P1-2：s02_04 跳年 220→224、落到白湖商馆水牢——核查结论为作者设计（dac8bce0：序幕四年由 s01_06 挪到 s02_04，
// supersedes 防二次跳年；完成 s02_04 后强制落到水牢）。本测试钉住：只在 s02_04 结算时跳一次、过渡文本排队等回合正文之后接上、
// 水牢挂在白湖庄园下（与过渡文本“押回城边那座庄园，推进石屋底下的地牢”一致）。时机问题（拍子判定直写成功）由 P1-1 修。
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

test('四年跳只在 s02_04 结算时发生一次，并排队过渡文本', async () => {
  let { save } = await quiet(() => freshPrologueCheckpoint());
  const rt = () => save.世界.状态.剧本模组;
  assert.equal(R.getScenarioFocusEvent(rt())?.id, 'lcq.event.s02_04');
  const before = year(save);
  assert.equal(rt().timeSkipInterlude, undefined, 's02_04 之前不跳年');
  const action = W.getWuyuanOpenWorldSelections(save).find(a => a.kind === 'problem_action');
  await quiet(() => { W.settleWuyuanOpenWorldSelection(save, action); save = R.advanceScenarioRuntime(save).saveData; });
  assert.equal(year(save), before + 4);
  assert.ok(rt().timeSkipInterlude, '过渡文本排队，回合正文后接上');
  assert.equal(R.getScenarioFocusEvent(rt())?.id, 'lcq.event.s02_05');
  await quiet(() => { W.settleWuyuanOpenWorldSelection(save, action); save = R.advanceScenarioRuntime(save).saveData; });
  assert.equal(year(save), before + 4, '重复结算不再跳年');
});

test('水牢挂在白湖庄园下，与过渡文本落点一致', () => {
  const loc = JSON.parse(readFileSync(new URL('../mod-kit/entity-catalog/locations.json', import.meta.url), 'utf8'));
  const text = JSON.stringify(loc);
  assert.match(text, /"name":"白湖商馆水牢"[^}]*"parentZoneId":"lcq\.zone\.wuyuan\.baihu_compound"/);
  const texts = JSON.parse(readFileSync(new URL('../src/modules/contentPacks/packs/qingyu/texts.json', import.meta.url), 'utf8'));
  assert.match(texts['qingyu.prologue.fourYears'], /白湖商馆的人又把你押回城边那座庄园，推进石屋底下的地牢/);
});
