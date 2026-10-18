/**
 * 自由行动的入口：闸门 → 按路由分流。
 *   闸门不过  → refused（不写任何东西，只给“未发生”事实行）
 *   judge     → 签发待确认判定（票写进 authorityReceipt），等玩家确认后由 settleFromResolution 结算
 *   table     → 不掷骰，当场 settleFreeAction
 * 目标是在场的正典人物但还没关系记录时，先懒登记再过闸门；结算没成（拒绝、判定只是签发）就撤回，所以“不过闸门什么都不写”仍成立。
 */
import type { SaveData } from '@/types/game';
import { getNarrativeTurn } from '@/utils/actionGate';
import { getJudgementState, persistPendingJudgement, type JudgementProposal } from '@/utils/judgementEngine';
import { variantSpecOf, type VariantSpec } from './config';
import { checkGates, type FreeActionDeps } from './gates';
import { withEncounteredTarget } from './encounter';
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
  if (!spec || !spec.enabled || spec.route === 'none' || (!ticket.targetId && spec.target !== 'none')) return { kind: 'blocked' };
  return withEncounteredTarget(save, ticket.targetId, () => prepareRegistered(save, ticket, spec, deps), result => result.kind === 'settled' && result.result.ok);
}

function prepareRegistered(save: SaveData, ticket: FreeActionTicket, spec: VariantSpec, deps: SettleDeps & FreeActionDeps): PrepareResult {
  const gate = checkGates(save, ticket, deps);
  if (!gate.ok) return { kind: 'refused', reason: gate.reason, facts: [gateText(gate.reason, gate.slots, spec.variant)] };
  if (spec.route === 'table') return { kind: 'settled', result: settleFreeAction(save, ticket, undefined, deps) };
  if (getJudgementState(save).pending) return { kind: 'blocked' };
  const proposal = buildFreeActionJudgementProposal(save, getNarrativeTurn(save), ticket, spec, gate.slots, gate.lethal === true);
  return { kind: 'issued', proposal: persistPendingJudgement(save, proposal) };
}
