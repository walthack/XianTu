// 夺元默认可夺量：round(基数 × clamp(lossRatio + attrStep·Δa + levelStep·Δp, 0, perUseCapRatio))，闸门与结算共用 gates.drainAmount。
// Δa = 玩家（先天+后天六司）与对方先天六司按权重之差；Δp = 级数 + 小阶段/phasesPerLevel 之差；对方级数不明 Δp = 0。
// 期望值手算：lossRatio 0.08 / attrStep 0.01 / levelStep 0.04 / phasesPerLevel 3 / perUseCapRatio 0.2，基数 100；先断言配置没变，免得数值漂了测试悄悄失去意义。
// 末尾是默认开局存档夹具的复现（不依赖模型）：玩家无修为对昏迷凝羽夺元不再 drain_empty，传功仍 level_too_low 且文案写出级数。
import assert from 'node:assert/strict';
import test from 'node:test';
import { NING_YU, load, makeSave, mods, profileOf, runJudged, ticket } from './freeActionFixture.mjs';

const gates = await load('../src/modules/scenarioMods/freeAction/gates.ts');
const spec = () => mods.config.variantSpecOf('physical', 'drain_qi');
const amountOf = save => gates.drainAmount(save, NING_YU, spec());
const drainTicket = () => ticket('physical', 'drain_qi', NING_YU);
const realmOf = save => profileOf(save, NING_YU).境界;
const WEIGHTED = ['根骨', '心性', '悟性', '魅力'];

/** 章 40 凝羽 4 级初期；玩家先天六司对齐凝羽的权重项（Δa = 0），境界 4 级（Δp = 0）；凝羽昏迷。 */
function fixture({ chapter = 40 } = {}) {
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 }, chapter, realm: mods.realm.levelName(4) });
  for (const key of WEIGHTED) save.角色.身份.先天六司[key] = profileOf(save, NING_YU).先天六司[key];
  assert.ok(mods.actorStatus.applyActorStatus(save, NING_YU, 'unconscious', { sourceId: 'test' }).ok);
  return save;
}
const setPlayerRealm = (save, level, phase) => { save.角色.属性.境界 = { ...save.角色.属性.境界, 名称: mods.realm.levelName(level), 阶段: phase }; };

test('配置：drain.amount 的数值与权重（公式期望值的前提）', () => {
  const { amount, lossRatio, perUseCapRatio } = spec().drain;
  assert.deepEqual(amount.attrWeights, { 根骨: 0.4, 心性: 0.3, 悟性: 0.2, 魅力: 0.1 });
  assert.deepEqual([amount.attrStep, amount.levelStep, amount.phasesPerLevel, amount.unknownTargetAttr], [0.01, 0.04, 3, 'factors.center']);
  assert.deepEqual([lossRatio, perUseCapRatio], [0.08, 0.2]);
  assert.equal(mods.numbers.GAME_NUMBERS.factors.center, 5);
  assert.equal(mods.numbers.GAME_NUMBERS.training.progressPerLevel, 100);
  assert.deepEqual(mods.config.validateFreeActionConfig(), []);
});

test('Δp 各档（Δa = 0，凝羽 4 级初期）：封顶 / +2 / +1 / 0 / −1 / −2（归零）', () => {
  const cases = [[8, '后期', 20], [7, '初期', 20], [6, '初期', 16], [5, '初期', 12], [4, '初期', 8], [3, '初期', 4], [2, '初期', 0], [1, '初期', 0]];
  for (const [level, phase, expected] of cases) {
    const save = fixture();
    setPlayerRealm(save, level, phase);
    assert.equal(amountOf(save), expected, `玩家 ${level} 级${phase}`);
  }
});

test('Δp 含小阶段：玩家同级中期 +1/3、后期 +2/3；凝羽中期则 −1/3', () => {
  const mine = (phase, targetPhase) => {
    const save = fixture();
    setPlayerRealm(save, 4, phase);
    if (targetPhase) realmOf(save).阶段 = targetPhase;
    return amountOf(save);
  };
  assert.equal(mine('初期'), 8);
  assert.equal(mine('中期'), 9, '100×(0.08+0.04/3)=9.33');
  assert.equal(mine('后期'), 11, '100×(0.08+0.08/3)=10.67');
  assert.equal(mine('初期', '中期'), 7, '100×(0.08−0.04/3)=6.67');
  assert.equal(mine('后期', '后期'), 8, '同级同阶段 Δp = 0');
  assert.equal(mine('初期', '不认识的阶段'), 8, '对方阶段不明按初期');
});

test('Δa：只有权重项算数，按权重加权；玩家后天六司计入；封顶与归零', () => {
  const save = fixture();
  save.角色.身份.后天六司.灵性 = 10; // 灵性不在权重里
  save.角色.身份.后天六司.气运 = 10;
  assert.equal(amountOf(save), 8);
  save.角色.身份.后天六司.魅力 = 10; // Δa = 0.1×10 = 1
  assert.equal(amountOf(save), 9);
  save.角色.身份.后天六司.根骨 = 10; // Δa = 4 + 1 = 5
  assert.equal(amountOf(save), 13);
  save.角色.身份.先天六司.心性 += 4; // Δa = 5 + 1.2 = 6.2 → 0.142
  assert.equal(amountOf(save), 14);
  for (const key of WEIGHTED) save.角色.身份.后天六司[key] = 50; // 远超 → 封顶 20
  assert.equal(amountOf(save), 20);
  for (const key of WEIGHTED) { save.角色.身份.后天六司[key] = 0; profileOf(save, NING_YU).先天六司[key] = 50; }
  assert.equal(amountOf(save), 0, '对方六司远高于玩家 → 0');
});

test('缺属性：玩家先天缺项按 factors.center；对方缺项按 unknownTargetAttr（也是 factors.center）；后天缺项按 0', () => {
  const save = fixture();
  profileOf(save, NING_YU).先天六司.根骨 = 9;
  save.角色.身份.先天六司.根骨 = 9;
  assert.equal(amountOf(save), 8);
  delete profileOf(save, NING_YU).先天六司.根骨; // 对方缺根骨 → 5；玩家 9：Δa = 0.4×4 = 1.6
  assert.equal(amountOf(save), 10, '100×(0.08+0.016)=9.6');
  profileOf(save, NING_YU).先天六司.根骨 = 9;
  delete save.角色.身份.先天六司.根骨; // 玩家缺根骨 → 5；对方 9：Δa = −1.6
  assert.equal(amountOf(save), 6, '100×(0.08−0.016)=6.4');
  delete save.角色.身份.后天六司;
  assert.equal(amountOf(save), 6, '没有后天六司整张表也不崩');
  delete save.角色.身份.先天六司;
  delete profileOf(save, NING_YU).先天六司;
  assert.equal(amountOf(save), 8, '双方全缺 → 都按 5，Δa = 0');
});

test('对方级数不明：Δp = 0（同级放行），玩家功力高低都一样；级数已知时才按级数差', () => {
  const save = fixture({ chapter: null }); // 不设章：时点级数表查不到凝羽
  assert.equal(mods.levels.levelFact(NING_YU, 0), undefined);
  for (const level of [0, 1, 4, 8]) {
    setPlayerRealm(save, level, '后期');
    assert.equal(amountOf(save), 8, `玩家 ${level} 级`);
  }
});

test('基数：下一级所需 ≤ 0 取 training.progressPerLevel；否则就是下一级所需；单次上限按基数', () => {
  const save = fixture();
  realmOf(save).下一级所需 = 0;
  assert.equal(amountOf(save), 8);
  realmOf(save).下一级所需 = 250;
  assert.equal(amountOf(save), 20);
  setPlayerRealm(save, 8, '后期');
  assert.equal(amountOf(save), 50, '封顶 250×0.2');
  assert.equal(gates.drainBase(save, NING_YU), 250);
  realmOf(save).下一级所需 = -5;
  assert.equal(gates.drainBase(save, NING_YU), 100);
});

test('不看对方现有进度：进度 0 也夺得动；扣减后进度不低于 0', () => {
  const zero = fixture();
  realmOf(zero).当前进度 = 0;
  const { prepared, result } = runJudged(zero, drainTicket(), 'success');
  assert.equal(prepared.kind, 'issued');
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.resultKey, 'drained');
  assert.equal(realmOf(zero).当前进度, 0, '0 − 8 夹到 0，不出负数');
  assert.ok(mods.statusRead.actorStatusRecords(zero, NING_YU).some(r => r.statusId === 'qi.drained'), '夺走量 > 0 照常挂状态');
  const few = fixture();
  realmOf(few).当前进度 = 3;
  runJudged(few, drainTicket(), 'success');
  assert.equal(realmOf(few).当前进度, 0, '3 − 8 → 0');
});

test('闸门与结算共用 drainAmount：success 档夺走量 = 可夺量；闸门在可夺量为 0 时 drain_empty', () => {
  for (const [level, expected] of [[5, 12], [4, 8], [3, 4]]) {
    const save = fixture();
    setPlayerRealm(save, level, '初期');
    realmOf(save).当前进度 = 90;
    assert.equal(amountOf(save), expected);
    runJudged(save, drainTicket(), 'success');
    assert.equal(90 - realmOf(save).当前进度, expected, `玩家 ${level} 级`);
  }
  const weak = fixture();
  setPlayerRealm(weak, 2, '初期');
  realmOf(weak).当前进度 = 90;
  const before = structuredClone(weak);
  assert.equal(mods.plan.prepareFreeAction(weak, drainTicket()).reason, 'drain_empty');
  assert.deepEqual(weak, before, '零写入');
});

test('传功 level_too_low 文案写明要修到几级：已知取对方级数，不明取 1 级', () => {
  const tk = ticket('cast', 'transfer_qi', NING_YU);
  const known = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 }, chapter: 40, realm: mods.realm.levelName(1) });
  const refusedKnown = mods.plan.prepareFreeAction(known, tk);
  assert.deepEqual([refusedKnown.kind, refusedKnown.reason], ['refused', 'level_too_low']);
  assert.match(refusedKnown.facts[0], /功力不及.*需修到4级方可传功/);
  const unknown = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 } });
  const refusedUnknown = mods.plan.prepareFreeAction(unknown, tk);
  assert.equal(refusedUnknown.reason, 'level_too_low');
  assert.match(refusedUnknown.facts[0], /功力不及.*需修到1级方可传功/);
  assert.equal(refusedUnknown.facts[0].includes('{'), false, '没有残留占位符');
});

test('三条拒绝文案：槽位全部被填，没有残留占位符', () => {
  const slots = { player: '程宗扬', target: '凝羽', level: '4' };
  assert.equal(mods.facts.gateText('level_too_low', slots), '程宗扬功力不及凝羽，需修到4级方可传功。');
  assert.equal(mods.facts.gateText('drain_empty', slots), '凝羽功力深厚，程宗扬一时夺不动其真元。');
  assert.equal(mods.facts.gateText('guard_up', slots), '凝羽尚有防备，须其昏迷、被制住或重伤，程宗扬才夺得了元。');
});

// ---- 默认开局存档夹具复现（不依赖模型）----
test('默认开局复现：玩家无修为对昏迷凝羽夺元 → 不再 drain_empty，能出判定卡并结算；传功仍 level_too_low 且写出级数', () => {
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 } }); // 不动六司、不动境界：开局原样
  assert.equal(save.角色.属性.境界.名称, '无修为');
  assert.ok(mods.actorStatus.applyActorStatus(save, NING_YU, 'unconscious', { sourceId: 'test' }).ok);
  const progress = realmOf(save).当前进度, need = realmOf(save).下一级所需;
  const amount = amountOf(save);
  const out = runJudged(save, drainTicket(), 'success'), drained = out.prepared;
  const transfer = mods.plan.prepareFreeAction(makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 } }), ticket('cast', 'transfer_qi', NING_YU));
  console.log('[复现] 凝羽境界', JSON.stringify(realmOf(save)), '玩家先天六司', JSON.stringify(save.角色.身份.先天六司), '凝羽先天六司', JSON.stringify(profileOf(save, NING_YU).先天六司));
  console.log('[复现] 进度/下一级所需', progress, need, '默认可夺量', amount, '夺元 prepare', drained.kind, drained.reason ?? '', '结算', out.result?.ok, out.result?.resultKey);
  console.log('[复现] 传功', transfer.kind, transfer.reason, transfer.facts?.[0]);
  assert.equal(progress, 0, '凝羽进度条为 0（线上的常态）');
  assert.equal(amount, 6, '无修为 Δp = 0（凝羽级数不明）；Δa = 0.4×(5−9)+0.1×(5−6) = −1.7 → 100×0.063');
  assert.equal(drained.kind, 'issued');
  assert.equal(out.result.ok, true);
  assert.equal(out.result.resultKey, 'drained');
  assert.equal(transfer.reason, 'level_too_low');
  assert.match(transfer.facts[0], /功力不及.*需修到1级方可传功/);
});
