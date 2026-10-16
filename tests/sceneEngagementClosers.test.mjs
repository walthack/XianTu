// r4 真机「05b 与鬼巫王交锋收不了尾」：脱身 / 喷血 / 逼退丹宸 被归成不推轨道的「躲开骨虎和断斧」，固定骰 20 也结束不了。
// 通用守卫：所有场景交锋合同里，每个推进目标都有别称；玩家用其中任何一个说法，都不会被铺垫目标吞掉（模型选了铺垫目标也一样）；
// 胜利条件里要推到终态的轨道（not 里的是要避免的，不算），至少有一个带别称的推进目标能推它。
import test from 'node:test';import assert from 'node:assert/strict';
import {loadTs} from './loadTs.mjs';
const mod=await loadTs('../src/modules/sceneModule/index.ts'),reg=await loadTs('../src/modules/sceneModule/contracts/registry.ts'),rec=await loadTs('../src/modules/sceneModule/host/recognize.ts'),plan=await loadTs('../src/modules/sceneModule/plan.ts');
const kind=g=>g.type||'push';
const pushGoals=c=>plan.goalsOf(c).filter(g=>kind(g)==='push');
const stateFor=(c,g)=>{const {state}=mod.beginScene(c);state.beat=Math.max(1,g.availability?.fromBeat||1);for(const p of c.parties)state.present[p.id]=true;state.departed=[];return state;};
const supportsAt=(c,state)=>plan.goalsOf(c).filter(g=>kind(g)!=='push'&&(g.availability?.fromBeat||1)<=state.beat&&(g.availability?.untilBeat??Infinity)>=state.beat);
const winLeaves=(node,out=[])=>{if(Array.isArray(node))node.forEach(n=>winLeaves(n,out));else if(node&&typeof node==='object'&&node.kind!=='not'){if(node.party&&node.track&&node.reach==='final')out.push(node);else Object.values(node).forEach(n=>winLeaves(n,out));}return out;};

test('scene contracts exist and every push goal carries aliases',()=>{
 assert.ok(reg.SCENE_CONTRACTS.length>=10);
 const bare=reg.SCENE_CONTRACTS.flatMap(c=>pushGoals(c).filter(g=>!(g.aliases||[]).some(a=>String(a).length>=2)).map(g=>`${c.meta.id}/${g.id}（${g.label}）`));
 assert.deepEqual(bare,[],`推进目标没有别称，玩家的自然说法会被铺垫目标吞掉：\n${bare.join('\n')}`);
});

test('every alias of every push goal reaches that goal — by rules, and when the model answers any support goal',async()=>{
 const misses=[];let checked=0;
 for(const c of reg.SCENE_CONTRACTS)for(const g of pushGoals(c)){
  if(g.when)continue;
  const state=stateFor(c,g);
  for(const alias of g.aliases||[]){
   checked++;
   const by=[['规则',undefined],...supportsAt(c,state).map(s=>[`模型选了${s.id}`,async()=>JSON.stringify({goal:s.id,claim:{magnitude:1,scope:'single',targets:[]},levers:[]})])];
   for(const [who,ask] of by){
    const got=(await rec.recognizeAction(c,state,alias,undefined,ask)).plan?.goal;
    if(got!==g.id)misses.push(`${c.meta.id}/${g.id} 「${alias}」(${who}) → ${got??'无'}`);
   }
  }
 }
 assert.ok(checked>=50,`只检查了 ${checked} 个别称`);
 assert.deepEqual(misses,[],misses.join('\n'));
});

test('every win condition that needs a track at its final state has an aliased push goal able to push it',()=>{
 const gaps=[];let leaves=0;
 for(const c of reg.SCENE_CONTRACTS)for(const leaf of winLeaves(c.objective?.win)){
  leaves++;
  const owners=pushGoals(c).filter(g=>(!g.track||g.track===leaf.track)&&(!g.targetIds||g.targetIds.includes(leaf.party))&&(g.aliases||[]).length);
  if(!owners.length)gaps.push(`${c.meta.id}: ${leaf.party}.${leaf.track}`);
 }
 assert.ok(leaves>=5,`只找到 ${leaves} 个收尾条件`);
 assert.deepEqual(gaps,[],gaps.join('\n'));
});

// f10 / 05b 的原话回归
const f10=reg.sceneContractById('combat.f10.ghost_king_clash');
const late=()=>{const {state}=mod.beginScene(f10);state.beat=5;state.present.gui_wu_wang=false;state.departed.push('gui_wu_wang');state.present.dan_chen=true;state.present.hu_sha=true;state.tags.push({id:'blood_known',label:'血是阴魂的天敌',on:'pc',durationBeats:null,effect:'你的血是这些阴魂的天敌'});return state;};
const swallowed=async(state,text)=>(await rec.recognizeAction(f10,state,text,undefined,async()=>JSON.stringify({goal:'survive_tiger',claim:{magnitude:1,scope:'single',targets:[]},levers:[]}))).plan;

test('05b r4 phrases: escape / blood spray / forcing Dan Chen back reach a closing goal even if the model says survive_tiger',async()=>{
 for(const [text,goal,target] of [['脱身外撤','drive_away','dan_chen'],['双刀逼退丹宸冲出','drive_away','dan_chen'],['真阳之血喷骨虎','destroy_tiger','hu_sha']]){
  const p=await swallowed(late(),text);assert.equal(p?.goal,goal,text);assert.deepEqual(p.targets,[target],text);
  const r=(await rec.recognizeAction(f10,late(),text,undefined)).plan;assert.equal(r?.goal,goal,`${text}（规则）`);
 }
 const blood=await swallowed(late(),'真阳之血喷骨虎');assert.deepEqual(blood.levers.map(l=>l.element),['true_yang_blood'],'血杠杆跟着走，骨虎的轨道才不会被拦');
});

test('05b: no blood, no tiger kill — an ordinary blade at the tiger stays on survive_tiger (design: 普通刀砍不能消灭它)',async()=>{
 for(const text of ['击退骨虎','挥刀砍骨虎']){const p=await swallowed(late(),text);assert.equal(p?.goal,'survive_tiger',text);}
});

test('05b: a finished Dan Chen track is not re-targeted by escape words',async()=>{
 const state=late();state.tracks.dan_chen.resist=5;
 const p=await swallowed(state,'脱身外撤');assert.equal(p?.goal,'survive_tiger');
});
