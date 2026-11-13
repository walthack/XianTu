// work/ASK-USER.md Q21（草稿·待用户批准）：战斗「掷骰后的描写」请求带 aiRetry.reasoning.sceneNarration.effort（默认 low）；
// 同一场战斗里的「行动识别」请求与场内闲聊请求不带。抓的是 aiService 实际组装的请求体（替身 fetch）。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadTs } from './loadTs.mjs';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { aiService } = await loadTs('../src/services/aiService.ts');
const { GAME_MODEL_MODULES, createModuleModelRuntime } = await loadTs('../src/services/moduleModelRuntime.ts');
const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
const recognize = await loadTs('../src/modules/sceneModule/host/recognize.ts');
const host = await loadTs('../src/modules/sceneModule/host/controller.ts');
const ext = await loadTs('../src/modules/sceneModule/host/ext.ts');
const trial = await loadTs('../src/dev/combatTrial/overlay.ts');

const MINIMAX = { id: 'fixture', enabled: true, provider: 'custom', url: 'https://api.minimaxi.com/v1', apiKey: '', model: 'MiniMax-M3.1-Flash', maxTokens: 4096 };
const runtime = createModuleModelRuntime({
  definitions: GAME_MODEL_MODULES,
  resolveRoute: () => ({ config: MINIMAX, inherited: true, viaHost: false }),
  isEnabled: () => true,
  generate: options => aiService.generate(options),
});
// 同 MainGamePanel.vue 的 ask(moduleId)：generationId 由 sceneGenerationId 决定（缺这个函数时按改动前的写法）。
const ask = moduleId => async (request, signal) => (await runtime.run(moduleId, {
  system: request.system, input: request.user, signal,
  generationId: recognize.sceneGenerationId ? recognize.sceneGenerationId(moduleId, request) : `scene_${moduleId}_${Date.now()}`,
})).raw;

const INTENT_ACTION = JSON.stringify({ goal: 'survive', claim: { magnitude: 1, scope: 'single', targets: [] }, levers: [], inputClass: 'action' });
async function capture(run) {
  const original = globalThis.fetch; const sent = [];
  let intentReply = INTENT_ACTION;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    const system = body.messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
    const kind = system.includes('你是游戏的叙事者，只负责把已经结') ? 'narration' : system.includes('只回答场内闲聊') ? 'chat' : 'intent';
    sent.push({ kind, body });
    const content = kind === 'intent' ? intentReply : kind === 'chat' ? '对方只是听着你的话。' : '你压低身形，护住要害，那一击擦着你的肩头过去。';
    return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
  };
  try { await run(reply => { intentReply = reply; }); } finally { globalThis.fetch = original; }
  return sent;
}
async function f03() {
  globalThis.location = { search: '?sceneModule=on', hostname: 'localhost', href: 'http://localhost/?sceneModule=on' };
  const data = JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_04.json', import.meta.url), 'utf8'));
  let save = trial.createSceneCombatTrialSave(data, { mode: 'B' });
  const deps = { persist: async next => { save = structuredClone(next); }, askIntent: ask('intent'), askNarrative: ask('narrative') };
  return { get save() { return save; }, deps };
}

test('战斗：掷骰后的描写请求体带 reasoning_effort=low；行动识别、场内闲聊请求不带', async () => {
  assert.equal(numbers.GAME_NUMBERS.aiRetry.reasoning.sceneNarration?.effort, 'low');
  const h = await f03();
  const sent = await capture(async setIntent => {
    await host.submitSceneInput(h.save, '我放低姿态，护住要害，等待这一击。', h.deps);
    setIntent(JSON.stringify({ inputClass: 'chat' }));
    await host.submitSceneInput(h.save, '你好', h.deps);
    setIntent(INTENT_ACTION);
    await host.submitSceneInput(h.save, '我放低姿态，护住要害，等待这一击。', h.deps);
    assert.ok(ext.activeScene(h.save).pending, '识别出打法、待确认');
    await host.confirmSceneAction(h.save, h.deps);
  });
  const of = kind => sent.filter(s => s.kind === kind);
  assert.ok(of('narration').length >= 1, '发出了战斗描写请求');
  assert.ok(of('intent').length >= 2, '发出了行动识别请求');
  assert.ok(of('chat').length >= 1, '发出了场内闲聊请求');
  for (const { body } of of('narration')) assert.equal(body.reasoning_effort, 'low');
  for (const { body } of of('intent')) assert.ok(!('reasoning_effort' in body), '行动识别不带');
  for (const { body } of of('chat')) assert.ok(!('reasoning_effort' in body), '场内闲聊不带');
  delete globalThis.location;
});

test('战斗描写推理档：off 不发；名单外模型不发；非法档位被拒', async () => {
  const h = await f03();
  const narrate = async () => (await capture(async () => {
    await host.submitSceneInput(h.save, '我放低姿态，护住要害，等待这一击。', h.deps);
    await host.confirmSceneAction(h.save, h.deps);
  })).filter(s => s.kind === 'narration');
  try {
    numbers.applyGameNumbers({ aiRetry: { reasoning: { sceneNarration: { effort: 'off' } } } });
    const off = await narrate();
    assert.ok(off.length >= 1);
    for (const { body } of off) assert.ok(!('reasoning_effort' in body));
    assert.throws(() => numbers.applyGameNumbers({ aiRetry: { reasoning: { sceneNarration: { effort: 'none' } } } }), /sceneNarration\.effort/);
  } finally { numbers.applyGameNumbers({ aiRetry: { reasoning: { sceneNarration: { effort: 'low' } } } }); }
  const original = MINIMAX.model; MINIMAX.model = 'MiniMax-M2.7-highspeed';
  try {
    const other = await narrate();
    assert.ok(other.length >= 1);
    for (const { body } of other) assert.ok(!('reasoning_effort' in body));
  } finally { MINIMAX.model = original; delete globalThis.location; }
});

test('MainGamePanel 的 ask 用 sceneGenerationId 定 generationId', async () => {
  const panel = await readFile(new URL('../src/components/dashboard/MainGamePanel.vue', import.meta.url), 'utf8');
  assert.match(panel, /generationId: sceneGenerationId\(moduleId, request\)/);
});
