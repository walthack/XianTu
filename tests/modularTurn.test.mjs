import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
const jiti = createJiti(import.meta.url, { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } });
const m = await jiti.import('../src/modules/scenarioMods/modularTurn.ts');
const store = new Map();
globalThis.localStorage = { getItem: key => store.get(key) || null };

test('demo modules are mandatory across the whole route; ordinary saves stay unchanged', () => {
  const save = { 系统: { 扩展: { 星月湖落地连续试玩: { kind: 'xingyuehu-landing-through-v1' } } }, 世界: { 状态: { 剧本模组: {} } } };
  assert.equal(m.isModularTurnEnabled(save), true);
  store.set(m.MODULE_TURN_SWITCH, 'true');
  assert.equal(m.isModularTurnEnabled(save), true);
  assert.equal(m.isModularTurnEnabled({}), false);
  save.世界.状态.剧本模组.completedEventIds = ['lcq.event.baihu_shangguan_escape'];
  assert.equal(m.isModularTurnEnabled(save), true);
  store.delete(m.MODULE_TURN_SWITCH);
});
test('module switch default follows MODULE_DEV_DEFAULTS: dev on, production off; an explicit choice always wins', () => {
  const save = { 系统: { 扩展: { 星月湖落地连续试玩: { kind: 'xingyuehu-landing-through-v1' } } }, 世界: { 状态: { 剧本模组: {} } } };
  try {
    globalThis.MODULE_DEV_DEFAULTS = false;
    assert.equal(m.readModuleTurnSwitch(), false);
    assert.equal(m.isModularTurnEnabled(save), true);
    globalThis.MODULE_DEV_DEFAULTS = true;
    assert.equal(m.readModuleTurnSwitch(), true);
    assert.equal(m.isModularTurnEnabled(save), true);
    assert.equal(m.isModularTurnEnabled({}), false);
    store.set(m.MODULE_TURN_SWITCH, 'false');
    assert.equal(m.isModularTurnEnabled(save), true);
    globalThis.MODULE_DEV_DEFAULTS = false;
    store.set(m.MODULE_TURN_SWITCH, 'true');
    assert.equal(m.isModularTurnEnabled(save), true);
  } finally {
    delete globalThis.MODULE_DEV_DEFAULTS;
    store.delete(m.MODULE_TURN_SWITCH);
  }
});
test('response adapter accepts prose or JSON and rejects unfinished thought and missing body', () => {
  assert.equal(m.readModuleNarrative('<think>hidden</think>你走近。'), '你走近。');
  assert.equal(m.readModuleNarrative('</think>你走近。'), '你走近。');
  assert.equal(m.readModuleNarrative('```json\n{"text":"你停下。","tavern_commands":[{"key":"x"}]}\n```'), '你停下。');
  assert.throws(() => m.readModuleNarrative('<minimax:think>hidden'));
  assert.throws(() => m.readModuleNarrative('{"mid_term_memory":"none"}'));
});

test('death bridges shorten long output or drop it without blocking the fixed ending', async () => {
  const { endingBridge } = await jiti.import('../src/modules/scenarioMods/fixedEndingNarratives.ts');
  assert.equal(endingBridge('你停下。风声变了。' + '远处的声音'.repeat(100) + '。'), '你停下。风声变了。');
  assert.equal(endingBridge('你' + '看'.repeat(300) + '。'), '');
  assert.equal(endingBridge('<think>hidden</think>{"text":"你说完话。她抬起手。第三句。"}'), '你说完话。她抬起手。');
  assert.equal(endingBridge('<think>unfinished'), '');
});

test('all four module policies stream with thinking disabled and no old ten-second deadline', async () => {
  const { GAME_MODEL_MODULES } = await jiti.import('../src/services/moduleModelRuntime.ts');
  for (const definition of GAME_MODEL_MODULES) {
    assert.equal(definition.policy.streaming, true, definition.id);
    assert.equal(definition.policy.reasoningEffort, 'none', definition.id);
    assert.equal(definition.policy.timeoutMode, 'content_idle', definition.id);
    assert.equal(definition.policy.timeoutMs, undefined, definition.id);
  }
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
  assert.equal(m.validateModuleSide('{"sentenceIds":[2,0]}',text,'memory'),'你提出交换。\n\n期限没有落定。');
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


test('a demo marker forces the module route even for a non-isolated profile', async () => {
  const { createPinia, setActivePinia } = await import('pinia');
  setActivePinia(createPinia());
  const isolatedJiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': fileURLToPath(new URL('../src', import.meta.url)), '@/stores/characterStore': fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts', import.meta.url)) } });
  const { AIBidirectionalSystem } = await isolatedJiti.import('../src/utils/AIBidirectionalSystem.ts');
  const { aiService } = await isolatedJiti.import('../src/services/aiService.ts');
  const { useAPIManagementStore } = await isolatedJiti.import('../src/stores/apiManagementStore.ts');
  const api = useAPIManagementStore(); const originalConfigs = [...api.apiConfigs];
  api.apiConfigs = [{ id: 'fixture-minimax', name: 'fixture', provider: 'custom', url: 'https://api.minimaxi.com/v1', apiKey: 'fixture-not-a-real-key', model: 'MiniMax-M3', enabled: true }];
  const { readFile } = await import('node:fs/promises');
  const { parseScenarioMod } = await isolatedJiti.import('../src/modules/scenarioMods/validator.ts');
  const { createQingyuOpeningPlaytestSave } = await isolatedJiti.import('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const save = createQingyuOpeningPlaytestSave(parseScenarioMod(JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_01.json', import.meta.url), 'utf8'))));
  const { resolveGameModuleRoute } = await isolatedJiti.import('../src/services/gameModelModules.ts');
  const { GAME_MODEL_MODULES } = await isolatedJiti.import('../src/services/moduleModelRuntime.ts');
  for (const definition of GAME_MODEL_MODULES) assert.equal(resolveGameModuleRoute(definition).config.model, 'MiniMax-M3', definition.id);
  store.set(m.MODULE_TURN_SWITCH, 'false');
  const original = aiService.generate;
  aiService.generate = async options => {
    assert.equal(options.apiConfigOverride.model, 'MiniMax-M3');
    assert.equal(options.should_stream, true);
    assert.equal(options.reasoningEffort, 'none');
    return '你停下来观察四周。';
  };
  try {
    const response = await AIBidirectionalSystem.tryModularTurn(save, undefined, 'profile-test', ()=>false, '继续');
    assert.equal(response.moduleReceipt.path, 'modular');
  } finally { aiService.generate = original; api.apiConfigs = originalConfigs; store.delete(m.MODULE_TURN_SWITCH); }
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


test('demo refuses legacy/fast/card paths before storing a receipt, even with the old switch off', () => {
  const save = { 系统: { 扩展: { 清羽记开局: { kind: 'qingyu-demo-v1' } } }, 世界: { 状态: { 剧本模组: { modId: 'lcq.stage_02' } } } };
  store.set(m.MODULE_TURN_SWITCH, 'false');
  assert.equal(m.isDemoModuleOnly(save), true);
  assert.equal(m.isModularTurnEnabled(save), true);
  for (const path of ['legacy', 'fast', 'card']) {
    assert.throws(() => m.assertDemoModulePath(save, path), /DEMO_LEGACY_BLOCKED/);
    assert.throws(() => m.appendModuleReceipt(save, { id: path, path, text: '' }), /DEMO_LEGACY_BLOCKED/);
  }
  assert.deepEqual(m.getModuleReceipts(save), []);
  m.appendModuleReceipt(save, { id: 'ok', path: 'modular', text: '正文' });
  assert.equal(m.getModuleReceipts(save).length, 1);
  store.delete(m.MODULE_TURN_SWITCH);
});


test('remaining on Wang Zhe battlefield is fatal only after nine suns and never confirms aftermath', async () => {
  const { previewWangZheStayEnding } = await jiti.import('../src/modules/scenarioMods/runtime.ts');
  const save = { 世界: { 状态: { 剧本模组: { flags: {}, activeEventIds: ['lcq.event.s02_02'],
    eventActionStates: { 'lcq.event.s02_02': { attempts: [{ actionId: 'witness_wang_zhe_nine_suns', outcome: 'success' }] } },
    events: [{ id: 'lcq.event.s02_02', fatalOutcomes: { deadline: { ending: { id: 'lcq.ending.death.wangzhe_blast' } } } }],
  } } } };
  assert.equal(previewWangZheStayEnding(save, '我不走，留在战场上看着王哲').id, 'lcq.ending.death.wangzhe_blast');
  for (const text of ['我不留下，带月霜离开', '如果我留下会怎样？', '他说“我不走”', '我离开战场后确认焦土余波']) assert.equal(previewWangZheStayEnding(save, text), undefined);
  save.世界.状态.剧本模组.eventActionStates['lcq.event.s02_02'].attempts = [];
  assert.equal(previewWangZheStayEnding(save, '我不走'), undefined);
});

test('unpunctuated 125 and 153 character drafts remain rejected', () => {
  for (const length of [125, 153]) assert.throws(() => m.readModuleNarrative('你' + '看'.repeat(length - 1) + '。'), /无标点长句/);
});
