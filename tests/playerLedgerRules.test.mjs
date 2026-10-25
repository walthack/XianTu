// 玩家账本规则表交叉校验 T1（身份账设计稿 2026-10-25 §6）：身份/事件/国家线 id、保留末段、授撤冲突。规则均为测试夹具。
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const modPromise = loadTs('../src/modules/scenarioMods/playerLedgerRules.ts');

const EVENT = 'lcq.event.charge_sudaji_fee';
const EVENT_2 = 'lcq.event.free_ajiman';
const ZHUSHI = { id: 'liuchao.identity.song.baochao_zhushi', name: '宝钞铺主事', kind: 'merchant', lineId: 'song', rank: 2 };
const FENHAO = { id: 'liuchao.identity.jin.baochao_fenhao', name: '宝钞分号', kind: 'merchant', lineId: 'jin' };
const rules = (patch = {}) => ({ version: 1, identityGrants: [], identityRevokes: [], lineOutcomes: [], ...patch });

test('仓库规则表与身份表首版为空且通过校验', async () => {
  const { playerLedgerRules, playerIdentityDefs, validatePlayerLedgerRules } = await modPromise;
  assert.deepEqual(playerLedgerRules(), { ...playerLedgerRules(), identityGrants: [], identityRevokes: [], lineOutcomes: [] });
  assert.deepEqual(playerIdentityDefs(), []);
  // 七条国家线都能被实体索引认出
  const table = rules({ lineOutcomes: ['nanhuang', 'jin', 'song', 'han', 'tang', 'qin', 'taiquan'].map(lineId => ({ eventId: EVENT, lineId, outcome: 'resolved' })) });
  assert.deepEqual(validatePlayerLedgerRules(table), []);
});

test('未知 identityId/eventId/lineId 报错', async () => {
  const { validatePlayerLedgerRules } = await modPromise;
  const refs = { identities: [ZHUSHI, FENHAO] };
  assert.deepEqual(validatePlayerLedgerRules(rules({
    identityGrants: [{ eventId: EVENT, identityId: ZHUSHI.id }, { eventId: EVENT_2, identityId: ZHUSHI.id, whenHeld: 'redirect', redirectIdentityId: FENHAO.id }],
    identityRevokes: [{ eventId: EVENT_2, identityId: FENHAO.id }],
    lineOutcomes: [{ eventId: EVENT, lineId: 'nanhuang', outcome: 'imperfect' }],
  }), refs), []);
  const errors = validatePlayerLedgerRules(rules({
    identityGrants: [
      { eventId: EVENT, identityId: 'liuchao.identity.song.nobody' },
      { eventId: 'lcq.event.no_such_event', identityId: ZHUSHI.id },
      { eventId: EVENT, identityId: ZHUSHI.id, whenHeld: 'redirect' },
      { eventId: EVENT_2, identityId: ZHUSHI.id, whenHeld: 'redirect', redirectIdentityId: 'liuchao.identity.jin.nobody' },
    ],
    identityRevokes: [{ eventId: EVENT, identityId: 'liuchao.identity.han.nobody' }],
    lineOutcomes: [{ eventId: EVENT, lineId: 'chu', outcome: 'resolved' }],
  }), { identities: [ZHUSHI, FENHAO, { ...FENHAO, id: 'liuchao.identity.yue.x', lineId: 'yue', kind: 'pirate' }] });
  const has = (re) => assert.ok(errors.some(e => re.test(e)), `缺少报错 ${re}：${errors.join(' | ')}`);
  has(/identityId 未知：liuchao\.identity\.song\.nobody/);
  has(/eventId 未知：lcq\.event\.no_such_event/);
  has(/whenHeld=redirect 须带 redirectIdentityId/);
  has(/redirectIdentityId 未知：liuchao\.identity\.jin\.nobody/);
  has(/identityId 未知：liuchao\.identity\.han\.nobody/);
  has(/lineId 未知：chu/);
  has(/liuchao\.identity\.yue\.x 的 lineId 未知：yue/);
  has(/liuchao\.identity\.yue\.x 的 kind 不在 story\.identity\.kinds：pirate/);
});

test('身份 id 末段为 from/status 报错', async () => {
  const { validatePlayerLedgerRules } = await modPromise;
  for (const tail of ['from', 'status']) {
    const errors = validatePlayerLedgerRules(rules(), { identities: [{ ...ZHUSHI, id: `liuchao.identity.song.${tail}` }] });
    assert.ok(errors.some(e => e.includes(`末段不能是`) && e.includes(`liuchao.identity.song.${tail}`)), errors.join(' | '));
  }
  assert.deepEqual(validatePlayerLedgerRules(rules(), { identities: [{ ...ZHUSHI, id: 'liuchao.identity.song.from_south' }] }), []);
});

test('同事件同身份既授又撤报错', async () => {
  const { validatePlayerLedgerRules } = await modPromise;
  const errors = validatePlayerLedgerRules(rules({
    identityGrants: [{ eventId: EVENT, identityId: ZHUSHI.id }],
    identityRevokes: [{ eventId: EVENT, identityId: ZHUSHI.id }],
  }), { identities: [ZHUSHI] });
  assert.ok(errors.some(e => /既授予又撤销/.test(e)), errors.join(' | '));
});
