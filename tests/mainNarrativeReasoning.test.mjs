// 2026-11-03 用户批准：只压低主叙事请求的推理强度（不换模型、不碰 key）。
// 真机 m69 net.log：主叙事（inChars>50k、json_object、流式）全是 MiniMax-M3.1-Flash，均值约 68 秒、推理约 2.1 万字、ttfb 1–3 秒，
// 请求体从不带推理参数 → MiniMax 官方默认 reasoning_effort=max。
// 修：aiRetry.reasoning.mainNarrative（mod-kit/numbers-runtime.json）——前台回合 usageType=main 请求在模型/主机命中时带 reasoning_effort；
// 意图、模块演出、记忆、审计、后台、无回合请求一律不带。
import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';
import { loadTs } from './loadTs.mjs';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { aiService } = await loadTs('../src/services/aiService.ts');
const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
const { GAME_MODEL_MODULES } = await loadTs('../src/services/moduleModelRuntime.ts');
const policy = await loadTs('../src/services/aiReasoningModelPolicy.ts');

const MINIMAX = { provider: 'custom', url: 'https://api.minimaxi.com/v1', apiKey: '', model: 'MiniMax-M3.1-Flash' };
const MAIN = { usageType: 'main', qingyuTurnId: 'fixture_turn_main_reasoning', requestMaxRetries: 0, maxTokens: 3072 };
const configured = () => numbers.GAME_NUMBERS.aiRetry.reasoning.mainNarrative;

async function streamBodies(options) {
  const original = globalThis.fetch; const bodies = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return new Response('data: {"choices":[{"delta":{"content":"visible"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  };
  try { assert.equal(await aiService.generate({ user_input: 'fixture', should_stream: true, apiConfigOverride: MINIMAX, ...options }), 'visible'); }
  finally { globalThis.fetch = original; }
  return bodies;
}
async function plainBodies(options) {
  const original = axios.post; const bodies = [];
  axios.post = async (_url, body) => { bodies.push(body); return { data: { choices: [{ message: { content: 'visible' }, finish_reason: 'stop' }] } }; };
  try { assert.equal(await aiService.generate({ user_input: 'fixture', should_stream: false, apiConfigOverride: MINIMAX, ...options }), 'visible'); }
  finally { axios.post = original; }
  return bodies;
}

test('配置：主叙事推理档在 mod-kit，默认 low，只认 MiniMax-M3.1-Flash 与 MiniMax 官方主机', () => {
  const main = configured();
  assert.equal(main.effort, 'low');
  assert.ok(new RegExp(main.modelPattern, 'i').test('MiniMax-M3.1-Flash'));
  assert.ok(!new RegExp(main.modelPattern, 'i').test('MiniMax-M2.7-highspeed'), '不对官方未声明支持的模型猜参数');
  assert.ok(!new RegExp(main.modelPattern, 'i').test('MiniMax-M3'));
  for (const host of ['api.minimaxi.com', 'api.minimax.io']) assert.ok(new RegExp(main.hostPattern, 'i').test(host), host);
  for (const host of ['openrouter.ai', 'fixture.invalid', 'api.minimaxi.com.evil.example']) assert.ok(!new RegExp(main.hostPattern, 'i').test(host), host);
  assert.match(main.note, /reasoning_effort/);
});

test('主叙事流式请求体带配置的 reasoning_effort，其余字段不变', async () => {
  const [body] = await streamBodies(MAIN);
  assert.equal(body.reasoning_effort, configured().effort);
  assert.equal(body.model, 'MiniMax-M3.1-Flash', '不换模型');
  assert.equal(body.thinking, undefined, 'M3.1-Flash 传 thinking.disabled 会 400，不发');
  assert.equal(body.reasoning, undefined);
});

test('主叙事非流式（截断补救／降级同一构造）也带配置的 reasoning_effort', async () => {
  const [body] = await plainBodies(MAIN);
  assert.equal(body.reasoning_effort, configured().effort);
});

test('改配置即生效：medium 发 medium，off 不发；非法档位与非法正则被拒', async () => {
  const before = structuredClone(configured());
  try {
    numbers.applyGameNumbers({ aiRetry: { reasoning: { mainNarrative: { effort: 'medium' } } } });
    assert.equal((await streamBodies(MAIN))[0].reasoning_effort, 'medium');
    numbers.applyGameNumbers({ aiRetry: { reasoning: { mainNarrative: { effort: 'off' } } } });
    assert.ok(!('reasoning_effort' in (await streamBodies(MAIN))[0]));
    assert.throws(() => numbers.applyGameNumbers({ aiRetry: { reasoning: { mainNarrative: { effort: 'none' } } } }), /mainNarrative\.effort/);
    assert.throws(() => numbers.applyGameNumbers({ aiRetry: { reasoning: { mainNarrative: { modelPattern: '[' } } } }), /mainNarrative\.modelPattern/);
    assert.throws(() => numbers.applyGameNumbers({ aiRetry: { reasoning: { mainNarrative: { hostPattern: '(' } } } }), /mainNarrative\.hostPattern/);
  } finally { numbers.applyGameNumbers({ aiRetry: { reasoning: { mainNarrative: before } } }); }
  assert.equal(configured().effort, before.effort);
});

test('其他请求不受影响：模块、后台、非 main 用途、无回合、别的模型/主机都不带 reasoning_effort', async () => {
  const cases = {
    '意图/演出模块（reasoningEffort=none、流空闲）': { ...MAIN, reasoningEffort: 'none', timeoutMode: 'content_idle' },
    '显式 low 档的调用方': { ...MAIN, reasoningEffort: 'low' },
    '后台请求': { ...MAIN, background: true },
    '记忆摘要': { ...MAIN, usageType: 'memory_summary' },
    '模块演出计量口径': { ...MAIN, usageType: 'module_narrative' },
    '无回合（开局等）': { ...MAIN, qingyuTurnId: undefined },
    'M2.7-highspeed': { ...MAIN, apiConfigOverride: { ...MINIMAX, model: 'MiniMax-M2.7-highspeed' } },
    '非 MiniMax 主机': { ...MAIN, apiConfigOverride: { ...MINIMAX, url: 'https://fixture.invalid/v1' } },
  };
  for (const [name, options] of Object.entries(cases)) {
    const [body] = await streamBodies(options);
    assert.ok(!('reasoning_effort' in body), name);
  }
  const [plain] = await plainBodies({ ...MAIN, background: true });
  assert.ok(!('reasoning_effort' in plain), '后台非流式');
});

test('游戏模型模块都显式声明推理档，因而不会被当成主叙事', () => {
  // 双模型后端（consistency）改带 backendReasoningEffort，aiService 据此同样不判为主叙事。
  for (const definition of GAME_MODEL_MODULES) assert.ok(definition.policy.reasoningEffort || definition.policy.backendReasoning, definition.id);
});

test('helper：非主叙事或无效 URL 一律空', () => {
  assert.deepEqual(policy.mainNarrativeReasoningParam('https://api.minimaxi.com/v1', 'MiniMax-M3.1-Flash', false), {});
  assert.deepEqual(policy.mainNarrativeReasoningParam('not a url', 'MiniMax-M3.1-Flash', true), {});
  assert.deepEqual(policy.mainNarrativeReasoningParam('https://api.minimaxi.com/v1', 'MiniMax-M3.1-Flash', true), { reasoning_effort: configured().effort });
});

// 同日用户定：普通叙事回合总限时 story.narrativeTurnBudget.totalMs 90000→150000（保底），取自配置、面板不写死。
test('回合总限时 150 秒取自 mod-kit，MainGamePanel 读配置传给 raceTurnBudget、不写死秒数', async () => {
  const { readFileSync } = await import('node:fs');
  const budget = numbers.GAME_NUMBERS.story.narrativeTurnBudget;
  assert.equal(budget.totalMs, 150000);
  assert.match(budget.note, /90000→150000/);
  const merged = JSON.parse(readFileSync(new URL('../mod-kit/game-numbers.qingyu.json', import.meta.url), 'utf8'));
  assert.equal(merged.story.narrativeTurnBudget.totalMs, 150000, '合并产物已重生成');
  const panel = readFileSync(new URL('../src/components/dashboard/MainGamePanel.vue', import.meta.url), 'utf8');
  assert.match(panel, /const budget = \(GAME_NUMBERS\.story as any\)\.narrativeTurnBudget as \{ totalMs: number; notice: string \};/);
  assert.match(panel, /\), Number\(budget\?\.totalMs\) \|\| 0, \(\) => \{/);
  assert.doesNotMatch(panel, /raceTurnBudget\([^)]*\b(90000|150000)\b/);
});
