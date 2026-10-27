import {levelFact} from './characterLevels';
import {namingChapter} from './ledger/naming';
import {GAME_NUMBERS} from '../sceneModule/numbers';
import {levelOf,levelName} from '../../utils/realmUtils';
export type DifficultySettings={autoRaiseLevel:boolean;trainingCap:'canon'|'canon+1'|'none'};
export const DIFFICULTY_PRESETS:Record<string,DifficultySettings>=GAME_NUMBERS.difficulty.presets as Record<string,DifficultySettings>;
export function difficultySettings(save:any):DifficultySettings {const d=save?.系统?.难度设置;return d&&typeof d.autoRaiseLevel==='boolean'&&['canon','canon+1','none'].includes(d.trainingCap)?d:{...DIFFICULTY_PRESETS[GAME_NUMBERS.difficulty.defaultPreset]};}
export function stageCanonLevel(save:any,chapterOverride?:number):number|null {const runtime=save?.世界?.状态?.剧本模组;const id=runtime?.opening?.playerCharacterId;const fact=id?levelFact(id,chapterOverride??namingChapter(runtime)):undefined;if(fact?.level!==null && fact?.level!==undefined)return fact.level;const c=save?.世界?.状态?.剧本模组?.canon?.characters?.find((c:any)=>c.id==='liuchao.character.cheng_zongyang');return Number.isInteger(c?.level)&&c.level>=0&&c.level<=GAME_NUMBERS.levels.max?c.level:null;}
export function realmAt(level:number):any{return {名称:levelName(level),阶段:'初期',当前进度:0,下一级所需:GAME_NUMBERS.training.progressPerLevel,突破描述:'练功积累，后期进度满后可冲关。'};}
export function initializeLevel(save:any,chapterOverride?:number):void {save.系统 ||= {};save.系统.难度设置 ||= {...DIFFICULTY_PRESETS[GAME_NUMBERS.difficulty.defaultPreset]};save.角色 ||= {};save.角色.属性 ||= {};const r=save.角色.属性.境界;const old=levelOf(r);const canon=stageCanonLevel(save,chapterOverride);if(old===null)save.角色.属性.境界={...realmAt(canon??0),九阳层次:r?.九阳层次};else if(difficultySettings(save).autoRaiseLevel&&canon!==null&&old<canon)save.角色.属性.境界={...realmAt(canon),九阳层次:r?.九阳层次};}
export function applyStoryLevel(save:any,to:number):void {if(!Number.isInteger(to)||to<0||to>GAME_NUMBERS.levels.max)throw Error('剧情级数必须0–9');const old=levelOf(save.角色.属性.境界)??0;const d=difficultySettings(save);const cap=stageCanonLevel(save)??old;const next=d.autoRaiseLevel?Math.max(old,to):Math.max(old,Math.min(old+GAME_NUMBERS.training.storyRaiseStep,to,cap));if(next>old)save.角色.属性.境界={...realmAt(next),九阳层次:save.角色.属性.境界?.九阳层次};}
/** 练功／冲关上限。用户 2026-10-27 13:40 定：不再按章节原著级卡上限，三档难度默认 'none'，只受境界最高级限制；
 *  存档里仍选 'canon'/'canon+1' 时，只在查得到原著级的关卡按原著级卡，查不到（null）一律按最高级，不再退成当前级。 */
export function trainingCapLevel(save:any):number {const d=difficultySettings(save),canon=stageCanonLevel(save);if(d.trainingCap==='none'||canon===null)return GAME_NUMBERS.levels.max;return Math.min(GAME_NUMBERS.levels.max,canon+(d.trainingCap==='canon+1'?GAME_NUMBERS.training.canonExtra:0));}
/** Pure receipt payload; callers apply it once through the existing judgement receipt. */
export function trainingRealm(save:any,text:string,outcome:string):any|null {
 if(!/练功|修炼|闭关|冲关|冲击境界/.test(text))return null;
 const current=save?.角色?.属性?.境界;if(!current)return null;
 const r=structuredClone(current),level=levelOf(r)??0,cap=trainingCapLevel(save);
 r.下一级所需=GAME_NUMBERS.training.progressPerLevel;
 const success=['success','great_success','perfect'].includes(outcome),need=Math.max(1,Number(r.下一级所需)||GAME_NUMBERS.training.progressPerLevel);
 if(/冲关|冲击境界/.test(text)) {if(r.阶段!=='后期'||r.当前进度<need||level>=cap)return null;return success?{...realmAt(level+1),九阳层次:r.九阳层次}:{...r,当前进度:Math.floor(need*GAME_NUMBERS.training.failureRetention)};}
 if(!success)return null;
 advanceProgress(r,outcome==='success'?GAME_NUMBERS.training.successProgress:GAME_NUMBERS.training.greatProgress,need);
 return r;
}
/** 修炼进度累加（自修与夺元共用）：进度封顶在 need；满额且不在后期则升一个小阶段、进度清零；后期满额停在满额，冲关另走 trainingRealm 的冲关分支。 */
export function advanceProgress(r:any,gain:number,need:number):void {
 r.当前进度=Math.min(need,Math.max(0,Number(r.当前进度)||0)+gain);
 if(r.当前进度>=need&&r.阶段!=='后期'){r.阶段=r.阶段==='中期'?'后期':'中期';r.当前进度=0;}
}
/** 夺元换算的修炼进度：纯函数，返回新的玩家境界（不改存档）；没有境界记录或进度≤0返回 null。 */
export function drainedRealm(save:any,gain:number):any|null {
 const current=save?.角色?.属性?.境界;if(!current||!(gain>0))return null;
 const r=structuredClone(current);r.下一级所需=GAME_NUMBERS.training.progressPerLevel;
 advanceProgress(r,gain,r.下一级所需);
 return r;
}

/** 可冲关＝冲关结算（trainingRealm 的冲关分支）有结果：后期、进度满（按 training.progressPerLevel）、未到上限。
 *  右栏「可突破!」、快捷动作「冲关」、自由行动冲关闸门与修炼票改按冲关出卡（requires.atBreakthrough）都读这一个判据（真机 db4278a0247b）。 */
export function canBreakthrough(save:any):boolean {return trainingRealm(save,'冲关','success')!==null;}
