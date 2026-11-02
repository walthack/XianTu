/**
 * 回合完成信号（REPORT-8091-2ba71102 P2-C）：每次发送（含被拦、出错、进结局）收尾后统一发出，驱动与辅助工具据此判回合结束。
 * 以前没有显式信号，外部只能看输入框是否恢复可用；结局（如五原「不赌」→ E01）按设计永久封输入，回合其实已结束，驱动却等满超时。
 * - 输入区 data-turn-state：processing＝生成中；ready＝可输入；choice＝只能点固定选项；confirm＝场面行动已出预览、等点「确认并掷骰」（同一拍的前半，未完成）；
 *   ended＝本局/本期已结束（输入框不会再恢复）。
 * - 输入区 data-turn-seq：每完成一拍 +1；window 同时派发 TURN_COMPLETE_EVENT（detail 同下）。
 * - 场面一拍＝发送出预览＋确认掷骰，只在掷骰确认结算后发一次；停在 confirm 时不 +1、不派发（REPORT-8091-f9737e0d ⑥：以前每拍发 2 次）。
 */
export type TurnState = 'processing' | 'ready' | 'choice' | 'confirm' | 'ended';
export const TURN_COMPLETE_EVENT = 'xiantu:turn-complete';
export interface TurnFlags { processing: boolean; ended: boolean; choiceOnly: boolean; awaitingConfirm?: boolean }
export interface TurnCompleteDetail { seq: number; state: TurnState; endingId?: string }

export function turnStateOf(flags: TurnFlags): TurnState {
  return flags.processing ? 'processing' : flags.ended ? 'ended' : flags.awaitingConfirm ? 'confirm' : flags.choiceOnly ? 'choice' : 'ready';
}

/** 生成中（如重复点发送被「AI正在处理中」挡回）、场面预览等掷骰确认（同一拍未完）都不算本回合完成，不发信号。 */
export function emitTurnComplete(target: EventTarget | undefined, detail: TurnCompleteDetail): boolean {
  if (!target || detail.state === 'processing' || detail.state === 'confirm') return false;
  target.dispatchEvent(new CustomEvent<TurnCompleteDetail>(TURN_COMPLETE_EVENT, { detail }));
  return true;
}

/**
 * 回合账（REPORT-8091-4c8245a5 P2-1）：sendMessage / runSceneOperation 进门 beginTurn，收尾 completeTurn。
 * 普通叙事回合在模型返回后先撤 isAIProcessing、再等终存档，以前这段空档里 data-turn-state 已是 ready 而信号还没发，
 * 驱动按「state 转出 processing」先收工、就收不到事件。现在账没结清前 data-turn-state 一直是 processing；
 * 结清时 seq+1 与派发在同一同步段完成，事件先于 DOM 刷新到达。嵌套（sendMessage 内调 runSceneOperation）只在最外层发一次。
 */
export interface TurnLedger { inFlight: number; seq: number }
export function beginTurn(ledger: TurnLedger): void { ledger.inFlight++; }
export function completeTurn(
  ledger: TurnLedger, flagsOf: (processing: boolean) => TurnFlags, target: EventTarget | undefined, endingId?: string,
): TurnCompleteDetail | null {
  ledger.inFlight = Math.max(0, ledger.inFlight - 1);
  const state = turnStateOf(flagsOf(ledger.inFlight > 0));
  if (state === 'processing' || state === 'confirm') return null;
  ledger.seq++;
  const detail: TurnCompleteDetail = endingId ? { seq: ledger.seq, state, endingId } : { seq: ledger.seq, state };
  emitTurnComplete(target, detail);
  return detail;
}

/**
 * 普通叙事回合总耗时上限（REPORT-8091-ef573ece P2：B15 回合模型流卡死 300 秒才中止重试，粘贴标签那回合用了 101.7 秒）。
 * 到点先调 onExpire（掐断本回合在途请求、给可见提示），并立即结束等待——不再等一个可能永不返回的请求；
 * 回合账由调用方照常在 finally 结清，data-turn-state 回到 ready、发一次完成信号。totalMs≤0＝不设上限。
 */
export async function raceTurnBudget<T>(run: Promise<T>, totalMs: number, onExpire: () => void): Promise<{ expired: true } | { expired: false; value: T }> {
  if (!(totalMs > 0)) return { expired: false, value: await run };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<{ expired: true }>(resolve => { timer = setTimeout(() => { onExpire(); resolve({ expired: true }); }, totalMs); });
  try {
    return await Promise.race([run.then(value => ({ expired: false as const, value })), expiry]);
  } finally {
    clearTimeout(timer);
    run.catch(() => { /* lcq-allow: 超时后被放弃的请求迟到的失败已无人等待，只防未处理拒绝 */ });
  }
}
