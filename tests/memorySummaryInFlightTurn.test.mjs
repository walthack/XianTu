// Q23：记忆总结在途时下一回合开始并提交 → 回合末整份写回把总结结果盖掉。
// 真实 AIBS 管线（processPlayerAction / triggerMemorySummary）＋替身 aiService.generate / generateRaw。
// 问题一（总结只附 元数据／角色）也在这里钉。
import assert from 'node:assert/strict';
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
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const PROFILE = { 模式: '单机', 角色: { 名字: '甲', 性别: '男' }, 存档列表: {} };
const LINE = '我四处看看';
const SUMMARY = '长期记忆：甲在城中走了三处。';

function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
const withTimeout = (promise, label, ms = 3000) => Promise.race([promise, delay(ms).then(() => { throw new Error(`超时：${label}`); })]);
// 上一个用例回合末排队的自动总结可能还占着锁；等它放掉，用例之间互不串。
async function waitUnlocked(system) {
  for (let i = 0; i < 300 && system.isSummarizing; i += 1) await delay(10);
  assert.equal(system.isSummarizing, false, '总结锁未释放');
}

async function setup() {
  setActivePinia(createPinia());
  const { AIBidirectionalSystem } = await load('../src/utils/AIBidirectionalSystem.ts');
  const { useGameStateStore } = await load('../src/stores/gameStateStore.ts');
  const { useCharacterStore } = await jiti.import('@/stores/characterStore');
  const { aiService } = await load('../src/services/aiService.ts');
  const { useAPIManagementStore } = await load('../src/stores/apiManagementStore.ts');
  const { createMinimalSaveDataV3 } = await load('../src/utils/dataRepair.ts');
  const bg = await load('../src/utils/backgroundMemoryWork.ts');
  await waitUnlocked(AIBidirectionalSystem);
  bg.resetBackgroundMemoryWorkForTests();
  const api = useAPIManagementStore();
  api.apiConfigs = [{ id: 'fixture', name: 'fixture', provider: 'custom', url: 'https://example.invalid/v1', apiKey: 'fixture-not-a-real-key', model: 'fixture-model', enabled: true }];
  api.assignAPI('main', 'fixture');
  const keep = { check: aiService.checkAvailability, generate: aiService.generate, raw: aiService.generateRaw };
  aiService.checkAvailability = () => ({ available: true, message: 'test-stub' });
  const restore = async () => { await waitUnlocked(AIBidirectionalSystem).catch(() => {}); aiService.checkAvailability = keep.check; aiService.generate = keep.generate; aiService.generateRaw = keep.raw; localStorage.removeItem('memory-settings'); };
  // 触发 3、保留 1 → 每次总结最旧 2 条。
  localStorage.setItem('memory-settings', JSON.stringify({ midTermTrigger: 3, midTermKeep: 1 }));
  const store = useGameStateStore();
  const save = createMinimalSaveDataV3();
  save.社交.记忆 = { 短期记忆: [], 中期记忆: ['m1', 'm2', 'm3'], 长期记忆: [], 隐式中期记忆: [] };
  store.loadFromSaveData(save);
  const characterStore = useCharacterStore();
  characterStore.rootState.当前激活存档 = { 角色ID: 'char-a', 存档槽位: 'slot-1' };

  // 替身：总结请求挂起，等测试放行；主叙事请求按 onMain 处理。
  const summaryAsked = deferred();
  const summaryReply = deferred();
  let summaryCalls = 0;
  let onMain = async () => JSON.stringify({ text: '你环顾四周。', mid_term_memory: 'm4', tavern_commands: [], action_options: [] });
  const fake = async (opts) => {
    if (opts?.usageType === 'memory_summary') {
      summaryCalls += 1;
      summaryAsked.resolve(opts);
      if (summaryCalls > 1) return SUMMARY;
      return summaryReply.promise;
    }
    return onMain(opts);
  };
  aiService.generate = fake;
  aiService.generateRaw = fake;
  return {
    AIBidirectionalSystem, store, characterStore, bg, restore, summaryAsked: { get promise() { return withTimeout(summaryAsked.promise, '总结请求未发出'); } }, summaryReply, createMinimalSaveDataV3,
    setMain: fn => { onMain = fn; },
    summaryCalls: () => summaryCalls,
    memory: () => store.toSaveData().社交.记忆,
  };
}

test('基线：没有回合在途时，总结回来立即落账（与改动前逐项相同）', async () => {
  const t = await setup();
  try {
    const summary = quiet(() => t.AIBidirectionalSystem.triggerMemorySummary({ silent: true }));
    await t.summaryAsked.promise;
    t.summaryReply.resolve(SUMMARY);
    await summary;
    assert.deepEqual(t.memory().长期记忆, [SUMMARY]);
    assert.deepEqual(t.memory().中期记忆, ['m3']);
  } finally { await t.restore(); }
});

test('总结在途时下一回合开始并提交：总结结果不被回合末写回盖掉', async () => {
  const t = await setup();
  try {
    const summary = quiet(() => t.AIBidirectionalSystem.triggerMemorySummary({ silent: true }));
    await t.summaryAsked.promise;
    // 回合开始（已取存档快照）后，总结回来；主叙事稍后才返回。
    t.setMain(async () => {
      t.summaryReply.resolve(SUMMARY);
      await delay(40);
      return JSON.stringify({ text: '你环顾四周。', mid_term_memory: 'm4', tavern_commands: [], action_options: [] });
    });
    const turn = await quiet(() => t.AIBidirectionalSystem.processPlayerAction(LINE, PROFILE, { shouldAbort: () => false }));
    assert.equal(turn.transactionCommitted, true, '回合本身提交成功');
    await summary;
    const mem = t.memory();
    assert.deepEqual(mem.长期记忆, [SUMMARY], '总结写进长期记忆');
    assert.deepEqual(mem.中期记忆, ['m3'], '已总结的两条被压掉、保留的那条还在');
    // 回合本拍的 mid_term_memory 先进短期／隐式中期（短期满了才转中期），回合写的这部分不能被总结落账冲掉。
    assert.ok(mem.短期记忆.some(m => String(m).includes('m4')), '回合新写的记忆还在');
  } finally { await t.restore(); }
});

test('等待期间回合失败（主叙事上游报错）：总结照常落账', async () => {
  const t = await setup();
  try {
    const summary = quiet(() => t.AIBidirectionalSystem.triggerMemorySummary({ silent: true }));
    await t.summaryAsked.promise;
    t.setMain(async () => {
      t.summaryReply.resolve(SUMMARY);
      await delay(40);
      throw new Error('upstream 529 boom');
    });
    const turn = await quiet(() => t.AIBidirectionalSystem.processPlayerAction(LINE, PROFILE, { shouldAbort: () => false }));
    assert.notEqual(turn.transactionCommitted, true, '回合没有提交');
    await summary;
    assert.deepEqual(t.memory().长期记忆, [SUMMARY]);
    assert.deepEqual(t.memory().中期记忆, ['m3']);
  } finally { await t.restore(); }
});

test('等待期间回合被中止：总结照常落账', async () => {
  const t = await setup();
  try {
    const summary = quiet(() => t.AIBidirectionalSystem.triggerMemorySummary({ silent: true }));
    await t.summaryAsked.promise;
    let aborted = false;
    t.setMain(async () => {
      t.summaryReply.resolve(SUMMARY);
      await delay(40);
      aborted = true;
      return JSON.stringify({ text: '你环顾四周。', mid_term_memory: 'm4', tavern_commands: [], action_options: [] });
    });
    const turn = await quiet(() => t.AIBidirectionalSystem.processPlayerAction(LINE, PROFILE, { shouldAbort: () => aborted }));
    assert.notEqual(turn.transactionCommitted, true, '回合被中止、没有提交');
    await summary;
    assert.deepEqual(t.memory().长期记忆, [SUMMARY]);
    assert.deepEqual(t.memory().中期记忆, ['m3']);
  } finally { await t.restore(); }
});

test('等待期间切换了存档：不落账到新存档上', async () => {
  const t = await setup();
  try {
    const summary = quiet(() => t.AIBidirectionalSystem.triggerMemorySummary({ silent: true }));
    await t.summaryAsked.promise;
    t.setMain(async () => {
      t.summaryReply.resolve(SUMMARY);
      await delay(20);
      // 回合进行中玩家读了另一个档（同样的中期记忆前缀，最坏情况：前缀核对拦不住）。
      t.characterStore.rootState.当前激活存档 = { 角色ID: 'char-b', 存档槽位: 'slot-2' };
      const other = t.createMinimalSaveDataV3();
      other.社交.记忆 = { 短期记忆: [], 中期记忆: ['m1', 'm2', 'm3'], 长期记忆: [], 隐式中期记忆: [] };
      t.store.loadFromSaveData(other);
      await delay(20);
      throw new Error('turn interrupted by load');
    });
    await quiet(() => t.AIBidirectionalSystem.processPlayerAction(LINE, PROFILE, { shouldAbort: () => false }));
    await summary;
    assert.deepEqual(t.memory().长期记忆, [], '新存档没有被写进旧档的总结');
    assert.deepEqual(t.memory().中期记忆, ['m1', 'm2', 'm3']);
  } finally { await t.restore(); }
});

test('等待期间总结锁仍占着：第二次触发被跳过，不并发两次总结', async () => {
  const t = await setup();
  try {
    const summary = quiet(() => t.AIBidirectionalSystem.triggerMemorySummary({ silent: true }));
    await t.summaryAsked.promise;
    t.bg.beginForegroundAiTurn();
    t.summaryReply.resolve(SUMMARY);
    await delay(30);
    await quiet(() => t.AIBidirectionalSystem.triggerMemorySummary({ silent: true }));
    assert.equal(t.summaryCalls(), 1, '等待落账期间不发第二次总结请求');
    assert.deepEqual(t.memory().长期记忆, [], '回合未结束前不落账');
    t.bg.endForegroundAiTurn();
    await summary;
    assert.deepEqual(t.memory().长期记忆, [SUMMARY]);
    assert.deepEqual(t.memory().中期记忆, ['m3']);
  } finally { await t.restore(); }
});

test('问题一（A2）：附带的存档只有 元数据／角色；要总结的记忆写在用户消息里，保留的那几条不在', async () => {
  const t = await setup();
  try {
    const summary = quiet(() => t.AIBidirectionalSystem.triggerMemorySummary({ silent: true }));
    const opts = await t.summaryAsked.promise;
    t.summaryReply.resolve(SUMMARY);
    await summary;
    const carrier = opts.ordered_prompts
      ? opts.ordered_prompts.find(p => p.role === 'system').content
      : opts.injects.find(p => p.role === 'system').content;
    const json = JSON.parse(carrier.slice(carrier.indexOf('{')));
    assert.deepEqual(Object.keys(json).sort(), ['元数据', '角色'].sort());
    // 默认提示词没有 {{记忆内容}} 占位符：要总结的那几条接在提示词后面；保留不压的（m3）不给模型。
    const userText = opts.ordered_prompts ? opts.ordered_prompts.find(p => p.role === 'user').content : opts.user_input;
    assert.match(userText, /【需要总结的记忆】\n1\. m1\n2\. m2$/);
    assert.equal(`${carrier}${userText}`.includes('m3'), false);
  } finally { await t.restore(); }
});

test('问题一：一份 100 万字以上的大存档，附带部分在 3 万字内', async () => {
  const t = await setup();
  try {
    const save = t.createMinimalSaveDataV3();
    const blob = '正典资料'.repeat(100000); // 每块 40 万字
    save.世界.剧本资料 = blob;
    save.社交.关系 = { 某人: { 名字: '某人', 描述: blob } };
    save.社交.记忆 = { 短期记忆: [blob], 中期记忆: Array.from({ length: 49 }, (_, i) => `中期记忆第${i}条：`.padEnd(200, '事')), 长期记忆: [], 隐式中期记忆: [blob] };
    save.系统.历史 = { 叙事: [], 其他: blob };
    assert.ok(JSON.stringify(save).length > 1_000_000);
    // private 方法：TS 层面私有，测试直接调，避免为测试开新出口。
    const extracted = t.AIBidirectionalSystem._extractEssentialDataForSummary(save);
    assert.deepEqual(Object.keys(extracted).sort(), ['元数据', '角色'].sort());
    const size = JSON.stringify(extracted, null, 2).length;
    assert.ok(size < 30000, `附带存档 ${size} 字，应在 3 万字内`);
    extracted.角色.草稿标记 = 'x';
    assert.equal('草稿标记' in save.角色, false, '不改动传入的存档');
  } finally { await t.restore(); }
});
