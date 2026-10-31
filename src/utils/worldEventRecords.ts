/**
 * 世界事件记录的唯一读取口：事件面板列表与主界面铃铛角标都从这里取，保证角标数＝列表条数。
 * 真机 REPORT-8091-cd167d7a：铃铛旁的「7」其实是本回合变更日志条数，面板却是「暂无事件记录」，玩家以为角标与列表对不上。
 */
import type { EventSystem, GameEvent } from '@/types/game';

/** 按发生顺序（最新在前）返回事件记录；缺字段或非数组都当空。 */
export function worldEventRecords(eventSystem: Partial<EventSystem> | null | undefined): GameEvent[] {
  const list = (eventSystem as { 事件记录?: unknown } | null | undefined)?.事件记录;
  return Array.isArray(list) ? [...(list as GameEvent[])].reverse() : [];
}

/** 铃铛角标数（0＝不显示角标）。 */
export function worldEventBadgeCount(eventSystem: Partial<EventSystem> | null | undefined): number {
  return worldEventRecords(eventSystem).length;
}
