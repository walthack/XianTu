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

test('cast guard rejects ambiguous underage ranges, but allows adult ranges and historical mentions', () => {
  for (const age of ['十五六岁', '十六七八岁', '十六七八', '不过十七八岁', '不到十八九岁', '十八九（未满）', '十八九岁（未满）', '17岁']) {
    assert.throws(() => m.validateModuleCastNarrative(`你看到一位${age}的路人。`, []), /年龄/, age);
  }
  for (const age of ['十八岁', '十八九岁', '二十八岁', '18岁', '28岁']) {
    assert.doesNotThrow(() => m.validateModuleCastNarrative(`你看到一位${age}的成年人。`, []), age);
  }
  for (const text of ['樨夫人说，白夷族长生前定下的商路条件还算数。', '樨夫人谈起已故的白夷族长。', '你记得白夷族长曾经站在这里。', '樨夫人解释白夷族长留下的规矩。']) {
    assert.doesNotThrow(() => m.validateModuleCastNarrative(text, ['白夷族长']), text);
  }
  for (const text of ['白夷族长走进屋来。', '已故的白夷族长又开口说道：“来吧。”', '段强跟在你身后。']) {
    assert.throws(() => m.validateModuleCastNarrative(text, ['白夷族长', '段强']), /在场/, text);
  }
  assert.throws(() => m.validateModuleCastNarrative('樨夫人一直在侧屋，并未现身。你见到了族长。', [], [], ['樨夫人', '易勇']), /缺席/);
  assert.doesNotThrow(() => m.validateModuleCastNarrative('樨夫人当面迎客。易勇端来茶水。', [], [], ['樨夫人', '易勇']));
});

test('guard rewrites can use a third attempt without publishing rejected drafts', async () => {
  const seen = [];
  const result = await m.attemptModuleNarrative(async n => {
    seen.push(n);
    if (n < 3) m.validateModuleCastNarrative('段强走进帐中。', ['段强']);
    return '你看清当前商队的来人。';
  }, { maxAttempts: 3, budgetLeft: () => null, isFatal: () => false });
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 3);
  assert.deepEqual(seen, [1, 2, 3]);
});

test('instruction echoes are rejected and local fallback never copies the compiled input', () => {
  const internal = '你<行动趋向>我搜查蛇彝长屋</行动趋向> 本地事件判定已预结算事件=lcq.event.s03b_snake_flower_bridge_02；动作=advance_declared_objective';
  for (const text of [internal, '你只管按本地合同，固定伤亡、补给、减员，不替玩家加 buff。']) {
    assert.throws(() => m.readModuleNarrative(text), m.ModuleNarrativeGuardError);
    const fallback = m.localModuleGuardNarrative(text, true);
    assert.doesNotMatch(fallback, /<行动趋向>|本地事件判定|advance_declared_objective|lcq\.event\.|本地合同|buff/);
  }
  assert.doesNotMatch(m.localModuleGuardNarrative('观察 · 搜查蛇彝长屋，查清尸体来源', true), /观察 ·|你搜查蛇彝长屋/);
  assert.match(m.localModuleGuardNarrative(undefined, true, '商队发现长屋中的惨案，决定焚屋撤离。'), /惨案.*焚屋撤离/);
});


test('transport failures stop after two calls while successful-body guard failures allow three', async () => {
  for (const guard of [false, true]) {
    let calls = 0;
    const result = await m.attemptModuleNarrative(async () => {
      calls++;
      throw guard ? new m.ModuleNarrativeGuardError('fixture rejected prose') : new Error('fixture transport failure');
    }, { maxAttempts: 3, maxAttemptsForError: error => error instanceof m.ModuleNarrativeGuardError ? 3 : 2, budgetLeft: () => null, isFatal: () => false });
    assert.equal(result.ok, false);
    assert.equal(calls, guard ? 3 : 2);
  }
});

test('Nanhuang canonical sequence and concealed parentage reject report errors without banning memories', () => {
  const stage = 'lcq.stage_04b_lingfei_baiyi_crisis';
  for (const text of ['你听云苍峰说：“鬼王峒既已平定，峒主一死，商路就通了。”', '你望着白夷战场。那是王哲兄以命换来的十里焦土。', '你看着小紫，她的轮廓与碧姬有几分神似，却更肖似传说中的岳帅。']) {
    assert.throws(() => m.validateNanhuangCanonNarrative(text, stage, '白夷族', []), /正典|身世/);
  }
  for (const text of ['你想起王哲兄以命换来的十里焦土。', '你听云苍峰说：“鬼王峒尚未平定，不能轻敌。”', '你见小紫眉眼灵动，笑起来带着天真的神情。']) {
    assert.doesNotThrow(() => m.validateNanhuangCanonNarrative(text, stage, '白夷族', []));
  }
  assert.doesNotThrow(() => m.validateNanhuangCanonNarrative('你听说鬼巫王已死。', 'lcq.stage_05b', '鬼王峒', ['lcq.event.ghost_king_swallowed']));
  for (const text of ['你走出海湾。阁罗一言不发地跟在后头。', '你抬头，孟老大站在船头。']) assert.throws(() => m.validateModuleCastNarrative(text, ['阁罗', '孟老大']), /在场/);
  assert.doesNotThrow(() => m.validateModuleCastNarrative('你想起阁罗一言不发地跟在后头的旧事。', ['阁罗']));
  assert.throws(() => m.readModuleNarrative('你听她说，不对，现在应该称呼另一位阿葭。'), /内部.*指令/);
});

test('all three reported fallback beats publish authored settled facts without UI verbs or author notes', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const [stage, id, expected] of [
    ['03b_snake_flower_bridge', 's03b_snake_flower_bridge_02', /惨案.*焚屋撤离/],
    ['03b_snake_flower_bridge', 's03b_snake_flower_bridge_07', /苏荔.*贡物.*新娘/],
    ['04', 's04_02', /凝羽受伤.*九名武士/],
  ]) {
    const mod = JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/lcq.stage_${stage}.json`, import.meta.url), 'utf8'));
    const event = mod.scenario.events.find(e => e.id === `lcq.event.${id}`);
    const text = m.localModuleGuardNarrative('观察 · 作者按钮', true, event.description);
    assert.match(text, expected);
    assert.doesNotMatch(text, /观察 ·|攻击 ·|主轴成形|眼前的事情告一段落|lcq\.event\.|预结算/);
  }
});


test('existing fixed beats show the spider before death and do not invent Wuerlang returning', async () => {
  const { fixedBeatNarrative } = await jiti.import('../src/modules/scenarioMods/fixedEndingNarratives.ts');
  const text = fixedBeatNarrative('lcq.event.s03b_yinzhu_xiongerpu', 'burn_yinzhu_victim');
  assert.match(text, /祁远.*陰蛛|祁远.*阴蛛/);
  assert.match(text, /武二郎.*阴蛛/);
  assert.doesNotMatch(text, /已经伏在阿葭身上|你赶过去时/);
  assert.doesNotMatch(fixedBeatNarrative('lcq.event.wuerlang_joins', 'secure_wuerlang_southbound'), /再见|走投无路|返回/);
});
