// 任务模式拍子判定（beat_judge）把手打的话判给开放世界问题行动（如 s02_04 点心铺）时，不再在本地直接写成功、
// 也不再走“只本地叙事、不发主请求”的开放世界捷径（REPORT-8091-68fe9d20 P1-1）：
// 与认出的事件动作一样，先走常规风险判定卡（关键词预检），确认后再按判定结果结算并发主叙事请求。
// 判定卡确认后的二次执行不重跑意图识别：这里按判定卡 id 记住当初判中的选择。
import type { SaveData } from '@/types/game';
import type { JudgementOutcome } from '@/utils/judgementEngine';
import {
  settleWuyuanOpenWorldSelection,
  type WuyuanOpenWorldSelection,
} from '@/modules/scenarioMods/wuyuanOpenWorldSlice';

export interface BeatOpenWorldIntent { certainty: string; evidenceLength: number }

export interface BeatOpenWorldPending {
  judgementId: string;
  selection: WuyuanOpenWorldSelection;
  beatIntent: BeatOpenWorldIntent;
}

// 与事件动作判定（judgement.successOutcomes 缺省）同一套成功档：不另立新规则。
export const BEAT_OPEN_WORLD_SUCCESS_OUTCOMES: readonly JudgementOutcome[] = ['success', 'great_success', 'perfect'];

let pending: BeatOpenWorldPending | null = null;

export function isBeatJudgedOpenWorldAction(
  beatIntent: BeatOpenWorldIntent | undefined,
  action: { source?: string } | undefined,
): action is WuyuanOpenWorldSelection {
  return Boolean(beatIntent && action && action.source === 'open_world_engine');
}

export function rememberBeatOpenWorldJudgement(entry: BeatOpenWorldPending): void {
  pending = { ...entry, selection: { ...entry.selection }, beatIntent: { ...entry.beatIntent } };
}

/** 取出（并清掉）与这张判定卡对应的拍子判定选择；id 对不上返回 undefined 并清掉旧记录。 */
export function takeBeatOpenWorldJudgement(judgementId: string | undefined): BeatOpenWorldPending | undefined {
  const entry = pending;
  pending = null;
  if (!entry || !judgementId || entry.judgementId !== judgementId) return undefined;
  return entry;
}

export function clearBeatOpenWorldJudgement(): void { pending = null; }

/** 判定结果是否允许结算开放世界行动；没有判定（原话不含风险、未出卡）时照常结算。 */
export function beatOpenWorldOutcomeSettles(outcome: JudgementOutcome | string | undefined, judged: boolean): boolean {
  if (!judged) return true;
  return BEAT_OPEN_WORLD_SUCCESS_OUTCOMES.includes(outcome as JudgementOutcome);
}

/** 主叙事成功落盘后再结算（与事件动作在叙事处理里结算同序）；返回结算是否生效。 */
export function settleBeatOpenWorldAfterNarrative(saveData: SaveData, selection: WuyuanOpenWorldSelection): boolean {
  const result = settleWuyuanOpenWorldSelection(saveData, selection) as { settled?: boolean } | undefined;
  return result?.settled !== false;
}
