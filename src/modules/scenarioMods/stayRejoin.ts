import { CONTENT_PACKS } from '../contentPacks';
import { QUEST_LINES } from './questLines';
import { eventEverCompleted, inventoryItemEntries, type EventCompletionFacts } from './itemPresentation';
import type { SaveData } from '@/types/game';
import { getStageDepartureOffer } from './runtime';
import { locationName, questConfig } from './questLog';
/**
 * Y5 选「留下」的两名同伴暂留峒外与驿馆会合（交接 2026-11-09 需求三）。
 * Y5 选「留下」写 branch.ningyu.enter_dong=stay；05b 会合拍成功提交写 branch.ningyu.y5_rejoined=true。
 * 两者之间不能当面拆信：暂扣规则是内容包数据（heldActions），列表和执行入口同一处判定；各国线照同形加规则即可复用。
 */
export const STAY_FLAG = 'branch.ningyu.enter_dong';
export const REJOINED_FLAG = 'branch.ningyu.y5_rejoined';

/** while 全部成立时，eventId 的 actionId 暂扣，须先做完 prerequisiteBeatId 那一拍。条件只读 flags（与步骤 visibleWhen 同形）。 */
export interface HeldActionRule {
  id?: string;
  subject?: { itemId: string };
  intentLabelId?: string;
  label?: string;
  /** 编译器由锚定合同动作复制，不接受作者规则新增字段。 */
  grantsPreparation?: string;
  eventId?: string;
  actionId?: string;
  while: Array<{ path: string; operator: 'eq' | 'neq'; value: string | number | boolean }>;
  prerequisiteBeatId: string;
}
export interface HeldAction { eventId?: string; actionId: string; label: string; prerequisiteBeatId: string }

type RuntimeLike = EventCompletionFacts & {
  flags?: Record<string, unknown>;
  activeEventIds?: string[];
  eventActionStates?: Record<string, { preparations?: string[] }>;
  events?: Array<{ id: string; playerCompletionContract?: { actions?: Array<{ id?: string; label?: string; grantsPreparation?: string }> } }>;
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

/** 持有规则物品或事件已激活时列出暂扣候选；兼容只传 runtime 的既有调用。 */
export function heldActions(input: SaveData | RuntimeLike | null | undefined): HeldAction[] {
  const save = input as SaveData | undefined;
  const runtime = (save?.世界?.状态?.剧本模组 || input) as RuntimeLike | null | undefined;
  const items = inventoryItemEntries(save?.角色?.背包?.物品);
  return (CONTENT_PACKS.heldActions || []).flatMap(rule => {
    const owner = runtime?.events?.find(event => rule.eventId ? event.id === rule.eventId : event.playerCompletionContract?.actions?.some(a => a.id === rule.actionId));
    const eventId = rule.eventId || owner?.id;
    const action = owner?.playerCompletionContract?.actions?.find(a => a.id === rule.actionId);
    const preparation = action?.grantsPreparation || rule.grantsPreparation;
    if (eventId && (eventEverCompleted(runtime, eventId)
      || (preparation && runtime?.eventActionStates?.[eventId]?.preparations?.includes(preparation)))) return [];
    const holding = !!rule.subject && items.some(([key, item]) => (item.物品ID || key) === rule.subject!.itemId && Number(item.数量) > 0);
    if (!ruleActive(rule, runtime) || !(holding || (rule.eventId && runtime?.activeEventIds?.includes(rule.eventId)))) return [];
    const label = action?.label || rule.label || (rule.intentLabelId && CONTENT_PACKS.texts[rule.intentLabelId]);
    return label ? [{ eventId: rule.eventId, actionId: rule.actionId || rule.id || rule.eventId!, label, prerequisiteBeatId: rule.prerequisiteBeatId }] : [];
  });
}

/** 前置拍的既有目标文本（beat objectiveId 解析后的 objective）；不另写文案。 */
export function heldPrerequisiteObjective(held: HeldAction, save?: SaveData): string {
  return heldDepartureObjective(held, save) || QUEST_LINES.flatMap(line => line.beats).find(beat => beat.id === held.prerequisiteBeatId)?.objective || '';
}

/** 前置拍在下一关、本关可启程时，提示给出的启程目标（departureObjective 模板）；否则 undefined。 */
export function heldDepartureObjective(held: HeldAction, save?: SaveData): string | undefined {
  const beat = QUEST_LINES.flatMap(line => line.beats).find(beat => beat.id === held.prerequisiteBeatId);
  return save && beat?.stageId && beat.stageId !== save.世界?.状态?.剧本模组?.modId && getStageDepartureOffer(save)
    ? questConfig().departureObjective.replace('{place}', locationName(beat.locationId)) : undefined;
}
