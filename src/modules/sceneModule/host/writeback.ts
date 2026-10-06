import {statusNamePattern} from '../statuses';
// 收束时把场面结果写回游戏现有载体：主角状态 → 角色.效果；同伴 / NPC / 群体状态 → sceneLedger.statusRecords（结构化，兼容 injury 文本）；
// 承重代价、旗标 → sceneLedger.worldFacts / runtime.flags。状态定义由统一目录解析。
import { settleScenarioInventoryTransfers } from '@/modules/scenarioMods/inventoryTransactions';
import type { SaveData } from '@/types/game';
import { runtimeEntityId, runtimeEntityName } from '@/modules/scenarioMods/ledger/affinityIdentity';
import { persistentStatuses, resolveStatusDef, toPlayerStatusEffect, type Contract, type SceneState, type WriteBack } from '../index';
import { sceneTime, recordSceneInjuries } from './injuries';
import { partyName, renderRefs, runtimeOf } from './refs';

function ledgerOf(runtime: any) {
  return (runtime.sceneLedger ||= { receipts: [], actors: {}, injuries: {}, names: {}, worldFacts: [] });
}

/** Core records keep control states for audit; the game adapter persists finite recovery injuries. */
export function recoverDownedAfterScene(contract: Contract, state: SceneState, writeBack: WriteBack): void {
  if(!state.closed || writeBack.outcome.endingId==='lcq.ending.fail.combat')return;
  for(const item of writeBack.persistent){
    if(item.status!=='incapacitated')continue;
    const recovery=contract.parties.find(p=>p.id===item.party)?.recoveryStatus || 'wound.external.heavy';
    const def=resolveStatusDef(recovery,contract)!;
    item.status=def.id;item.label=def.label;item.minutes=def.afterScene?.minutes || 43200;item.source=def.source;
    state.statuses[item.party]=(state.statuses[item.party] || []).filter(s=>s.id!=='incapacitated' && s.id!==def.id);
    state.statuses[item.party].push({id:def.id,appliedBeat:state.beat,expiresBeat:null,cause:'combat',sourceId:'scene:recovery'});
  }
}

export function applyWriteBack(save: SaveData, contract: Contract, state: SceneState, writeBack: WriteBack): { notes: string[] } {
  if(contract.rewardPolicy && writeBack.rewards.some(reward=>typeof reward.itemId==='string' && !contract.rewardPolicy!.itemIds.includes(reward.itemId)))throw new Error('场面奖励未获合同授权，未写回');
  recoverDownedAfterScene(contract,state,writeBack);
  const runtime = runtimeOf(save);
  const notes: string[] = [];
  if (!runtime) return { notes: ['存档里没有剧本运行时，状态与旗标没有写回'] };
  const ledger = ledgerOf(runtime);
  const sceneSource = contract.meta.id;
  const effects=(save as any).角色?.效果;
  if (Array.isArray(effects)) (save as any).角色.效果=effects.filter((e:any)=>!(e.来源===sceneSource && new RegExp(`^(?:${statusNamePattern('incapacitated')})$`).test(e.状态名称 || '')));
  if (writeBack.closingText) ledger.worldFacts = [...new Set([...ledger.worldFacts, renderRefs(writeBack.closingText,runtime)])];

  persistSceneInjuries(save,contract,writeBack.persistent,state);

  // 承重代价（文字）
  for (const cost of writeBack.costs) {
    if (!cost.effect) continue;
    const target = cost.target === 'scene' ? '' : (() => {
      return `${partyName(contract,runtime,cost.target)}：`;
    })();
    ledger.worldFacts = [...new Set([...ledger.worldFacts, `${target}${renderRefs(cost.effect,runtime)}`])];
  }

  const transfers=writeBack.rewards.filter(reward=>typeof reward.itemId==='string' && Number(reward.quantity)>0).map(reward=>({transferId:`scene:${contract.meta.id}:reward:${reward.itemId}`,itemId:String(reward.itemId),quantity:Number(reward.quantity)}));
  const granted=settleScenarioInventoryTransfers(save,runtime,{inventoryTransfers:transfers},{eventId:contract.meta.hook.eventId || contract.meta.id,actionId:contract.meta.hook.actionId || 'scene_close',outcome:'success'});
  if(granted.length)notes.push(`获得：${granted.map(row=>`${row.receipt.itemName}×${row.receipt.quantity}`).join('、')}。`);

  // Escape is derived from the settled terminal states, not inferred from win/lose.
  const escapeFlag = contract.meta.hook.escapeFlag;
  if (escapeFlag) {
    const escaped = writeBack.finalStates.some(row => contract.parties.find(p => p.id === row.party)?.side === 'opposed' && row.label === contract.meta.hook.escapeState);
    writeBack.flags[escapeFlag] = escaped;
    state.flags[escapeFlag] = escaped;
  }
  // 旗标、完成记录
  for (const [key, value] of Object.entries(writeBack.flags)) runtime.flags[key] = value;
  runtime.flags[`scene.${contract.meta.id}.done`] = true;
  runtime.flags[`scene.${contract.meta.id}.outcome`] = writeBack.outcome.kind;
  void state;
  void runtimeEntityName;
  return { notes };
}

function persistSceneInjuries(save: SaveData, contract: Contract, rows: WriteBack['persistent'], state?:SceneState): void {
  const runtime=runtimeOf(save),ledger=ledgerOf(runtime),sceneSource=contract.meta.id,player=contract.parties.find(p=>p.player);
  const prior=ledger.statusRecords?.actors[player?.ref || ''] || [];
  if(Array.isArray(save.角色?.效果))save.角色.效果=save.角色.效果.filter((effect:any)=>!prior.some((row:any)=>resolveStatusDef(row.statusId,contract) && effect.来源===row.sourceScene && effect.状态名称===row.label));
  recordSceneInjuries(save,contract,rows,state);
  const now=structuredClone((save as any).元数据?.时间 || {年:1,月:1,日:1,小时:0,分钟:0});
  if(Array.isArray((save as any).角色?.效果)) (save as any).角色.效果=(save as any).角色.效果.filter((effect:any)=>effect.来源!==sceneSource);
  // 状态
  for (const item of rows) {
    const def = resolveStatusDef(item.status, contract);
    if (item.party === player?.id) {
      const effects = ((save as any).角色 ||= {}).效果 ||= [];
      const source=item.originScene || sceneSource;
      const record=ledger.statusRecords?.actors[item.ref]?.find((row:any)=>row.sourceScene===source && row.statusId===item.status);
      const remaining=record?.expiresAt===null ? null : record ? Math.max(0,record.expiresAt-sceneTime(save)) : item.minutes;
      const effect = toPlayerStatusEffect({...item,minutes:remaining}, now, def);
      effect.来源 = source;
      const at = effects.findIndex((e: any) => e?.状态名称 === effect.状态名称 && e?.来源 === effect.来源);
      if (at >= 0) effects[at] = effect; else effects.push(effect);
    }

  }

}

/** Publish only already-settled injuries during a beat, never rewards, flags or event completion. */
export function syncSceneStatuses(save: SaveData, contract: Contract, state: SceneState): void {
  const rows=persistentStatuses(state,contract,undefined).map(({party,ref,def,active})=>({party,ref,originScene:active.originScene,status:def.id,label:def.label,minutes:def.afterScene?.minutes ?? null,cause:active.cause,source:def.source}));
  persistSceneInjuries(save,contract,rows,state);
}
