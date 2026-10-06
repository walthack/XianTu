import {GAME_NUMBERS} from '../modules/sceneModule/numbers';
import table from '../../mod-kit/entity-catalog/levels.json';
export const LEVELS = table.entries.map(e => e.definition);
export const GAOSHOUBANG_NARRATION_RULE = '级数只用原著九级称谓：'+LEVELS.map(e=>`${e.level}级${e.name}`).join('、')+'。小阶段仅初期/中期/后期；等级与突破只按代码回执描写，不自行升阶。';
export function levelOf(realm: unknown): number | null {
 const name=typeof realm==='string'?realm:(realm as any)?.名称;
 return LEVELS.find(e=>e.name===name)?.level ?? null;
}
export function levelName(level:number):string{return LEVELS.find(e=>e.level===level)?.name || LEVELS[0].name;}
export function toGaoshoubangName(name:string):string{return name;}
export function formatRealmWithStage(realm:any):string {
 const name=typeof realm==='string'?realm:realm?.名称 || levelName(0);
 const phase=typeof realm==='object'&&['初期','中期','后期'].includes(realm?.阶段)?realm.阶段:'';
 return name+(levelOf(name)!==0&&phase?'·'+phase:'')+(realm?.九阳层次?' · '+realm.九阳层次:'');
}
export function stageBonus(realm:any):number{return GAME_NUMBERS.levels.phases[realm?.阶段 as keyof typeof GAME_NUMBERS.levels.phases] ?? 0;}
export {levelModifier,levelTier} from '../modules/sceneModule/levels';
