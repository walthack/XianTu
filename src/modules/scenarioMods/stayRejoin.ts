import { CONTENT_PACKS } from '../contentPacks';
import { QUEST_LINES } from './questLines';
/**
 * Y5 选「留下」的两名同伴暂留峒外与驿馆会合（交接 2026-11-09 需求三）。
 * Y5 选「留下」写 branch.ningyu.enter_dong=stay；05b 会合拍成功提交写 branch.ningyu.y5_rejoined=true。
 * 两者之间不能当面拆信：暂扣规则是内容包数据（heldActions），列表和执行入口同一处判定；各国线照同形加规则即可复用。
 */
export const STAY_FLAG = 'branch.ningyu.enter_dong';
export const REJOINED_FLAG = 'branch.ningyu.y5_rejoined';

/** while 全部成立时，eventId 的 actionId 暂扣，须先做完 prerequisiteBeatId 那一拍。条件只读 flags（与步骤 visibleWhen 同形）。 */
export interface HeldActionRule {
  eventId: string;
  actionId: string;
  while: Array<{ path: string; operator: 'eq' | 'neq'; value: string | number | boolean }>;
  prerequisiteBeatId: string;
}
export interface HeldAction { eventId: string; actionId: string; label: string; prerequisiteBeatId: string }

type RuntimeLike = {
  flags?: Record<string, unknown>;
  activeEventIds?: string[];
  completedEventIds?: string[];
  events?: Array<{ id: string; playerCompletionContract?: { actions?: Array<{ id?: string; label?: string }> } }>;
};

export function awaitingRejoin(runtime: RuntimeLike | null | undefined): boolean {
  const flags = runtime?.flags || {};
  return flags[STAY_FLAG] === 'stay' && flags[REJOINED_FLAG] !== true;
}

function ruleActive(rule: HeldActionRule, runtime: RuntimeLike | null | undefined): boolean {
  const flags = runtime?.flags || {};
  return rule.while.every(c => {
    const value = flags[c.path.slice('flags.'.length)];
    return c.operator === 'eq' ? value === c.value : value !== c.value;
  });
}

/** 按 eventId+actionId 比对：传入克隆对象时按动作 id 落到规则事件上，不因找不到引用而静默放行。 */
export function actionHeldForRejoin(runtime: RuntimeLike | null | undefined, action: { id?: string } | null | undefined): boolean {
  if (!action?.id) return false;
  const owner = runtime?.events?.find(event => event.playerCompletionContract?.actions?.includes(action as never));
  return (CONTENT_PACKS.heldActions || []).some(rule => rule.actionId === action.id && ruleActive(rule, runtime)
    && (owner ? owner.id === rule.eventId : !!runtime?.events?.find(event => event.id === rule.eventId)?.playerCompletionContract?.actions?.some(a => a.id === action.id)));
}

/** 当前被暂扣的合同动作（事件在场且未完成）：给意图判定作不可执行候选、给叙事胶囊换目标。 */
export function heldActions(runtime: RuntimeLike | null | undefined): HeldAction[] {
  return (CONTENT_PACKS.heldActions || []).flatMap(rule => {
    if (!ruleActive(rule, runtime) || !runtime?.activeEventIds?.includes(rule.eventId) || runtime.completedEventIds?.includes(rule.eventId)) return [];
    const action = runtime.events?.find(event => event.id === rule.eventId)?.playerCompletionContract?.actions?.find(a => a.id === rule.actionId);
    return action ? [{ eventId: rule.eventId, actionId: rule.actionId, label: String(action.label || ''), prerequisiteBeatId: rule.prerequisiteBeatId }] : [];
  });
}

/** 前置拍的既有目标文本（beat objectiveId 解析后的 objective）；不另写文案。 */
export function heldPrerequisiteObjective(held: HeldAction): string {
  return QUEST_LINES.flatMap(line => line.beats).find(beat => beat.id === held.prerequisiteBeatId)?.objective || '';
}
