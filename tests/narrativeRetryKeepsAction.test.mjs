// 主叙事格式重试＝同一手再发一次：第一次生成失败（上游 529／坏 JSON）后，MainGamePanel.retryAIResponse 沿用这一手的结算输入
// （carryNarrativeRetryOptions），重试成功时本拍动作结算、且只结算一次（8092 真机第 52、53 手：正文写了、进度没动）。
// 真实 AIBS 管线＋替身 aiService.generate；重试的 options 照 retryAIResponse 的写法拼。
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
const TEXT = '照本拍去做这一步。';
const GOOD = JSON.stringify({ text: '你照着先前的打算去做了，周遭一切如常。', mid_term_memory: '照本拍做了这一步。', tavern_commands: [], action_options: [] });
const NO_MEMORY = JSON.stringify({ text: '你照着先前的打算去做了。', tavern_commands: [], action_options: [] });

const { createMinimalSaveDataV3 } = await load('../src/utils/dataRepair.ts');
const init = await load('../src/modules/scenarioMods/strictInitializer.ts');
const runtime = await load('../src/modules/scenarioMods/runtime.ts');
const { carryNarrativeRetryOptions } = await load('../src/utils/narrativeRetryOptions.ts');
const data = JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lyl.lin_an_bridge.json', import.meta.url)));

/** 停在某一拍：其余拍记完成；返回本拍第一个非移动动作。 */
function saveAtBeat(beatId, actionId) {
  const s = runtime.advanceScenarioRuntime(init.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), init.buildStrictScenarioInitialization(data))).saveData;
  const rt = s.世界.状态.剧本模组;
  for (const event of rt.events) if (event.id !== beatId) { rt.completedEventIds.push(event.id); for (const c of event.completion || []) if (c.path.startsWith('flags.')) rt.flags[c.path.slice(6)] = c.value; }
  rt.activeEventIds = [beatId]; rt.currentChapterId = rt.chapters.find(c => c.eventIds.includes(beatId))?.id ?? rt.currentChapterId;
  const action = runtime.getCurrentStoryEventActions(s).find(a => a.eventId === beatId && a.actionId === actionId);
  assert.ok(action, `${beatId} 应有动作 ${actionId}`);
  return { s, action };
}

async function setup(beatId, actionId, generateImpl) {
  setActivePinia(createPinia());
  const { AIBidirectionalSystem } = await load('../src/utils/AIBidirectionalSystem.ts');
  const { useGameStateStore } = await load('../src/stores/gameStateStore.ts');
  const { aiService } = await load('../src/services/aiService.ts');
  const { useAPIManagementStore } = await load('../src/stores/apiManagementStore.ts');
  const { s, action } = saveAtBeat(beatId, actionId);
  const store = useGameStateStore(); store.loadFromSaveData(s);
  const api = useAPIManagementStore(); const configs = [...api.apiConfigs]; const assigns = api.apiAssignments.map(a => ({ ...a }));
  api.apiConfigs = [{ id: 'fixture', name: 'fixture', provider: 'custom', url: 'https://api.minimaxi.com/v1', apiKey: 'fixture-not-a-real-key', model: 'MiniMax-M3', enabled: true }];
  api.assignAPI('main', 'fixture');
  const keep = { check: aiService.checkAvailability, generate: aiService.generate, raw: aiService.generateRaw };
  let calls = 0;
  aiService.checkAvailability = () => ({ available: true, message: 'test-stub' });
  aiService.generate = async () => generateImpl(++calls);
  aiService.generateRaw = async () => { throw new Error('must not call generateRaw'); };
  const restore = () => { api.apiConfigs = configs; api.apiAssignments = assigns; Object.assign(aiService, { checkAvailability: keep.check, generate: keep.generate, generateRaw: keep.raw }); };
  // 第一次调用的 options 照 MainGamePanel.sendMessage 的写法（本拍动作走 eventAction）。
  const firstOptions = { onProgressUpdate: () => {}, playerIntentText: TEXT, cultivationSelections: [], freeTextStatusResolution: undefined,
    useStreaming: false, shouldAbort: () => false, eventAction: { ...action }, eventActionProvenance: 'resolved_text', generation_id: 'gen_first', qingyuTurnId: undefined };
  const run = (message, options) => quiet(() => AIBidirectionalSystem.processPlayerAction(message, TEST_PROFILE, options));
  // 重试的 options 照 retryAIResponse：先带这一手的结算输入，再给本次请求自己的字段。
  const retryOptions = (turnOptions, attempt = 1) => ({ ...carryNarrativeRetryOptions(turnOptions), onProgressUpdate: () => {}, playerIntentText: TEXT,
    useStreaming: false, shouldAbort: () => false, generation_id: `gen_retry_${attempt}` });
  const state = () => store.toSaveData().世界.状态.剧本模组;
  return { action, store, firstOptions, run, retryOptions, state, restore, calls: () => calls };
}

async function http529() {
  const { AiHttpError } = await load('../src/services/aiRetryPolicy.ts');
  throw new AiHttpError('API错误 529: overloaded_error', { status: 529 });
}

async function firstFailsThenRetry(beatId, actionId, firstImpl) {
  const { validateProcessedAIResponse } = await load('../src/utils/processedAIResponseValidation.ts');
  const t = await setup(beatId, actionId, n => n === 1 ? firstImpl() : GOOD);
  try {
    const before = structuredClone(t.state());
    const first = await t.run(TEXT, t.firstOptions);
    assert.equal(first.transactionCommitted, undefined, '第一次没提交');
    assert.equal(first.generationError, undefined, '非终止错误：MainGamePanel 会走格式重试');
    assert.equal(validateProcessedAIResponse(first).isValid, false);
    assert.deepEqual(t.state().eventActionStates ?? {}, before.eventActionStates ?? {}, '第一次失败后本拍动作状态没被动过');
    assert.deepEqual(t.state().completedEventIds, before.completedEventIds);
    const retry = await t.run(`${TEXT}\n\n## 输出格式（必须严格遵守）`, t.retryOptions(t.firstOptions));
    assert.equal(retry.transactionCommitted, true, '重试提交了');
    assert.equal(validateProcessedAIResponse(retry).isValid, true);
    return { t, retry };
  } finally { t.restore(); }
}

test('上游 529 → 格式重试：两步拍的第一步结算（尝试计数 1、记下这一步）', async () => {
  const { t } = await firstFailsThenRetry('lyl.event.survey_wumu_mansion', 'circle_wumu_record_layout', http529);
  const st = t.state().eventActionStates['lyl.event.survey_wumu_mansion'];
  assert.equal(st.attemptCount, 1);
  assert.deepEqual(st.attempts.map(a => a.actionId), ['circle_wumu_record_layout']);
  assert.ok(!t.state().completedEventIds.includes('lyl.event.survey_wumu_mansion'), '两步拍走完第一步还没完成');
  assert.ok(runtime.getCurrentStoryEventActions(t.store.toSaveData()).some(a => a.actionId === 'leave_wumu_without_alerting'), '第二步露出来了');
});

test('上游 529 → 格式重试：单步拍结算完成', async () => {
  const { t } = await firstFailsThenRetry('lyl.event.xue_yanshan_slain', 'confirm_xue_yanshan_death', http529);
  assert.ok(t.state().completedEventIds.includes('lyl.event.xue_yanshan_slain'));
  assert.equal(t.state().eventActionStates['lyl.event.xue_yanshan_slain'].attemptCount, 1);
});

test('第一次回坏 JSON（解析不出 text，AIBS 回占位回包、缺 mid_term_memory）→ 格式重试：本拍同样结算', async () => {
  for (const bad of ['{"text": "你照着', '你照着先前的打算去做了。', JSON.stringify({ mid_term_memory: '只有记忆', tavern_commands: [] })]) {
    const { t } = await firstFailsThenRetry('lyl.event.survey_wumu_mansion', 'circle_wumu_record_layout', () => bad);
    assert.equal(t.state().eventActionStates['lyl.event.survey_wumu_mansion'].attemptCount, 1, bad);
  }
});

test('对照：合法 JSON 只缺 mid_term_memory 第一次就提交并结算，不走格式重试', async () => {
  const t = await setup('lyl.event.survey_wumu_mansion', 'circle_wumu_record_layout', () => NO_MEMORY);
  try {
    const first = await t.run(TEXT, t.firstOptions);
    assert.equal(first.transactionCommitted, true);
    assert.equal(t.state().eventActionStates['lyl.event.survey_wumu_mansion'].attemptCount, 1);
  } finally { t.restore(); }
});

test('重试也失败 → 不提交、不结算，本拍状态与发送前相同', async () => {
  const t = await setup('lyl.event.survey_wumu_mansion', 'circle_wumu_record_layout', () => http529());
  try {
    const before = structuredClone(t.state());
    const first = await t.run(TEXT, t.firstOptions);
    const r1 = await t.run(TEXT, t.retryOptions(t.firstOptions, 1));
    const r2 = await t.run(TEXT, t.retryOptions(t.firstOptions, 2));
    for (const r of [first, r1, r2]) assert.equal(r.transactionCommitted, undefined);
    assert.deepEqual(t.state().eventActionStates ?? {}, before.eventActionStates ?? {});
    assert.deepEqual(t.state().completedEventIds, before.completedEventIds);
    assert.equal(t.state().worldTurn, before.worldTurn);
  } finally { t.restore(); }
});

test('不会结算两次：重试成功后本拍尝试计数与记录只有一条', async () => {
  const { t } = await firstFailsThenRetry('lyl.event.survey_wumu_mansion', 'circle_wumu_record_layout', http529);
  const st = t.state().eventActionStates['lyl.event.survey_wumu_mansion'];
  assert.equal(st.attemptCount, 1);
  assert.equal(st.attempts.length, 1);
});

test('没有本拍动作的普通回合：重试 options 只多清羽回合号；真实管线走一遍，存档结果与修之前逐项相同', async () => {
  const ordinary = { onProgressUpdate: () => {}, playerIntentText: TEXT, cultivationSelections: [], freeTextStatusResolution: undefined,
    useStreaming: true, shouldAbort: () => false, onStreamChunk: () => {}, generation_id: 'gen_x', image: ['data:x'] };
  assert.deepEqual(carryNarrativeRetryOptions(ordinary), {});
  assert.deepEqual(carryNarrativeRetryOptions(undefined), {});
  // 只挑结算输入；本次请求自己的字段（generation_id／流式回调／shouldAbort／图片）不带。
  const full = { ...ordinary, eventAction: { a: 1 }, opportunityAction: { b: 1 }, openWorldAction: { c: 1 }, gambleRefusalAction: { d: 1 },
    judgementResolution: { e: 1 }, eventActionProvenance: 'selected', cultivationSelections: [{ f: 1 }], freeTextStatusResolution: { state: 'resolved' }, qingyuTurnId: 'q1' };
  assert.deepEqual(Object.keys(carryNarrativeRetryOptions(full)).sort(),
    ['cultivationSelections', 'eventAction', 'eventActionProvenance', 'freeTextStatusResolution', 'gambleRefusalAction', 'judgementResolution', 'openWorldAction', 'opportunityAction', 'qingyuTurnId'].sort());

  // 同一份存档、同一个普通回合（不带本拍动作）：第一次 529，重试分别用修之前的 options 和修之后的 options，比较落账后的存档。
  const Q = await load('../src/services/qingyuTurnLongRequests.ts');
  const outcome = async withCarry => {
    const t = await setup('lyl.event.survey_wumu_mansion', 'circle_wumu_record_layout', n => n === 1 ? http529() : GOOD);
    const turnId = Q.beginQingyuTurnLongRequests(t.store.toSaveData()); // MainGamePanel 在第一次请求前开回合
    try {
      const first = { ...t.firstOptions, eventAction: undefined, eventActionProvenance: undefined, qingyuTurnId: turnId };
      await t.run(TEXT, first);
      const old = { onProgressUpdate: () => {}, playerIntentText: TEXT, useStreaming: false, shouldAbort: () => false, generation_id: 'gen_retry_1' };
      const options = withCarry ? { ...carryNarrativeRetryOptions(first), ...old } : old;
      if (withCarry) assert.deepEqual(Object.keys(carryNarrativeRetryOptions(first)), ['qingyuTurnId']);
      const r = await t.run(TEXT, options);
      assert.equal(r.transactionCommitted, true);
      const save = structuredClone(t.store.toSaveData());
      return { save, attempts: save.世界.状态.剧本模组.eventActionStates ?? {} };
    } finally { Q.endQingyuTurnLongRequests(turnId); t.restore(); }
  };
  const before = await outcome(false), after = await outcome(true);
  assert.deepEqual(after.attempts, before.attempts, '普通回合两边都不结算本拍动作');
  const diffs = [];
  const walk = (a, b, path) => {
    if (a && b && typeof a === 'object' && typeof b === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], `${path}.${k}`); return; }
    if (a !== b) diffs.push(path);
  };
  walk(after.save, before.save, '');
  // 两次各自新建存档：只允许存档 ID、时间戳和随机排期的下次世界事件时间不同。
  const volatile = /^\.元数据\.(存档ID|创建时间|更新时间)$|\.updatedAt$|\.timestamp$|^\.世界\.信息\.生成时间$|^\.社交\.事件\.下次事件时间\./;
  assert.deepEqual(diffs.filter(path => !volatile.test(path)), []);
});

test('MainGamePanel 接线：retryAIResponse 收第一次的 options、每次重试先带结算输入；某次重试已提交后不再带', async () => {
  const src = await readFile(new URL('../src/components/dashboard/MainGamePanel.vue', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('const retryAIResponse = async ('), src.indexOf('// 存储原始流式内容'));
  assert.match(fn, /turnOptions\?: Record<string, unknown>/);
  assert.match(fn, /let carried = carryNarrativeRetryOptions\(turnOptions\);/);
  assert.ok(fn.indexOf('...carried,') < fn.indexOf('generation_id: retryGenerationId'), '本次请求自己的字段写在后面、覆盖同名');
  assert.match(fn, /if \(aiResponse\.transactionCommitted\) carried = \{\};/);
  assert.match(src, /retryAIResponse\(\s*finalUserMessage,\s*character,\s*validation\.errors,\s*options\s*\)/);
});

// 提交了但校验不过：正文只有判定标记（〔战斗:…〕）的回包会照常落账，落账后正文被清成空串 → validateProcessedAIResponse 报「缺少有效的text字段」，
// retryAIResponse 接着发下一次。这时这一手已经结算过，下一次重试不能再带结算输入（retryAIResponse：if (aiResponse.transactionCommitted) carried = {}）。
const MARKER_ONLY = JSON.stringify({ text: '〔战斗:失败,判定值:32,难度:40〕', mid_term_memory: '只剩判定标记。', tavern_commands: [] });

test('重试已提交但正文为空（校验不过）→ 下一次重试不带结算输入：本拍只结算一次', async () => {
  const { validateProcessedAIResponse } = await load('../src/utils/processedAIResponseValidation.ts');
  const seq = n => n === 1 ? http529() : n === 2 ? MARKER_ONLY : GOOD;
  const run3 = async carryAfterCommit => {
    const t = await setup('lyl.event.survey_wumu_mansion', 'circle_wumu_record_layout', seq);
    try {
      await t.run(TEXT, t.firstOptions);
      // 照 retryAIResponse：carried 起始为第一次的结算输入；第 1 次重试提交了就清空。
      let carried = carryNarrativeRetryOptions(t.firstOptions);
      const r1 = await t.run(TEXT, { ...carried, ...t.retryOptions({}, 1) });
      assert.equal(r1.transactionCommitted, true, '第 1 次重试提交了');
      assert.equal(r1.text, '', '落账后正文清空');
      assert.equal(validateProcessedAIResponse(r1).isValid, false, '校验不过 → retryAIResponse 会发第 2 次');
      assert.equal(t.state().eventActionStates['lyl.event.survey_wumu_mansion'].attemptCount, 1, '第 1 次重试已结算本拍');
      assert.ok(!runtime.getCurrentStoryEventActions(t.store.toSaveData()).some(a => a.actionId === 'circle_wumu_record_layout'), '第一步动作已不在当前动作里');
      if (r1.transactionCommitted && !carryAfterCommit) carried = {};
      const r2 = await t.run(TEXT, { ...carried, ...t.retryOptions({}, 2) });
      assert.equal(r2.transactionCommitted, true);
      assert.equal(validateProcessedAIResponse(r2).isValid, true);
      return t.state().eventActionStates['lyl.event.survey_wumu_mansion'];
    } finally { t.restore(); }
  };
  const guarded = await run3(false);
  assert.equal(guarded.attemptCount, 1, '只结算一次');
  assert.deepEqual(guarded.attempts.map(a => a.actionId), ['circle_wumu_record_layout']);
  // 旁证（不是要求）：本例即使提交后照旧带着 eventAction，运行时也没有结算第二次（本拍已露出第二步，第一步动作不再是当前动作）。
  // 所以 carried = {} 在这里是第二道防线；第一道是运行时对过期动作的拒绝。
  const unguarded = await run3(true);
  assert.equal(unguarded.attemptCount, 1);
});
