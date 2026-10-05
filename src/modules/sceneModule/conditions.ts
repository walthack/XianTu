// 条件表达式：胜负、敌方出手时机、收束校验都用它。省略 kind 的简写会按字段推断。

import { isDowned } from './statuses';
import { isPresent, partyOf, trackInfo, trackStep } from './queries';
import type { Cond, Contract, Expr, SceneContext, SceneState } from './types';

type Raw = Record<string, any>;

export function normalizeCond(raw: Raw): Cond | Expr {
  if (Array.isArray(raw.all) || Array.isArray(raw.any)) return raw as Expr;
  if (raw.kind) return raw as Cond;
  if (raw.party && raw.track && raw.reach !== undefined) return { kind: 'trackReaches', party: raw.party, track: raw.track, reach: raw.reach };
  if (raw.party && raw.status) return { kind: 'statusPresent', party: raw.party, status: raw.status };
  if (raw.party && raw.downed) return { kind: 'partyDowned', party: raw.party };
  if (raw.party && raw.departed) return { kind: 'partyDeparted', party: raw.party };
  if (raw.party && raw.present) return { kind: 'partyPresent', party: raw.party };
  if (raw.side && raw.downed) return { kind: 'sideDowned', side: raw.side };
  if (raw.tag) return { kind: 'tagActive', tag: raw.tag };
  return raw as Cond;
}

export function isExpr(value: unknown): value is Expr {
  return !!value && typeof value === 'object' && (Array.isArray((value as Raw).all) || Array.isArray((value as Raw).any));
}

export function evalExpr(raw: Cond | Expr | Raw | undefined, contract: Contract, state: SceneState, ctx?: Pick<SceneContext, 'catalog'>): boolean {
  if (!raw) return false;
  const node = normalizeCond(raw as Raw);
  if (isExpr(node)) {
    if ('all' in node) return node.all.length > 0 && node.all.every(item => evalExpr(item, contract, state, ctx));
    return node.any.some(item => evalExpr(item, contract, state, ctx));
  }
  switch (node.kind) {
    case 'trackReaches': {
      const info = trackInfo(contract, node.party, node.track);
      if (!info) return false;
      const step = trackStep(state, node.party, node.track);
      if (node.reach === 'final') return step >= info.limit && step > info.initial;
      const target = info.scale.indexOf(node.reach);
      return target >= 0 && step >= target;
    }
    case 'statusPresent':
      return (state.statuses[node.party] || []).some(item => item.id === node.status);
    case 'partyDowned':
      return isDowned(state, contract, ctx, node.party);
    case 'sideDowned': {
      const members = contract.parties.filter(p => p.side === node.side && isPresent(state, p.id));
      return members.length > 0 && members.every(p => isDowned(state, contract, ctx, p.id));
    }
    case 'partyDeparted':
      return state.departed.includes(node.party);
    case 'partyPresent':
      return !!partyOf(contract, node.party) && isPresent(state, node.party);
    case 'tagActive':
      return state.tags.some(tag => tag.id === node.tag);
    case 'beatAtLeast':
      return state.beat >= node.beat;
    case 'not':
      return !evalExpr(node.cond, contract, state, ctx);
    default:
      return false;
  }
}
