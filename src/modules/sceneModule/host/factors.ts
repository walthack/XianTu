import {levelFact,effectiveLevel,contractChapter,contractVariant} from '../../scenarioMods/characterLevels';
import {initializeLevel} from '../../scenarioMods/levelProgression';
import {namingChapter} from '../../scenarioMods/ledger/naming';
import {GAME_NUMBERS,boundedLuck} from '../numbers';
import {levelOf,stageBonus,levelModifier} from '../../../utils/realmUtils';
import {relationshipOf} from '../../scenarioMods/ledger/affinityIdentity';
import {namedEntity,namedEntityEntries} from '../../scenarioMods/namedEntities';
// 玩家的基础判定因子取自游戏判定引擎；幸运改按气运取固定值（可复现）。
import { pruneSceneInjuries } from './injuries';
import { runtimeOf } from './refs';
import type { SaveData } from '@/types/game';
import type { JudgementKind } from '@/utils/judgementEngine';
import { buildEventActionJudgementProposal } from '@/utils/judgementPreflight';
import { resolveStatusDef, type Contract } from '../index';

export interface Factor { label: string; value: number }

export function effectiveFortune(save: SaveData): number {
  const identity = (save as any)?.角色?.身份;
  const innate = Number(identity?.先天六司?.气运) || GAME_NUMBERS.factors.center;
  const acquired = Number(identity?.后天六司?.气运) || 0;
  return Math.min(GAME_NUMBERS.factors.fortuneMax, Math.max(GAME_NUMBERS.factors.fortuneMin, innate + acquired));
}

/** 取现有随机幸运（judgementRules.ts）的期望值，不再另掷。 */
export function fixedLuck(fortune: number): number {
  const f = Math.min(GAME_NUMBERS.factors.fortuneMax, Math.max(GAME_NUMBERS.factors.fortuneMin, Number(fortune) || 0));
  return boundedLuck(f);
}

export function baseFactors(save: SaveData, contract: Contract, kind: JudgementKind, actionText?:string): Factor[] {
  // Structured scene statuses are applied by the scene engine, not counted again by the game proposal.
  const input=structuredClone(save),player=contract.parties.find(p=>p.player);
  if(runtimeOf(save) && player) {
    const rows=pruneSceneInjuries(input).actors[player.ref] || [];
    const sources=new Set(rows.filter(row=>resolveStatusDef(row.statusId,contract)).map(row=>row.sourceScene));
    if(Array.isArray(input.角色?.效果)) input.角色.效果=input.角色.效果.filter((effect: any)=>!sources.has(effect.来源 || ''));
  }
  const proposal = buildEventActionJudgementProposal(input, 0, {
    eventId: contract.meta.hook.eventId || contract.meta.id,
    actionId: 'scene_module_preview',
    actionText: actionText || contract.objective.text,
    contractHash: 'scene-module',
    judgement: { kind, difficulty: 'normal', difficultyValue: GAME_NUMBERS.combat.baselineDc, successOutcomes: ['success', 'great_success', 'perfect'] },
  });
  const fortune = effectiveFortune(save);
  return proposal.factors
    .map(factor => factor.source==='skill'?{...factor,value:Math.min(GAME_NUMBERS.factors.skillCap,factor.value)}:factor)
    .map(factor => (factor.label === '幸运' ? { ...factor, label: `幸运（气运 ${fortune}，固定值）`, value: fixedLuck(fortune) } : factor))
    .filter(factor => !(factor.source === 'environment' && factor.value === 0))
    .map(factor => ({ label: factor.label, value: factor.value }));
}

const sum = (factors: Factor[]): number => factors.reduce((total, factor) => total + factor.value, 0);

/** 玩家一方的判定加值（进攻 / 支援类行动）与防御加值（身法类）。 */
export function sceneContext(save: SaveData, contract: Contract, actionText=''): { factors: number; playerDefense: number; breakdown: { action: Factor[]; defense: Factor[] } } {
  const phase={label:'小阶段',value:stageBonus(save.角色.属性.境界)};
  const action = baseFactors(save, contract, 'combat',actionText);
  action.push(phase);
  const defense = baseFactors(save, contract, 'escape');defense.push(phase);
  return { factors: sum(action), playerDefense: sum(defense), breakdown: { action, defense } };
}

/** Snapshot stage facts at engagement; unknown enemies use same-level fallback, never infer from old realm names. */
export function snapshotLevels(save:SaveData,c:Contract,state:import('../types').SceneState):void {
 const r=runtimeOf(save),chapter=contractChapter(c,state.beat)||namingChapter(r||{});
 const variants=Object.fromEntries(c.parties.map(p=>{const id=p.enemyId||p.ref;return [id,contractVariant(c,id,state)];}));
 const key=JSON.stringify([chapter,variants]);
 if(state.levelProjectionKey===key&&state.levelFacts)return;
 state.levelProjectionKey=key;
 state.levelChapter=chapter;
 if(c.parties.some(p=>p.player&&levelFact(p.ref,chapter)))initializeLevel(save,chapter);
 const playerLevel=levelOf(save.角色.属性.境界)??0;state.levels={};state.stages={};state.levelFacts={};
 for(const p of c.parties){
  const id=p.enemyId||p.ref, fact=levelFact(id,chapter,variants[id]);
  const card=r?.canon?.characters?.find((x:any)=>x.id===p.ref),relationship=relationshipOf(save,p.ref),enemy=namedEntity('enemy',id);
  const fallback=Math.max(levelOf((relationship?.profile as any)?.境界)??-1,Number.isInteger(card?.level)?card.level:-1,Number.isInteger(enemy?.level)?enemy?.level:-1);
  let value=fact?effectiveLevel(fact):(p.player?playerLevel:fallback<0?playerLevel:fallback);
  if(p.player&&fact&&value!==undefined)value=playerLevel+(value-(fact.level??value));
  if(c.levelContext?.nonLevelPartyIds?.includes(p.id))value=undefined;
  if(value!==undefined)state.levels[p.id]=value;
  if(fact)state.levelFacts[p.id]={entityId:fact.entityId,sourceRow:fact.sourceRow,level:fact.level,effectiveLevel:effectiveLevel(fact),confidence:fact.confidence,available:fact.available};
  state.stages[p.id]=p.player?stageBonus(save.角色.属性.境界):0;
  if(fact&&!fact.available){state.present[p.id]=false;if(!state.departed.includes(p.id))state.departed.push(p.id);}
 }
}
