import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';
const storage=new Map();
globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
globalThis.window={location:{hostname:'localhost'},localStorage:globalThis.localStorage};
const jiti=createJiti(import.meta.url,{alias:{'@/stores/characterStore':fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts',import.meta.url)),'@':fileURLToPath(new URL('../src',import.meta.url))}});
const {default:moderationConfig}=await jiti.import('../mod-kit/ai-content-moderation.json');
const {aiService}=await jiti.import('../src/services/aiService.ts');
const {useAPIManagementStore}=await jiti.import('../src/stores/apiManagementStore.ts');
const {runGameModelModule}=await jiti.import('../src/services/gameModelModules.ts');
const {attemptModuleNarrative,ModuleNarrativeGuardError}=await jiti.import('../src/modules/scenarioMods/modularTurn.ts');
const {lastModelRoute}=await jiti.import('../src/modules/diagnostics/narrativeSource.ts');
const {logStore}=await jiti.import('../src/modules/diagnostics/store.ts');
const budget=await jiti.import('../src/services/qingyuTurnLongRequests.ts');
const config=(id,model,provider='custom')=>({id,name:id,model,provider,url:`https://${id}.invalid/v1`,apiKey:'fixture',enabled:true,maxTokens:4096,temperature:0.5});
const main=config('main','MiniMax-M2.7');
const fallback=config('backup','grok-4.20-0309-non-reasoning','xai');
function setup(withFallback=true, enabled=true){
  moderationConfig.fallbackEnabled=enabled;
  setActivePinia(createPinia());
  const api=useAPIManagementStore(); api.apiConfigs=[{...main},{...fallback}];
  api.assignAPI('main','main'); api.fallbackApiId=withFallback?'backup':'';
  return api;
}
const rejected=(status=422,message='input new_sensitive(1026)')=>new Response(JSON.stringify({error:{message},request_id:'req-fixture'}),{status});
const ok=()=>new Response('data: {"choices":[{"delta":{"content":"你环顾四周，静静等候。"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
async function withFetch(stub,run){const old=globalThis.fetch;globalThis.fetch=stub;try{return await run();}finally{globalThis.fetch=old;}}

test('审核后只重发一次，提示词不变且 route/narrativeSource 记录实际 Grok',async()=>{
  setup(); const calls=[];
  await withFetch(async(url,opt)=>{calls.push({url,body:JSON.parse(opt.body)});return calls.length===1?rejected():ok();},async()=>{
    const result=await runGameModelModule('narrative',{system:'系统夹具',input:'观察',generationId:'fallback'});
    assert.equal(calls.length,2); assert.equal(result.route.model,fallback.model);assert.equal(result.route.configId,'backup');
    assert.deepEqual(calls[0].body.messages,calls[1].body.messages);
    assert.deepEqual(lastModelRoute('narrative'),{model:fallback.model,provider:'xai'});
    await logStore.flush();
    const entry=(await logStore.all()).find(x=>x.code==='LCQ-NET-012'&&x.detail?.requestId==='req-fixture');
    assert.ok(entry); assert.equal(entry.detail.status,422);assert.equal(entry.detail.providerCode,'1026');
  });
});

test('主流程备用重发不消耗第二次长请求预算',async()=>{
  setup();let calls=0;
  const turn=budget.beginQingyuTurnLongRequests({世界:{状态:{剧本模组:{modId:'lcq.stage_05b'}}}});
  try{await withFetch(async()=>++calls===1?rejected():ok(),async()=>{
    await aiService.generate({user_input:'观察',should_stream:true,usageType:'main',maxTokens:4096,qingyuTurnId:turn,requestMaxRetries:0,apiConfigOverride:main});
    assert.equal(calls,2);assert.equal(budget.remainingQingyuTurnLongRequests(turn),1);
  });}finally{budget.endQingyuTurnLongRequests(turn);}
});

for(const scenario of ['未配置','备用审核失败','备用网络失败','备用503'])test(scenario+' 转守卫错误且不再重发同样内容',async()=>{
  setup(scenario!=='未配置');let calls=0;let guarded;
  await withFetch(async()=>{calls++;if(calls===1||scenario==='备用审核失败')return rejected();if(scenario==='备用503')return rejected(503,'service unavailable');throw new TypeError('fetch failed');},async()=>{
    const result=await attemptModuleNarrative(()=>runGameModelModule('narrative',{system:'test',input:'test'}),{
      budgetLeft:()=>0,isFatal:()=>false,maxAttempts:3,onRejected:e=>guarded=e,
    });
    assert.equal(result.ok,false);assert.equal(result.attempts,1);assert.ok(guarded instanceof ModuleNarrativeGuardError);
    assert.doesNotMatch(result.reason,/request_id|API错误 422|new_sensitive/);
    assert.equal(calls,scenario==='未配置'?1:2);
  });
});

for(const [status,message] of [[422,'invalid input'],[400,'new_sensitive(1026)'],[422,'moderation(1027)']])test(`不误切换 ${status}/${message}`,async()=>{
  setup();let calls=0;
  await withFetch(async()=>{calls++;return rejected(status,message);},async()=>{
    await assert.rejects(()=>aiService.generate({user_input:'test',should_stream:true,requestMaxRetries:0,apiConfigOverride:main}));
    assert.equal(calls,1);
  });
});

test('备用取消保持 AbortError，不转本地拒稿',async()=>{
  setup();let calls=0;const controller=new AbortController();
  await withFetch(async()=>{if(++calls===1)return rejected();controller.abort();throw new DOMException('aborted','AbortError');},async()=>{
    await assert.rejects(()=>runGameModelModule('narrative',{system:'test',input:'test',signal:controller.signal}),e=>!(e instanceof ModuleNarrativeGuardError));
    assert.equal(calls,2);
  });
});

test('旧存储缺字段正常加载，新字段持久化，删除连接清空备用',async()=>{
  const api=setup();
  storage.set('api_management_config',JSON.stringify({apiConfigs:[main,fallback],apiAssignments:[{type:'main',apiId:'main'}]}));
  await api.loadFromStorage();assert.equal(api.fallbackApiId,'');
  api.setFallbackAPI('backup');
  const stored=JSON.parse(storage.get('api_management_config'));assert.equal(stored.fallbackApiId,'backup');
  api.fallbackApiId='';await api.loadFromStorage();assert.equal(api.fallbackApiId,'backup');
  api.deleteAPI('backup');assert.equal(api.fallbackApiId,'');
});


test('05b 实际模块链路审核失败自动返回本地正文，无重复模型请求',async()=>{
  const {walkMainline}=await import('./baihuMainlineWalk.mjs');
  const {AIBidirectionalSystem}=await jiti.import('../src/utils/AIBidirectionalSystem.ts');
  let save;
  const quiet=['log','warn','info','debug'];const old=Object.fromEntries(quiet.map(k=>[k,console[k]]));
  for(const k of quiet) console[k]=()=>{};
  try {
    await walkMainline((candidate,event)=>{if(event?.id==='lcq.event.hongmiao_controlled')save||=structuredClone(candidate);});
    assert.ok(save);setup(true,false);let calls=0;
    const result=await withFetch(async()=>{calls++;return rejected();},()=>AIBidirectionalSystem.tryModularTurn(save,{playerIntentText:'我四下看看，问苏荔这里情况如何。'},'moderation-local',()=>false,'我四下看看，问苏荔这里情况如何。'));
    assert.equal(calls,1);assert.equal(result.moduleReceipt.path,'local');assert.ok(result.text.trim());
    assert.doesNotMatch(result.text,/request_id|new_sensitive|API错误 422/);
  } finally {Object.assign(console,old);}
});


test('自动切换默认关闭，配置备用但未开开关时仍只请求主连接并走本地拒稿',async()=>{
  const {readFileSync}=await import('node:fs');
  assert.equal(JSON.parse(readFileSync(new URL('../mod-kit/ai-content-moderation.json',import.meta.url),'utf8')).fallbackEnabled,false);
  setup(true,false);let calls=0;
  await withFetch(async()=>{calls++;return rejected();},async()=>{
    await assert.rejects(()=>runGameModelModule('narrative',{system:'test',input:'test'}),e=>e instanceof ModuleNarrativeGuardError);
    assert.equal(calls,1);
  });
});
