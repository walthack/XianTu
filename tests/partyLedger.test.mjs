// 在队账 T7（身份账补充设计稿 2026-10-26 §3 / §3.8；总策划已审 Q4）：party.<characterId> 以显式在队账为准——
// 开局关在队名单 → 按编年史完成顺序应用离队/入队（whenReceiptId 区分玩家选择，同一事件先离后入）→ 去掉 departedCast。
// 不加存档字段；启发式同行名单不参与。规则均为测试夹具（setPlayerLedgerRulesForTest / 显式入参），仓库规则表首版为空。
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

// 顺序加载，保证规则表夹具与 ledgerConditions 看到同一份 playerLedgerRules.ts
const loaded = (async () => {
  const rules = await loadTs('../src/modules/scenarioMods/playerLedgerRules.ts');
  const party = await loadTs('../src/modules/scenarioMods/partyLedger.ts');
  const ledger = await loadTs('../src/modules/scenarioMods/ledgerConditions.ts');
  const store = await loadTs('../src/modules/diagnostics/store.ts');
  return { rules, party, ledger, store };
})();

const NING_YU = 'liuchao.character.ning_yu';
const ALLY = 'test.character.ally';
const OTHER = 'test.character.other';
const PROLOGUE = 'lcq.stage_01';
const LATER = 'lcq.stage_03';
const table = (patch = {}) => ({ version: 1, identityGrants: [], identityRevokes: [], lineOutcomes: [], itemGroups: [], partyJoins: [], partyLeaves: [], partyOpenings: [], ...patch });
const entry = (stageId, eventId, sequence) => ({ id: `chronicle.${stageId}.${eventId}`, type: 'event', stageId, title: '', sequence });
/** 编年史按给定顺序完成 doneIds；夹具事件挂进本关 events，orderedDoneEventIds 才认 */
const runtimeOf = ({ stageId = PROLOGUE, doneIds = [], eventIds = doneIds, receipts = [], departedCast, modId = stageId } = {}) => ({
  modId,
  events: eventIds.map(id => ({ id })),
  chronicle: doneIds.map((id, i) => entry(stageId, id, i + 1)),
  completedEventIds: [],
  pathReceipts: Object.fromEntries(receipts.map(receiptId => [receiptId, { receiptId }])),
  ...(departedCast ? { departedCast } : {}),
  flags: {},
});
const inParty = (characterId) => ({ path: `party.${characterId}`, operator: 'eq', value: true });

async function withRules(rulesTable, fn) {
  const { rules } = await loaded;
  rules.setPlayerLedgerRulesForTest(rulesTable);
  try { return await fn(); } finally { rules.setPlayerLedgerRulesForTest(undefined); }
}

test('仓库规则表在队三键首版为空', async () => {
  const { rules } = await loaded;
  const repo = rules.playerLedgerRules();
  assert.deepEqual([repo.partyJoins, repo.partyLeaves, repo.partyOpenings], [[], [], []]);
});

test('规则表为空时 party.* 恒为 false', async () => {
  const { party, ledger } = await loaded;
  const runtime = runtimeOf({ doneIds: ['test.event.a'] });
  assert.equal(party.partyRoster(runtime).size, 0);
  assert.equal(party.isInParty(runtime, NING_YU), false);
  assert.deepEqual(ledger.resolveLedgerPath(`party.${NING_YU}`, runtime), { handled: true, value: false }, '不在队为 false 不是 undefined');
  assert.equal(ledger.evaluateLedgerCondition(inParty(NING_YU), runtime), false);
  assert.equal(ledger.evaluateLedgerCondition({ path: `party.${NING_YU}`, operator: 'neq', value: true }, runtime), true);
});

test('开局关名单生效且按编年史首条 stageId 取', async () => {
  const { party } = await loaded;
  const rulesTable = table({ partyOpenings: [{ stageId: PROLOGUE, characterIds: [NING_YU] }, { stageId: LATER, characterIds: [ALLY] }] });
  // 从序幕开局：编年史首条在序幕，切到后面的关仍按序幕名单
  const fromPrologue = runtimeOf({ doneIds: ['test.event.a'], modId: LATER });
  fromPrologue.chronicle.push(entry(LATER, 'test.event.b', 9));
  fromPrologue.events.push({ id: 'test.event.b' });
  assert.equal(party.partyOpeningStage(fromPrologue), PROLOGUE);
  assert.deepEqual([...party.partyRoster(fromPrologue, rulesTable)], [NING_YU]);
  // 编年史乱序存放也取 sequence 最小那条
  fromPrologue.chronicle.reverse();
  assert.equal(party.partyOpeningStage(fromPrologue), PROLOGUE);
  // 试玩入口从后面的关开局：首条在该关
  const fromLater = runtimeOf({ stageId: LATER, doneIds: ['test.event.b'] });
  assert.deepEqual([...party.partyRoster(fromLater, rulesTable)], [ALLY]);
  // 还没有编年史：取当前 modId
  assert.equal(party.partyOpeningStage(runtimeOf({ stageId: LATER })), LATER);
  assert.deepEqual([...party.partyRoster(runtimeOf({ stageId: LATER }), rulesTable)], [ALLY]);
  // 名单里没有本关：空
  assert.equal(party.partyRoster(runtimeOf({ stageId: 'lcq.stage_02' }), rulesTable).size, 0);
});

test('入队/离队按完成顺序，同事件先离后入', async () => {
  const { party } = await loaded;
  const rulesTable = table({
    partyJoins: [{ eventId: 'test.event.join', characterId: ALLY }, { eventId: 'test.event.swap', characterId: ALLY }],
    partyLeaves: [{ eventId: 'test.event.leave', characterId: ALLY }, { eventId: 'test.event.swap', characterId: ALLY }],
  });
  const roster = (doneIds) => [...party.partyRoster(runtimeOf({ doneIds }), rulesTable)];
  assert.deepEqual(roster(['test.event.join']), [ALLY]);
  assert.deepEqual(roster(['test.event.join', 'test.event.leave']), []);
  assert.deepEqual(roster(['test.event.leave', 'test.event.join']), [ALLY], '离队在前入队在后，以后到的为准');
  assert.deepEqual(roster(['test.event.join', 'test.event.leave', 'test.event.swap']), [ALLY], '同一事件既离又入：先离后入，结果在队');
  // 本关 completedEventIds 里编年史尚未落账的同回合空档也算（orderedDoneEventIds 口径）
  const pending = runtimeOf({ doneIds: ['test.event.join'], eventIds: ['test.event.join', 'test.event.leave'] });
  pending.completedEventIds = ['test.event.leave'];
  assert.equal(party.partyRoster(pending, rulesTable).has(ALLY), false);
});

test('whenReceiptId 不满足时离队规则不生效（选留队）', async () => {
  const { party } = await loaded;
  const LEAVE = 'rcpt.test.ally.leave';
  const rulesTable = table({
    partyOpenings: [{ stageId: PROLOGUE, characterIds: [ALLY] }],
    partyLeaves: [{ eventId: 'test.event.parting', characterId: ALLY, whenReceiptId: LEAVE }],
  });
  assert.equal(party.partyRoster(runtimeOf({ doneIds: ['test.event.parting'] }), rulesTable).has(ALLY), true, '没有离队回执＝选了留队');
  assert.equal(party.partyRoster(runtimeOf({ doneIds: ['test.event.parting'], receipts: ['rcpt.test.ally.stay'] }), rulesTable).has(ALLY), true, '别的回执不算');
  assert.equal(party.partyRoster(runtimeOf({ doneIds: ['test.event.parting'], receipts: [LEAVE] }), rulesTable).has(ALLY), false, '走了离队路径');
  assert.equal(party.partyRoster(runtimeOf({ doneIds: [], receipts: [LEAVE] }), rulesTable).has(ALLY), true, '事件没完成时回执不单独生效');
});

test('departedCast 内的角色不在队', async () => {
  const { party } = await loaded;
  const rulesTable = table({ partyOpenings: [{ stageId: PROLOGUE, characterIds: [ALLY, OTHER] }], partyJoins: [{ eventId: 'test.event.join', characterId: NING_YU }] });
  const runtime = runtimeOf({ doneIds: ['test.event.join'], departedCast: [ALLY, { id: NING_YU }] });
  assert.deepEqual([...party.partyRoster(runtime, rulesTable)], [OTHER], '死亡或永久离场后入队规则也救不回');
});

test('七线全排列下最终在队情况只由最后一次相关事件决定', async () => {
  const { party } = await loaded;
  // 七条线各一个夹具事件：三条入队、三条离队、一条与此人无关（只动 OTHER）
  const lines = ['nanhuang', 'jin', 'song', 'han', 'tang', 'qin', 'taiquan'];
  const eventOf = line => `test.event.${line}`;
  const join = new Set(['nanhuang', 'song', 'tang']);
  const leave = new Set(['jin', 'han', 'qin']);
  const rulesTable = table({
    partyOpenings: [{ stageId: PROLOGUE, characterIds: [OTHER] }],
    partyJoins: [...join].map(line => ({ eventId: eventOf(line), characterId: ALLY })),
    partyLeaves: [...[...leave].map(line => ({ eventId: eventOf(line), characterId: ALLY })), { eventId: eventOf('taiquan'), characterId: OTHER }],
  });
  const permute = (rest, prefix = []) => rest.length ? rest.flatMap((x, i) => permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...prefix, x])) : [prefix];
  const orders = permute(lines);
  assert.equal(orders.length, 5040);
  for (const order of orders) {
    const roster = party.partyRoster(runtimeOf({ doneIds: order.map(eventOf) }), rulesTable);
    const last = [...order].reverse().find(line => join.has(line) || leave.has(line));
    assert.equal(roster.has(ALLY), join.has(last), order.join('>'));
    assert.equal(roster.has(OTHER), false, '太泉离队事件不论先后都生效');
  }
});

test('凝羽夹具：没走南荒一直在队；选离队后不在队；接回后在队', async () => {
  const { ledger } = await loaded;
  // 夹具 id 只在测试里（§3.2：不进仓库规则表）；接回事件的激活门槛（deadline.* eq due）属 T8
  const PARTING = 'test.event.nanhuang_parting';
  const RETURN = 'test.event.shancun_return';
  const LEAVE = 'rcpt.test.ningyu.leave';
  const rulesTable = table({
    partyOpenings: [{ stageId: PROLOGUE, characterIds: [NING_YU] }],
    partyLeaves: [{ eventId: PARTING, characterId: NING_YU, whenReceiptId: LEAVE }],
    partyJoins: [{ eventId: RETURN, characterId: NING_YU }],
  });
  await withRules(rulesTable, () => {
    const check = runtime => ledger.evaluateLedgerCondition(inParty(NING_YU), runtime);
    const others = ['test.event.jin_a', 'test.event.song_a'];
    assert.equal(check(runtimeOf({ doneIds: others })), true, '没走南荒：开局在队一直在队');
    assert.equal(check(runtimeOf({ doneIds: [...others, PARTING] })), true, '到离队点选留队');
    assert.equal(check(runtimeOf({ doneIds: [PARTING, ...others], receipts: [LEAVE] })), false, '选离队后不在队');
    assert.equal(check(runtimeOf({ doneIds: [PARTING, ...others, RETURN], receipts: [LEAVE] })), true, '接回后在队');
    assert.equal(check(runtimeOf({ stageId: LATER, doneIds: others })), false, '从别的关开局，凝羽不在开局名单');
  });
});

test('推导抛错时按不在队并记 SAV-026 一次', async () => {
  const { party, ledger, store } = await loaded;
  const rulesTable = table({ partyOpenings: [{ stageId: PROLOGUE, characterIds: [ALLY] }] });
  const broken = { ...runtimeOf(), chronicle: { not: 'an array' } };
  const logged = () => store.logStore.recent(200).filter(e => e.code === 'LCQ-SAV-026' && e.detail?.reason === 'derive_failed');
  const warn = console.warn; const error = console.error;
  console.warn = () => {}; console.error = () => {};
  try {
    const before = logged().length;
    assert.equal(party.partyRoster(broken, rulesTable).size, 0);
    await withRules(rulesTable, () => {
      assert.equal(party.isInParty(broken, ALLY), false);
      assert.equal(ledger.evaluateLedgerCondition(inParty(ALLY), broken), false, '偏保守：按不在队，倾向锁节点');
    });
    assert.equal(logged().length - before, 1, '读取频繁，同一 reason 只记一次');
    assert.equal(logged()[0].module, 'partyLedger');
  } finally {
    console.warn = warn; console.error = error;
  }
});
