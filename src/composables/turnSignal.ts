/**
 * 回合完成信号（REPORT-8091-2ba71102 P2-C）：每次发送（含被拦、出错、进结局）收尾后统一发出，驱动与辅助工具据此判回合结束。
 * 以前没有显式信号，外部只能看输入框是否恢复可用；结局（如五原「不赌」→ E01）按设计永久封输入，回合其实已结束，驱动却等满超时。
 * - 输入区 data-turn-state：processing＝生成中；ready＝可输入；choice＝只能点固定选项；ended＝本局/本期已结束（输入框不会再恢复）。
 * - 输入区 data-turn-seq：每完成一次发送 +1；window 同时派发 TURN_COMPLETE_EVENT（detail 同下）。
 */
export type TurnState = 'processing' | 'ready' | 'choice' | 'ended';
export const TURN_COMPLETE_EVENT = 'xiantu:turn-complete';
export interface TurnFlags { processing: boolean; ended: boolean; choiceOnly: boolean }
export interface TurnCompleteDetail { seq: number; state: TurnState; endingId?: string }

export function turnStateOf(flags: TurnFlags): TurnState {
  return flags.processing ? 'processing' : flags.ended ? 'ended' : flags.choiceOnly ? 'choice' : 'ready';
}

/** 生成中（如重复点发送被「AI正在处理中」挡回）不算本回合完成，不发信号。 */
export function emitTurnComplete(target: EventTarget | undefined, detail: TurnCompleteDetail): boolean {
  if (!target || detail.state === 'processing') return false;
  target.dispatchEvent(new CustomEvent<TurnCompleteDetail>(TURN_COMPLETE_EVENT, { detail }));
  return true;
}
