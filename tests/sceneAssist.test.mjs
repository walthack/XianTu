// 同伴助战 + 护人戏威胁进度：助战者不挨打、不算级差、不挂伤；效果按角色 id 与好感档读 numbers-assist.json；
// F03/F13 的敌方火力全压主角，护人改成威胁进度轨道，到顶按合同剧本结算。
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';
import { mod, makeContract, CTX, attack, begin } from './sceneModuleFixture.mjs';

const registry = await loadTs('../src/modules/sceneModule/contracts/registry.ts');
const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
const WU = 'liuchao.character.wu_er_lang', NING = 'liuchao.character.ning_yu', SU = 'liuchao.character.su_li';
const cfg = () => structuredClone(numbers.GAME_NUMBERS.assist);
const companion = (id, ref, extra = {}) => ({ id, side: 'player_side', ref, ...extra });
const withAllies = (allies, patch = {}) => {
  const c = makeContract(patch);
  c.parties = c.parties.filter(p => p.id !== 'ally').concat(allies);
  c.elements = c.elements.filter(e => e.owner !== 'ally');
  c.fumble = c.fumble.filter(f => f.id !== 'ally_hurt');
  c.closing.win.fixedCosts = [];
  c.enemyActions = c.enemyActions.filter(a => a.id !== 'slash_b');
  return c;
};
const statusIds = (state, party) => (state.statuses[party] || []).map(s => s.id);

test('配置：assist 段在合并数值里，缺省形态是助战，同时生效上限 2，键都是角色库 id', () => {
  const a = cfg();
  assert.equal(a.defaultRole, 'assist');
  assert.equal(a.maxActive, 2);
  for (const ref of Object.keys(a.byActor)) assert.match(ref, /^[a-z0-9_]+(\.[a-z0-9_]+)+$/i);
  assert.deepEqual(mod.checkAssistNumbers(), []);
});

test('助战者不是敌人目标：each player_side 只点主角；显式 combatant 才挨打；点名助战者被 lint 拦下', () => {
  const sweep = withAllies([companion('wu', WU)], { enemyActions: [{ id: 'sweep', party: 'foe_a', label: '横扫', target: { each: 'player_side' }, attack: { dc: 14 }, onHit: { statuses: [{ status: 'wound.external' }] } }] });
  const out = mod.confirmAction(sweep, begin(sweep, { action: [10], defense: [1, 1, 1, 1] }).state, attack(['boss']), CTX);
  assert.deepEqual(out.result.enemy.map(r => r.target), ['pc']);
  assert.deepEqual(statusIds(out.state, 'wu'), [], '助战者不挂伤');
  const fighter = structuredClone(sweep);
  fighter.parties.find(p => p.id === 'wu').role = 'combatant';
  const out2 = mod.confirmAction(fighter, begin(fighter, { action: [10], defense: [1, 1, 1, 1] }).state, attack(['boss']), CTX);
  assert.deepEqual(out2.result.enemy.map(r => r.target), ['pc', 'wu']);
  const named = withAllies([companion('wu', WU)], { enemyActions: [{ id: 'aim', party: 'foe_a', label: '点名', target: { party: 'wu' }, attack: { dc: 14 }, onHit: { statuses: [] } }] });
  assert.ok(mod.lintContract(named).errors.some(e => /助战|assist/.test(e)), '点名助战者应报错');
  assert.equal(mod.partyRole(sweep.parties.find(p => p.id === 'pc')), 'combatant');
  assert.equal(mod.partyRole(sweep.parties.find(p => p.id === 'foe_a')), 'combatant');
});

test('被动 buff 按好感档取值：好感越高越强，敌对档不助战', () => {
  const c = withAllies([companion('wu', WU)]);
  const { state } = begin(c, { action: [10] });
  const values = cfg().byActor[WU].passive.find(p => p.scope === 'action').values;
  const at = affinity => mod.assistModifier(c, state, { assistAffinity: { [WU]: affinity } }, 'action');
  assert.equal(at(0), values[mod.assistLevelOf(0).level]);
  assert.equal(at(90), values[mod.assistLevelOf(90).level]);
  assert.ok(at(90) >= at(0));
  assert.equal(mod.assistLevelOf(-50).level, -1);
  assert.equal(at(-50), 0, '敌对档没有助战效果');
  const ev = mod.evaluatePlan(c, state, attack(['foe_a']), { ...CTX, assistAffinity: { [WU]: 90 } });
  assert.equal(ev.modifierParts.assist, values[mod.assistLevelOf(90).level]);
});

test('每拍自动技能：按 fromBeat/every 触发，只挂态势（敌方 DC 减值），不推进敌方轨道', () => {
  const c = withAllies([companion('wu', WU)]);
  const skill = cfg().byActor[WU].skills[0];
  const ctx = { ...CTX, assistAffinity: { [WU]: 90 } };
  const out = mod.confirmAction(c, begin(c, { action: [3], defense: [20, 20] }).state, attack(['boss']), ctx);
  const ev = out.result.assist.find(e => e.skill === skill.id);
  assert.ok(ev?.applied);
  assert.equal(ev.value, skill.values[mod.assistLevelOf(90).level]);
  const none = mod.confirmAction(c, begin(c, { action: [3], defense: [20, 20] }).state, attack(['boss']), { ...CTX, assistAffinity: { [WU]: -50 } });
  assert.equal(none.result.assist.length, 0, '敌对档不出技能');
  assert.equal(out.result.enemy[0].dc, none.result.enemy[0].dc + ev.value, '敌方这一下 DC 吃到技能减值');
  assert.deepEqual(out.state.tracks.foe_a, begin(c).state.tracks.foe_a, '技能不伤敌');
});

test('同时生效的助战者最多 maxActive 人，按助战档、优先级排序', () => {
  const c = withAllies([companion('su', SU), companion('ning', NING), companion('wu', WU)]);
  const { state } = begin(c);
  const active = mod.activeAssists(c, state, { assistAffinity: { [WU]: 40, [NING]: 40, [SU]: 40 } });
  assert.equal(active.length, cfg().maxActive);
  assert.deepEqual(active.map(a => a.ref), [WU, NING]);
  const protectedOnes = withAllies([companion('ning', NING, { protected: true }), companion('wu', WU)]);
  assert.deepEqual(mod.activeAssists(protectedOnes, begin(protectedOnes).state, {}).map(a => a.ref), [WU], '受保护方不出助战效果');
  const disabled = withAllies([companion('wu', WU)], { assist: { disabled: ['wu'] } });
  assert.equal(mod.activeAssists(disabled, begin(disabled).state, {}).length, 0);
});

test('能直接推进敌方轨道的技能只在合同 assist.finishers 点名时执行', () => {
  const skillId = cfg().byActor[WU].skills[0].id;
  const original = cfg().byActor[WU].skills[0].effect;
  const skills = cfg().byActor[WU].skills.map((s, i) => i === 0 ? { ...s, effect: 'trackShift', values: [1, 1, 1] } : s);
  numbers.applyGameNumbers({ assist: { byActor: { [WU]: { skills } } } });
  try {
    const plain = withAllies([companion('wu', WU)]);
    const out = mod.confirmAction(plain, begin(plain, { action: [3], defense: [20, 20] }).state, attack(['boss']), CTX);
    const ev = out.result.assist.find(e => e.skill === skillId);
    assert.equal(ev.applied, false);
    assert.match(ev.skipped, /剧情未指定/);
    const finisher = withAllies([companion('wu', WU)], { assist: { finishers: [skillId] } });
    const out2 = mod.confirmAction(finisher, begin(finisher, { action: [3], defense: [20, 20] }).state, attack(['boss']), CTX);
    const ev2 = out2.result.assist.find(e => e.skill === skillId);
    assert.equal(ev2.applied, true);
    assert.equal(ev2.to, ev2.from + 1);
  } finally {
    numbers.applyGameNumbers({ assist: { byActor: { [WU]: { skills: cfg().byActor[WU].skills.map((s, i) => i === 0 ? { ...s, effect: original, values: s.values } : s) } } } });
  }
  assert.equal(cfg().byActor[WU].skills[0].effect, original);
});

test('热改：坏的助战配置整份退回（LCQ-NUM-006/008），原值不变', () => {
  const before = cfg();
  assert.throws(() => numbers.applyGameNumbers({ assist: { maxActive: -1 } }), /LCQ-NUM-00[68]/);
  assert.throws(() => numbers.applyGameNumbers({ assist: { affinityLevels: { sworn: 9 } } }), /LCQ-NUM-00[68]/);
  assert.throws(() => numbers.applyGameNumbers({ assist: { nope: 1 } }), /LCQ-NUM-002/);
  assert.deepEqual(cfg(), before);
  numbers.applyGameNumbers({ assist: { maxActive: 1 } });
  try { assert.equal(cfg().maxActive, 1); } finally { numbers.applyGameNumbers({ assist: { maxActive: before.maxActive } }); }
});

const SIM_CTX = () => ({ factors: 0, playerDefense: 0, factorProfiles: Object.fromEntries(Object.keys(numbers.GAME_NUMBERS.weights).map(id => [id, 0])) });
const run = (contract, plans, dice, ctx = SIM_CTX()) => {
  let { state } = mod.beginScene(contract, { seed: 7, forced: dice });
  const results = [];
  for (const plan of plans) {
    if (state.status !== 'engaged') break;
    const out = mod.confirmAction(contract, state, plan, ctx);
    results.push(out.result);
    state = out.state;
  }
  return { state, results };
};

test('F03 威胁进度：敌人火力压主角（有出手、有防御行）；没拦住推进威胁轨道，到顶按剧本让阿夕和新娘受创', () => {
  const c = registry.sceneContractById('combat.f03.mountain_stream_fog');
  const ally = c.parties.find(p => p.id === 'ally_threat');
  assert.ok(ally && ally.side === 'neutral');
  for (const a of c.enemyActions) assert.equal(a.target, 'player', `${a.id} 只压主角`);
  const survive = { goal: 'survive', magnitude: 1, scope: 'single', targets: [], levers: [] };
  // 每拍防御骰顺序：铁斧、绕后、扑阿夕、最后一名武士（压主角的两下挡住，绕后的两下没拦住）。
  const defense = Array.from({ length: 6 }, () => [20, 1, 1, 20]).flat();
  const { state, results } = run(c, [survive, survive, survive], { action: [9, 9, 9], defense });
  assert.ok(results[0].enemy.length >= 3, '敌人有出手');
  assert.ok(results[0].enemy.every(r => r.target === 'pc'));
  const top = c.parties.find(p => p.id === 'ally_threat').tracks[0].scale.length - 1;
  assert.equal(state.tracks.ally_threat.threat, top);
  assert.ok(statusIds(state, 'a_xi').includes('wound.external'));
  assert.ok(statusIds(state, 'bride').includes('wound.external'));
  assert.notEqual(state.outcome?.kind, 'lose', 'F03 威胁到顶只让同伴受创，不判负');
  for (const id of ['wu_er_lang', 'su_li', 'yi_biao']) assert.equal(state.levels?.[id], undefined);
});

test('F13 威胁进度：阴煞扑同伴没拦住推进威胁，到顶按原合同败局（龙首无人）', () => {
  const c = registry.sceneContractById('combat.f13.ghost_king_final');
  const read = { goal: 'read_field', magnitude: 1, scope: 'single', targets: [], levers: [] };
  const defense = Array.from({ length: 8 }, () => [20, 1]).flat();
  const { state, results } = run(c, [read, read, read, read, read], { action: [9, 9, 9, 9, 9], defense });
  assert.ok(results.every(r => r.enemy.every(e => e.target === 'pc')));
  assert.equal(state.tracks.ally_threat.threat, c.parties.find(p => p.id === 'ally_threat').tracks[0].scale.length - 1);
  assert.equal(state.outcome?.kind, 'lose');
});
