/**
 * 目标“设防失效”判定：只读目标身上结构化的状态记录（actorStatusRead），不看玩家原话。
 * 这是 drainProgress 类变体的前提闸门；名单与效果种类全在配置 requires.targetDefenseDown，本文件不写任何状态 id。
 * 命中 = 有仍然有效的状态记录，其 statusId 在 statusIds 里，或其效果种类在 effectKinds 里。
 */
import type { SaveData } from '@/types/game';
import { actorStatusRecords } from '../actorStatusRead';
import type { DefenseDownRule } from './config';

export function defenseDownOf(save: SaveData, targetId: string, rule: DefenseDownRule): boolean {
  const ids = rule.statusIds || [], kinds = rule.effectKinds || [];
  return actorStatusRecords(save, targetId).some(row => ids.includes(row.statusId) || (row.effects || []).some(effect => kinds.includes(effect.kind)));
}
