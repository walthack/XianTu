// 国家线收束唯一读取点 lineClosed（总策划定，真机 1f9f24127b4e 报告③）：当前线卡、compass.anyLineClosed、太泉解锁都读它。
// 判定顺序：line.<id>.outcome 已写（resolved／unresolved 都算）→ 按档；规则表 lineOutcomes 已有本线规则 → 等规则写档；
// 规则表还没有本线规则 → 退回读线的下一步表收束事件 closedWhen，按编年史判，记 identity 调试日志。
// 「没去」「半路走掉」不算收束（用户 2026-10-27 01:12 定）；太泉不计入。回归：5e8f-04 南荒撤卡与太泉「还差 0 条」一致。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

// 顺序加载：并发 loadTs 会各自实例化 numbers.ts，热改 GAME_NUMBERS 就看不到同一份
const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
const rules = await loadTs('../src/modules/scenarioMods/playerLedgerRules.ts');
const outcomes = await loadTs('../src/modules/scenarioMods/lineOutcomes.ts');
const ledger = await loadTs('../src/modules/scenarioMods/ledgerConditions.ts');
const unlock = await loadTs('../src/modules/scenarioMods/lineUnlock.ts');
const compass = await loadTs('../src/modules/scenarioMods/lineCompass.ts');
const secondary = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
const entry = await loadTs('../src/modules/scenarioMods/secondaryLineEntry.ts');
const { validateLineCompassTable } = await loadTs('../src/modules/scenarioMods/validator.ts');
const dbg = await loadTs('../src/modules/diagnostics/debugLog.ts');

const S02 = 'lcq.stage_02', S03B = 'lcq.stage_03b_snake_flower_bridge', S04 = 'lcq.stage_04', S04B = 'lcq.stage_04b_lingfei_baiyi_crisis', S05B = 'lcq.stage_05b';
const DEPART = 'lcq.event.s05b_wuer_suli_depart';
const stageEvents = stageId => JSON.parse(fs.readFileSync(`src/modules/scenarioMods/builtins/data/${stageId}.json`, 'utf8')).scenario.events;
const played = (stageId, keep = () => true) => stageEvents(stageId).filter(keep).map(e => [stageId, e.id]);
const runtimeOf = ({ modId = S05B, done = [], flags = {} } = {}) => ({
  modId, events: [], completedEventIds: [], flags: structuredClone(flags), acquaintances: {},
  chronicle: done.map(([stageId, eventId], i) => ({ id: `chronicle.${stageId}.${eventId}`, type: 'event', stageId, title: '', sequence: i + 1 })),
});
const saveOf = (opts = {}, realm = { 名称: '生象', 阶段: '初期' }) => ({ 角色: { 属性: { 境界: realm } }, 世界: { 状态: { 剧本模组: runtimeOf(opts) } } });
const rulesTable = (patch = {}) => ({ version: 1, identityGrants: [], identityRevokes: [], lineOutcomes: [], itemGroups: [], partyJoins: [], partyLeaves: [], partyOpenings: [], progressTicks: [], progressDeadlines: [], ...patch });

// 南荒全程（默认路线 02 → 03b → 04 → 04b → 05b），走到二爷离队＝南荒收束事件
const SOUTH_DONE = [...played(S02), ...played(S03B), ...played(S04), ...played(S04B), ...played(S05B)];
// 半路走掉：进了鬼王宫就没往下走（05b 只到 s05b_04）
const SOUTH_HALF = [...played(S02), ...played(S03B), ...played(S04), ...played(S04B), ...played(S05B, e => typeof e.axisSeq === 'number' && e.axisSeq <= 169)];

test('仓库现状：南荒尚无收束规则，南荒收束靠退回读 closedWhen（二爷离队）', () => {
  assert.deepEqual(rules.playerLedgerRules().lineOutcomes.filter(r => r.lineId === 'nanhuang'), []);
  assert.deepEqual(compass.lineCompassTable().lines.find(l => l.lineId === 'nanhuang').closedWhen, [{ path: `done.${DEPART}`, operator: 'eq', value: true }]);
  assert.ok(SOUTH_DONE.some(([, id]) => id === DEPART));
});

test('判定顺序①：outcome 已写按档——resolved／unresolved 都算；不在计入档里不算，也不再退回读收束事件；非法档位当没写', () => {
  const at = (flags, done = [], opts) => outcomes.lineClosed('nanhuang', runtimeOf({ flags, done }), opts);
  assert.equal(at({ 'line.nanhuang.outcome': 'resolved' }), true);
  assert.equal(at({ 'line.nanhuang.outcome': 'unresolved' }), true);
  assert.equal(at({ line: { nanhuang: { outcome: 'unresolved' } } }), true, '嵌套兜底同口径');
  assert.equal(at({ 'line.nanhuang.outcome': 'unresolved' }, SOUTH_DONE, { tiers: ['resolved'] }), false, '已写档按档：收束事件走到了也不改判');
  assert.equal(at({ 'line.nanhuang.outcome': 'bogus' }), false);
  assert.equal(at({ 'line.nanhuang.outcome': 'bogus' }, SOUTH_DONE), true, '非法档位当没写 → 退回读收束事件');
});

test('判定顺序②③：规则表已有本线规则时只认写档；没有本线规则时退回读收束事件（按编年史）；没去、半路走掉都不算', () => {
  const rt = done => runtimeOf({ done });
  assert.equal(outcomes.lineClosed('nanhuang', rt(SOUTH_DONE)), true);
  assert.equal(outcomes.lineClosed('nanhuang', rt([])), false, '没去');
  assert.equal(outcomes.lineClosed('nanhuang', rt(SOUTH_HALF)), false, '半路走掉');
  assert.equal(outcomes.lineClosed('jin', rt(SOUTH_DONE)), false);
  rules.setPlayerLedgerRulesForTest(rulesTable({ lineOutcomes: [{ eventId: 'lcq.event.tribes_pledge', lineId: 'nanhuang', outcome: 'resolved' }] }));
  try {
    assert.equal(outcomes.lineClosed('nanhuang', rt(SOUTH_DONE)), false, '有规则就等规则写档，不再读收束事件');
    assert.equal(outcomes.lineClosed('nanhuang', runtimeOf({ done: SOUTH_DONE, flags: { 'line.nanhuang.outcome': 'resolved' } })), true);
    assert.equal(outcomes.lineClosed('jin', runtimeOf({ done: [['lcq.stage_09_trade_and_escape', 'lcq.event.s09_10_separation']] })), true, '别的线没有规则，照旧退回');
  } finally {
    rules.setPlayerLedgerRulesForTest(undefined);
  }
  // 表可替换（右栏卡传它求值的表）；closedWhen 认 anyOf 组；空 closedWhen 永不收束
  const lines = [{ lineId: 'nanhuang', closedWhen: [{ anyOf: [{ path: 'done.lcq.event.s06_06', operator: 'eq', value: true }, { path: `done.${DEPART}`, operator: 'eq', value: true }] }] }, { lineId: 'jin' }];
  assert.equal(outcomes.lineClosed('nanhuang', rt([[S05B, DEPART]]), { lines }), true);
  assert.equal(outcomes.lineClosed('jin', rt(SOUTH_DONE), { lines }), false);
});

test('太泉不计入：太泉自身收束只撤卡，不算进 closedLineIds／compass.anyLineClosed', () => {
  const rt = runtimeOf({ done: [['lyl.taiquan_afterfall', 'lyl.event.taiquan_portal_exit']], flags: { 'line.taiquan.outcome': 'resolved' } });
  assert.equal(outcomes.lineClosed('taiquan', rt), true);
  assert.deepEqual(outcomes.closedLineIds(rt), []);
  assert.equal(ledger.evaluateLedgerCondition({ path: 'compass.anyLineClosed', operator: 'eq', value: true }, rt), false);
});

test('退回读收束事件记一条 identity 调试日志（结果变了才再记）；开关关着不记', () => {
  const out = [];
  dbg.setDebugConsole((...args) => out.push(args));
  try {
    outcomes.lineClosed('song', runtimeOf());
    assert.equal(out.length, 0, '开关关着不记');
    numbers.applyGameNumbers({ diagnostics: { debug: { categories: { identity: true } } } });
    outcomes.lineClosed('song', runtimeOf());
    outcomes.lineClosed('song', runtimeOf());
    outcomes.lineClosed('song', runtimeOf({ done: [['lyl.taiquan_sacred_fruit', 'lyl.event.taiquan_sacred_fruit_06']] }));
    outcomes.lineClosed('song', runtimeOf({ flags: { 'line.song.outcome': 'resolved' } }));
  } finally {
    dbg.setDebugConsole(null);
    numbers.applyGameNumbers({ diagnostics: { debug: { categories: { identity: false } } } });
  }
  const msgs = out.map(([msg]) => msg).filter(msg => msg.includes('[收束] song'));
  assert.equal(msgs.length, 2, '未收束一条、已收束一条；同结果不重复，已写档不走退回');
  assert.ok(msgs.every(msg => msg.startsWith('[dbg:identity]') && msg.includes('退回读线的下一步表收束事件')));
  assert.ok(msgs[0].endsWith('未收束') && msgs[1].endsWith('已收束'));
});

test('5e8f-04 情境（二期终点·朱老头授艺后，南荒已收束、境界生象）：南荒撤卡，太泉「还差 0 条」，compass.anyLineClosed 成立，三处一致', () => {
  const save = saveOf({ done: SOUTH_DONE });
  const rt = save.世界.状态.剧本模组;
  const view = compass.lineCompassView(save, { focusEventId: undefined, compassPointer: () => '去某处 · 见某人' });
  assert.notEqual(view.current?.lineId, 'nanhuang');
  assert.ok(!view.others.some(o => o.lineId === 'nanhuang'), '南荒撤卡');
  assert.equal(ledger.evaluateLedgerCondition({ path: 'compass.anyLineClosed', operator: 'eq', value: true }, rt, save), true);
  assert.ok(!view.others.some(o => o.lineId === 'qin'), '尚未听到秦线传闻，不提前知情');
  const tqLine = secondary.SECONDARY_LINES.find(l => l.id === 'taiquan');
  const status = unlock.lineUnlockStatus(save, 'taiquan', secondary.secondaryLineUnlockOptions(tqLine));
  assert.deepEqual(status.lines, { closedIds: ['nanhuang'], need: 1, short: 0 });
  assert.deepEqual(status.missing, ['realm'], '只差修为');
  const tq = view.others.find(o => o.lineId === 'taiquan');
  assert.equal(tq.locked, true);
  assert.deepEqual(tq.hintLines, entry.secondaryLineEntryView(tqLine, save).hintLines);
  assert.ok(tq.hintLines.length > 0 && !tq.hintLines.some(line => line.includes('国家线收束')), `不再写「还差 N 条国家线收束」：${JSON.stringify(tq.hintLines)}`);
  // 修为到了（坐照）就解锁：同一份收束口径
  const ready = saveOf({ done: SOUTH_DONE }, { 名称: '坐照', 阶段: '初期' });
  assert.equal(unlock.lineUnlockStatus(ready, 'taiquan', secondary.secondaryLineUnlockOptions(tqLine)).unlocked, true);
  // 对照：南荒半路走掉 → 卡片仍在、太泉仍差 1 条，两边同样一致
  const half = saveOf({ done: SOUTH_HALF });
  const halfView = compass.lineCompassView(half, { focusEventId: undefined, compassPointer: () => '去某处 · 见某人' });
  assert.equal(halfView.current?.lineId, 'nanhuang');
  assert.deepEqual(unlock.lineUnlockStatus(half, 'taiquan', secondary.secondaryLineUnlockOptions(tqLine)).lines, { closedIds: [], need: 1, short: 1 });
});

test('validator：closedWhen 是收束事件，只许 done.*（可含 anyOf 组）；compass.* 仍报 compass_in_closed_when', () => {
  const D = id => ({ path: `done.lcq.event.${id}`, operator: 'eq', value: true });
  const table = closedWhen => ({ version: 1, lines: [{ lineId: 'nanhuang', nameKey: 'n', closedWhen, steps: [{ id: 'a', hintKey: 'k' }] }] });
  const codes = closedWhen => validateLineCompassTable(table(closedWhen), { n: '南荒', k: '去看看' }).map(i => `${i.code}@${i.path}`);
  assert.deepEqual(codes([D('s05b_wuer_suli_depart'), { anyOf: [D('shanghou_cures_ice_gu'), D('s06_06')] }]), []);
  assert.deepEqual(codes([{ path: 'unlock.taiquan', operator: 'eq', value: true }]), ['closed_when_done_only@lineCompass.lines[0].closedWhen[0].path']);
  assert.deepEqual(codes([{ anyOf: [D('s06_06'), { path: 'party.liuchao.character.ning_yu', operator: 'eq', value: true }] }]), ['closed_when_done_only@lineCompass.lines[0].closedWhen[0].anyOf[1].path']);
  assert.deepEqual(codes([{ path: 'compass.anyLineClosed', operator: 'eq', value: true }]), ['compass_in_closed_when@lineCompass.lines[0].closedWhen[0].path']);
});
