/**
 * 自由行动的入口：闸门 → 按路由分流。
 *   闸门不过  → refused（不写任何东西，只给“未发生”事实行）
 *   judge     → 签发待确认判定（票写进 authorityReceipt），等玩家确认后由 settleFromResolution 结算
 *   table     → 不掷骰，当场 settleFreeAction
 */
import type { SaveData } from '@/types/game';
import { getNarrativeTurn } from '@/utils/actionGate';
import { getJudgementState, persistPendingJudgement, type JudgementProposal } from '@/utils/judgementEngine';
import { variantSpecOf } from './config';
import { checkGates, type FreeActionDeps } from './gates';
import { gateText } from './facts';
import { buildFreeActionJudgementProposal } from './judgement';
import { settleFreeAction, type SettleResult, type SettleDeps } from './settle';
import type { FreeActionTicket } from './ticket';

export type PrepareResult =
  | { kind: 'refused'; reason: string; facts: string[] }
  | { kind: 'issued'; proposal: JudgementProposal }
  | { kind: 'settled'; result: SettleResult }
  | { kind: 'blocked' };

export function prepareFreeAction(save: SaveData, ticket: FreeActionTicket, deps: SettleDeps & FreeActionDeps = {}): PrepareResult {
  const spec = variantSpecOf(ticket.actionClass, ticket.variant);
  if (!spec || !spec.enabled || spec.route === 'none' || !ticket.targetId) return { kind: 'blocked' };
  const gate = checkGates(save, ticket, deps);
  if (!gate.ok) return { kind: 'refused', reason: gate.reason, facts: [gateText(gate.reason, gate.slots)] };
  if (spec.route === 'table') return { kind: 'settled', result: settleFreeAction(save, ticket, undefined, deps) };
  if (getJudgementState(save).pending) return { kind: 'blocked' };
  const proposal = buildFreeActionJudgementProposal(save, getNarrativeTurn(save), ticket, spec, gate.slots);
  return { kind: 'issued', proposal: persistPendingJudgement(save, proposal) };
}
