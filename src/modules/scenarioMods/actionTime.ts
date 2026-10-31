import type { SaveData } from '@/types/game';
import { registerNumbersValidator, GAME_NUMBERS } from '../sceneModule/numbers';
import { advanceScenarioRuntime } from './runtime';
import { deferOptionalDeparture } from './questLineContext';
import { advanceClock, syncNanhuangRailTravel } from './travel/travelLedger';
import { logEvent } from '../diagnostics/log';
export interface ActionTime { tier: '一瞬' | '片刻' | '一时辰' | '半日' | '一日' | '数日'; days?: number }
export interface CultivationSelection { kind: 'cultivation'; days: number; actionId: string }
export const actionTimeConfig = () => GAME_NUMBERS.story.actionTime;
export function parseActionTime(value: unknown, actionId?: string): number {
  const c = actionTimeConfig(), v = value as any;
  const fixed: Record<string, number> = { 一瞬: c.minutes.instant, 片刻: c.minutes.moment, 一时辰: c.minutes.shichen, 半日: c.minutes.halfDay, 一日: c.days.oneDay * 1440 };
  if (v && Object.hasOwn(fixed, v.tier)) {
    if (v.days !== undefined) logEvent({ code: 'LCQ-SAV-035', detail: { reason: 'ignored_days', actionId } });
    return fixed[v.tier];
  }
  if (v?.tier === '数日' && Number.isSafeInteger(v.days) && v.days > 0) {
    if (v.days > c.severalDays.maxDays) logEvent({ code: 'LCQ-SAV-036', detail: { actionId, requestedDays: v.days, appliedDays: c.severalDays.maxDays, maxDays: c.severalDays.maxDays } });
    return Math.min(v.days, c.severalDays.maxDays) * 1440;
  }
  logEvent({ code: 'LCQ-SAV-035', detail: { actionId, reason: 'invalid_or_missing_tier', appliedTier: c.fallbackTier } });
  return fixed[c.fallbackTier];
}
export function validCultivation(selection: CultivationSelection): boolean {
  const c = actionTimeConfig().cultivation;
  return selection?.kind === 'cultivation' && typeof selection.actionId === 'string' && !!selection.actionId && Number.isSafeInteger(selection.days) && selection.days >= c.minDays && selection.days <= c.maxDays;
}
/** 回执随动作克隆一起提交或丢弃；不使用全局上下文。 */
export function settleTime(save: SaveData, id: string, minutes: number, source: string) {
  if (!Number.isFinite(minutes) || minutes < 0 || !id) throw new Error('LCQ-SAV-039');
  const s = save as any;
  const receipts = s.系统?.扩展?.actionTime?.receipts || {};
  if (receipts[id]) {
    if (receipts[id].minutes !== minutes || receipts[id].source !== source) { logEvent({ code: 'LCQ-SAV-039', detail: { id, source } }); throw new Error('LCQ-SAV-039'); }
    return null;
  }
  const advanced = advanceClock(save, { minutes }, source);
  if (!advanced) return null;
  s.系统 ||= {}; s.系统.扩展 ||= {}; s.系统.扩展.actionTime ||= { version: 1, receipts: {} };
  s.系统.扩展.actionTime.receipts[id] = { id, source, minutes, oldTime: advanced.oldValue, newTime: advanced.newValue, version: 1 };
  return advanced;
}
export function settleActionTime(save: SaveData, response: any, options: any, card: any, step: boolean, initialization: boolean) {
  if (initialization || response.generationError || response.transactionCommitted) return null;
  const id = response.moduleReceipt?.id || options?.timeActionId;
  if (!id) return null;
  const rt = (save as any).世界?.状态?.剧本模组;
  // 正式runtime在正文时间前缀之后推进；先用它的只读克隆算出本拍确实会落账的路线。
  // 只提前落相同的行旅回执，事件/回合仍由原入口推进，保留可选离城窗口。
  if (Array.isArray(rt?.events) && Array.isArray(rt?.chapters) && (rt?.travelLedger || rt?.modId === 'lcq.stage_02')) {
    const preview = advanceScenarioRuntime(structuredClone(save)).saveData as any;
    const nextRuntime = preview.世界?.状态?.剧本模组;
    const oldIds = new Set((rt.travelLedger?.state?.travelReceipts || []).map((r: any) => r.receiptId));
    if ((nextRuntime?.travelLedger?.state?.travelReceipts || []).some((r: any) => !oldIds.has(r.receiptId))) {
      const done = rt.completedEventIds;
      rt.completedEventIds = nextRuntime.completedEventIds;
      try { syncNanhuangRailTravel(save, rt, eventId => deferOptionalDeparture(preview, eventId)); }
      finally { rt.completedEventIds = done; }
    }
  }
  // 本拍路程已由行旅服务推进：不再叠加演出/模型耗时。
  if (Number.isFinite(rt?.authorTimeConsumedAtTurn) && rt.authorTimeConsumedAtTurn === rt.worldTurn) { if (options?.cultivationSelections?.length) throw new Error('LCQ-SAV-039'); return null; }
  const travel = rt?.travelLedger?.lastCard;
  if (travel && Number.isFinite(rt?.travelLedger?.timeConsumedAtTurn) && rt.travelLedger.timeConsumedAtTurn === rt.worldTurn) { if (options?.cultivationSelections?.length) throw new Error('LCQ-SAV-039'); return null; }
  const selections: CultivationSelection[] = options?.cultivationSelections || [];
  if (selections.length) {
    if (!selections.every(validCultivation)) throw new Error('LCQ-SAV-039');
    const oldValue = structuredClone((save as any).元数据.时间);
    for (const selection of selections) settleTime(save, 'cultivation:' + selection.actionId, selection.days * 1440, 'cultivation');
    return { oldValue, newValue: structuredClone((save as any).元数据.时间) };
  }
  const minutes = card?.action_time ? parseActionTime(card.action_time, id) : step ? Number(GAME_NUMBERS.story.stepScene.minutesPerBeat) : parseActionTime(response.action_time, id);
  return settleTime(save, id, minutes, step ? 'beat' : 'model');
}
export function actionTimePrompt(): string {
  const c = actionTimeConfig();
  return `每轮输出JSON，顶层action_time为{tier:"一瞬"|"片刻"|"一时辰"|"半日"|"一日"|"数日",days?:整数}。对应分钟为${c.minutes.instant}/${c.minutes.moment}/${c.minutes.shichen}/${c.minutes.halfDay}，一日${c.days.oneDay}天，数日1至${c.severalDays.maxDays}天。非数日不输出days。不得写任何日历指令。路线、修炼与作者固定跳跃由本地结算。无地图旅行回执时，跨国只能写准备前往并提示打开地图，不能叙述已到达。`;
}

registerNumbersValidator(() => {
  const c = actionTimeConfig();
  return c.calendar.daysPerMonth !== 30 || c.calendar.monthsPerYear !== 12 || c.cultivation.minDays > c.cultivation.maxDays ? ['story.actionTime: invalid calendar/cultivation bounds'] : [];
});
