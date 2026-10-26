// 国家线收束档 T1（身份账设计稿 2026-10-25 §3.3 / §6）：flags 键 line.<lineId>.outcome，档位与只写一次读数值配置。规则均为测试夹具。
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

// 顺序加载：并发 loadTs 会各自实例化 numbers.ts，热改 GAME_NUMBERS 就看不到同一份
const loaded = (async () => {
  const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
  const rules = await loadTs('../src/modules/scenarioMods/playerLedgerRules.ts');
  const mod = await loadTs('../src/modules/scenarioMods/lineOutcomes.ts');
  const log = await loadTs('../src/modules/diagnostics/log.ts');
  const store = await loadTs('../src/modules/diagnostics/store.ts');
  return { numbers, rules, mod, log, store };
})();
const modPromise = loaded.then(x => x.mod);
const rulesPromise = loaded.then(x => x.rules);
const numbersPromise = loaded.then(x => x.numbers);
/** 拒写须带码 LCQ-SAV-024 写持久日志 */
const logged = async (reason) => (await loaded).store.logStore.recent(100).filter(e => e.code === 'LCQ-SAV-024' && e.detail?.reason === reason);
const resetLog = async () => (await loaded).log.resetLogState();

const rules = (lineOutcomes) => ({ version: 1, identityGrants: [], identityRevokes: [], lineOutcomes });
const quiet = async (fn) => { const warn = console.warn; const seen = []; console.warn = (...a) => seen.push(a.join(' ')); try { return [await fn(), seen]; } finally { console.warn = warn; } };

test('收束事件写 line.<id>.outcome', async () => {
  const { syncLineOutcomes, lineOutcomeTiers, readLineOutcome } = await modPromise;
  const { GAME_NUMBERS } = await numbersPromise;
  assert.deepEqual([...lineOutcomeTiers()], GAME_NUMBERS.story.lineOutcome.tiers);
  const runtime = { flags: {}, completedEventIds: ['e.song.end'] };
  assert.equal(syncLineOutcomes(runtime, { rules: rules([{ eventId: 'e.song.end', lineId: 'song', outcome: 'resolved' }, { eventId: 'e.qin.end', lineId: 'qin', outcome: 'unresolved' }]) }), 1);
  assert.equal(runtime.flags['line.song.outcome'], 'resolved');
  assert.equal('line.qin.outcome' in runtime.flags, false);
  assert.equal(readLineOutcome({ line: { han: { outcome: 'imperfect' } } }, 'han'), 'imperfect');
  // 跨关：编年史里的收束事件同样入账；重复同步幂等
  // 编年史条目只认已知事件 id（实体索引 kind=event），故取真实 id
  const QIN_END = 'lcq.event.s02_06';
  const later = { flags: {}, chronicle: [{ id: `chronicle.stage.qin.${QIN_END}`, type: 'event', stageId: 'stage.qin', title: '', sequence: 1 }] };
  const table = rules([{ eventId: QIN_END, lineId: 'qin', outcome: 'unresolved' }]);
  assert.equal(syncLineOutcomes(later, { rules: table }), 1);
  assert.equal(syncLineOutcomes(later, { rules: table }), 0);
  assert.equal(later.flags['line.qin.outcome'], 'unresolved');
});

test('writeOnce 时后写不覆盖', async () => {
  const { syncLineOutcomes, writeLineOutcome } = await modPromise;
  const { GAME_NUMBERS } = await numbersPromise;
  assert.equal(GAME_NUMBERS.story.lineOutcome.writeOnce, true);
  const runtime = { flags: {}, completedEventIds: ['e.jin.fail', 'e.jin.rescue'] };
  const table = rules([{ eventId: 'e.jin.fail', lineId: 'jin', outcome: 'imperfect' }, { eventId: 'e.jin.rescue', lineId: 'jin', outcome: 'resolved' }]);
  await resetLog();
  const [changed, warnings] = await quiet(() => syncLineOutcomes(runtime, { rules: table }));
  assert.equal(changed, 1);
  assert.equal(runtime.flags['line.jin.outcome'], 'imperfect');
  assert.ok(warnings.some(w => /writeOnce/.test(w)));
  const [hit] = await logged('writeOnce');
  assert.deepEqual({ lineId: hit.detail.lineId, outcome: hit.detail.outcome, prior: hit.detail.prior, eventId: hit.detail.eventId, module: hit.module },
    { lineId: 'jin', outcome: 'resolved', prior: 'imperfect', eventId: 'e.jin.rescue', module: 'lineOutcomes' });
  // 已有嵌套写法的值也算已收束
  const nested = { line: { tang: { outcome: 'unresolved' } } };
  const [wrote] = await quiet(() => writeLineOutcome(nested, 'tang', 'resolved'));
  assert.equal(wrote, false);
  assert.equal(nested['line.tang.outcome'], undefined);
});

test('outcome 不在 tiers 时拒写', async () => {
  const { syncLineOutcomes } = await modPromise;
  const runtime = { flags: {}, completedEventIds: ['e.han.end'] };
  await resetLog();
  const [changed, warnings] = await quiet(() => syncLineOutcomes(runtime, { rules: rules([{ eventId: 'e.han.end', lineId: 'han', outcome: 'triumph' }]) }));
  assert.equal(changed, 0);
  assert.equal('line.han.outcome' in runtime.flags, false);
  assert.ok(warnings.some(w => /tiers/.test(w)));
  const hits = await logged('tier');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].detail.lineId, 'han');
  assert.equal(hits[0].detail.outcome, 'triumph');
});

test('tiers 改为两档后旧三档值被校验拒绝', async () => {
  const { syncLineOutcomes } = await modPromise;
  const { validatePlayerLedgerRules } = await rulesPromise;
  const { GAME_NUMBERS, applyGameNumbers } = await numbersPromise;
  const before = [...GAME_NUMBERS.story.lineOutcome.tiers];
  const table = rules([{ eventId: 'lcq.event.charge_sudaji_fee', lineId: 'song', outcome: 'imperfect' }]);
  const refs = { identities: [] };
  assert.deepEqual(validatePlayerLedgerRules(table, refs), []);
  applyGameNumbers({ story: { lineOutcome: { tiers: ['resolved', 'unresolved'] } } });
  try {
    assert.ok(validatePlayerLedgerRules(table, refs).some(e => /outcome 不在 story\.lineOutcome\.tiers：imperfect/.test(e)));
    const runtime = { flags: {}, completedEventIds: ['lcq.event.charge_sudaji_fee'] };
    const [changed] = await quiet(() => syncLineOutcomes(runtime, { rules: table }));
    assert.equal(changed, 0);
    assert.equal('line.song.outcome' in runtime.flags, false);
  } finally {
    applyGameNumbers({ story: { lineOutcome: { tiers: before } } });
  }
  assert.deepEqual([...GAME_NUMBERS.story.lineOutcome.tiers], before);
});
