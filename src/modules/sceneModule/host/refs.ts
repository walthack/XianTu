import {entityName,namedEntity} from '@/modules/scenarioMods/namedEntities';
import {contentName,catalogItem} from '@/modules/scenarioMods/entityCatalog';
// 合同里的 {{ref:角色库 id}} 占位 → 运行时显示名（从角色数据取，代码里不写人名）。
import { runtimeEntityName } from '@/modules/scenarioMods/ledger/affinityIdentity';
import type { Contract } from '../index';

const ID_LIKE = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/i;

export function runtimeOf(save: unknown): any {
  return (save as any)?.世界?.状态?.剧本模组;
}

export function displayName(runtime: unknown, ref: string): string {
  for(const kind of ['enemy','location','faction','ending'] as const)if(namedEntity(kind,ref))return entityName(kind,ref,(runtime as any)?.modId);
  return ID_LIKE.test(ref) ? runtimeEntityName(runtime, ref) : ref;
}

export function partyName(contract: Contract, runtime: unknown, partyId: string): string {
  const party=contract.parties.find(p=>p.id===partyId);
  if(party?.group)return namedEntity('enemy',party.group.id)?entityName('enemy',party.group.id):party.group.label;
  const instance=party?.instanceId && namedEntity('enemy',party.enemyId || party.ref)?.instances?.[party.instanceId];
  if(instance)return instance;
  const ref = party?.ref || partyId;
  return displayName(runtime, ref);
}

export function renderRefs(text: string, runtime: unknown): string {
  return String(text || '').replace(/\{\{enemyInstance:([^:}]+):([^}]+)\}\}/g,(_,id:string,instance:string)=>namedEntity('enemy',id)?.instances?.[instance] || entityName('enemy',id)).replace(/\{\{ref:([^}]+)\}\}/g, (_, ref: string) => displayName(runtime, ref.trim())).replace(/\{\{item:([^}]+)\}\}/g,(_,id:string)=>contentName('item',id.trim())).replace(/\{\{itemDescription:([^}]+)\}\}/g,(_,id:string)=>catalogItem(id.trim())?.description||'');
}
