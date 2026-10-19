import {createJiti}from'jiti';
import {fileURLToPath}from'node:url';
const jiti=createJiti(import.meta.url,{alias:{'@':fileURLToPath(new URL('../src',import.meta.url))}});
const core=await jiti.import(fileURLToPath(new URL('../src/modules/sceneModule/index.ts',import.meta.url)));
export function referencePlan(c,s,ctx){
 if(c.clock?.onTimeout?.type==='close'&&c.clock.onTimeout.as==='win'&&c.goals.some(g=>g.id==='defend'))return {goal:'defend',magnitude:1,scope:'single',targets:['pc'],levers:[]};
 let best=null,bestScore=-Infinity;
 for(const g of c.goals.filter(g=>!['yield_guard','expose_self','interrogate','read_situation','read_field','reveal'].includes(g.id))){
  const targets=c.parties.filter(p=>p.side==='opposed'&&s.present[p.id]&&!s.departed.includes(p.id)&&p.tracks?.some(t=>(s.tracks[p.id]?.[t.id??t.track]??0)<core.trackInfo(c,p.id,t.id??t.track).limit)).map(p=>p.id);
  const levers=(c.elements||[]).flatMap(e=>(e.verbs||[]).filter(v=>!v.goalTags?.length||v.goalTags.includes(g.id)).map(v=>({element:e.id,verb:v.id})));
  const choices=[[],...levers.map(l=>[l]),...levers.flatMap((l,i)=>levers.slice(i+1).filter(r=>r.element!==l.element).map(r=>[l,r]))];
  // 合同把几名敌人编成同一行动组（actionGroup）时，玩家可以把这一组当一个目标（“其余武士们”）：参考玩家也试这些组。
  const groups=[...new Map(targets.map(id=>[c.parties.find(p=>p.id===id)?.actionGroup||id,null])).keys()].map(g=>targets.filter(id=>(c.parties.find(p=>p.id===id)?.actionGroup||id)===g)).filter(list=>list.length>1);
  for(const target of [targets,...groups,...targets.map(p=>[p])])for(const magnitude of [1,2,3])for(const chosen of choices){
   const plan={goal:g.id,magnitude,scope:target.length>1?'group':'single',targets:target,levers:chosen};
   try{const ev=core.evaluatePlan(c,s,plan,ctx);const moves=ev.targets.reduce((n,t)=>n+t.realizable,0);const prob=ev.odds.success+ev.odds.great_success;const score=moves*prob+(g.id==='reach_altar'?2:0)+(g.id==='defend'?0.01:0)+prob*.001;
    if(score>bestScore){bestScore=score;best=plan;}
   }catch{}
  }
 }
 return best;
}
