import {entityAliases,entityNamePattern,type NamedEntityKind} from '@/modules/scenarioMods/namedEntities';
import {contentName} from '@/modules/scenarioMods/entityCatalog';
// 本场合同注册表：事件 id → 合同。合同是纯 JSON（剧情策划维护），共用的本书临时状态定义在 statuses.json。
// 这里不写任何人名；合同里的角色一律是角色库 id 或字面标签。
import f01 from './f01.json';
import f02 from './f02.json';
import f04 from './f04.json';
import f05 from './f05.json';
import f03 from './f03.json';
import f10 from './f10.json';
import f13 from './f13.json';
import f03Entry from './f03-entry.json';
import f14Draft from './f14.draft.json';
import { BUILTIN_STATUSES, STATUS_CATALOG } from '../statuses';
import { GAME_NUMBERS, applyGameNumbers } from '../numbers';
import { lintContract } from '../lint';
import type { Contract, StatusDef } from '../types';

function withSharedStatuses(raw: unknown): Contract {
  const contract = structuredClone(raw) as Contract;
  const expand=(o:any):void=>{if(!o||typeof o!=='object')return;for(const[k,v]of Object.entries(o)){
    if(k==='aliases'&&Array.isArray(v))o[k]=[...new Set(v.flatMap((alias:string)=>{const m=alias.match(/^\{\{aliases:([^:]+):([^}]+)\}\}$/);return m?entityAliases(m[1] as NamedEntityKind,m[2]):[alias];}))];
    else if(k==='pattern'&&typeof v==='string')o[k]=v.replace(/\{\{pattern:([^:]+):([^}]+)\}\}/g,(_,kind,id)=>`(?:${entityNamePattern(kind as NamedEntityKind,id)})`);
    else expand(v);
  }};expand(contract);
  for (const element of contract.elements || []) element.label = element.label.replace(/\{\{(item|skill|technique):([^}]+)\}\}/g, (_, kind, id) => contentName(kind,id));
  const own = new Set((contract.statuses || []).map(def => def.id));
  contract.statuses = [...(contract.statuses || []), ...STATUS_CATALOG.filter(def => !own.has(def.id))];
  return contract;
}

// Drafts are linted but never selected by the game until the remaining author decisions are resolved.
export const SCENE_CONTRACT_DRAFTS: Contract[] = [f14Draft].map(withSharedStatuses);

export const SCENE_CONTRACTS: Contract[] = [f01, f02, f03, f04, f05, f10, f13, f03Entry].map(withSharedStatuses);

export function sceneContractForEvent(eventId: string | undefined, flags: Record<string, unknown> = {}): Contract | undefined {
  return eventId ? SCENE_CONTRACTS.find(contract => contract.meta.hook.eventId === eventId
    && (!contract.meta.hook.requiredFlag || flags[contract.meta.hook.requiredFlag] === true)
    && (!contract.meta.hook.consumedFlag || flags[contract.meta.hook.consumedFlag] !== true)) : undefined;
}

export function sceneContractById(id: string | undefined): Contract | undefined {
  return id ? SCENE_CONTRACTS.find(contract => contract.meta.id === id) : undefined;
}

/**
 * 试玩热改（只给 combat-trial 的 ?tuning=1 用）：按合同 id 覆盖白名单里的数值，改完跑 lint，有错就整份拒绝、一处都不改。
 * 形状：{ [合同id]: { goals?: {[id]:{baseDifficulty}}, enemyActions?: {[id]:{dc?, schedule?}},
 *         parties?: {[id]:{resistance?, tracks?: {[轨道id]:{ceiling}}}}, clock?: {beats} },
 *         numbers?: game-numbers.qingyu.json 的局部（交给 applyGameNumbers 校验合并），
 *         statuses?: {[状态id]:{action?, defense?, durationBeats?, afterSceneMinutes?, timeMinutes?}} }
 * statuses 只能改该状态已有的数值：action/defense＝已有 rollModifier 的值，timeMinutes＝已有 time 解除的分钟数。
 */
export function applyTuning(tuning: unknown): { ok: boolean; errors: string[]; contracts: string[] } {
  const errors: string[] = [], next = new Map<number, Contract>();
  const obj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
  const int = (v: unknown): v is number => Number.isInteger(v);
  const shape = (v: unknown, keys: string[], where: string): v is Record<string, any> => {
    if (!obj(v)) { errors.push(`${where}：必须是对象`); return false; }
    for (const key of Object.keys(v)) if (!keys.includes(key)) errors.push(`${where}.${key}：不在白名单`);
    return true;
  };
  const setInt = (src: Record<string, any>, key: string, where: string, set: (n: number) => void): void => {
    if (!(key in src)) return;
    if (int(src[key])) set(src[key]); else errors.push(`${where}.${key}：必须是整数`);
  };
  const byId = <T extends { id: string }>(list: T[] | undefined, id: string, where: string): T | undefined => {
    const hit = list?.find(item => item.id === id);
    if (!hit) errors.push(`${where}：合同里没有 ${id}`);
    return hit;
  };
  if (!obj(tuning)) return { ok: false, errors: ['tuning：必须是以合同 id 为键的对象'], contracts: [] };
  const statusNext = new Map<StatusDef[], Map<number, StatusDef>>();
  if ('statuses' in tuning && !obj(tuning.statuses)) errors.push('statuses：必须是以状态 id 为键的对象');
  else if ('statuses' in tuning) {
    for (const [id, p] of Object.entries(tuning.statuses as Record<string, any>)) {
      const where = `statuses.${id}`, list = STATUS_CATALOG.some(d => d.id === id) ? STATUS_CATALOG : BUILTIN_STATUSES;
      const index = list.findIndex(d => d.id === id);
      if (index < 0) { errors.push(`${where}：状态目录和内置状态里都没有`); continue; }
      if (!shape(p, ['action', 'defense', 'durationBeats', 'afterSceneMinutes', 'timeMinutes'], where)) continue;
      const def = structuredClone(list[index]), positive = (key: string, set: (n: number) => void): void => setInt(p, key, where, n => { if (n > 0) set(n); else errors.push(`${where}.${key}：必须大于 0`); });
      for (const scope of ['action', 'defense'] as const) if (scope in p) {
        const effect = def.effects.find(e => e.kind === 'rollModifier' && e.scope === scope);
        if (effect?.kind === 'rollModifier') setInt(p, scope, where, n => { effect.value = n; });
        else errors.push(`${where}.${scope}：这个状态没有 ${scope} 修正`);
      }
      if ('durationBeats' in p && typeof def.durationBeats !== 'number') errors.push(`${where}.durationBeats：这个状态没有场内拍数`);
      else positive('durationBeats', n => { def.durationBeats = n; });
      if ('afterSceneMinutes' in p && typeof def.afterScene?.minutes !== 'number') errors.push(`${where}.afterSceneMinutes：这个状态场后不按分钟保留`);
      else positive('afterSceneMinutes', n => { def.afterScene = { minutes: n }; });
      const timeRule = def.remove?.find(r => r.kind === 'time');
      if ('timeMinutes' in p && timeRule?.kind !== 'time') errors.push(`${where}.timeMinutes：这个状态没有按时间解除`);
      else positive('timeMinutes', n => { if (timeRule?.kind === 'time') timeRule.minutes = n; });
      if (!statusNext.has(list)) statusNext.set(list, new Map());
      statusNext.get(list)!.set(index, def);
    }
  }
  const numbersBefore = structuredClone(GAME_NUMBERS);
  let numbersApplied = false;
  if ('numbers' in tuning) {
    try { applyGameNumbers(tuning.numbers); numbersApplied = true; } catch (e) { errors.push(`numbers：${(e as Error).message}`); }
  }
  for (const [contractId, patch] of Object.entries(tuning)) {
    if (contractId === 'numbers' || contractId === 'statuses') continue;
    const index = SCENE_CONTRACTS.findIndex(contract => contract.meta.id === contractId);
    if (index < 0) { errors.push(`${contractId}：没有这份合同`); continue; }
    if (!shape(patch, ['goals', 'enemyActions', 'parties', 'clock'], contractId)) continue;
    const c = structuredClone(SCENE_CONTRACTS[index]);
    for (const [id, p] of Object.entries(obj(patch.goals) ? patch.goals : {})) {
      const where = `${contractId}.goals.${id}`, goal = byId(c.goals, id, where);
      if (goal && shape(p, ['baseDifficulty'], where)) setInt(p, 'baseDifficulty', where, n => { goal.baseDifficulty = n; });
    }
    for (const [id, p] of Object.entries(obj(patch.enemyActions) ? patch.enemyActions : {})) {
      const where = `${contractId}.enemyActions.${id}`, action = byId(c.enemyActions, id, where);
      if (!action || !shape(p, ['dc', 'schedule'], where)) continue;
      setInt(p, 'dc', where, n => { action.attack.dc = n; });
      if ('schedule' in p && shape(p.schedule, ['fromBeat', 'untilBeat', 'every', 'onBeats'], `${where}.schedule`)) {
        const schedule = (action.schedule ||= {});
        for (const key of ['fromBeat', 'untilBeat', 'every'] as const) setInt(p.schedule, key, `${where}.schedule`, n => { schedule[key] = n; });
        if ('onBeats' in p.schedule) {
          if (Array.isArray(p.schedule.onBeats) && p.schedule.onBeats.every(int)) schedule.onBeats = [...p.schedule.onBeats];
          else errors.push(`${where}.schedule.onBeats：必须是整数数组`);
        }
      }
    }
    for (const [id, p] of Object.entries(obj(patch.parties) ? patch.parties : {})) {
      const where = `${contractId}.parties.${id}`, party = byId(c.parties, id, where);
      if (!party || !shape(p, ['resistance', 'tracks'], where)) continue;
      setInt(p, 'resistance', where, n => { party.resistance = n; });
      for (const [trackId, t] of Object.entries(obj(p.tracks) ? p.tracks : {})) {
        const track = party.tracks?.find(item => (item.track || item.id) === trackId);
        if (!track?.ending) { errors.push(`${where}.tracks.${trackId}：没有这条带结局的轨道`); continue; }
        const ending = track.ending;
        if (shape(t, ['ceiling'], `${where}.tracks.${trackId}`)) setInt(t, 'ceiling', `${where}.tracks.${trackId}`, n => { ending.ceiling = n; });
      }
    }
    if ('clock' in patch && shape(patch.clock, ['beats'], `${contractId}.clock`)) {
      const clock = (c.clock ||= {});
      setInt(patch.clock, 'beats', `${contractId}.clock`, n => { clock.beats = n; });
    }
    for (const key of ['goals', 'enemyActions', 'parties'] as const) if (key in patch && !obj(patch[key])) errors.push(`${contractId}.${key}：必须是以 id 为键的对象`);
    errors.push(...lintContract(c).errors.map(text => `${contractId}（lint）：${text}`));
    next.set(index, c);
  }
  if (statusNext.size) {
    // 状态数值是所有合同共用的：换上新定义后每份合同都重跑一遍 lint。
    const tuned = new Map([...statusNext.values()].flatMap(m => [...m.values()]).map(def => [def.id, def]));
    SCENE_CONTRACTS.forEach((contract, index) => {
      const c = next.get(index) || contract;
      const report = lintContract({ ...c, statuses: (c.statuses || []).map(def => tuned.get(def.id) || def) });
      errors.push(...report.errors.map(text => `${c.meta.id}（状态 lint）：${text}`));
    });
  }
  if (errors.length) {
    if (numbersApplied) applyGameNumbers(numbersBefore);
    return { ok: false, errors, contracts: [] };
  }
  for (const [index, contract] of next) SCENE_CONTRACTS[index] = contract;
  for (const [list, defs] of statusNext) for (const [index, def] of defs) list[index] = def;
  return { ok: true, errors: [], contracts: [...next.values()].map(contract => contract.meta.id) };
}
