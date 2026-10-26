// 进度期限 T8（身份账补充设计稿 2026-10-26 §4 / §4.9 / §7）：deadline.<id> 起点事件起算、刻度计数、解除事件；
// running/urgent 每次现算，到 due/cleared 才锁存进 flags 键 deadline.<id>.state。不加存档字段，到期后果不在机制里。
// 规则与期限数值均为测试夹具（显式入参 / setPlayerLedgerRulesForTest / 临时挂进 GAME_NUMBERS），仓库规则表与 limits 首版为空。
// T10（同稿 §9 / §10-T10，用户 2026-10-27 拍板冰蛊到期未解＝游戏结束）：期限定义填 onDue.endingId 时，锁存 due 的同一拍写 runtime.gameOver。
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

// 顺序加载，保证规则表夹具、数值表与 ledgerConditions 看到同一份模块
const loaded = (async () => {
  const rules = await loadTs('../src/modules/scenarioMods/playerLedgerRules.ts');
  const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
  const deadlines = await loadTs('../src/modules/scenarioMods/progressDeadlines.ts');
  const ledger = await loadTs('../src/modules/scenarioMods/ledgerConditions.ts');
  const identity = await loadTs('../src/modules/scenarioMods/identityLedger.ts');
  const store = await loadTs('../src/modules/diagnostics/store.ts');
  return { rules, numbers, deadlines, ledger, identity, store };
})();

const STAGE = 'lcq.stage_01';
const BINGU = 'liuchao.deadline.test_bingu';
const ICE_GU = 'lcq.ending.death.ajiman_bond';
const START = 'test.event.start';
const CLEAR = 'test.event.clear';
const ev = (name) => `test.event.${name}`;
const table = (patch = {}) => ({ version: 1, identityGrants: [], identityRevokes: [], lineOutcomes: [], itemGroups: [], partyJoins: [], partyLeaves: [], partyOpenings: [], progressTicks: [], progressDeadlines: [], ...patch });
const def = (patch = {}) => ({ id: BINGU, name: '测试冰蛊', startEventIds: [START], clearEventIds: [CLEAR], ...patch });
const ticksOf = (pairs) => pairs.map(([eventId, lineId]) => ({ eventId, lineId }));
const entry = (eventId, sequence) => ({ id: `chronicle.${STAGE}.${eventId}`, type: 'event', stageId: STAGE, title: '', sequence });
/** 编年史按给定顺序完成 doneIds；夹具事件挂进本关 events，orderedDoneEventIds 才认 */
const runtimeOf = ({ doneIds = [], eventIds = doneIds, receipts = [], flags = {} } = {}) => ({
  modId: STAGE,
  events: eventIds.map(id => ({ id })),
  chronicle: doneIds.map((id, i) => entry(id, i + 1)),
  completedEventIds: [],
  pathReceipts: Object.fromEntries(receipts.map(receiptId => [receiptId, { receiptId }])),
  flags,
});
const quiet = async (fn) => {
  const warn = console.warn; const error = console.error;
  console.warn = () => {}; console.error = () => {};
  try { return await fn(); } finally { console.warn = warn; console.error = error; }
};
const logged = (store, reason) => store.logStore.recent(500).filter(e => e.code === 'LCQ-SAV-027' && (!reason || e.detail?.reason === reason));

/** 规则表与期限数值一起挂上（ledgerConditions / runtime 读的是仓库权威），用完复原。 */
async function withDeadlines(rulesTable, limits, fn) {
  const { rules, numbers } = await loaded;
  const target = numbers.GAME_NUMBERS.story.progressDeadline.limits;
  rules.setPlayerLedgerRulesForTest(rulesTable);
  Object.assign(target, structuredClone(limits));
  try { return await fn(); } finally {
    rules.setPlayerLedgerRulesForTest(undefined);
    for (const id of Object.keys(limits)) delete target[id];
  }
}

test('仓库规则表期限两键首版为空，story.progressDeadline.limits 首版为 {}', async () => {
  const { rules, numbers, deadlines } = await loaded;
  const repo = rules.playerLedgerRules();
  assert.deepEqual([repo.progressTicks, repo.progressDeadlines], [[], []]);
  assert.deepEqual(numbers.GAME_NUMBERS.story.progressDeadline.limits, {});
  const runtime = runtimeOf({ doneIds: [START, CLEAR] });
  assert.equal(deadlines.syncProgressDeadlines(runtime), 0);
  assert.deepEqual(runtime.flags, {}, '规则表为空不动存档');
  assert.equal(deadlines.deadlineState(runtime, BINGU), undefined);
});

test('没有起点事件时为 undefined', async () => {
  const { deadlines } = await loaded;
  const ticks = ticksOf([[ev('a'), 'jin']]);
  assert.equal(deadlines.computeDeadlineState([], def(), { due: 1, urgentAt: 0 }, ticks), undefined);
  assert.equal(deadlines.computeDeadlineState([ev('a'), CLEAR], def(), { due: 1, urgentAt: 0 }, ticks), undefined, '解除与刻度都不起算');
});

test('刻度计数只算起点之后', async () => {
  const { deadlines } = await loaded;
  const ticks = ticksOf([[ev('a'), 'jin'], [ev('b'), 'song'], [ev('c'), 'han'], [START, 'tang']]);
  const limit = { due: 2, urgentAt: 1 };
  assert.deepEqual(deadlines.computeDeadline([ev('a'), ev('b'), START], def(), limit, ticks), { state: 'running', startedAt: START, ticks: 0 }, '起点前的刻度与起点自身都不计');
  assert.equal(deadlines.computeDeadlineState([ev('a'), START, ev('b')], def(), limit, ticks), 'urgent');
  assert.deepEqual(deadlines.computeDeadline([ev('a'), START, ev('b'), ev('c')], def(), limit, ticks), { state: 'due', startedAt: START, ticks: 2, settledAt: ev('c') });
});

test('excludeLineIds 的刻度不计', async () => {
  const { deadlines } = await loaded;
  const ticks = ticksOf([[ev('nh1'), 'nanhuang'], [ev('nh2'), 'nanhuang'], [ev('jin1'), 'jin']]);
  const ningyu = def({ excludeLineIds: ['nanhuang'] });
  assert.equal(deadlines.computeDeadlineState([START, ev('nh1'), ev('nh2')], ningyu, { due: 1, urgentAt: 0 }, ticks), 'urgent');
  assert.equal(deadlines.computeDeadlineState([START, ev('nh1'), ev('jin1')], ningyu, { due: 1, urgentAt: 0 }, ticks), 'due');
  assert.equal(deadlines.computeDeadlineState([START, ev('nh1'), ev('nh2')], def(), { due: 2, urgentAt: 1 }, ticks), 'due', '不排除时南荒刻度照计');
});

test('urgentAt 与 due 的边界', async () => {
  const { deadlines } = await loaded;
  const names = ['a', 'b', 'c', 'd'];
  const ticks = ticksOf(names.map(n => [ev(n), 'qin']));
  const at = (n, limit) => deadlines.computeDeadlineState([START, ...names.slice(0, n).map(ev)], def(), limit, ticks);
  const limit = { due: 3, urgentAt: 2 };
  assert.deepEqual([0, 1, 2, 3, 4].map(n => at(n, limit)), ['running', 'running', 'urgent', 'due', 'due']);
  assert.deepEqual([0, 1].map(n => at(n, { due: 1, urgentAt: 0 })), ['urgent', 'due'], 'urgentAt=0：起算即 urgent');
});

test('到期前解除为 cleared，到期后再解除仍为 due', async () => {
  const { deadlines } = await loaded;
  const ticks = ticksOf([[ev('a'), 'jin'], [ev('b'), 'song']]);
  const limit = { due: 2, urgentAt: 1 };
  assert.deepEqual(deadlines.computeDeadline([START, ev('a'), CLEAR, ev('b')], def(), limit, ticks), { state: 'cleared', startedAt: START, ticks: 1, settledAt: CLEAR });
  assert.equal(deadlines.computeDeadlineState([START, ev('a'), ev('b'), CLEAR], def(), limit, ticks), 'due');
  assert.equal(deadlines.computeDeadlineState([CLEAR, START, ev('a')], def(), limit, ticks), 'urgent', '起算前完成的解除不算');
});

test('同一事件既是刻度又是解除时判 cleared', async () => {
  const { deadlines } = await loaded;
  const ticks = ticksOf([[ev('a'), 'jin'], [CLEAR, 'song']]);
  assert.equal(deadlines.computeDeadlineState([START, ev('a'), CLEAR], def(), { due: 2, urgentAt: 1 }, ticks), 'cleared');
});

test('多个起点取最早', async () => {
  const { deadlines } = await loaded;
  const ticks = ticksOf([[ev('a'), 'jin'], [ev('b'), 'song']]);
  const twoStarts = def({ startEventIds: [START, ev('start2')] });
  const limit = { due: 2, urgentAt: 1 };
  assert.deepEqual(deadlines.computeDeadline([ev('start2'), ev('a'), START, ev('b')], twoStarts, limit, ticks), { state: 'due', startedAt: ev('start2'), ticks: 2, settledAt: ev('b') });
  assert.equal(deadlines.computeDeadlineState([START, ev('a'), ev('start2')], twoStarts, limit, ticks), 'urgent', '后到的起点不重新起算');
});

test('终态锁存进 flags 且只写一次；running/urgent 不落存档', async () => {
  const { deadlines, ledger } = await loaded;
  const rulesTable = table({ progressTicks: ticksOf([[ev('a'), 'jin'], [ev('b'), 'song']]), progressDeadlines: [def()] });
  const limits = { [BINGU]: { due: 2, urgentAt: 1 } };
  await withDeadlines(rulesTable, limits, () => {
    const runtime = runtimeOf({ doneIds: [START, ev('a')], eventIds: [START, ev('a'), ev('b'), CLEAR] });
    assert.equal(deadlines.syncProgressDeadlines(runtime), 0);
    assert.deepEqual(runtime.flags, {}, 'urgent 现算，不加存档');
    assert.equal(ledger.resolveLedgerPath(`deadline.${BINGU}`, runtime).value, 'urgent');
    runtime.chronicle.push(entry(ev('b'), 3));
    assert.equal(deadlines.syncProgressDeadlines(runtime), 1);
    assert.equal(runtime.flags[`deadline.${BINGU}.state`], 'due');
    assert.equal(deadlines.syncProgressDeadlines(runtime), 0, '幂等');
    runtime.chronicle.push(entry(CLEAR, 4));
    assert.equal(deadlines.syncProgressDeadlines(runtime), 0);
    assert.equal(runtime.flags[`deadline.${BINGU}.state`], 'due', '到期后再解除不改锁存');
    assert.equal(ledger.evaluateLedgerCondition({ path: `deadline.${BINGU}`, operator: 'eq', value: 'due' }, runtime), true);
    assert.equal(ledger.evaluateLedgerCondition({ path: `deadline.${BINGU}`, operator: 'exists' }, runtime), true);
    assert.equal(ledger.evaluateLedgerCondition({ path: `deadline.${BINGU}`, operator: 'exists' }, runtimeOf()), false, 'exists＝已起算');
    assert.deepEqual(ledger.resolveLedgerPath(`deadline.${BINGU}.state`, runtime), { handled: true, value: undefined }, '锁存键不作条件路径');
  });
});

test('热改 due 后已锁存的不倒退并记 SAV-027 latch_conflict', async () => {
  const { deadlines, numbers, store } = await loaded;
  const ID = 'liuchao.deadline.test_hot';
  const rulesTable = table({ progressTicks: ticksOf([[ev('a'), 'jin'], [ev('b'), 'song']]), progressDeadlines: [def({ id: ID })] });
  await withDeadlines(rulesTable, { [ID]: { due: 2, urgentAt: 1 } }, () => quiet(() => {
    const runtime = runtimeOf({ doneIds: [START, ev('a'), ev('b')] });
    assert.equal(deadlines.syncProgressDeadlines(runtime), 1);
    const before = logged(store, 'latch_conflict').length;
    // 走真热改通道（tuning.json → applyGameNumbers）
    numbers.applyGameNumbers({ story: { progressDeadline: { limits: { [ID]: { due: 5 } } } } });
    assert.equal(numbers.GAME_NUMBERS.story.progressDeadline.limits[ID].due, 5);
    assert.equal(deadlines.deadlineState(runtime), undefined, '缺 id 读不到');
    assert.equal(deadlines.deadlineState(runtime, ID), 'due', '现算已是 urgent，以锁存为准');
    assert.equal(deadlines.syncProgressDeadlines(runtime), 0);
    assert.equal(runtime.flags[`deadline.${ID}.state`], 'due');
    const conflicts = logged(store, 'latch_conflict').slice(0, logged(store, 'latch_conflict').length - before);
    assert.equal(conflicts.length, 1, '同一期限只记一次');
    assert.equal(conflicts[0].module, 'progressDeadlines');
    assert.deepEqual([conflicts[0].detail.latch, conflicts[0].detail.computed], ['due', 'urgent']);
    // 热改不能让 urgentAt ≥ due
    assert.throws(() => numbers.applyGameNumbers({ story: { progressDeadline: { limits: { [ID]: { urgentAt: 5 } } } } }), err => err.code === 'LCQ-NUM-008');
  }));
});

test('锁存值非法时现算并记 SAV-027 invalid_latch', async () => {
  const { deadlines, store } = await loaded;
  const ID = 'liuchao.deadline.test_invalid';
  const rulesTable = table({ progressTicks: ticksOf([[ev('a'), 'jin']]), progressDeadlines: [def({ id: ID })] });
  await withDeadlines(rulesTable, { [ID]: { due: 1, urgentAt: 0 } }, () => quiet(() => {
    const before = logged(store, 'invalid_latch').length;
    const runtime = runtimeOf({ doneIds: [START], eventIds: [START, ev('a')], flags: { [`deadline.${ID}.state`]: 'running' } });
    assert.equal(deadlines.deadlineState(runtime, ID), 'urgent', '改为现算');
    assert.equal(deadlines.syncProgressDeadlines(runtime), 0);
    assert.equal(runtime.flags[`deadline.${ID}.state`], 'running', '没到终态不覆写');
    runtime.chronicle.push(entry(ev('a'), 2));
    assert.equal(deadlines.syncProgressDeadlines(runtime), 1, '到终态覆写为合法锁存');
    assert.equal(runtime.flags[`deadline.${ID}.state`], 'due');
    assert.equal(logged(store, 'invalid_latch').length - before, 1);
  }));
});

test('七线全排列下冰蛊夹具：解除事件在第 due 个刻度之前完成的判 cleared，否则判 due', async () => {
  const { deadlines } = await loaded;
  // 七条线各一个夹具事件：南荒＝起点，晋＝解除，宋/汉/唐/秦＝刻度，太泉＝刻度但被排除
  const lines = ['nanhuang', 'jin', 'song', 'han', 'tang', 'qin', 'taiquan'];
  const eventOf = line => `test.event.${line}`;
  const tickLines = ['song', 'han', 'tang', 'qin', 'taiquan'];
  const rulesTable = table({
    progressTicks: ticksOf(tickLines.map(line => [eventOf(line), line])),
    progressDeadlines: [def({ startEventIds: [eventOf('nanhuang')], clearEventIds: [eventOf('jin')], excludeLineIds: ['taiquan'], onDue: { endingId: ICE_GU } })],
  });
  const limits = { [BINGU]: { due: 2, urgentAt: 1 } };
  const permute = (rest, prefix = []) => rest.length ? rest.flatMap((x, i) => permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...prefix, x])) : [prefix];
  const orders = permute(lines);
  assert.equal(orders.length, 5040);
  const seen = new Set();
  for (const order of orders) {
    const start = order.indexOf('nanhuang');
    const after = order.slice(start + 1);
    const clearAt = after.indexOf('jin');
    const counted = after.map((line, i) => [line, i]).filter(([line]) => ['song', 'han', 'tang', 'qin'].includes(line));
    const dueAt = counted.length >= 2 ? counted[1][1] : -1;
    const expected = clearAt >= 0 && (dueAt < 0 || clearAt < dueAt) ? 'cleared' : dueAt >= 0 ? 'due' : counted.length >= 1 ? 'urgent' : 'running';
    const runtime = runtimeOf({ doneIds: order.map(eventOf) });
    assert.equal(deadlines.deadlineState(runtime, BINGU, { rules: rulesTable, limits }), expected, order.join('>'));
    // 逐拍推进：一旦到终态，锁存后不再变，且等于最终现算
    const stepped = runtimeOf({ doneIds: [], eventIds: order.map(eventOf) });
    let latchedAt;
    for (const [i, line] of order.entries()) {
      stepped.chronicle.push(entry(eventOf(line), i + 1));
      deadlines.syncProgressDeadlines(stepped, { rules: rulesTable, limits });
      const latch = stepped.flags[`deadline.${BINGU}.state`];
      if (latch !== undefined && latchedAt === undefined) latchedAt = latch;
      if (latchedAt !== undefined) assert.equal(latch, latchedAt, `${order.join('>')} 锁存后不再改`);
    }
    assert.equal(latchedAt, expected === 'cleared' || expected === 'due' ? expected : undefined, order.join('>'));
    assert.equal(stepped.gameOver?.endingId, expected === 'due' ? ICE_GU : undefined, `${order.join('>')} 只有到期才结束本局`);
    seen.add(expected);
  }
  assert.deepEqual([...seen].sort(), ['cleared', 'due', 'running', 'urgent'], '夹具覆盖四种状态（南荒起点排在最后时停在 running）');
});

test('凝羽夹具：离队后过 N 个非南荒刻度为 due，接回事件可激活', async () => {
  const { ledger } = await loaded;
  // 夹具 id 只在测试里：离队点选离队起算，过 2 个非南荒刻度到期；接回事件激活门槛写 deadline.<id> eq due
  const NING_YU = 'liuchao.character.ning_yu';
  const RETURN_DEADLINE = 'liuchao.deadline.test_ningyu_return';
  const PARTING = 'test.event.nanhuang_parting';
  const RETURN = 'test.event.shancun_return';
  const LEAVE = 'rcpt.test.ningyu.leave';
  const [nh, jin, song] = ['nanhuang_b', 'jin_a', 'song_a'].map(ev);
  const rulesTable = table({
    partyOpenings: [{ stageId: STAGE, characterIds: [NING_YU] }],
    partyLeaves: [{ eventId: PARTING, characterId: NING_YU, whenReceiptId: LEAVE }],
    partyJoins: [{ eventId: RETURN, characterId: NING_YU }],
    progressTicks: ticksOf([[nh, 'nanhuang'], [jin, 'jin'], [song, 'song']]),
    progressDeadlines: [{ id: RETURN_DEADLINE, name: '凝羽归队', startEventIds: [PARTING], clearEventIds: [], excludeLineIds: ['nanhuang'] }],
  });
  await withDeadlines(rulesTable, { [RETURN_DEADLINE]: { due: 2, urgentAt: 1 } }, () => {
    const canReturn = runtime => ledger.evaluateLedgerCondition({ path: `deadline.${RETURN_DEADLINE}`, operator: 'eq', value: 'due' }, runtime);
    const inParty = runtime => ledger.evaluateLedgerCondition({ path: `party.${NING_YU}`, operator: 'eq', value: true }, runtime);
    const all = [PARTING, RETURN, nh, jin, song];
    const at = (doneIds) => runtimeOf({ doneIds, eventIds: all, receipts: [LEAVE] });
    assert.equal(canReturn(at([jin, song])), false, '没到离队点不起算');
    assert.equal(inParty(at([PARTING, nh, jin])), false, '离队后不在队');
    assert.equal(canReturn(at([PARTING, nh, jin])), false, '南荒刻度不计，只过 1 段');
    assert.equal(canReturn(at([PARTING, jin, nh, song])), true, '过 2 个非南荒刻度，接回可激活');
    assert.equal(canReturn(at([jin, song, PARTING, nh])), false, '离队前的刻度不计');
    assert.equal(inParty(at([PARTING, jin, song, RETURN])), true, '接回后在队');
  });
});

test('同步抛错不阻断，SAV-023 不被占用', async () => {
  const { deadlines, identity, store } = await loaded;
  const ZHUSHI = 'liuchao.identity.song.baochao_zhushi';
  // 期限规则表坏（progressDeadlines 不是数组），身份规则照常
  const broken = table({ identityGrants: [{ eventId: START, identityId: ZHUSHI }], progressDeadlines: { length: 1 } });
  await quiet(async () => {
    const before023 = store.logStore.recent(500).filter(e => e.code === 'LCQ-SAV-023').length;
    const before027 = logged(store, 'sync_failed').length;
    const runtime = runtimeOf({ doneIds: [START] });
    assert.equal(identity.syncPlayerLedgers(runtime, { rules: broken }), 1, '身份照常入账');
    assert.equal(runtime.playerIdentities[ZHUSHI].status, 'active');
    assert.equal(store.logStore.recent(500).filter(e => e.code === 'LCQ-SAV-023').length, before023, 'SAV-023 含义不变、不被占用');
    const failed = logged(store, 'sync_failed');
    assert.equal(failed.length - before027, 1);
    assert.equal(failed[0].module, 'progressDeadlines');
    // flags 坏、limits 缺键同样只记码不抛
    assert.equal(deadlines.syncProgressDeadlines({ ...runtimeOf({ doneIds: [START] }), flags: [] }, { rules: table({ progressDeadlines: [def()] }), limits: { [BINGU]: { due: 1, urgentAt: 0 } } }), 0);
    assert.equal(deadlines.syncProgressDeadlines(runtimeOf({ doneIds: [START] }), { rules: table({ progressDeadlines: [def()] }), limits: {} }), 0);
    assert.equal(logged(store, 'sync_failed').length - before027, 3);
    // 读取出错：有锁存回锁存
    const latched = runtimeOf({ doneIds: [START], flags: { [`deadline.${BINGU}.state`]: 'cleared' } });
    assert.equal(deadlines.deadlineState(latched, BINGU, { rules: table({ progressDeadlines: [def()] }), limits: {} }), 'cleared');
    assert.equal(deadlines.deadlineState(runtimeOf({ doneIds: [START] }), BINGU, { rules: table({ progressDeadlines: [def()] }), limits: {} }), undefined);
  });
});

test('T10 到期且填 onDue：锁存 due 同一拍写 gameOver（冰蛊坏结局），只写一次；解除与未填 onDue 不结束', async () => {
  const { deadlines } = await loaded;
  const ticks = ticksOf([[ev('a'), 'jin'], [ev('b'), 'song']]);
  const limits = { [BINGU]: { due: 2, urgentAt: 1 } };
  const opts = (onDue) => ({ rules: table({ progressTicks: ticks, progressDeadlines: [def({ onDue })] }), limits });
  const runtime = { ...runtimeOf({ doneIds: [START, ev('a')], eventIds: [START, ev('a'), ev('b'), CLEAR] }), worldTurn: 17 };
  assert.equal(deadlines.syncProgressDeadlines(runtime, opts({ endingId: ICE_GU })), 0);
  assert.equal(runtime.gameOver, undefined, 'urgent 不结束');
  runtime.chronicle.push(entry(ev('b'), 3));
  assert.equal(deadlines.syncProgressDeadlines(runtime, opts({ endingId: ICE_GU })), 1);
  assert.equal(runtime.flags[`deadline.${BINGU}.state`], 'due');
  assert.deepEqual(runtime.gameOver, {
    endingId: ICE_GU, title: '冰蛊', facts: runtime.gameOver.facts, sourceEventId: ev('b'), atTurn: 17, presentation: { image: 'E02.jpg' },
  });
  assert.ok(runtime.gameOver.facts.some(f => f.includes('冰蛊')), '事实取自 endings.json');
  const first = structuredClone(runtime.gameOver);
  runtime.worldTurn = 18;
  assert.equal(deadlines.syncProgressDeadlines(runtime, opts({ endingId: ICE_GU })), 0);
  assert.deepEqual(runtime.gameOver, first, '已锁存不再写');

  const cleared = runtimeOf({ doneIds: [START, ev('a'), CLEAR, ev('b')] });
  assert.equal(deadlines.syncProgressDeadlines(cleared, opts({ endingId: ICE_GU })), 1);
  assert.equal(cleared.flags[`deadline.${BINGU}.state`], 'cleared');
  assert.equal(cleared.gameOver, undefined, '解除不结束');
  const plain = runtimeOf({ doneIds: [START, ev('a'), ev('b')] });
  assert.equal(deadlines.syncProgressDeadlines(plain, opts(undefined)), 1);
  assert.equal(plain.flags[`deadline.${BINGU}.state`], 'due');
  assert.equal(plain.gameOver, undefined, '未填 onDue 到期后果仍由内容自接');
});

test('T10 本局已由别的结局结束：照常锁存 due，不覆盖 gameOver', async () => {
  const { deadlines } = await loaded;
  const other = { endingId: 'lcq.ending.death.paolao', title: '炮烙', facts: [], sourceEventId: 'test.event.other', atTurn: 3 };
  const runtime = { ...runtimeOf({ doneIds: [START, ev('a')] }), gameOver: structuredClone(other) };
  const opts = { rules: table({ progressTicks: ticksOf([[ev('a'), 'jin']]), progressDeadlines: [def({ onDue: { endingId: ICE_GU } })] }), limits: { [BINGU]: { due: 1, urgentAt: 0 } } };
  assert.equal(deadlines.syncProgressDeadlines(runtime, opts), 1);
  assert.equal(runtime.flags[`deadline.${BINGU}.state`], 'due');
  assert.deepEqual(runtime.gameOver, other);
});

test('T10 onDue 结局不在 endings.json：不锁存、不结束、读取仍为 due，记 SAV-027 ending_missing 只一次', async () => {
  const { deadlines, store } = await loaded;
  const opts = { rules: table({ progressTicks: ticksOf([[ev('a'), 'jin']]), progressDeadlines: [def({ onDue: { endingId: 'lcq.ending.no_such' } })] }), limits: { [BINGU]: { due: 1, urgentAt: 0 } } };
  await quiet(async () => {
    const before = logged(store, 'ending_missing').length;
    const runtime = runtimeOf({ doneIds: [START, ev('a')] });
    assert.equal(deadlines.syncProgressDeadlines(runtime, opts), 0);
    assert.equal(deadlines.syncProgressDeadlines(runtime, opts), 0);
    assert.deepEqual(runtime.flags, {});
    assert.equal(runtime.gameOver, undefined);
    assert.equal(deadlines.deadlineState(runtime, BINGU, opts), 'due');
    const missing = logged(store, 'ending_missing');
    assert.equal(missing.length - before, 1);
    assert.equal(missing.at(-1).detail.endingId, 'lcq.ending.no_such');
    assert.equal(missing.at(-1).module, 'progressDeadlines');
  });
});

test('T10 结局展示流程接得住：期限写的 gameOver 有固定结局正文与配图', async () => {
  const { deadlines } = await loaded;
  const { fixedEndingNarrative } = await loadTs('../src/modules/scenarioMods/fixedEndingNarratives.ts');
  const { endingPresentation, endingKey } = await loadTs('../src/modules/scenarioMods/endingPresentation.ts');
  const runtime = runtimeOf({ doneIds: [START, ev('a')] });
  deadlines.syncProgressDeadlines(runtime, { rules: table({ progressTicks: ticksOf([[ev('a'), 'jin']]), progressDeadlines: [def({ onDue: { endingId: ICE_GU } })] }), limits: { [BINGU]: { due: 1, urgentAt: 0 } } });
  assert.ok(fixedEndingNarrative(runtime.gameOver)?.length > 0, 'MainGamePanel / AIBS 按 endingId 取固定正文');
  assert.equal(endingKey(runtime.gameOver), 'E02');
  assert.equal(endingPresentation(runtime.gameOver).image, 'E02.jpg');
});
