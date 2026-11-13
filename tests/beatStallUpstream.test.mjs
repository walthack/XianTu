// LCQ-SAV-065 漏记复现（8092 真机 real-8092-detail.json 第 52 手）：主叙事请求被上游 529 拒绝 →
// AIBidirectionalSystem 吞掉异常、返回占位回包（缺 mid_term_memory）→ MainGamePanel 走格式重试 retryAIResponse，
// 重试的 options 不带 eventAction，提交了正文但本拍没结算 → 旧口径「命中本拍动作且已提交＝推进了」不记。
// 这里用真实 AIBS 管线（替身 aiService.generate：第一次抛 HTTP 529，重试回合法 JSON）复现，再喂给 065。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
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
const load = p => jiti.import(new URL(p, import.meta.url).pathname);
if (!globalThis.localStorage || typeof globalThis.localStorage.getItem !== 'function') {
  const values = new Map();
  globalThis.localStorage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k), clear: () => values.clear() };
}
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
if (!globalThis.window.location) globalThis.window.location = { hostname: 'localhost', href: 'http://localhost/', search: '' };
const quiet = async fn => { const keep = { log: console.log, info: console.info, warn: console.warn, error: console.error }; console.log = console.info = console.warn = console.error = () => {}; try { return await fn(); } finally { Object.assign(console, keep); } };

const TEST_PROFILE = { 模式: '单机', 角色: { 名字: '程宗扬', 性别: '男' }, 存档列表: {} };
const BEAT = 'lyl.event.survey_wumu_mansion', ACTION = 'leave_wumu_without_alerting';
const TEXT = '这一步，我压住脚步，看清巷口换岗与暗处目光一闪即收，不叫破、不拔刀，带人原路离开。';

async function withStubbedGenerate(aiService, impl) {
  const { useAPIManagementStore } = await load('../src/stores/apiManagementStore.ts');
  const api = useAPIManagementStore(); const configs = [...api.apiConfigs]; const assigns = api.apiAssignments.map(a => ({ ...a }));
  api.apiConfigs = [{ id: 'fixture', name: 'fixture', provider: 'custom', url: 'https://api.minimaxi.com/v1', apiKey: 'fixture-not-a-real-key', model: 'MiniMax-M3', enabled: true }];
  api.assignAPI('main', 'fixture');
  const keep = { check: aiService.checkAvailability, generate: aiService.generate, raw: aiService.generateRaw };
  aiService.checkAvailability = () => ({ available: true, message: 'test-stub' });
  aiService.generate = impl;
  aiService.generateRaw = async () => { throw new Error('must not call generateRaw'); };
  return () => { api.apiConfigs = configs; api.apiAssignments = assigns; aiService.checkAvailability = keep.check; aiService.generate = keep.generate; aiService.generateRaw = keep.raw; };
}

const { createMinimalSaveDataV3 } = await load('../src/utils/dataRepair.ts');
const init = await load('../src/modules/scenarioMods/strictInitializer.ts');
const runtime = await load('../src/modules/scenarioMods/runtime.ts');
async function saveAtBeat() {
  const d = JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lyl.lin_an_bridge.json', import.meta.url)));
  let s = runtime.advanceScenarioRuntime(init.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), init.buildStrictScenarioInitialization(d))).saveData;
  const rt = s.世界.状态.剧本模组;
  for (const event of rt.events) if (event.id !== BEAT) { rt.completedEventIds.push(event.id); for (const c of event.completion || []) if (c.path.startsWith('flags.')) rt.flags[c.path.slice(6)] = c.value; }
  rt.activeEventIds = [BEAT]; rt.currentChapterId = rt.chapters.find(c => c.eventIds.includes(BEAT))?.id ?? rt.currentChapterId;
  // 两步拍：先做完第一步（绕看武穆王府布局），停在真机第 52 手那一步「原路离开」。
  const first = runtime.getCurrentStoryEventActions(s).find(a => a.eventId === BEAT);
  rt.worldTurn++; runtime.recordStoryEventStructuredAction(s, first);
  s = runtime.advanceScenarioRuntime(s).saveData;
  const action = runtime.getCurrentStoryEventActions(s).find(a => a.eventId === BEAT && a.actionId === ACTION);
  assert.ok(action, '本拍应有 leave_wumu_without_alerting');
  return { s, action };
}

test('复现：主叙事 529 → 格式重试提交但本拍未结算 → 记 LCQ-SAV-065 reason=upstreamError（httpStatus=529）', async () => {
  setActivePinia(createPinia());
  const { AIBidirectionalSystem } = await load('../src/utils/AIBidirectionalSystem.ts');
  const { useGameStateStore } = await load('../src/stores/gameStateStore.ts');
  const { aiService } = await load('../src/services/aiService.ts');
  const { AiHttpError } = await load('../src/services/aiRetryPolicy.ts');
  const { validateProcessedAIResponse } = await load('../src/utils/processedAIResponseValidation.ts');
  const SL = await load('../src/modules/scenarioMods/beatStallLog.ts');
  const RD = await load('../src/services/requestLifecycleDiagnostics.ts');
  const { resetLogState } = await load('../src/modules/diagnostics/log.ts');
  await resetLogState();
  const { s, action } = await saveAtBeat();
  const store = useGameStateStore(); store.loadFromSaveData(s);
  const probe = SL.beginBeatStallProbe(store.toSaveData(), TEXT);
  assert.ok(probe, '有焦点主线拍时应取到快照');
  SL.noteBeatStallVia(probe, 'intent', ACTION, {});
  probe.narrativeSent = true;

  // 第一次：主叙事请求 HTTP 529（请求生命周期诊断照真实 fetch 层记一条 module=main 的 http_error）。
  let calls = 0;
  const restore = await withStubbedGenerate(aiService, async () => {
    calls++;
    if (calls === 1) {
      const req = RD.startRequestDiagnostic(RD.diagnosticContext('main', 'gen_test', false), 'fetch');
      req.headers(529);
      const error = new AiHttpError('API错误 529: overloaded_error', { status: 529 });
      req.finish(error, 'http_error');
      throw error;
    }
    return JSON.stringify({ text: '巷口灯火晃了两下，你压住脚步，带人原路退开。', mid_term_memory: '退出武穆王府后巷。', tavern_commands: [], action_options: [] });
  });
  try {
    const first = await quiet(() => AIBidirectionalSystem.processPlayerAction(TEXT, TEST_PROFILE, { eventAction: action, eventActionProvenance: 'resolved_text', playerIntentText: TEXT, shouldAbort: () => false }));
    // 已验证：529 不上抛、不带 generationError，回包结构不合法 → MainGamePanel 走 retryAIResponse（非终止错误）。
    assert.equal(first.generationError, undefined);
    assert.equal(first.transactionCommitted, undefined);
    assert.equal(validateProcessedAIResponse(first).isValid, false);
    // 重试：MainGamePanel.retryAIResponse 的 options 只有 playerIntentText／useStreaming／shouldAbort／generation_id，不带 eventAction。
    const retry = await quiet(() => AIBidirectionalSystem.processPlayerAction(`${TEXT}\n\n## 输出格式（必须严格遵守）`, TEST_PROFILE, { playerIntentText: TEXT, shouldAbort: () => false }));
    assert.equal(retry.transactionCommitted, true, '重试回合提交了正文');
    assert.ok(!store.toSaveData().世界.状态.剧本模组.completedEventIds.includes(BEAT), '但本拍没结算');
    probe.committed = Boolean(retry.transactionCommitted);
    probe.narrativeRetried = true;
  } finally { restore(); }

  const entry = SL.finishBeatStallProbe(probe, store.toSaveData(), { pendingJudgement: false, intentHold: false });
  assert.ok(entry, '应记一条 LCQ-SAV-065');
  assert.equal(entry.code, 'LCQ-SAV-065');
  assert.equal(entry.detail.reason, 'upstreamError');
  assert.equal(entry.detail.committed, true);
  assert.deepEqual(entry.detail.upstream, { retried: true, errors: 1, status: 'http_error', httpStatus: 529 });
});

test('分类：upstreamError 与 turnFailed 分开；没重试、照常提交的命中仍算推进不记', async () => {
  const SL = await load('../src/modules/scenarioMods/beatStallLog.ts');
  const base = { via: 'intent', actionId: ACTION, clues: [], committed: true, travelOnly: false };
  const none = { pendingJudgement: false, intentHold: false };
  assert.ok(SL.BEAT_STALL_REASONS.includes('upstreamError'));
  assert.equal(SL.classifyBeatStall(base, null, none, { retried: true, errors: 1, status: 'http_error', httpStatus: 529 }), 'upstreamError');
  assert.equal(SL.classifyBeatStall({ ...base, committed: false }, null, none, { retried: false, errors: 1, status: 'failed' }), 'upstreamError');
  // 拿不到上游报错（只有格式重试的线索）→ turnFailed，detail.upstream.retried 带线索。
  assert.equal(SL.classifyBeatStall({ ...base, narrativeRetried: true }, null, none, { retried: true, errors: 0 }), 'turnFailed');
  assert.equal(SL.classifyBeatStall({ ...base, committed: false }, null, none), 'turnFailed');
  // 上游报错只是线索，不盖过 miss／travel。
  assert.equal(SL.classifyBeatStall({ ...base, via: 'miss', actionId: undefined }, null, none, { retried: false, errors: 1, status: 'http_error', httpStatus: 529 }), 'miss');
  assert.equal(SL.classifyBeatStall({ ...base, actionId: 'travel:x' }, null, none, { retried: false, errors: 1, status: 'http_error', httpStatus: 529 }), 'travel');
});

test('MainGamePanel 接线：格式重试前标 narrativeRetried（只加日志赋值）', async () => {
  const src = await readFile(new URL('../src/components/dashboard/MainGamePanel.vue', import.meta.url), 'utf8');
  const mark = src.indexOf('if (beatStall) beatStall.narrativeRetried = true;');
  assert.ok(mark > 0);
  assert.ok(mark < src.indexOf('const retryResponse = await retryAIResponse('));
  assert.ok(mark > src.indexOf("toast.warning('AI响应格式不正确，正在重试...');"));
});
