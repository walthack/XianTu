// 双模型第4步（设计稿 2026-11-03-双模型分工 ②⑥⑧③，用户 22:26 定稿）：接线，AIBS 0 行。
// 钉住：后端开/关两种主叙事提示词（N4-A：关时与原先逐字相同）、概要写法读 memory.summaryMaxChars、开关同 isGameModuleEnabled 口径、
// 主叙事推理档不随后端开关变化。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
const memory = new Map();
globalThis.localStorage = { getItem: k => memory.has(k) ? memory.get(k) : null, setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) };
globalThis.window ||= globalThis;
globalThis.window.location ||= { hostname: 'localhost', href: 'http://localhost/' };
const { createPinia, setActivePinia } = await import('pinia');
const jiti = createJiti(import.meta.url, { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } });
const prompts = await jiti.import('../src/services/prompts/defaultPrompts.ts');
const { DUAL_MODEL_CONFIG } = await jiti.import('../src/services/dualModelConfig.ts');
const { RESPONSE_FORMAT_RULES } = await jiti.import('../src/utils/prompts/definitions/coreRules.ts');
const { aiService } = await jiti.import('../src/services/aiService.ts');
const numbers = await jiti.import('../src/modules/sceneModule/numbers.ts');

const DM = DUAL_MODEL_CONFIG.dualModel;
const FRONT = DM.frontend;
const SUMMARY = FRONT.summaryInstruction.replace('{summaryMaxChars}', String(DUAL_MODEL_CONFIG.memory.summaryMaxChars));
const ORIGINAL_NPC_LINE = /□ NPC记忆（事件事实概要，一条一事，不超过 \d+ 字） → push `社交\.关系\.\["角色ID"\]\.记忆`/;
const withDual = async (value, fn) => { const before = DM.enabled; DM.enabled = value; try { return await fn(); } finally { DM.enabled = before; } };
async function freshStore() {
  setActivePinia(createPinia());
  const { useAPIManagementStore } = await jiti.import('../src/stores/apiManagementStore.ts');
  return useAPIManagementStore();
}

test('提示词（关）：默认关，coreOutputRules／分步指令与原先一致——前端照写 NPC 记忆，无概要写法条', () => {
  assert.equal(DM.enabled, false);
  assert.equal(prompts.backendWritesNpcMemory(), false);
  const off = prompts.getSystemPrompts();
  assert.equal(off.coreOutputRules.content, prompts.getSystemPrompts({ backendWritesNpcMemory: false }).coreOutputRules.content);
  assert.equal(off.splitGenerationStep2.content, prompts.getSystemPrompts({ backendWritesNpcMemory: false }).splitGenerationStep2.content);
  assert.ok(RESPONSE_FORMAT_RULES.includes(prompts.CORE_NPC_MEMORY_PUSH), 'coreRules 仍含被替换片段，改了要同步');
  assert.ok(off.coreOutputRules.content.includes(`好感add${prompts.CORE_NPC_MEMORY_PUSH}/内心set`));
  assert.match(off.splitGenerationStep2.content, ORIGINAL_NPC_LINE);
  assert.match(off.splitGenerationStep2.content, /□ 好感变化 → add `社交\.关系\.\["角色ID"\]\.好感度`/);
  for (const key of ['coreOutputRules', 'splitGenerationStep2']) {
    assert.ok(!off[key].content.includes(FRONT.npcMemoryInstruction), key);
    assert.ok(!off[key].content.includes(SUMMARY), key);
  }
});

test('提示词（开）：前端不写 社交.关系.*.记忆、好感照写；概要写法带 summaryMaxChars；其余提示词不变', () => {
  const off = prompts.getSystemPrompts({ backendWritesNpcMemory: false });
  const on = prompts.getSystemPrompts({ backendWritesNpcMemory: true });
  assert.ok(SUMMARY.includes(`${DUAL_MODEL_CONFIG.memory.summaryMaxChars} 字`));
  assert.ok(!on.coreOutputRules.content.includes(prompts.CORE_NPC_MEMORY_PUSH));
  assert.ok(on.coreOutputRules.content.includes('好感add/内心set'), '好感照写');
  assert.ok(on.coreOutputRules.content.endsWith(`\n${FRONT.npcMemoryInstruction}\n${SUMMARY}`));
  const step2 = on.splitGenerationStep2.content;
  assert.doesNotMatch(step2, ORIGINAL_NPC_LINE);
  assert.doesNotMatch(step2, /push `社交\.关系\.\["角色ID"\]\.记忆`/);
  assert.ok(step2.includes(`□ ${FRONT.npcMemoryInstruction}`));
  assert.match(step2, /□ 好感变化 → add `社交\.关系\.\["角色ID"\]\.好感度`/);
  assert.ok(step2.includes(`"action_options":["选项1","选项2","选项3","选项4","选项5"]}\n${SUMMARY}\n`), '概要写法紧跟输出格式');
  // 只换上述一行、加一条；其余逐字不变。
  assert.equal(step2.replace(`\n${SUMMARY}`, '').replace(`□ ${FRONT.npcMemoryInstruction}`, ''), off.splitGenerationStep2.content.replace(ORIGINAL_NPC_LINE, ''));
  // 世界生成等提示词每次带随机会话 ID／种子，先剔除自身不稳定的项再比。
  const again = prompts.getSystemPrompts({ backendWritesNpcMemory: false });
  const stable = Object.keys(off).filter(k => off[k].content === again[k].content);
  assert.ok(stable.includes('splitInitStep2') && stable.includes('businessRules') && stable.includes('splitGenerationStep1'));
  for (const key of stable.filter(k => !['coreOutputRules', 'splitGenerationStep2'].includes(k))) {
    assert.equal(on[key].content, off[key].content, `${key} 不随后端开关变化（含开局指令、正文提示，不改正文尺度）`);
  }
});

test('开关口径（N3-A／N4-A）：dualModel.enabled 与玩家开关都开才由后端写；任一关恢复前端写；无 pinia 按关', async () => {
  const store = await freshStore();
  const id = DM.backend.moduleId;
  for (const [master, player, expected] of [[true, true, true], [true, false, false], [false, true, false], [false, false, false]]) {
    store.setModuleEnabled(id, player);
    assert.equal(await withDual(master, () => prompts.backendWritesNpcMemory()), expected, `${master}/${player}`);
  }
  store.setModuleEnabled(id, true);
  await withDual(true, async () => {
    assert.ok(prompts.getSystemPrompts().splitGenerationStep2.content.includes(FRONT.npcMemoryInstruction), '默认参数读开关');
    FRONT.writesNpcMemory = true;
    try { assert.equal(prompts.backendWritesNpcMemory(), false, 'writesNpcMemory=true＝前端照写'); }
    finally { FRONT.writesNpcMemory = false; }
  });
});

test('主叙事推理档不变：后端开启时主叙事请求仍带配置的 low，不带后端档', async () => {
  const store = await freshStore();
  store.setModuleEnabled(DM.backend.moduleId, true);
  store.setModuleReasoningEffort(DM.backend.moduleId, 'max');
  assert.equal(numbers.GAME_NUMBERS.aiRetry.reasoning.mainNarrative.effort, 'low');
  const original = globalThis.fetch; const bodies = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return new Response('data: {"choices":[{"delta":{"content":"visible"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  };
  try {
    await withDual(true, async () => {
      assert.equal(prompts.backendWritesNpcMemory(), true);
      await aiService.generate({ user_input: 'fixture', should_stream: true, usageType: 'main', qingyuTurnId: 'fixture_turn_dual_wiring', requestMaxRetries: 0, maxTokens: 3072,
        apiConfigOverride: { provider: 'custom', url: 'https://api.minimaxi.com/v1', apiKey: '', model: 'MiniMax-M3.1-Flash' } });
    });
  } finally { globalThis.fetch = original; }
  const chat = bodies.filter(body => body.model);
  assert.equal(chat.length, 1);
  assert.equal(chat[0].reasoning_effort, 'low');
});
