import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';
const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,String(v)), removeItem: k => storage.delete(k) };
globalThis.window = { location: { hostname: 'localhost' }, localStorage: globalThis.localStorage };
setActivePinia(createPinia());
const jiti = createJiti(import.meta.url, { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } });
const { useAPIManagementStore } = await jiti.import('../src/stores/apiManagementStore.ts');
const { runBeatJudgeModule, resolveBeatJudgeRoute } = await jiti.import('../src/services/gameModelModules.ts');
const { beatJudgeModuleDefinition } = await jiti.import('../src/services/moduleModelRuntime.ts');
const { aiService } = await jiti.import('../src/services/aiService.ts');
const { backendReasoningParam } = await jiti.import('../src/services/aiReasoningModelPolicy.ts');
const cfg = (id, model) => ({ id, name:id, model, provider:'custom', url:'https://api.minimaxi.com/v1', apiKey:'fixture', enabled:true, maxTokens:4096 });
const judgeOf = f => JSON.parse(readFileSync(new URL(`../mod-kit/${f}`, import.meta.url), 'utf8')).story.quest.intentSettle.beatJudge;

test('beatJudge config: model M2.7-highspeed, low/512, 10s + 1 retry (both config copies)', () => {
  for (const f of ['numbers-progress.json', 'game-numbers.qingyu.json']) {
    const j = judgeOf(f);
    assert.equal(j.model, 'MiniMax-M2.7-highspeed', f);
    assert.equal(j.reasoningEffort, 'low', f);
    assert.equal(j.maxTokensWithReasoning, 512, f);
    assert.equal(j.timeoutMs, 10000, f);
    assert.equal(j.timeoutRetries, 1, f);
  }
});

test('beat_judge swaps only the model name; main connection untouched', async () => {
  const api = useAPIManagementStore();
  api.apiConfigs = [cfg('main-selected', 'MiniMax-M3.1-Flash')];
  api.assignAPI('main', 'main-selected');
  const judge = judgeOf('numbers-progress.json');
  const route = resolveBeatJudgeRoute(beatJudgeModuleDefinition(judge), judge.model);
  assert.equal(route.config.model, 'MiniMax-M2.7-highspeed');
  assert.equal(route.config.id, 'main-selected');
  assert.equal(api.apiConfigs[0].model, 'MiniMax-M3.1-Flash', '主流程配置不被改写');
  assert.equal(resolveBeatJudgeRoute(beatJudgeModuleDefinition(judge), '').config.model, 'MiniMax-M3.1-Flash', '空＝同主流程');
  const original = aiService.generate;
  let seen;
  aiService.generate = async o => { seen = o; return '{}'; };
  try {
    const { route: r } = await runBeatJudgeModule(judge, { system: 's', input: 'x', generationId: 'g' });
    assert.equal(r.model, 'MiniMax-M2.7-highspeed');
    assert.equal(seen.apiConfigOverride.model, 'MiniMax-M2.7-highspeed');
    assert.equal(seen.apiConfigOverride.url, 'https://api.minimaxi.com/v1');
    assert.equal(seen.maxTokens, 512);
    assert.equal(seen.timeoutMs, 10000);
    assert.equal(seen.usageType, 'beat_judge');
  } finally { aiService.generate = original; }
  // M2.7-highspeed 不认 reasoning_effort：名单外不发。
  assert.deepEqual(backendReasoningParam('https://api.minimaxi.com/v1', 'MiniMax-M2.7-highspeed', true, 'low'), {});
});
