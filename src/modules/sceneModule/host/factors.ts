import {levelFact,effectiveLevel,contractChapter,contractVariant} from '../../scenarioMods/characterLevels';
import {initializeLevel} from '../../scenarioMods/levelProgression';
import {currentActorLevel,enemyPresetConfig,enemyKindOf,isEnemyKind,protagonistLevel} from '../../scenarioMods/actorLevels';
import {namingChapter} from '../../scenarioMods/ledger/naming';
import {GAME_NUMBERS,boundedLuck} from '../numbers';
import {levelOf,stageBonus,levelModifier} from '../../../utils/realmUtils';
import {namedEntityEntries} from '../../scenarioMods/namedEntities';
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
export function sceneContext(save: SaveData, contract: Contract, actionText=''): { factors: number; factorProfiles: Record<string, number>; playerDefense: number; breakdown: { action: Factor[]; defense: Factor[] } } {
  const phase={label:'小阶段',value:stageBonus(save.角色.属性.境界)};
  const action = baseFactors(save, contract, contract.settings?.judgement?.action || 'combat',actionText);
  action.push(phase);
  const defense = baseFactors(save, contract, contract.settings?.judgement?.defense || 'escape');defense.push(phase);
  const factorProfiles: Record<string, number> = { scene: sum(action) };
  for (const rule of Object.values(GAME_NUMBERS.goalModifiers)) {
    if (rule.factorProfile !== 'scene') factorProfiles[rule.factorProfile] = sum(baseFactors(save, contract, rule.factorProfile as JudgementKind, actionText));
  }
  return { factors: sum(action), factorProfiles, playerDefense: sum(defense), breakdown: { action, defense } };
}

/**
 * 开打时给参战者定级（scenarioMods/actorLevels.ts 同一入口）：存档里的角色状态为准，等级表只当初始值/剧情节点，
 * 无名敌人按敌人种类预设（combat.enemyPresets）。查不到级数的按与玩家同级。
 * 缓存键带上解析器版本与本场敌人预设：旧存档里进行中的场面（按旧总表定的级数）会重定一次级，热调预设后新开场面也会重定。
 */
export const LEVEL_RESOLVER_VERSION = 2;
export function snapshotLevels(save:SaveData,c:Contract,state:import('../types').SceneState):void {
 const r=runtimeOf(save),chapter=contractChapter(c,state.beat)||namingChapter(r||{});
 const variants=Object.fromEntries(c.parties.map(p=>{const id=p.enemyId||p.ref;return [id,contractVariant(c,id,state)];}));
 const presets=enemyPresetConfig(),presetKey=c.parties.map(p=>p.enemyId||p.ref).filter(id=>isEnemyKind(id)).map(id=>[id,presets.types[enemyKindOf(id)]??presets.default]);
 const key=JSON.stringify([LEVEL_RESOLVER_VERSION,chapter,variants,presetKey,protagonistLevel(chapter)]);
 if(state.levelProjectionKey===key&&state.levelFacts)return;
 state.levelProjectionKey=key;
 state.levelChapter=chapter;
 if(c.parties.some(p=>p.player&&levelFact(p.ref,chapter)))initializeLevel(save,chapter);
 const playerLevel=levelOf(save.角色.属性.境界)??0;state.levels={};state.stages={};state.levelFacts={};
 for(const p of c.parties){
  const id=p.enemyId||p.ref, got=currentActorLevel(id,{chapter,variant:variants[id],save,runtime:r,player:!!p.player,ref:p.ref});
  let value=got.level;
  if(value===undefined&&got.source==='none')value=playerLevel; // 无数据：按同级
  if(c.levelContext?.nonLevelPartyIds?.includes(p.id))value=undefined;
  if(value!==undefined)state.levels[p.id]=value;
  const fact=got.fact;
  if(fact)state.levelFacts[p.id]={entityId:fact.entityId,sourceRow:fact.sourceRow,level:fact.level,effectiveLevel:effectiveLevel(fact),confidence:fact.confidence,available:fact.available,source:got.source};
  else if(got.preset)state.levelFacts[p.id]={entityId:got.preset.kindId,sourceRow:0,level:got.level??null,effectiveLevel:got.level,confidence:'preset',available:true,source:'preset'};
  state.stages[p.id]=p.player?stageBonus(save.角色.属性.境界):0;
  if(!got.present){state.present[p.id]=false;if(!state.departed.includes(p.id))state.departed.push(p.id);}
 }
}
