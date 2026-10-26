// 身份注入提示词 T9（身份账补充设计稿 2026-10-26 §5 / §5.6 / §7；措辞用户 2026-10-27 拍板，裁定簿 #238）：
// 【主角身份·引擎账本】只列 active、身份表查得到、非 secret 的身份，按 rank 降序再按入账先后，截到 story.identity.prompt.maxItems；
// 期限 urgent/due 且 promptCue 已填才出征兆行，不输出剩余数。身份表、规则表与期限数值均为测试夹具，仓库首版为空。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

// 顺序加载，保证身份表夹具与 storyContext 看到同一份模块
const loaded = (async () => {
  const rules = await loadTs('../src/modules/scenarioMods/playerLedgerRules.ts');
  const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
  const prompt = await loadTs('../src/modules/scenarioMods/ledgerPrompt.ts');
  const store = await loadTs('../src/modules/diagnostics/store.ts');
  return { rules, numbers, prompt, store };
})();

const STAGE = 'lcq.stage_01';
const ev = (name) => `test.event.${name}`;
const idOf = (name) => `liuchao.identity.test.${name}`;
const identity = (name, patch = {}) => ({ id: idOf(name), name: `身份${name}`, kind: 'office', ...patch });
const record = (name, eventId, status = 'active') => ({ identityId: idOf(name), status, acquiredAtEventId: eventId, history: [{ eventId, op: 'grant' }] });
const table = (patch = {}) => ({ version: 1, identityGrants: [], identityRevokes: [], lineOutcomes: [], progressTicks: [], progressDeadlines: [], ...patch });
const entry = (eventId, sequence) => ({ id: `chronicle.${STAGE}.${eventId}`, type: 'event', stageId: STAGE, title: '', sequence });
/** 编年史按给定顺序完成 doneIds；夹具事件挂进本关 events，orderedDoneEventIds 才认 */
const runtimeOf = ({ doneIds = [], identities, flags = {} } = {}) => ({
  modId: STAGE,
  events: doneIds.map(id => ({ id })),
  chronicle: doneIds.map((id, i) => entry(id, i + 1)),
  completedEventIds: [],
  flags,
  ...(identities ? { playerIdentities: identities } : {}),
});
const ledgerOf = (records) => Object.fromEntries(records.map(r => [r.identityId, r]));
const logged = (store, reason) => store.logStore.recent(500).filter(e => e.code === 'LCQ-SAV-028' && (!reason || e.detail?.reason === reason));
const quiet = async (fn) => {
  const warn = console.warn; const error = console.error;
  console.warn = () => {}; console.error = () => {};
  try { return await fn(); } finally { console.warn = warn; console.error = error; }
};
const EXPECTED_LINE = '【主角身份·引擎账本】主角眼下持有的公开身份：身份A、身份B（按位次，身份A最高）。本账以外的身份、官职、商号不得自行授予或改换。'
  + '熟人对主角的专用称呼（以角色档案与称谓设定为准）不受身份影响，照旧。'
  + '身份只影响不熟的人、官面场合对主角的称呼，以及人物对主角的态度：无专用称呼者按其所知的最高身份称呼，不知情者按亲眼所见写。';

async function buildStorySave() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const raw = JSON.parse(await readFile(new URL('./fixtures/scenario-mod/minimal.json', import.meta.url), 'utf8'));
  const mod = parseScenarioMod(raw);
  const { applyStrictScenarioInitializationToSave, buildStrictScenarioInitialization } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const initialized = applyStrictScenarioInitializationToSave({
    角色: { 位置: { 描述: '旧地点' } },
    世界: { 信息: {}, 状态: {} },
    系统: { 扩展: {} },
  }, buildStrictScenarioInitialization(mod, '2026-06-22T00:00:00.000Z'));
  return advanceScenarioRuntime(initialized).saveData;
}

test('措辞按用户 2026-10-27 拍板口径；单个身份不写位次括注；maxItems 读配置首版 3', async () => {
  const { prompt, numbers } = await loaded;
  assert.equal(prompt.formatIdentityLine(['身份A', '身份B']), EXPECTED_LINE);
  assert.ok(prompt.formatIdentityLine(['身份A']).startsWith('【主角身份·引擎账本】主角眼下持有的公开身份：身份A。本账以外'));
  assert.equal(numbers.GAME_NUMBERS.story.identity.prompt.maxItems, 3);
});

test('身份表为空时返回空串，buildScenarioStoryPrompt 输出与改前逐字相同', async () => {
  const { rules, prompt } = await loaded;
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  assert.deepEqual(rules.playerIdentityDefs(), [], '仓库身份表首版为空');
  assert.equal(prompt.formatLedgerPrompt(runtimeOf()), '');
  assert.equal(prompt.formatLedgerPrompt(runtimeOf({ doneIds: [ev('a')], identities: ledgerOf([record('A', ev('a'), 'revoked')]) }), { defs: [identity('A')] }), '');
  const save = await buildStorySave();
  const before = buildScenarioStoryPrompt(save);
  assert.ok(!before.includes('【主角身份·引擎账本】'));
  // 持有身份后只多出结论块和一个空行，其余逐字不变
  rules.setPlayerIdentityDefsForTest([identity('A')]);
  try {
    save.世界.状态.剧本模组.playerIdentities = ledgerOf([record('A', ev('a'))]);
    const after = buildScenarioStoryPrompt(save);
    const block = prompt.formatLedgerPrompt(save.世界.状态.剧本模组);
    assert.ok(block && after.includes(`${block}\n\n【声望与认知】`));
    assert.equal(after.replace(`${block}\n\n`, ''), before);
    // revoked 后整块消失，回到逐字相同
    save.世界.状态.剧本模组.playerIdentities = ledgerOf([record('A', ev('a'), 'revoked')]);
    assert.equal(buildScenarioStoryPrompt(save), before);
  } finally { rules.setPlayerIdentityDefsForTest(undefined); }
});

test('按 rank 降序再按入账先后，截到 maxItems', async () => {
  const { prompt } = await loaded;
  const defs = [identity('A', { rank: 1 }), identity('B', { rank: 5 }), identity('C'), identity('D', { rank: 5 }), identity('E', { rank: 1 })];
  // 入账先后：E、D、A、B（C 无 rank 排最后）
  const runtime = runtimeOf({
    doneIds: [ev('e'), ev('d'), ev('a'), ev('b'), ev('c')],
    identities: ledgerOf([record('A', ev('a')), record('B', ev('b')), record('C', ev('c')), record('D', ev('d')), record('E', ev('e'))]),
  });
  const line = (maxItems) => prompt.formatLedgerPrompt(runtime, { defs, rules: table(), maxItems });
  assert.ok(line(10).includes('公开身份：身份D、身份B、身份E、身份A、身份C（按位次，身份D最高）'), line(10));
  assert.ok(line(3).includes('公开身份：身份D、身份B、身份E（按位次，身份D最高）'), line(3));
  assert.ok(line(1).includes('公开身份：身份D。'), line(1));
  assert.ok(prompt.formatLedgerPrompt(runtime, { defs, rules: table() }).includes('身份D、身份B、身份E（'), '缺省读 story.identity.prompt.maxItems=3');
});

test('revoked 与 secret 不注入；只有 secret 时不出结论行', async () => {
  const { prompt } = await loaded;
  const defs = [identity('A', { rank: 1 }), identity('S', { rank: 9, secret: true }), identity('R', { rank: 9 })];
  const runtime = runtimeOf({ doneIds: [ev('a'), ev('s'), ev('r')], identities: ledgerOf([record('A', ev('a')), record('S', ev('s')), record('R', ev('r'), 'revoked')]) });
  const out = prompt.formatLedgerPrompt(runtime, { defs, rules: table() });
  assert.ok(out.includes('公开身份：身份A。'), out);
  assert.ok(!out.includes('身份S') && !out.includes('身份R'), out);
  const onlySecret = runtimeOf({ doneIds: [ev('s')], identities: ledgerOf([record('S', ev('s'))]) });
  assert.equal(prompt.formatLedgerPrompt(onlySecret, { defs, rules: table() }), '');
});

test('未登记身份跳过并记 SAV-028 一次', async () => {
  const { prompt, store } = await loaded;
  const unknown = idOf('ghost_once');
  const runtime = runtimeOf({ doneIds: [ev('a'), ev('g')], identities: { ...ledgerOf([record('A', ev('a'))]), [unknown]: { ...record('ghost_once', ev('g')) } } });
  const count = () => logged(store, 'unknown_identity').filter(e => e.detail?.identityId === unknown).length;
  const before = count();
  const outs = await quiet(() => [1, 2, 3].map(() => prompt.formatLedgerPrompt(runtime, { defs: [identity('A')], rules: table() })));
  for (const out of outs) assert.ok(out.includes('公开身份：身份A。') && !out.includes('ghost_once'), out);
  assert.equal(count() - before, 1, '同一 id 本会话只记一次');
  assert.equal(logged(store, 'unknown_identity').at(-1).level, 'warn');
});

test('期限 urgent/due 且 promptCue 已填时出征兆行，不含任何数字', async () => {
  const { prompt } = await loaded;
  const START = ev('start');
  const CLEAR = ev('clear');
  const rulesTable = (promptCue) => table({
    progressTicks: [{ eventId: ev('t1'), lineId: 'jin' }, { eventId: ev('t2'), lineId: 'song' }, { eventId: ev('t3'), lineId: 'han' }],
    progressDeadlines: [{ id: 'liuchao.deadline.test_cue', name: '测试期限', startEventIds: [START], clearEventIds: [CLEAR], ...(promptCue ? { promptCue } : {}) }],
  });
  const limits = { 'liuchao.deadline.test_cue': { due: 3, urgentAt: 2 } };
  const cue = { urgent: '城头哨骑比往日多了', due: '城门已闭，街上只剩巡兵' };
  const at = (doneIds, promptCue = cue, flags = {}) => prompt.formatLedgerPrompt(runtimeOf({ doneIds, flags }), { defs: [], rules: rulesTable(promptCue), limits });
  assert.equal(at([]), '', '未起算');
  assert.equal(at([START, ev('t1')]), '', 'running 不出');
  const urgent = at([START, ev('t1'), ev('t2')]);
  assert.equal(urgent, '【局势征兆】城头哨骑比往日多了（只借可见征兆演出，不写剩余期限，不预告后果。）');
  const due = at([START, ev('t1'), ev('t2'), ev('t3')]);
  assert.ok(due.includes('城门已闭') && !due.includes('哨骑'), due);
  for (const out of [urgent, due]) assert.doesNotMatch(out, /[0-9０-９]/, '不输出剩余数');
  assert.equal(at([START, ev('t1'), ev('t2')], { due: cue.due }), '', 'urgent 文字未填不出');
  assert.equal(at([START, ev('t1'), ev('t2')], null), '', 'promptCue 未填不出');
  assert.equal(at([START, ev('t1'), CLEAR]), '', 'cleared 不出');
  // 锁存优先：已锁存 cleared 的不再出征兆
  assert.equal(await quiet(() => at([START, ev('t1'), ev('t2'), ev('t3')], cue, { 'deadline.liuchao.deadline.test_cue.state': 'cleared' })), '');
  // 身份行在前、征兆行在后
  const both = prompt.formatLedgerPrompt(runtimeOf({ doneIds: [START, ev('t1'), ev('t2')], identities: ledgerOf([record('A', START)]) }), { defs: [identity('A')], rules: rulesTable(cue), limits });
  assert.deepEqual(both.split('\n').map(l => l.slice(0, 6)), ['【主角身份·', '【局势征兆】']);
});

test('生成抛错返回空串并记 SAV-028 build_failed', async () => {
  const { prompt, store } = await loaded;
  const before = new Set(logged(store, 'build_failed'));
  // 同消息同 detail 在 diagnostics.repeatMs 内只记第一条，这里两种坏账本各给不同的 modId
  for (const [bad, modId] of [[[], 'test.bad_array'], ['x', 'test.bad_string']]) {
    assert.equal(await quiet(() => prompt.formatLedgerPrompt({ ...runtimeOf(), modId, playerIdentities: bad }, { defs: [identity('A')], rules: table() })), '');
  }
  const getterThrows = runtimeOf({ doneIds: [ev('a')], identities: ledgerOf([record('A', ev('a'))]) });
  assert.equal(await quiet(() => prompt.formatLedgerPrompt(getterThrows, { defs: [identity('A')], rules: { get progressDeadlines() { throw new Error('boom'); } } })), '');
  const entries = logged(store, 'build_failed').filter(e => !before.has(e));
  assert.equal(entries.length, 3);
  assert.ok(entries.every(e => e.level === 'warn' && e.module === 'ledgerPrompt'));
  assert.deepEqual(entries.map(e => e.detail?.modId).sort(), [STAGE, 'test.bad_array', 'test.bad_string']);
});

test('七线全排列：身份结论行只取决于账本内容，与账本键序无关', async () => {
  const { prompt } = await loaded;
  const lines = ['nanhuang', 'jin', 'song', 'han', 'tang', 'qin', 'taiquan'];
  const defs = lines.map((line, i) => identity(line, { lineId: line, ...(i % 3 === 2 ? {} : { rank: i % 2 }) }));
  const doneIds = lines.map(line => ev(line));
  const records = lines.map(line => record(line, ev(line)));
  const expected = prompt.formatLedgerPrompt(runtimeOf({ doneIds, identities: ledgerOf(records) }), { defs, rules: table(), maxItems: 7 });
  assert.ok(expected.includes('公开身份：身份jin、身份han、身份nanhuang、身份tang、身份taiquan、身份song、身份qin（'), expected);
  const permute = (items) => items.length <= 1 ? [items] : items.flatMap((item, i) => permute([...items.slice(0, i), ...items.slice(i + 1)]).map(rest => [item, ...rest]));
  const orders = permute(records);
  assert.equal(orders.length, 5040);
  for (const order of orders) assert.equal(prompt.formatLedgerPrompt(runtimeOf({ doneIds, identities: ledgerOf(order) }), { defs, rules: table(), maxItems: 7 }), expected);
});
