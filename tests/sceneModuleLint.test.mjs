import assert from 'node:assert/strict';
import test from 'node:test';
import { mod, makeContract } from './sceneModuleFixture.mjs';

const lint = patch => mod.lintContract(makeContract(patch));
const has = (list, re) => list.some(line => re.test(line));

test('夹具合同通过体检；开场会跑一次体检，不通过就拒绝开场', () => {
  assert.deepEqual(lint({}).errors, []);
  const bad = makeContract({ objective: { text: 'x', win: { all: [] } } });
  assert.throws(() => mod.beginScene(bad, { seed: 1 }), /体检未通过/);
});

test('最小合同通过体检：只写 meta / objective.win / parties / defeat，其余用模块默认（战斗默认目标集、没有锁、没有承重代价）', () => {
  const minimal = {
    meta: { id: 'test.min', version: 1, scene: { kind: 'combat' }, hook: {} },
    objective: { text: '打赢', win: { all: [{ party: 'foe', track: 'vit', reach: 'final' }] } },
    parties: [
      { id: 'pc', side: 'player_side', ref: 'test.character.hero', player: true },
      { id: 'foe', side: 'opposed', ref: 'test.foe.one', tracks: [{ id: 'vit', scale: ['好', '伤', '倒'], ending: { finalState: '倒', ceiling: 2 } }] },
    ],
    defeat: { conditions: [{ kind: 'partyDowned', party: 'pc' }] },
  };
  const report = mod.lintContract(minimal);
  assert.deepEqual(report.errors, []);
  const { state } = mod.beginScene(minimal, { seed: 5 });
  const out = mod.confirmAction(minimal, state, { goal: 'attack', magnitude: 2, targets: ['foe'], levers: [], text: '砍' }, { factors: 20 });
  assert.equal(out.result.goal, 'attack');
});

test('已取消的旧字段（伤害点、战败代价梯度、野心附加）出现就报错，并指向新写法', () => {
  const legacy = lint({
    costLadder: { ref: 'standard3', tiers: [] },
    defeat: { conditions: [{ kind: 'harmPointsAtLeast', value: 4 }], outcome: { type: 'tiered' }, guards: { warnBeatsBefore: 1, ambitionSurcharge: { maxTierLift: 1 } } },
    settings: { tiers: { failCost: { harmPoints: 1 }, critFailCost: { harmPoints: 2 }, harmToTier: [[0, 1]], critRelief: 0 } },
  });
  for (const key of ['costLadder', 'harmPointsAtLeast', 'ambitionSurcharge', 'maxTierLift', 'failCost', 'critFailCost', 'harmToTier', 'critRelief']) {
    assert.ok(has(legacy.errors, new RegExp(key)), `应拒绝 ${key}`);
  }
  assert.ok(has(legacy.warnings, /tiered/), 'tiered 提示改名 continue');
  assert.ok(has(lint({ defeat: { conditions: [{ kind: 'fatalBeat', beat: 3 }] } }).errors, /fatalBeat/));
});

test('通用模块不自带门槛：必经合同没写 ambushAfterStall 报错；设了拍数没写 onTimeout 给警告；拍数非法报错', () => {
  assert.ok(has(lint({ meta: { id: 'a', version: 1, scene: { kind: 'combat' }, hook: { required: true } } }).errors, /ambushAfterStall/));
  assert.deepEqual(lint({ meta: { id: 'a', version: 1, scene: { kind: 'combat' }, hook: { required: true, ambushAfterStall: 3 } } }).errors, []);
  assert.ok(has(lint({ clock: { beats: 4 } }).warnings, /不算赢/));
  assert.ok(has(lint({ clock: { beats: 0, onTimeout: { type: 'close', as: 'timeout' } } }).errors, /beats/));
  assert.ok(has(lint({ clock: { beats: 2, fixedEvents: [{ id: 'late', atBeat: 3, effects: [] }] } }).errors, /超出 clock.beats/));
  assert.deepEqual(lint({ clock: undefined }).errors, [], '不写 clock＝不设拍数');
});

test('必须有胜路径和败路径；ceiling 为 0 的目标不能出现在“final”胜利条件里', () => {
  assert.ok(has(lint({ defeat: undefined }).errors, /没有任何败路径/));
  assert.deepEqual(lint({ defeat: undefined, clock: { beats: 3, onTimeout: { type: 'close', as: 'lose' } } }).errors, []);
  assert.ok(has(lint({ objective: { text: 'x', win: { all: [{ party: 'boss', track: 'vit', reach: 'final' }] } } }).errors, /ceiling 为 0/));
  assert.ok(has(lint({ objective: { text: 'x', win: { all: [{ party: 'boss', departed: true }] } } }).errors, /没有任何事件让它离场/));
  assert.deepEqual(lint({ objective: { text: 'x', win: { all: [{ party: 'boss', departed: true }] } }, clock: { fixedEvents: [{ id: 'go', atBeat: 2, effects: [{ depart: 'boss' }] }] } }).errors, []);
});

test('红线：合同声明某参与方不得到达某终态，体检证明没有任何路径能到达', () => {
  assert.deepEqual(lint({}).errors, []);
  const stateEnds = makeContract();
  stateEnds.parties.find(p => p.id === 'boss').tracks[0].ending = { finalState: '出局', ceiling: 0 };
  assert.ok(has(mod.lintContract(stateEnds).errors, /终态 finalState 正是禁止/));
  const reachable = makeContract();
  reachable.parties.find(p => p.id === 'boss').tracks[0].ending = { finalState: '完好', ceiling: 3 };
  reachable.redLines = [{ party: 'boss', track: 'vit', forbiddenFinalState: '重' }];
  assert.ok(has(mod.lintContract(reachable).errors, /可以推到/), 'ceiling 3 能把轨道推到第 3 格“重”');
  assert.ok(has(lint({ clock: { fixedEvents: [{ id: 'bad', atBeat: 2, effects: [{ setTrack: { party: 'boss', track: 'vit', to: '出局' } }] }] } }).errors, /有事件把它设成/));
  assert.ok(has(lint({ closing: { timeout: { settle: [{ party: 'boss', to: '出局' }] } } }).errors, /closing.settle/));
});

test('状态引用：未知状态报错；内置临时状态给提示；宿主目录优先；败局依赖“倒下”却没有路径给警告', () => {
  const unknown = makeContract();
  unknown.enemyActions[0].onHit.statuses = [{ status: 'no.such.status' }];
  assert.ok(has(mod.lintContract(unknown).errors, /no\.such\.status/));
  assert.ok(has(lint({}).infos, /临时定义/));
  const catalog = id => id === 'cat.status' ? { id, label: '目录状态', tier: 'book', cause: 'combat', kind: 'debuff', effects: [] } : undefined;
  const viaCatalog = makeContract();
  viaCatalog.enemyActions[0].onHit.statuses = [{ status: 'cat.status' }];
  assert.deepEqual(mod.lintContract(viaCatalog, { catalog }).errors, []);
  assert.equal(mod.resolveStatusDef('wound.external', viaCatalog, { catalog: id => ({ ...catalog('cat.status'), id }) }).label, '目录状态', '目录里有同 id 的定义时以目录为准');
  const noRoute = makeContract({ enemyActions: [], fumble: [] });
  assert.ok(has(mod.lintContract(noRoute).warnings, /永远输不了/));
});

test('要素与锁：要素缺出处、前置条件格式不对、引用的标签不存在，都报错', () => {
  const c = makeContract();
  delete c.elements[0].source;
  c.elements[1].verbs[0].creates = 'ghost_tag';
  c.elements[2].verbs[0].requires = ['weather:rain'];
  const errors = mod.lintContract(c).errors;
  assert.ok(has(errors, /缺 source/));
  assert.ok(has(errors, /ghost_tag/));
  assert.ok(has(errors, /weather:rain/));
});

test('玩家本人只能有一个；参与方 id 不能重复；主动选择必须有确认卡', () => {
  const two = makeContract();
  two.parties[1].player = true;
  assert.ok(has(mod.lintContract(two).errors, /恰有一个 player/));
  const dup = makeContract();
  dup.parties[1].id = 'pc';
  assert.ok(has(mod.lintContract(dup).errors, /重复/));
  assert.ok(has(lint({ defeat: { conditions: [{ kind: 'playerChoice', choices: [{ id: 'x', label: 'x', matchHints: ['x'], endingId: 'e' }] }] } }).errors, /confirmText/));
});

test('体检抓常见的写法失误：onTimeout 写成字符串、效果形状不对、可用性写成文字、前置条件写成文字', () => {
  assert.ok(has(lint({ clock: { beats: 4, onTimeout: 'win' } }).errors, /onTimeout 必须写成/), '字符串 "win" 不会算赢，所以必须报错而不是悄悄当成超时');
  assert.ok(has(lint({ clock: { fixedEvents: [{ id: 'bad', atBeat: 2, effects: [{ track: 'fog', set: '渐散' }] }] } }).errors, /无法识别的效果/));
  const c = makeContract();
  c.elements[0].availability = '全程；扔出后失去';
  c.elements[1].verbs[0].requires = 'wu_er_lang 已出手';
  c.elements[2].uses = 0;
  const errors = mod.lintContract(c).errors;
  assert.ok(has(errors, /availability 必须是/));
  assert.ok(has(errors, /requires 必须是数组/));
  assert.ok(has(errors, /uses 必须是/));
  assert.deepEqual(lint({ clock: { beats: 4, onTimeout: { type: 'close', as: 'win' } } }).errors, []);
});
