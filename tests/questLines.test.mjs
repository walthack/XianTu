import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './loadTs.mjs';
const q=await loadTs('../src/modules/scenarioMods/questLines.ts');
const ctx={completedEventIds:['test.host'],presentActorIds:['test.actor'],knownFactIds:['test.fact'],locationId:'test.place',chapterOrder:{'test.chapter':70},currentChapterOrder:70,affinity:{'test.actor':60},flags:{'test.flag':true}};
const line={id:'test.line',kind:'character',name:'测试占位',entryHint:'占位',ownerCharacterIds:['test.actor'],entry:{all:[{eventDone:'test.host'},{affinityAtLeast:{actorId:'test.actor',value:60}},{chapterAtLeast:'test.chapter'}]},beats:[{id:'test.beat',mode:'insert',hostEventId:'test.host',eventId:'test.insert',objective:'测试占位',requires:{all:[{presentActor:'test.actor'},{knownFact:'test.fact'},{atLocation:'test.place'}]},completedBy:{eventActionReceipt:{eventId:'test.insert',actionId:'test.choose'}},onComplete:[{kind:'reveal',factId:'test.fact',source:'told_privately'}]}]};
const state={version:1,receipts:{}};
test('quest line parser accepts empty author table and validates insertion-only white effects',()=>{
 assert.deepEqual(q.parseQuestLines({version:1,lines:[]}).lines,[]);assert.deepEqual(q.parseQuestLines({version:1,lines:[line]}).lines[0],line);
 for(const change of [l=>l.ownerCharacterIds=[],l=>l.beats[0].mode='mandatory',l=>l.beats[0].completedBy.eventActionReceipt.eventId='test.host',l=>l.beats[0].onComplete=[{kind:'writePath',path:'角色.属性'}],l=>l.beats[0].eventId='test.host',l=>l.entry={all:[]},l=>l.beats.push(structuredClone(l.beats[0]))]){
  const copy=structuredClone(line);change(copy);assert.throws(()=>q.parseQuestLines({version:1,lines:[copy]}));
 }
});
test('chapter, affinity, presence, facts and location conditions compose without bypass',()=>{
 assert.equal(q.lineInsertionsAt([line],'test.host',ctx,state).length,1);
 for(const patch of [{currentChapterOrder:69},{affinity:{'test.actor':59}},{presentActorIds:[]},{knownFactIds:[]},{locationId:'test.other'}])assert.equal(q.lineInsertionsAt([line],'test.host',{...ctx,...patch},state).length,0);
 assert.equal(q.lineConditionMet({any:[{flag:{id:'test.flag',value:false}},{not:{eventDone:'test.missing'}}]},ctx),true);
});
test('parent event completion cannot settle an insertion; its own code receipt plans effects exactly once',()=>{
 const receipt={id:'test.receipt',eventId:'test.insert',actionId:'test.choose',outcome:'success',turn:9};
 assert.equal(q.settleLineInsertion(line,'test.beat',{...receipt,eventId:'test.host'},ctx,state),null);
 assert.equal(q.settleLineInsertion(line,'test.beat',{...receipt,outcome:'failure'},ctx,state),null);
 const out=q.settleLineInsertion(line,'test.beat',receipt,ctx,state);assert.deepEqual(out.effects,line.beats[0].onComplete);assert.deepEqual(state,{version:1,receipts:{}});
 assert.equal(out.state.receipts['test.beat'].receiptId,receipt.id);assert.equal(q.settleLineInsertion(line,'test.beat',receipt,ctx,out.state),null);
});
test('reference validation checks every owner, condition, receipt and whitelisted effect',()=>{
 const table=q.parseQuestLines({version:1,lines:[line]});assert.deepEqual(q.validateQuestLineReferences(table,()=>true),[]);
 const seen=[];const errors=q.validateQuestLineReferences(table,(kind,id,ev)=>{seen.push([kind,id,ev]);return false;});
 assert.ok(errors.includes('character: test.actor'));assert.ok(errors.includes('event: test.insert'));assert.ok(errors.includes('chapter: test.chapter'));assert.ok(seen.some(([kind,id,event])=>kind==='action'&&id==='test.choose'&&event==='test.insert'));
});
