// 双模型第1步（设计稿 2026-11-03-双模型分工 ⑤⑧，用户 22:26 定稿）：mod-kit/dual-model.json 配置与后端推理档注入，不接线。
// 钉住：后端请求带档、其他模块不带、主叙事不变、名单外不发（N2-A）、max 显式发送、'default'/缺省回落配置。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import axios from 'axios';
import { loadTs } from './loadTs.mjs';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { aiService } = await loadTs('../src/services/aiService.ts');
const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
const registry = await loadTs('../src/modules/sceneModule/numbersRegistry.ts');
const policy = await loadTs('../src/services/aiReasoningModelPolicy.ts');
const dual = await loadTs('../src/services/dualModelConfig.ts');

const json = JSON.parse(readFileSync(new URL('../mod-kit/dual-model.json', import.meta.url), 'utf8'));
const MINIMAX = { provider: 'custom', url: 'https://api.minimaxi.com/v1', apiKey: '', model: 'MiniMax-M3.1-Flash' };
const MAIN = { usageType: 'main', qingyuTurnId: 'fixture_turn_dual_backend', requestMaxRetries: 0, maxTokens: 3072 };
const BACKEND = { ...MAIN, usageType: 'memory_summary', background: true, qingyuTurnId: undefined, backendReasoningEffort: 'default' };
const configuredBackend = () => dual.DUAL_MODEL_CONFIG.dualModel.backend.reasoningEffort;

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

test('配置：dual-model.json 按设计稿⑤与 22:26 定稿，校验通过', () => {
  const { dualModel, memory } = json;
  assert.equal(dualModel.enabled, false, '总开关默认关');
  assert.equal(dualModel.backend.moduleId, 'consistency');
  assert.equal(dualModel.backend.inheritUsageType, 'memory_summary');
  assert.equal(dualModel.backend.defaultModel, 'MiniMax-M3.1-Flash');
  assert.equal(dualModel.backend.reasoningEffort, 'max');
  assert.equal(dualModel.frontend.writesNpcMemory, false);
  assert.deepEqual(dualModel.billing.allowedModels, ['^MiniMax-M3\\.1-Flash$']);
  assert.equal(dualModel.billing.blockUnlisted, true);
  assert.ok(Number.isInteger(memory.summaryMaxChars) && memory.summaryMaxChars > 0);
  assert.ok(memory.moderatedPlaceholder.trim());
  assert.deepEqual(dual.validateDualModelConfig(), []);
  assert.deepEqual(structuredClone(dual.DUAL_MODEL_CONFIG), json);
});

test('白名单：大小写不敏感、全名锚定，含默认后端模型，不放行同前缀型号', () => {
  const allowed = json.dualModel.billing.allowedModels.map(p => new RegExp(p, 'i'));
  const hit = model => allowed.some(re => re.test(model));
  assert.ok(hit(json.dualModel.backend.defaultModel));
  assert.ok(hit('minimax-m3.1-flash'));
  for (const model of ['MiniMax-M3.1-Flash-Pro', 'MiniMax-M3', 'MiniMax-M3x1-Flash', 'MiniMax-M2.7-highspeed']) assert.ok(!hit(model), model);
});

test('校验：reasoningEffort 取值与 numbersRegistry 主叙事 oneOf 同表；坏值被拒', () => {
  const mainSpec = registry.FIELD_SPECS.find(spec => spec.path === 'aiRetry.reasoning.mainNarrative.effort');
  assert.equal(mainSpec.oneOf, registry.REASONING_EFFORT_LEVELS, '主叙事与后端共用一张取值表');
  for (const effort of registry.REASONING_EFFORT_LEVELS) {
    const tree = structuredClone(json); tree.dualModel.backend.reasoningEffort = effort;
    assert.deepEqual(dual.validateDualModelConfig(tree), [], effort);
  }
  const bad = (mutate, pattern) => { const tree = structuredClone(json); mutate(tree); assert.match(dual.validateDualModelConfig(tree).join('；'), pattern); };
  bad(t => { t.dualModel.backend.reasoningEffort = 'none'; }, /backend\.reasoningEffort/);
  bad(t => { t.dualModel.backend.reasoningEffort = 'default'; }, /backend\.reasoningEffort/);
  bad(t => { t.dualModel.billing.allowedModels = ['(']; }, /allowedModels 含无效正则/);
  bad(t => { t.dualModel.billing.allowedModels = 'x'; }, /allowedModels/);
  bad(t => { t.dualModel.enabled = 'false'; }, /dualModel\.enabled/);
  bad(t => { t.dualModel.backend.timeoutMs = 0; }, /backend\.timeoutMs/);
  bad(t => { t.dualModel.backend.waitMs = -1; }, /backend\.waitMs/);
  bad(t => { delete t.dualModel.backend.defaultModel; }, /backend\.defaultModel/);
  bad(t => { t.memory.moderatedPlaceholder = ' '; }, /moderatedPlaceholder/);
  bad(t => { t.memory.summaryMaxChars = 1.5; }, /summaryMaxChars/);
});

test('后端流式与非流式请求体带配置档位（default→max），max 显式发送、不靠省略', async () => {
  const [stream] = await streamBodies(BACKEND);
  assert.equal(stream.reasoning_effort, 'max');
  assert.equal(stream.reasoning_effort, configuredBackend());
  assert.equal(stream.model, 'MiniMax-M3.1-Flash', '不换模型');
  assert.equal(stream.thinking, undefined, 'M3.1-Flash 不发 thinking.disabled');
  const [plain] = await plainBodies(BACKEND);
  assert.equal(plain.reasoning_effort, 'max');
});

test('后端档位取调用方传入值；与主叙事互斥（即使 usageType=main 且在回合内）', async () => {
  for (const effort of ['low', 'medium', 'high', 'xhigh', 'max']) {
    assert.equal((await streamBodies({ ...BACKEND, backendReasoningEffort: effort }))[0].reasoning_effort, effort, effort);
  }
  const [mutual] = await streamBodies({ ...MAIN, backendReasoningEffort: 'high' });
  assert.equal(mutual.reasoning_effort, 'high', '后端请求不被当成主叙事发 low');
  const [mutualPlain] = await plainBodies({ ...MAIN, backendReasoningEffort: 'medium' });
  assert.equal(mutualPlain.reasoning_effort, 'medium');
});

test('名单外不发（N2-A）：别的模型、别的主机、无效 URL', async () => {
  const cases = {
    'M2.7-highspeed': { ...BACKEND, apiConfigOverride: { ...MINIMAX, model: 'MiniMax-M2.7-highspeed' } },
    'MiniMax-M3': { ...BACKEND, apiConfigOverride: { ...MINIMAX, model: 'MiniMax-M3' } },
    '非 MiniMax 主机': { ...BACKEND, apiConfigOverride: { ...MINIMAX, url: 'https://fixture.invalid/v1' } },
    '仿冒主机': { ...BACKEND, apiConfigOverride: { ...MINIMAX, url: 'https://api.minimaxi.com.evil.example/v1' } },
  };
  for (const [name, options] of Object.entries(cases)) assert.ok(!('reasoning_effort' in (await streamBodies(options))[0]), name);
  assert.deepEqual(policy.backendReasoningParam('not a url', 'MiniMax-M3.1-Flash', true, 'max'), {});
});

test('其他模块与普通请求不带；主叙事档位不变', async () => {
  const cases = {
    '后台记忆（未标后端）': { ...BACKEND, backendReasoningEffort: undefined },
    '意图/演出模块': { ...MAIN, reasoningEffort: 'none', timeoutMode: 'content_idle' },
    '显式 low 档模块': { ...MAIN, reasoningEffort: 'low' },
    '模块演出计量口径': { ...MAIN, usageType: 'module_narrative' },
  };
  for (const [name, options] of Object.entries(cases)) assert.ok(!('reasoning_effort' in (await streamBodies(options))[0]), name);
  const mainEffort = numbers.GAME_NUMBERS.aiRetry.reasoning.mainNarrative.effort;
  assert.equal(mainEffort, 'low', '主叙事配置不动');
  assert.equal((await streamBodies(MAIN))[0].reasoning_effort, mainEffort);
  assert.equal((await plainBodies(MAIN))[0].reasoning_effort, mainEffort);
});

test('helper：非后端为空；default/缺省/坏值回落配置；off 不发；跟随 mainNarrative 名单', () => {
  const url = 'https://api.minimaxi.com/v1'; const model = 'MiniMax-M3.1-Flash';
  assert.deepEqual(policy.backendReasoningParam(url, model, false, 'max'), {});
  for (const effort of ['default', undefined, 'bogus', 'none', 'off']) {
    assert.deepEqual(policy.backendReasoningParam(url, model, true, effort), { reasoning_effort: configuredBackend() }, String(effort));
  }
  const before = dual.DUAL_MODEL_CONFIG.dualModel.backend.reasoningEffort;
  try {
    dual.DUAL_MODEL_CONFIG.dualModel.backend.reasoningEffort = 'off';
    assert.deepEqual(policy.backendReasoningParam(url, model, true, 'default'), {}, '配置 off＝不发');
    assert.deepEqual(policy.backendReasoningParam(url, model, true, 'medium'), { reasoning_effort: 'medium' }, '玩家显式档位优先');
  } finally { dual.DUAL_MODEL_CONFIG.dualModel.backend.reasoningEffort = before; }
  const main = structuredClone(numbers.GAME_NUMBERS.aiRetry.reasoning.mainNarrative);
  try {
    numbers.applyGameNumbers({ aiRetry: { reasoning: { mainNarrative: { modelPattern: '^fixture-model$' } } } });
    assert.deepEqual(policy.backendReasoningParam(url, model, true, 'max'), {}, '名单改了就跟着不发');
    assert.deepEqual(policy.backendReasoningParam(url, 'fixture-model', true, 'max'), { reasoning_effort: 'max' });
  } finally { numbers.applyGameNumbers({ aiRetry: { reasoning: { mainNarrative: main } } }); }
});
