import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoLedger,runDemo,parseJson,visibleContent} from '../scripts/module-demo-core.mjs';
const scope={characterId:'fixture',slotId:'pact',revision:1,turnId:'a'};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

test('provider adapters discard complete thinking tags and reject incomplete tags',()=>{
 assert.deepEqual(parseJson('<think>private provider reasoning</think>\n```json\n{"facts":[]}\n```'),{facts:[]});
 assert.equal(visibleContent('<minimax:think>private</minimax:think>正文'),'正文');
 assert.throws(()=>parseJson('<think>incomplete'),/incomplete_thinking_block/);
});

test('ready does not wait for side jobs; two independent modules start together',async()=>{
 const a=deferred(),b=deferred();const started=[];const ledger=new DemoLedger(scope);
 const result=await runDemo({scope,ledger,render:async()=>({text:'accepted'}),validate:()=>{},
  summarize:async()=>{started.push('memory');return a.promise;},optimize:async()=>{started.push('quality');return b.promise;}});
 assert.deepEqual(started,['memory','quality']);assert.equal(ledger.receipts.size,1);assert.equal(ledger.sidecars.size,0);
 a.resolve({memory:'m'});b.resolve({text:'q'});const done=await result.background;
 assert.equal(done.sidecars.every(s=>s.attachment.accepted),true);assert.equal(ledger.sidecars.size,2);
});
test('late tasks after save switch cannot attach to another save or recommit turn',async()=>{
 const pending=deferred(),ledger=new DemoLedger(scope);
 const result=await runDemo({scope,ledger,render:async()=>({text:'A'}),validate:()=>{},summarize:()=>pending.promise,optimize:()=>pending.promise});
 ledger.scope={...scope,slotId:'other',revision:2,turnId:'b'};pending.resolve({text:'late'});
 const done=await result.background;assert.equal(done.sidecars.every(s=>!s.attachment.accepted),true);
 assert.equal(ledger.sidecars.size,0);assert.equal(ledger.commit(scope,{}).accepted,false);
});
test('side failure does not remove accepted narrative or successful independent module',async()=>{
 const ledger=new DemoLedger(scope);
 const r=await runDemo({scope,ledger,render:async()=>({text:'ok'}),validate:()=>{},summarize:async()=>{throw new Error('fixture');},optimize:async()=>({text:'proposal'})});
 const done=await r.background;assert.equal(done.sidecars[0].attachment.reason,'module_failure');
 assert.equal(done.sidecars[1].attachment.accepted,true);assert.equal(ledger.receipts.size,1);
 assert.equal(ledger.commit(scope,{}).reason,'duplicate');
});
test('invalid narrative or old scope never starts side effects',async()=>{
 let calls=0;const opts={scope,ledger:new DemoLedger(scope),render:async()=>({text:'bad'}),validate:()=>{throw new Error('invalid');},summarize:async()=>calls++,optimize:async()=>calls++};
 await assert.rejects(runDemo(opts),/invalid/);assert.equal(calls,0);assert.equal(opts.ledger.receipts.size,0);
});
