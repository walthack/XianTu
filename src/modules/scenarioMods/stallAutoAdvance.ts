/**
 * 主线停滞自动收束与启程（REPORT-8091-ef573ece P1）。
 *
 * 新档（入六朝）走完 s01_05 后本关已收束（nextStageReadyId），只剩「收拾行装，继续旅程」一个启程按钮：
 * 只有点按钮才切关，手打／粘贴按钮文字发出去只是一段普通叙事；而本关已无待推进内容，runtime 每回合把 stallTurns 清零，
 * 停滞收束永远轮不到——玩家被叙事带离帅帐，s02_01 王哲传功一直不出。
 * 这里补三件事（数值与提示文案都在 mod-kit numbers-progress.json 的 story.stallAutoAdvance）：
 *  1) 手打／粘贴启程按钮文字＝点启程按钮；
 *  2) 启程按钮出现后又空转 stageDepartureIdleTurns 回合，自动启程；
 *  3) 主线拍连续停滞 mainlineTurns 回合（没有作者的场外到点合同、也不是场面战），本回合按这一拍的主线动作结算。
 * 清羽 Demo 档有自己的到点设计（只 s01_01／s01_02 到点织入），不套用。
 */
import type { SaveData } from '@/types/game';
import { GAME_NUMBERS } from '../sceneModule/numbers';
import {
  getCurrentStoryEventActions,
  getScenarioFocusEvent,
  getStageDepartureOffer,
  recordStoryEventStructuredAction,
  type ScenarioEventActionSelection,
  type ScenarioStageDepartureOffer,
} from './runtime';
import { getWuyuanOpenWorldSelections, type WuyuanOpenWorldSelection } from './wuyuanOpenWorldSlice';
import { isQingyuOpeningPlaytestSave } from './qingyuOpeningPlaytest';

type StallConfig = { mainlineTurns: number; stageDepartureIdleTurns: number; mainlineNotice: string; departureNotice: string };
const config = (): StallConfig => (GAME_NUMBERS.story as unknown as { stallAutoAdvance: StallConfig }).stallAutoAdvance;
const runtimeOf = (save: SaveData | null | undefined): any => (save as any)?.世界?.状态?.剧本模组;
const lineKey = (value: unknown): string => String(value || '').normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '');
const IDLE_KEY = 'stageDepartureIdle';

/** 手打或粘贴的句子与启程按钮文字一致（去标点空白后相等）＝点了启程按钮。 */
export function stageDepartureFromText(save: SaveData | null | undefined, text: string): ScenarioStageDepartureOffer | null {
  if (!save || !lineKey(text)) return null;
  const offer = getStageDepartureOffer(save);
  return offer && lineKey(offer.label) === lineKey(text) ? offer : null;
}

/**
 * 每个叙事回合收尾时调用一次：启程按钮在场就记一回合空转（首次看到记 0），到 stageDepartureIdleTurns 返回启程目标；
 * 按钮不在（未收束或已切关）就清掉计数。计数挂在存档扩展、按关卡 id 认，切关后自然作废。
 */
export function noteStageDepartureIdleTurn(save: SaveData | null | undefined): ScenarioStageDepartureOffer | null {
  const ext = (save as any)?.系统?.扩展;
  if (!save || !ext) return null;
  const offer = getStageDepartureOffer(save);
  const stageId = String(runtimeOf(save)?.modId || '');
  const limit = Number(config().stageDepartureIdleTurns) || 0;
  if (!offer || !limit || isQingyuOpeningPlaytestSave(save) || runtimeOf(save)?.gameOver) {
    delete ext[IDLE_KEY];
    return null;
  }
  const prev = ext[IDLE_KEY];
  const turns = prev?.stageId === stageId && prev?.nextStageId === offer.nextStageId ? (Number(prev.turns) || 0) + 1 : 0;
  if (turns < limit) {
    ext[IDLE_KEY] = { stageId, nextStageId: offer.nextStageId, turns };
    return null;
  }
  delete ext[IDLE_KEY];
  return offer;
}

export type StallAutoAdvance =
  | { kind: 'event'; action: ScenarioEventActionSelection }
  | { kind: 'open_world'; selection: WuyuanOpenWorldSelection };

/** 主线拍停滞到点时，本回合要代为结算的主线动作；没到点、拍子自有场外合同、或无可结算动作时返回 undefined。不改入参。 */
export function stallAutoAdvance(save: SaveData | null | undefined): StallAutoAdvance | undefined {
  const runtime = runtimeOf(save);
  const limit = Number(config().mainlineTurns) || 0;
  if (!save || !runtime || !limit || runtime.gameOver || isQingyuOpeningPlaytestSave(save)) return undefined;
  if ((Number(runtime.stallTurns) || 0) < limit) return undefined;
  const focus = getScenarioFocusEvent(runtime);
  if (!focus || (focus as any).offscreenResolution) return undefined;
  const contractIds = new Set((focus.playerCompletionContract?.actions || []).map(action => action.id));
  const actions = getCurrentStoryEventActions(save).filter(action => action.eventId === focus.id);
  const action = actions.find(item => contractIds.has(item.actionId)) || actions.find(item => item.actionId.startsWith('travel:'));
  if (!action) return undefined;
  // 主线动作要先完成开放世界前置（五原 s02_04 点心铺）时，这一回合先替玩家走开放世界那一步。
  const probe = structuredClone(save);
  const receipt = recordStoryEventStructuredAction(probe, action);
  if ((receipt as { reason?: string }).reason === 'open_world_prerequisites') {
    const local = getWuyuanOpenWorldSelections(save);
    const selection = local.find(item => item.kind === 'problem_action') || local.find(item => item.kind === 'travel');
    return selection ? { kind: 'open_world', selection } : undefined;
  }
  return receipt.attempted ? { kind: 'event', action } : undefined;
}

export const stallAutoAdvanceNotice = (label: string): string => config().mainlineNotice.replace('{label}', label);
export const stageAutoDepartureNotice = (toName: string): string => config().departureNotice.replace('{toName}', toName);
