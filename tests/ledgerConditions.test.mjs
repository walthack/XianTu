// 身份账 T2（身份账设计稿 2026-10-25 §4）：账本条件读取。done.* 以编年史为准，补本关 completedEventIds。
// item.*（补充设计稿 2026-10-26 §2.4，T6）：只看回执，itemId 原样读；道具组展开见 itemProvenance.test.mjs。
// party.*（同稿 §3.4，T7）：显式在队账，推导细节见 partyLedger.test.mjs。
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const modPromise = loadTs('../src/modules/scenarioMods/ledgerConditions.ts');

// 编年史条目只认已知事件 id（实体索引 kind=event），夹具取真实 id
const E1 = 'lcq.event.s02_01';
const E2 = 'lcq.event.s02_03';
const E3 = 'lcq.event.s02_02';
const GAMBLE = 'lcq.event.gamble_bond_signed';
const ZHUSHI = 'liuchao.identity.song.baochao_zhushi';
const entry = (stageId, eventId, sequence, type = 'event') => ({ id: `chronicle.${stageId}.${eventId}`, type, stageId, title: '', sequence });
const done = (eventId) => ({ path: `done.${eventId}`, operator: 'eq', value: true });

test('done 读编年史并补本关 completedEventIds', async () => {
  const { evaluateLedgerCondition, completedEventSet, orderedCompletedEvents } = await modPromise;
  const runtime = {
    modId: 'lcq.stage_02', flags: {},
    chronicle: [entry('lcq.stage_02', E2, 2), entry('lcq.stage_01', E1, 1)],
    completedEventIds: [E2, E3],
  };
  assert.deepEqual(orderedCompletedEvents(runtime), [E1, E2, E3]);
  assert.deepEqual([...completedEventSet(runtime)], [E1, E2, E3]);
  for (const id of [E1, E2, E3]) assert.equal(evaluateLedgerCondition(done(id), runtime), true);
  assert.equal(evaluateLedgerCondition(done(GAMBLE), runtime), false);
  assert.equal(evaluateLedgerCondition({ path: `done.${GAMBLE}`, operator: 'neq', value: true }, runtime), true);
  // 与规则处理共用同一实现
  const { orderedDoneEventIds } = await loadTs('../src/modules/scenarioMods/playerLedgerRules.ts');
  assert.equal(orderedCompletedEvents, orderedDoneEventIds);
});

test('切关后只凭 chronicle 仍判 done', async () => {
  const { evaluateLedgerCondition } = await modPromise;
  // 新关 completedEventIds 已重置，旧关事件只剩编年史；stageId 缺省时 id 前缀为 unknown
  const runtime = {
    modId: 'lcq.stage_03', flags: {}, completedEventIds: [],
    chronicle: [entry('lcq.stage_02', E2, 1), { id: `chronicle.unknown.${E3}`, type: 'event', stageId: '', title: '', sequence: 2 }],
  };
  assert.equal(evaluateLedgerCondition(done(E2), runtime), true);
  assert.equal(evaluateLedgerCondition(done(E3), runtime), true);
  assert.equal(evaluateLedgerCondition(done(E1), runtime), false);
});

test('场外结算事件不算 done', async () => {
  const { evaluateLedgerCondition, completedEventSet } = await modPromise;
  const runtime = {
    flags: {},
    // 场外结算在编年史里是 type='world'（含 .revealed 来报），本关 completedEventIds 里也有
    chronicle: [entry('lcq.stage_02', E1, 1, 'world'), { id: `chronicle.lcq.stage_02.${E2}.revealed`, type: 'world', stageId: 'lcq.stage_02', title: '来报', sequence: 2 }],
    completedEventIds: [E1, E2, E3],
    offscreenResolvedEventIds: [E1],
    eventTimeline: { [E2]: { outcome: 'offscreen', playerLearnedAtTurn: 3 } },
  };
  assert.equal(evaluateLedgerCondition(done(E1), runtime), false);
  assert.equal(evaluateLedgerCondition(done(E2), runtime), false);
  assert.equal(evaluateLedgerCondition(done(E3), runtime), true);
  assert.deepEqual([...completedEventSet(runtime)], [E3]);
  // 玩家尚未获知的时间线事件同样不补（编年史也不会收）
  const unknown = { flags: {}, completedEventIds: [E3], events: [{ id: E3, timeline: { kind: 'window' } }], eventTimeline: { [E3]: { outcome: 'participated' } } };
  assert.equal(evaluateLedgerCondition(done(E3), unknown), false);
});

test('refused_capture 等非完成条目不算 done', async () => {
  const { evaluateLedgerCondition, completedEventSet } = await modPromise;
  // baihuGambleRefusal 写的附加条目：id＝chronicle.<stageId>.<eventId>.refused_capture，type 仍是 event
  const runtime = {
    modId: 'lcq.stage_03', flags: {}, completedEventIds: [],
    chronicle: [{ id: `chronicle.lcq.stage_02.${GAMBLE}.refused_capture`, type: 'event', stageId: 'lcq.stage_02', title: '拒赌', sequence: 1 }],
  };
  assert.equal(evaluateLedgerCondition(done(GAMBLE), runtime), false);
  assert.equal(evaluateLedgerCondition(done(`${GAMBLE}.refused_capture`), runtime), false);
  assert.equal(completedEventSet(runtime).size, 0);
});

test('travelLedger 不再参与 done', async () => {
  const { evaluateLedgerCondition, completedEventSet } = await modPromise;
  const runtime = { flags: {}, completedEventIds: [], chronicle: [], travelLedger: { doneEventIds: [E1] } };
  assert.equal(evaluateLedgerCondition(done(E1), runtime), false);
  assert.equal(completedEventSet(runtime).size, 0);
});

test('identity 的 .from 与 .status 读取', async () => {
  const { evaluateLedgerCondition, resolveLedgerPath } = await modPromise;
  const runtime = { flags: {}, playerIdentities: {
    [ZHUSHI]: { identityId: ZHUSHI, status: 'revoked', acquiredAtEventId: E1, history: [] },
  } };
  assert.deepEqual(resolveLedgerPath(`identity.${ZHUSHI}.from`, runtime), { handled: true, value: E1 });
  assert.equal(evaluateLedgerCondition({ path: `identity.${ZHUSHI}.from`, operator: 'eq', value: E1 }, runtime), true);
  assert.equal(evaluateLedgerCondition({ path: `identity.${ZHUSHI}.status`, operator: 'eq', value: 'revoked' }, runtime), true);
  // 撤销后：不再持有，但 exists＝曾持有
  assert.equal(evaluateLedgerCondition({ path: `identity.${ZHUSHI}`, operator: 'eq', value: true }, runtime), false);
  assert.equal(evaluateLedgerCondition({ path: `identity.${ZHUSHI}`, operator: 'exists' }, runtime), true);
  runtime.playerIdentities[ZHUSHI].status = 'active';
  assert.equal(evaluateLedgerCondition({ path: `identity.${ZHUSHI}`, operator: 'eq', value: true }, runtime), true);
  // 无记录、无账本都当空
  assert.equal(evaluateLedgerCondition({ path: 'identity.liuchao.identity.jin.none', operator: 'exists' }, runtime), false);
  assert.equal(evaluateLedgerCondition({ path: `identity.${ZHUSHI}.status`, operator: 'exists' }, { flags: {} }), false);
});

test('acq gte encountered 按等级比较', async () => {
  const { evaluateLedgerCondition } = await modPromise;
  const runtime = {
    flags: {},
    acquaintances: { 'liuchao.character.a': { characterId: 'liuchao.character.a', name: '甲', kind: 'joined' } },
    actorEngine: { acquaintance: {
      'liuchao.character.a': { characterId: 'liuchao.character.a', name: '甲', kind: 'rumored' },
      'liuchao.character.b': { characterId: 'liuchao.character.b', name: '乙', kind: 'introduced' },
    } },
  };
  const acq = (id, operator, value) => evaluateLedgerCondition({ path: `acq.liuchao.character.${id}`, operator, value }, runtime);
  assert.equal(acq('a', 'gte', 'encountered'), true); // 新账优先
  assert.equal(acq('b', 'gte', 'encountered'), false); // 旧账兜底
  assert.equal(acq('b', 'gte', 'introduced'), true);
  assert.equal(acq('b', 'lt', 'encountered'), true);
  assert.equal(acq('c', 'lt', 'rumored'), true); // 未相识＝0 级
  assert.equal(acq('c', 'exists'), false);
  assert.equal(acq('b', 'eq', 'introduced'), true);
  assert.equal(acq('a', 'gte', 'met'), false); // 非法 kind 不命中
});

test('knows.player 只认 confirmed', async () => {
  const { evaluateLedgerCondition } = await modPromise;
  const runtime = { flags: {}, playerKnowledge: {
    'fact.a.rumor': { factId: 'fact.a.rumor', propositionId: 'prop.a', status: 'rumor' },
    'fact.b': { factId: 'fact.b', status: 'confirmed' },
    'fact.c.confirmed': { factId: 'fact.c.confirmed', propositionId: 'prop.c', status: 'confirmed' },
  } };
  const knows = id => evaluateLedgerCondition({ path: `knows.player.${id}`, operator: 'eq', value: true }, runtime);
  assert.equal(knows('prop.a'), false);
  assert.equal(knows('fact.a.rumor'), false);
  assert.equal(knows('fact.b'), true);
  assert.equal(knows('prop.c'), true);
  assert.equal(evaluateLedgerCondition({ path: 'knows.npc.prop.c', operator: 'eq', value: true }, runtime), false);
});

test('line outcome 读扁平与嵌套 flags', async () => {
  const { evaluateLedgerCondition } = await modPromise;
  const flat = { flags: { 'line.song.outcome': 'resolved', line: { song: { outcome: 'unresolved' } } } };
  const nested = { flags: { line: { jin: { outcome: 'unresolved' } } } };
  assert.equal(evaluateLedgerCondition({ path: 'line.song.outcome', operator: 'eq', value: 'resolved' }, flat), true);
  assert.equal(evaluateLedgerCondition({ path: 'line.jin.outcome', operator: 'eq', value: 'unresolved' }, nested), true);
  assert.equal(evaluateLedgerCondition({ path: 'line.jin.outcome', operator: 'exists' }, nested), true);
  assert.equal(evaluateLedgerCondition({ path: 'line.han.outcome', operator: 'exists' }, nested), false);
  assert.equal(evaluateLedgerCondition({ path: 'line.jin', operator: 'exists' }, nested), false);
});

test('未知前缀返回 undefined', async () => {
  const { evaluateLedgerCondition, resolveLedgerPath } = await modPromise;
  const runtime = { flags: { a: true } };
  assert.equal(evaluateLedgerCondition({ path: 'flags.a', operator: 'eq', value: true }, runtime), undefined);
  assert.equal(evaluateLedgerCondition({ path: 'pathReceipts.x', operator: 'exists' }, runtime), undefined);
  assert.deepEqual(resolveLedgerPath('flags.a', runtime), { handled: false });
  // 不传 runtime 时账本路径不命中
  assert.equal(evaluateLedgerCondition({ path: `done.${E1}`, operator: 'neq', value: true }), false);
});

test('item 读取只看回执：是否得过与最早来路', async () => {
  const { evaluateLedgerCondition, resolveLedgerPath, parseLedgerPath, ledgerOperatorsOf } = await modPromise;
  const ITEM = 'lcq.item.jin_nang';
  const receipt = (transferId, sourceEventId) => ({ transferId, itemId: ITEM, itemName: '锦囊', quantity: 1, sourceEventId, actionId: 'take', outcome: 'success', settledAtTurn: 1 });
  const runtime = { flags: {}, inventoryTransferReceipts: [receipt('a', E1), receipt('b', E2)] };
  assert.deepEqual(parseLedgerPath(`item.${ITEM}`), { kind: 'item', id: ITEM, field: 'active' });
  assert.deepEqual(parseLedgerPath(`item.${ITEM}.from`), { kind: 'item', id: ITEM, field: 'from' });
  assert.deepEqual(ledgerOperatorsOf(parseLedgerPath(`item.${ITEM}`)), ['eq', 'neq']);
  assert.deepEqual(ledgerOperatorsOf(parseLedgerPath(`item.${ITEM}.from`)), ['eq', 'neq', 'exists']);
  assert.equal(evaluateLedgerCondition({ path: `item.${ITEM}`, operator: 'eq', value: true }, runtime), true);
  assert.equal(evaluateLedgerCondition({ path: `item.${ITEM}.from`, operator: 'eq', value: E1 }, runtime), true, '取最早一条');
  assert.equal(evaluateLedgerCondition({ path: `item.${ITEM}.from`, operator: 'neq', value: E2 }, runtime), true);
  // 没回执：false 而不是 undefined；背包现存不算（读取不看背包）
  const none = { flags: {}, inventoryTransferReceipts: [] };
  assert.deepEqual(resolveLedgerPath(`item.${ITEM}`, none), { handled: true, value: false });
  assert.equal(evaluateLedgerCondition({ path: `item.${ITEM}`, operator: 'neq', value: true }, { flags: {} }), true);
  assert.equal(evaluateLedgerCondition({ path: `item.${ITEM}.from`, operator: 'exists' }, none), false);
  // item.<id> 恒为 boolean，exists 不支持；不传 runtime 不命中
  assert.equal(evaluateLedgerCondition({ path: `item.${ITEM}`, operator: 'exists' }, runtime), false);
  assert.equal(evaluateLedgerCondition({ path: `item.${ITEM}`, operator: 'eq', value: true }), false);
  assert.deepEqual(resolveLedgerPath('item.', runtime), { handled: true, value: undefined });
});

test('party 读取 eq/neq：显式在队账，不在队为 false', async () => {
  const { evaluateLedgerCondition, resolveLedgerPath, parseLedgerPath, ledgerOperatorsOf } = await modPromise;
  const { setPlayerLedgerRulesForTest } = await loadTs('../src/modules/scenarioMods/playerLedgerRules.ts');
  const NING_YU = 'liuchao.character.ning_yu';
  const eq = { path: `party.${NING_YU}`, operator: 'eq', value: true };
  const neq = { path: `party.${NING_YU}`, operator: 'neq', value: true };
  assert.deepEqual(parseLedgerPath(`party.${NING_YU}`), { kind: 'party', id: NING_YU });
  assert.deepEqual(ledgerOperatorsOf(parseLedgerPath(`party.${NING_YU}`)), ['eq', 'neq']);
  const runtime = { modId: 'lcq.stage_02', flags: {}, chronicle: [entry('lcq.stage_01', E1, 1), entry('lcq.stage_02', E2, 2)], completedEventIds: [] };
  // 仓库规则表首版为空：恒不在队
  assert.deepEqual(resolveLedgerPath(`party.${NING_YU}`, runtime), { handled: true, value: false });
  assert.equal(evaluateLedgerCondition(eq, runtime), false);
  assert.equal(evaluateLedgerCondition(neq, runtime), true);
  setPlayerLedgerRulesForTest({
    version: 1, identityGrants: [], identityRevokes: [], lineOutcomes: [],
    partyOpenings: [{ stageId: 'lcq.stage_01', characterIds: [NING_YU] }],
    partyLeaves: [{ eventId: E3, characterId: NING_YU }],
  });
  try {
    assert.equal(evaluateLedgerCondition(eq, runtime), true, '开局关取编年史首条 stageId');
    assert.equal(evaluateLedgerCondition(neq, runtime), false);
    assert.equal(evaluateLedgerCondition(eq, { ...runtime, completedEventIds: [E3] }), false, '离队事件完成后不在队');
    assert.equal(evaluateLedgerCondition(eq, { ...runtime, departedCast: [NING_YU] }), false, 'departedCast 不在队');
    // 只有 eq / neq；不传 runtime 不命中
    assert.equal(evaluateLedgerCondition({ path: `party.${NING_YU}`, operator: 'exists' }, runtime), false);
    assert.equal(evaluateLedgerCondition(eq), false);
  } finally {
    setPlayerLedgerRulesForTest(undefined);
  }
});

// 整线解锁 T5（太泉解锁设计稿 2026-10-27 §4，方案 A：用户 2026-10-27 08:17 批 runtime.ts 传 saveData）：
// unlock.<lineId> 只有 eq / neq；境界在存档里，没传 save 读成 undefined；门后节点已完成＝已走进，追认解锁。
test('unlock.taiquan：三条满足为 true、缺项为 false；没传存档读成 undefined；门后节点追认、门前迷楼两拍不算', async () => {
  const { parseLedgerPath, resolveLedgerPath, evaluateLedgerCondition, LEDGER_OPERATORS } = await modPromise;
  assert.deepEqual(parseLedgerPath('unlock.taiquan'), { kind: 'unlock', id: 'taiquan' });
  assert.deepEqual(LEDGER_OPERATORS.unlock, ['eq', 'neq']);
  assert.deepEqual(resolveLedgerPath('unlock.', {}, {}), { handled: true, value: undefined });
  const runtimeOf = ({ flags = { 'line.song.outcome': 'resolved' }, done = [] } = {}) => ({
    modId: 'lyl.taiquan_sacred_fruit', events: [], completedEventIds: [], flags,
    chronicle: done.map((id, i) => entry('lyl.taiquan_sacred_fruit', id, i + 1)),
  });
  const saveOf = (realm, rt) => ({ 角色: { 属性: { 境界: { 名称: realm } } }, 世界: { 状态: { 剧本模组: rt } } });
  const read = (realm, rt = runtimeOf()) => resolveLedgerPath('unlock.taiquan', rt, saveOf(realm, rt)).value;
  assert.equal(read('坐照'), true);
  assert.equal(read('入微'), false);
  assert.equal(read('坐照', runtimeOf({ flags: {} })), false, '没收束线');
  // 没传存档、占位空存档（没有 角色）：读成 undefined，eq true 不通过
  assert.equal(resolveLedgerPath('unlock.taiquan', runtimeOf()).value, undefined);
  assert.equal(resolveLedgerPath('unlock.taiquan', runtimeOf(), {}).value, undefined);
  assert.equal(evaluateLedgerCondition({ path: 'unlock.taiquan', operator: 'eq', value: true }, runtimeOf()), false, '变体求值不传存档');
  assert.equal(evaluateLedgerCondition({ path: 'unlock.taiquan', operator: 'gte', value: true }, runtimeOf()), false, '不支持的 operator 不命中');
  // 追认：境界 3 走到取果 _10 → 解锁；只走完迷楼 _04/_05（临安收束章、门前）→ 仍锁
  assert.equal(read('生象', runtimeOf({ flags: {}, done: ['lyl.event.taiquan_sacred_fruit_10'] })), true);
  assert.equal(read('生象', runtimeOf({ flags: {}, done: ['lyl.event.taiquan_sacred_fruit_04', 'lyl.event.taiquan_sacred_fruit_05'] })), false);
  // 以传入的 runtime 为准（切关、选章时 runtime 可能不是存档里那份）
  const stale = runtimeOf({ flags: {} });
  assert.equal(resolveLedgerPath('unlock.taiquan', runtimeOf(), saveOf('坐照', stale)).value, true);
  assert.equal(resolveLedgerPath('unlock.taiquan', stale, saveOf('坐照', runtimeOf())).value, false);
});
