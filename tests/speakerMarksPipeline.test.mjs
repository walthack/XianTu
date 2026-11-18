// 说话人记号（Q29 修订版做法甲）：真跑 AIBS 落账与下一回合请求（不联网，夹具同 detailNotInSave.test.mjs）。
// 断言：存档里的叙事概要、短期记忆、隐式中期记忆、行动选项都不带记号；本机全文副本带合规记号、写坏的已删；
// 下一回合发给模型的请求不带记号；分步第 2 步的输入不带记号。
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

const detailStore = await load('../src/services/narrativeDetailStore.ts');
const { createMinimalSaveDataV3 } = await load('../src/utils/dataRepair.ts');
const { AIBidirectionalSystem } = await load('../src/utils/AIBidirectionalSystem.ts');
const { useGameStateStore } = await load('../src/stores/gameStateStore.ts');
const { useCharacterStore } = await load('./stubs/characterStoreForAbortTest.ts');
const { aiService } = await load('../src/services/aiService.ts');

const CHAR = 'char-speaker-marks';
const PROFILE = { 模式: '单机', 角色: { 名字: '程宗扬', 性别: '男' }, 存档列表: {} };
// 记号用提示词例子里没有的名字，便于在整份请求里查漏（提示词本身含〈凝羽〉〈你〉〈掌柜〉示例）。
const TEXT = '易虎收起短刀。〈易虎〉“路通了。”你点点头。〈程宗扬〉“走吧。”他看向〈易虎〉身后。〈易虎“缺括号的这句。”';
const MID = '〈易虎〉易虎说路通了，〈程宗扬〉程宗扬决定上路。';
const OPTIONS = ['〈易虎〉跟着易虎走', '〈程宗扬〉“先歇一会”'];
const LEAK = /〈(?:易虎|程宗扬)/;
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
async function playTurn(save) {
  useGameStateStore().loadFromSaveData(save);
  const restore = quiet();
  try {
    const { saveData } = await AIBidirectionalSystem.processGmResponse(
      { text: TEXT, mid_term_memory: MID, tavern_commands: [], action_options: OPTIONS }, save, false, () => false, { userAction: '跟上' });
    await flush();
    return saveData;
  } finally { restore(); }
}

test('落账：概要、短期记忆、隐式中期记忆、叙事条目、行动选项不带记号；全文副本只留合规记号', async () => {
  fresh();
  const saved = await playTurn(createMinimalSaveDataV3());
  const gm = saved.系统.历史.叙事.filter(item => item.type === 'gm').at(-1);
  assert.doesNotMatch(JSON.stringify(saved), LEAK, '整份存档不得带记号');
  assert.ok(gm.content.endsWith('易虎说路通了，程宗扬决定上路。'), gm.content);
  for (const key of ['短期记忆', '隐式中期记忆']) assert.ok(saved.社交.记忆[key].at(-1).endsWith('易虎说路通了，程宗扬决定上路。'), key);
  assert.deepEqual(gm.actionOptions, ['跟着易虎走', '“先歇一会”']);
  const detail = await detailStore.getDetail(CHAR, gm.detailId);
  assert.ok(detail.endsWith('易虎收起短刀。〈易虎〉“路通了。”你点点头。〈程宗扬〉“走吧。”他看向身后。“缺括号的这句。”'), detail);
});

test('下一回合请求：发给模型的上下文不带记号', async () => {
  fresh();
  const saved = await playTurn(createMinimalSaveDataV3());
  useGameStateStore().loadFromSaveData(saved);
  const calls = [];
  const original = { generate: aiService.generate, generateRaw: aiService.generateRaw, checkAvailability: aiService.checkAvailability };
  aiService.checkAvailability = () => ({ available: true, message: 'test' });
  aiService.generate = async options => { calls.push(options); const e = new Error('captured'); e.name = 'AbortError'; throw e; };
  aiService.generateRaw = async options => { calls.push(options); throw new Error('captured raw'); };
  const restore = quiet();
  try {
    await AIBidirectionalSystem.processPlayerAction('继续赶路', PROFILE, { shouldAbort: () => false, playerIntentText: '继续赶路' });
  } catch { /* 截获即止 */ } finally { restore(); Object.assign(aiService, original); }
  const main = calls.find(call => call.usageType === 'main');
  assert.ok(main, '应发出主叙事请求');
  assert.ok(JSON.stringify(main).includes('易虎说路通了'), '最近事件应含上回合概要');
  assert.doesNotMatch(JSON.stringify(main), LEAK);
});

test('分步第 2 步：发给模型的【第1步正文】不带记号', async () => {
  fresh();
  useGameStateStore().loadFromSaveData(createMinimalSaveDataV3());
  const calls = [];
  const original = { generate: aiService.generate, generateRaw: aiService.generateRaw, checkAvailability: aiService.checkAvailability };
  aiService.checkAvailability = () => ({ available: true, message: 'test' });
  aiService.generate = async options => {
    calls.push(options);
    if (String(options.generation_id).includes('_step1_')) return JSON.stringify({ text: TEXT });
    const e = new Error('captured'); e.name = 'AbortError'; throw e;
  };
  const restore = quiet();
  try {
    await AIBidirectionalSystem.processPlayerAction('继续赶路', PROFILE, { shouldAbort: () => false, playerIntentText: '继续赶路', splitResponseGeneration: true });
  } catch { /* 截获即止 */ } finally { restore(); Object.assign(aiService, original); }
  const step2 = calls.find(call => String(call.generation_id).includes('_step2_'));
  assert.ok(step2, '应发出分步第 2 步请求');
  assert.match(step2.user_input, /【第1步正文】\n易虎收起短刀。“路通了。”/);
  assert.doesNotMatch(step2.user_input, /[〈〉]/);
});

// Q30 第 1 点（用户 2026-11-18 20:08 批）：查看物品／打量人物的自由回合，摘进存档的描述与外貌状态不带记号。
test('查看物品、打量人物：写进存档的物品描述与当前外貌状态不带记号', async () => {
  fresh();
  const save = createMinimalSaveDataV3();
  save.角色.背包 = { ...(save.角色.背包 || {}), 物品: { item_knife: { 物品ID: 'item_knife', 名称: '短刀', 类型: '其他', 数量: 1, 描述: '' } } };
  save.社交.关系 = { ...(save.社交.关系 || {}), 易虎: { 名字: '易虎', 性别: '男', 外貌描述: '' } };
  useGameStateStore().loadFromSaveData(save);
  const restore = quiet();
  let saved;
  try {
    ({ saveData: saved } = await AIBidirectionalSystem.processGmResponse(
      { text: '你细看短刀，刃口有一道缺痕。〈易虎〉“这短刀跟了我十年。”易虎身形魁梧，披着旧皮甲。〈程宗扬〉“好刀。”', mid_term_memory: MID, tavern_commands: [], action_options: [] },
      save, false, () => false, { userAction: '查看短刀，打量易虎' }));
    await flush();
  } finally { restore(); }
  assert.ok(String(saved.角色.背包.物品.item_knife.描述).includes('短刀'), '应写入查看后的物品描述：' + saved.角色.背包.物品.item_knife.描述);
  assert.ok(String(saved.社交.关系.易虎.当前外貌状态 || '').length > 0, '应写入打量后的外貌状态');
  assert.doesNotMatch(JSON.stringify(saved), LEAK, '整份存档不得带记号');
});

// 模块演出「正文必须出现『你』」那条写在 AIBS 的大函数里，没有单独可调的入口；这里只钉住源码用的是去记号后的正文。
test('模块演出：「正文必须出现你」按去记号后的正文判断（源码钉）', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/utils/AIBidirectionalSystem.ts', import.meta.url), 'utf8');
  assert.ok(source.includes("!stripSpeakerMarks(text).includes('你')"));
  assert.equal(source.includes("!text.includes('你')"), false);
});
