import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';
const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,String(v)), removeItem: k => storage.delete(k) };
globalThis.window = { location: { hostname: 'localhost' }, localStorage: globalThis.localStorage };
setActivePinia(createPinia());
const jiti = createJiti(import.meta.url, { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } });
const { useAPIManagementStore } = await jiti.import('../src/stores/apiManagementStore.ts');
const { resolveGameModuleRoute, runGameModelModule } = await jiti.import('../src/services/gameModelModules.ts');
const { GAME_MODEL_MODULES } = await jiti.import('../src/services/moduleModelRuntime.ts');
const { aiService } = await jiti.import('../src/services/aiService.ts');
const config = (id, model) => ({ id, name:id, model, provider:'custom', url:'https://api.minimaxi.com/v1', apiKey:'fixture', enabled:true, maxTokens:4096 });

test('four modules follow main configuration, not M3 or previous module assignments', async () => {
  const api = useAPIManagementStore();
  api.apiConfigs = [config('main-selected','MiniMax-M2.7-highspeed'), config('old-m3','MiniMax-M3')];
  api.assignAPI('main','main-selected');
  api.setModuleEnabled('audit',true);
  api.assignAPI('memory_summary','old-m3');
  for (const d of GAME_MODEL_MODULES) api.assignModuleAPI(d.id,'old-m3');
  const original = aiService.generate;
  aiService.generate = async options => {
    assert.equal(options.apiConfigOverride.model,'MiniMax-M2.7-highspeed');
    assert.equal(options.reasoningEffort,'none');
    return '正文';
  };
  try {
    for (const d of GAME_MODEL_MODULES) {
      assert.equal(resolveGameModuleRoute(d).config.id,'main-selected');
      assert.equal((await runGameModelModule(d.id,{system:'test',input:'action',generationId:d.id})).route.model,'MiniMax-M2.7-highspeed');
    }
    api.apiConfigs[0].model = 'another-backend-model';
    for (const d of GAME_MODEL_MODULES) assert.equal(resolveGameModuleRoute(d).config.model,'another-backend-model');
  } finally { aiService.generate = original; }
});

test('MiniMax direct streams separate reasoning for M2.7/highspeed and disable only M3 thinking', async () => {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return new Response('data: {"choices":[{"delta":{"reasoning_content":"hidden reasoning"}}]}\n\ndata: {"choices":[{"delta":{"content":"visible answer"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', {headers:{'content-type':'text/event-stream'}});
  };
  try {
    for (const model of ['MiniMax-M2.7','MiniMax-M2.7-highspeed','MiniMax-M3']) {
      const result = await aiService.generate({ user_input:'test', should_stream:true, reasoningEffort:'none', requestMaxRetries:0, apiConfigOverride:config('test',model) });
      assert.equal(result,'visible answer');
      const body=requests.at(-1);
      assert.equal(body.model,model);
      assert.equal(body.reasoning_split,true);
      assert.deepEqual(body.thinking,model==='MiniMax-M3'?{type:'disabled'}:undefined);
    }
  } finally { globalThis.fetch = original; }
});
