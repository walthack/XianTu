// 状态：模块自己持有“场内状态账”，并通过事件把变化交给宿主的统一状态系统。
// 解析顺序：宿主状态目录 ＞ 合同里的临时定义 ＞ 模块内置的临时通用定义（等总策划的目录落地后以目录为准）。

import type { ActiveStatus, Contract, SceneContext, SceneState, StatusApplyRef, StatusDef, StatusEffectSpec } from './types';

/** 内置的临时通用状态：只为让模块和测试能独立运行，id 沿用剧情侧文档的写法。 */
export const BUILTIN_STATUSES: StatusDef[] = [
  {
    id: 'wound.external', label: '外伤', tier: 'general', cause: 'combat', kind: 'debuff', provisional: true,
    source: '战斗中被击中', upgradesTo: 'wound.external.heavy', afterScene: { minutes: 7 * 24 * 60 },
    effects: [{ kind: 'rollModifier', scope: 'action', value: -1 }, { kind: 'rollModifier', scope: 'defense', value: -1 }],
    remove: [{ kind: 'time', minutes: 7 * 24 * 60 }, { kind: 'rest' }],
  },
  {
    id: 'wound.external.heavy', label: '外伤（重）', tier: 'general', cause: 'combat', kind: 'debuff', provisional: true,
    source: '外伤再度加重', upgradesTo: 'incapacitated', afterScene: { minutes: 30 * 24 * 60 },
    effects: [{ kind: 'rollModifier', scope: 'action', value: -3 }, { kind: 'rollModifier', scope: 'defense', value: -3 }],
    remove: [{ kind: 'rest' }],
  },
  {
    id: 'wound.internal', label: '内伤', tier: 'general', cause: 'combat', kind: 'debuff', provisional: true,
    source: '被劲力震伤', upgradesTo: 'incapacitated', afterScene: { minutes: 14 * 24 * 60 },
    effects: [{ kind: 'rollModifier', scope: 'action', value: -2 }],
    remove: [{ kind: 'rest' }],
  },
  {
    id: 'disarmed', label: '兵器脱手', tier: 'general', cause: 'combat', kind: 'debuff', provisional: true,
    source: '兵器被击落或脱手', effects: [{ kind: 'lockLever', elementKinds: ['weapon'] }], remove: [{ kind: 'scene_end' }],
  },
  {
    id: 'off_balance', label: '失衡', tier: 'general', cause: 'combat', kind: 'debuff', provisional: true,
    source: '失手后架势散乱', durationBeats: 1,
    effects: [{ kind: 'disadvantage', scope: 'action' }, { kind: 'disadvantage', scope: 'defense' }],
    remove: [{ kind: 'scene_end' }],
  },
  {
    id: 'incapacitated', label: '倒下', tier: 'general', cause: 'combat', kind: 'debuff', provisional: true,
    source: '伤重倒地', afterScene: { minutes: null }, effects: [{ kind: 'downed' }], remove: [{ kind: 'rest' }],
  },
];

export interface StatusEvent {
  party: string;
  ref: string;
  status: string;
  label: string;
  op: 'apply' | 'upgrade' | 'refresh' | 'expire' | 'skipped';
  severity?: number;
  cause: StatusDef['cause'];
  sourceId: string;
  beat: number;
  expiresBeat: number | null;
  /** 场景结束后是否仍然保留，交给统一状态系统。 */
  persists: boolean;
}

export function resolveStatusDef(id: string, contract: Contract, ctx?: Pick<SceneContext, 'catalog'>): StatusDef | undefined {
  return ctx?.catalog?.(id) || contract.statuses?.find(def => def.id === id) || BUILTIN_STATUSES.find(def => def.id === id);
}

const refOf = (contract: Contract, party: string): string => contract.parties.find(p => p.id === party)?.ref || party;

export function activeStatuses(state: SceneState, party: string): ActiveStatus[] {
  return state.statuses[party] || [];
}

export function effectsOf(state: SceneState, contract: Contract, ctx: Pick<SceneContext, 'catalog'> | undefined, party: string): StatusEffectSpec[] {
  const out: StatusEffectSpec[] = [];
  for (const active of activeStatuses(state, party)) {
    const def = resolveStatusDef(active.id, contract, ctx);
    if (def) out.push(...def.effects);
  }
  return out;
}

export function isDowned(state: SceneState, contract: Contract, ctx: Pick<SceneContext, 'catalog'> | undefined, party: string): boolean {
  return effectsOf(state, contract, ctx, party).some(effect => effect.kind === 'downed');
}

export function statusRollModifier(state: SceneState, contract: Contract, ctx: Pick<SceneContext, 'catalog'> | undefined, party: string, scope: 'action' | 'defense'): number {
  let sum = 0;
  for (const effect of effectsOf(state, contract, ctx, party)) if (effect.kind === 'rollModifier' && effect.scope === scope) sum += effect.value;
  return sum;
}

export function statusMode(state: SceneState, contract: Contract, ctx: Pick<SceneContext, 'catalog'> | undefined, party: string, scope: 'action' | 'defense'): { advantage: boolean; disadvantage: boolean } {
  const effects = effectsOf(state, contract, ctx, party);
  return {
    advantage: effects.some(effect => effect.kind === 'advantage' && effect.scope === scope),
    disadvantage: effects.some(effect => effect.kind === 'disadvantage' && effect.scope === scope),
  };
}

export function lockedBy(state: SceneState, contract: Contract, ctx: Pick<SceneContext, 'catalog'> | undefined, party: string, element: { id: string; kind: string }): boolean {
  return effectsOf(state, contract, ctx, party).some(effect => effect.kind === 'lockLever'
    && ((effect.elements || []).includes(element.id) || (effect.elementKinds || []).includes(element.kind)));
}

/** 沿 upgradesTo 往后的整条升级链（含自己）。 */
function forwardChain(contract: Contract, ctx: Pick<SceneContext, 'catalog'> | undefined, id: string): string[] {
  const chain: string[] = [];
  let cursor: string | undefined = id;
  while (cursor && !chain.includes(cursor) && chain.length < 12) {
    chain.push(cursor);
    cursor = resolveStatusDef(cursor, contract, ctx)?.upgradesTo;
  }
  return chain;
}

/**
 * 给某个参与方挂状态。同一条升级链上的状态算同类：再中就升级（轻→重→倒下），链末端再中只刷新时长；
 * 已有更靠后的阶段时，对它升级，而不是另挂一个重复的。
 */
export function applyStatus(
  state: SceneState,
  contract: Contract,
  ctx: Pick<SceneContext, 'catalog'> | undefined,
  party: string,
  apply: StatusApplyRef,
  meta: { cause: StatusDef['cause']; sourceId: string },
): StatusEvent[] {
  const base = resolveStatusDef(apply.status, contract, ctx);
  if (!base) {
    return [{ party, ref: refOf(contract, party), status: apply.status, label: apply.status, op: 'skipped', cause: meta.cause, sourceId: meta.sourceId, beat: state.beat, expiresBeat: null, persists: false }];
  }
  const list = (state.statuses[party] ||= []);
  const remove = (item: ActiveStatus): void => { list.splice(list.indexOf(item), 1); };
  let def = base;
  let op: StatusEvent['op'] = 'apply';
  const present = forwardChain(contract, ctx, base.id).map(id => list.find(item => item.id === id)).filter((item): item is ActiveStatus => !!item);
  if (present.length) {
    const latest = present[present.length - 1];
    const latestDef = resolveStatusDef(latest.id, contract, ctx) || base;
    const next = latestDef.upgradesTo ? resolveStatusDef(latestDef.upgradesTo, contract, ctx) : undefined;
    remove(latest);
    def = next || latestDef;
    op = next ? 'upgrade' : 'refresh';
  } else {
    const earlier = list.find(item => forwardChain(contract, ctx, item.id).includes(base.id));
    if (earlier) {
      remove(earlier);
      op = 'upgrade';
    }
  }
  const duration = apply.durationBeats !== undefined ? apply.durationBeats : def.durationBeats ?? null;
  const active: ActiveStatus = {
    id: def.id,
    appliedBeat: state.beat,
    expiresBeat: duration === null ? null : state.beat + duration,
    severity: apply.severity,
    cause: meta.cause,
    sourceId: meta.sourceId,
  };
  if (active.severity === undefined) delete active.severity;
  list.push(active);
  return [{
    party, ref: refOf(contract, party), status: def.id, label: def.label, op, severity: active.severity,
    cause: meta.cause, sourceId: meta.sourceId, beat: state.beat, expiresBeat: active.expiresBeat, persists: !!def.afterScene,
  }];
}

/** 一拍结束：到期的场内状态移除。 */
export function expireStatuses(state: SceneState, contract: Contract, ctx: Pick<SceneContext, 'catalog'> | undefined): StatusEvent[] {
  const events: StatusEvent[] = [];
  for (const [party, list] of Object.entries(state.statuses)) {
    const keep: ActiveStatus[] = [];
    for (const item of list) {
      if (item.expiresBeat !== null && item.expiresBeat <= state.beat) {
        const def = resolveStatusDef(item.id, contract, ctx);
        events.push({
          party, ref: refOf(contract, party), status: item.id, label: def?.label || item.id, op: 'expire',
          cause: item.cause, sourceId: item.sourceId, beat: state.beat, expiresBeat: item.expiresBeat, persists: false,
        });
      } else keep.push(item);
    }
    state.statuses[party] = keep;
  }
  return events;
}

/** 场景结束时要交给统一状态系统保留下来的状态。 */
export function persistentStatuses(state: SceneState, contract: Contract, ctx: Pick<SceneContext, 'catalog'> | undefined): Array<{
  party: string; ref: string; def: StatusDef; active: ActiveStatus;
}> {
  const out: Array<{ party: string; ref: string; def: StatusDef; active: ActiveStatus }> = [];
  for (const [party, list] of Object.entries(state.statuses)) {
    for (const active of list) {
      const def = resolveStatusDef(active.id, contract, ctx);
      if (def?.afterScene) out.push({ party, ref: refOf(contract, party), def, active });
    }
  }
  return out;
}
