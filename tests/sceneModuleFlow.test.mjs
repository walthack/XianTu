import assert from 'node:assert/strict';
import test from 'node:test';
import { mod, makeContract, CTX, attack, begin } from './sceneModuleFixture.mjs';

const passes = (n, face = 20) => Array.from({ length: n }, () => face); // 防御骰：20 必挡住
const status = (state, party) => (state.statuses[party] || []).map(s => s.id);

test('失败＝这招没成、局面往敌人那边偏，人不直接掉东西：没有任何伤害点、没有直接的状态', () => {
  const contract = makeContract();
  const { state } = begin(contract, { action: [4], defense: passes(8) });
  const out = mod.confirmAction(contract, state, attack(['foe_a']), CTX);
  assert.equal(out.result.tier, 'failure');
  assert.equal(out.result.fumble, undefined, '失败没有“后果”，那是大失败的事');
  assert.equal(out.result.claims[0].realized, 0, '主张不兑现');
  assert.equal(out.state.tracks.foe_a.vit, 0);
  assert.equal(out.result.edge, true);
  assert.deepEqual(out.result.statusEvents, [], '没挡不挡之前，失败本身不给任何人挂状态');
  assert.equal(JSON.stringify(out.state).includes('harm'), false, '存档里不再有伤害点');
  assert.equal(out.state.tags.some(t => t.id === 'edge'), false, '“敌占先”只管这一拍的敌方出手');
});

test('局面偏向敌人：失败这一拍敌方出手难度 +2（同一个防御骰，成功时挡得住，失败时挡不住）', () => {
  const contract = makeContract();
  const win = begin(contract, { action: [10], defense: [15, 20] });
  const ok = mod.confirmAction(contract, win.state, attack(['foe_a']), CTX);
  const lose = begin(contract, { action: [4], defense: [15, 20] });
  const bad = mod.confirmAction(contract, lose.state, attack(['foe_a']), CTX);
  const strikeOk = ok.result.enemy.find(r => r.actionId === 'strike_a');
  const strikeBad = bad.result.enemy.find(r => r.actionId === 'strike_a');
  assert.equal(strikeOk.dc, 14);
  assert.equal(strikeBad.dc, 16);
  assert.equal(strikeOk.outcome, 'blocked');
  assert.equal(strikeBad.outcome, 'hit');
  assert.deepEqual(status(bad.state, 'pc'), ['wound.external'], '没挡住，具体的人挂具体的状态');
  assert.equal(bad.result.enemy.find(r => r.actionId === 'strike_a').statuses[0].sourceId, 'strike_a');
});

test('大失败＝没成，另有一个具体后果挂到具体角色：兵器脱手 / 同伴受伤 / 默认失衡', () => {
  const contract = makeContract();
  // 用长刀：后果表里 weapon → 主角兵器脱手
  const a = begin(contract, { action: [1], defense: passes(8) });
  const withBlade = mod.confirmAction(contract, a.state, attack(['foe_a'], 1, { levers: [{ element: 'blade', verb: 'slash', evidence: '长刀' }] }), CTX);
  assert.equal(withBlade.result.tier, 'critical_failure');
  assert.equal(withBlade.result.fumble.target, 'pc');
  assert.deepEqual(status(withBlade.state, 'pc'), ['disarmed']);
  const next = mod.previewAction(contract, withBlade.state, attack(['foe_a'], 1, { levers: [{ element: 'blade', verb: 'slash' }] }), CTX);
  assert.equal(next.levers[0].ok, false);
  assert.match(next.levers[0].why, /锁住/);
  // 用同伴协助：后果落在“被动用的同伴”身上，主角不受影响
  const b = begin(contract, { action: [1], defense: passes(8) });
  const withAlly = mod.confirmAction(contract, b.state, attack(['foe_a'], 1, { levers: [{ element: 'ally_help', verb: 'assist', evidence: '同伴' }] }), CTX);
  assert.equal(withAlly.result.fumble.target, 'ally');
  assert.deepEqual(status(withAlly.state, 'ally'), ['wound.external']);
  assert.deepEqual(status(withAlly.state, 'pc'), []);
  // 没有适用的后果：模块默认“失衡”（下一拍劣势），一拍后自动消失
  const c = begin(contract, { action: [1, 12, 12], defense: passes(8) });
  const plain = mod.confirmAction(contract, c.state, attack(['foe_a']), CTX);
  assert.equal(plain.result.fumble.entry, 'module.default_fumble');
  assert.deepEqual(status(plain.state, 'pc'), ['off_balance']);
  assert.equal(mod.previewAction(contract, plain.state, attack(['foe_a']), CTX).mode, 'disadvantage');
  const after = mod.confirmAction(contract, plain.state, attack(['foe_a']), CTX);
  assert.equal(after.result.mode, 'disadvantage');
  assert.deepEqual(status(after.state, 'pc'), [], '到期移除');
});

test('成功：主张被合同夹紧，且是累计的，不是每次', () => {
  const contract = makeContract();
  const { state } = begin(contract, { action: [10, 10], defense: passes(8) });
  const big = { factors: 14 };
  const first = mod.confirmAction(contract, state, attack(['foe_b'], 3), big);
  assert.equal(first.result.tier, 'success');
  assert.deepEqual([first.result.claims[0].claimed, first.result.claims[0].realized, first.result.claims[0].clamped], [3, 2, true]);
  assert.equal(first.result.claims[0].clampText, '你最多逼退他');
  const second = mod.confirmAction(contract, first.state, attack(['foe_b'], 3), big);
  assert.equal(second.result.claims[0].realized, 0, '已经推到上限');
});

test('ceiling 为 0 的参与方：推不动，但判定照掷，失败的局面代价照付', () => {
  const contract = makeContract();
  const { state } = begin(contract, { action: [18], defense: passes(8) });
  const out = mod.confirmAction(contract, state, attack(['boss'], 1), CTX);
  assert.equal(out.result.claims[0].realized, 0);
  assert.equal(out.state.tracks.boss.vit, 0);
  assert.equal(out.state.counters.checks, 1);
});

test('大成功：只表示动作完整做成——不多推一格，不结束战局；红利是免暴露、标签多留一拍、记功劳', () => {
  const contract = makeContract();
  const crit = begin(contract, { action: [20], defense: passes(8) });
  const levers = [{ element: 'bomb', verb: 'throw', evidence: '火药罐' }, { element: 'fog', verb: 'conceal', evidence: '浓雾' }];
  const out = mod.confirmAction(contract, crit.state, attack(['foe_a'], 1, { levers }), CTX);
  assert.equal(out.result.tier, 'great_success');
  assert.equal(out.result.face, 20);
  assert.equal(out.result.claims[0].realized, 1, '主张 1 格就是 1 格');
  assert.equal(out.state.status, 'engaged', '大成功不结束战局');
  assert.equal(out.result.enemy.length > 0, true, '战局照常，敌人照常出手');
  assert.equal(out.state.leverUses.bomb, undefined, '免暴露：一次性杠杆不消耗');
  assert.deepEqual(out.result.leversKept, ['bomb']);
  assert.equal(out.result.credit, true);
  assert.equal(out.state.credits.length, 1);
  const ok = begin(contract, { action: [10], defense: passes(8) });
  const normal = mod.confirmAction(contract, ok.state, attack(['foe_a'], 1, { levers }), CTX);
  assert.equal(normal.result.tier, 'success');
  assert.equal(normal.state.leverUses.bomb, 1, '成功：一次性杠杆消耗');
  const tagOf = s => s.tags.find(t => t.id === 'hidden').expiresBeat;
  assert.equal(tagOf(out.state), tagOf(normal.state) + 1, '大成功：标签多留一拍');
  // 底子不够时，是自然 20 把它抬成大成功（审计里标出来）
  const lucky = begin(contract, { action: [20], defense: passes(8) });
  const bare = mod.confirmAction(contract, lucky.state, attack(['boss'], 3), { factors: 0 });
  assert.equal(bare.result.baseTier, 'failure');
  assert.equal(bare.result.tier, 'great_success');
  assert.equal(bare.result.natTriggered, 'nat20');
  assert.equal(bare.result.claims[0].realized, 0, '大成功也推不动 ceiling 为 0 的参与方');
  // 关掉红利后就回到普通
  const noBonus = makeContract({ settings: { tiers: { critBonus: [] } } });
  const b = begin(noBonus, { action: [20], defense: passes(8) });
  const plain = mod.confirmAction(noBonus, b.state, attack(['foe_a'], 1, { levers }), CTX);
  assert.equal(plain.state.leverUses.bomb, 1);
  assert.equal(plain.result.credit, false);
});

test('敌方出手：被打的人用防御对抗，没挡住就挂合同写的状态；同类再中就加重，直到倒下→败局', () => {
  const contract = makeContract();
  const { state } = begin(contract, { action: [10, 10, 10], defense: [1, 1, 1, 1, 1, 1, 1, 1] });
  const b1 = mod.confirmAction(contract, state, attack(['boss']), CTX);
  // 第 1 拍：strike_a 打主角 → 外伤；slash_b 轮到主角 → 外伤加重
  assert.deepEqual(status(b1.state, 'pc'), ['wound.external.heavy']);
  assert.equal(b1.state.status, 'engaged');
  const b2 = mod.confirmAction(contract, b1.state, attack(['boss']), CTX);
  assert.deepEqual(status(b2.state, 'pc'), ['incapacitated']);
  assert.deepEqual(status(b2.state, 'ally'), ['wound.external'], '第 2 拍 slash_b 轮到同伴');
  assert.equal(b2.state.status, 'decided');
  assert.equal(b2.state.outcome.kind, 'lose');
  const closed = mod.closeScene(contract, b2.state, CTX);
  assert.equal(closed.writeBack.next, 'test.after_lose');
  assert.equal(closed.state.status, 'closed');
  assert.throws(() => mod.confirmAction(contract, closed.state, attack(['boss']), CTX), /不能再结算/);
});

test('防御检定与掩护：掩护成功给同伴挂“受掩护”，下一拍的防御 +4；受保护方不会被敌方点名', () => {
  const contract = makeContract({ enemyActions: [
    { id: 'hit_ally', party: 'foe_a', label: '偷袭', target: { party: 'ally' }, attack: { dc: 14 }, onHit: { statuses: [{ status: 'wound.external' }] } },
    { id: 'hit_ward', party: 'foe_b', label: '劫持', target: { party: 'ward' }, attack: { dc: 40 }, onHit: { statuses: [{ status: 'wound.external' }] } },
  ] });
  const { state } = begin(contract, { action: [12, 12], defense: [8, 8] });
  // 同伴防御加值 +2：8+2 = 10 < 14 → 没挡住
  const noGuard = mod.confirmAction(contract, state, attack(['boss']), CTX);
  assert.equal(noGuard.result.enemy.length, 1, 'ward 受保护，不会被点名');
  assert.equal(noGuard.result.enemy[0].outcome, 'hit');
  // 先掩护：受掩护 +4 → 8+2+4 = 14 ≥ 14 → 挡住
  const g = begin(contract, { action: [12], defense: [8, 8] });
  const guard = mod.confirmAction(contract, g.state, { goal: 'guard', magnitude: 1, targets: [], levers: [], text: '掩护同伴' }, CTX);
  assert.equal(guard.result.tier, 'success');
  assert.equal(guard.state.tags.some(t => t.id === 'guarded' && t.on === 'ally'), true);
  assert.equal(guard.result.enemy[0].defenseBonus, 6);
  assert.equal(guard.result.enemy[0].outcome, 'blocked');
});

test('状态是硬规则：外伤减判定和防御，失衡带劣势，到期自动移除', () => {
  const contract = makeContract();
  const { state } = begin(contract, { action: [10], defense: passes(4) });
  const wounded = structuredClone(state);
  wounded.statuses.pc.push({ id: 'wound.external', appliedBeat: 1, expiresBeat: null, cause: 'combat', sourceId: 'test' });
  const preview = mod.previewAction(contract, wounded, attack(['foe_a']), CTX);
  assert.equal(preview.modifierParts.status, -1);
  const out = mod.confirmAction(contract, wounded, attack(['foe_a']), CTX);
  assert.equal(out.result.enemy[0].defenseBonus, -1);
});

test('胜利：全部从合同读取；收束时各轨道置成合同的终态，发承重代价，红线与事后状态不被违反', () => {
  const contract = makeContract();
  const { state } = begin(contract, { action: [10, 10], defense: passes(8) });
  const big = { factors: 14 };
  const b1 = mod.confirmAction(contract, state, attack(['foe_a'], 3), big);
  assert.equal(b1.state.status, 'engaged');
  assert.equal(b1.result.enemy.some(r => r.actionId === 'strike_a'), false, '已被推到头的敌人不再出手');
  const b2 = mod.confirmAction(contract, b1.state, attack(['foe_b'], 2), big);
  assert.equal(b2.state.status, 'decided');
  assert.equal(b2.state.outcome.kind, 'win');
  assert.equal(b2.result.enemy.length, 0, '胜负已分，不再有敌方出手');
  const { state: closed, writeBack } = mod.closeScene(contract, b2.state, CTX);
  const final = Object.fromEntries(writeBack.finalStates.map(f => [`${f.party}.${f.track}`, f.label]));
  assert.deepEqual(final, { 'foe_a.vit': '出局', 'foe_b.vit': '重', 'boss.vit': '完好' });
  assert.equal(writeBack.flags['test.done'], true);
  assert.equal(writeBack.next, 'test.after_win');
  assert.deepEqual(writeBack.costs.map(c => c.id), ['cost_ally']);
  assert.deepEqual(writeBack.persistent.map(p => [p.party, p.status]), [['ally', 'wound.internal']]);
  assert.deepEqual(writeBack.violations, { redLines: [], afterState: [] });
  assert.match(writeBack.memoryNote, /击败来犯者：胜/);
  assert.equal(closed.digest.length, 0);
});

test('默认不设拍数：打到一方倒下才结束，不会因为拖得久自动结束', () => {
  const contract = makeContract({ enemyActions: [] });
  const { state } = begin(contract, { action: Array.from({ length: 60 }, () => 4) });
  let s = state;
  for (let i = 0; i < 60; i++) s = mod.confirmAction(contract, s, attack(['boss']), CTX).state;
  assert.equal(s.status, 'engaged');
  assert.equal(s.beat, 61);
  assert.equal(s.counters.actions, 60);
  assert.ok(s.audit.length <= 200);
});

test('合同设了拍数：拖满默认不算赢（超时收束）；只有合同明写 win 才算赢', () => {
  const run = clock => {
    const contract = makeContract({ clock, enemyActions: [] });
    const { state } = begin(contract, { action: [4, 4, 4] });
    let s = state;
    for (let i = 0; i < 2; i++) s = mod.confirmAction(contract, s, attack(['boss']), CTX).state;
    return { contract, state: s };
  };
  const implicit = run({ beats: 2 });
  assert.equal(implicit.state.outcome.kind, 'timeout');
  const timeout = mod.closeScene(implicit.contract, implicit.state, CTX);
  const final = Object.fromEntries(timeout.writeBack.finalStates.map(f => [f.party, f.label]));
  assert.equal(final.foe_a, '重', '合同写的超时收束：未完成的敌方置成“重”');
  assert.equal(run({ beats: 2, onTimeout: { type: 'close', as: 'timeout' } }).state.outcome.kind, 'timeout');
  assert.equal(run({ beats: 2, onTimeout: { type: 'close', as: 'win' } }).state.outcome.kind, 'win');
  assert.equal(run({ beats: 2, onTimeout: { type: 'close', as: 'lose' } }).state.outcome.kind, 'lose');
});

test('拍数用完后可以继续打（F10 型）：触发合同写的离场事件，之后不再设拍数', () => {
  const contract = makeContract({
    clock: { beats: 2, onTimeout: { type: 'continue', text: '首领下令离开', events: [{ depart: 'boss' }] } },
    objective: { text: '撑住再反击', win: { all: [{ party: 'boss', departed: true }, { party: 'foe_a', track: 'vit', reach: 'final' }] } },
  });
  const { state } = begin(contract, { action: Array.from({ length: 12 }, () => 10), defense: passes(30) });
  let s = state;
  let last;
  for (let i = 0; i < 2; i++) { last = mod.confirmAction(contract, s, attack(['boss']), CTX); s = last.state; }
  assert.equal(s.status, 'engaged');
  assert.equal(s.present.boss, false);
  assert.deepEqual(s.departed, ['boss']);
  assert.equal(last.result.timeout, true);
  assert.equal(last.result.events.find(e => e.id === 'clock:timeout').text, '首领下令离开');
  for (let i = 0; i < 6; i++) { s = mod.confirmAction(contract, s, attack(['foe_b']), { factors: 14 }).state; }
  assert.equal(s.status, 'engaged', '拍数规则只触发一次，之后不限拍数');
  const finish = mod.confirmAction(contract, s, attack(['foe_a'], 3), { factors: 14 });
  assert.equal(finish.state.outcome.kind, 'win');
});

test('固定事件：开场 / 某一拍开头 / 收束时触发，各触发一次', () => {
  const contract = makeContract({ clock: { fixedEvents: [
    { id: 'e0', onStart: true, text: '开场', effects: [] },
    { id: 'e2', atBeat: 2, text: '援兵到', effects: [{ depart: 'boss' }, { tag: { id: 'cover', label: '有掩体', on: 'scene', durationBeats: 1, effect: { defenseBonus: 1 } } }] },
    { id: 'ec', atClose: true, text: '尾声', effects: [] },
  ] }, objective: { text: 'x', win: { all: [{ party: 'foe_a', track: 'vit', reach: 'final' }] } } });
  const begun = begin(contract, { action: [10, 10], defense: passes(10) });
  assert.deepEqual(begun.events.map(e => e.id), ['e0']);
  const b1 = mod.confirmAction(contract, begun.state, attack(['boss']), CTX);
  assert.deepEqual(b1.result.events.map(e => e.id), ['e2']);
  assert.equal(b1.state.present.boss, false);
  assert.equal(b1.state.tags.some(t => t.id === 'cover'), true);
  const b2 = mod.confirmAction(contract, b1.state, attack(['foe_a'], 3), { factors: 14 });
  assert.equal(b2.state.status, 'decided');
  const closed = mod.closeScene(contract, b2.state, CTX);
  assert.deepEqual(closed.writeBack.events.map(e => e.id), ['ec']);
});

test('每次行动恰好一次判定；玩家检定和防御检定的骰流互不挤占；同种子同结果；读档 / 回滚面不变', () => {
  const contract = makeContract();
  const play = (from, plans) => plans.reduce((acc, plan) => {
    const out = mod.confirmAction(contract, acc.state, plan, CTX);
    return { state: out.state, results: [...acc.results, out.result] };
  }, { state: from, results: [] });
  const plans = [attack(['foe_a']), attack(['foe_b'], 2), attack(['boss']), attack(['foe_a'], 3)];
  const start = begin(contract, { seed: 20260605 }).state;
  delete start.forced;
  const one = play(start, plans);
  const two = play(structuredClone(start), plans);
  assert.deepEqual(one.state, two.state, '同种子 + 同计划 ＝ 同结果');
  const s = one.state;
  assert.equal(s.counters.actions, s.counters.checks);
  assert.equal(s.counters.checks, s.audit.length + 0);
  assert.equal(s.cursors.action, s.counters.actions);
  assert.ok(s.cursors.defense >= s.counters.defenseRolls);
  // 回滚：存档 JSON 往返后从第 2 拍重打，第 3 拍的骰面不变
  const mid = play(start, plans.slice(0, 2));
  const reloaded = JSON.parse(JSON.stringify(mid.state));
  const redo = play(reloaded, plans.slice(2));
  assert.deepEqual(redo.results.map(r => r.face), one.results.slice(2).map(r => r.face));
  // 防御骰流独立：去掉敌方出手，玩家检定骰面不变
  const quiet = makeContract({ enemyActions: [] });
  const q = begin(quiet, { seed: 20260605 }).state;
  delete q.forced;
  const quietFaces = plans.reduce((acc, plan) => {
    const out = mod.confirmAction(quiet, acc.state, plan, CTX);
    return { state: out.state, faces: [...acc.faces, out.result.face] };
  }, { state: q, faces: [] }).faces;
  assert.deepEqual(quietFaces, one.results.map(r => r.face));
});

test('目标数上限（战斗 1 个主目标＋范围主张）与受保护同伴（T6）', () => {
  const contract = makeContract();
  const { state } = begin(contract, { action: [10, 10, 10, 10], defense: passes(10) });
  const big = { factors: 14 };
  const single = mod.previewAction(contract, state, attack(['foe_a', 'foe_b']), big);
  assert.equal(single.targets.length, 1);
  assert.match(single.ignoredTargets[0], /1 个主目标/);
  const group = mod.previewAction(contract, state, { ...attack(['foe_a', 'foe_b']), scope: 'group' }, big);
  assert.equal(group.targets.length, 2);
  const all = mod.previewAction(contract, state, { ...attack([]), scope: 'all' }, big);
  assert.deepEqual(all.targets.map(t => t.party), ['foe_a', 'foe_b', 'boss']);
  const ranged = mod.confirmAction(contract, state, { ...attack(['foe_a', 'foe_b'], 1), scope: 'group' }, big);
  assert.deepEqual(ranged.result.claims.map(c => c.realized), [1, 1], '范围主张：同一颗骰，按主目标定档');
  // 受保护的同伴：主张被拦下，但仍然掷一次骰
  const ward = mod.confirmAction(contract, state, attack(['ward']), big);
  assert.equal(ward.result.claims[0].blocked.includes('拦下'), true);
  assert.equal(ward.state.counters.checks, 1);
  // 多方场景最多 3 个
  const court = makeContract({ meta: { id: 'test.court', version: 1, scene: { kind: 'court' }, hook: {} } });
  const c = begin(court, { action: [10] }).state;
  const preview = mod.previewAction(court, c, { ...attack(['foe_a', 'foe_b', 'boss', 'ward']), scope: 'group' }, big);
  assert.equal(preview.targets.length, 3);
});

test('原著锁：撞锁的主张改写成最接近的可行打法，仍然掷一次骰', () => {
  const contract = makeContract({ locks: [{ id: 'no_kill', matchHints: ['放他走'], reply: '这件事不由你决定', redirectTo: 'guard' }] });
  const { state } = begin(contract, { action: [12], defense: passes(10) });
  const out = mod.confirmAction(contract, state, attack(['foe_a'], 1, { text: '我放他走' }), CTX);
  assert.equal(out.result.lock.id, 'no_kill');
  assert.equal(out.result.goal, 'guard');
  assert.equal(out.state.counters.checks, 1);
});

test('败即结局：危险拍 / 前一拍预警由最坏情形模拟得出，没有伤害点也没有野心附加', () => {
  const ending = makeContract({ defeat: { conditions: [{ kind: 'partyDowned', party: 'pc' }], outcome: { type: 'ending', endingId: 'test.ending' }, guards: { warnText: '再失手就倒下了' } } });
  const { state } = begin(ending, {});
  assert.equal(mod.assessDanger(ending, state, CTX), 'pre', '主角还没受伤：最坏情形下一拍才可能倒下');
  const hurt = structuredClone(state);
  hurt.statuses.pc.push({ id: 'wound.external', appliedBeat: 1, expiresBeat: null, cause: 'combat', sourceId: 'test' });
  assert.equal(mod.assessDanger(ending, hurt, CTX), 'danger');
  const preview = mod.previewAction(ending, hurt, attack(['foe_a']), CTX);
  assert.equal(preview.warn, 'danger');
  assert.equal(preview.warnText, '再失手就倒下了');
  const continues = makeContract();
  assert.equal(mod.assessDanger(continues, hurt, CTX), 'none', '败后续接、不结束的合同不预警');
  // 拍数限制型败局：限制前一拍预警
  const timed = makeContract({ clock: { beats: 3, onTimeout: { type: 'close', as: 'lose' } }, defeat: { conditions: [{ kind: 'partyDowned', party: 'pc' }], outcome: { type: 'ending', endingId: 'x' } }, enemyActions: [] });
  const t = begin(timed, {}).state;
  assert.equal(mod.assessDanger(timed, t, CTX), 'none');
  t.beat = 2;
  assert.equal(mod.assessDanger(timed, t, CTX), 'pre');
  t.beat = 3;
  assert.equal(mod.assessDanger(timed, t, CTX), 'danger');
});

test('玩家的主动选择（加入 / 投降）只由玩家触发，要经确认卡，骰子触发不了', () => {
  const contract = makeContract({ defeat: {
    conditions: [{ kind: 'partyDowned', party: 'pc' }, { kind: 'playerChoice', choices: [{ id: 'surrender', label: '投降', matchHints: ['我投降', '我愿意加入'], endingId: 'test.capture', confirmText: '你确定要放下武器吗？' }] }],
    outcome: { type: 'continue' } } });
  const choice = mod.matchPlayerChoice(contract, '我 投降！');
  assert.equal(choice.id, 'surrender');
  assert.equal(choice.confirmText, '你确定要放下武器吗？');
  assert.equal(mod.matchPlayerChoice(contract, '我拔刀砍他'), null);
  const { state } = begin(contract, { action: [1], defense: passes(10) });
  const rolled = mod.confirmAction(contract, state, attack(['foe_a']), CTX);
  assert.equal(rolled.state.status === 'decided' && rolled.state.outcome.endingId, false, '大失败不会触发主动选择型结局');
  const decided = mod.applyPlayerChoice(contract, state, 'surrender');
  assert.deepEqual([decided.status, decided.outcome.kind, decided.outcome.endingId], ['decided', 'lose', 'test.capture']);
});

test('识别层提议的校验：结算字段整份丢弃，要素 / 动词 / 目标必须在白名单内，依据必须是原话里的肯定句', () => {
  const contract = makeContract();
  const { state } = begin(contract, {});
  const v = (raw, text) => mod.validateProposal(contract, state, raw, text);
  assert.equal(v({ goal: 'attack', claim: { magnitude: 2 }, difficulty: 5 }, '砍他').plan, null);
  assert.equal(v({ goal: 'win_all' }, '砍他').plan, null);
  const text = '我借着浓雾，挥长刀砍向他。不用火药罐。';
  const good = v({ goal: 'attack', claim: { magnitude: 9, scope: 'single', targets: ['foe_a', 'nobody'] },
    levers: [
      { element: 'fog', verb: 'conceal', evidence: '浓雾' },
      { element: 'blade', verb: 'slash', evidence: '长刀' },
      { element: 'bomb', verb: 'throw', evidence: '火药罐' },
      { element: 'fog', verb: 'conceal', evidence: '浓雾' },
      { element: 'blade', verb: 'nope', evidence: '长刀' },
      { element: 'ally_help', verb: 'assist', evidence: '没说过的话' },
    ] }, text);
  assert.deepEqual(good.plan.levers.map(l => l.element), ['fog', 'blade']);
  assert.equal(good.plan.magnitude, 3);
  assert.deepEqual(good.plan.targets, ['foe_a']);
  assert.ok(good.dropped.some(d => d.includes('火药罐')), '否定句里的依据被丢弃');
  assert.ok(good.dropped.some(d => d.includes('nobody')));
});

test('一场跑完的耗时：几百拍的结算与简报在毫秒级（不拖慢速度）', () => {
  const contract = makeContract({ enemyActions: makeContract().enemyActions.map(a => ({ ...a, attack: { dc: 1 } })) });
  const { state } = begin(contract, { seed: 99 });
  delete state.forced;
  const t0 = performance.now();
  let s = state;
  for (let i = 0; i < 300 && s.status === 'engaged'; i++) {
    s = mod.confirmAction(contract, s, attack(['boss']), CTX).state;
    mod.buildSceneBrief(contract, s);
  }
  assert.ok(performance.now() - t0 < 1500, `耗时 ${performance.now() - t0} ms`);
});
