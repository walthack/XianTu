// 10-17 正向社交好感：代码出基础值；票上的浮动位只在 [基础 ± floatBand] 内生效，基础值为 0 一律忽略；
// 同类正向重复按次数递减（窗口外重算，敌意不递减）；“到顶/已习以为常”交给叙事；major 看实际生效的变化。数值全读配置。
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';
import { DUAN_QIANG, NING_YU, WANG_ZHE, advanceTurn, itemEntry, makeSave, mods, profileOf, runJudged, runtimeOf, ticket } from './freeActionFixture.mjs';

const N = mods.numbers, cfg = () => mods.config.freeActionConfig();
const GIFT = 'test.item.gift';
const favorOf = (save, id) => profileOf(save, id).好感度;
const saveWith = (opts = {}) => makeSave({ items: { [GIFT]: itemEntry(GIFT, { 数量: 12 }) }, ...opts });
const gift = (id, extra = {}) => ticket('give', 'gift', id, { itemId: GIFT, ...extra });
const settle = (save, tk, deps) => mods.settle.settleFreeAction(save, tk, undefined, deps);
const days = (save, n) => { save.元数据.时间.日 += n; };
const patched = async (patch, restore, fn) => { N.applyGameNumbers(patch); try { return await fn(); } finally { N.applyGameNumbers(restore); } };
const note = (save, id, kind) => mods.facts.affinityNoteText(kind, { player: save.角色.身份.名字, target: profileOf(save, id).名字 });
const runtimePromise = loadTs('../src/modules/scenarioMods/runtime.ts');
const base = () => mods.config.variantSpecOf('give', 'gift').base;
const band = () => cfg().affinity.floatBand;

test('A1 配置：floatBand、repeat、lightReceipt 在 freeAction.affinity 里，体检通过；坏值点名', () => {
  assert.deepEqual(mods.config.validateFreeActionConfig(), []);
  assert.equal(band(), 2);
  assert.equal(cfg().affinity.lightReceipt, true, '到顶轻回执默认开');
  assert.deepEqual(cfg().affinity.repeat.factors, [1, 0.5, 0.25, 0]);
  const bad = mutate => { const c = structuredClone(cfg()); mutate(c.affinity); return mods.config.validateFreeActionConfig(c); };
  assert.ok(bad(a => { a.floatBand = -1; }).some(e => e.includes('floatBand')));
  assert.ok(bad(a => { a.lightReceipt = 'yes'; }).some(e => e.includes('lightReceipt')));
  assert.ok(bad(a => { a.repeat.windowMinutes = 0; }).some(e => e.includes('windowMinutes')));
  assert.ok(bad(a => { a.repeat.factors = []; }).some(e => e.includes('factors')));
  assert.ok(bad(a => { a.repeat.factors = [1, 1.5]; }).some(e => e.includes('factors')));
  assert.equal(mods.config.variantSpecOf('cast', 'transfer_qi').requires.minGoodwill, 20, '传功好感门槛 20');
});

test('A2 浮动位：在 [基础 − band, 基础 + band] 内原样采纳，越界钳到边，不报就是基础值', () => {
  const run = affinityDelta => {
    const save = saveWith({ favor: { [DUAN_QIANG]: 50 } });
    const r = settle(save, gift(DUAN_QIANG, affinityDelta === undefined ? {} : { affinityDelta }));
    return { r, favor: favorOf(save, DUAN_QIANG) };
  };
  assert.equal(run().favor, 50 + base());
  assert.equal(run(base() + 1).favor, 50 + base() + 1, '带内');
  assert.equal(run(base() - 1).favor, 50 + base() - 1, '带内');
  assert.equal(run(15).favor, 50 + base() + band(), '模型给 +15：钳到基础 + band');
  assert.equal(run(-9).favor, 50 + base() - band(), '模型给 −9：钳到基础 − band');
  assert.equal(run(15).r.affinity.delta, base() + band(), '返回的 delta 是实际写入的变化');
});

test('A3 band 是配置：改成 0 就完全不采纳，改大就放宽', async () => {
  const once = () => { const save = saveWith({ favor: { [DUAN_QIANG]: 50 } }); settle(save, gift(DUAN_QIANG, { affinityDelta: 12 })); return favorOf(save, DUAN_QIANG) - 50; };
  await patched({ freeAction: { affinity: { floatBand: 0 } } }, { freeAction: { affinity: { floatBand: 2 } } }, () => assert.equal(once(), base()));
  await patched({ freeAction: { affinity: { floatBand: 5 } } }, { freeAction: { affinity: { floatBand: 2 } } }, () => assert.equal(once(), base() + 5));
  assert.equal(once(), base() + 2);
});

test('A4 基础值为 0 时忽略浮动：判定失败（benefit 结果系数 0）、同拍之外的拒绝都不被 LLM 加分', () => {
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 }, chapter: 40, realm: mods.realm.levelName(4) });
  const { result } = runJudged(save, ticket('cast', 'transfer_qi', NING_YU, { affinityDelta: 12 }), 'failure');
  assert.equal(result.ok, true);
  assert.equal(result.affinity.delta, 0);
  assert.equal(favorOf(save, NING_YU), 60, '失败 = 基础 0：模型给 +12 也不加');
  // 闸门不过（没有物品）：什么都不写，更谈不上好感。
  const refusedSave = makeSave({ favor: { [DUAN_QIANG]: 50 } });
  const before = structuredClone(refusedSave);
  const refused = mods.plan.prepareFreeAction(refusedSave, ticket('give', 'gift', DUAN_QIANG, { itemId: null, affinityDelta: 12 }));
  assert.equal(refused.kind, 'refused');
  assert.deepEqual(refusedSave, before);
});

test('A5 判定类：浮动位随判定回执存活到结算（回执只由本地签发），成功时在基础上下采纳', () => {
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 }, chapter: 40, realm: mods.realm.levelName(4) });
  const spec = mods.config.variantSpecOf('cast', 'transfer_qi');
  const { prepared, resolution, result } = runJudged(save, ticket('cast', 'transfer_qi', NING_YU, { affinityDelta: 9 }), 'success');
  assert.equal(prepared.proposal.authorityReceipt.affinityDelta, 9);
  assert.equal(resolution.authorityReceipt.affinityDelta, 9);
  assert.equal(result.affinity.delta, spec.base + band());
  assert.equal(favorOf(save, NING_YU), 60 + spec.base + band());
  // 没报浮动位的票：回执里不带这个字段
  const plain = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 }, chapter: 40, realm: mods.realm.levelName(4) });
  const issued = mods.plan.prepareFreeAction(plain, ticket('cast', 'transfer_qi', NING_YU));
  assert.equal('affinityDelta' in issued.proposal.authorityReceipt, false);
});

test('A6 亲近类（查表）同样走浮动：反应 accept 的 +3 在带内采纳', () => {
  const warmOpen = [{ id: NING_YU, temperament: 'warm', intimacyGate: { minTier: 'close' } }];
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 80 } });
  const r = mods.plan.prepareFreeAction(save, ticket('intimate', 'flirt', NING_YU, { affinityDelta: 15 }), { npcProfiles: warmOpen }).result;
  const effect = cfg().classes.intimate.intimacy.reactionEffect[r.resultKey].delta;
  assert.equal(r.resultKey, 'accept');
  assert.equal(r.affinity.delta, effect + band());
});

test('A7 同类重复递减：1.0 / 0.5 / 0.25 / 0；第 4 次起好感不动但物品照耗，叙事拿到“已习以为常”；浮动位救不回来', () => {
  const save = saveWith({ favor: { [DUAN_QIANG]: 50 } });
  const factors = cfg().affinity.repeat.factors, seen = [];
  for (let n = 0; n < 6; n++) {
    const before = favorOf(save, DUAN_QIANG), r = settle(save, gift(DUAN_QIANG, { affinityDelta: 12 }));
    seen.push({ gained: favorOf(save, DUAN_QIANG) - before, facts: r.facts });
    advanceTurn(save);
  }
  // 每次模型都报 +12：递减后的基础值 > 0 时采纳到 基础 + band，递减到 0 后一分不加。
  const expected = Array.from({ length: 6 }, (_, n) => { const eff = Math.round(base() * factors[Math.min(n, factors.length - 1)]); return eff === 0 ? 0 : eff + band(); });
  assert.deepEqual(seen.map(row => row.gained), expected);
  assert.deepEqual(expected, [5, 4, 3, 0, 0, 0], '占位表 1 / 0.5 / 0.25 / 0 下的实际数');
  assert.equal(seen[3].facts.at(-1), note(save, DUAN_QIANG, 'worn'));
  assert.equal(seen[5].facts.at(-1), note(save, DUAN_QIANG, 'worn'));
  assert.equal(seen[0].facts.length, 1, '正常的一次没有额外事实');
  assert.equal(seen[2].facts.length, 1, '递减但仍有增量：不提示');
  assert.equal(save.角色.背包.物品[GIFT].数量, 12 - 6, '每次都耗一件');
  assert.equal(mods.state.readFreeActionState(save).repeatLedger[`${DUAN_QIANG}:give`].count, factors.length, '次数封顶在表长');
});

test('A8 窗口外重算：窗口内按次数，窗口满一整段后回到第 1 次；窗口是配置', async () => {
  const save = saveWith({ favor: { [DUAN_QIANG]: 10 } });
  const gain = () => { const before = favorOf(save, DUAN_QIANG); settle(save, gift(DUAN_QIANG)); advanceTurn(save); return favorOf(save, DUAN_QIANG) - before; };
  const window = cfg().affinity.repeat.windowMinutes;
  assert.equal(window, 1440);
  assert.deepEqual([gain(), gain(), gain(), gain()], [3, 2, 1, 0]);
  assert.equal(gain(), 0);
  days(save, 1);
  assert.equal(gain(), 3, '窗口过去：重新算第 1 次');
  assert.equal(gain(), 2);
  await patched({ freeAction: { affinity: { repeat: { factors: [1, 1, 1, 1] } } } }, { freeAction: { affinity: { repeat: { factors: [1, 0.5, 0.25, 0] } } } }, () => {
    const other = saveWith({ favor: { [DUAN_QIANG]: 10 } });
    for (let n = 0; n < 5; n++) { const before = favorOf(other, DUAN_QIANG); settle(other, gift(DUAN_QIANG)); advanceTurn(other); assert.equal(favorOf(other, DUAN_QIANG) - before, 3); }
  });
});

test('A9 递减按“目标:行动类”记：换人、换类各自重新数；敌意不递减', () => {
  const save = saveWith({ present: [WANG_ZHE], favor: { [DUAN_QIANG]: 50, [WANG_ZHE]: 50 } });
  for (let n = 0; n < 4; n++) { settle(save, gift(DUAN_QIANG)); advanceTurn(save); }
  const other = settle(save, gift(WANG_ZHE));
  assert.equal(other.affinity.delta, base(), '换一个人：第 1 次');
  advanceTurn(save);
  const flirt = mods.plan.prepareFreeAction(save, ticket('intimate', 'flirt', DUAN_QIANG)).result;
  assert.equal(flirt.affinity.delta, cfg().classes.intimate.intimacy.reactionEffect[flirt.resultKey].delta, '换一个类：不受送礼次数影响');
  assert.deepEqual(Object.keys(mods.state.readFreeActionState(save).repeatLedger).sort(), [`${DUAN_QIANG}:give`, `${WANG_ZHE}:give`, ...(flirt.affinity.delta > 0 ? [`${DUAN_QIANG}:intimate`] : [])].sort());
  const hostile = saveWith({ favor: { [DUAN_QIANG]: 90 } });
  const spec = mods.config.variantSpecOf('verbal', 'taunt');
  for (let n = 0; n < 5; n++) {
    const before = favorOf(hostile, DUAN_QIANG);
    runJudged(hostile, ticket('verbal', 'taunt', DUAN_QIANG), 'success');
    assert.equal(favorOf(hostile, DUAN_QIANG) - before, spec.base, `第 ${n + 1} 次嘲讽仍是满额`);
    advanceTurn(hostile);
  }
  assert.deepEqual(mods.state.readFreeActionState(hostile).repeatLedger, {}, '敌意不进递减账');
});

test('A10 同拍被拦下的不计次：本拍已有作者回执时送礼不改好感，也不占递减次数、不发“习以为常”', () => {
  const save = saveWith({ favor: { [DUAN_QIANG]: 50 } });
  (runtimeOf(save).pendingLineAffinityGrants ||= []).push({ characterId: DUAN_QIANG, from: 50, to: 53, name: '段强', receiptId: 'line.x', weightId: 'w' });
  const r = settle(save, gift(DUAN_QIANG));
  assert.equal(r.affinity.applied, false);
  assert.equal(r.facts.length, 1);
  assert.deepEqual(mods.state.readFreeActionState(save).repeatLedger, {});
});

test('A11 到顶：好感已到上限（或被上限截短）时叙事拿到“没有更近一步”的事实；没到顶则没有', () => {
  const full = saveWith({ favor: { [DUAN_QIANG]: 100 } });
  const atTop = settle(full, gift(DUAN_QIANG));
  assert.equal(favorOf(full, DUAN_QIANG), 100);
  assert.equal(atTop.facts.at(-1), note(full, DUAN_QIANG, 'capped'));
  const near = saveWith({ favor: { [DUAN_QIANG]: 100 - 1 } });
  const clipped = settle(near, gift(DUAN_QIANG));
  assert.equal(favorOf(near, DUAN_QIANG), 100);
  assert.equal(clipped.facts.at(-1), note(near, DUAN_QIANG, 'capped'), '被上限截短也算到顶');
  const mid = saveWith({ favor: { [DUAN_QIANG]: 50 } });
  assert.equal(settle(mid, gift(DUAN_QIANG)).facts.length, 1);
  assert.notEqual(note(full, DUAN_QIANG, 'capped'), note(full, DUAN_QIANG, 'worn'));
});

test('A12 major 看实际生效的变化：满额扣分是大事；同拍被拦、被下限截成小幅都不是', () => {
  const hit = makeSave({ present: [WANG_ZHE], favor: { [WANG_ZHE]: 55 } });
  const first = runJudged(hit, ticket('physical', 'attack', WANG_ZHE), 'success');
  assert.equal(first.result.major, true);
  const blocked = runJudged(hit, ticket('physical', 'attack', WANG_ZHE), 'success');
  assert.equal(blocked.result.affinity.applied, false);
  assert.equal(blocked.result.major, false, '同拍第二下好感没动：不记大事（计划值仍是 −10）');
  assert.equal(blocked.result.affinity.delta, mods.config.variantSpecOf('physical', 'attack').base);
  const episodes = runtimeOf(hit).actorEngine?.actorMemory?.[WANG_ZHE]?.episodes ?? [];
  assert.equal(episodes.filter(e => e.tags.includes('major_episode')).length, 1);
  const floor = makeSave({ present: [WANG_ZHE], favor: { [WANG_ZHE]: -95 } });
  const clipped = runJudged(floor, ticket('physical', 'attack', WANG_ZHE), 'success');
  assert.equal(favorOf(floor, WANG_ZHE), -100);
  assert.equal(clipped.result.major, false, '实际只掉了 5：低于 majorAbs');
});

test('A13 浮动位让扣分也能越过大事线：基础 −6 威胁 + 浮动 −8 → 实际 −8（带内），不到大事；基础 −10 攻击 + −12 → 大事', () => {
  const threaten = makeSave({ favor: { [DUAN_QIANG]: 50 } });
  const t = runJudged(threaten, ticket('verbal', 'threaten', DUAN_QIANG, { affinityDelta: -20 }), 'success').result;
  assert.equal(t.affinity.delta, mods.config.variantSpecOf('verbal', 'threaten').base - band());
  assert.equal(t.major, false);
  const attack = makeSave({ present: [WANG_ZHE], favor: { [WANG_ZHE]: 55 } });
  const a = runJudged(attack, ticket('physical', 'attack', WANG_ZHE, { affinityDelta: -12 }), 'success').result;
  assert.equal(a.affinity.delta, -12);
  assert.equal(a.major, true);
});

test('A14 票校验：affinityDelta 是可选字段；整数化并钳到单拍上限；不是数字就当没报（票照收）；别的多余字段仍整张作废', () => {
  const save = makeSave({ present: [WANG_ZHE] });
  const raw = extra => ({ actionClass: 'physical', variant: 'attack', targetId: WANG_ZHE, degree: 'normal', performed: 'yes', evidence: '一刀砍向王哲', itemId: null, ...extra });
  const validate = item => mods.ticket.validateFreeActionTickets([item], '我拔刀，一刀砍向王哲！', save);
  const cap = cfg().affinity.perBeatCap;
  assert.equal(validate(raw({ affinityDelta: -7.6 })).tickets[0].affinityDelta, -8);
  assert.equal(validate(raw({ affinityDelta: 99 })).tickets[0].affinityDelta, cap);
  assert.equal(validate(raw({ affinityDelta: -99 })).tickets[0].affinityDelta, -cap);
  assert.equal(validate(raw({ affinityDelta: 0 })).tickets[0].affinityDelta, 0);
  for (const bad of ['7', null, {}, [], true, Number.NaN]) {
    const out = validate(raw({ affinityDelta: bad }));
    assert.equal(out.tickets.length, 1, `${String(bad)} 不作废整张票`);
    assert.equal('affinityDelta' in out.tickets[0], false, `${String(bad)} 当没报`);
  }
  assert.equal('affinityDelta' in validate(raw()).tickets[0], false);
  const stray = validate(raw({ affinityDelta: 3, mood: 'angry' }));
  assert.equal(stray.tickets.length, 0);
  assert.equal(stray.discards[0].reason, 'extra_fields');
});

test('A15 提示词：票说明里有 affinityDelta 的口径（可选、-15..+15、代码只在基础上下采纳），且不再说“不要输出任何数值”', () => {
  const { system } = mods.ticket.ticketPromptSection(makeSave({ present: [WANG_ZHE] }));
  assert.match(system, /affinityDelta/);
  assert.match(system, /可选/);
  assert.match(system, new RegExp(`-${cfg().affinity.perBeatCap}\\.\\.\\+${cfg().affinity.perBeatCap}`));
  assert.match(system, /拒绝或没做成时一律不采纳/);
  assert.doesNotMatch(system, /也不要输出任何数值/);
  assert.match(system, /除affinityDelta外不要输出任何数值/);
});

test('A16 账有上限：repeatLedger 随 budgetKeep 修剪；旧档没有这个字段也能读', () => {
  const save = makeSave();
  assert.deepEqual(mods.state.readFreeActionState(save).repeatLedger, {});
  const keep = cfg().state.budgetKeep;
  runtimeOf(save).freeAction = { repeatLedger: Object.fromEntries(Array.from({ length: keep + 15 }, (_, i) => [`x${i}:give`, { count: 1, since: 0 }])) };
  const trimmed = mods.state.writableFreeActionState(save).repeatLedger;
  assert.equal(Object.keys(trimmed).length, keep);
  assert.ok(`x${keep + 14}:give` in trimmed, '留下最新的');
});

test('A17 同拍判据可复用：affinityBeatTaken 看本拍自由行动写过，或有待取走的作者回执（共历事件通道已接入）', () => {
  const save = saveWith({ favor: { [DUAN_QIANG]: 50 } });
  const turn = () => save.系统.历史.叙事.length;
  assert.equal(mods.state.affinityBeatTaken(save, DUAN_QIANG, turn()), false);
  settle(save, gift(DUAN_QIANG));
  assert.equal(mods.state.affinityBeatTaken(save, DUAN_QIANG, turn()), true);
  advanceTurn(save);
  assert.equal(mods.state.affinityBeatTaken(save, DUAN_QIANG, turn()), false);
  (runtimeOf(save).pendingLineAffinityGrants ||= []).push({ characterId: DUAN_QIANG });
  assert.equal(mods.state.affinityBeatTaken(save, DUAN_QIANG, turn()), true);
  assert.equal(mods.state.affinityBeatTaken(save, WANG_ZHE, turn()), false);
});

/** 往存档塞一个待结算共历事件（已完成、未记入 affinityGrantedEventIds）。 */
const queueShared = (save, characterId, eventId = 'test.shared.beat') => {
  const r = runtimeOf(save);
  r.events.push({ id: eventId, name: '共闯试炼', critical: true, relatedCharacterIds: [characterId] });
  (r.completedEventIds ||= []).push(eventId);
  return eventId;
};

test('A18 共历被同拍自由行动拦住：本拍已送礼改过好感，再推进共历事件不加分，但事件仍登记', async () => {
  const { advanceScenarioRuntime } = await runtimePromise;
  const save = saveWith({ favor: { [DUAN_QIANG]: 50 } });
  settle(save, gift(DUAN_QIANG));
  const afterGift = favorOf(save, DUAN_QIANG);
  const eventId = queueShared(save, DUAN_QIANG);
  const { saveData, affinityGrants } = advanceScenarioRuntime(save);
  assert.equal(favorOf(saveData, DUAN_QIANG), afterGift, '同拍共历不得再改好感');
  assert.ok(!(affinityGrants || []).some(g => g.characterId === DUAN_QIANG && g.eventId === eventId));
  assert.ok(runtimeOf(saveData).affinityGrantedEventIds.includes(eventId), '事件仍须登记，避免下拍补发');
});

test('A19 共历写入后同拍自由行动被拦：先结算共历好感，同拍再送礼好感不动', async () => {
  const { advanceScenarioRuntime } = await runtimePromise;
  const save = saveWith({ favor: { [DUAN_QIANG]: 50 } });
  const eventId = queueShared(save, DUAN_QIANG);
  const { saveData } = advanceScenarioRuntime(save);
  assert.equal(favorOf(saveData, DUAN_QIANG), 58, 'critical 共历 +8');
  assert.ok(runtimeOf(saveData).affinityGrantedEventIds.includes(eventId));
  assert.equal(mods.state.affinityBeatTaken(saveData, DUAN_QIANG, saveData.系统.历史.叙事.length), true);
  const before = favorOf(saveData, DUAN_QIANG);
  // advance 用了 structuredClone，礼物在克隆档上；补一件再结算自由行动。
  (saveData.角色.背包.物品 ||= {})[GIFT] = itemEntry(GIFT, { 数量: 4 });
  const r = settle(saveData, gift(DUAN_QIANG));
  assert.equal(favorOf(saveData, DUAN_QIANG), before, '同拍自由行动不得再改好感');
  assert.equal(r.affinity.applied, false);
  assert.equal(r.ok, true);
});

test('A20 到顶轻回执：结算带 affinityNotes；回合汇入；renderReceipts 可挂；关 lightReceipt 仍保留叙事事实', async () => {
  const full = saveWith({ favor: { [DUAN_QIANG]: 100 } });
  const atTop = settle(full, gift(DUAN_QIANG));
  assert.deepEqual(atTop.affinityNotes, [note(full, DUAN_QIANG, 'capped')]);
  assert.equal(atTop.facts.at(-1), note(full, DUAN_QIANG, 'capped'), '叙事事实仍在');

  const wornSave = saveWith({ favor: { [DUAN_QIANG]: 50 } });
  for (let n = 0; n < 3; n++) { settle(wornSave, gift(DUAN_QIANG)); advanceTurn(wornSave); }
  const worn = settle(wornSave, gift(DUAN_QIANG));
  assert.deepEqual(worn.affinityNotes, [note(wornSave, DUAN_QIANG, 'worn')]);

  const mid = saveWith({ favor: { [DUAN_QIANG]: 50 } });
  assert.equal(settle(mid, gift(DUAN_QIANG)).affinityNotes, undefined, '没到顶不带 notes');

  const turnSave = saveWith({ favor: { [DUAN_QIANG]: 100 }, items: { [GIFT]: itemEntry(GIFT, { 数量: 2 }) } });
  const turn = mods.turn.settleFreeActionTurn(turnSave, [gift(DUAN_QIANG)], undefined);
  assert.deepEqual(turn.affinityNotes, [note(turnSave, DUAN_QIANG, 'capped')]);
  assert.ok(turn.givenFacts.length >= 1, '给予回执仍在');

  const lines = mods.facts.renderReceipts({ refused: [], given: turn.givenFacts, others: 0, affinity: turn.affinityNotes });
  assert.equal(lines.length, 2);
  assert.match(lines[1], /亲近未再加深/);
  assert.ok(lines[1].includes(note(turnSave, DUAN_QIANG, 'capped')));
  assert.deepEqual(mods.facts.renderReceipts({ refused: [], given: [], others: 0 }), []);

  await patched({ freeAction: { affinity: { lightReceipt: false } } }, { freeAction: { affinity: { lightReceipt: true } } }, () => {
    assert.equal(cfg().affinity.lightReceipt, false);
    const again = saveWith({ favor: { [DUAN_QIANG]: 100 } });
    const r = settle(again, gift(DUAN_QIANG));
    assert.deepEqual(r.affinityNotes, [note(again, DUAN_QIANG, 'capped')]);
    assert.equal(r.facts.at(-1), note(again, DUAN_QIANG, 'capped'));
  });
});
