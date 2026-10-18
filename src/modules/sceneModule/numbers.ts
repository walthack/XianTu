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
 const goalProfiles=next.goalModifiers as Record<string,{factorProfile:string;levelGap:boolean}>;
 if(!goalProfiles.default||Object.values(goalProfiles).some(profile=>!profile||typeof profile.factorProfile!=='string'||(profile.factorProfile!=='scene'&&!(profile.factorProfile in next.weights))||typeof profile.levelGap!=='boolean'))throw Error('目标修正配置无效');
 // Keep nested references alive for H1 readers and already-imported defaults.
 const before=structuredClone(GAME_NUMBERS);
 merge(GAME_NUMBERS,next,'numbers');
 // 模块自带的体检（自由行动、判定线等）：不过就退回合并前的数值并报错，热改整份拒绝。
 const problems=numbersValidators.flatMap(check=>check());
 if(problems.length){merge(GAME_NUMBERS,before,'numbers');throw Error(`数值体检未通过：${problems.join('；')}`);}
}
const numbersValidators:Array<()=>string[]>=[];
/** 模块在加载时登记自己的数值体检（读 GAME_NUMBERS，返回错误列表，空 = 通过）；applyGameNumbers 合并后逐个跑。 */
export function registerNumbersValidator(check:()=>string[]):void{if(!numbersValidators.includes(check))numbersValidators.push(check);}
/** "training.successProgress" 这类对已有数值键的引用；数字原样返回，查不到是 NaN。 */
export function resolveNumberRef(value:unknown):number{
 if(typeof value==='number')return value;
 if(typeof value!=='string')return NaN;
 let node:unknown=GAME_NUMBERS;
 for(const part of value.split('.'))node=(node as Record<string,unknown>|undefined)?.[part];
 return typeof node==='number'?node:NaN;
}
export const boundedStat=(n:number):number=>Math.max(-GAME_NUMBERS.factors.statCap,Math.min(GAME_NUMBERS.factors.statCap,Math.round((n-GAME_NUMBERS.factors.center)/GAME_NUMBERS.factors.statDivisor)));
export const boundedLuck=(n:number):number=>Math.max(-GAME_NUMBERS.factors.luckCap,Math.min(GAME_NUMBERS.factors.luckCap,Math.round((n-GAME_NUMBERS.factors.center)/GAME_NUMBERS.factors.luckDivisor)));
