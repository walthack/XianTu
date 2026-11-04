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
 * 本拍主线按钮空转 actionIdleTurns 回合同样只提示（noteBeatActionIdleTurn）；
 * 下一关在别国时启程改为打开地图点选（stageDepartureMapTarget／stageDepartureArrived）。
 * runtime.ts 冻结：它在「关已就绪未切关」时把 stallTurns 清零，所以启程空转计数外置在 系统.扩展.stageDepartureIdle。
 *
 * 任务引导（story.quest.enabled，默认关；questLog.ts）：开时结算前先判 completion.where/who（不满足不结算、记 notThere、不算 miss），
 * 另认作者在 mod-kit/quest-log/quests.json 追加的短语与启程短语、what=arrive 的到达即成；miss 提示只说「见任务日志」不列动作；
 * 两种空转提示改由 questLog.noteQuestIdleTurn 分级放出。开关关时以下各函数与原来逐字同一行为。
 */
import type { SaveData } from '@/types/game';
import type { ScenarioMod } from './schema';
import { GAME_NUMBERS } from '../sceneModule/numbers';
import { logEvent } from '../diagnostics/log';
import { isQingyuOpeningPlaytestSave } from './qingyuOpeningPlaytest';
import { countryOf, crossCountryStageDeparture, type CrossCountryTravelTarget } from './travel/mapTravel';
import { currentLocation } from './travel/travelLedger';
import { nextStageModOf, questActionGate, questBeatSpec, questAliasSelection, questArriveSelection, questConfig, questDepartureAliasHit, questGuideEnabled } from './questLog';
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
  actionIdleTurns: number;
  actionIdleNotice: string;
  missNotice: string;
};
const config = (): BeatConfig => (GAME_NUMBERS.story as unknown as { beatProgress: BeatConfig }).beatProgress;
const runtimeOf = (save: SaveData | null | undefined): any => (save as any)?.世界?.状态?.剧本模组;
export const beatLineKey = (value: unknown): string => String(value || '').normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '');

export type BeatAction =
  | { kind: 'event'; selection: ScenarioEventActionSelection }
  | { kind: 'departure'; offer: ScenarioStageDepartureOffer };
/**
 * 输入方式：button 点按钮；exact 手打＝原句／标签；alias 命中作者短语；deadline 作者写明的到点；other 本回合走了别的引擎（自由行动、开放世界等）；miss 都没对上；none 本拍没有可做的动作。
 * 任务引导开时另有：arrive 到达即成（completion.what=arrive）；talk 预留（现按 intent 判，不产生）；notThere 命中了动作但人不在 where／who 不同场（不结算、不算 miss）；
 * intent 关键拍按字没对上、拍子判定小请求判成（设计稿 2026-11-04「任务模式拍子按意图结算」第九节，naturalIntentRouter.resolveBeatJudge）。
 */
export type BeatVia = 'button' | 'exact' | 'alias' | 'deadline' | 'other' | 'miss' | 'none' | 'arrive' | 'talk' | 'notThere' | 'intent';
export interface BeatResolution { via: 'exact' | 'alias' | 'arrive'; action: BeatAction }

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

const actionLines = (save: SaveData, action: BeatAction): unknown[] => action.kind === 'departure'
  ? [action.offer.label]
  : [action.selection.playerLine, action.selection.actionText, action.selection.label, ...questLogLines(save, action.selection)];
/**
 * 任务引导开时比对表另加：作者原始 label（不带「行动 · 对象 ·」装饰）与任务日志里的目标（questLog.beatEntry 同一来源）。
 * 设计稿 2026-11-04 第三节推测 1、D7：玩家照日志打出目标原文就该过。开关关时不加（与原来逐字同一行为）。致命选项不加目标。
 */
function questLogLines(save: SaveData, selection: ScenarioEventActionSelection): unknown[] {
  if (!questGuideEnabled(save) || selection.actionId.startsWith('travel:')) return [];
  const event = (runtimeOf(save)?.events || []).find((item: any) => item?.id === selection.eventId);
  const authored = event?.playerCompletionContract?.actions?.find((item: any) => item?.id === selection.actionId);
  if (!authored) return [];
  return [authored.label, questBeatSpec(selection.eventId)?.objective || event?.objective];
}

/**
 * 手打文本 → 本拍动作（2.2 第 2、3 条）：与某个动作的原句／按钮标签／启程文字去标点空白后相等且唯一＝点了它；
 * 否则按作者短语（aliases，否定优先、歧义不认）匹配主线拍。都不中返回 undefined（不推进）。不改入参。
 */
export function resolveBeatText(save: SaveData | null | undefined, text: string): BeatResolution | undefined {
  const hit = resolveBeatTextUngated(save, text);
  return hit && gateOk(save, hit) ? hit : questGuideEnabled(save) ? questExtraResolution(save!) : undefined;
}

function resolveBeatTextUngated(save: SaveData | null | undefined, text: string): BeatResolution | undefined {
  if (!save) return undefined;
  const key = beatLineKey(text);
  if (key) {
    const hits = beatActionTable(save).actions.filter(action => actionLines(save, action).some(line => beatLineKey(line) === key));
    if (hits.length === 1) return { via: 'exact', action: hits[0] };
  }
  const alias = resolveStoryEventActionFromPlayerText(save, text) || inquiryAlias(save, text);
  if (alias) return { via: 'alias', action: { kind: 'event', selection: alias } };
  if (!questGuideEnabled(save)) return undefined;
  // 任务引导开：作者在 quests.json 另写的短语、下一关启程短语（开关关时不读）。
  const extra = questAliasSelection(save, text);
  if (extra) return { via: 'alias', action: { kind: 'event', selection: extra } };
  const offer = questDepartureAliasHit(save, text) ? getStageDepartureOffer(save) : null;
  return offer ? { via: 'alias', action: { kind: 'departure', offer } } : undefined;
}

const gateOk = (save: SaveData | null | undefined, hit: BeatResolution): boolean =>
  hit.action.kind !== 'event' || questActionGate(save, hit.action.selection).ok;
/** what=arrive 的动作人已到即成：手打没对上（或对上了别的动作但人不在）时也结算它。 */
function questExtraResolution(save: SaveData): BeatResolution | undefined {
  const arrive = questArriveSelection(save);
  return arrive ? { via: 'arrive', action: { kind: 'event', selection: arrive } } : undefined;
}

/** 任务引导开时：这句话命中了本拍动作，但人不在 where／who 不同场（记 notThere，不结算、不算 miss）。开关关恒为 false。 */
export function beatTextNotThere(save: SaveData | null | undefined, text: string): boolean {
  if (!questGuideEnabled(save)) return false;
  const hit = resolveBeatTextUngated(save, text);
  return Boolean(hit && !gateOk(save, hit) && !questExtraResolution(save!));
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
  // 任务引导开：不列动作，只说目标见任务日志（用户 2026-11-03 定 Q2=A）。
  if (questGuideEnabled(save)) return beatActionTable(save).actions.length ? questConfig().missNotice : undefined;
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
  if (questGuideEnabled(save) && hit?.eventId && hit.actionId) {
    const gate = questActionGate(save, { eventId: hit.eventId, actionId: hit.actionId });
    Object.assign(detail, { where: gate.where ?? null, who: gate.who ?? null });
  }
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

/**
 * 发送事务内预备这一拍的到点结算。旧 runtime 在停滞 +1 之前检查期限，
 * 因此配置 N 原本要第 N+1 次空转才收束。只对显式配置且已有作者场外合同的活跃拍
 * 使用既有 forcedWorldEventIds 入口；引擎仍先检查该拍是否已被玩家动作结算。
 * 不改全局停滞数；失败回合随发送前快照回滚。pressure/timeline 自有时钟不接管。
 */
export function prepareBeatDeadlineTurn(save: SaveData): boolean {
  const runtime = runtimeOf(save);
  if (!runtime || runtime.gameOver || (runtime.steeringCooldown || 0) > 0) return false;
  let changed = false;
  for (const event of runtime.events || []) {
    const turns = beatDeadlineTurns(event.id);
    if (turns === undefined || !event.offscreenResolution || event.pressure || event.timeline?.deadlineTurns !== undefined
      || !runtime.activeEventIds?.includes(event.id) || (Number(runtime.stallTurns) || 0) + 1 < turns) continue;
    const forced: string[] = runtime.forcedWorldEventIds ||= [];
    if (!forced.includes(event.id)) { forced.push(event.id); changed = true; }
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
  if (!offer || !limit || questGuideEnabled(save) || isQingyuOpeningPlaytestSave(save) || runtimeOf(save)?.gameOver) {
    delete ext[IDLE_KEY];
    return undefined;
  }
  const prev = ext[IDLE_KEY];
  const turns = prev?.stageId === stageId && prev?.nextStageId === offer.nextStageId ? (Number(prev.turns) || 0) + 1 : 0;
  ext[IDLE_KEY] = { stageId, nextStageId: offer.nextStageId, turns: turns >= limit ? 0 : turns };
  return turns >= limit ? config().departureIdleNotice.replace('{label}', offer.label) : undefined;
}

const ACTION_IDLE_KEY = 'beatActionIdle';
/**
 * 每个叙事回合收尾时调用一次（与启程空转同一口径，REPORT-8091-98199e80 P2：唐线「行动 · 前往宣平坊宅院赴宴」连续 4 回合不点没有任何提示）：
 * 本拍主线动作按钮在场、本拍又没推进，就记一回合空转（首次看到记 0），满 actionIdleTurns 回合返回一句提示（{label}＝第一个按钮的文字）并重新计数——
 * 只提示，不代玩家结算、不自动出发。启程按钮在场时由 noteStageDepartureIdleTurn 管，这里不重复提示；拍换了（推进了）计数作废。
 */
export function noteBeatActionIdleTurn(save: SaveData | null | undefined): string | undefined {
  const ext = (save as any)?.系统?.扩展;
  if (!save || !ext) return undefined;
  const actions = getCurrentStoryEventActions(save);
  const limit = Number(config().actionIdleTurns) || 0;
  if (!actions.length || !limit || questGuideEnabled(save) || getStageDepartureOffer(save) || isQingyuOpeningPlaytestSave(save) || runtimeOf(save)?.gameOver) {
    delete ext[ACTION_IDLE_KEY];
    return undefined;
  }
  const stageId = String(runtimeOf(save)?.modId || ''), eventId = actions[0].eventId;
  const prev = ext[ACTION_IDLE_KEY];
  const turns = prev?.stageId === stageId && prev?.eventId === eventId ? (Number(prev.turns) || 0) + 1 : 0;
  ext[ACTION_IDLE_KEY] = { stageId, eventId, turns: turns >= limit ? 0 : turns };
  return turns >= limit ? config().actionIdleNotice.replace('{label}', actions[0].label) : undefined;
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
  const next = save && offer ? nextStageModOf(save, mods) : undefined;
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
