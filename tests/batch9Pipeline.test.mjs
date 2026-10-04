import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
import axios from 'axios';
import { createPinia, setActivePinia } from 'pinia';
import { loadTs } from './loadTs.mjs';

const pipelineJiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: {
    '@': fileURLToPath(new URL('../src', import.meta.url)),
    '@/stores/characterStore': fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts', import.meta.url)),
  },
});

async function loadPipeline(relativePath) {
  return pipelineJiti.import(new URL(relativePath, import.meta.url).pathname);
}

if (!globalThis.localStorage || typeof globalThis.localStorage.getItem !== 'function') {
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => values.clear(),
  };
}
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
if (!globalThis.window.location) globalThis.window.location = { hostname: 'localhost', href: 'http://localhost/' };

const TEST_PROFILE = {
  模式: '单机',
  角色: { 名字: '程宗扬', 性别: '男' },
  存档列表: {},
};

async function withStubbedGenerate(aiService, impl) {
  const { useAPIManagementStore } = await loadPipeline('../src/stores/apiManagementStore.ts');
  const api = useAPIManagementStore(); const originalApiConfigs = [...api.apiConfigs];
  api.apiConfigs = [{ id: 'fixture-minimax', name: 'fixture', provider: 'custom', url: 'https://api.minimaxi.com/v1', apiKey: 'fixture-not-a-real-key', model: 'MiniMax-M3', enabled: true }];
  const originalCheck = aiService.checkAvailability;
  const originalGenerate = aiService.generate;
  const originalGenerateRaw = aiService.generateRaw;
  const originalConfig = structuredClone(aiService.getConfig?.() || aiService.config);
  aiService.checkAvailability = () => ({ available: true, message: 'test-stub' });
  aiService.generate = impl;
  aiService.generateRaw = async () => {
    throw new Error('must not call generateRaw');
  };
  return () => {
    api.apiConfigs = originalApiConfigs;
    aiService.checkAvailability = originalCheck;
    aiService.generate = originalGenerate;
    aiService.generateRaw = originalGenerateRaw;
    if (originalConfig && typeof aiService.saveConfig === 'function') aiService.saveConfig(originalConfig);
  };
}


const {createMinimalSaveDataV3}=await loadTs('../src/utils/dataRepair.ts');
const {buildStrictScenarioInitialization,applyStrictScenarioInitializationToSave}=await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const runtime=await loadTs('../src/modules/scenarioMods/runtime.ts');
async function checkpoint(id) {
 const d=JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_02.json',import.meta.url)));
 let s=runtime.advanceScenarioRuntime(applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(),buildStrictScenarioInitialization(d))).saveData;
 s.系统.扩展.清羽记开局={kind:'qingyu-demo-v1',endModId:'lcq.stage_04b_lingfei_baiyi_crisis',endEventId:'lcq.event.enter_dong_with_migu'};
 const rt=s.世界.状态.剧本模组;for(const event of rt.events)if(event.id!==id){rt.completedEventIds.push(event.id);for(const condition of event.completion||[])if(condition.path.startsWith('flags.'))rt.flags[condition.path.slice(6)]=condition.value;}rt.activeEventIds=[id];rt.currentChapterId=rt.chapters.find(c=>c.eventIds.includes(id)).id;
 // Real route preconditions belong to A1 fixture; Ningyu is explicitly tested at the roadside.
 if(id==='lcq.event.ningyu_regicide_offer') {s.角色.位置.描述='中州·南荒途中·商队宿处';rt.completedEventIds.push('lcq.event.wuerlang_joins');}
 const actions=runtime.getCurrentStoryEventActions(s);assert.ok(actions[0],id);return {s,action:actions[0]};
}
for(const id of ['lcq.event.s02_04','lcq.event.ningyu_regicide_offer']) test(`real module pipeline ${id} uses local player-facing canon without red error or model requests`,async()=>{
 setActivePinia(createPinia());
 const {AIBidirectionalSystem}=await loadPipeline('../src/utils/AIBidirectionalSystem.ts');
 const {useGameStateStore}=await loadPipeline('../src/stores/gameStateStore.ts');
 const {aiService}=await loadPipeline('../src/services/aiService.ts');
 const {s,action}=await checkpoint(id);let calls=0;const restore=await withStubbedGenerate(aiService,async()=>{calls++;throw new Error('fixed or guidance must not call model');});
 try {
  const store=useGameStateStore();store.loadFromSaveData(s);
  const response=await AIBidirectionalSystem.processPlayerAction(action.playerLine,TEST_PROFILE,{eventAction:action,eventActionProvenance:'selected',playerIntentText:action.playerLine,shouldAbort:()=>false});
  assert.equal(calls,0);assert.equal(response.generationError,undefined);assert.equal(response.moduleReceipt.path,'local');assert.doesNotMatch(response.text,/lcq\.event|本地事件判定|前置未成立|AI处理失败/);
  const rt=store.toSaveData().世界.状态.剧本模组;
  if(id.endsWith('s02_04')) {assert.match(response.text,/点心铺/);assert.ok(!rt.completedEventIds.includes(id));assert.ok(!rt.eventActionStates[id]?.attempts?.length);}
  else {assert.match(response.text,/苏妲己/);assert.match(response.text,/连我一起杀/);assert.ok(rt.eventActionStates[id].preparations.includes('ningyu_regicide_price_heard'));}
 } finally {restore();}
});

test('maternal disclosure is actually narrated on the close-trade step before its world fact is committed',async()=>{
 setActivePinia(createPinia());
 const {AIBidirectionalSystem}=await loadPipeline('../src/utils/AIBidirectionalSystem.ts');
 const {useGameStateStore}=await loadPipeline('../src/stores/gameStateStore.ts');
 const {aiService}=await loadPipeline('../src/services/aiService.ts');
 const {getCanonRailProfile}=await loadTs('../src/modules/scenarioMods/canonRail.ts');
 const d=JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json',import.meta.url)));
 let s=runtime.advanceScenarioRuntime(applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(),buildStrictScenarioInitialization(d))).saveData;
 s.系统.扩展.清羽记开局={kind:'qingyu-demo-v1',endModId:d.manifest.id,endEventId:'lcq.event.enter_dong_with_migu'};
 const rt=s.世界.状态.剧本模组,id='lcq.event.weapon_deal_with_geluo';
 const order=getCanonRailProfile(rt).orderedEventIds;for(const key of order.slice(0,order.indexOf(id))){rt.completedEventIds.push(key);const e=rt.events.find(e=>e.id===key);for(const c of e?.completion||[])if(c.path.startsWith('flags.'))rt.flags[c.path.slice(6)]=c.value;}
 rt.activeEventIds=[id];s.角色.位置.描述='南荒·碧鲮村';
 let action;for(let i=0;i<4;i++){action=runtime.getCurrentStoryEventActions(s).find(a=>a.eventId===id);assert.ok(action);if(action.actionId==='close_weapon_deal_with_geluo')break;rt.worldTurn++;assert.ok(runtime.recordStoryEventStructuredAction(s,action).attempted);}
 rt.worldTurn++;assert.equal(action.actionId,'close_weapon_deal_with_geluo');
 const card=rt.events.find(e=>e.id===id).playerCompletionContract.actions.at(-1);let narrativeCalls=0;
 const restore=await withStubbedGenerate(aiService,async options=>{
  if(options.usageType!=='module_narrative')return '你听清了当下的话。';
  narrativeCalls++;return JSON.stringify({text:card.fallbackText,mid_term_memory:'',tavern_commands:[],action_options:[]});
 });
 try{const store=useGameStateStore();store.loadFromSaveData(s);const res=await AIBidirectionalSystem.processPlayerAction(action.playerLine,TEST_PROFILE,{eventAction:action,eventActionProvenance:'selected',playerIntentText:action.playerLine,shouldAbort:()=>false});
  assert.equal(res.generationError,undefined);assert.equal(narrativeCalls,1);assert.equal(res.moduleReceipt.path,'modular');assert.match(res.text,/碧奴.*女儿/);assert.ok(store.toSaveData().世界.状态.剧本模组.sceneLedger.worldFacts.includes('小紫母系已演出：碧奴的女儿'));
 }finally{restore();}
});
