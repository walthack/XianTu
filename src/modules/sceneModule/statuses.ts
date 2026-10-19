// 状态：模块自己持有“场内状态账”，并通过事件把变化交给宿主的统一状态系统。
// 解析顺序：宿主状态目录 ＞ 合同里的临时定义 ＞ 模块内置的临时通用定义（等总策划的目录落地后以目录为准）。

import { CONTENT_PACKS } from '../contentPacks';
import bookCatalog from './contracts/statuses.json';
import builtinStatuses from './contracts/statuses.builtin.json';
import type { ActiveStatus, Contract, SceneContext, SceneState, StatusApplyRef, StatusDef, StatusEffectSpec, StatusParams } from './types';

/** 挂状态时带入的参数展开效果占位：sense 写 "$senses" 的按 params.senses 逐识展开；没给参数就去掉这一项（其余效果照常）。 */
export function resolveEffects(effects: StatusEffectSpec[], params?: StatusParams): StatusEffectSpec[] {
  return effects.flatMap(effect => effect.kind === 'sense' && effect.sense === '$senses'
    ? (params?.senses || []).map(sense => ({ ...effect, sense }))
    : [effect]);
}

/** 内置的临时通用状态：只为让模块和测试能独立运行，id 沿用剧情侧文档的写法。数值在 contracts/statuses.builtin.json。 */
export const BUILTIN_STATUSES = builtinStatuses as unknown as StatusDef[];

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

/** Book directory is authoritative; six provisional generic fallbacks remain usable (N4). */
export const STATUS_CATALOG = [...bookCatalog, ...CONTENT_PACKS.statuses] as unknown as StatusDef[];
export function catalogStatus(id: string): StatusDef | undefined { return STATUS_CATALOG.find(def=>def.id===id); }

export function resolveStatusDef(id: string, contract: Contract, ctx?: Pick<SceneContext, 'catalog'>): StatusDef | undefined {
  return ctx?.catalog?.(id) || catalogStatus(id) || contract.statuses?.find(def => def.id === id) || BUILTIN_STATUSES.find(def => def.id === id);
}

const refOf = (contract: Contract, party: string): string => contract.parties.find(p => p.id === party)?.ref || party;

export function activeStatuses(state: SceneState, party: string): ActiveStatus[] {
  return state.statuses[party] || [];
}

export function effectsOf(state: SceneState, contract: Contract, ctx: Pick<SceneContext, 'catalog'> | undefined, party: string): StatusEffectSpec[] {
  const out: StatusEffectSpec[] = [];
  for (const active of activeStatuses(state, party)) {
    const def = resolveStatusDef(active.id, contract, ctx);
    if (def) out.push(...resolveEffects(def.effects, active.params));
  }
  return out;
}

export function isDowned(state: SceneState, contract: Contract, ctx: Pick<SceneContext, 'catalog'> | undefined, party: string): boolean {
  return !!state.hpDowned?.[party] || effectsOf(state, contract, ctx, party).some(effect => effect.kind === 'downed');
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
  let previousParams: StatusParams | undefined;
  const present = forwardChain(contract, ctx, base.id).map(id => list.find(item => item.id === id)).filter((item): item is ActiveStatus => !!item);
  if (present.length) {
    const latest = present[present.length - 1];
    const latestDef = resolveStatusDef(latest.id, contract, ctx) || base;
    const next = latestDef.upgradesTo ? resolveStatusDef(latestDef.upgradesTo, contract, ctx) : undefined;
    previousParams = latest.params;
    // 部位参数：伤在还没伤过的部位＝又添一处伤，并进同一条（部位合并），不算旧伤加重；同一部位或不指明部位才沿升级链加重。
    const parts = (p?: StatusParams): string[] => (p?.bodyPart || '').split('、').filter(Boolean);
    const elsewhere = parts(apply.params).some(part => !parts(latest.params).includes(part));
    remove(latest);
    def = elsewhere ? latestDef : next || latestDef;
    op = next && !elsewhere ? 'upgrade' : 'refresh';
  } else {
    const earlier = list.find(item => forwardChain(contract, ctx, item.id).includes(base.id));
    if (earlier) {
      previousParams = earlier.params;
      remove(earlier);
      op = 'upgrade';
    }
  }
  if(meta.cause==='combat' && base.id.startsWith('wound.external') && contract.parties.find(p=>p.id===party)?.player && state.itemEffects?.woundGuard){
    delete state.itemEffects.woundGuard;
    if(def.id===base.id && base.id!=='wound.external.heavy')return [];
    def=resolveStatusDef(def.id==='incapacitated'?'wound.external.heavy':'wound.external',contract,ctx) || base;
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
  const params = mergeParams(previousParams, apply.params);
  if (params) active.params = params;
  list.push(active);
  return [{
    party, ref: refOf(contract, party), status: def.id, label: def.label, op, severity: active.severity,
    cause: meta.cause, sourceId: meta.sourceId, beat: state.beat, expiresBeat: active.expiresBeat, persists: !!def.afterScene,
  }];
}

/** 同一条升级链上前后两次挂伤的参数合并：部位并列（去重）、六识取并集。 */
export function mergeParams(a?: StatusParams, b?: StatusParams): StatusParams | undefined {
  if (!a && !b) return undefined;
  const out: StatusParams = {};
  const parts = [...new Set([...(a?.bodyPart || '').split('、'), ...(b?.bodyPart || '').split('、')].filter(Boolean))];
  if (parts.length) out.bodyPart = parts.join('、');
  const senses = [...new Set([...(a?.senses || []), ...(b?.senses || [])])];
  if (senses.length) out.senses = senses;
  return Object.keys(out).length ? out : undefined;
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

/** Recognition only: catalog/builtin labels and declared aliases; missing ids never match. */
export function statusNamePattern(id:string):string {const def=catalogStatus(id) || BUILTIN_STATUSES.find(d=>d.id===id);if(!def)return '(?!)';return [def.label,...(def.aliases || [])].map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');}
