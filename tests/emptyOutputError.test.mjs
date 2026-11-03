import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
const storage=new Map();
globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
globalThis.window={location:{hostname:'localhost'},localStorage:globalThis.localStorage};
const jiti=createJiti(import.meta.url,{alias:{'@/stores/characterStore':fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts',import.meta.url)),'@':fileURLToPath(new URL('../src',import.meta.url))}});
const {aiService}=await jiti.import('../src/services/aiService.ts');
const {EmptyOutputError,isEmptyOutputError,emptyOutputError,toUserFacingAIError}=await jiti.import('../src/services/apiErrorMessage.ts');
const {isOutputTruncationError}=await jiti.import('../src/services/aiResponseTermination.ts');
const {packText}=await jiti.import('../src/modules/contentPacks/index.ts');
const {logStore}=await jiti.import('../src/modules/diagnostics/store.ts');

const API={provider:'custom',url:'https://fixture.invalid/v1',apiKey:'',model:'ordinary-fixture',maxTokens:4096,temperature:0.5};
const call=(stream,extra={})=>aiService.generate({user_input:'观察',should_stream:stream,apiConfigOverride:API,maxTokens:3072,requestMaxRetries:0,background:true,...extra});
const sse=(chunks)=>new Response(chunks.map(c=>`data: ${JSON.stringify(c)}\n\n`).join('')+'data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
const streamOf=(content,finish_reason)=>sse([{choices:[{delta:{content},finish_reason}]}]);
async function withFetch(stub,run){const old=globalThis.fetch;globalThis.fetch=stub;try{return await run();}finally{globalThis.fetch=old;}}
async function withAxios(reply,run){const old=axios.post;let calls=0;axios.post=async()=>{calls++;return reply;};try{await run();return calls;}finally{axios.post=old;}}
const hint=packText('report8091.moderation.emptyOutput');
const SECRET='越线原文夹具';

test('提示文案：有码、无原文；toUserFacingAIError 与 cause 链都认得',()=>{
  assert.match(hint,/LCQ-NET-019/);
  const e=new EmptyOutputError({finishReason:'stop'});
  assert.equal(e.message,hint);assert.equal(e.finishReason,'stop');
  assert.equal(isEmptyOutputError(e),true);
  const wrapped=toUserFacingAIError(e);
  assert.equal(wrapped.message,hint);assert.equal(wrapped.cause,e);assert.equal(isEmptyOutputError(wrapped),true);
  assert.equal(isEmptyOutputError(new Error('AI响应为空或格式错误')),false);
  const cycle=new Error('x');cycle.cause=cycle;assert.equal(isEmptyOutputError(cycle),false);
});

test('emptyOutputError(raw)：原始响应为空→EmptyOutputError；非空→仍是格式错误',()=>{
  for(const raw of ['','  \n',undefined,null])assert.equal(isEmptyOutputError(emptyOutputError(raw)),true);
  const fmt=emptyOutputError(`{"text":"" ,"x":"${SECRET}"}`);
  assert.equal(isEmptyOutputError(fmt),false);assert.equal(fmt.message,'AI响应为空或格式错误');
});

for(const [label,finish] of [['finish_reason=stop','stop'],['非标准 finish_reason','sensitive'],['无 finish_reason',null]]){
  test(`流式 200 空正文（${label}）→ EmptyOutputError`,async()=>{
    await withFetch(async()=>streamOf('',finish),async()=>{
      await assert.rejects(()=>call(true),e=>isEmptyOutputError(e)&&e.message===hint&&!isOutputTruncationError(e));
    });
  });
}

test('非流式 200 空正文 → EmptyOutputError，只发一次',async()=>{
  const calls=await withAxios({data:{choices:[{message:{content:''},finish_reason:'content_filter'}]}},async()=>{
    await assert.rejects(()=>call(false),e=>isEmptyOutputError(e)&&e.finishReason==='content_filter');
  });
  assert.equal(calls,1);
  await logStore.flush();
  const entry=(await logStore.all()).filter(x=>x.code==='LCQ-NET-019').at(-1);
  assert.ok(entry);
  assert.deepEqual([entry.detail.finishReason,entry.detail.provider,entry.detail.model],['content_filter','custom','ordinary-fixture']);
});

test('只有思考、没有正文（finish_reason=stop）也算空正文',async()=>{
  await withFetch(async()=>sse([{choices:[{delta:{reasoning_content:SECRET}}]},{choices:[{delta:{},finish_reason:'stop'}]}]),async()=>{
    // 换模型名：思考字段会让该模型被记为思考模型，避免影响后续用例的截断分类。
    await assert.rejects(()=>call(true,{apiConfigOverride:{...API,model:'reasoning-fixture'}}),e=>isEmptyOutputError(e)&&!e.message.includes(SECRET));
  });
  await logStore.flush();
  assert.doesNotMatch(JSON.stringify((await logStore.all()).filter(x=>x.code==='LCQ-NET-019')),new RegExp(SECRET));
});

test('正常 200 不受影响',async()=>{
  await withFetch(async()=>streamOf('你环顾四周。','stop'),async()=>{assert.equal(await call(true),'你环顾四周。');});
  await withAxios({data:{choices:[{message:{content:'你环顾四周。'},finish_reason:'stop'}]}},async()=>{assert.equal(await call(false),'你环顾四周。');});
});

test('已有截断分类不受影响：length 空正文仍是截断，不是空正文',async()=>{
  await withFetch(async()=>streamOf('','length'),async()=>{
    await assert.rejects(()=>call(true),e=>isOutputTruncationError(e)&&!isEmptyOutputError(e));
  });
  await withAxios({data:{choices:[{message:{content:''},finish_reason:'max_tokens'}]}},async()=>{
    await assert.rejects(()=>call(false),e=>isOutputTruncationError(e)&&!isEmptyOutputError(e));
  });
  await withFetch(async()=>streamOf('半句','length'),async()=>{
    await assert.rejects(()=>call(true),e=>isOutputTruncationError(e)&&!isEmptyOutputError(e));
  });
});

test('LCQ-NET-019 已登记 codes.ts 与 ERROR-CODES.md',async()=>{
  const {readFile}=await import('node:fs/promises');
  const codes=await readFile(new URL('../src/modules/diagnostics/codes.ts',import.meta.url),'utf8');
  assert.match(codes,/'LCQ-NET-019': spec\('warn', 'aiService', '200 但正文为空（疑似输出阶段审核）'\)/);
  const doc=await readFile(new URL('../docs/ERROR-CODES.md',import.meta.url),'utf8');
  assert.match(doc,/\| LCQ-NET-019 \| warn \| aiService \|/);
});
