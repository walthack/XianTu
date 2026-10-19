import {referencePlan} from './combat-reference-plan.mjs';
import {createJiti} from 'jiti';
import {fileURLToPath} from 'node:url';
import {writeFileSync,readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url),jiti=createJiti(import.meta.url,{alias:{'@':fileURLToPath(new URL('src',root))}});
const core=await jiti.import(fileURLToPath(new URL('src/modules/sceneModule/index.ts',root)));
const {SCENE_CONTRACTS}=await jiti.import(fileURLToPath(new URL('src/modules/sceneModule/contracts/registry.ts',root)));
const {GAME_NUMBERS}=await jiti.import(fileURLToPath(new URL('src/modules/sceneModule/numbers.ts',root)));
const {contractChapter,contractVariant}=await jiti.import(fileURLToPath(new URL('src/modules/scenarioMods/characterLevels.ts',root)));
const {currentActorLevel}=await jiti.import(fileURLToPath(new URL('src/modules/scenarioMods/actorLevels.ts',root)));
const SIM=GAME_NUMBERS.combat.simulation;
const HP_CFG=GAME_NUMBERS.combat.woundRules.hp,HP_MAX=SIM.playerHpMax??100;
const N=Number(process.env.COMBAT_SIM_N)||SIM.samples;
/** Deterministic reference player. Chooses legal expected track progress without inspecting future dice; always uses available authored levers. */
export function simulateContract(c,n=N){let wins=0,losses=0,unresolved=0;const missing=new Set();
 // 级数与真机同一入口（actorLevels.ts）：无存档时玩家/有名人物读等级表，无名敌人按 combat.enemyPresets 预设。
 const project=(s)=>{s.levels={};s.stages={};for(const p of c.parties){const id=p.enemyId||p.ref,got=currentActorLevel(id,{chapter:contractChapter(c,s.beat),variant:contractVariant(c,id,s),player:!!p.player,ref:p.ref});
  const level=got.level;
  const skip=c.levelContext?.nonLevelPartyIds?.includes(p.id)||core.partyRole(p)==='assist'; // 助战者不算级差（与 host/factors.ts 同一规则）
  if(s.present[p.id]&&got.source==='none'&&!skip)missing.add(id);
  if(!skip&&level!==undefined&&level!==null)s.levels[p.id]=level;
  s.stages[p.id]=0;if(!got.present){s.present[p.id]=false;if(!s.departed.includes(p.id))s.departed.push(p.id);}
 }};
 for(let i=0;i<n;i++){let s=core.beginScene(c,{seed:SIM.seed+i*SIM.seedStride}).state;project(s);
  const ctx={factors:0,playerDefense:0,factorProfiles:Object.fromEntries(Object.keys(GAME_NUMBERS.weights).map(id=>[id,0]))};
  const pc=c.parties.find(p=>p.player)?.id;let hp=HP_MAX;
  for(let t=0;t<SIM.maxBeats&&s.status==='engaged';t++){project(s);const plan=referencePlan(c,s,ctx);if(!plan)break;s=core.confirmAction(c,s,plan,ctx).state;
   // 气血与真机 host/writeback.applySceneHpLoss 同一规则：按上限比例扣、不低于 keepHp；配置打开时到保底即倒下。
   if(pc&&s.hpLoss?.[pc]>0){hp=Math.max(HP_CFG.keepHp,hp-Math.round(HP_MAX*s.hpLoss[pc]));delete s.hpLoss[pc];if(hp<=HP_CFG.keepHp&&(HP_CFG.downedAtKeep||(HP_CFG.downedAtKeepContracts||[]).includes(c.meta.id)))(s.hpDowned||={})[pc]=true;}}
  if(s.outcome?.kind==='win')wins++;else if(s.outcome)losses++;else unresolved++;
 }
 return {contractId:c.meta.id,n,wins,losses,unresolved,winRate:wins/n,missingLevels:[...missing]};
}
