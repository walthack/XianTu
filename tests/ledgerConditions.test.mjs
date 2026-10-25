// 身份账 T2（身份账设计稿 2026-10-25 §4）：账本条件读取。done.* 以编年史为准，补本关 completedEventIds。
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
  const nested = { flags: { line: { jin: { outcome: 'imperfect' } } } };
  assert.equal(evaluateLedgerCondition({ path: 'line.song.outcome', operator: 'eq', value: 'resolved' }, flat), true);
  assert.equal(evaluateLedgerCondition({ path: 'line.jin.outcome', operator: 'eq', value: 'imperfect' }, nested), true);
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
  // party 留位：任何 operator 都不命中；不传 runtime 时账本路径不命中
  assert.equal(evaluateLedgerCondition({ path: 'party.liuchao.character.a', operator: 'neq', value: true }, runtime), false);
  assert.equal(evaluateLedgerCondition({ path: `done.${E1}`, operator: 'neq', value: true }), false);
});
