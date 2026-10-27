// 真机 da893388 复测（2026-10-28）判定类：#22 喊话劝停被判停止抵抗、防御 5＋-104；#23 防守失败却都挡住；#24 防守加值无来源；#11/#25 赶路推门被判逃跑。
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';
import { mod, makeContract, CTX, attack, begin } from './sceneModuleFixture.mjs';

const core = await loadTs('../src/modules/sceneModule/index.ts');
const registry = await loadTs('../src/modules/sceneModule/contracts/registry.ts');
const rec = await loadTs('../src/modules/sceneModule/host/recognize.ts');
const config = await loadTs('../src/modules/scenarioMods/freeAction/config.ts');
const contract = n => registry.SCENE_CONTRACTS.find(c => c.meta.id.startsWith(`combat.f${n}.`));
const askYield = async () => JSON.stringify({ goal: 'yield_guard', claim: { magnitude: 1, scope: 'single', targets: [] } });

test('#22 喊给对方的「住手／放下刀」不是自己停止抵抗：模型提议 yield_guard 也不落', async () => {
  for (const n of ['01', '02', '03', '04', '05']) {
    const c = contract(n), s = core.beginScene(c).state;
    for (const text of ['我大喊：住手！都放下刀，别打了！', '我朝她喊话：放下刀，我们不是屠村的人！', '我叫他们放下刀']) {
      assert.notEqual(rec.recognizeByRules(c, s, text, {})?.goal, 'yield_guard', `${n} ${text}`);
      assert.notEqual((await rec.recognizeAction(c, s, text, {}, askYield)).plan?.goal, 'yield_guard', `${n} ${text}`);
      assert.notEqual(rec.recognizeByRules(c, s, text, {})?.goal, 'attack', `${n} ${text}：喊的「别打了」不算动手`);
    }
  }
});

test('#22 自己明说不躲不挡、放下刀，仍是停止抵抗', async () => {
  for (const n of ['01', '05']) {
    const c = contract(n), s = core.beginScene(c).state;
    for (const text of ['我张开双手不躲也不挡', '我放下刀，不还手', '我放下刀，对他们喊：别打了']) {
      assert.equal(rec.recognizeByRules(c, s, text, {})?.goal, 'yield_guard', `${n} ${text}`);
      assert.equal((await rec.recognizeAction(c, s, text, {}, askYield)).plan?.goal, 'yield_guard', `${n} ${text}`);
    }
  }
});

test('#24 防御回执写明加值来源，明细合计等于加值；放弃防御的 -100 标明出处', () => {
  const contract = makeContract();
  const { state } = begin(contract, { action: [20], defense: Array(12).fill(10) });
  state.levels = { pc: 1, foe_a: 2, foe_b: 2, boss: 2 };
  const parts = [{ label: '六司', value: -1 }, { label: '幸运（气运 5，固定值）', value: 1 }];
  const out = mod.confirmAction(contract, state, attack(['foe_a']), { ...CTX, playerDefense: 0, playerDefenseParts: parts });
  const rolls = out.result.enemy.filter(r => !r.threatOnly);
  assert.ok(rolls.length > 0);
  for (const roll of rolls) assert.equal(roll.defenseParts.reduce((sum, p) => sum + p.value, 0), roll.defenseBonus);
  const lines = mod.renderResultLines(contract, out.result);
  assert.ok(lines.some(l => /防御 10＋-\d+（加值来源：六司-1、幸运（气运 5，固定值）\+1、境界差-\d+）＝/.test(l)), lines.join('\n'));
  const yielded = mod.confirmAction(contract, begin(contract, { action: [20], defense: Array(12).fill(10) }).state, attack(['foe_a']), { ...CTX, playerDefense: -100, playerDefenseParts: [{ key: 'yield', value: -100 }] });
  assert.ok(mod.renderResultLines(contract, yielded.result).some(l => /加值来源：不躲不挡（放弃防御）-100/.test(l)));
});

test('#23 行动没做成：回执说清只是敌方出手难度上调，挡没挡住看各自防御骰；难度里标出占先', () => {
  const contract = makeContract();
  const { state } = begin(contract, { action: [3], defense: Array(12).fill(20) });
  const out = mod.confirmAction(contract, state, attack(['foe_a']), CTX);
  const lines = mod.renderResultLines(contract, out.result);
  assert.ok(lines.some(l => /局面往敌人那边偏：「进攻」没做成，本拍敌方出手难度\+\d+；挡没挡住，看下面每次出手各自的防御骰/.test(l)), lines.join('\n'));
  assert.ok(lines.some(l => /对 \d+（难度含敌方占先\+\d+），挡住了/.test(l)), lines.join('\n'));
});

test('#11/#25 场面变体（逃跑潜行探索，按 escape 难度 20 判）写明不认领赶路、开门', () => {
  const hint = config.variantSpecOf('field', 'scene_act').hint;
  assert.match(hint, /不算观察/);
  assert.match(hint, /赶路/);
  assert.match(hint, /开门/);
});
