import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadTs } from './loadTs.mjs';

if (!globalThis.localStorage) {
  const values = new Map();
  globalThis.localStorage = { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,String(v)), removeItem: k => values.delete(k) };
}
async function pactSave() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const { buildStrictScenarioInitialization, applyStrictScenarioInitializationToSave } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const { overlayQingyuStage02Opening } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const stage = parseScenarioMod(JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_02.json',import.meta.url),'utf8')));
  const save = applyStrictScenarioInitializationToSave({ 元数据:{时间:{年:200,月:1,日:1,小时:8,分钟:0}},角色:{位置:{描述:'白湖商馆'},背包:{物品:{}}},世界:{信息:{},状态:{}},社交:{关系:{}},系统:{扩展:{}} },buildStrictScenarioInitialization(overlayQingyuStage02Opening(stage)));
  save.系统.扩展.星月湖落地连续试玩 = {kind:'xingyuehu-landing-through-v1',routeMode:'from-landing'};
  const rt=save.世界.状态.剧本模组;
  rt.activeEventIds=['lcq.event.sudaji_south_pact'];
  rt.currentChapterId=rt.chapters.find(c=>c.eventIds.includes('lcq.event.sudaji_south_pact')).id;
  rt.completedEventIds=[];
  rt.flags['event.sudaji_south_pact.done']=false;
  save.角色.位置.描述='中州·五原·白湖商馆内院'; // 到达≠完成：谈判在五原城内进行
  return save;
}

test('natural negotiation resolves current first step locally and rejects questions, refusal and retelling',async()=>{
  const router=await loadTs('../src/modules/scenarioMods/naturalIntentRouter.ts');
  const runtime=await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save=await pactSave();
  const positive='我用霓龙丝产地线索换三个月期限。';
  const before=structuredClone(save.世界.状态.剧本模组.flags);
  const selected=router.resolveNaturalIntentFastPath(save,positive);
  assert.equal(selected?.selection?.actionId,'offer_nylon_clue_for_term');
  assert.equal(selected.usedModel,false);
  assert.deepEqual(save.世界.状态.剧本模组.flags,before,'routing cannot settle');
  for(const text of ['苏妲己用霓龙丝产地线索换三个月期限。','我昨天用霓龙丝产地线索换三个月期限。','我不用霓龙丝产地线索换三个月期限。','我押手机作担保，换三个月期限。','我用霓龙丝产地线索换三个月期限吗？','给我三个月期限吗？','如果给我三个月期限，我押铁匣子。','她说给我三个月期限。','我不接受三个月期限。','我不想给你押物换三个月。']) {
    assert.equal(router.resolveNaturalIntentFastPath(save,text),undefined,text);
  }
  const result=runtime.recordStoryEventStructuredAction(save,selected.selection);
  assert.equal(result.attempted,true);
  const fresh=router.resolveNaturalIntentFastPath(save,'我答应三个月之约。');
  assert.equal(fresh?.selection?.actionId,'seal_three_month_south_pact');
  assert.equal(router.resolveNaturalIntentFastPath(save,positive),undefined,'old negotiation cannot replay after first step');
});

test('OpenRouter scoped effort is explicit while unknown proxies keep old behavior',async()=>{
 const {optionalReasoningParam}=await loadTs('../src/services/optionalReasoningParams.ts');
 assert.deepEqual(optionalReasoningParam('openrouter','typesafe/jev-router',{url:'https://openrouter.ai/api/v1',effort:'none'}),{reasoning:{effort:'none'}});
 assert.deepEqual(optionalReasoningParam('openrouter','typesafe/jev-router',{url:'https://openrouter.ai/api/v1',effort:'low'}),{reasoning:{effort:'low'}});
 assert.equal(optionalReasoningParam('custom','typesafe/jev-router',{url:'https://proxy.invalid',effort:'none'}),undefined);
 assert.equal(optionalReasoningParam('custom','unknown',{url:'https://openrouter.ai.evil.invalid',effort:'none'}),undefined);
});

test('turn deadline is shared across nested requests and late A cleanup cannot extend B',async()=>{
 const budget=await loadTs('../src/services/qingyuTurnLongRequests.ts');
 const save=await pactSave(); const original=Date.now; let now=100000;
 Date.now=()=>now;
 let a,b;
 try {
  a=budget.beginQingyuTurnLongRequests(save);
  assert.equal(budget.remainingQingyuTurnTimeMs(a),60000);
  now+=30000; budget.beginQingyuTurnLongRequests(save,a);
  assert.equal(budget.remainingQingyuTurnTimeMs(a),30000);
  budget.endQingyuTurnLongRequests(a);budget.invalidateQingyuTurnLongRequests(a);
  b=budget.beginQingyuTurnLongRequests(save);budget.releaseQingyuTurnLongRequests(a);
  assert.equal(budget.remainingQingyuTurnTimeMs(b),60000);
  now+=60001;assert.equal(budget.remainingQingyuTurnTimeMs(b),0);
 } finally {Date.now=original;budget.releaseQingyuTurnLongRequests(a);budget.releaseQingyuTurnLongRequests(b);}
});

test('generation and truncation recovery share one deadline and abort a hanging recovery',async()=>{
 const {aiService}=await loadTs('../src/services/aiService.ts');
 const {OutputTruncationError}=await loadTs('../src/services/aiResponseTermination.ts');
 const {isAiRequestTimeout}=await loadTs('../src/services/aiRequestDeadline.ts');
 const original=aiService.generateOnce;let calls=0,signal;
 aiService.generateOnce=async options=>{
   signal=options.signal; calls++;
   if(calls===1)throw new OutputTruncationError({budget:8192});
   return new Promise(()=>{});
 };
 try {
  await assert.rejects(aiService.generate({user_input:'test',usageType:'main',timeoutMs:20}),isAiRequestTimeout);
  assert.equal(calls,2);assert.equal(signal.aborted,true);
 }finally{aiService.generateOnce=original;}
});

test('deduplicating world copy retains live state and never mutates saved identity',async()=>{
 const {buildNarrativePromptState}=await loadTs('../src/utils/narrativePromptState.ts');
 const save={角色:{身份:{名字:'程宗扬',世界:{name:'六朝',lore:'x'.repeat(30000)}},背包:{物品:{pouch:{数量:1}}}},世界:{信息:{世界名称:'六朝',描述:'世界事实'},状态:{剧本模组:{modId:'lcq.stage_02',flags:{signed:false}}}}};
 const result=buildNarrativePromptState(save);
 assert.equal(result.角色.身份.世界,'六朝');assert.equal(result.世界.信息.描述,'世界事实');
 assert.equal(result.角色.背包.物品.pouch.数量,1);assert.equal(result.世界.状态.剧本模组.flags.signed,false);
 assert.equal(save.角色.身份.世界.lore.length,30000);
 assert.ok(JSON.stringify(result).length<1000);
});

test('quest compass excludes canonical protagonist even when an old runtime lacks opening',async()=>{
 const {questCompassPhrases}=await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
 assert.deepEqual(questCompassPhrases({id:'lcq.event.test',relatedCharacterIds:['liuchao.character.cheng_zongyang','liuchao.character.ning_yu']},{canon:{characters:[{id:'liuchao.character.cheng_zongyang',name:'程宗扬'},{id:'liuchao.character.ning_yu',name:'凝羽'}]}}),['见凝羽']);
});


test('outer deadline remains cancellable by the owning turn', async()=> {
 const {aiService}=await loadTs('../src/services/aiService.ts');
 const original=aiService.generateOnce; let signal;
 const external = new AbortController();
 aiService.generateOnce=async options=>{signal=options.signal;return new Promise(()=>{});};
 try {
  const pending=aiService.generate({user_input:'test',usageType:'main',timeoutMs:1000,qingyuTurnId:'run5-cancel',signal:external.signal});
  await Promise.resolve();
  aiService.abortQingyuTurnRequests('run5-cancel');
  await assert.rejects(pending,e=>e.name==='AbortError');
  assert.equal(signal.aborted,true);
  assert.equal(external.signal.aborted,false,'owned cancellation must not abort caller controller');
 } finally {aiService.generateOnce=original;}
});
