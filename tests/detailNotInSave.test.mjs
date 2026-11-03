// 验收：详细描写不入档（设计稿 2026-11-03「提示词历史与审核拒绝」第七节方案 B，用户 17:05 拍板）。
// 真跑 AIBS processGmResponse 写一回合、processPlayerAction 截获下一回合请求（不联网），断言：
// ① 存档（系统.历史.叙事、社交.记忆.*）只有概要、本地副本能读回全文；② 下一回合请求（最近事件、聚焦上下文、叙事检索段）不含上回合正文；
// ③ 旧档读档迁移后同上；④ 422+1026 仍降级重发。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';

globalThis.fetch = async () => { throw new Error('network forbidden'); };
const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k), clear: () => storage.clear() };
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
if (!globalThis.window.location) globalThis.window.location = { hostname: 'localhost', href: 'http://localhost/' };

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: {
    '@/stores/characterStore': fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts', import.meta.url)),
    '@': fileURLToPath(new URL('../src', import.meta.url)),
  },
});
const load = rel => jiti.import(new URL(rel, import.meta.url).pathname);

const numbers = await load('../src/modules/sceneModule/numbers.ts');
const detailStore = await load('../src/services/narrativeDetailStore.ts');
const summary = await load('../src/services/narrativeSummary.ts');
const { migrateNarrativeDetailOnLoad, createMinimalSaveDataV3 } = await load('../src/utils/dataRepair.ts');
const { AIBidirectionalSystem } = await load('../src/utils/AIBidirectionalSystem.ts');
const { useGameStateStore } = await load('../src/stores/gameStateStore.ts');
const { useCharacterStore } = await load('./stubs/characterStoreForAbortTest.ts');
const { aiService } = await load('../src/services/aiService.ts');
const { narrativeRagService } = await load('../src/services/narrativeRagService.ts');
const { useAPIManagementStore } = await load('../src/stores/apiManagementStore.ts');
const { RECENT_EVENTS_PREFIX, RECENT_EVENTS_TAIL } = await load('../src/services/promptRedaction.ts');
const { default: moderationConfig } = await load('../mod-kit/ai-content-moderation.json');

const CHAR = 'char-detail-accept';
const PROFILE = { 模式: '单机', 角色: { 名字: '程宗扬', 性别: '男' }, 存档列表: {} };
const RAW_NEW = '正文独有标记甲：你推开石门，烛火摇曳，殿内石壁上的刻痕一道道映入眼帘，描写一段又一段。';
const SUM_NEW = '推开石门入殿，见石壁刻痕。';
const T1 = '【仙道历1年1月1日 08:00】';
const T2 = '【仙道历1年1月1日 09:00】';
const RAW_OLD1 = `${T1}旧档正文标记乙：第一回合的详细描写，很长很长。`;
const RAW_OLD2 = `${T2}旧档正文标记丙：第二回合的详细描写，摘要为空。`;
const SUM_OLD1 = `${T1}旧档第一回合概要。`;
const RAW_MARKERS = ['正文独有标记甲', '旧档正文标记乙', '旧档正文标记丙'];
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function quiet() {
  const saved = {};
  for (const k of ['log', 'info', 'warn', 'debug', 'error']) { saved[k] = console[k]; console[k] = () => {}; }
  return () => Object.assign(console, saved);
}

function fresh() {
  setActivePinia(createPinia());
  useCharacterStore().rootState.当前激活存档 = { 角色ID: CHAR, 存档槽位: 'slot-1' };
  detailStore.setNarrativeDetailBackend(detailStore.createMemoryDetailBackend());
}

const persisted = save => JSON.stringify({ 叙事: save.系统.历史.叙事, 记忆: save.社交.记忆 });
function assertNoRaw(text, label) {
  for (const marker of RAW_MARKERS) assert.equal(text.includes(marker), false, `${label} 含正文：${marker}`);
}

async function playTurn(save, text, mid) {
  useGameStateStore().loadFromSaveData(save);
  const restore = quiet();
  try {
    const { saveData } = await AIBidirectionalSystem.processGmResponse(
      { text, mid_term_memory: mid, tavern_commands: [], action_options: [] }, save, false, () => false, { userAction: '推门' });
    await flush();
    return saveData;
  } finally { restore(); }
}

/** 叙事检索打开（假 db、假向量），让下一回合真拼出「历史叙事检索结果」段。 */
function enableNarrativeRag() {
  const entries = new Map();
  const patch = {
    init: async () => {},
    isEnabled: () => true,
    config: { ...narrativeRagService.getConfig(), enabled: true, autoIndex: true, minSimilarity: 0 },
    db: { async getAll() { return [...entries.values()]; }, async put(_n, entry) { entries.set(entry.id, entry); }, async delete(_n, id) { entries.delete(id); } },
    getEmbeddingRequestConfig: () => ({ model: 'm' }),
    embedBatch: async texts => ({ vectors: texts.map(() => [1, 0]), model: 'm' }),
  };
  const original = Object.fromEntries(Object.keys(patch).map(k => [k, Object.getOwnPropertyDescriptor(narrativeRagService, k)]));
  Object.assign(narrativeRagService, patch);
  return () => {
    for (const [k, desc] of Object.entries(original)) {
      if (desc) Object.defineProperty(narrativeRagService, k, desc);
      else delete narrativeRagService[k];
    }
  };
}

/** 截获下一回合主叙事请求：aiService.generate 记下参数后中止，不联网。 */
async function captureNextRequest(save) {
  useGameStateStore().loadFromSaveData(save);
  const calls = [];
  const saved = { generate: aiService.generate, generateRaw: aiService.generateRaw, checkAvailability: aiService.checkAvailability };
  aiService.checkAvailability = () => ({ available: true, message: 'test' });
  aiService.generate = async options => { calls.push(options); const e = new Error('captured'); e.name = 'AbortError'; throw e; };
  aiService.generateRaw = async options => { calls.push(options); throw new Error('captured raw'); };
  const restoreRag = enableNarrativeRag();
  const restore = quiet();
  try {
    await AIBidirectionalSystem.processPlayerAction('四处看看石壁', PROFILE, { shouldAbort: () => false, playerIntentText: '四处看看石壁' });
  } catch { /* AbortError 截获即止 */ } finally {
    restore(); restoreRag(); Object.assign(aiService, saved);
  }
  const main = calls.find(call => call.usageType === 'main');
  assert.ok(main, '应发出主叙事请求');
  return main;
}

const recentOf = request => request.injects.find(m => m.role === 'assistant' && m.content.startsWith(`${RECENT_EVENTS_PREFIX}\n`))?.content;
const systemOf = request => request.injects.filter(m => m.role === 'system').map(m => m.content).join('\n');

test('默认配置：detailRetention=localOnly、tailChars=0', () => {
  assert.equal(numbers.GAME_NUMBERS.narrative.detailRetention, 'localOnly');
  assert.equal(numbers.GAME_NUMBERS.prompt.recentContext.tailChars, 0);
});

test('① 主叙事回合：存档叙事与记忆只含概要，本地副本读回全文', async () => {
  fresh();
  const saved = await playTurn(createMinimalSaveDataV3(), RAW_NEW, SUM_NEW);
  assertNoRaw(persisted(saved), '存档');
  assertNoRaw(JSON.stringify(saved), '整份存档');
  const gm = saved.系统.历史.叙事.filter(item => item.type === 'gm').at(-1);
  assert.ok(gm.content.endsWith(SUM_NEW));
  assert.equal(gm.summary, gm.content);
  for (const key of ['短期记忆', '隐式中期记忆']) assert.ok(saved.社交.记忆[key].at(-1).endsWith(SUM_NEW), key);
  const detail = await detailStore.getDetail(CHAR, gm.detailId);
  assert.ok(detail.includes(RAW_NEW));
  assert.equal(summary.reviewTextOf(gm, detail), detail);
});

test('② 下一回合请求：最近事件、聚焦上下文、叙事检索段都不含上回合正文', async () => {
  fresh();
  const saved = await playTurn(createMinimalSaveDataV3(), RAW_NEW, SUM_NEW);
  const request = await captureNextRequest(saved);
  assertNoRaw(JSON.stringify(request), '请求');
  assert.ok(recentOf(request).includes(SUM_NEW), '最近事件应是概要');
  const system = systemOf(request);
  assert.match(system, /# 【历史叙事检索结果】/, '叙事检索段应已拼出');
  const rag = system.slice(system.indexOf('# 【历史叙事检索结果】'));
  assert.ok(rag.includes(SUM_NEW), '叙事检索段应是概要');
});

function legacySave() {
  const save = createMinimalSaveDataV3();
  save.社交.记忆 = { 短期记忆: [RAW_OLD1, RAW_OLD2], 隐式中期记忆: [SUM_OLD1, ''], 中期记忆: [], 长期记忆: [] };
  save.系统.历史.叙事 = [
    { type: 'user', content: '玩家输入', time: T1, actionOptions: [] },
    { type: 'gm', role: 'assistant', content: RAW_OLD1, time: T1, actionOptions: [] },
    { type: 'gm', role: 'assistant', content: RAW_OLD2, time: T2, actionOptions: [] },
  ];
  return save;
}

test('③ 旧档迁移后：存档只留概要、副本读回原文；下一回合请求不含旧正文，无概要条不发', async () => {
  fresh();
  const save = legacySave();
  await migrateNarrativeDetailOnLoad(save, CHAR);
  assertNoRaw(persisted(save), '迁移后存档');
  const gm = save.系统.历史.叙事.filter(item => item.type === 'gm');
  assert.deepEqual(await Promise.all(gm.map(item => detailStore.getDetail(CHAR, item.detailId))), [RAW_OLD1, RAW_OLD2]);
  assert.equal(summary.isNoSummary(gm[1].content), true);

  const request = await captureNextRequest(save);
  assertNoRaw(JSON.stringify(request), '迁移后请求');
  assert.ok(recentOf(request).includes(SUM_OLD1));
  assert.equal(recentOf(request).includes(numbers.GAME_NUMBERS.narrative.noSummaryMarker), false, '无概要条不进最近事件');
});

test('③ 旧档迁移后再玩一回合：存档、副本、下一回合请求同样成立', async () => {
  fresh();
  const save = legacySave();
  await migrateNarrativeDetailOnLoad(save, CHAR);
  const saved = await playTurn(save, RAW_NEW, SUM_NEW);
  assertNoRaw(persisted(saved), '迁移后新回合存档');
  const latest = saved.系统.历史.叙事.filter(item => item.type === 'gm').at(-1);
  assert.ok((await detailStore.getDetail(CHAR, latest.detailId)).includes(RAW_NEW));
  const request = await captureNextRequest(saved);
  assertNoRaw(JSON.stringify(request), '迁移后新回合请求');
  assert.ok(recentOf(request).includes(SUM_OLD1) && recentOf(request).includes(SUM_NEW));
});

// ④ 降级重发（复用 moderationDegradedRetry 的 aiService 层夹具）：上下文里残留一条原文（迁移漏掉等）时，422+1026 仍降级重发并换成概要。
const mainApi = { id: 'main', name: 'main', model: 'MiniMax-M2.7', provider: 'custom', url: 'https://main.invalid/v1', apiKey: 'fixture', enabled: true, maxTokens: 4096, temperature: 0.5 };
const rejected = () => new Response(JSON.stringify({ error: { message: 'input new_sensitive(1026)' }, request_id: 'req-accept' }), { status: 422 });
const ok = () => new Response('data: {"choices":[{"delta":{"content":"你环顾四周，静静等候。"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
const recentMessage = entries => `${RECENT_EVENTS_PREFIX}\n${entries.join('\n')}${RECENT_EVENTS_TAIL}`;

test('④ 422+1026：最近事件残留原文时仍降级重发，重发请求只剩概要', async () => {
  fresh();
  moderationConfig.fallbackEnabled = false;
  const api = useAPIManagementStore(); api.apiConfigs = [{ ...mainApi }]; api.assignAPI('main', 'main');
  const shortTerm = [SUM_OLD1, RAW_OLD2];
  const implicitMid = [SUM_OLD1, `${T2}旧档第二回合概要。`];
  const bodies = [];
  const old = globalThis.fetch;
  globalThis.fetch = async (_url, init) => { bodies.push(JSON.parse(init.body)); return bodies.length === 1 ? rejected() : ok(); };
  const restore = quiet();
  try {
    const text = await aiService.generate({
      injects: [{ role: 'system', content: '系统夹具', depth: 2, position: 'in_chat' }, { role: 'assistant', content: recentMessage(shortTerm), depth: 1, position: 'in_chat' }],
      user_input: '观察', should_stream: true, usageType: 'main', requestMaxRetries: 0, apiConfigOverride: mainApi,
      moderationDegrade: { shortTerm, implicitMid },
    });
    assert.match(text, /静静等候/);
  } finally { restore(); globalThis.fetch = old; }
  assert.equal(bodies.length, 2);
  assert.ok(JSON.stringify(bodies[0]).includes('旧档正文标记丙'));
  assertNoRaw(JSON.stringify(bodies[1]), '降级重发请求');
  assert.ok(bodies[1].messages.some(m => m.content === recentMessage(implicitMid)));
});

// getTavernHelper() 恒返回包装器，主叙事走「酒馆模式」分支；该分支须带 moderationDegrade，真实回合 422+1026 才会降级重发。
test('④ AIBS 真实回合 422+1026 降级重发（端到端）', async () => {
  fresh();
  moderationConfig.fallbackEnabled = false;
  const api = useAPIManagementStore(); api.apiConfigs = [{ ...mainApi }]; api.assignAPI('main', 'main');
  const save = createMinimalSaveDataV3();
  save.社交.记忆.短期记忆 = [SUM_OLD1, RAW_OLD2];
  save.社交.记忆.隐式中期记忆 = [SUM_OLD1, `${T2}旧档第二回合概要。`];
  useGameStateStore().loadFromSaveData(save);
  const bodies = [];
  const old = globalThis.fetch;
  globalThis.fetch = async (_url, init) => { bodies.push(JSON.parse(init.body)); return bodies.length === 1 ? rejected() : ok(); };
  const restore = quiet();
  try {
    await AIBidirectionalSystem.processPlayerAction('四处看看', PROFILE, { shouldAbort: () => false, playerIntentText: '四处看看' }).catch(() => {});
  } finally { restore(); globalThis.fetch = old; }
  assert.equal(bodies.length, 2);
  assertNoRaw(JSON.stringify(bodies[1]), 'AIBS 降级重发请求');
});
