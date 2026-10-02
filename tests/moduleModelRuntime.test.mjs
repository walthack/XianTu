import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
const jiti=createJiti(import.meta.url,{alias:{'@':fileURLToPath(new URL('../src',import.meta.url))}});
const {createModuleModelRuntime,GAME_MODEL_MODULES,validateModuleDefinition}=await jiti.import('../src/services/moduleModelRuntime.ts');
const api=(id,model,provider='openai')=>({id,name:id,model,provider,url:'https://example.invalid/v1',apiKey:'private-fixture-key',maxTokens:12000,temperature:.4,enabled:true});
const input={system:'module contract',input:'action',generationId:'test'};
const make=(routes,overrides={})=>createModuleModelRuntime({definitions:GAME_MODEL_MODULES,
  resolveRoute:d=>({config:routes.get(d.id)??null,inherited:!routes.has(d.id)}),isEnabled:()=>true,generate:async()=>'ok',...overrides});

test('every registered module card passes the registry contract',()=>{
 for(const m of GAME_MODEL_MODULES)assert.deepEqual(validateModuleDefinition(m),[],m.id);
 assert.deepEqual(GAME_MODEL_MODULES.map(m=>m.id),['intent','narrative','memory','audit']);
 assert.equal(GAME_MODEL_MODULES.some(m=>m.id==='quality'),false);
});
test('incomplete module cards are refused at registration',()=>{
 const base=GAME_MODEL_MODULES.find(m=>m.id==='memory');
 for(const bad of [{...base,id:'x1',consumers:[]},{...base,id:'x2',blocking:true},{...base,id:'x3',lifecycle:'dev'},{...base,id:'x4',policy:{...base.policy,maxTokens:0}}])
  assert.throws(()=>createModuleModelRuntime({definitions:[bad],resolveRoute:()=>({config:null,inherited:true}),isEnabled:()=>true,generate:async()=>''}),/模块卡不合格/);
 assert.doesNotThrow(()=>createModuleModelRuntime({definitions:[{...base,id:'x5',lifecycle:'dev',retireWhen:'快照集覆盖后退场'}],resolveRoute:()=>({config:null,inherited:true}),isEnabled:()=>true,generate:async()=>''}));
});
test('each module routes independently and carries its own policy',async()=>{
 const calls=[];const routes=new Map([['intent',api('fast','small-model')],['narrative',api('A','story-model','claude')],['memory',api('B','memo-model','custom')],['audit',api('C','audit-model','openrouter')]]);
 const runtime=make(routes,{generate:async o=>{calls.push(o);return 'result';}});
 for(const [id,model] of [['intent','small-model'],['narrative','story-model'],['memory','memo-model'],['audit','audit-model']])assert.equal((await runtime.run(id,input)).route.model,model);
 const [intent,narrative,memory,audit]=calls;
 assert.equal(intent.reasoningEffort,'none');assert.equal(intent.maxTokens,1024);assert.equal(intent.timeoutMs,undefined);assert.equal(intent.timeoutMode,'content_idle');assert.equal(intent.should_stream,true);assert.equal(intent.background,false);
 assert.equal(narrative.background,false);assert.equal(narrative.usageType,'module_narrative');
 assert.equal(memory.background,true);assert.equal(memory.usageType,'memory_summary');
 assert.equal(audit.background,true);assert.equal(audit.usageType,'background_audit');assert.equal(audit.apiConfigOverride.provider,'openrouter');
 assert.ok(calls.every(c=>c.injects[0].content==='module contract'));
 assert.equal(JSON.stringify((await runtime.run('memory',input)).route).includes('private-fixture-key'),false);
});
test('all modules can share one model; route reports whether it is inherited',async()=>{
 const shared=api('shared','any-model');
 const runtime=createModuleModelRuntime({definitions:GAME_MODEL_MODULES,resolveRoute:()=>({config:shared,inherited:true}),isEnabled:()=>true,generate:async()=>'ok'});
 for(const m of GAME_MODEL_MODULES){const {route}=await runtime.run(m.id,input);assert.equal(route.model,'any-model');assert.equal(route.inherited,true);}
});
test('an in-flight request freezes credentials/model; next request picks up the new assignment',async()=>{
 let configured=api('A','old-model');let release;let captured;
 const runtime=createModuleModelRuntime({definitions:GAME_MODEL_MODULES,resolveRoute:()=>({config:configured,inherited:false}),isEnabled:()=>true,generate:o=>{captured=o;return new Promise(resolve=>{release=resolve;});}});
 const first=runtime.run('narrative',input);const frozen=captured.apiConfigOverride;
 configured.model='new-model';configured.apiKey='new-key';
 assert.equal(frozen.model,'old-model');assert.equal(frozen.apiKey,'private-fixture-key');assert.equal(Object.isFrozen(frozen),true);
 release('done');assert.equal((await first).route.model,'old-model');
 const second=runtime.run('narrative',input);assert.equal(captured.apiConfigOverride.model,'new-model');release('done');assert.equal((await second).route.model,'new-model');
});
test('disabled/unconfigured/unknown modules fail before transport; configured budgets are respected',async()=>{
 let count=0;let enabled=false;let configured=null;let captured;
 const runtime=createModuleModelRuntime({definitions:GAME_MODEL_MODULES,resolveRoute:()=>({config:configured,inherited:true}),isEnabled:()=>enabled,generate:async o=>{count++;captured=o;return 'ok';}});
 await assert.rejects(runtime.run('unknown',input),/未注册/);await assert.rejects(runtime.run('memory',input),/未启用/);
 enabled=true;await assert.rejects(runtime.run('memory',input),/没有可用/);assert.equal(count,0);
 configured={...api('small','custom-name'),maxTokens:2048};await runtime.run('memory',input);assert.equal(captured.maxTokens,2048);
});
test('a host-carried inherited main route sends no direct override',async()=>{
 let captured;
 const runtime=createModuleModelRuntime({definitions:GAME_MODEL_MODULES,resolveRoute:()=>({config:null,inherited:true,viaHost:true}),isEnabled:()=>true,generate:async o=>{captured=o;return 'ok';}});
 const {route}=await runtime.run('intent',input);
 assert.equal(captured.apiConfigOverride,undefined);assert.equal(route.provider,'tavern');assert.equal(route.inherited,true);
});
test('transport failure preserves its type and records safe route metadata',async()=>{
 const failure=Object.assign(new Error('unsupported response'),{code:'transport-specific'});
 const runtime=createModuleModelRuntime({definitions:GAME_MODEL_MODULES,resolveRoute:()=>({config:api('failure-api','replacement-model'),inherited:false}),isEnabled:()=>true,generate:async()=>{throw failure;}});
 await assert.rejects(runtime.run('audit',input),e=>e===failure && e.code==='transport-specific' && e.moduleModelRoute.model==='replacement-model');
 assert.equal(JSON.stringify(failure.moduleModelRoute).includes('private-fixture-key'),false);
});
