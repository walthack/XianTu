// 本批补接的错误码（LCQ-NAR-004、UI-008/009/010、SAV-004/005/046–051、CFG-007、NET-015）：
// 能在 node 里跑的函数直接触发失败分支，确认码落进日志（内存环形缓冲 + 持久层）；组件里跑不起来的，读源码确认该 catch / 失败分支调了
// logEvent 并带该码，再用 logEvent 确认码表收下并落盘。另测 errorSummary。
// 原预登记清单 pendingCodes.ts 里的 12 个码已在冻结文件解冻批接线，测试见 tests/errorCodeWiringFrozen.test.mjs。
// 函数体截取转译的做法同 tests/report69.test.mjs（只注入边界依赖，logEvent / summarizeError 用真实现）。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import axios from 'axios';
import { loadTs } from './loadTs.mjs';

if (!globalThis.localStorage || typeof globalThis.localStorage.getItem !== 'function') {
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key), clear: () => values.clear(),
  };
}

const log = await loadTs('../src/modules/diagnostics/log.ts');
const storeMod = await loadTs('../src/modules/diagnostics/store.ts');
const codes = await loadTs('../src/modules/diagnostics/codes.ts');
const summary = await loadTs('../src/modules/diagnostics/errorSummary.ts');

const src = rel => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const quiet = async fn => {
  const saved = {};
  for (const k of ['log', 'info', 'warn', 'debug', 'error']) { saved[k] = console[k]; console[k] = () => {}; }
  try { return await fn(); } finally { Object.assign(console, saved); }
};
/** 截 [start, end) 之间的函数源码，转成 JS 后用注入的依赖实例化，返回 name 指向的函数。 */
function harness(text, start, end, name, deps) {
  const from = text.indexOf(start);
  assert.ok(from >= 0, `找不到 ${start}`);
  const to = text.indexOf(end, from + start.length);
  assert.ok(to > from, `找不到 ${end}`);
  const js = ts.transpileModule(text.slice(from, to), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return new Function(...Object.keys(deps), `${js};return ${name};`)(...Object.values(deps));
}
const logDeps = { logEvent: log.logEvent, logEventOnce: log.logEventOnce, summarizeError: summary.summarizeError, summarizeList: summary.summarizeList, pickId: summary.pickId };

/** 每条用例前清日志状态；返回本用例里该码的日志条目。 */
async function capture(code, fn) {
  await log.resetLogState();
  await quiet(fn);
  return storeMod.logStore.recent(200).filter(entry => entry.code === code);
}
/** 码在码表内、条目落进持久层（经持久后端读回）。 */
async function assertPersisted(code, entries) {
  assert.ok(codes.isRegisteredCode(code), `${code} 应在码表内`);
  assert.ok(entries.length >= 1, `${code} 应写进日志`);
  for (const entry of entries) {
    assert.equal(entry.code, code, '码不应落到 LCQ-SYS-000');
    assert.equal(entry.module, codes.ERROR_CODES[code].module);
  }
  // node 里没有 IndexedDB：持久层是 localStorage 兜底缓存，直接读回后端里的记录
  await storeMod.logStore.flush();
  assert.equal(await storeMod.logStore.backendKind(), 'localStorage');
  const disk = JSON.parse(localStorage.getItem(storeMod.LOG_FALLBACK_KEY) || '[]');
  assert.ok(disk.some(entry => entry.code === code && entry.seq === entries[0].seq), `${code} 应已落盘`);
}
const assertErrorSummary = (error, message) => {
  assert.equal(typeof error.name, 'string');
  if (message !== undefined) assert.equal(error.message, message);
  assert.ok(!error.stack || !error.stack.includes('\n'), 'stack 只留第一行');
};

/** 读源码：失败分支标记 marker 之后（同一 catch 内，nearChars 字内）出现带该码的 logEvent。 */
function assertWired(file, marker, code, { nearChars = 400, fn = 'logEvent' } = {}) {
  const text = src(file);
  let at = text.indexOf(marker), hits = 0;
  assert.ok(at >= 0, `${file} 找不到失败分支：${marker}`);
  while (at >= 0) {
    const window = text.slice(at, at + nearChars);
    const call = window.match(new RegExp(`${fn}\\((?:'[^']*',\\s*)?\\{\\s*code:\\s*'${code}'`));
    assert.ok(call, `${file}「${marker}」之后应调用 ${fn} 记 ${code}`);
    assert.ok(/echo:\s*false/.test(window.slice(call.index, call.index + 300)), `${code} 不得另打控制台（echo:false）`);
    hits++;
    at = text.indexOf(marker, at + marker.length);
  }
  return hits;
}

// ───────────── errorSummary ─────────────

test('summarizeError：{name, message 截断 300 字, stack 第一行}，omitMessage 只留 name，永不抛错', () => {
  const err = new TypeError('x'.repeat(500));
  const s = summary.summarizeError(err);
  assert.equal(s.name, 'TypeError');
  assert.match(s.message, /^x{300}…（共500字）$/);
  assert.ok(s.stack && !s.stack.includes('\n') && s.stack.startsWith('TypeError'));
  assert.deepEqual(summary.summarizeError(new SyntaxError('Unexpected token {"apiKey":"abc"}'), { omitMessage: true }), { name: 'SyntaxError', message: '[已省略]' });
  assert.deepEqual(summary.summarizeError('plain'), { name: 'string', message: 'plain' });
  assert.equal(summary.summarizeError(Object.assign(new Error('e'), { code: 'AI_REQUEST_TIMEOUT' })).code, 'AI_REQUEST_TIMEOUT');
  const hostile = new Proxy({}, { has: () => { throw new Error('boom'); }, get: () => { throw new Error('boom'); } });
  assert.deepEqual(summary.summarizeError(hostile), { name: 'Unknown', message: '[无法读取异常]' });
  assert.deepEqual(summary.summarizeList(['a', { b: 1 }, 'c'], 2, 3), { total: 3, items: ['a', '{"b…（共7字）'] });
  assert.deepEqual(summary.summarizeList(hostile), { total: 0, items: [] });
  assert.equal(summary.pickId({ 名称: '东荒', id: '' }, 'id', '名称'), '东荒');
  assert.equal(summary.pickId(hostile, 'id'), undefined);
  assert.equal(summary.pickId(null, 'id'), undefined);
});

test('本批接线的码都在码表里，且不进玩家提示（本批只加日志）', () => {
  const wiredThisBatch = ['LCQ-NAR-004', 'LCQ-UI-008', 'LCQ-UI-009', 'LCQ-UI-010', 'LCQ-SAV-046', 'LCQ-SAV-047', 'LCQ-SAV-048', 'LCQ-SAV-049', 'LCQ-SAV-050', 'LCQ-CFG-007', 'LCQ-NET-015'];
  for (const code of wiredThisBatch) {
    assert.ok(codes.isRegisteredCode(code), code);
    assert.equal(codes.ERROR_CODES[code].toast, false, `${code} 不进玩家提示（本批只加日志）`);
  }
});

// ───────────── 真跑失败分支 ─────────────

test('LCQ-CFG-007：aiService.loadConfig 读到坏 JSON → 记码，异常信息不含配置原文；getAPIConfigForUsageType 取分配抛错 → 记码并返回 null', async () => {
  const { aiService } = await loadTs('../src/services/aiService.ts');
  const before = localStorage.getItem('ai_service_config');
  const configBefore = JSON.stringify(aiService.config);
  localStorage.setItem('ai_service_config', '{"customAPI":{"apiKey":"lcq-fake-secret-123"},');
  let entries;
  try { entries = await capture('LCQ-CFG-007', () => aiService.loadConfig()); } finally {
    if (before === null) localStorage.removeItem('ai_service_config'); else localStorage.setItem('ai_service_config', before);
  }
  assert.equal(JSON.stringify(aiService.config), configBefore, '读坏配置不改现有配置');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].detail.op, 'loadConfig');
  assert.deepEqual(entries[0].detail.error, { name: 'SyntaxError', message: '[已省略]' });
  assert.ok(!JSON.stringify(entries[0]).includes('lcq-fake-secret'), '日志不得含配置原文');
  await assertPersisted('LCQ-CFG-007', entries);

  // 测试环境没有活跃 Pinia：取 API 分配必抛错，走「使用默认配置」分支
  let result;
  const second = await capture('LCQ-CFG-007', () => { result = aiService.getAPIConfigForUsageType('main'); });
  assert.equal(result, null);
  assert.equal(second.length, 1);
  assert.equal(second[0].detail.op, 'getAPIForType');
  assert.equal(second[0].detail.usageType, 'main');
  assertErrorSummary(second[0].detail.error);
  await assertPersisted('LCQ-CFG-007', second);
});

test('LCQ-NET-015：OpenAI 兼容与 Claude 接口流式报「不支持流式」→ 记码后降级非流式，返回值不变；detail 不含密钥与消息体', async () => {
  const { aiService } = await loadTs('../src/services/aiService.ts');
  const originalPost = axios.post;
  const saved = { openai: aiService.streamingRequestOpenAI, claude: aiService.streamingRequestClaude };
  const unsupported = async () => { throw new Error('stream mode not supported by this endpoint'); };
  aiService.streamingRequestOpenAI = unsupported;
  aiService.streamingRequestClaude = unsupported;
  const messages = [{ role: 'system', content: '系统提示词全文-不应入日志' }, { role: 'user', content: '玩家原文-不应入日志' }];
  try {
    axios.post = async () => ({ data: { choices: [{ message: { content: '非流式正文' }, finish_reason: 'stop' }], usage: {} } });
    let openaiResult;
    const openai = await capture('LCQ-NET-015', async () => {
      openaiResult = await aiService.callOpenAICompatibleAPIOnce(messages, true, () => {}, undefined, 'main', undefined,
        { provider: 'openai', url: 'https://example.invalid', apiKey: 'sk-lcqfakekey000000000000', model: 'gpt-test', temperature: 0.2, maxTokens: 512 });
    });
    assert.equal(openaiResult, '非流式正文');
    assert.equal(openai.length, 1);
    assert.deepEqual({ provider: openai[0].detail.provider, model: openai[0].detail.model, usageType: openai[0].detail.usageType }, { provider: 'openai', model: 'gpt-test', usageType: 'main' });
    assertErrorSummary(openai[0].detail.error, 'stream mode not supported by this endpoint');
    await assertPersisted('LCQ-NET-015', openai);

    axios.post = async () => ({ data: { content: [{ type: 'text', text: 'Claude 正文' }], stop_reason: 'end_turn' } });
    let claudeResult;
    const claude = await capture('LCQ-NET-015', async () => {
      claudeResult = await aiService.callClaudeAPI(messages, true, () => {}, undefined, undefined,
        { provider: 'claude', url: 'https://example.invalid', apiKey: 'sk-lcqfakekey000000000000', model: 'claude-test', temperature: 0.2, maxTokens: 512 });
    });
    assert.equal(claudeResult, 'Claude 正文');
    assert.equal(claude.length, 1);
    assert.equal(claude[0].detail.provider, 'claude');
    await assertPersisted('LCQ-NET-015', claude);
    const text = JSON.stringify([...openai, ...claude]);
    for (const leaked of ['sk-lcqfakekey', '系统提示词全文', '玩家原文']) assert.ok(!text.includes(leaked), `日志不得含 ${leaked}`);
  } finally {
    axios.post = originalPost;
    aiService.streamingRequestOpenAI = saved.openai;
    aiService.streamingRequestClaude = saved.claude;
  }
});

test('LCQ-SAV-004：characterStore.deleteCharacter / deleteSave 删 IndexedDB 存档抛错 → 记码，toast 与后续删除照旧', async () => {
  const text = src('src/stores/characterStore.ts');
  const toasts = [];
  const toast = { warning: m => toasts.push(['warning', m]), success: m => toasts.push(['success', m]), error: m => toasts.push(['error', m]), info: m => toasts.push(['info', m]) };
  const debug = { log() {}, warn() {}, error() {} };
  const failing = async () => { throw new Error('idb delete denied'); };
  const rootState = { value: { 当前激活存档: null, 角色列表: { c1: { 角色: { 名字: '甲' }, 模式: '单机', 存档列表: { s1: { 存档名: 's1' }, s2: { 存档名: 's2' } } } } } };
  const deps = { ...logDeps, rootState, toast, debug, storage: { deleteAllSaveDataForCharacter: failing, deleteSaveData: failing }, commitMetadataToStorage: async () => {}, syncRootStateToCloud: async () => {}, useGameStateStore: () => ({ resetState() {} }), clearAllCharacterData: async () => {}, isTavernEnv: () => false };

  const deleteSave = harness(text, '  const deleteSave = async', '\n  const ', 'deleteSave', deps);
  const saveEntries = await capture('LCQ-SAV-004', () => deleteSave('c1', 's1'));
  assert.deepEqual(toasts, [['warning', '清理存档数据时出现错误'], ['success', '存档已删除']]);
  assert.deepEqual(Object.keys(rootState.value.角色列表.c1.存档列表), ['s2'], '删除照常继续');
  assert.equal(saveEntries.length, 1);
  assert.deepEqual({ ...saveEntries[0].detail, error: undefined }, { op: 'deleteSave', characterId: 'c1', slot: 's1', error: undefined });
  assertErrorSummary(saveEntries[0].detail.error, 'idb delete denied');
  await assertPersisted('LCQ-SAV-004', saveEntries);

  toasts.length = 0;
  const deleteCharacter = harness(text, '  const deleteCharacter = async', '\n  const ', 'deleteCharacter', deps);
  const charEntries = await capture('LCQ-SAV-004', () => deleteCharacter('c1'));
  assert.deepEqual(toasts, [['warning', '清理存档数据时出现错误，部分数据可能未删除'], ['success', '角色【甲】已从本地数据库删除。']]);
  assert.equal(rootState.value.角色列表.c1, undefined);
  assert.equal(charEntries.length, 1);
  assert.equal(charEntries[0].detail.op, 'deleteCharacter.cascadeSaveData');
  await assertPersisted('LCQ-SAV-004', charEntries);
});

test('LCQ-SAV-047 / LCQ-SAV-048：SavePanel.exportSaves 迁移抛错导出原档并记 047；导出抛错记 048，toast 文案不变', async () => {
  const text = src('src/components/dashboard/SavePanel.vue');
  const toasts = [];
  const toast = { warning: m => toasts.push(['warning', m]), success: m => toasts.push(['success', m]), error: m => toasts.push(['error', m]) };
  let bundled = null;
  const link = { click() {} };
  const deps = {
    ...logDeps, toast, debug: { error() {} },
    savesList: { value: [{ 存档名: '旧档' }] },
    characterStore: { rootState: { 当前激活存档: { 角色ID: 'c1' } }, activeCharacterProfile: { 角色: { 名字: '甲' } }, loadSaveData: async () => ({ 旧结构: true }) },
    isSaveDataV3: () => false,
    migrateSaveDataToLatest: () => { throw new Error('migrate boom'); },
    validateSaveDataV3: () => ({ isValid: true, errors: [] }),
    createDadBundle: (kind, payload) => { bundled = payload; return { kind, payload }; },
    Blob: class { constructor(parts) { this.parts = parts; } },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    document: { createElement: () => link, body: { appendChild() {}, removeChild() {} } },
    setTimeout: () => 0,
    getLocalDateString: () => '2026-11-01',
  };
  const exportSaves = harness(text, 'const exportSaves = async', '\n};\n', 'exportSaves', deps);
  const migrated = await capture('LCQ-SAV-047', () => exportSaves());
  assert.deepEqual(bundled.saves[0].存档数据, { 旧结构: true }, '迁移失败仍导出原始数据');
  assert.deepEqual(toasts, [['success', '已导出 1 个存档']]);
  assert.equal(migrated.length, 1);
  assert.deepEqual({ op: migrated[0].detail.op, slot: migrated[0].detail.slot }, { op: 'exportSaves', slot: '旧档' });
  assertErrorSummary(migrated[0].detail.error, 'migrate boom');
  await assertPersisted('LCQ-SAV-047', migrated);

  toasts.length = 0;
  const failing = harness(text, 'const exportSaves = async', '\n};\n', 'exportSaves', { ...deps, createDadBundle: () => { throw new Error('bundle boom'); } });
  const failed = await capture('LCQ-SAV-048', () => failing());
  assert.deepEqual(toasts, [['error', '导出存档失败: bundle boom']]);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].detail.op, 'exportSaves');
  assertErrorSummary(failed[0].detail.error, 'bundle boom');
  await assertPersisted('LCQ-SAV-048', failed);
});

test('LCQ-SAV-049：InventoryPanel.toggleEquip 装备抛错 → 记码（带物品 id），toast 与 equipBusy 复位不变', async () => {
  const text = src('src/components/dashboard/InventoryPanel.vue');
  const toasts = [];
  const equipBusy = { value: false };
  const deps = {
    ...logDeps, equipBusy, t: s => s, toast: { error: m => toasts.push(m) }, isEquipped: () => false,
    enhancedActionQueue: { equipItem: async () => { throw new Error('queue boom'); }, unequipItem: async () => {} },
  };
  const toggleEquip = harness(text, 'const toggleEquip = async', '\n}\n', 'toggleEquip', deps);
  const entries = await capture('LCQ-SAV-049', () => toggleEquip({ 类型: '装备', 物品ID: 'item_sword', 名称: '剑' }));
  assert.deepEqual(toasts, ['装备操作失败，请稍后重试']);
  assert.equal(equipBusy.value, false);
  assert.equal(entries.length, 1);
  assert.deepEqual({ op: entries[0].detail.op, itemId: entries[0].detail.itemId }, { op: 'toggleEquip', itemId: 'item_sword' });
  await assertPersisted('LCQ-SAV-049', entries);
});

test('LCQ-SAV-050：factors.randomLevelShift 读难度配置抛错 → 按 0 加级，本会话只记一次', async () => {
  const text = src('src/modules/sceneModule/host/factors.ts');
  const randomLevelShift = harness(text, 'function randomLevelShift', '\nexport function snapshotLevels', 'randomLevelShift', {
    ...logDeps, encounterConfig: () => { throw new Error('encounter config broken'); }, encounterPresetOf: () => 'normal',
  });
  const entries = await capture('LCQ-SAV-050', () => { assert.equal(randomLevelShift({}), 0); assert.equal(randomLevelShift({}), 0); });
  assert.equal(entries.length, 1, 'logEventOnce：每场开战都会走到，只记第一次');
  assertErrorSummary(entries[0].detail.error, 'encounter config broken');
  await assertPersisted('LCQ-SAV-050', entries);
});

test('LCQ-SAV-051：MainGamePanel.loadMemorySettings 读到坏 JSON → 记码，默认值不变', async () => {
  const text = src('src/components/dashboard/MainGamePanel.vue');
  const refs = { maxShortTermMemories: { value: 3 }, maxMidTermMemories: { value: 25 }, midTermKeepCount: { value: 8 } };
  const loadMemorySettings = harness(text, 'const loadMemorySettings = async', '\n};\n', 'loadMemorySettings', {
    ...logDeps, ...refs, localStorage: { getItem: () => '{not json' },
  });
  const entries = await capture('LCQ-SAV-051', () => loadMemorySettings());
  assert.deepEqual(Object.values(refs).map(r => r.value), [3, 25, 8]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].detail.where, 'MainGamePanel.loadMemorySettings');
  assert.equal(entries[0].detail.error.name, 'SyntaxError');
  await assertPersisted('LCQ-SAV-051', entries);
});

// ───────────── 跑不起来的组件 / 渲染器：源码断言 + 码表收下并落盘 ─────────────

const WIRED = [
  // [文件, 失败分支标记, 码, 期望出现次数]
  ['src/components/dashboard/MainGamePanel.vue', "console.warn('[上次对话] 备份失败（非致命）:', backupError);", 'LCQ-SAV-046', 1],
  ['src/components/dashboard/MainGamePanel.vue', "console.error('[AI交互] 处理失败:', error);", 'LCQ-UI-008', 1],
  ['src/components/dashboard/SavePanel.vue', "console.warn('[单个存档导出] 迁移失败，导出原始数据:', migrateError);", 'LCQ-SAV-047', 1],
  ['src/components/dashboard/SavePanel.vue', '迁移失败，使用原始数据:`, migrateError);', 'LCQ-SAV-047', 1],
  ['src/components/dashboard/SavePanel.vue', "console.error('[单个存档导出] 导出失败:', error);", 'LCQ-SAV-048', 1],
  ['src/components/dashboard/SavePanel.vue', "console.error('[角色导出] 导出失败:', error);", 'LCQ-SAV-048', 1],
  ['src/components/dashboard/GameMapPanel.vue', "console.error('[地图] 加载大陆失败:', continent, error);", 'LCQ-UI-009', 1],
  ['src/components/dashboard/GameMapPanel.vue', "console.error('[地图] 加载势力失败:', faction, error);", 'LCQ-UI-009', 1],
  ['src/components/dashboard/GameMapPanel.vue', "console.error('[地图] 加载地点失败:', location, error);", 'LCQ-UI-009', 1],
  ['src/components/dashboard/GameMapPanel.vue', "console.error('[地图] 加载数据失败:', error);", 'LCQ-UI-009', 1],
  ['src/utils/gameMapManager.ts', "console.error('[地图管理器] Pixi初始化失败，尝试降级方案:', error);", 'LCQ-UI-010', 1],
  ['src/utils/gameMapManager.ts', "console.warn('[地图] 世界地图背景加载失败', e);", 'LCQ-UI-010', 1],
  ['src/components/dashboard/InventoryPanel.vue', "console.warn('[背包面板] 货币系统规范化失败（将继续使用原数据）', e)", 'LCQ-SAV-049', 1],
  ['src/stores/characterStore.ts', "console.error('[存档迁移] ❌ 迁移过程异常:', e);", 'LCQ-SAV-005', 1],
];

for (const [file, marker, code, times] of WIRED) {
  test(`${code}：${file.split('/').pop()} 的失败分支「${marker.slice(0, 24)}…」调用 logEvent 记该码，码表收下并落盘`, async () => {
    assert.equal(assertWired(file, marker, code), times);
    const entries = await capture(code, () => log.logEvent({ code, echo: false, detail: { probe: true } }));
    await assertPersisted(code, entries);
  });
}

test('LCQ-NAR-004：MainGamePanel 响应结构校验失败的两个出口（保留输入 / 自动重试）各记一次，detail 带截断后的 validation.errors', async () => {
  const text = src('src/components/dashboard/MainGamePanel.vue');
  const from = text.indexOf("console.warn('[AI响应验证] 结构验证失败:', validation.errors);");
  const block = text.slice(from, text.indexOf('// 尝试重新生成', from));
  const calls = [...block.matchAll(/logEvent\(\{ code: 'LCQ-NAR-004', echo: false, detail: \{ errors: summarizeList\(validation\.errors\), willRetry: (true|false) \} \}\);/g)].map(m => m[1]);
  assert.deepEqual(calls, ['false', 'true']);
  assert.ok(block.indexOf("willRetry: false") < block.indexOf("noteTurnFailure('AI响应格式不正确，已保留你的输入，可手动重试。');"));
  assert.ok(block.indexOf("willRetry: true") < block.indexOf("toast.warning('AI响应格式不正确，正在重试...');"));
  const entries = await capture('LCQ-NAR-004', () => log.logEvent({ code: 'LCQ-NAR-004', echo: false, detail: { errors: summary.summarizeList(Array.from({ length: 12 }, (_, i) => `错误${i}`)), willRetry: true } }));
  assert.equal(entries[0].detail.errors.total, 12);
  assert.equal(entries[0].detail.errors.items.length, 8);
  await assertPersisted('LCQ-NAR-004', entries);
});

test('本批接线不另打控制台：echo:false 时 logEvent 不往控制台输出（toast=false 见上方码表用例）', async () => {
  const printed = [];
  const saved = { warn: console.warn, error: console.error };
  console.warn = (...a) => printed.push(a); console.error = (...a) => printed.push(a);
  try {
    await log.resetLogState();
    for (const code of ['LCQ-UI-008', 'LCQ-SAV-048', 'LCQ-NAR-004']) log.logEvent({ code, echo: false, cause: new Error('x') });
  } finally { Object.assign(console, saved); }
  assert.deepEqual(printed, []);
});
