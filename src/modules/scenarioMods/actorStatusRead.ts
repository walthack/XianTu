/**
 * 角色身上的状态（只读）：按角色 id（含敌人个体的实例 id）取仍有效的状态记录、永久伤残、分项画像、外貌标签。
 * 数据在 runtime.sceneLedger.statusRecords（injuries.ts 的结构化伤势），这里不改存档、不碰 NPC 气血字段。
 * 角色卡层（npcCardLayer）读外貌标签走这里。
 */
import type { SaveData } from '@/types/game';
import { GAME_NUMBERS } from '../sceneModule/numbers';
import { injuryRowLive, sceneTime, type InjuryRecord } from '../sceneModule/host/injuries';
import { summarizeEffects, type StatusProfile } from '../sceneModule/statusProfile';
import { parseInstanceId } from './actorInstances';

const ID_LIKE = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/i;

/** 状态记录所在的库：敌人个体（实例 id）在 groups，其余在 actors。不是合法 id 的返回 undefined。 */
export function statusBankOf(id: string): 'actors' | 'groups' | undefined {
  if (parseInstanceId(id)) return 'groups';
  return ID_LIKE.test(id) ? 'actors' : undefined;
}

/** 仍有效的状态记录（普通状态 + 永久伤残）。旧存档没有任何字段时返回空数组。 */
export function actorStatusRecords(save: SaveData, actorId: string): InjuryRecord[] {
  const runtime = (save as any)?.世界?.状态?.剧本模组, store = runtime?.sceneLedger?.statusRecords, bank = statusBankOf(actorId);
  if (!store || !bank) return [];
  const now = sceneTime(save);
  return [...(store[bank]?.[actorId] || []), ...(store.disabilities?.[actorId] || [])].filter(row => injuryRowLive(row, now, runtime));
}

/** 永久伤残（旧存档没有 disabilities 字段 = 空）。 */
export function disabilitiesOf(save: SaveData, actorId: string): InjuryRecord[] {
  const runtime = (save as any)?.世界?.状态?.剧本模组, now = sceneTime(save);
  return (runtime?.sceneLedger?.statusRecords?.disabilities?.[actorId] || []).filter((row: InjuryRecord) => injuryRowLive(row, now, runtime));
}

export function actorStatusProfile(save: SaveData, actorId: string): StatusProfile {
  return summarizeEffects(actorStatusRecords(save, actorId).flatMap(row => row.effects));
}

/** 角色卡用的外貌标签：最多 status.appearance.maxTags 条。 */
export function appearanceTagsOf(save: SaveData, actorId: string): string[] {
  return actorStatusProfile(save, actorId).appearance.slice(0, GAME_NUMBERS.status.appearance.maxTags);
}
