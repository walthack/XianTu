/**
 * Y5 选「留下」的两名同伴暂留峒外与驿馆会合（交接 2026-11-09 需求三）。
 * Y5 选「留下」写 branch.ningyu.enter_dong=stay；05b 会合拍成功提交写 branch.ningyu.y5_rejoined=true。
 * 两者之间不能当面拆信（blank_letter_and_dagu / open_blank_letter_in_person），列表和执行入口同一处判定。
 */
export const STAY_FLAG = 'branch.ningyu.enter_dong';
export const REJOINED_FLAG = 'branch.ningyu.y5_rejoined';
export const BLANK_LETTER_EVENT_ID = 'lcq.event.blank_letter_and_dagu';
export const BLANK_LETTER_ACTION_ID = 'open_blank_letter_in_person';

type RuntimeLike = { flags?: Record<string, unknown>; events?: Array<{ id: string; playerCompletionContract?: { actions?: unknown[] } }> };

export function awaitingRejoin(runtime: RuntimeLike | null | undefined): boolean {
  const flags = runtime?.flags || {};
  return flags[STAY_FLAG] === 'stay' && flags[REJOINED_FLAG] !== true;
}

export function actionHeldForRejoin(runtime: RuntimeLike | null | undefined, action: { id?: string } | null | undefined): boolean {
  if (action?.id !== BLANK_LETTER_ACTION_ID || !awaitingRejoin(runtime)) return false;
  const owner = runtime?.events?.find(event => event.playerCompletionContract?.actions?.includes(action));
  return owner?.id === BLANK_LETTER_EVENT_ID;
}
