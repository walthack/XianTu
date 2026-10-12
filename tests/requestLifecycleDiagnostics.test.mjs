import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './loadTs.mjs';
const d=await loadTs('../src/services/requestLifecycleDiagnostics.ts');
const t=await loadTs('../src/services/diagnosticTransport.ts');
const {withAiRequestDeadline}=await loadTs('../src/services/aiRequestDeadline.ts');
const {aiService}=await loadTs('../src/services/aiService.ts');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const context=(id,background=false)=>({module:'intent',turnId:id,generationId:'gen_test',background});
function reset(){d.clearRequestLifecycleDiagnostics();d.diagnosticBusyChanged(false);}

test('production SSE separates headers, reasoning, whitespace, effective content and terminal status without storing payload',async()=>{
 reset();const original=globalThis.fetch,c=new AbortController();d.bindRequestDiagnosticContext(c.signal,context('turn_sse'));
 globalThis.fetch=async()=>new Response(new ReadableStream({start(ctrl){ctrl.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"reasoning_content":"secret-thought"}}]}\n\n'));setTimeout(()=>ctrl.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":" "}}]}\n\n')),5);setTimeout(()=>{ctrl.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"正文secret-body"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));ctrl.close();},15);}}),{headers:{'content-type':'text/event-stream'}});
 try{const r=await t.diagnosticFetch('https://fixture.invalid?api_key=sk-private',{signal:c.signal});assert.equal(d.peekRequestLifecycleDiagnostics().requests[0].firstContentAt,null);const result=await aiService.processSSEStream(r,data=>{const p=JSON.parse(data);t.observeStreamContent(r,p);return p.choices?.[0]?.delta?.content||'';},undefined,c.signal);assert.match(result,/正文/);const row=d.peekRequestLifecycleDiagnostics().requests[0];assert.equal(row.module,'intent');assert.equal(row.turnId,'turn_sse');assert.equal(row.status,'completed');assert.equal(row.finishReason,'stop');assert.ok(row.firstContentAt>row.headersAt);assert.ok(row.endedAt>=row.firstContentAt);assert.equal(/secret|api_key|fixture.invalid/.test(JSON.stringify(row)),false);}finally{globalThis.fetch=original;}
});

test('deadline cancellation retains phase through nested signals, and remains the original error with no retry',async()=>{
 reset();const original=globalThis.fetch,c=new AbortController();d.bindRequestDiagnosticContext(c.signal,context('turn_deadline'));let attempts=0;
 globalThis.fetch=(_url,{signal})=>{attempts++;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));};
 try{await assert.rejects(withAiRequestDeadline(signal=>t.diagnosticFetch('https://fixture.invalid',{signal}),{signal:c.signal,firstByteMs:10,totalMs:50}),e=>e.code==='AI_REQUEST_TIMEOUT'&&e.phase==='first_byte');const row=d.peekRequestLifecycleDiagnostics().requests[0];assert.equal(row.status,'timeout');assert.equal(row.timeoutPhase,'first_byte');assert.equal(row.timeoutStage,'await_headers');assert.equal(row.cancelSource,'deadline');assert.equal(row.firstContentAt,null);assert.equal(attempts,1);}finally{globalThis.fetch=original;}
});

test('idle timeout after real content keeps timestamps, unlike reasoning-only first-content timeout',async()=>{
 reset();const original=globalThis.fetch,c=new AbortController();d.bindRequestDiagnosticContext(c.signal,context('turn_idle'));
 globalThis.fetch=async(_url,{signal})=>new Response(new ReadableStream({start(ctrl){ctrl.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"开始"}}]}\n\n'));signal.addEventListener('abort',()=>ctrl.error(signal.reason),{once:true});}}),{headers:{'content-type':'text/event-stream'}});
 try{await assert.rejects(withAiRequestDeadline(async(signal,mark)=>{const r=await t.diagnosticFetch('https://fixture.invalid',{signal});return aiService.processSSEStream(r,data=>{const p=JSON.parse(data);t.observeStreamContent(r,p);mark();return p.choices[0].delta.content;},undefined,signal);},{signal:c.signal,firstByteMs:50,totalMs:null,idleMs:10}),e=>e.phase==='idle');const row=d.peekRequestLifecycleDiagnostics().requests[0];assert.equal(row.status,'timeout');assert.equal(row.timeoutStage,'content_idle');assert.ok(row.firstContentAt);assert.ok(row.headersAt);}finally{globalThis.fetch=original;}
});

test('503 and retry attempts remain separate rows; raw upstream errors and keys never enter the diagnostic',async()=>{
 reset();const original=globalThis.fetch,c=new AbortController();d.bindRequestDiagnosticContext(c.signal,context('turn_503'));let n=0;globalThis.fetch=async()=>new Response('sk-secret server response',{status:++n===1?503:200,headers:{'content-type':'text/event-stream'}});
 try{const first=await t.diagnosticFetch('https://fixture.invalid',{signal:c.signal});assert.equal(first.status,503);const second=await t.diagnosticFetch('https://fixture.invalid',{signal:c.signal});t.finishStreamDiagnostic(second);const rows=d.peekRequestLifecycleDiagnostics().requests;assert.equal(rows.length,2);assert.notEqual(rows[0].requestId,rows[1].requestId);assert.equal(rows[0].status,'http_error');assert.equal(rows[0].httpStatus,503);assert.equal(rows[1].status,'completed');assert.equal(JSON.stringify(rows).includes('sk-secret'),false);}finally{globalThis.fetch=original;}
});

test('caller cancellation has provenance; delayed old-turn jobs drain only their own turn, once',()=>{
 reset();d.diagnosticBusyChanged(true,'turn_old');const release=d.reserveDiagnosticBackground('turn_old');d.diagnosticBusyChanged(false);d.sealDiagnosticTurn('turn_old');let old=d.peekRequestLifecycleDiagnostics().turns.find(t=>t.turnId==='turn_old');assert.ok(old.foregroundReadyAt);assert.equal(old.backgroundEndedAt,null);
 d.diagnosticBusyChanged(true,'turn_new');const c=new AbortController(),ctx=context('turn_old',true);ctx.module='memory';const trace=d.startRequestDiagnostic(ctx,'fixture',c.signal);d.noteDiagnosticCancellation(c.signal,'scope_change');c.abort(new Error('sk-secret reason'));assert.equal(trace.entry.endedAt,null);assert.ok(trace.entry.cancelRequestedAt);release();release();assert.equal(d.peekRequestLifecycleDiagnostics().turns.find(t=>t.turnId==='turn_old').backgroundEndedAt,null);trace.finish(new DOMException('cancelled','AbortError'));const row=d.peekRequestLifecycleDiagnostics().requests[0];assert.equal(row.cancelSource,'scope_change');assert.equal(row.turnId,'turn_old');assert.equal(row.background,true);assert.equal(row.status,'cancelled');old=d.peekRequestLifecycleDiagnostics().turns.find(t=>t.turnId==='turn_old');assert.equal(old.backgroundPending,0);assert.ok(old.backgroundEndedAt);assert.equal(d.peekRequestLifecycleDiagnostics().turns.find(t=>t.turnId==='turn_new').foregroundReadyAt,null);assert.equal(JSON.stringify(row).includes('sk-secret'),false);d.diagnosticBusyChanged(false);d.sealDiagnosticTurn('turn_new');
});

test('XHR adapter observes real readyState=2 and restores constructor across concurrent requests and synchronous failures',async()=>{
 reset();const old=globalThis.XMLHttpRequest;class Native extends EventTarget{readyState=0;status=0;headers(){this.readyState=2;this.status=200;this.dispatchEvent(new Event('readystatechange'));}}
 globalThis.XMLHttpRequest=Native;const pending=[];const adapter=cfg=>new Promise(resolve=>{const xhr=new globalThis.XMLHttpRequest();pending.push(()=>{xhr.headers();setTimeout(()=>resolve({status:200,data:'{"choices":[{"message":{"content":"body"}}]}',config:cfg,headers:{}}),5);});});
 try{const opts=t.diagnosticAxiosConfig({adapter,timeout:123,headers:{Authorization:'Bearer sk-private'}},context('turn_xhr'));const a=opts.adapter({signal:new AbortController().signal});assert.equal(globalThis.XMLHttpRequest,Native);const b=t.diagnosticAxiosConfig({adapter},context('turn_xhr2')).adapter({});assert.equal(globalThis.XMLHttpRequest,Native);pending.forEach(f=>f());await Promise.all([a,b]);const rows=d.peekRequestLifecycleDiagnostics().requests;assert.equal(rows.length,2);for(const r of rows){assert.ok(r.headersAt<r.firstContentAt);assert.equal(r.status,'completed');}assert.equal(opts.timeout,123);assert.equal(opts.headers.Authorization,'Bearer sk-private');assert.equal(JSON.stringify(rows).includes('private'),false);const bad=t.diagnosticAxiosConfig({adapter:()=>{throw new Error('private failure');}},context('turn_xhr3'));assert.throws(()=>bad.adapter({}));assert.equal(globalThis.XMLHttpRequest,Native);}finally{globalThis.XMLHttpRequest=old;}
});

test('first content excludes heartbeat, whitespace and provider reasoning fields',()=>{
 for(const x of [{},{choices:[{delta:{content:'  ',reasoning_content:'thought'}}]},{delta:{type:'thinking_delta',thinking:'text'}},{candidates:[{content:{parts:[{thought:true,text:'text'}]}}]}])assert.equal(d.hasEffectiveResponseContent(x),false);
 for(const x of [{choices:[{delta:{content:'正文'}}]},{delta:{type:'text_delta',text:'正文'}},{candidates:[{content:{parts:[{text:'正文'}]}}]}])assert.equal(d.hasEffectiveResponseContent(x),true);
});

test('foreground request still unwinding after ready prevents premature background drained',()=>{
 reset();d.diagnosticBusyChanged(true,'turn_unwinding');const c=new AbortController();const trace=d.startRequestDiagnostic(context('turn_unwinding'),'fixture',c.signal);d.diagnosticBusyChanged(false);d.sealDiagnosticTurn('turn_unwinding');d.noteDiagnosticCancellation(c.signal,'cancel_all');c.abort();let turn=d.peekRequestLifecycleDiagnostics().turns.find(t=>t.turnId==='turn_unwinding');assert.equal(turn.inFlightRequests,1);assert.equal(turn.backgroundEndedAt,null);trace.finish(new DOMException('aborted','AbortError'));turn=d.peekRequestLifecycleDiagnostics().turns.find(t=>t.turnId==='turn_unwinding');assert.equal(turn.inFlightRequests,0);assert.ok(turn.backgroundEndedAt);
});

test('host requests exclude diagnostic fields from host options and do not invent hidden network timings',async()=>{
 reset();const original=aiService.getTavernHelper;let passed;aiService.getTavernHelper=()=>({generate:async o=>{passed=o;return 'host body';}});try{await aiService.generateWithTavern({generation_id:'gen_host',requestMaxRetries:0,diagnostics:context('turn_host')});const row=d.peekRequestLifecycleDiagnostics().requests[0];assert.equal(row.transport,'TavernHelper');assert.equal(row.headersAt,null);assert.equal(row.firstContentAt,null);assert.equal(row.status,'completed');assert.equal(Object.hasOwn(passed,'diagnostics'),false);}finally{aiService.getTavernHelper=original;}
});
