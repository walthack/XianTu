// 身份账 T3（身份账设计稿 2026-10-25 §3.4）：任务线效果 identityGrant / identityRevoke；setState 不得写 line.*（收束档只走规则表）。
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const { parseQuestLines, validateQuestLineReferences } = await loadTs('../src/modules/scenarioMods/questLines.ts');
const { LINE_EFFECT_HANDLERS } = await loadTs('../src/modules/scenarioMods/questLineEffects.ts');
const identities = await loadTs('../mod-kit/entity-catalog/identities.json');

const ZHUSHI = 'liuchao.identity.song.baochao_zhushi';
const FENHAO = 'liuchao.identity.jin.baochao_fenhao';
const EVENT = 'lcq.event.s02_04';

const table = effects => ({ version: 1, lines: [{
  id: 'line.test.identity', kind: 'side', name: '测试线', entryHint: '测试', ownerCharacterIds: [], entry: { eventDone: 'lcq.event.s02_03' },
  beats: [{ id: 'beat.test.identity', mode: 'standalone', hostEventId: null, eventId: EVENT, objective: '入股',
    completedBy: { eventActionReceipt: { eventId: EVENT, actionId: 'invest' } }, onComplete: effects }],
}] });
const parse = effects => parseQuestLines(table(effects), id => id, {});

/** 身份定义是总表配置；首版为空，测试临时挂两条夹具定义。 */
function withIdentityDefs(fn) {
  const before = identities.entries.length;
  identities.entries.push(
    { id: ZHUSHI, definition: { id: ZHUSHI, name: '宝钞主事', kind: 'office', lineId: 'song' } },
    { id: FENHAO, definition: { id: FENHAO, name: '宝钞分号', kind: 'merchant', lineId: 'jin' } },
  );
  try { return fn(); } finally { identities.entries.splice(before); }
}

const ctxFor = (r, eventId = EVENT) => ({ r, event: { id: eventId, name: '入股' } });
function settle(effect, r, eventId) {
  const handler = LINE_EFFECT_HANDLERS[effect.kind];
  handler.validate?.(effect, ctxFor(r, eventId));
  handler.apply(effect, ctxFor(r, eventId));
}

test('任务线 identityGrant 写账且幂等', () => withIdentityDefs(() => {
  // 解析：白名单字段通过，redirect 须成对，未知字段拒绝；引用校验登记 identity
  const parsed = parse([{ kind: 'identityGrant', identityId: ZHUSHI, whenHeld: 'redirect', redirectIdentityId: FENHAO }, { kind: 'identityRevoke', identityId: ZHUSHI }]);
  assert.equal(parsed.lines[0].beats[0].onComplete.length, 2);
  assert.throws(() => parse([{ kind: 'identityGrant', identityId: ZHUSHI, whenHeld: 'redirect' }]), /redirectIdentityId/);
  assert.throws(() => parse([{ kind: 'identityGrant', identityId: ZHUSHI, redirectIdentityId: FENHAO }]), /redirectIdentityId/);
  assert.throws(() => parse([{ kind: 'identityGrant', identityId: ZHUSHI, lineId: 'song' }]), /unknown field lineId/);
  assert.throws(() => parse([{ kind: 'identityRevoke' }]), /invalid identityId/);
  const refs = validateQuestLineReferences(parsed, (kind, id) => kind !== 'identity');
  assert.deepEqual([...new Set(refs)].sort(), [`identity: ${FENHAO}`, `identity: ${ZHUSHI}`]);

  // 结算：eventId 取本拍事件；同一事件重复结算不追加
  const r = { modId: 'stage.jin', worldTurn: 9, flags: {} };
  settle({ kind: 'identityGrant', identityId: ZHUSHI }, r);
  settle({ kind: 'identityGrant', identityId: ZHUSHI }, r);
  assert.deepEqual(r.playerIdentities[ZHUSHI], {
    identityId: ZHUSHI, status: 'active', acquiredAtEventId: EVENT,
    history: [{ eventId: EVENT, op: 'grant', atStageId: 'stage.jin', atWorldTurn: 9 }],
  });
  // 已持有 + redirect：改授分号，原身份不动；重复结算仍幂等
  const redirect = { kind: 'identityGrant', identityId: ZHUSHI, whenHeld: 'redirect', redirectIdentityId: FENHAO };
  settle(redirect, r, 'lcq.event.s02_05');
  settle(redirect, r, 'lcq.event.s02_05');
  assert.equal(r.playerIdentities[ZHUSHI].history.length, 1);
  assert.equal(r.playerIdentities[FENHAO].acquiredAtEventId, 'lcq.event.s02_05');
  assert.equal(r.playerIdentities[FENHAO].history.length, 1);
  // 撤销：记录保留，status=revoked
  settle({ kind: 'identityRevoke', identityId: ZHUSHI }, r, 'lcq.event.s02_06');
  settle({ kind: 'identityRevoke', identityId: ZHUSHI }, r, 'lcq.event.s02_06');
  assert.equal(r.playerIdentities[ZHUSHI].status, 'revoked');
  assert.deepEqual(r.playerIdentities[ZHUSHI].history.map(h => h.op), ['grant', 'revoke']);
  // 未登记的身份在结算前校验就拒绝（整次不写）
  assert.throws(() => LINE_EFFECT_HANDLERS.identityGrant.validate({ kind: 'identityGrant', identityId: 'liuchao.identity.none.x' }, ctxFor(r)), /unknown identity/);
  assert.throws(() => LINE_EFFECT_HANDLERS.identityRevoke.validate({ kind: 'identityRevoke', identityId: 'liuchao.identity.none.x' }, ctxFor(r)), /unknown identity/);
}));

test('setState 写 line. 前缀被拒', () => {
  assert.throws(() => parse([{ kind: 'setState', stateId: 'line.jin.outcome', value: 'resolved' }]), /line\./);
  assert.throws(() => parse([{ kind: 'setState', stateId: 'line', value: 'resolved' }]), /line\./);
  assert.equal(parse([{ kind: 'setState', stateId: 'lineage.note', value: 'ok' }]).lines.length, 1, '只拦 line 命名空间');
});
