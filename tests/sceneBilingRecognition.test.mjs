// r2 真机「碧鲮湾交锋无法收束」：蛇傀倒下、族人脱险后，守村口 / 救火楼 的话被归到不改胜负的「阻止滥杀奴隶」，村口那条轨道永远推不动。
import test from 'node:test';import assert from 'node:assert/strict';
import {loadTs} from './loadTs.mjs';
const mod=await loadTs('../src/modules/sceneModule/index.ts'),reg=await loadTs('../src/modules/sceneModule/contracts/registry.ts'),rec=await loadTs('../src/modules/sceneModule/host/recognize.ts'),brief=await loadTs('../src/modules/sceneModule/brief.ts');
const contract=reg.sceneContractById('combat.f07.biling_village');
const fresh=(tracks={})=>{const {state}=mod.beginScene(contract);for(const [p,t] of Object.entries(tracks))Object.assign(state.tracks[p],t);return state;};
const ask=reply=>async()=>JSON.stringify(reply);
const plan=async(state,text,reply)=>(await rec.recognizeAction(contract,state,text,undefined,reply&&ask(reply))).plan;
const afterTwo=()=>fresh({armed:{vit:2},fire:{rescue:2}});

test('rules path: sealing / rescuing phrases reach the push goal that owns that party (not the support goal)',async()=>{
 const s=afterTwo();
 for(const [text,goal,target] of [['守村口','seal','exit'],['守住村口，不让一个人跑掉','seal','exit'],['我堵住村口','seal','exit'],['封锁村口','seal','exit'],['救火楼','rescue','fire'],['我去救火楼里的人','rescue','fire']]){
  const p=await plan(s,text);assert.equal(p?.goal,goal,text);assert.deepEqual(p.targets,[target],text);
 }
});

test('model path: a support-goal reply is regrounded to the push goal when the player names its party and not the support words',async()=>{
 const s=afterTwo();
 for(const [state,text,goal,target] of [[s,'守村口','seal','exit'],[fresh({armed:{vit:2}}),'我去救火楼里的人','rescue','fire']]){
  const p=await plan(state,text,{goal:'stop_slaughter',claim:{magnitude:1,scope:'single',targets:[]},levers:[]});
  assert.equal(p?.goal,goal,text);assert.deepEqual(p.targets,[target],text);
 }
 // a model reply on the right goal but with the wrong party is still rejected-then-rescued by rules, never left on the support goal
 const p=await plan(s,'守村口',{goal:'seal',claim:{magnitude:1,scope:'single',targets:['armed']},levers:[]});
 assert.equal(p?.goal,'seal');assert.deepEqual(p.targets,['exit']);
});

test('the support goal still wins when the player actually talks about stopping the slaughter',async()=>{
 const s=afterTwo();
 const p=await plan(s,'我喊话阻止他们滥杀奴隶',{goal:'stop_slaughter',claim:{magnitude:1,scope:'single',targets:[]},levers:[]});
 assert.equal(p?.goal,'stop_slaughter');
});

test('a finished track is not re-targeted: with the exit already sealed, naming it keeps the support goal',async()=>{
 const s=fresh({armed:{vit:2},fire:{rescue:2},exit:{seal:2}});
 const p=await plan(s,'守村口',{goal:'stop_slaughter',claim:{magnitude:1,scope:'single',targets:[]},levers:[]});
 assert.equal(p?.goal,'stop_slaughter');
});

test('result card: a support goal does not claim "reached the ceiling" (no push was attempted)',()=>{
 const lines=brief.renderResultLines(contract,{goalLabel:'阻止滥杀奴隶',tierLabel:'成功',tier:'success',face:12,mode:'normal',modifier:0,total:12,difficulty:7,enemy:[],claims:[{party:'armed',claimed:0,realized:0}]});
 assert.ok(!lines.some(l=>/上限/.test(l)),lines.join('\n'));
 const push=brief.renderResultLines(contract,{goalLabel:'守村口',tierLabel:'成功',tier:'success',face:12,mode:'normal',modifier:0,total:12,difficulty:7,enemy:[],claims:[{party:'exit',claimed:1,realized:0}]});
 assert.ok(push.some(l=>/上限/.test(l)));
});
