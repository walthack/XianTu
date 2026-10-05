import assert from 'node:assert/strict';
import test from 'node:test';
import { mod, makeContract, CTX, attack, begin } from './sceneModuleFixture.mjs';

const hit = (id, extra = {}) => ({ id, party: 'foe_a', label: id, target: 'player', attack: { dc: 14 }, onHit: { statuses: [{ status: 'wound.external' }] }, ...extra });
const statusIds = (state, party) => (state.statuses[party] || []).map(s => s.id);

test('没挡住的差距够大，改挂更重的状态（onCrush）；差距小就挂普通的', () => {
  const contract = makeContract({ enemyActions: [hit('big', { onCrush: { margin: 8, statuses: [{ status: 'wound.external.heavy' }] } })] });
  const heavy = mod.confirmAction(contract, begin(contract, { action: [10], defense: [1] }).state, attack(['boss']), CTX);
  assert.equal(heavy.result.enemy[0].crushed, true);
  assert.deepEqual(statusIds(heavy.state, 'pc'), ['wound.external.heavy']);
  const light = mod.confirmAction(contract, begin(contract, { action: [10], defense: [8] }).state, attack(['boss']), CTX);
  assert.equal(light.result.enemy[0].crushed, false);
  assert.deepEqual(statusIds(light.state, 'pc'), ['wound.external']);
});

test('目标选择：each 对阵营每位成员各掷一次防御；受保护方除非明写 allowProtected 否则不被点名', () => {
  const sweep = makeContract({ enemyActions: [hit('sweep', { target: { each: 'player_side' } })] });
  const out = mod.confirmAction(sweep, begin(sweep, { action: [10], defense: [1, 1] }).state, attack(['boss']), CTX);
  assert.deepEqual(out.result.enemy.map(r => r.target), ['pc', 'ally']);
  assert.equal(out.state.counters.defenseRolls, 2);
  const guarded = makeContract({ enemyActions: [hit('raid', { target: { each: 'neutral' } })] });
  assert.equal(mod.confirmAction(guarded, begin(guarded, { action: [10], defense: [1] }).state, attack(['boss']), CTX).result.enemy.length, 0);
  const allowed = makeContract({ enemyActions: [hit('raid', { target: { each: 'neutral' }, allowProtected: true })] });
  assert.equal(mod.confirmAction(allowed, begin(allowed, { action: [10], defense: [1] }).state, attack(['boss']), CTX).result.enemy.length, 1);
});

test('出手时机：fromBeat / onBeats / every / when 都读合同；不在时机内不出手也不耗防御骰', () => {
  const rollsOver = (action, beats = 4) => {
    const contract = makeContract({ enemyActions: [action] });
    let { state } = begin(contract, { action: Array.from({ length: beats }, () => 4), defense: Array.from({ length: 20 }, () => 20) });
    const fired = [];
    for (let i = 0; i < beats; i++) {
      const out = mod.confirmAction(contract, state, attack(['boss']), CTX);
      fired.push(out.result.enemy.length);
      state = out.state;
    }
    return { fired, defenseUsed: state.cursors.defense };
  };
  assert.deepEqual(rollsOver(hit('a', { schedule: { fromBeat: 2 } })).fired, [0, 1, 1, 1]);
  assert.deepEqual(rollsOver(hit('b', { schedule: { onBeats: [1, 3] } })).fired, [1, 0, 1, 0]);
  assert.deepEqual(rollsOver(hit('c', { schedule: { every: 2 } })).fired, [1, 0, 1, 0]);
  assert.deepEqual(rollsOver(hit('d', { schedule: { untilBeat: 2 } })).fired, [1, 1, 0, 0]);
  const gated = rollsOver(hit('e', { when: { kind: 'partyDeparted', party: 'boss' } }));
  assert.deepEqual(gated.fired, [0, 0, 0, 0]);
  assert.equal(gated.defenseUsed, 0, '没出手就不耗防御骰');
});

test('防御带劣势时掷两颗取低（占两个游标位），只算一次防御检定', () => {
  const contract = makeContract({ enemyActions: [hit('strike')] });
  const { state } = begin(contract, { action: [10], defense: [18, 3] });
  state.statuses.pc.push({ id: 'off_balance', appliedBeat: 1, expiresBeat: 5, cause: 'combat', sourceId: 't' });
  const out = mod.confirmAction(contract, state, attack(['boss']), CTX);
  assert.equal(out.result.enemy[0].face, 3);
  assert.equal(out.state.cursors.defense, 2);
  assert.equal(out.state.counters.defenseRolls, 1);
});

test('大失败的后果也可以是轨道倒退（朝堂：立场 / 信用），不会退过刻度的头', () => {
  const contract = makeContract({ enemyActions: [], fumble: [{ id: 'lose_trust', target: { party: 'ally' }, consequence: { kind: 'trackShift', party: 'ally', track: 'trust', steps: -2 } }] });
  contract.parties.find(p => p.id === 'ally').tracks = [{ id: 'trust', scale: ['无', '低', '中', '高'], initial: 2 }];
  assert.deepEqual(mod.lintContract(contract).errors, []);
  const { state } = begin(contract, { action: [1, 1] });
  const one = mod.confirmAction(contract, state, attack(['foe_a']), CTX);
  assert.equal(one.result.fumble.consequence.kind, 'trackShift');
  assert.equal(one.state.tracks.ally.trust, 0);
  const two = mod.confirmAction(contract, one.state, attack(['foe_a']), CTX);
  assert.equal(two.state.tracks.ally.trust, 0, '不会倒退到刻度之外');
});

test('败局条件不止“主角倒下”：同伴全部倒下、某状态出现、某方被推到头，都由合同写', () => {
  const side = makeContract({ defeat: { conditions: [{ kind: 'sideDowned', side: 'player_side' }], outcome: { type: 'continue' } } });
  const { state } = begin(side, {});
  assert.equal(mod.isLost(side, state), false);
  const down = structuredClone(state);
  for (const id of ['pc', 'ally']) down.statuses[id].push({ id: 'incapacitated', appliedBeat: 1, expiresBeat: null, cause: 'combat', sourceId: 't' });
  assert.equal(mod.isLost(side, down), true);
  const half = structuredClone(state);
  half.statuses.pc.push({ id: 'incapacitated', appliedBeat: 1, expiresBeat: null, cause: 'combat', sourceId: 't' });
  assert.equal(mod.isLost(side, half), false, '还有人站着就没输');
  const named = makeContract({ defeat: { conditions: [{ party: 'pc', status: 'disarmed' }], outcome: { type: 'continue' } } });
  const s2 = begin(named, {}).state;
  s2.statuses.pc.push({ id: 'disarmed', appliedBeat: 1, expiresBeat: null, cause: 'combat', sourceId: 't' });
  assert.equal(mod.isLost(named, s2), true);
});

test('败局那一拍的收束：lose 分支的续接 / 结局 id 随结果带出，已有的状态留在身上交给统一状态系统', () => {
  const contract = makeContract({ defeat: { conditions: [{ kind: 'partyDowned', party: 'pc' }], outcome: { type: 'ending', endingId: 'test.ending' } } });
  const { state } = begin(contract, { action: [10, 10], defense: [1, 1, 1, 1, 1, 1] });
  const b1 = mod.confirmAction(contract, state, attack(['boss']), CTX);
  const b2 = mod.confirmAction(contract, b1.state, attack(['boss']), CTX);
  assert.deepEqual([b2.state.status, b2.state.outcome.kind, b2.state.outcome.endingId], ['decided', 'lose', 'test.ending']);
  const closed = mod.closeScene(contract, b2.state, CTX);
  assert.equal(closed.writeBack.outcome.endingId, 'test.ending');
  assert.equal(closed.writeBack.next, 'test.after_lose');
  assert.ok(closed.writeBack.persistent.some(p => p.party === 'pc' && p.status === 'incapacitated'), '倒下的状态留在主角身上');
  assert.throws(() => mod.closeScene(contract, state, CTX), /还没分出结果/);
});
