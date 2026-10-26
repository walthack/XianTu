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
  // 六条判档线都能被实体索引认出且可写收束档
  const table = rules({ lineOutcomes: ['nanhuang', 'jin', 'song', 'han', 'tang', 'qin'].map(lineId => ({ eventId: EVENT, lineId, outcome: 'resolved' })) });
  assert.deepEqual(validatePlayerLedgerRules(table), []);
});

test('太泉不判档：收束规则的 lineId 须在 story.lineOutcome.judgedLines', async () => {
  const { validatePlayerLedgerRules } = await modPromise;
  const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
  assert.equal(numbers.GAME_NUMBERS.story.lineOutcome.judgedLines.includes('taiquan'), false);
  const table = rules({ lineOutcomes: [{ eventId: EVENT, lineId: 'taiquan', outcome: 'resolved' }] });
  // 太泉是已知国家线（实体索引 kind=line），报的是非判档而不是未知
  assert.deepEqual(validatePlayerLedgerRules(table, { identities: [] }), [`收束规则 ${EVENT} → taiquan：lineId 不在 story.lineOutcome.judgedLines（非判档线不写收束档）：taiquan`]);
  // 判档线集合走配置：引用集合换成含太泉即通过，去掉宋即报错
  assert.deepEqual(validatePlayerLedgerRules(table, { identities: [], judgedLines: ['taiquan'] }), []);
  const song = rules({ lineOutcomes: [{ eventId: EVENT, lineId: 'song', outcome: 'resolved' }] });
  assert.ok(validatePlayerLedgerRules(song, { identities: [], judgedLines: ['jin'] }).some(e => /非判档线不写收束档）：song/.test(e)));
  // 未知线只报未知，不重复报非判档
  const chu = validatePlayerLedgerRules(rules({ lineOutcomes: [{ eventId: EVENT, lineId: 'chu', outcome: 'resolved' }] }), { identities: [] });
  assert.deepEqual(chu, [`收束规则 ${EVENT} → chu：lineId 未知：chu`]);
});

test('未知 identityId/eventId/lineId 报错', async () => {
  const { validatePlayerLedgerRules } = await modPromise;
  const refs = { identities: [ZHUSHI, FENHAO] };
  assert.deepEqual(validatePlayerLedgerRules(rules({
    identityGrants: [{ eventId: EVENT, identityId: ZHUSHI.id }, { eventId: EVENT_2, identityId: ZHUSHI.id, whenHeld: 'redirect', redirectIdentityId: FENHAO.id }],
    identityRevokes: [{ eventId: EVENT_2, identityId: FENHAO.id }],
    lineOutcomes: [{ eventId: EVENT, lineId: 'nanhuang', outcome: 'unresolved' }],
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
