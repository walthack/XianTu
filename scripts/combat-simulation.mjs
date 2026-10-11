import {referencePlan} from './combat-reference-plan.mjs';
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
