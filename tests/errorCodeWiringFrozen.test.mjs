// 冻结文件小范围解冻（2026-11-01 19:38 用户批准）补接的错误码：AIBS 的 NET-014 / NAR-005~008 / SAV-041 / 042 / 045 / 051 / 052，
// runtime.ts 的 SAV-043 / 044。只加日志、不改行为。
// 能在 node 里跑的直接触发失败分支（回合管线、optimizeText、runtime 账目函数），确认码落进日志并落盘、返回值照旧；
// 跑不起来的读源码确认该 catch 内调了带该码的 logEvent（echo:false），再用 logEvent 确认码表收下并落盘。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: {
    '@': fileURLToPath(new URL('../src', import.meta.url)),
    '@/stores/characterStore': fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts', import.meta.url)),
  },
});
const load = rel => jiti.import(new URL(rel, import.meta.url).pathname);

if (!globalThis.localStorage || typeof globalThis.localStorage.getItem !== 'function') {
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key), clear: () => values.clear(),
  };
}
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
if (!globalThis.window.location) globalThis.window.location = { hostname: 'localhost', href: 'http://localhost/' };

const log = await load('../src/modules/diagnostics/log.ts');
const storeMod = await load('../src/modules/diagnostics/store.ts');
const codes = await load('../src/modules/diagnostics/codes.ts');
const summary = await load('../src/modules/diagnostics/errorSummary.ts');

const AIBS_FILE = 'src/utils/AIBidirectionalSystem.ts';
const RUNTIME_FILE = 'src/modules/scenarioMods/runtime.ts';
const src = rel => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const FAKE_KEY = 'fixture-not-a-real-key-lcq';
const PROFILE = { 模式: '单机', 角色: { 名字: '甲', 性别: '男' }, 存档列表: {} };
const PLAYER_LINE = '我四处看看-玩家原文';

const quiet = async fn => {
  const saved = {};
  for (const k of ['log', 'info', 'warn', 'debug', 'error']) { saved[k] = console[k]; console[k] = () => {}; }
  try { return await fn(); } finally { Object.assign(console, saved); }
};
async function capture(fn) {
  await log.resetLogState();
  await quiet(fn);
  return storeMod.logStore.recent(500).reverse(); // recent() 新的在前，这里按发生顺序
}
const ofCode = (entries, code) => entries.filter(entry => entry.code === code);
async function assertPersisted(code, entries) {
  assert.ok(codes.isRegisteredCode(code), `${code} 应在码表内`);
  assert.ok(entries.length >= 1, `${code} 应写进日志`);
  for (const entry of entries) {
    assert.equal(entry.code, code, '码不应落到 LCQ-SYS-000');
    assert.equal(entry.module, codes.ERROR_CODES[code].module);
  }
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
const assertNoLeak = entries => {
  const text = JSON.stringify(entries);
  for (const leaked of [FAKE_KEY, PLAYER_LINE]) assert.ok(!text.includes(leaked), `日志不得含 ${leaked}`);
};

/** 截 [start, end) 之间的函数源码，转成 JS 后用注入的依赖实例化（同 tests/errorCodeWiringLcq.test.mjs）。 */
function harness(text, start, end, name, deps) {
  const from = text.indexOf(start);
  assert.ok(from >= 0, `找不到 ${start}`);
  const to = text.indexOf(end, from + start.length);
  assert.ok(to > from, `找不到 ${end}`);
  const js = ts.transpileModule(text.slice(from, to), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return new Function(...Object.keys(deps), `${js};return ${name};`)(...Object.values(deps));
}
const logDeps = { logEvent: log.logEvent, logEventOnce: log.logEventOnce, summarizeError: summary.summarizeError, pickId: summary.pickId };

/** 读源码：标记行之后 nearChars 字内出现带该码的 logEvent，且带 echo:false；detailPattern 校验 detail 定位字段。 */
function assertWired(file, marker, code, { nearChars = 400, fn = 'logEvent', detail } = {}) {
  const text = src(file);
  const at = text.indexOf(marker);
  assert.ok(at >= 0, `${file} 找不到失败分支：${marker}`);
  assert.equal(text.indexOf(marker, at + marker.length), -1, `标记应唯一：${marker}`);
  const window = text.slice(at, at + nearChars);
  const call = window.match(new RegExp(`${fn}\\((?:'[^']*',\\s*)?\\{\\s*code:\\s*'${code}'[^\\n]*`));
  assert.ok(call, `${file}「${marker}」之后应调用 ${fn} 记 ${code}`);
  assert.match(call[0], /echo:\s*false/, `${code} 不得另打控制台（echo:false）`);
  assert.match(call[0], /summarizeError\(/, `${code} 的 detail.error 用 summarizeError 摘要`);
  if (detail) assert.match(call[0], detail);
  // 只能在 catch 里：标记到调用之间不得出现闭合 catch 的 `}`（同一块内）
  assert.ok(!/\n\s*\}/.test(window.slice(0, call.index)), `${code} 的 logEvent 应紧跟在 catch 的标记行内`);
}

// ───────────── 码表与清单 ─────────────

const BATCH = ['LCQ-NET-014', 'LCQ-NAR-005', 'LCQ-NAR-006', 'LCQ-NAR-007', 'LCQ-NAR-008', 'LCQ-SAV-041', 'LCQ-SAV-042', 'LCQ-SAV-043', 'LCQ-SAV-044', 'LCQ-SAV-045', 'LCQ-SAV-051', 'LCQ-SAV-052'];

test('本批 12 个码都在码表内、不进玩家提示，并已在冻结文件里接线（预登记清单 pendingCodes.ts 已删）', () => {
  const aibs = src(AIBS_FILE), runtime = src(RUNTIME_FILE);
  for (const code of BATCH) {
    assert.ok(codes.isRegisteredCode(code), code);
    assert.equal(codes.ERROR_CODES[code].toast, false, `${code} 不进玩家提示（本批只加日志）`);
    assert.ok(aibs.includes(`code: '${code}'`) || runtime.includes(`code: '${code}'`), `${code} 应已接线`);
  }
  assert.throws(() => readFileSync(new URL('../src/modules/diagnostics/pendingCodes.ts', import.meta.url)), /ENOENT/);
  assert.match(aibs, /^import \{ logEvent \} from '@\/modules\/diagnostics\/log';$/m);
  assert.match(runtime, /^import \{ logEvent, logEventOnce \} from '\.\.\/diagnostics\/log';$/m);
});

// ───────────── 真跑：回合管线 ─────────────

async function pipeline() {
  setActivePinia(createPinia());
  const { AIBidirectionalSystem } = await load('../src/utils/AIBidirectionalSystem.ts');
  const { useGameStateStore } = await load('../src/stores/gameStateStore.ts');
  const { aiService } = await load('../src/services/aiService.ts');
  const { useAPIManagementStore } = await load('../src/stores/apiManagementStore.ts');
  const { createMinimalSaveDataV3 } = await load('../src/utils/dataRepair.ts');
  const api = useAPIManagementStore();
  api.apiConfigs = [{ id: 'fixture', name: 'fixture', provider: 'custom', url: 'https://example.invalid/v1', apiKey: FAKE_KEY, model: 'fixture-model', enabled: true }];
  api.assignAPI('main', 'fixture');
  const saved = { check: aiService.checkAvailability, generate: aiService.generate, generateRaw: aiService.generateRaw };
  aiService.checkAvailability = () => ({ available: true, message: 'test-stub' });
  const restore = () => Object.assign(aiService, { checkAvailability: saved.check, generate: saved.generate, generateRaw: saved.generateRaw });
  const run = () => {
    useGameStateStore().loadFromSaveData(createMinimalSaveDataV3());
    return AIBidirectionalSystem.processPlayerAction(PLAYER_LINE, PROFILE, { shouldAbort: () => false });
  };
  return { AIBidirectionalSystem, aiService, api, run, restore };
}

test('LCQ-NET-014：回合主生成抛错 → 返回「（AI生成失败）」占位不变，记码带 error 摘要与兜底判定，不含密钥与玩家原文', async () => {
  const p = await pipeline();
  p.aiService.generate = async () => { throw new Error('upstream 502 boom'); };
  p.aiService.generateRaw = async () => { throw new Error('must not call generateRaw'); };
  let response, entries;
  try { entries = await capture(async () => { response = await p.run(); }); } finally { p.restore(); }
  assert.deepEqual(response, { text: '（AI生成失败）', mid_term_memory: '', tavern_commands: [], action_options: ['重试当前操作', '查看自身状态', '稍作休息'], outputTruncated: false });
  const hits = ofCode(entries, 'LCQ-NET-014');
  assert.equal(hits.length, 1);
  assert.deepEqual({ ...hits[0].detail, error: undefined }, { error: undefined, truncated: false, terminal: false, settledLocally: false, moduleOnly: false });
  assertErrorSummary(hits[0].detail.error, 'upstream 502 boom');
  assert.equal(hits[0].detail.error.stack, 'Error: upstream 502 boom');
  assertNoLeak(hits);
  await assertPersisted('LCQ-NET-014', hits);
});

test('LCQ-NAR-005 / LCQ-SAV-051 / LCQ-SAV-045：坏 JSON 响应走容错提取、坏记忆配置用默认值、读指令应用模式抛错按 best_effort——各记码，正文照旧', async () => {
  const p = await pipeline();
  p.aiService.generate = async () => '{"text": "你环顾四周", "mid_term_memory": ';
  p.aiService.generateRaw = async () => { throw new Error('must not call generateRaw'); };
  const originalGetItem = localStorage.getItem;
  localStorage.setItem('memory-settings', '{bad json');
  localStorage.getItem = function (key) {
    if (key === 'command-apply-mode') throw new Error('storage denied');
    return originalGetItem.call(this, key);
  };
  let response, entries;
  try { entries = await capture(async () => { response = await p.run(); }); } finally {
    p.restore();
    localStorage.getItem = originalGetItem;
    localStorage.removeItem('memory-settings');
  }
  assert.equal(response.text, '你环顾四周', '容错提取的正文不变');
  assert.equal(response.generationError, undefined);

  const parse = ofCode(entries, 'LCQ-NAR-005');
  assert.equal(parse.length, 1);
  assertErrorSummary(parse[0].detail.error);
  assert.deepEqual(Object.keys(parse[0].detail), ['error']);
  await assertPersisted('LCQ-NAR-005', parse);

  const memory = ofCode(entries, 'LCQ-SAV-051');
  assert.deepEqual(memory.map(entry => entry.detail.where).sort(), ['AIBidirectionalSystem.autoSummaryThreshold', 'AIBidirectionalSystem.shortTermLimit']);
  for (const entry of memory) assert.equal(entry.detail.error.name, 'SyntaxError');
  await assertPersisted('LCQ-SAV-051', memory);

  const applyMode = ofCode(entries, 'LCQ-SAV-045').filter(entry => entry.detail.stage === 'commandApplyMode');
  assert.equal(applyMode.length, 1);
  assertErrorSummary(applyMode[0].detail.error, 'storage denied');
  await assertPersisted('LCQ-SAV-045', applyMode);
  assertNoLeak([...parse, ...memory, ...applyMode]);
});

test('LCQ-NAR-008：optimizeText 优化请求抛错 → 返回原文不变并记码', async () => {
  const p = await pipeline();
  p.api.assignAPI('text_optimization', 'fixture');
  p.api.setFunctionEnabled('text_optimization', true);
  p.aiService.generateRaw = async () => { throw new Error('optimize boom'); };
  let result, entries;
  try { entries = await capture(async () => { result = await p.AIBidirectionalSystem.optimizeText('原文-不应入日志'); }); } finally {
    p.restore();
    p.api.setFunctionEnabled('text_optimization', false);
  }
  assert.equal(result, '原文-不应入日志');
  const hits = ofCode(entries, 'LCQ-NAR-008');
  assert.equal(hits.length, 1);
  assertErrorSummary(hits[0].detail.error, 'optimize boom');
  assert.ok(!JSON.stringify(hits).includes('原文-不应入日志'));
  await assertPersisted('LCQ-NAR-008', hits);
});

// ───────────── 真跑：runtime.ts 账目函数（截函数体转译，注入边界依赖） ─────────────

const throwing = (message, extra = {}) => new Proxy(extra, {
  get(target, key) { if (key in target) return target[key]; throw new Error(message); },
});

test('LCQ-SAV-043：事件声望 / 共历好感结算抛错 → 记码（kind 区分），返回空的发放清单', async () => {
  const text = src(RUNTIME_FILE);
  const deps = { ...logDeps, REPUTATION_EVENT_GRANT: {}, clampAffinity: x => x, writableFreeActionState: () => ({ affinityTurn: {} }) };
  const settleEventReputation = harness(text, 'function settleEventReputation(', '\nfunction settleSharedExperienceAffinity(', 'settleEventReputation', deps);
  const settleSharedExperienceAffinity = harness(text, 'function settleSharedExperienceAffinity(', '\n/** ', 'settleSharedExperienceAffinity', deps);
  let reputation, affinity;
  const entries = await capture(() => {
    reputation = settleEventReputation({ 角色: { 属性: {} } }, throwing('reputation ledger broken'));
    affinity = settleSharedExperienceAffinity({ 社交: { 关系: {} } }, throwing('affinity ledger broken'));
  });
  assert.deepEqual(reputation, []);
  assert.deepEqual(affinity, []);
  const hits = ofCode(entries, 'LCQ-SAV-043');
  assert.deepEqual(hits.map(entry => [entry.detail.kind, entry.detail.error.message]), [['reputation', 'reputation ledger broken'], ['affinity', 'affinity ledger broken']]);
  hits.forEach(entry => assertErrorSummary(entry.detail.error));
  await assertPersisted('LCQ-SAV-043', hits);
});

test('LCQ-SAV-044：相识账本 / 关系姿态 / registry 对齐 / 对齐依赖加载失败 → 各记码（detail.item 标明哪一项），行为不变', async () => {
  const text = src(RUNTIME_FILE);
  const updateAcquaintanceLedger = harness(text, 'function updateAcquaintanceLedger(', '\n/**', 'updateAcquaintanceLedger', logDeps);
  const updateStanceStates = harness(text, 'function updateStanceStates(', '\n/**', 'updateStanceStates', {
    ...logDeps, gameDayOf: () => 1, projectStance: () => { throw new Error('stance broken'); },
  });
  const getReconcileDeps = harness(text, 'function getReconcileDeps(', '\n/**', 'getReconcileDeps', {
    ...logDeps, require: () => { throw new Error('require is webpack-only'); },
  });
  const reconcileSaveWithRegistry = harness(text, 'function reconcileSaveWithRegistry(', '\n// ', 'reconcileSaveWithRegistry', {
    ...logDeps, getReconcileDeps: () => ({ version: 'v2', mods: [], resolve: () => { throw new Error('registry broken'); } }), readPath: () => undefined,
  });
  const runtime = { reconciledRegistryVersion: 'v1' };
  let deps;
  const entries = await capture(() => {
    updateAcquaintanceLedger({}, { canon: throwing('ledger broken') });
    updateStanceStates({ 社交: { 关系: { 甲: { 名字: '甲', 好感度: 10 } } } }, {});
    deps = [getReconcileDeps(), getReconcileDeps()];
    reconcileSaveWithRegistry({}, runtime);
  });
  assert.deepEqual(deps, [null, null], '依赖加载失败仍按 no-op 返回 null');
  assert.equal(runtime.reconciledRegistryVersion, 'v2', '对齐失败后照旧盖版本戳');
  const hits = ofCode(entries, 'LCQ-SAV-044');
  assert.deepEqual(hits.map(entry => [entry.detail.item, entry.detail.error.message]), [
    ['metLedger', 'ledger broken'], ['stanceStates', 'stance broken'], ['reconcileDeps', 'require is webpack-only'], ['registryReconcile', 'registry broken'],
  ], 'reconcileDeps 用 logEventOnce，两次加载失败只记一次');
  hits.forEach(entry => assertErrorSummary(entry.detail.error));
  await assertPersisted('LCQ-SAV-044', hits);
});

// ───────────── 跑不起来的分支：源码断言 + 码表收下并落盘 ─────────────

const WIRED = [
  // [失败分支标记（catch 内首行，文件内唯一）, 码, detail 定位字段]
  ["console.warn(`[分步生成] 第2步第${attempt}次失败:`, e);", 'LCQ-NAR-006', /detail: \{ attempt, error/],
  ["console.error('[AI双向系统] 初始消息解析失败，尝试容错处理:', parseError);", 'LCQ-NAR-007', /stage: 'parse'/],
  ["} catch (error) { /* 忽略 */", 'LCQ-NAR-007', /stage: 'actionOptions'/],
  ["console.error(`[AI双向系统] 指令执行失败:`, command, error);", 'LCQ-SAV-041', /key: pickId\(command, 'key'\), action: pickId\(command, 'action'\)/],
  ["console.error('[AI双向系统] 指令执行失败:', error);", 'LCQ-SAV-042', /playerAgencyViolation: error instanceof PlayerAgencyViolationError/],
  ["} catch (error) { /* 没有活跃存档/本地存储时不跨槽取审计。 */", 'LCQ-SAV-045', /stage: 'readAuditLog'/],
  ["console.warn('[进度审计] 跳过（异常）:', error);", 'LCQ-SAV-045', /stage: 'progressAudit'/],
  ["console.warn('[事件对账] 跳过（异常）:', error);", 'LCQ-SAV-045', /stage: 'eventReconcile'/],
  ["console.warn('[事件对账] 后台任务失败，主事务不受影响:', error);", 'LCQ-SAV-045', /stage: 'eventReconcileBackground'/],
  ["console.warn('[世界事件] 调度/生成失败:', e);", 'LCQ-SAV-052', /stage: 'worldEvents', error: summarizeError\(e\)/],
  ["console.warn('[AI双向系统] 自动初始化宗门系统失败（非致命）:', e);", 'LCQ-SAV-052', /stage: 'sectAutoInit', error: summarizeError\(e\)/],
  ["console.warn('[后台记忆] 调度失败（不影响回合）:', error);", 'LCQ-SAV-052', /stage: 'backgroundMemory'/],
  ["console.warn('[长期检索] 添加到检索索引失败:', e);", 'LCQ-SAV-052', /stage: 'vectorIndex', error: summarizeError\(e\)/],
];

for (const [marker, code, detail] of WIRED) {
  test(`${code}：AIBS 失败分支「${marker.slice(0, 28)}…」调用 logEvent 记该码，码表收下并落盘`, async () => {
    assertWired(AIBS_FILE, marker, code, { detail });
    const entries = ofCode(await capture(() => log.logEvent({ code, echo: false, detail: { probe: true, error: summary.summarizeError(new Error('probe')) } })), code);
    await assertPersisted(code, entries);
  });
}

test('LCQ-NAR-007（jsonBlock）：「JSON代码块解析失败」两处里只有开局那处（后接「2. 如果没有提取到」）记码', () => {
  const text = src(AIBS_FILE);
  assert.match(text, /console\.warn\('\[AI双向系统\] JSON代码块解析失败:', e\);\n\s+logEvent\(\{ code: 'LCQ-NAR-007', echo: false, detail: \{ stage: 'jsonBlock', error: summarizeError\(e\) \} \}\);\n\s+\}\n\s+\}\n\n\s+\/\/ 2\. 如果没有提取到/);
  assert.equal(text.split("console.warn('[AI双向系统] JSON代码块解析失败:', e);").length - 1, 2);
  assert.equal(text.split("stage: 'jsonBlock'").length - 1, 1, '回合响应那处不归开局码，不接');
});

test('NET-014 的 logEvent 在兜底判定之后、分支之前：不论本地安全正文还是占位兜底都会记', () => {
  const text = src(AIBS_FILE);
  const at = text.indexOf("console.error('[AI双向系统] AI生成失败:'");
  const block = text.slice(at, text.indexOf('if (generationFailed) return gmResponse;', at));
  const call = block.indexOf("logEvent({ code: 'LCQ-NET-014', echo: false,");
  assert.ok(call > block.indexOf('&& shouldSettleLocalContractAfterGenerationFailure(error);'));
  assert.ok(call < block.indexOf('if (canSettleLocally) {'));
});

test('本批接线不另打控制台：12 个码 echo:false 时 logEvent 不往控制台输出', async () => {
  const printed = [];
  const saved = { warn: console.warn, error: console.error, info: console.info, log: console.log };
  for (const k of Object.keys(saved)) console[k] = (...a) => printed.push(a);
  try {
    await log.resetLogState();
    for (const code of BATCH) log.logEvent({ code, echo: false, detail: { error: summary.summarizeError(new Error('x')) } });
  } finally { Object.assign(console, saved); }
  assert.deepEqual(printed, []);
});
