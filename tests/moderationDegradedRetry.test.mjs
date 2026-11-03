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
const {RECENT_EVENTS_PREFIX,RECENT_EVENTS_TAIL}=await jiti.import('../src/services/promptRedaction.ts');
const {logStore}=await jiti.import('../src/modules/diagnostics/store.ts');
const budget=await jiti.import('../src/services/qingyuTurnLongRequests.ts');

const main={id:'main',name:'main',model:'MiniMax-M2.7',provider:'custom',url:'https://main.invalid/v1',apiKey:'fixture',enabled:true,maxTokens:4096,temperature:0.5};
const backup={...main,id:'backup',name:'backup',model:'grok-fixture',url:'https://backup.invalid/v1'};
function setup(){
  moderationConfig.fallbackEnabled=false;
  setActivePinia(createPinia());
  const api=useAPIManagementStore();api.apiConfigs=[{...main},{...backup}];
  api.assignAPI('main','main');api.fallbackApiId='backup';
}
const rejected=(status=422,message='input new_sensitive(1026)')=>new Response(JSON.stringify({error:{message},request_id:'req-degrade'}),{status});
const ok=()=>new Response('data: {"choices":[{"delta":{"content":"你环顾四周，静静等候。"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
async function withFetch(stub,run){const old=globalThis.fetch;globalThis.fetch=stub;try{return await run();}finally{globalThis.fetch=old;}}

const shortTerm=['原文一','原文二','原文三'];
const implicitMid=['摘要一','摘要二','摘要三'];
const recent=entries=>`${RECENT_EVENTS_PREFIX}\n${entries.join('\n')}${RECENT_EVENTS_TAIL}`;
const request=(extra={})=>({
  injects:[{role:'system',content:'系统夹具',depth:2,position:'in_chat'},{role:'assistant',content:recent(shortTerm),depth:1,position:'in_chat'}],
  user_input:'观察',should_stream:true,usageType:'main',requestMaxRetries:0,apiConfigOverride:main,...extra,
});
const recentOf=body=>body.messages.find(m=>m.role==='assistant'&&m.content.startsWith(`${RECENT_EVENTS_PREFIX}\n`))?.content;

test('(a) 首次 422/1026 → rawLatestOnly 重发一次成功：最近事件只留最新一条原文，其余换摘要',async()=>{
  setup();const bodies=[];
  await withFetch(async(url,opt)=>{bodies.push(JSON.parse(opt.body));return bodies.length===1?rejected():ok();},async()=>{
    const text=await aiService.generate(request({moderationDegrade:{shortTerm,implicitMid}}));
    assert.match(text,/静静等候/);
  });
  assert.equal(bodies.length,2);
  assert.equal(recentOf(bodies[0]),recent(shortTerm));
  assert.equal(recentOf(bodies[1]),recent(['摘要一','摘要二','原文三']));
  // 只换「最近事件」，其余消息原样。
  assert.deepEqual(bodies[1].messages.filter(m=>!m.content.startsWith(RECENT_EVENTS_PREFIX)),bodies[0].messages.filter(m=>!m.content.startsWith(RECENT_EVENTS_PREFIX)));
  await logStore.flush();
  const entry=(await logStore.all()).find(x=>x.code==='LCQ-NET-018');
  assert.ok(entry);assert.equal(entry.detail.attempt,1);assert.equal(entry.detail.mode,'rawLatestOnly');
  assert.equal(entry.detail.entries,3);assert.equal(entry.detail.originalEntries,3);
  assert.doesNotMatch(JSON.stringify(entry.detail),/原文|摘要/);
});

test('(b) rawLatestOnly 仍 422/1026 → 退到全摘要再发，成功',async()=>{
  setup();const bodies=[];
  await withFetch(async(url,opt)=>{bodies.push(JSON.parse(opt.body));return bodies.length<=2?rejected():ok();},async()=>{
    const text=await aiService.generate(request({moderationDegrade:{shortTerm,implicitMid}}));
    assert.match(text,/静静等候/);
  });
  assert.equal(bodies.length,3);
  assert.equal(recentOf(bodies[1]),recent(['摘要一','摘要二','原文三']));
  assert.equal(recentOf(bodies[2]),recent(implicitMid));
  for(const body of bodies) assert.match(body.model,/MiniMax/);
});

test('降级次数用完仍被拒：抛原审核错误（retriesSpent），备用开关关时不切备用',async()=>{
  setup();const urls=[];
  await withFetch(async(url)=>{urls.push(String(url));return rejected();},async()=>{
    await assert.rejects(()=>aiService.generate(request({moderationDegrade:{shortTerm,implicitMid}})),e=>e.status===422&&e.retriesSpent===true);
  });
  assert.equal(urls.length,1+moderationConfig.degradedAttempts);
  assert.ok(urls.every(u=>/main\.invalid/.test(u)));
});

test('某档降级后与上一次相同则跳过该档：只有一条且是越线回合时直接用全摘要',async()=>{
  setup();const bodies=[];
  await withFetch(async(url,opt)=>{bodies.push(JSON.parse(opt.body));return bodies.length===1?rejected():ok();},async()=>{
    await aiService.generate(request({injects:[{role:'assistant',content:recent(['原文一']),depth:1,position:'in_chat'}],moderationDegrade:{shortTerm:['原文一'],implicitMid:['摘要一']}}));
  });
  assert.equal(bodies.length,2);assert.equal(recentOf(bodies[1]),recent(['摘要一']));
  await logStore.flush();
  const entries=(await logStore.all()).filter(x=>x.code==='LCQ-NET-018'&&x.detail.originalEntries===1);
  assert.deepEqual(entries.map(x=>[x.detail.attempt,x.detail.mode]),[[2,'summary']]);
});

test('各档都无可降（提示词里没有最近事件）：不重发，抛原审核错误',async()=>{
  setup();let calls=0;
  await withFetch(async()=>{calls++;return rejected();},async()=>{
    await assert.rejects(()=>aiService.generate(request({injects:[{role:'system',content:'系统夹具',depth:1,position:'in_chat'}],moderationDegrade:{shortTerm:[],implicitMid:[]}})),e=>e.status===422);
  });
  assert.equal(calls,1);
});

test('(c) 普通请求只发一次，请求体与未传 moderationDegrade 时完全一致',async()=>{
  setup();const bodies=[];
  await withFetch(async(url,opt)=>{bodies.push(opt.body);return ok();},async()=>{
    await aiService.generate(request());
    await aiService.generate(request({moderationDegrade:{shortTerm,implicitMid}}));
  });
  assert.equal(bodies.length,2);assert.equal(bodies[0],bodies[1]);
});

for(const [label,status,message,degrade] of [
  ['非 1026 的 422',422,'moderation(1027)',true],
  ['非 422 的 1026',400,'new_sensitive(1026)',true],
  ['未传 moderationDegrade',422,'input new_sensitive(1026)',false],
])test(`(d) ${label} 不降级，只请求一次`,async()=>{
  setup();let calls=0;
  await withFetch(async()=>{calls++;return rejected(status,message);},async()=>{
    await assert.rejects(()=>aiService.generate(request(degrade?{moderationDegrade:{shortTerm,implicitMid}}:{})));
  });
  assert.equal(calls,1);
});

test('降级重发不占单回合长请求名额',async()=>{
  setup();let calls=0;
  const turn=budget.beginQingyuTurnLongRequests({世界:{状态:{剧本模组:{modId:'lcq.stage_05b'}}}});
  try{
    await withFetch(async()=>++calls<=2?rejected():ok(),async()=>{
      await aiService.generate(request({qingyuTurnId:turn,moderationDegrade:{shortTerm,implicitMid}}));
    });
    assert.equal(calls,3);assert.equal(budget.remainingQingyuTurnLongRequests(turn),1);
  }finally{budget.endQingyuTurnLongRequests(turn);}
});

test('降级重发同时把状态 JSON 里每个 NPC 记忆裁到配置条数（设定分层 §二第 3 条），首发不裁',async()=>{
  setup();const bodies=[];
  const {NARRATIVE_STATE_PREFIX}=await jiti.import('../src/services/promptRedaction.ts');
  const {default:layers}=await jiti.import('../mod-kit/prompt-layers.json');
  const memories=['甲旧一','甲旧二','甲最新'];
  const state={社交:{关系:{a:{名字:'甲',好感度:12,记忆:memories}}}};
  const req=request({moderationDegrade:{shortTerm,implicitMid}});
  req.injects[0]={...req.injects[0],content:`系统规则\n${NARRATIVE_STATE_PREFIX}${JSON.stringify(state)}`};
  await withFetch(async(url,opt)=>{bodies.push(JSON.parse(opt.body));return bodies.length===1?rejected():ok();},async()=>{
    assert.match(await aiService.generate(req),/静静等候/);
  });
  assert.equal(bodies.length,2);
  const stateOf=body=>{const m=body.messages.find(x=>x.role==='system'&&x.content.includes(NARRATIVE_STATE_PREFIX));return JSON.parse(m.content.slice(m.content.lastIndexOf(NARRATIVE_STATE_PREFIX)+NARRATIVE_STATE_PREFIX.length));};
  assert.deepEqual(stateOf(bodies[0]).社交.关系.a.记忆,memories);
  assert.deepEqual(stateOf(bodies[1]).社交.关系.a.记忆,memories.slice(-layers.memory.npcDegradedPromptLimit));
  assert.equal(stateOf(bodies[1]).社交.关系.a.好感度,12);
});
