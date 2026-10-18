/**
 * 闸门拒绝出口的错误码日志（LCQ-FA-xxx，与 GATE_REASONS 一一对应，见 diagnostics/codes.ts 的 FA_GATE_CODES）。
 * detail 只放类别、变体、实体 id 与出口位置，没有玩家原文与模型文字——有意不记原文，与 playerTextDebug 无关。观察用，不改变任何结算。
 */
import { FA_GATE_CODES } from '../../diagnostics/codes';
import { logEvent } from '../../diagnostics/log';
import type { GateReason } from './facts';
import type { FreeActionTicket } from './ticket';

export type RefusalSite = 'prepare' | 'settle' | 'ticket' | 'ui';

export function logGateRefusal(reason: string, site: RefusalSite, ticket?: Pick<FreeActionTicket, 'actionClass' | 'variant' | 'targetId' | 'itemId'>, extra?: Record<string, unknown>): void {
  const code = FA_GATE_CODES[reason as GateReason];
  if (!code) return; // disabled / unresolved 等不是闸门原因，不在 FA 族内
  logEvent({
    code,
    detail: {
      site, reason, ...extra,
      ...(ticket ? { actionClass: ticket.actionClass, variant: ticket.variant, targetId: ticket.targetId, itemId: ticket.itemId ?? null } : {}),
    },
  });
}
