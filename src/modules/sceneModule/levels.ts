import {GAME_NUMBERS} from './numbers';
/** Pure level-gap arithmetic; id/name authority stays in the host catalogue. */
export function levelModifier(own:number|undefined,opponent:number|undefined):number{if(own===undefined||opponent===undefined)return 0;return Math.sign(own-opponent)*(Math.abs(own-opponent)>=2?GAME_NUMBERS.levels.gapMany:Math.abs(own-opponent)===1?GAME_NUMBERS.levels.gapOne:0);}
export function goalModifierRule(profile:string|undefined):{factorProfile:string;levelGap:boolean}{const profiles=GAME_NUMBERS.goalModifiers as Record<string,{factorProfile:string;levelGap:boolean}>;return profiles[profile||'default']||profiles.default;}
export function levelTier(own:number|undefined,opponent:number|undefined):string {if(own===undefined||opponent===undefined)return "不适用九级";const d=own-opponent;return d>=2?'碾压':d===1?'占优':d===0?'同级':d===-1?'吃力':'被碾压';}
