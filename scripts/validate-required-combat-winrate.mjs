import {createJiti} from 'jiti';
import {fileURLToPath} from 'node:url';
import {writeFileSync,readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url),jiti=createJiti(import.meta.url,{alias:{'@':fileURLToPath(new URL('src',root))}});
const core=await jiti.import(fileURLToPath(new URL('src/modules/sceneModule/index.ts',root)));
const {SCENE_CONTRACTS}=await jiti.import(fileURLToPath(new URL('src/modules/sceneModule/contracts/registry.ts',root)));
const {namedEntity}=await jiti.import(fileURLToPath(new URL('src/modules/scenarioMods/namedEntities.ts',root)));
const {GAME_NUMBERS}=await jiti.import(fileURLToPath(new URL('src/modules/sceneModule/numbers.ts',root)));
const {levelFact,effectiveLevel,contractChapter,contractVariant}=await jiti.import(fileURLToPath(new URL('src/modules/scenarioMods/characterLevels.ts',root)));
const SIM=GAME_NUMBERS.combat.simulation;
const N=Number(process.env.COMBAT_SIM_N)||SIM.samples;
/** Deterministic reference player. Chooses legal expected track progress without inspecting future dice; always uses available authored levers. */
export function referencePlan(c,s,ctx){
 if(c.clock?.onTimeout?.type==='close'&&c.clock.onTimeout.as==='win'&&c.goals.some(g=>g.id==='defend'))return {goal:'defend',magnitude:1,scope:'single',targets:['pc'],levers:[]};
 let best=null,bestScore=-Infinity;
 for(const g of c.goals.filter(g=>!['yield_guard','expose_self','interrogate','read_situation','read_field','reveal'].includes(g.id))){
  const targets=c.parties.filter(p=>p.side==='opposed'&&s.present[p.id]&&!s.departed.includes(p.id)&&p.tracks?.some(t=>(s.tracks[p.id]?.[t.id??t.track]??0)<core.trackInfo(c,p.id,t.id??t.track).limit)).map(p=>p.id);
  const levers=(c.elements||[]).flatMap(e=>(e.verbs||[]).filter(v=>!v.goalTags?.length||v.goalTags.includes(g.id)).map(v=>({element:e.id,verb:v.id})));
  const choices=[[],...levers.map(l=>[l]),...levers.flatMap((l,i)=>levers.slice(i+1).filter(r=>r.element!==l.element).map(r=>[l,r]))];
  for(const target of [targets,...targets.map(p=>[p])])for(const magnitude of [1,2,3])for(const chosen of choices){
   const plan={goal:g.id,magnitude,scope:target.length>1?'group':'single',targets:target,levers:chosen};
   try{const ev=core.evaluatePlan(c,s,plan,ctx);const moves=ev.targets.reduce((n,t)=>n+t.realizable,0);const prob=ev.odds.success+ev.odds.great_success;const score=moves*prob+(g.id==='reach_altar'?2:0)+(g.id==='defend'?0.01:0)+prob*.001;
    if(score>bestScore){bestScore=score;best=plan;}
   }catch{}
  }
 }
 return best;
}
export function simulateContract(c,n=N){let wins=0,losses=0,unresolved=0;const missing=new Set();
 const project=(s)=>{s.levels={};s.stages={};for(const p of c.parties){const id=p.enemyId||p.ref,fact=levelFact(id,contractChapter(c,s.beat),contractVariant(c,id,s));
  const enemy=namedEntity('enemy',id),level=fact?effectiveLevel(fact):enemy?.level;
  if(s.present[p.id]&&!fact&&!c.levelContext?.nonLevelPartyIds?.includes(p.id))missing.add(id);
  if(!c.levelContext?.nonLevelPartyIds?.includes(p.id)&&level!==undefined&&level!==null)s.levels[p.id]=level;
  s.stages[p.id]=0;if(fact&&!fact.available){s.present[p.id]=false;if(!s.departed.includes(p.id))s.departed.push(p.id);}
 }};
 for(let i=0;i<n;i++){let s=core.beginScene(c,{seed:SIM.seed+i*SIM.seedStride}).state;project(s);
  const ctx={factors:0,playerDefense:0};
  for(let t=0;t<SIM.maxBeats&&s.status==='engaged';t++){project(s);const plan=referencePlan(c,s,ctx);if(!plan)break;s=core.confirmAction(c,s,plan,ctx).state;}
  if(s.outcome?.kind==='win')wins++;else if(s.outcome)losses++;else unresolved++;
 }
 return {contractId:c.meta.id,n,wins,losses,unresolved,winRate:wins/n,missingLevels:[...missing]};
}
const rows=SCENE_CONTRACTS.filter(c=>c.meta.hook.required&&!SIM.excluded.includes(c.meta.id)).map(c=>simulateContract(c));
for(const r of rows){console.log(`${r.winRate<SIM.minWinRate?'FAIL':r.winRate>SIM.maxWinRate?'WARN':'PASS'} ${r.contractId}: ${(r.winRate*100).toFixed(2)}% (${r.wins}/${r.n}, 未收束${r.unresolved})`);if(r.missingLevels.length)console.warn(`缺原著时点级数（无级差修正）：${r.missingLevels.join(',')}`);}
if(process.env.COMBAT_SIM_REPORT)writeFileSync(process.env.COMBAT_SIM_REPORT,JSON.stringify({seed:'0x600006+i*7919',policy:'legal expected progress; no dice lookahead; source id/timepoint levels; NA not level zero',rows},null,2)+'\n');
if(rows.some(r=>r.winRate<SIM.minWinRate))process.exitCode=1;
