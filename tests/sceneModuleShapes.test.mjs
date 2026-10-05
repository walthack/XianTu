// 剧情策划草案里会出现的几种合同形态，用抽象内容验证模块都能表达、能体检、能跑通（不涉及任何一场的剧情）。
import assert from 'node:assert/strict';
import test from 'node:test';
import { mod, CTX, attack, begin } from './sceneModuleFixture.mjs';

const SCALE = ['完好', '轻', '中', '重', '出局'];
const FLEE_SCALE = ['完好', '受创', '重伤', '倒下', '逃走'];
const foe = (id, ref, ending) => ({ id, side: 'opposed', ref, tracks: [{ id: 'vit', scale: SCALE, ending }] });
const pc = { id: 'pc', side: 'player_side', ref: 'test.character.hero', player: true };
const base = {
  goals: [{ id: 'attack', baseDifficulty: 12 }],
  enemyActions: [],
  closing: { win: { next: 'x' }, lose: { next: 'x' } },
};

test('“限拍 + 拍满剩下的对手逃走”型（防止逃脱）：不赢也不输，剩下的按合同置成“逃走”', () => {
  const contract = {
    ...base,
    meta: { id: 'shape.escape', version: 1, scene: { kind: 'combat' }, hook: { required: true, ambushAfterStall: 3 } },
    objective: { text: '一个也别放走', win: { all: ['f1', 'f2', 'f3'].map(party => ({ party, track: 'vit', reach: 'final' })) } },
    parties: [pc, ...['f1', 'f2', 'f3'].map(id => ({ ...foe(id, `test.foe.${id}`, { finalState: '倒下', ceiling: 3 }), tracks: [{ id: 'vit', scale: FLEE_SCALE, ending: { finalState: '倒下', ceiling: 3 } }] }))],
    tracks: [{ id: 'vit', kind: 'harm', scale: FLEE_SCALE }],
    clock: { beats: 4, onTimeout: { type: 'close', as: 'timeout' } },
    defeat: { conditions: [{ kind: 'partyDowned', party: 'pc' }], outcome: { type: 'continue' } },
    closing: { win: { next: 'after' }, lose: { next: 'after' }, timeout: { settle: [{ side: 'opposed', onlyUnfinished: true, to: '逃走' }], next: 'after_escape' } },
  };
  assert.deepEqual(mod.lintContract(contract).errors, []);
  let { state } = begin(contract, { action: [10, 10, 10, 10, 10], defense: [] });
  const big = { factors: 14 };
  const killed = [];
  for (const target of ['f1', 'f2', 'f2', 'f2']) {
    const out = mod.confirmAction(contract, state, attack([target], 3), big);
    state = out.state;
    if (out.result.claims[0].label) killed.push(out.result.claims[0].label);
  }
  assert.equal(state.status, 'decided');
  assert.equal(state.outcome.kind, 'timeout', '拖满拍数不算赢');
  const { writeBack } = mod.closeScene(contract, state, CTX);
  const final = Object.fromEntries(writeBack.finalStates.map(f => [f.party, f.label]));
  assert.equal(final.f1, '倒下', '已被推到头的保持原样');
  assert.equal(final.f3, '逃走', '没打完的置成合同写的“逃走”标签');
  assert.equal(writeBack.next, 'after_escape');
});

test('“前段限拍、拍满某方离场、后段不设拍数”型 + 红线 + 玩家主动选择型终局', () => {
  const contract = {
    ...base,
    meta: { id: 'shape.two_part', version: 1, scene: { kind: 'combat' }, hook: { required: true, ambushAfterStall: 3 } },
    objective: { text: '撑住再反击', win: { all: [{ party: 'king', departed: true }, { party: 'beast', track: 'vit', reach: 'final' }] } },
    parties: [pc, foe('king', 'test.foe.king', { finalState: '完好', ceiling: 0 }), foe('beast', 'test.foe.beast', { finalState: '出局', ceiling: 3 })],
    tracks: [{ id: 'vit', kind: 'harm', scale: SCALE }],
    clock: { beats: 3, onTimeout: { type: 'continue', text: '他转身离去', events: [{ depart: 'king' }] } },
    enemyActions: [{ id: 'king_strike', party: 'king', label: '压制', target: 'player', attack: { dc: 14 }, onHit: { statuses: [{ status: 'wound.external' }] } }],
    redLines: [{ party: 'king', track: 'vit', forbiddenFinalState: '出局', forbiddenNarration: ['被击杀'] }],
    defeat: {
      conditions: [{ kind: 'partyDowned', party: 'pc' }, { kind: 'playerChoice', choices: [{ id: 'yield', label: '投降', matchHints: ['我投降'], endingId: 'test.captured', confirmText: '确定要放下武器吗？' }] }],
      outcome: { type: 'continue' },
    },
    closing: { win: { next: 'after' }, lose: { next: 'after' } },
  };
  assert.deepEqual(mod.lintContract(contract).errors, []);
  // 红线：把“出局”设成他的终态、或让玩家能把他推到“出局”，体检就报错
  const broken = structuredClone(contract);
  broken.parties[1].tracks[0].ending = { finalState: '出局', ceiling: 0 };
  assert.ok(mod.lintContract(broken).errors.some(e => /终态 finalState 正是禁止/.test(e)));
  // 前段：玩家无论怎么打都伤不到他；三拍满后他离开，战斗继续、不再限拍
  let { state } = begin(contract, { action: Array.from({ length: 10 }, () => 10), defense: Array.from({ length: 30 }, () => 20) });
  for (let i = 0; i < 3; i++) state = mod.confirmAction(contract, state, attack(['king'], 3), CTX).state;
  assert.equal(state.tracks.king.vit, 0, '红线：他一格伤都没有');
  assert.equal(state.present.king, false);
  assert.equal(state.status, 'engaged');
  assert.equal(state.beat, 4);
  // 后段：对手换成野兽，不设拍数，打到倒下
  state = mod.confirmAction(contract, state, attack(['beast'], 3), { factors: 14 }).state;
  assert.equal(state.outcome.kind, 'win');
  const { writeBack } = mod.closeScene(contract, state, CTX);
  assert.deepEqual(writeBack.violations, { redLines: [], afterState: [] });
  // 玩家主动选择投降：要经确认卡，才进入合同写的结局
  const fresh = begin(contract, { action: [10], defense: [20] }).state;
  const choice = mod.matchPlayerChoice(contract, '我投降');
  assert.equal(choice.confirmText, '确定要放下武器吗？');
  const decided = mod.applyPlayerChoice(contract, fresh, choice.id);
  assert.equal(decided.outcome.endingId, 'test.captured');
  assert.equal(mod.closeScene(contract, decided, CTX).writeBack.outcome.kind, 'lose');
});

test('叙事型参与方与玩家一方的“伤亡”：同伴 / 旁观者可以没有轨道；伤情只以状态存在，且带得出场景', () => {
  const contract = {
    ...base,
    meta: { id: 'shape.narrative', version: 1, scene: { kind: 'combat' }, hook: {} },
    objective: { text: '护住同伴', win: { all: [{ party: 'foe', track: 'vit', reach: 'final' }] } },
    parties: [
      pc,
      { id: 'friend', side: 'player_side', ref: 'test.character.friend', defense: { bonus: 1 } },
      { id: 'bystander', side: 'neutral', ref: '路人', protected: true },
      foe('foe', 'test.foe.one', { finalState: '出局', ceiling: 3 }),
    ],
    tracks: [{ id: 'vit', kind: 'harm', scale: SCALE }],
    enemyActions: [{ id: 'cut', party: 'foe', label: '劈砍', target: { party: 'friend' }, attack: { dc: 18 }, onHit: { statuses: [{ status: 'wound.external' }, { status: 'wound.internal' }] } }],
    defeat: { conditions: [{ kind: 'partyDowned', party: 'pc' }], outcome: { type: 'continue' } },
  };
  assert.deepEqual(mod.lintContract(contract).errors, []);
  let { state } = begin(contract, { action: [10, 10], defense: [2, 2, 2] });
  state = mod.confirmAction(contract, state, attack(['foe'], 1), CTX).state;
  assert.deepEqual(state.statuses.friend.map(s => s.id).sort(), ['wound.external', 'wound.internal'], '同伴身上挂了具体的状态');
  state = mod.confirmAction(contract, state, attack(['foe'], 3), { factors: 14 }).state;
  const { writeBack } = mod.closeScene(contract, state, CTX);
  assert.deepEqual(writeBack.persistent.filter(p => p.party === 'friend').map(p => p.status).sort(), ['wound.external', 'wound.internal']);
  assert.ok(writeBack.persistent.every(p => p.ref === 'test.character.friend'), '用角色库 id 交给统一状态系统，不是显示名');
});
