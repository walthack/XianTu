/**
 * 主线拍没推进日志（LCQ-SAV-065）：玩家发了一手、当时有焦点主线拍、这一手结束后该拍没推进时记一条。
 * work/ASK-USER.md Q20 用户 2026-11-13 08:35 答复：先补日志（不在本拍地点时的输入、判拍结果、进度不动的原因），改法暂不定。
 * 只观察：不改结算、判定、闸门、提示词、界面；任何一步出错都只丢这条日志。
 * 玩家输入放在 detail.input（textKeys 之一），长度上限读 story.quest.beatStall.textChars（只管这一条；0＝只记长度）。
 */
import type { SaveData } from '@/types/game';
import { GAME_NUMBERS } from '../sceneModule/numbers';
import { logEvent } from '../diagnostics/log';
import { getCurrentStoryEventActions, getScenarioFocusEvent } from './runtime';
import { resolveBeatTextUngated, type BeatVia } from './beatProgress';
import { locationName, questActionGate, questBeatKey, questBeatSpec, questLogView } from './questLog';
import { currentLocation } from './travel/travelLedger';
import { lastBeatJudgeOutcome } from './naturalIntentRouter';

export const BEAT_STALL_REASONS = [
  'notThere', // 命中了本拍动作但人不在 where／who 不同场（beat.resolve via=notThere）
  'miss', // 字链和短语都没对上，也没发判拍（via=miss）
  'judgeUnsettled', // 发了判拍但没结算（detail.judgeOutcome＝LCQ-SAV-062 的 outcome）
  'judgeTimeout', // 判拍超时（含重发后仍超时）
  'travel', // 这一手命中的是罗盘移动动作（travel:…），本拍本身未结算
  'turnFailed', // 命中了本拍动作，但这一手没提交（叙事失败／超时／撤回）
  'scene', // 被场面（战斗等 sceneModule）接走
  'judgementPending', // 停在判定卡（待确认的行动判定）
  'intentHold', // 行动识别停下保留输入（没听清／识别失败）
  'freeAction', // 被自由行动票接走（via=other 且有自由行动票）
  'otherEngine', // 被别的引擎接走（机缘、开放世界、拒赌、判定结算等；detail.clues 列出）
  'noActions', // 本拍此刻没有可做的动作（via=none）
  'other', // 分不清：detail.clues、detail.exitBeforeResolve 带线索
] as const;
export type BeatStallReason = typeof BEAT_STALL_REASONS[number];

const HIT_VIAS: ReadonlySet<string> = new Set(['button', 'exact', 'alias', 'intent', 'arrive', 'talk', 'deadline']);

/** source：quest＝quests.json 的 completion（where／who 闸门）；travel＝引擎此刻只给罗盘移动（人不在本拍地点，动作表只剩 travel:X）。 */
export interface Requirement { source: 'quest' | 'travel'; actionId: string; where: string | null; whereName: string; who: string | null; whoName: string; whereOk: boolean | null; whoOk: boolean | null }

export interface BeatStallProbe {
  startedAt: number;
  beatId: string;
  beatKey: string;
  stageId: string;
  turn: number;
  locationId: string | null;
  locationDesc: string;
  objective: string;
  place: string;
  text: string;
  /** 回合开头时本拍各动作要求的地点／人物与当时闸门是否满足。 */
  required: Requirement[];
  /** 回合开头时这句话（不看闸门）命中的本拍动作 id。 */
  textHitActionId: string | null;
  /** 回合开头时本拍动作表只剩罗盘移动（人不在本拍地点）。 */
  travelOnly: boolean;
  via?: BeatVia;
  actionId?: string;
  clues: string[];
  narrativeSent: boolean;
  committed: boolean;
  exit?: 'scene';
}

const runtimeOf = (save: SaveData | null | undefined): any => (save as any)?.世界?.状态?.剧本模组;
const stallTextChars = (): number => {
  const value = (GAME_NUMBERS.story as unknown as { quest?: { beatStall?: { textChars?: number } } }).quest?.beatStall?.textChars;
  return Number.isInteger(value) && (value as number) >= 0 ? value as number : 0;
};
const strip = (value: string | undefined, prefix: string): string => String(value || '').startsWith(prefix) ? String(value).slice(prefix.length) : String(value || '');

/** 回合开头取快照；没有焦点主线拍（或本关待启程）、没有输入时返回 undefined（这一手不记）。 */
export function beginBeatStallProbe(save: SaveData | null | undefined, text: string): BeatStallProbe | undefined {
  try {
    const runtime = runtimeOf(save);
    const input = String(text || '').trim();
    if (!save || !runtime || !input) return undefined;
    const beatId = String(getScenarioFocusEvent(runtime)?.id || '');
    const beatKey = questBeatKey(save);
    if (!beatId || beatKey.startsWith('departure:')) return undefined;
    const here = currentLocation(save);
    const entry = questLogView(save).current[0];
    const hit = resolveBeatTextUngated(save, input, []);
    return {
      startedAt: Date.now(), beatId, beatKey, stageId: String(runtime.modId || ''), turn: Math.max(0, Number(runtime.worldTurn) || 0),
      locationId: here.locationId || null, locationDesc: String((save as any)?.角色?.位置?.描述 || ''),
      objective: String(entry?.objective || ''), place: String(entry?.place || ''),
      text: input, required: requirements(save, beatId), textHitActionId: hit?.action.kind === 'event' ? hit.action.selection.actionId : null,
      travelOnly: travelOnlyActions(save, beatId).length > 0,
      clues: [], narrativeSent: false, committed: false,
    };
  } catch {
    return undefined; // lcq-allow: 只观察的日志，取快照失败就不记这一手，不影响回合
  }
}

/** beat.resolve 那一步记下 via、命中的动作和「被谁接走」的线索。 */
export function noteBeatStallVia(probe: BeatStallProbe | undefined, via: BeatVia, actionId: string | undefined, clues: Record<string, boolean>): void {
  if (!probe) return;
  probe.via = via;
  if (actionId) probe.actionId = actionId;
  probe.clues = Object.entries(clues).filter(([, on]) => on).map(([name]) => name);
}

/** 本拍此刻动作表只剩罗盘移动（travel:X）时返回这些移动动作 id；否则空数组。 */
function travelOnlyActions(save: SaveData, beatId: string): string[] {
  const ids = getCurrentStoryEventActions(save).filter(item => item.eventId === beatId).map(item => item.actionId);
  return ids.length && ids.every(id => id.startsWith('travel:')) ? ids : [];
}
function requirements(save: SaveData, beatId: string): Requirement[] {
  const travel: Requirement[] = travelOnlyActions(save, beatId).map(actionId => {
    const where = actionId.slice('travel:'.length);
    return { source: 'travel', actionId, where, whereName: locationName(where), who: null, whoName: '', whereOk: false, whoOk: null };
  });
  return [...travel, ...questRequirements(save, beatId)];
}
function questRequirements(save: SaveData, beatId: string): Requirement[] {
  const runtime = runtimeOf(save);
  const names = new Map<string, string>((runtime?.canon?.characters || []).map((item: any) => [String(item?.id), String(item?.name || '')]));
  // 读 quests.json 里本拍全部动作（人不在场时这些动作可能不在当前动作表里，只剩罗盘移动）。
  return Object.entries(questBeatSpec(beatId)?.actions || {}).flatMap(([actionId, spec]) => {
    const completion = (spec as { completion?: { where?: string; who?: string } } | undefined)?.completion;
    const item = { eventId: beatId, actionId };
    if (!completion || actionId.startsWith('travel:')) return [];
    const where = completion.where && completion.where !== 'any' ? strip(completion.where, 'place:') : null;
    const who = completion.who && completion.who !== 'none' ? strip(completion.who, 'npc:') : null;
    if (!where && !who) return [];
    const gate = questActionGate(save, item);
    return [{ source: 'quest' as const, actionId: item.actionId, where, whereName: where ? locationName(where) : '', who, whoName: who ? names.get(who) || '' : '', whereOk: gate.where ?? null, whoOk: gate.who ?? null }];
  });
}

/** 原因分类（纯函数，单测直接测）。 */
export function classifyBeatStall(probe: Pick<BeatStallProbe, 'via' | 'actionId' | 'clues' | 'committed' | 'exit' | 'travelOnly'>, judgeOutcome: string | null, extra: { pendingJudgement: boolean; intentHold: boolean }): BeatStallReason {
  if (probe.exit === 'scene') return 'scene';
  const via = probe.via;
  if (via === 'notThere') return 'notThere';
  // 人不在本拍地点、引擎只给罗盘移动，这句话又不是那条移动：beat.resolve 记 miss，这里归人不在场（detail.notThereKind=travelOnly）。
  if (via === 'miss' && probe.travelOnly) return 'notThere';
  if (judgeOutcome && judgeOutcome !== 'settled') return judgeOutcome === 'timeout' ? 'judgeTimeout' : 'judgeUnsettled';
  if (via === 'miss') return 'miss';
  if (via && HIT_VIAS.has(via)) return probe.actionId?.startsWith('travel:') ? 'travel' : !probe.committed ? 'turnFailed' : 'other';
  if (via === 'other') return probe.clues.includes('freeActionTickets') || probe.clues.includes('followUpFreeAction') ? 'freeAction' : 'otherEngine';
  if (via === 'none') return 'noActions';
  if (!via && extra.pendingJudgement) return 'judgementPending';
  if (!via && extra.intentHold) return 'intentHold';
  return 'other';
}

/**
 * 回合结束（sendMessage 的 finally）调用：焦点拍已完成、拍键已变、或命中本拍动作且已提交＝推进了，不记；
 * 其余记一条 LCQ-SAV-065。返回写入的条目（测试用）。
 */
export function finishBeatStallProbe(probe: BeatStallProbe | undefined, after: SaveData | null | undefined, extra: { pendingJudgement: boolean; intentHold: boolean }): ReturnType<typeof logEvent> {
  try {
    if (!probe || !after) return null;
    const runtime = runtimeOf(after);
    if (!runtime) return null;
    const beatKeyAfter = questBeatKey(after);
    const completed = (runtime.completedEventIds || []).includes(probe.beatId);
    const actionSettled = Boolean(probe.via && HIT_VIAS.has(probe.via) && probe.committed && !probe.actionId?.startsWith('travel:'));
    if (completed || beatKeyAfter !== probe.beatKey || actionSettled) return null;
    const judge = lastBeatJudgeOutcome();
    const judgeThisTurn = judge && judge.at >= probe.startedAt && judge.beatId === probe.beatId ? judge : null;
    const reason = classifyBeatStall(probe, judgeThisTurn?.outcome ?? null, extra);
    const requiredAfter = requirements(after, probe.beatId);
    const beatActionsAfter = getCurrentStoryEventActions(after).filter(item => item.eventId === probe.beatId);
    const here = currentLocation(after);
    const locationAfter = here.locationId || null;
    // 顶层键数须 ≤ diagnostics.maxKeys（20），位置与闸门分组收进 location／gate。
    const detail = {
      beatId: probe.beatId, stageId: probe.stageId, turn: probe.turn, reason,
      via: probe.via ?? null, actionId: probe.actionId ?? null, clues: probe.clues,
      ...(judgeThisTurn ? { judgeOutcome: judgeThisTurn.outcome, judgeAttempt: judgeThisTurn.attempt } : {}),
      ...(!probe.via ? { exitBeforeResolve: { pendingJudgement: extra.pendingJudgement, intentHold: extra.intentHold } } : {}),
      narrativeSent: probe.narrativeSent, committed: probe.committed,
      location: { before: probe.locationId, descBefore: probe.locationDesc, after: locationAfter, changed: locationAfter !== probe.locationId },
      gate: {
        ...(reason === 'notThere' ? { notThereKind: probe.via === 'notThere' ? 'questGate' : 'travelOnly' } : {}),
        travelOnly: probe.travelOnly, textHitActionId: probe.textHitActionId, required: probe.required,
        // 回合后闸门：动作表里有非罗盘动作、且 quests.json 的 where／who 至少一个动作过了（没写 completion 的不拦）。
        okAfter: beatActionsAfter.some(item => !item.actionId.startsWith('travel:'))
          && (requiredAfter.every(item => item.source !== 'quest') || requiredAfter.some(item => item.source === 'quest' && item.whereOk !== false && item.whoOk !== false)),
      },
      objective: probe.objective, place: probe.place,
      inputLength: [...probe.text].length, input: probe.text,
    };
    return logEvent({ code: 'LCQ-SAV-065', echo: false, detail, textChars: stallTextChars() });
  } catch {
    return null; // lcq-allow: 只观察的日志，失败不影响回合（logEvent 本身不抛，这里兜计算字段的异常）
  }
}
