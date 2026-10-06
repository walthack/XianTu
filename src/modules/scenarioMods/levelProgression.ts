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
/** Pure receipt payload; callers apply it once through the existing judgement receipt. */
export function trainingRealm(save:any,text:string,outcome:string):any|null {
 if(!/练功|修炼|闭关|冲关|冲击境界/.test(text))return null;
 const current=save?.角色?.属性?.境界;if(!current)return null;
 const r=structuredClone(current),level=levelOf(r)??0,d=difficultySettings(save),canon=stageCanonLevel(save)??level;
 const cap=d.trainingCap==='none'?GAME_NUMBERS.levels.max:Math.min(GAME_NUMBERS.levels.max,canon+(d.trainingCap==='canon+1'?GAME_NUMBERS.training.canonExtra:0));
 r.下一级所需=GAME_NUMBERS.training.progressPerLevel;
 const success=['success','great_success','perfect'].includes(outcome),need=Math.max(1,Number(r.下一级所需)||GAME_NUMBERS.training.progressPerLevel);
 if(/冲关|冲击境界/.test(text)) {if(r.阶段!=='后期'||r.当前进度<need||level>=cap)return null;return success?{...realmAt(level+1),九阳层次:r.九阳层次}:{...r,当前进度:Math.floor(need*GAME_NUMBERS.training.failureRetention)};}
 if(!success)return null;
 r.当前进度=Math.min(need,Math.max(0,Number(r.当前进度)||0)+(outcome==='success'?GAME_NUMBERS.training.successProgress:GAME_NUMBERS.training.greatProgress));
 if(r.当前进度>=need&&r.阶段!=='后期'){r.阶段=r.阶段==='中期'?'后期':'中期';r.当前进度=0;}
 return r;
}

export function canBreakthrough(save:any):boolean {const r=save?.角色?.属性?.境界;if(!r)return false;const d=difficultySettings(save),level=levelOf(r)??0,canon=stageCanonLevel(save)??level;const cap=d.trainingCap==='none'?GAME_NUMBERS.levels.max:Math.min(GAME_NUMBERS.levels.max,canon+(d.trainingCap==='canon+1'?GAME_NUMBERS.training.canonExtra:0));return r.阶段==='后期'&&Number(r.当前进度)>=Number(r.下一级所需)&&level<cap;}
