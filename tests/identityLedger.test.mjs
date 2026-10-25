// 身份账 T1（身份账设计稿 2026-10-25 §2.1 / §3.2 / §3.3）：授予、加固、改授、撤销、幂等、先到先得。规则均为测试夹具。
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const modPromise = loadTs('../src/modules/scenarioMods/identityLedger.ts');

const ZHUSHI = 'liuchao.identity.song.baochao_zhushi';
const FENHAO = 'liuchao.identity.jin.baochao_fenhao';
const rules = (patch = {}) => ({ version: 1, identityGrants: [], identityRevokes: [], lineOutcomes: [], ...patch });

test('首次授予写 acquiredAtEventId 与 active', async () => {
  const { grantPlayerIdentity, isIdentityActive } = await modPromise;
  const ledger = {};
  assert.equal(grantPlayerIdentity(ledger, { identityId: ZHUSHI, eventId: 'e.song.found', stageId: 'stage.song', worldTurn: 7 }), 'granted');
  const record = ledger[ZHUSHI];
  assert.equal(record.identityId, ZHUSHI);
  assert.equal(record.status, 'active');
  assert.equal(record.acquiredAtEventId, 'e.song.found');
  assert.deepEqual(record.history, [{ eventId: 'e.song.found', op: 'grant', atStageId: 'stage.song', atWorldTurn: 7 }]);
  assert.equal(isIdentityActive(ledger, ZHUSHI), true);
  assert.equal(isIdentityActive(undefined, ZHUSHI), false);
});

test('同身份后到事件只记 reinforce 不改来源', async () => {
  const { grantPlayerIdentity } = await modPromise;
  const ledger = {};
  grantPlayerIdentity(ledger, { identityId: ZHUSHI, eventId: 'e.song.found' });
  assert.equal(grantPlayerIdentity(ledger, { identityId: ZHUSHI, eventId: 'e.jin.invest' }), 'reinforced');
  assert.equal(ledger[ZHUSHI].acquiredAtEventId, 'e.song.found');
  assert.deepEqual(ledger[ZHUSHI].history.map(h => [h.eventId, h.op]), [['e.song.found', 'grant'], ['e.jin.invest', 'reinforce']]);
});

test('whenHeld=redirect 已持有时改授分号身份', async () => {
  const { applyIdentityRules } = await modPromise;
  const table = rules({ identityGrants: [
    { eventId: 'e.song.found', identityId: ZHUSHI },
    { eventId: 'e.jin.found', identityId: ZHUSHI, whenHeld: 'redirect', redirectIdentityId: FENHAO },
  ] });
  const ledger = {};
  assert.equal(applyIdentityRules(ledger, ['e.song.found', 'e.jin.found'], table), 2);
  assert.deepEqual(ledger[ZHUSHI].history.map(h => h.eventId), ['e.song.found']);
  assert.equal(ledger[FENHAO].status, 'active');
  assert.equal(ledger[FENHAO].acquiredAtEventId, 'e.jin.found');
  // 改授后重扫：原身份与改授身份的 history 都要查，不再落第二次
  assert.equal(applyIdentityRules(ledger, ['e.song.found', 'e.jin.found'], table), 0);
  // 未持有时 redirect 规则照常授予原身份
  const fresh = {};
  applyIdentityRules(fresh, ['e.jin.found'], table);
  assert.equal(fresh[ZHUSHI].acquiredAtEventId, 'e.jin.found');
  assert.equal(fresh[FENHAO], undefined);
});

test('撤销后记录保留且 status=revoked', async () => {
  const { grantPlayerIdentity, revokePlayerIdentity, isIdentityActive } = await modPromise;
  const ledger = {};
  grantPlayerIdentity(ledger, { identityId: ZHUSHI, eventId: 'e.song.found' });
  assert.equal(revokePlayerIdentity(ledger, { identityId: ZHUSHI, eventId: 'e.song.seized' }), true);
  assert.equal(ledger[ZHUSHI].status, 'revoked');
  assert.equal(ledger[ZHUSHI].acquiredAtEventId, 'e.song.found');
  assert.equal(ledger[ZHUSHI].history.at(-1).op, 'revoke');
  assert.equal(isIdentityActive(ledger, ZHUSHI), false);
  // 没持有过的身份撤销不建记录
  assert.equal(revokePlayerIdentity(ledger, { identityId: FENHAO, eventId: 'e.song.seized' }), false);
  assert.equal(ledger[FENHAO], undefined);
});

test('撤销后再授予恢复 active 且来源不变', async () => {
  const { grantPlayerIdentity, revokePlayerIdentity } = await modPromise;
  const ledger = {};
  grantPlayerIdentity(ledger, { identityId: ZHUSHI, eventId: 'e.song.found' });
  revokePlayerIdentity(ledger, { identityId: ZHUSHI, eventId: 'e.song.seized' });
  assert.equal(grantPlayerIdentity(ledger, { identityId: ZHUSHI, eventId: 'e.song.restored' }), 'reactivated');
  assert.equal(ledger[ZHUSHI].status, 'active');
  assert.equal(ledger[ZHUSHI].acquiredAtEventId, 'e.song.found');
  assert.deepEqual(ledger[ZHUSHI].history.map(h => h.op), ['grant', 'revoke', 'grant']);
});

test('重复同步幂等 history 不重复', async () => {
  const { syncPlayerIdentities } = await modPromise;
  const table = rules({
    identityGrants: [{ eventId: 'e.a', identityId: ZHUSHI }, { eventId: 'e.c', identityId: ZHUSHI }],
    identityRevokes: [{ eventId: 'e.b', identityId: ZHUSHI }],
  });
  const runtime = { modId: 'stage.x', worldTurn: 3, flags: {}, completedEventIds: ['e.a', 'e.b', 'e.c'] };
  assert.equal(syncPlayerIdentities(runtime, { rules: table }), 3);
  const snapshot = structuredClone(runtime.playerIdentities);
  for (let i = 0; i < 3; i += 1) assert.equal(syncPlayerIdentities(runtime, { rules: table }), 0);
  assert.deepEqual(runtime.playerIdentities, snapshot);
  assert.equal(runtime.playerIdentities[ZHUSHI].status, 'active');
  assert.deepEqual(runtime.playerIdentities[ZHUSHI].history.map(h => [h.eventId, h.op]), [['e.a', 'grant'], ['e.b', 'revoke'], ['e.c', 'grant']]);
  // 无规则命中时不新建字段；回填标 backfilled
  const empty = { flags: {}, completedEventIds: ['e.zzz'] };
  assert.equal(syncPlayerIdentities(empty, { rules: table }), 0);
  assert.equal('playerIdentities' in empty, false);
  const old = { flags: {}, completedEventIds: ['e.a'] };
  syncPlayerIdentities(old, { rules: table, backfilled: true });
  assert.equal(old.playerIdentities[ZHUSHI].backfilled, true);
  assert.equal(old.playerIdentities[ZHUSHI].history[0].backfilled, true);
});

test('按完成顺序先到先得', async () => {
  const { syncPlayerIdentities, syncPlayerLedgers } = await modPromise;
  const table = rules({ identityGrants: [
    { eventId: 'e.jin.invest', identityId: ZHUSHI },
    { eventId: 'e.song.found', identityId: ZHUSHI },
  ] });
  // 编年史（跨关，按 sequence）先于本关 completedEventIds；规则表里的顺序不影响来源
  const runtime = {
    modId: 'stage.song', flags: {},
    chronicle: [
      { id: 'chronicle.stage.jin.e.jin.invest', type: 'event', stageId: 'stage.jin', title: '注资', sequence: 2 },
      { id: 'chronicle.stage.jin.e.jin.other', type: 'world', stageId: 'stage.jin', title: '世界自行推进', sequence: 1 },
    ],
    completedEventIds: ['e.song.found'],
  };
  syncPlayerIdentities(runtime, { rules: table });
  assert.equal(runtime.playerIdentities[ZHUSHI].acquiredAtEventId, 'e.jin.invest');
  assert.deepEqual(runtime.playerIdentities[ZHUSHI].history.map(h => h.op), ['grant', 'reinforce']);
  // 反过来完成：来源跟着完成顺序走
  const other = { flags: {}, completedEventIds: ['e.song.found', 'e.jin.invest'] };
  assert.equal(syncPlayerLedgers(other, { rules: table }), 2);
  assert.equal(other.playerIdentities[ZHUSHI].acquiredAtEventId, 'e.song.found');
});
