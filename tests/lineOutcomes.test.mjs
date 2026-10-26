// 国家线收束档 T1（身份账设计稿 2026-10-25 §3.3 / §6）：flags 键 line.<lineId>.outcome，档位（两档）、判档线（太泉不判档）、只写一次、失败是否结束游戏读数值配置。规则均为测试夹具。
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
  assert.deepEqual([...lineOutcomeTiers()], ['resolved', 'unresolved']);
  const runtime = { flags: {}, completedEventIds: ['e.song.end'] };
  assert.equal(syncLineOutcomes(runtime, { rules: rules([{ eventId: 'e.song.end', lineId: 'song', outcome: 'resolved' }, { eventId: 'e.qin.end', lineId: 'qin', outcome: 'unresolved' }]) }), 1);
  assert.equal(runtime.flags['line.song.outcome'], 'resolved');
  assert.equal('line.qin.outcome' in runtime.flags, false);
  assert.equal(readLineOutcome({ line: { han: { outcome: 'unresolved' } } }, 'han'), 'unresolved');
  // 「没去」不是档位：无收束记录即 undefined
  assert.equal(readLineOutcome({}, 'tang'), undefined);
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
  const table = rules([{ eventId: 'e.jin.fail', lineId: 'jin', outcome: 'unresolved' }, { eventId: 'e.jin.rescue', lineId: 'jin', outcome: 'resolved' }]);
  await resetLog();
  const [changed, warnings] = await quiet(() => syncLineOutcomes(runtime, { rules: table }));
  assert.equal(changed, 1);
  assert.equal(runtime.flags['line.jin.outcome'], 'unresolved');
  assert.ok(warnings.some(w => /writeOnce/.test(w)));
  const [hit] = await logged('writeOnce');
  assert.deepEqual({ lineId: hit.detail.lineId, outcome: hit.detail.outcome, prior: hit.detail.prior, eventId: hit.detail.eventId, module: hit.module },
    { lineId: 'jin', outcome: 'resolved', prior: 'unresolved', eventId: 'e.jin.rescue', module: 'lineOutcomes' });
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

test('imperfect 不在 tiers 时拒写', async () => {
  const { syncLineOutcomes } = await modPromise;
  const { validatePlayerLedgerRules } = await rulesPromise;
  const { GAME_NUMBERS } = await numbersPromise;
  assert.equal(GAME_NUMBERS.story.lineOutcome.tiers.includes('imperfect'), false);
  const table = rules([{ eventId: 'lcq.event.charge_sudaji_fee', lineId: 'song', outcome: 'imperfect' }]);
  assert.ok(validatePlayerLedgerRules(table, { identities: [] }).some(e => /outcome 不在 story\.lineOutcome\.tiers：imperfect/.test(e)));
  const runtime = { flags: {}, completedEventIds: ['lcq.event.charge_sudaji_fee'] };
  await resetLog();
  const [changed] = await quiet(() => syncLineOutcomes(runtime, { rules: table }));
  assert.equal(changed, 0);
  assert.equal('line.song.outcome' in runtime.flags, false);
  const hits = await logged('tier');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].detail.outcome, 'imperfect');
});

test('太泉不判档：非判档线拒写 line.<id>.outcome，记 LCQ-SAV-024（notJudged）', async () => {
  const { syncLineOutcomes, writeLineOutcome, judgedLineIds } = await modPromise;
  assert.equal(judgedLineIds().includes('taiquan'), false);
  const runtime = { flags: {}, completedEventIds: ['e.taiquan.end', 'e.song.end'] };
  const table = rules([{ eventId: 'e.taiquan.end', lineId: 'taiquan', outcome: 'resolved' }, { eventId: 'e.song.end', lineId: 'song', outcome: 'unresolved' }]);
  await resetLog();
  const [changed, warnings] = await quiet(() => syncLineOutcomes(runtime, { rules: table }));
  assert.equal(changed, 1, '判档线照写，太泉不写');
  assert.equal('line.taiquan.outcome' in runtime.flags, false);
  assert.equal(runtime.flags['line.song.outcome'], 'unresolved');
  assert.ok(warnings.some(w => /judgedLines/.test(w)));
  const hits = await logged('notJudged');
  assert.equal(hits.length, 1);
  assert.deepEqual({ lineId: hits[0].detail.lineId, outcome: hits[0].detail.outcome, eventId: hits[0].detail.eventId, module: hits[0].module },
    { lineId: 'taiquan', outcome: 'resolved', eventId: 'e.taiquan.end', module: 'lineOutcomes' });
  // 直接写入口同样拒写；未知线也不在判档集合里
  const flags = {};
  const [wrote] = await quiet(() => writeLineOutcome(flags, 'taiquan', 'unresolved'));
  const [wroteUnknown] = await quiet(() => writeLineOutcome(flags, 'chu', 'resolved'));
  assert.deepEqual([wrote, wroteUnknown, flags], [false, false, {}]);
  assert.equal((await logged('notJudged')).length, 3);
});

test('lineFailEndsGame 逐线读 failEndsGame，国家线默认失败可继续，太泉不判档', async () => {
  const { lineFailEndsGame, judgedLineIds } = await modPromise;
  const { GAME_NUMBERS, applyGameNumbers } = await numbersPromise;
  const LINES = ['nanhuang', 'jin', 'song', 'han', 'tang', 'qin'];
  assert.deepEqual([...judgedLineIds()].sort(), [...LINES].sort());
  assert.deepEqual(Object.keys(GAME_NUMBERS.story.lineOutcome.failEndsGame).sort(), [...LINES].sort());
  for (const lineId of LINES) assert.equal(lineFailEndsGame(lineId), false, lineId);
  assert.equal(lineFailEndsGame('taiquan'), false);
  applyGameNumbers({ story: { lineOutcome: { failEndsGame: { han: true } } } });
  try {
    assert.equal(lineFailEndsGame('han'), true);
    assert.equal(lineFailEndsGame('jin'), false);
  } finally {
    applyGameNumbers({ story: { lineOutcome: { failEndsGame: { han: false } } } });
  }
  assert.equal(lineFailEndsGame('han'), false);
});

test('closedLineIds：按 judgedLines 顺序、非判档线手写也不算、tiers 过滤（太泉解锁设计稿 2026-10-27 §3 / §10-2）', async () => {
  const { closedLineIds, judgedLineIds } = await modPromise;
  const flags = { 'line.qin.outcome': 'resolved', 'line.jin.outcome': 'unresolved', 'line.taiquan.outcome': 'resolved', 'line.chu.outcome': 'resolved', 'line.song.outcome': 'bogus' };
  // judgedLines 顺序（nanhuang, jin, song, han, tang, qin），不是 flags 写入顺序
  assert.deepEqual(closedLineIds(flags), judgedLineIds().filter(id => id === 'jin' || id === 'qin'));
  assert.deepEqual(closedLineIds(flags), ['jin', 'qin']);
  assert.deepEqual(closedLineIds(flags, ['resolved']), ['qin']);
  assert.deepEqual(closedLineIds(flags, ['unresolved']), ['jin']);
  assert.deepEqual(closedLineIds(flags, []), []);
  // 嵌套兜底与扁平键同口径；没有收束记录（没去 / 半路走掉）不算
  assert.deepEqual(closedLineIds({ line: { han: { outcome: 'unresolved' } } }), ['han']);
  assert.deepEqual(closedLineIds({}), []);
  assert.deepEqual(closedLineIds(undefined), []);
  // 纯读：不写 flags
  const before = structuredClone(flags);
  closedLineIds(flags);
  assert.deepEqual(flags, before);
});
