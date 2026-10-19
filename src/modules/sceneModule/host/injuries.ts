import {namedEntity} from '@/modules/scenarioMods/namedEntities';
import {instanceId,isEnemyKindId,parseInstanceId} from '@/modules/scenarioMods/actorInstances';
// Structured, id-keyed injury storage; old prose remains readable but is never parsed into mechanics.
import type { SaveData } from '@/types/game';
import { runtimeEntityId } from '@/modules/scenarioMods/ledger/affinityIdentity';
import { persistentStatuses, resolveStatusDef, type Contract, type SceneState, type StatusDef, type WriteBack } from '../index';
import { toInjuryNote } from '../statusAdapters';
import { EFFECT_VOCAB } from '@/modules/scenarioMods/effectTags';
import { runtimeOf } from './refs';

export const actorKey=(runtime:any,ref:string)=>/^[a-z0-9_]+(\.[a-z0-9_]+)+$/i.test(ref) ? ref : runtimeEntityId(runtime,ref);
export interface InjuryRecord {
  /** 敌人种类 id（只作归属说明；伤势从不写在种类名下）。 */
  enemyId?:string;
  /** 场上个体的实例 id（种类id#场景id:编号，见 actorInstances.ts）；人物与玩家没有。 */
  instanceId?:string; player?: boolean; statusId: string; label: string; sourceScene: string; cause: StatusDef['cause']; source?: string;
  appliedAt: number; appliedBeat?: number; expiresAt: number | null; effects: StatusDef['effects']; remove: StatusDef['remove'];
  /** 下限计数（如中毒）：life 从 max 往下扣，floor 是这个角色的下限；只由自由行动路径写（freeAction/actorStatus.ts）。 */
  counter?: {life:number; max:number; floor:number};
}
export interface InjuryStore { version: 1; actors: Record<string, InjuryRecord[]>; groups: Record<string, InjuryRecord[]>; groupLabels: Record<string,string>;
  /** 永久伤残，按角色 id 存放；旧存档没有这个字段，读取一律当空。不随时间、休整、药物消退，只能由剧情旗标解除。 */
  disabilities?: Record<string, InjuryRecord[]> }
/** 合同里敌人种类参战方的实例 id：n = 同种类参战方在本合同里的出场顺序（从 1 起）。 */
export function partyInstanceId(contract:Contract,party:Contract['parties'][number]):string|undefined {
  const kind=namedEntity('enemy',party.ref)?.id;
  if(!kind||party.group||/[#:]/.test(contract.meta.id))return undefined;
  const same=contract.parties.filter(p=>p.ref===party.ref&&!p.group);
  return instanceId(kind,contract.meta.id,same.indexOf(party)+1);
}
const isEnemyParty=(party:Contract['parties'][number])=>!!namedEntity('enemy',party.ref)||isEnemyKindId(party.ref);
export function sceneTime(save: SaveData): number {
  const t=(save as any).元数据?.时间 || {}, date=new Date(0);
  date.setUTCFullYear(t.年 || 1,(t.月 || 1)-1,t.日 || 1);date.setUTCHours(t.小时 || 0,t.分钟 || 0,0,0);
  return date.getTime()/60000;
}
function clearPlayerEffects(save:SaveData,rows:InjuryRecord[]):void {
  if(!Array.isArray(save.角色?.效果))return;
  save.角色.效果=save.角色.效果.filter((effect:any)=>!rows.some(row=>row.player && effect.来源===row.sourceScene && effect.状态名称===row.label));
}
export function injuryStore(save: SaveData): InjuryStore {
  const runtime=runtimeOf(save),ledger=runtime.sceneLedger ||= {receipts:[],actors:{},injuries:{},names:{},worldFacts:[]};
  ledger.legacyInjuries ||= {...ledger.injuries};
  return ledger.statusRecords ||= {version:1,actors:{},groups:{},groupLabels:{}};
}
/** 这一行伤势此刻是否仍有效：没到期，且没被剧情旗标解除。只读，不改存档。 */
export function injuryRowLive(row: InjuryRecord, now: number, runtime: any): boolean {
  return (row.expiresAt===null || now<row.expiresAt)
    && !(row.remove || []).some(rule=>rule.kind==='story' && runtime?.flags?.[rule.flag]===true);
}
export function pruneSceneInjuries(save: SaveData): InjuryStore {
  const store=injuryStore(save),now=sceneTime(save),runtime=runtimeOf(save);
  for (const bank of [store.actors,store.groups,...(store.disabilities?[store.disabilities]:[])]) for(const [id,rows] of Object.entries(bank)) {
    const removed:InjuryRecord[]=[];
    bank[id]=rows.filter(row=>{const keep=injuryRowLive(row,now,runtime);if(!keep)removed.push(row);return keep;});
    clearPlayerEffects(save,removed);
  }
  return store;
}
/** Explicit repair/rest/item action must match a definition's removal rule. */
export function removeSceneInjury(save: SaveData, target: {actorId:string} | {groupId:string}, statusId:string, reason: 'rest' | 'item', itemId?:string): boolean {
  const store=pruneSceneInjuries(save),bank='actorId' in target ? store.actors : store.groups;
  const id='actorId' in target ? actorKey(runtimeOf(save),target.actorId) : target.groupId;
  const rows=bank[id] || [],remove=rows.filter(row=>row.statusId===statusId && row.remove?.some(rule=>rule.kind===reason && (rule.kind!=='item' || rule.ref===itemId)));
  if(!remove.length)return false;
  bank[id]=rows.filter(row=>!remove.includes(row));clearPlayerEffects(save,remove);renderInjuryViews(save);return true;
}
/** 休整解除：玩家身上每条 remove 里写了 rest 的伤病都解除（按存档里该行自带的规则副本判断），返回被解除的行。 */
export function removePlayerInjuriesByRest(save: SaveData): InjuryRecord[] {
  const store=pruneSceneInjuries(save),removed:InjuryRecord[]=[];
  for(const [id,rows] of Object.entries(store.actors)){
    const hit=rows.filter(row=>row.player && row.remove?.some(rule=>rule.kind==='rest'));
    if(hit.length){store.actors[id]=rows.filter(row=>!hit.includes(row));removed.push(...hit);}
  }
  if(removed.length){clearPlayerEffects(save,removed);renderInjuryViews(save);}
  return removed;
}
export function recordSceneInjuries(save: SaveData, contract: Contract, rows: WriteBack['persistent'], state?:SceneState): void {
  const store=pruneSceneInjuries(save),now=sceneTime(save),runtime=runtimeOf(save),ledger=runtime.sceneLedger;
  ledger.legacyInjuries ||= {...ledger.injuries};
  const previous=structuredClone(store);
  // Each published beat replaces its source snapshot, so refreshes/upgrades do not accumulate obsolete prose.
  for(const bank of [store.actors,store.groups])for(const id of Object.keys(bank))bank[id]=bank[id].filter(row=>row.sourceScene!==contract.meta.id);
  if(state)for(const party of contract.parties) {
    const group=party.group || (isEnemyParty(party) || !/^[a-z0-9_]+(\.[a-z0-9_]+)+$/i.test(party.ref) ? {id:`${contract.meta.id}.${party.id}`,label:namedEntity('enemy',party.ref)?.name||party.ref}:undefined);
    const bank=group?store.groups:store.actors,id=group?.id || actorKey(runtime,party.ref);
    // The restored state is the full snapshot of recognized injury ids for these participants.
    // Preserve unrecognized records for audit rather than guessing a replacement.
    bank[id]=(bank[id] || []).filter(row=>!resolveStatusDef(row.statusId,contract));
  }
  for(const item of rows) {
    const party=contract.parties.find(p=>p.id===item.party),def=resolveStatusDef(item.status,contract);
    if(!party || !def)continue;
    const group=party.group || (isEnemyParty(party) || !/^[a-z0-9_]+(\.[a-z0-9_]+)+$/i.test(party.ref) ? {id:`${contract.meta.id}.${party.id}`,label:namedEntity('enemy',party.ref)?.name||party.ref} : undefined);
    const bank=group ? store.groups : store.actors,id=group?.id || actorKey(runtime,party.ref);
    if(group)store.groupLabels[id]=namedEntity('enemy',group.id)?.name || group.label;
    const instance=partyInstanceId(contract,party),record: InjuryRecord={enemyId:namedEntity('enemy',party.ref)?.id,...(instance?{instanceId:instance}:{}),player:!!party.player,statusId:def.id,label:def.label,sourceScene:item.originScene || contract.meta.id,cause:def.cause,source:item.source,appliedAt:now,expiresAt:item.minutes===null ? null : now+item.minutes,effects:structuredClone(def.effects),remove:structuredClone(def.remove || [])};
    const old=(group ? previous.groups : previous.actors)[id]?.find(row=>row.sourceScene===record.sourceScene && row.statusId===def.id);
    if(old) { record.appliedAt=old.appliedAt;record.expiresAt=old.expiresAt; }
    (bank[id] ||= []).push(record);
  }
  renderInjuryViews(save);
}
export function renderInjuryViews(save: SaveData): void {
  const runtime=runtimeOf(save),ledger=runtime.sceneLedger,store=pruneSceneInjuries(save);
  ledger.injuries={...ledger.legacyInjuries};ledger.groupInjuries={};
  const note=(r:InjuryRecord)=>toInjuryNote({party:'',ref:'',status:r.statusId,label:r.label,minutes:r.expiresAt===null?null:Math.max(0,r.expiresAt-sceneTime(save)),cause:r.cause,source:r.source},{effects:r.effects,remove:r.remove} as StatusDef,tag=>(EFFECT_VOCAB.tags as Record<string,{label?:string}>)[tag]?.label);
  const dis=store.disabilities||{},asGroup=(id:string)=>!!parseInstanceId(id);
  for(const id of new Set([...Object.keys(store.actors),...Object.keys(dis).filter(k=>!asGroup(k))])){const rows=[...(store.actors[id]||[]),...(asGroup(id)?[]:dis[id]||[])];if(rows.length)ledger.injuries[id]=[ledger.injuries[id],...rows.map(note)].filter(Boolean).join('；');}
  for(const id of new Set([...Object.keys(store.groups),...Object.keys(dis).filter(asGroup)])){const rows=[...(store.groups[id]||[]),...(asGroup(id)?dis[id]||[]:[])];if(rows.length)ledger.groupInjuries[id]={label:store.groupLabels[id]||id,text:rows.map(note).join('；')};}
}
/** Restore only structured records; a legacy note cannot create a penalty, death, or NPC. */
export function restoreSceneInjuries(save: SaveData, contract: Contract, state: SceneState): void {
  const store=pruneSceneInjuries(save),runtime=runtimeOf(save);
  renderInjuryViews(save);
  for(const party of contract.parties) {
    const groupId=party.group?.id || (isEnemyParty(party)?`${contract.meta.id}.${party.id}`:undefined);
    const rows=groupId ? store.groups[groupId] : store.actors[actorKey(runtime,party.ref)];
    for(const row of rows || []) {
      const def=resolveStatusDef(row.statusId,contract);
      if(!def || state.statuses[party.id]?.some(s=>s.id===row.statusId))continue;
      // Short statuses (晕眩、被点穴) keep their in-scene beat limit when carried into a new scene.
      const beats=def.durationBeats ?? null;
      (state.statuses[party.id] ||= []).push({id:row.statusId,appliedBeat:state.beat,expiresBeat:beats===null?null:state.beat+beats,cause:row.cause,sourceId:row.sourceScene,originScene:row.sourceScene});
    }
  }
}
