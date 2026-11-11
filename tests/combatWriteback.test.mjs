import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';
import { makeContract } from './sceneModuleFixture.mjs';
import * as F from './freeActionFixture.mjs';
const W = await loadTs('../src/modules/sceneModule/host/combatWriteback.ts');
const H = await loadTs('../src/modules/sceneModule/host/controller.ts');
const E = await loadTs('../src/modules/sceneModule/host/ext.ts');
const registry = await loadTs('../src/modules/sceneModule/contracts/registry.ts');
const trial = await loadTs('../src/dev/combatTrial/overlay.ts');
const { GAME_NUMBERS: N } = await loadTs('../src/modules/sceneModule/numbers.ts');
const { resetLogState } = await loadTs('../src/modules/diagnostics/log.ts');
const { logStore } = await loadTs('../src/modules/diagnostics/store.ts');
const headline = () => N.combat.sceneClose.loseHeadline;

test('自由交手：气血1→倒下→恢复1仍写判负、记忆和日志；重放不重复', async () => {
  await resetLogState();
  const save = F.makeSave({ present: [F.WANG_ZHE], favor: { [F.WANG_ZHE]: 55 } });
  save.角色.属性.气血 = { 当前: 1, 上限: 100 };
  const { result } = F.runJudged(save, F.ticket('physical', 'attack', F.WANG_ZHE), 'critical_failure');
  assert.ok(result.ok);
  assert.equal(save.角色.属性.气血.当前, N.combat.woundRules.hp.afterLossContinueHp);
  assert.ok(save.社交.记忆.短期记忆.some(text => text.includes(headline())));
  assert.equal(save.系统.扩展.combatHeadline, headline());
  const log = (await logStore.all()).find(row => row.code === 'LCQ-SAV-056');
  assert.equal(log.detail.source, 'freeAction');
  assert.equal(log.detail.downed, true);
  assert.equal(log.detail.from, 1);
  assert.equal(log.detail.to, N.combat.woundRules.hp.afterLossContinueHp);
  save.系统.历史 = { 叙事: [{ type: 'gm', content: '对手收手。' }] };
  const text = W.finishCombatNarrative(save, '对手收手。');
  assert.equal(text, headline() + '\n对手收手。');
  assert.equal(save.系统.历史.叙事.at(-1).content, text);
  assert.equal(save.系统.扩展.combatHeadline, undefined);
  assert.equal(W.finishCombatNarrative(save, text), text);
});

test('统一写回：伤势只来自结构化状态，按名称及来源去重；判负行始终在正文首行', () => {
  const save = { 角色: { 属性: { 气血: { 当前: 50, 上限: 100 } }, 效果: [] }, 系统: {} };
  const injury = { 状态名称: '外伤（重）', 来源: 'test.scene' };
  const result = W.combatResult({ source: 'scene', outcome: 'lose', hpFrom: 50, hpTo: 1, downed: true, injuries: [injury], memoryLine: '战败，敌人已散。' });
  W.writeCombatResult(save, result);
  W.writeCombatResult(save, { ...result, memoryLine: '' }, { record: false });
  assert.deepEqual(save.角色.效果, [injury]);
  assert.equal(save.角色.属性.气血.当前, 1);
  assert.deepEqual(W.withCombatHeadline(result, ['敌人退去。\n' + headline()]), [headline(), '敌人退去。']);
  assert.ok(save.社交.记忆.短期记忆[0].includes('战败，敌人已散。'));
});

test('败局策略：缺出口结束；显式 continue、lose 收束与国家线默认配置均保留', async () => {
  await resetLogState();
  const c = makeContract();
  delete c.defeat.outcome; delete c.closing.lose;
  const loss = { kind: 'lose' };
  H.applyCombatDefeatPolicy(c, loss, 'test.event', 'attack');
  assert.equal(loss.endingId, 'lcq.ending.fail.combat');
  assert.ok((await logStore.all()).some(row => row.code === 'LCQ-SAV-055' && row.detail.eventId === 'test.event'));
  for (const branch of [makeContract(), { ...c, closing: { lose: { next: 'test.after' } } }]) {
    const outcome = { kind: 'lose' }; H.applyCombatDefeatPolicy(branch, outcome, 'test.event', 'attack');
    assert.equal(outcome.endingId, undefined);
  }
  const win = { kind: 'win' }; H.applyCombatDefeatPolicy(c, win, 'test.event', 'attack');
  assert.equal(win.endingId, undefined);
  assert.ok(Object.values((await loadTs('../src/modules/contentPacks/index.ts')).FAIL_ENDS_GAME).every(value => value === false));
});

test('秦 Q-20/Q-21：配置中的两拍即使 continue 也结束；不启用待定剧情', () => {
  assert.deepEqual(N.combat.sceneClose.fatalEventIds, ['liuchao.event.qin_act3_baiqi', 'liuchao.event.qin_raid_branch']);
  for (const eventId of N.combat.sceneClose.fatalEventIds) {
    const outcome = { kind: 'lose' };
    H.applyCombatDefeatPolicy(makeContract(), outcome, eventId, 'attack');
    assert.equal(outcome.endingId, 'lcq.ending.fail.combat');
  }
});

test('真实宿主缺败局分支：收场进入 gameOver、日志记缺分支、正文与记忆均先写判负', async () => {
  globalThis.location = { search: '?sceneModule=on', hostname: 'localhost' };
  await resetLogState();
  const data = JSON.parse(readFileSync(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_04.json', import.meta.url), 'utf8'));
  let save = trial.createSceneCombatTrialSave(data, { mode: 'B' });
  const deps = { persist: async next => { save = structuredClone(next); } };
  await H.submitSceneInput(save, '我挥刀攻击独角武士', deps);
  const active = E.activeScene(save), c = registry.sceneContractById(active.contractId);
  const original = structuredClone(c);
  try {
    delete c.defeat.outcome; delete c.closing.lose;
    if (c.meta.hook.completionSceneByOutcome) delete c.meta.hook.completionSceneByOutcome.lose;
    active.state.status = 'decided'; active.state.outcome = { kind: 'lose', reason: '测试倒下' };
    active.pending = null;
    await H.finishScene(save, deps);
    assert.equal(save.世界.状态.剧本模组.gameOver.endingId, 'lcq.ending.fail.combat');
    assert.ok(save.系统.历史.叙事.at(-1).content.startsWith(headline()));
    assert.ok(save.社交.记忆.短期记忆.at(-1).includes(headline()));
    assert.equal(E.activeScene(save), null);
    const logs = await logStore.all();
    assert.ok(logs.some(row => row.code === 'LCQ-SAV-055'));
    assert.ok(logs.some(row => row.code === 'LCQ-SAV-056' && row.detail.source === 'scene'));
  } finally { for (const key of Object.keys(c)) delete c[key]; Object.assign(c, original); }
});
