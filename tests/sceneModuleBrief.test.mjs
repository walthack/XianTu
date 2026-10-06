import assert from 'node:assert/strict';
import test from 'node:test';
import { mod, makeContract, CTX, attack, begin } from './sceneModuleFixture.mjs';

const passes = n => Array.from({ length: n }, () => 20);

test('场面简报：每拍由代码从状态重新生成，结构固定，短；写明拍数口径与常驻规则', () => {
  const contract = makeContract();
  const { state } = begin(contract, {});
  const brief = mod.buildSceneBrief(contract, state);
  assert.match(brief.text, /^【场面】击败来犯者｜第1拍（不限拍数）｜进行中/);
  assert.match(brief.text, /【局势】.*test\.foe\.alpha完好|【局势】.*{{ref:test\.foe\.alpha}}完好/);
  assert.match(brief.text, /规则：你只负责描写，不裁决/);
  assert.match(brief.text, /【红线】.*不得出局/);
  assert.match(brief.text, /不得写“天降神兵”/);
  assert.ok(brief.chars < 700, `${brief.chars}`);
  const timed = makeContract({ clock: { beats: 4, onTimeout: { type: 'close', as: 'timeout' } } });
  assert.match(mod.buildSceneBrief(timed, begin(timed, {}).state).text, /第1拍\/共4拍/);
  assert.equal(mod.buildSceneBrief(contract, state).text, brief.text, '同一状态生成同一份简报');
});

test('简报里：人物用占位 {{ref:id}}（由宿主换成显示名），字面标签原样；状态和态势带剩余拍数；离场的不在局势里', () => {
  const contract = makeContract({ clock: { fixedEvents: [{ id: 'go', atBeat: 2, effects: [{ depart: 'boss' }] }] } });
  const { state } = begin(contract, { action: [1, 12], defense: passes(12) });
  const hurt = mod.confirmAction(contract, state, attack(['foe_b']), CTX);
  const text = mod.buildSceneBrief(contract, hurt.state).text;
  assert.match(text, /{{ref:test\.foe\.alpha}}/);
  assert.match(text, /无名武士/);
  assert.match(text, /已离场：{{ref:test\.foe\.boss}}/);
  assert.doesNotMatch(text, /【局势】[^\n]*test\.foe\.boss完好/);
  assert.match(text, /失衡（余1拍）/);
});

test('简报有字数预算：超出时先丢可有可无的段，常驻段（场面 / 局势 / 状态 / 红线 / 规则）永远在', () => {
  const elements = Array.from({ length: 30 }, (_, i) => ({ id: `el${i}`, kind: 'env', label: `要素${i}号`, source: 't', verbs: [{ id: 'use', power: 1 }] }));
  const contract = makeContract({ elements: [...makeContract().elements, ...elements], settings: { brief: { maxChars: 520 } } });
  const { state } = begin(contract, { action: Array.from({ length: 6 }, () => 4), defense: passes(30) });
  let s = state;
  for (let i = 0; i < 5; i++) s = mod.confirmAction(contract, s, attack(['boss']), CTX).state;
  const brief = mod.buildSceneBrief(contract, s);
  assert.ok(brief.dropped.length > 0, '该丢的丢了');
  for (const key of ['【场面】', '【局势】', '【状态】', '【红线】', '规则：']) assert.ok(brief.text.includes(key), key);
});

test('长期记忆：近几拍逐条留，更早的压成一个计数；收束后写一段给长期记忆的摘要', () => {
  const contract = makeContract({ enemyActions: [] });
  const { state } = begin(contract, { action: Array.from({ length: 8 }, () => 4) });
  let s = state;
  for (let i = 0; i < 6; i++) s = mod.confirmAction(contract, s, attack(['boss']), CTX).state;
  assert.equal(s.digest.length, 4);
  assert.equal(s.digestOlder, 2);
  assert.match(mod.buildSceneBrief(contract, s).text, /更早 2 拍已略/);
});

test('结果卡由代码渲染：档位、骰点、夹紧、敌方出手、大失败后果；描写模型改不了它', () => {
  const contract = makeContract();
  const { state } = begin(contract, { action: [1], defense: [1, 20, 20, 20] });
  const out = mod.confirmAction(contract, state, attack(['foe_a'], 1, { levers: [{ element: 'blade', verb: 'slash', evidence: '刀' }] }), CTX);
  const lines = mod.renderResultLines(contract, out.result);
  assert.match(lines[0], /进攻：大失败（自然 1，降一档）｜骰面 1/);
  assert.ok(lines.some(l => /局面往敌人那边偏/.test(l)));
  assert.ok(lines.some(l => /大失败的后果：{{ref:test\.character\.hero}}「兵器脱手」/.test(l)));
  assert.ok(lines.some(l => /重击→{{ref:test\.character\.hero}}：防御 1.*没挡住，挂「外伤」/.test(l)));
  const input = mod.buildNarrationInput(contract, out.state, out.result);
  assert.equal(input.flourish, false);
  assert.deepEqual(input.required, ['一场遭遇战']);
  assert.ok(input.forbidden.includes('天降神兵') && input.forbidden.includes('首领被杀'), '局中：合同总则 + 红线');
  assert.equal(input.forbidden.includes('被护者倒下'), false, '局中不套某一分支的事后状态（打输 / 超时不套打赢才有的原著锁）');
  const won = structuredClone(out.state);
  won.outcome = { kind: 'win', reason: 'x' };
  assert.ok(mod.buildNarrationInput(contract, won, out.result).forbidden.includes('被护者倒下'), '分出打赢之后，加上打赢分支自己的事后状态');
  const lost = structuredClone(out.state);
  lost.outcome = { kind: 'lose', reason: 'x' };
  assert.equal(mod.buildNarrationInput(contract, lost, out.result).forbidden.includes('被护者倒下'), false);
  const great = mod.confirmAction(contract, begin(contract, { action: [20], defense: passes(8) }).state, attack(['foe_a']), CTX);
  assert.equal(mod.buildNarrationInput(contract, great.state, great.result).flourish, true);
});

test('描写守卫：禁写词、写出还没被判定的结果、结果与档位不一致，都拦下', () => {
  const contract = makeContract();
  const { state } = begin(contract, { action: [4], defense: passes(8) });
  const out = mod.confirmAction(contract, state, attack(['foe_a']), CTX);
  const ok = mod.checkNarration(contract, out.state, out.result, '你的刀锋被格开，对方趁势逼近。');
  assert.deepEqual(ok, { ok: true, problems: [] });
  assert.ok(mod.checkNarration(contract, out.state, out.result, '天降神兵助你一臂之力').problems.some(p => p.includes('天降神兵')));
  assert.ok(mod.checkNarration(contract, out.state, out.result, '他应声出局').problems.some(p => p.includes('还没有被判定')));
  assert.ok(mod.checkNarration(contract, out.state, out.result, '首领被杀，全场哗然').problems.some(p => p.includes('首领被杀')));
  assert.equal(mod.checkNarration(contract, out.state, out.result, '').ok, false);
  // 推到头之后，终态可以写
  const finished = structuredClone(out.state);
  finished.tracks.foe_a.vit = 3;
  assert.equal(mod.checkNarration(contract, finished, out.result, '他应声出局').ok, true);
});

test('状态适配器：留下来的状态能转成游戏现有的两种载体（主角 角色.效果 / 同伴 sceneLedger.injuries）', async () => {
  const adapters = mod;
  const contract = makeContract();
  const { state } = begin(contract, { action: [10, 10], defense: passes(8) });
  const big = { factors: 14 };
  const b1 = mod.confirmAction(contract, state, attack(['foe_a'], 3), big);
  const b2 = mod.confirmAction(contract, b1.state, attack(['foe_b'], 2), big);
  const { writeBack } = mod.closeScene(contract, b2.state, CTX);
  const item = writeBack.persistent[0];
  const now = { 年: 1, 月: 2, 日: 3, 小时: 4, 分钟: 5 };
  const effect = adapters.toPlayerStatusEffect(item, now, mod.resolveStatusDef(item.status, contract));
  assert.deepEqual(Object.keys(effect).sort(), ['来源', '强度', '持续时间分钟', '状态名称', '状态描述', '生成时间', '类型'].sort());
  assert.equal(effect.类型, 'debuff');
  assert.equal(effect.持续时间分钟, 14 * 24 * 60);
  assert.notEqual(effect.生成时间, now);
  assert.match(adapters.toInjuryNote(item, mod.resolveStatusDef(item.status, contract)), /^内伤：/);
  const permanent = adapters.toPlayerStatusEffect({ ...item, minutes: null }, now);
  assert.equal(permanent.持续时间分钟, -1);
  assert.match(permanent.状态描述,/修复后解除/);
});
