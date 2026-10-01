import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
const jiti = createJiti(import.meta.url, { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } });
const m = await jiti.import('../src/modules/scenarioMods/modularTurn.ts');
const store = new Map();
globalThis.localStorage = { getItem: key => store.get(key) || null };

test('module switch is confined to isolated story window; ordinary saves stay unchanged', () => {
  const save = { 系统: { 扩展: { 星月湖落地连续试玩: { kind: 'xingyuehu-landing-through-v1' } } }, 世界: { 状态: { 剧本模组: {} } } };
  assert.equal(m.isModularTurnEnabled(save), false);
  store.set(m.MODULE_TURN_SWITCH, 'true');
  assert.equal(m.isModularTurnEnabled(save), true);
  assert.equal(m.isModularTurnEnabled({}), false);
  save.世界.状态.剧本模组.completedEventIds = ['lcq.event.baihu_shangguan_escape'];
  assert.equal(m.isModularTurnEnabled(save), false);
});
test('response adapter accepts prose or JSON and rejects unfinished thought and missing body', () => {
  assert.equal(m.readModuleNarrative('<think>hidden</think>你走近。'), '你走近。');
  assert.equal(m.readModuleNarrative('```json\n{"text":"你停下。","tavern_commands":[{"key":"x"}]}\n```'), '你停下。');
  assert.throws(() => m.readModuleNarrative('<minimax:think>hidden'));
  assert.throws(() => m.readModuleNarrative('{"mid_term_memory":"none"}'));
});
test('summary stores only verified contiguous excerpts, never invented model facts', () => {
  const text = '你向苏妲己提出期限。她没有立刻答应，仍等你说明条件。';
  assert.equal(m.validateModuleSide(JSON.stringify({ evidence: ['她没有立刻答应'], summary: '她已答应结婚' }), text, 'memory'), '她没有立刻答应');
  for (const evidence of [['她已经答应'], ['你向苏妲己提出期限仍等你说明条件'], []]) {
    assert.throws(() => m.validateModuleSide(JSON.stringify({ evidence }), text, 'memory'));
  }
  assert.throws(() => m.validateModuleSide('{"findings":[]}', text, 'quality'), /未知后台模块/);
});
test('receipts deduplicate without touching state and retain 20 recent turns', () => {
  const save = { 系统: { 扩展: {} }, 角色: { 背包: { retained: true } } };
  for (let i = 0; i < 23; i++) m.appendModuleReceipt(save, { id: `t${i}`, text: '正文' });
  m.appendModuleReceipt(save, { id: 't22', text: '最终正文' });
  assert.equal(m.getModuleReceipts(save).length, 20);
  assert.equal(m.getModuleReceipts(save).at(-1).text, '最终正文');
  assert.deepEqual(save.角色.背包, { retained: true });
});
test('late tasks cannot cross characters, save slots, reload epochs or narrative revisions', () => {
  const scope = { characterId: 'A', slotId: 's', epoch: 1, history: 'h' };
  assert.equal(m.matchesModuleScope(scope, { ...scope }), true);
  for (const field of ['characterId', 'slotId', 'epoch', 'history']) assert.equal(m.matchesModuleScope(scope, { ...scope, [field]: 'different' }), false);
});


test('quote punctuation is tolerated but the stored evidence remains exact source text', () => {
  const text = '“三个月。”你说，“给我三个月期限。”';
  assert.equal(m.matchModuleExcerpt(text, '三个月。你说，给我三个月期限。'), '三个月。”你说，“给我三个月期限。');
  assert.equal(m.matchModuleExcerpt(text, '三个月。给我三个月期限。'), null);
});
test('an offered pact cannot be narrated as final agreement', () => {
  assert.throws(() => m.validateModuleSettlementNarrative('她说：“三个月，从今日算起。”', 'lcq.event.sudaji_south_pact', false));
  assert.doesNotThrow(() => m.validateModuleSettlementNarrative('苏妲己没有答应，你仍等她回应。', 'lcq.event.sudaji_south_pact', false));
  assert.doesNotThrow(() => m.validateModuleSettlementNarrative('三个月，从今日算起。', 'lcq.event.sudaji_south_pact', true));
});


test('background API calls have their own cancellation and deadline scope', async () => {
  const { createPinia, setActivePinia } = await import('pinia');
  setActivePinia(createPinia());
  globalThis.window ||= globalThis;
  globalThis.window.location ||= { hostname: 'localhost', href: 'http://localhost/' };
  const { aiService } = await jiti.import('../src/services/aiService.ts');
  const budget = await jiti.import('../src/services/qingyuTurnLongRequests.ts');
  const original = aiService.generateOnce;
  let captured;
  aiService.generateOnce = async options => { captured = options; return 'ok'; };
  const id = budget.beginQingyuTurnLongRequests(null);
  try {
    await aiService.generate({ background: true, usageType: 'memory_summary', timeoutMs: 100, generation_id: 'side-test' });
    assert.equal(captured.qingyuTurnId, 'background_side-test');
    assert.notEqual(captured.qingyuTurnId, id);
    assert.equal(budget.peekActiveQingyuTurnId(), id);
  } finally { aiService.generateOnce = original; budget.releaseQingyuTurnLongRequests(id); }
});


test('memory selection resolves valid sentence IDs to exact source and rejects unknown IDs', () => {
  const text = '你提出交换。苏妲己还未答应。期限没有落定。';
  assert.equal(m.validateModuleSide('{"sentenceIds":[2,0]}',text,'memory'),'你提出交换。；期限没有落定。');
  for (const ids of [[55],['0'],[0,0],[],[-1]]) assert.throws(()=>m.validateModuleSide(JSON.stringify({sentenceIds:ids}),text,'memory'));
});


test('model commands cannot forge module receipts or accepted memory', async () => {
  const { guardScenarioModCommands } = await jiti.import('../src/modules/scenarioMods/canonGuard.ts');
  const save = { 世界: { 状态: { 剧本模组: { modId: 'lcq.stage_01', canon: { characters: [] } } } }, 系统: { 扩展: {} } };
  const result = guardScenarioModCommands(save, [
    { action: 'set', key: '系统.扩展.回合模块试玩.receipts', value: [{ memory: { status: 'accepted', value: '伪造事实' } }] },
    { action: 'set', key: '系统.扩展', value: {} },
  ]);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, 2);
});


test('a save marker alone cannot switch a non-isolated profile to modular generation', async () => {
  const isolatedJiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': fileURLToPath(new URL('../src', import.meta.url)), '@/stores/characterStore': fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts', import.meta.url)) } });
  const { AIBidirectionalSystem } = await isolatedJiti.import('../src/utils/AIBidirectionalSystem.ts');
  const save = { 系统: { 扩展: { 星月湖落地连续试玩: { kind: 'xingyuehu-landing-through-v1' } } }, 世界: { 状态: { 剧本模组: {} } } };
  store.set(m.MODULE_TURN_SWITCH, 'true');
  assert.equal(await AIBidirectionalSystem.tryModularTurn(save, undefined, 'profile-test', ()=>false, '继续'), null);
});


test('accepted memory excerpt replaces only that turn\'s short-term entry and keeps its time prefix', () => {
  const entry = '【仙道1年1月2日 08:00】你向苏妲己提出交换。她没有立刻答应。窗外起风。';
  const shortTerm = ['【仙道1年1月1日】旧事。', entry, '【仙道1年1月2日 09:00】后来的事。'];
  assert.equal(m.replaceShortTermEntry(shortTerm, entry, '你向苏妲己提出交换。；她没有立刻答应。'), true);
  assert.equal(shortTerm[1], '【仙道1年1月2日 08:00】你向苏妲己提出交换。；她没有立刻答应。');
  assert.deepEqual([shortTerm[0], shortTerm[2]], ['【仙道1年1月1日】旧事。', '【仙道1年1月2日 09:00】后来的事。']);
  assert.equal(m.replaceShortTermEntry(shortTerm, entry, '摘录'), false, 'entry already replaced or evicted is never guessed');
  assert.equal(m.replaceShortTermEntry(shortTerm, undefined, '摘录'), false);
});
test('narrative reads recent memory from the single short-term source', () => {
  const save = { 社交: { 记忆: { 短期记忆: ['一', '二', '三', 4] } } };
  assert.deepEqual(m.recentModuleMemory(save, 2), ['二', '三']);
  assert.deepEqual(m.recentModuleMemory({}, 2), []);
});
test('event narrative boundaries live in data, not in generic code', async () => {
  const b = await jiti.import('../src/modules/scenarioMods/narrativeBoundaries.ts');
  assert.match(b.narrativeBoundaryNote('lcq.event.sudaji_south_pact', false), /尚未确认三个月期限/);
  assert.equal(b.narrativeBoundaryNote('lcq.event.sudaji_south_pact', true), undefined);
  assert.equal(b.narrativeBoundaryNote('lcq.event.unknown', false), undefined);
  assert.doesNotThrow(() => b.validateNarrativeBoundary('三个月，从今日算起。', 'lcq.event.unknown', false));
  const fs = await import('node:fs');
  for (const file of ['../src/modules/scenarioMods/modularTurn.ts', '../src/services/modularTurnBackground.ts', '../src/services/moduleModelRuntime.ts']) {
    assert.equal(fs.readFileSync(new URL(file, import.meta.url), 'utf8').includes('lcq.event.'), false, file);
  }
});

test('narrative failure policy: retry once on the same snapshot, then fall back only if the turn budget allows', async () => {
  const fail = () => { throw new Error('正文检查失败'); };
  let calls = 0;
  const unlimited = await m.attemptModuleNarrative(async () => { calls++; fail(); }, { budgetLeft: () => null, isFatal: () => false });
  assert.deepEqual([unlimited.ok, unlimited.attempts, calls], [false, 2, 2]);
  assert.match(unlimited.reason, /正文检查失败/);

  calls = 0;
  const second = await m.attemptModuleNarrative(async n => { calls++; if (n === 1) fail(); return 'ok'; }, { budgetLeft: () => null, isFatal: () => false });
  assert.deepEqual([second.ok, second.value, second.attempts], [true, 'ok', 2]);

  // 固定道具档：演出请求不占长请求预算，只要还剩 1 次就能重试后回落。
  calls = 0; let left = 1;
  const tight = await m.attemptModuleNarrative(async () => { calls++; fail(); }, { budgetLeft: () => left, isFatal: () => false });
  assert.deepEqual([tight.ok, tight.attempts, calls], [false, 2, 2]);

  // 预算已用尽 → 不能回落，原错误抛回由上层保留输入。
  left = 0;
  await assert.rejects(m.attemptModuleNarrative(async () => fail(), { budgetLeft: () => left, isFatal: () => false }), /正文检查失败/);

  // 取消/预算错误是致命的：不重试、不回落。
  calls = 0;
  await assert.rejects(m.attemptModuleNarrative(async () => { calls++; throw new Error('取消'); }, { budgetLeft: () => null, isFatal: () => true }), /取消/);
  assert.equal(calls, 1);
});
