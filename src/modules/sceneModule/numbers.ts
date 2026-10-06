import defaults from '../../../mod-kit/game-numbers.qingyu.json';
/** Shared numeric authority. H1 may call applyGameNumbers after validating tuning.json. */
export const GAME_NUMBERS = structuredClone(defaults);
export function applyGameNumbers(patch: unknown): void {
 const next=structuredClone(GAME_NUMBERS);
 const merge=(target:any,value:any,path:string):void=>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error(`数值配置对象无效：${path}`);
  for(const [key,v] of Object.entries(value)){
   if(!(key in target))throw Error(`未知数值配置：${path}.${key}`);
   if(v&&typeof v==='object'&&!Array.isArray(v))merge(target[key],v,`${path}.${key}`);
   else if(typeof v!==typeof target[key]||typeof v==='number'&&!Number.isFinite(v))throw Error(`数值配置类型无效：${path}.${key}`);
   else target[key]=v;
  }
 };
 merge(next,patch,'numbers');
 if(next.levels.gapOne<0||next.levels.gapMany<next.levels.gapOne||next.combat.simulation.minWinRate<0||next.combat.simulation.maxWinRate>1||next.combat.simulation.minWinRate>next.combat.simulation.maxWinRate||next.training.progressPerLevel<=0||Object.values(next.currency).some(v=>v<=0))throw Error('数值配置范围无效');
 // Keep nested references alive for H1 readers and already-imported defaults.
 merge(GAME_NUMBERS,next,'numbers');
}
export const boundedStat=(n:number):number=>Math.max(-GAME_NUMBERS.factors.statCap,Math.min(GAME_NUMBERS.factors.statCap,Math.round((n-GAME_NUMBERS.factors.center)/GAME_NUMBERS.factors.statDivisor)));
export const boundedLuck=(n:number):number=>Math.max(-GAME_NUMBERS.factors.luckCap,Math.min(GAME_NUMBERS.factors.luckCap,Math.round((n-GAME_NUMBERS.factors.center)/GAME_NUMBERS.factors.luckDivisor)));
