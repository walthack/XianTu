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
export {simulateContract} from './combat-simulation.mjs';
import {simulateContract,plainPlayerOpts} from './combat-simulation.mjs';
// 真机画像合同：门槛按真机玩家打法（只用 plainPlayer.leverKinds 抓手）算；全抓手胜率另列 fullLevers 供对照。
const rows=SCENE_CONTRACTS.filter(c=>c.meta.hook.required&&!SIM.excluded.includes(c.meta.id)).map(c=>{const o=plainPlayerOpts(c);if(!o)return simulateContract(c);const r=simulateContract(c,N,o);r.policy='plainPlayer';r.fullLevers=simulateContract(c).winRate;return r;});
for(const r of rows){console.log(`${r.winRate<SIM.minWinRate?'FAIL':r.winRate>SIM.maxWinRate?'WARN':'PASS'} ${r.contractId}: ${(r.winRate*100).toFixed(2)}% (${r.wins}/${r.n}, 未收束${r.unresolved})${r.policy?`［真机画像，全抓手 ${(r.fullLevers*100).toFixed(2)}%］`:''}`);if(r.missingLevels.length)console.warn(`缺原著时点级数（无级差修正）：${r.missingLevels.join(',')}`);}
if(process.env.COMBAT_SIM_REPORT)writeFileSync(process.env.COMBAT_SIM_REPORT,JSON.stringify({seed:'0x600006+i*7919',policy:'legal expected progress; no dice lookahead; source id/timepoint levels; NA not level zero',rows},null,2)+'\n');
if(rows.some(r=>r.winRate<SIM.minWinRate))process.exitCode=1;
