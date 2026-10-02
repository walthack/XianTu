import type { SaveData } from '@/types/game';
import { getCurrentStoryEventActions, type ScenarioEventActionSelection } from './runtime';

/**
 * 重要桥段推进卡片（剧情策划裁定 2026-10-01，方案 A：只能点卡片推进）。
 *
 * 被列入本表的事件步骤：推进只认玩家点卡片；自由输入可以对话，但不推进，
 * 被识别为"想推进"时只高亮卡片提示确认。点卡片结算后，结果句由引擎接在正文之后；
 * 未结算的回合，正文不得写出这一步的结果。
 *
 * 逐条裁定、逐条加入：本轮只有首条 sudaji_south_pact（复测 fx-pact2 出现"正文谈成、进度未动"）。
 * 其余已裁定的推荐条目见 docs/KEY-BEAT-ADVANCE-CARD-CANDIDATES-2026-10-01.md，复测通过后再按表追加。
 */
export interface KeyBeatCardStep {
  /** 卡片文案；缺省用动作原 label。只写做什么，不写会得到什么。 */
  cardLabel?: string;
  /** 结算后由引擎接在正文之后的结果句（面向玩家，非工程口径）。 */
  resultLine: string;
}

export interface KeyBeatCardDefinition {
  /** 只有这些动作走卡片；未列出的步骤照常进行。 */
  steps: Readonly<Record<string, KeyBeatCardStep>>;
}

// 用户裁定 2026-10-02：重大抉择改用硬编码选项锁（branchDecision.ts）；原谈期限推进卡片解锁回普通交谈，本表暂空。
const KEY_BEAT_CARDS: Readonly<Record<string, KeyBeatCardDefinition>> = {};

export function getKeyBeatCardDefinition(eventId: string | undefined): KeyBeatCardDefinition | null {
  return eventId ? KEY_BEAT_CARDS[eventId] || null : null;
}

export function keyBeatStep(eventId: string | undefined, actionId: string | undefined): KeyBeatCardStep | null {
  if (!eventId || !actionId) return null;
  return getKeyBeatCardDefinition(eventId)?.steps[actionId] || null;
}

export interface KeyBeatCardOption {
  selection: ScenarioEventActionSelection;
  label: string;
  /** 这一步需要判定时的标注（对应 Skyrim 对话选项上的说服检定）。 */
  judgementTag?: string;
  /** 多步事件的步骤标注，如"第 1/2 步"。 */
  stepTag?: string;
}

/** 当前可点的推进卡片；不在重要桥段时返回 null。 */
export function getActiveKeyBeatCard(saveData: SaveData | null | undefined): { eventId: string; options: KeyBeatCardOption[] } | null {
  if (!saveData) return null;
  const options = getCurrentStoryEventActions(saveData)
    .map(selection => ({ selection, step: keyBeatStep(selection.eventId, selection.actionId) }))
    .filter(item => item.step)
    .map(({ selection, step }) => ({
      selection,
      label: step!.cardLabel || selection.label,
      ...(selection.judgement ? { judgementTag: '需要判定' } : {}),
      ...(selection.stepIndex && selection.stepTotal && selection.stepTotal > 1 ? { stepTag: `第 ${selection.stepIndex}/${selection.stepTotal} 步` } : {}),
    }));
  return options.length ? { eventId: options[0].selection.eventId, options } : null;
}

/** 是否为卡片动作（用于隐藏同一动作的小按钮、拦截未经卡片确认的推进）。 */
export function isKeyBeatCardAction(selection: { source?: string; eventId?: string; actionId?: string } | null | undefined): boolean {
  return Boolean(selection && selection.source === 'event_engine' && keyBeatStep(selection.eventId, selection.actionId));
}

export const KEY_BEAT_CARD_TITLE = '关键抉择';
export const KEY_BEAT_CARD_HINT = '点卡片才会推进剧情；也可以先用输入框和人物交谈，交谈不会推进。';
export const KEY_BEAT_PENDING_FALLBACK = '对方没有立刻表态，这件事还悬着。';
export const KEY_BEAT_CONFIRM_NOTICE = '这句话像是要推进当前的关键抉择。确认请点上方卡片；输入已保留。';
