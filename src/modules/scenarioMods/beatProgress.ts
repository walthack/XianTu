/**
 * 剧情推进：节拍结算与切换（设计稿 2026-11-02「剧情推进机制设计」；用户 2026-11-02 拍板 1–4）。
 *
 * 一拍的唯一结算入口＝本拍动作表：作者写在拍上的动作（playerCompletionContract.actions，含探索拍），本关收束后再加启程动作。
 * 按钮、建议原句、按钮标签、aliases（intentMatch.matchAny；rejectIf＝否定优先）都从这张表生成／匹配，按优先级首个命中即结算：
 *   1 点按钮／选项；2 手打与 label／playerLine 规范化相等（唯一）；3 命中 aliases；
 *   4 都不中：不推进，回合照常叙事，toast 列出本拍可做的动作，记 beat.resolve miss。
 * 正文关键词共现不是结算条件（见 services/eventReconcileService.ts）；意图模型也不替主线拍认动作（naturalIntentRouter）。
 *
 * 到点：只认作者在拍上写明的 deadline（offscreenResolution，回合数在 story.beatProgress.deadlineTurns 按事件 id 配，
 * 由 applyBeatDeadlines 在载入关卡时写进拍）；不再有通用的「主线停滞 N 回合代玩家结算」。
 * 启程：本关收束后启程按钮＝本关最后一个动作（手打按钮文字＝点击）；空转 departureIdleTurns 回合只提示、不自动出发；
 * 下一关在别国时启程改为打开地图点选（stageDepartureMapTarget／stageDepartureArrived）。
 * runtime.ts 冻结：它在「关已就绪未切关」时把 stallTurns 清零，所以启程空转计数外置在 系统.扩展.stageDepartureIdle。
 */
import type { SaveData } from '@/types/game';
import type { ScenarioMod } from './schema';
import { GAME_NUMBERS } from '../sceneModule/numbers';
import { logEvent } from '../diagnostics/log';
import { isDefaultLineQuarantinedStageId } from './canonRail';
import { isQingyuOpeningPlaytestSave } from './qingyuOpeningPlaytest';
import { countryOf, crossCountryStageDeparture, type CrossCountryTravelTarget } from './travel/mapTravel';
import { currentLocation } from './travel/travelLedger';
import {
  getCurrentStoryEventActions,
  getCurrentStoryExplorationActions,
  getScenarioFocusEvent,
  getStageDepartureOffer,
  resolveStoryEventActionFromPlayerText,
  type ScenarioEventActionSelection,
  type ScenarioStageDepartureOffer,
} from './runtime';

type BeatConfig = {
  deadlineTurns: Record<string, number>;
  departureIdleTurns: number;
  departureIdleNotice: string;
  missNotice: string;
};
const config = (): BeatConfig => (GAME_NUMBERS.story as unknown as { beatProgress: BeatConfig }).beatProgress;
const runtimeOf = (save: SaveData | null | undefined): any => (save as any)?.世界?.状态?.剧本模组;
export const beatLineKey = (value: unknown): string => String(value || '').normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '');

export type BeatAction =
  | { kind: 'event'; selection: ScenarioEventActionSelection }
  | { kind: 'departure'; offer: ScenarioStageDepartureOffer };
/** 输入方式：button 点按钮；exact 手打＝原句／标签；alias 命中作者短语；deadline 作者写明的到点；other 本回合走了别的引擎（自由行动、开放世界等）；miss 都没对上；none 本拍没有可做的动作。 */
export type BeatVia = 'button' | 'exact' | 'alias' | 'deadline' | 'other' | 'miss' | 'none';
export interface BeatResolution { via: 'exact' | 'alias'; action: BeatAction }

/** 本拍动作表：当前主线拍与探索拍的动作，本关收束后再加启程。 */
export function beatActionTable(save: SaveData | null | undefined): { beatId?: string; actions: BeatAction[] } {
  const runtime = runtimeOf(save);
  if (!save || !runtime) return { actions: [] };
  const offer = getStageDepartureOffer(save);
  const actions: BeatAction[] = [...getCurrentStoryEventActions(save), ...getCurrentStoryExplorationActions(save)]
    .map(selection => ({ kind: 'event' as const, selection }));
  if (offer) actions.push({ kind: 'departure', offer });
  return { beatId: getScenarioFocusEvent(runtime)?.id, actions };
}

const actionLines = (action: BeatAction): unknown[] => action.kind === 'departure'
  ? [action.offer.label]
  : [action.selection.playerLine, action.selection.actionText, action.selection.label];

/**
 * 手打文本 → 本拍动作（2.2 第 2、3 条）：与某个动作的原句／按钮标签／启程文字去标点空白后相等且唯一＝点了它；
 * 否则按作者短语（aliases，否定优先、歧义不认）匹配主线拍。都不中返回 undefined（不推进）。不改入参。
 */
export function resolveBeatText(save: SaveData | null | undefined, text: string): BeatResolution | undefined {
  if (!save) return undefined;
  const key = beatLineKey(text);
  if (key) {
    const hits = beatActionTable(save).actions.filter(action => actionLines(action).some(line => beatLineKey(line) === key));
    if (hits.length === 1) return { via: 'exact', action: hits[0] };
  }
  const alias = resolveStoryEventActionFromPlayerText(save, text) || inquiryAlias(save, text);
  return alias ? { via: 'alias', action: { kind: 'event', selection: alias } } : undefined;
}

/** 作者标了 allowInquiry（信息探问允许直接问句）的动作：句末问号不挡短语匹配；其余动作问句照旧不认。 */
function inquiryAlias(save: SaveData, text: string): ScenarioEventActionSelection | undefined {
  const statement = String(text || '').trim().replace(/[？?]+$/u, '');
  if (!statement || statement === String(text || '').trim()) return undefined;
  const hit = resolveStoryEventActionFromPlayerText(save, statement);
  const action = hit && (runtimeOf(save)?.events || []).find((event: any) => event?.id === hit.eventId)
    ?.playerCompletionContract?.actions?.find((item: any) => item?.id === hit.actionId);
  return action?.intentMatch?.allowInquiry === true ? hit : undefined;
}

/** 手打对不上时的提示：列出本拍可做的动作（按钮上看到的文字）；本拍没有动作时不提示。 */
export function beatMissNotice(save: SaveData | null | undefined): string | undefined {
  const labels = [...new Set(beatActionTable(save).actions.map(action => action.kind === 'departure' ? action.offer.label : action.selection.label))];
  return labels.length ? config().missNotice.replace('{actions}', labels.join('、')) : undefined;
}

/** 每回合一条 beat.resolve（LCQ-SAV-053）；miss 另记 LCQ-SAV-054 单独计数，作为补 aliases 的依据。不记玩家原文。 */
export function logBeatResolve(save: SaveData | null | undefined, via: BeatVia, hit?: { eventId?: string; actionId?: string }): ReturnType<typeof logEvent> {
  const runtime = runtimeOf(save);
  if (!runtime) return null;
  const detail = {
    beatId: getScenarioFocusEvent(runtime)?.id || null,
    via,
    actionId: hit?.actionId || null,
    eventId: hit?.eventId || null,
    stallTurns: Number(runtime.stallTurns) || 0,
    stageReady: Boolean(runtime.nextStageId && runtime.nextStageReadyId === runtime.nextStageId),
    modId: String(runtime.modId || ''),
  };
  return logEvent({ code: via === 'miss' ? 'LCQ-SAV-054' : 'LCQ-SAV-053', echo: false, detail });
}

/** 作者写明 deadline 的拍：到点回合数读配置（story.beatProgress.deadlineTurns，按事件 id）。没配的返回 undefined。 */
export function beatDeadlineTurns(eventId: string): number | undefined {
  const value = config().deadlineTurns?.[eventId];
  return Number.isInteger(value) && value >= 1 ? value : undefined;
}

/** 载入关卡时把配置里的到点回合数写进拍的场外收束合同（只改已有 offscreenResolution 的 afterStallTurns，不新增合同）。返回改了几拍；改入参。 */
export function applyBeatDeadlines(events: Array<{ id?: unknown; offscreenResolution?: { afterStallTurns?: number } }> | undefined): number {
  let changed = 0;
  for (const event of events || []) {
    const turns = beatDeadlineTurns(String(event?.id || ''));
    if (turns === undefined || !event.offscreenResolution || event.offscreenResolution.afterStallTurns === turns) continue;
    event.offscreenResolution.afterStallTurns = turns;
    changed++;
  }
  return changed;
}

/** 本回合有没有拍按作者写明的 deadline 收束（场外收束名单变长）。 */
export function deadlineResolvedThisTurn(before: SaveData | null | undefined, after: SaveData | null | undefined): string[] {
  const prior = new Set<string>(runtimeOf(before)?.offscreenResolvedEventIds || []);
  return ((runtimeOf(after)?.offscreenResolvedEventIds || []) as string[]).filter(id => !prior.has(id));
}

const IDLE_KEY = 'stageDepartureIdle';
/**
 * 每个叙事回合收尾时调用一次：启程按钮在场就记一回合空转（首次看到记 0），满 departureIdleTurns 回合返回一句提示并重新计数——
 * 只提示，不自动出发（用户 2026-11-02 拍板④）。按钮不在（未收束或已切关）就清掉计数；计数按关卡 id 认，切关后自然作废。
 */
export function noteStageDepartureIdleTurn(save: SaveData | null | undefined): string | undefined {
  const ext = (save as any)?.系统?.扩展;
  if (!save || !ext) return undefined;
  const offer = getStageDepartureOffer(save);
  const stageId = String(runtimeOf(save)?.modId || '');
  const limit = Number(config().departureIdleTurns) || 0;
  if (!offer || !limit || isQingyuOpeningPlaytestSave(save) || runtimeOf(save)?.gameOver) {
    delete ext[IDLE_KEY];
    return undefined;
  }
  const prev = ext[IDLE_KEY];
  const turns = prev?.stageId === stageId && prev?.nextStageId === offer.nextStageId ? (Number(prev.turns) || 0) + 1 : 0;
  ext[IDLE_KEY] = { stageId, nextStageId: offer.nextStageId, turns: turns >= limit ? 0 : turns };
  return turns >= limit ? config().departureIdleNotice.replace('{label}', offer.label) : undefined;
}

/** 下一关模组（与切关同口径跳过默认路线的隔离关）。 */
function nextStageMod(save: SaveData, mods: readonly ScenarioMod[]): ScenarioMod | undefined {
  let targetId = String(runtimeOf(save)?.nextStageId || '');
  const seen = new Set<string>();
  let mod = mods.find(item => item.manifest.id === targetId);
  while (mod && isDefaultLineQuarantinedStageId(targetId) && !seen.has(targetId)) {
    seen.add(targetId);
    targetId = mod.manifest.nextStageId || '';
    mod = targetId ? mods.find(item => item.manifest.id === targetId) : undefined;
  }
  return mod;
}

/** 内置关（与切关同一来源；builtins 用 require.context，Node 测试环境取不到时按空表，照常直接启程）。 */
function builtinMods(): ScenarioMod[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- builtins use require.context and are unavailable to the Node harness.
    return (require('./builtins') as { BUILTIN_SCENARIO_MODS: ScenarioMod[] }).BUILTIN_SCENARIO_MODS;
  } catch {
    return []; // lcq-allow: Node 测试环境没有 require.context，按无内置关处理（不判跨国、照常启程）
  }
}

const MAP_KEY = 'stageDepartureMap';
/**
 * 跨国切关（用户 2026-11-02 拍板④）：下一关开场地点在别国时，启程不直接切关，改为记下待启程目标、由玩家在地图上点选；
 * 返回地图落点（同国、地图去不了、没有启程按钮时 undefined，照常直接启程）。改入参（写 系统.扩展.stageDepartureMap）。
 */
export function stageDepartureMapTarget(save: SaveData | null | undefined, mods: readonly ScenarioMod[] = builtinMods()): CrossCountryTravelTarget | undefined {
  const offer = save ? getStageDepartureOffer(save) : null;
  const next = save && offer ? nextStageMod(save, mods) : undefined;
  const target = next ? crossCountryStageDeparture(save!, next.manifest.id, next.scenario.opening?.locationId) : undefined;
  if (!target) return undefined;
  ((save as any).系统.扩展 ||= {})[MAP_KEY] = { nextStageId: offer!.nextStageId, toId: target.toId, mapTargetId: target.mapTargetId };
  return target;
}

/** 地图出行落账后：有待启程的跨国目标、人已到目标国、本关仍就绪，返回要切入的下一关 id，并清掉待启程标记。改入参。 */
export function stageDepartureArrived(save: SaveData | null | undefined): string | undefined {
  const ext = (save as any)?.系统?.扩展, pending = ext?.[MAP_KEY], runtime = runtimeOf(save);
  if (!save || !pending || !runtime) return undefined;
  if (runtime.nextStageReadyId !== pending.nextStageId) { delete ext[MAP_KEY]; return undefined; }
  if (countryOf(currentLocation(save).canonicalLocationId) !== countryOf(pending.toId)) return undefined;
  delete ext[MAP_KEY];
  return pending.nextStageId;
}
