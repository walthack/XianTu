// 真实 tryModularTurn 管线（模型调用被截获，不联网）：结算出的事实行真的出现在叙事模型的提示里，
// 被作用的人的角色卡带着刚写的记忆与大事。验证 P0 的“事实行进模型提示”和“记忆被模型看见”在运行中成立。
import assert from 'node:assert/strict';
import test from 'node:test';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';
import { DUAN_QIANG, NING_YU, WANG_ZHE, makeSave, mods, runJudged, ticket } from './freeActionFixture.mjs';

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: {
    '@': fileURLToPath(new URL('../src', import.meta.url)),
    '@/stores/characterStore': fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts', import.meta.url)),
  },
});
const load = rel => jiti.import(new URL(rel, import.meta.url).pathname);
const quiet = async fn => { const saved = {}; for (const k of ['log', 'info', 'warn', 'debug']) { saved[k] = console[k]; console[k] = () => {}; } try { return await fn(); } finally { Object.assign(console, saved); } };

async function capture(save, userMessage) {
  setActivePinia(createPinia());
  const { useAPIManagementStore } = await load('../src/stores/apiManagementStore.ts');
  useAPIManagementStore().apiConfigs = [{ id: 'default', name: 'fixture', provider: 'custom', url: 'https://example.invalid/v1', apiKey: 'fixture-not-a-real-key', model: 'fixture', enabled: true }];
  const { AIBidirectionalSystem } = await load('../src/utils/AIBidirectionalSystem.ts');
  const { aiService } = await load('../src/services/aiService.ts');
  const calls = [];
  const original = { generate: aiService.generate, generateRaw: aiService.generateRaw };
  aiService.generate = async options => { calls.push(options); return '他没有说话，只是看着你。'; };
  aiService.generateRaw = async () => { throw new Error('unexpected generateRaw'); };
  try {
    await quiet(() => AIBidirectionalSystem.tryModularTurn(structuredClone(save), { playerIntentText: '我拔刀砍向王哲' }, 'free-action-test', () => false, userMessage));
  } finally { Object.assign(aiService, original); }
  assert.ok(calls.length >= 1, '截获到了叙事模型请求');
  const system = calls[0].injects[0].content;
  const from = system.indexOf('\n场景材料：') + '\n场景材料：'.length;
  return { system, input: JSON.stringify(calls[0]), scene: JSON.parse(system.slice(from, system.indexOf('\n历史摘录（'))) };
}

test('结算后的事实行进入叙事提示（场景 action 与模型输入各一次）；被作用者的角色卡带着刚写的记忆和大事', async () => {
  const save = makeSave({ present: [WANG_ZHE, NING_YU], favor: { [WANG_ZHE]: 55, [NING_YU]: 30 } });
  const { result } = runJudged(save, ticket('physical', 'attack', WANG_ZHE), 'success');
  const block = mods.facts.renderSettledBlock(result.facts);
  const userMessage = `<行动趋向>我拔刀砍向王哲</行动趋向>\n${block}`;
  const { system, input, scene } = await capture(save, userMessage);
  assert.ok(system.includes(result.facts[0]) || input.includes(result.facts[0]), '事实行进了模型提示');
  assert.ok(input.includes('本地自由行动已结算'));
  const wang = scene.presentActors.find(a => a.characterId === WANG_ZHE);
  assert.ok(wang?.card?.some(line => line.startsWith('最近记忆：') && line.includes('动了手')), JSON.stringify(wang?.card));
  assert.ok(wang.card.some(line => line.startsWith('相关重大事件：') && line.includes('动了手')), '好感变化 ≥ 10 → 大事 episode 进了“相关重大事件”');
});

test('“未发生”事实行同样进入叙事提示，叙事不会自行写成功', async () => {
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 }, chapter: 40, realm: '无修为' });
  const refusal = mods.turn.issueFreeActionJudgement(save, [ticket('cast', 'transfer_qi', NING_YU)]);
  assert.ok(refusal.refusalBlock.includes('本地自由行动未发生'));
  const { input } = await capture(save, `<行动趋向>我给凝羽传功</行动趋向>\n${refusal.refusalBlock}`);
  assert.ok(input.includes('本地自由行动未发生') && input.includes('功力不及'));
});

test('被作用者排在在场名单第 3 位以后也进得了前两张角色卡（focus 排序）', async () => {
  const save = makeSave({ present: [NING_YU, WANG_ZHE], favor: { [WANG_ZHE]: 55 } });
  const order = mods.packet.readLocalMemoryCapsule(save, undefined, []).presentActors.map(a => a.characterId);
  assert.ok(order.length >= 3, '夹具：目标要排在 maxCards 之外');
  const last = order[order.length - 1];
  const { result } = runJudged(save, ticket('verbal', 'taunt', last), 'success');
  const { scene } = await capture(save, `<行动趋向>嘲讽</行动趋向>\n${mods.facts.renderSettledBlock(result.facts)}`);
  const carded = scene.presentActors.filter(a => a.card?.length).map(a => a.characterId);
  assert.ok(carded.length <= 2 && carded.includes(last), JSON.stringify({ order, carded }));
  assert.ok(DUAN_QIANG);
});
