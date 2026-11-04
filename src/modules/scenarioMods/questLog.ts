/**
 * 任务日志与地图任务标记（设计稿 2026-11-03「任务引导取代主线按钮」；用户 2026-11-03 定）。
 *
 * 功能开关 story.quest.enabled（mod-kit/numbers-progress.json，正式版默认关；8091 内测版读 enabledDev，默认开）：关时本模块所有入口都是空操作，
 * beatProgress／MainGamePanel／侧栏／地图照旧（主线、探索、启程按钮在场）。开时：
 *   - 撤主线、探索、启程按钮（UI 层），本拍动作表仍是唯一结算入口；
 *   - 日志写「目标＋地点＋人物」，地图放标记；作者数据在 mod-kit/quest-log/quests.json，没写的拍回落到拍自带 objective 并记 LCQ-SAV-057；
 *   - 结算前判 completion：where（玩家须在此地或其子地点）→ who（须同场）→ what；前两项不满足不结算、不算 miss（via notThere）；
 *     「同场」按本拍在场名单的同一来源（激活拍的 relatedCharacterIds）认；talk 现有代码认不出「这回合对谁说」，按 intent（手打命中）判；
 *   - 卡住只引导、不代结算：本拍空转满 hintTurns[i] 回合放出第 i+1 级提示，满 approachTurns 回合且作者写了 approach 时 NPC 主动来找
 *     （只把作者写的引子注入下一回合叙事，who 算同场，where 按与 who 同场放宽，记 LCQ-SAV-058）；作者写明到点的拍到点前日志预告「时机将过」；
 *   - 本关收束后日志写下一关目标、地图标下一关开场落点：同国到达落点即切关（questArrivedDeparture），手打启程短语照旧切关；跨国沿用地图点选。
 * 只读存档、不结算；写入只有 系统.扩展.questLog（空转计数、提示级、approach、已完成栏）。
 */
import type { SaveData } from '@/types/game';
import type { ScenarioMod } from './schema';
import { GAME_NUMBERS } from '../sceneModule/numbers';
import { logEvent } from '../diagnostics/log';
import { isDefaultLineQuarantinedStageId } from './canonRail';
import { isQingyuOpeningPlaytestSave } from './qingyuOpeningPlaytest';
import { playerLineLeaksAuthorNotes } from './playerActionPresentation';
import { countryOf } from './travel/mapTravel';
import { currentLocation } from './travel/travelLedger';
import { canonicalLocationId, LOCATION_PARENTS } from './travel/locationIds';
import questData from '../../../mod-kit/quest-log/quests.json';
import locations from '../../../mod-kit/entity-catalog/locations.json';
import { buildDefaultEnabled } from '@/utils/buildDefaults';
import {
  getCurrentStoryEventActions,
  getScenarioFocusEvent,
  getStageDepartureOffer,
  type ScenarioEventActionSelection,
} from './runtime';

export type QuestLine = 'main' | 'country' | 'character';
export interface QuestHint { level: number; text: string }
export interface QuestAliases { matchAny?: string[]; rejectIf?: string[] }
export interface QuestCompletion { where?: string; who?: string; what?: 'intent' | 'arrive' | 'talk' | 'combat' }
export interface QuestApproach { who: string; text: string; moveMarker?: boolean }
export interface QuestBeatSpec {
  line?: QuestLine;
  lineId?: string;
  title?: string;
  objective?: string;
  detail?: string;
  hints?: QuestHint[];
  markers?: string[];
  marker?: 'hidden';
  doneText?: string;
  approach?: QuestApproach;
  hooks?: { character?: unknown[] };
  actions?: Record<string, { completion?: QuestCompletion; aliases?: QuestAliases }>;
}
export interface QuestArrivalSpec extends Omit<QuestBeatSpec, 'actions' | 'approach'> { aliases?: QuestAliases }
type QuestData = { beats?: Record<string, QuestBeatSpec>; stages?: Record<string, { arrival?: QuestArrivalSpec }> };
type MarkerStyle = { color: string; icon: string; label: string };
export type QuestConfig = {
  enabled: boolean;
  enabledDev: boolean;
  objectiveMaxChars: number;
  hintTurns: number[];
  approachTurns: number;
  deadlineWarnTurns: number;
  deadlineWarnText: string;
  showMarkersDefault: boolean;
  markerStyle: Record<QuestLine, MarkerStyle>;
  logUpdatedNotice: string;
  missNotice: string;
  departureObjective: string;
  anywhereText: string;
  missedText: string;
  doneMax: number;
};

export const questConfig = (): QuestConfig => (GAME_NUMBERS.story as unknown as { quest: QuestConfig }).quest;
/** 功能开关（正式版读 enabled、8091 内测版读 enabledDev，buildDefaults.ts）：开时撤主线／探索／启程按钮，改由任务日志与地图标记引导。Demo（清羽开局试玩）档不受影响。 */
export function questGuideEnabled(save?: SaveData | null): boolean {
  return buildDefaultEnabled(questConfig()) && !(save && isQingyuOpeningPlaytestSave(save));
}

const DATA = questData as unknown as QuestData;
const runtimeOf = (save: SaveData | null | undefined): any => (save as any)?.世界?.状态?.剧本模组;
const extOf = (save: SaveData | null | undefined): Record<string, any> | undefined => (save as any)?.系统?.扩展;
const key = (value: unknown): string => String(value || '').normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '');
const stripPrefix = (ref: string | undefined, prefix: string): string => String(ref || '').startsWith(prefix) ? String(ref).slice(prefix.length) : String(ref || '');

export const questBeatSpec = (eventId: string | undefined): QuestBeatSpec | undefined => eventId ? DATA.beats?.[eventId] : undefined;
export const questArrivalSpec = (stageId: string | undefined): QuestArrivalSpec | undefined => stageId ? DATA.stages?.[stageId]?.arrival : undefined;
const completionOf = (selection: Pick<ScenarioEventActionSelection, 'eventId' | 'actionId'>): QuestCompletion | undefined =>
  questBeatSpec(selection.eventId)?.actions?.[selection.actionId]?.completion;

export function locationName(id: string | undefined): string {
  const canonical = canonicalLocationId(id || '');
  const entry = (locations as any).entries.find((e: any) => canonicalLocationId(e.id) === canonical || (e.aliases || []).includes(id));
  return String(entry?.definition?.name || '');
}

/** 人在 here（含其父地点链）算到了 where。 */
export function atLocation(hereId: string | undefined, whereId: string | undefined): boolean {
  const target = canonicalLocationId(whereId || '');
  let here = canonicalLocationId(hereId || '');
  const seen = new Set<string>();
  while (here && !seen.has(here)) {
    if (here === target) return true;
    seen.add(here);
    here = LOCATION_PARENTS[here] || '';
  }
  return false;
}

/** 下一关模组（与切关同口径跳过默认路线的隔离关）。 */
export function nextStageModOf(save: SaveData, mods: readonly ScenarioMod[]): ScenarioMod | undefined {
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

// ───────────── 状态（系统.扩展.questLog） ─────────────
const STATE_KEY = 'questLog';
export interface QuestDoneEntry { key: string; lineId: string; line: QuestLine; title: string; objective: string; result?: string; missed?: boolean }
interface QuestState { stageId: string; beatKey: string; idleTurns: number; hintLevel: number; approached?: boolean; approachPending?: boolean; done: QuestDoneEntry[] }
const stateOf = (save: SaveData | null | undefined): QuestState | undefined => extOf(save)?.[STATE_KEY];

/** 本拍的键：激活的主线拍 id；本关收束待启程时＝departure:<下一关 id>；都没有返回空串。 */
export function questBeatKey(save: SaveData | null | undefined): string {
  const runtime = runtimeOf(save);
  if (!save || !runtime || runtime.gameOver) return '';
  const offer = getStageDepartureOffer(save);
  if (offer) return `departure:${offer.nextStageId}`;
  return String(getScenarioFocusEvent(runtime)?.id || '');
}

const approachedNow = (save: SaveData, eventId: string): QuestApproach | undefined => {
  const state = stateOf(save);
  return state?.approached && state.beatKey === eventId ? questBeatSpec(eventId)?.approach : undefined;
};

/** 同场：who 是激活拍的在场人物（与叙事在场名单同一来源：激活拍 relatedCharacterIds），或已主动来找。 */
function whoPresent(save: SaveData, eventId: string, who: string): boolean {
  if (approachedNow(save, eventId)?.who === who) return true;
  const runtime = runtimeOf(save);
  const active = new Set<string>(runtime?.activeEventIds || []);
  return (runtime?.events || []).some((event: any) => active.has(event?.id) && (event.relatedCharacterIds || []).includes(who));
}

export interface QuestGate { ok: boolean; where?: boolean; who?: boolean }
/**
 * 结算前判 where → who（开关关、罗盘移动动作、作者没写 completion 的动作一律放行）。
 * approach 之后 where 按「与 who 同场」放宽（用户 2026-11-03 定）。
 */
export function questActionGate(save: SaveData | null | undefined, selection: Pick<ScenarioEventActionSelection, 'eventId' | 'actionId'> | undefined): QuestGate {
  if (!save || !selection || !questGuideEnabled(save) || String(selection.actionId).startsWith('travel:')) return { ok: true };
  const completion = completionOf(selection);
  if (!completion) return { ok: true };
  const gate: QuestGate = { ok: true };
  const who = completion.who && completion.who !== 'none' ? stripPrefix(completion.who, 'npc:') : '';
  if (completion.where && completion.where !== 'any') {
    const approach = approachedNow(save, selection.eventId);
    gate.where = atLocation(currentLocation(save).canonicalLocationId, stripPrefix(completion.where, 'place:'))
      || Boolean(approach && (!who || approach.who === who));
  }
  if (who) gate.who = whoPresent(save, selection.eventId, who);
  gate.ok = gate.where !== false && gate.who !== false;
  return gate;
}

// ───────────── 作者短语（开关开时追加） ─────────────
/** 与 runtime 的作者短语同一口径：问句、整句假设不认；否定优先；命中其一。 */
function aliasHit(aliases: QuestAliases | undefined, text: string): boolean {
  const raw = String(text || '').trim();
  if (!aliases || !raw || /[？?]\s*$/u.test(raw) || /^(?:如果|要是|假如|倘若|若是)/u.test(raw)) return false;
  const normalized = key(raw);
  if ((aliases.rejectIf || []).map(key).filter(Boolean).some(phrase => normalized.includes(phrase))) return false;
  return (aliases.matchAny || []).map(key).filter(Boolean).some(phrase => normalized.includes(phrase));
}

/** 本拍作者另写的短语命中（唯一）：返回动作；罗盘移动动作不在此列（人不在本拍地点时 runtime 已把短语换成移动）。 */
export function questAliasSelection(save: SaveData | null | undefined, text: string): ScenarioEventActionSelection | undefined {
  if (!save || !questGuideEnabled(save)) return undefined;
  const hits = getCurrentStoryEventActions(save)
    .filter(selection => !selection.actionId.startsWith('travel:'))
    .filter(selection => aliasHit(questBeatSpec(selection.eventId)?.actions?.[selection.actionId]?.aliases, text));
  return hits.length === 1 ? hits[0] : undefined;
}

/** 手打启程短语（下一关 arrival.aliases）：本关已收束待启程时命中返回 true。 */
export function questDepartureAliasHit(save: SaveData | null | undefined, text: string): boolean {
  if (!save || !questGuideEnabled(save)) return false;
  const offer = getStageDepartureOffer(save);
  return Boolean(offer && aliasHit(questArrivalSpec(offer.nextStageId)?.aliases, text));
}

/** what=arrive 的动作：人已到（where/who 满足）即可结算；返回该动作（没有返回 undefined）。 */
export function questArriveSelection(save: SaveData | null | undefined): ScenarioEventActionSelection | undefined {
  if (!save || !questGuideEnabled(save)) return undefined;
  return getCurrentStoryEventActions(save).find(selection => completionOf(selection)?.what === 'arrive' && questActionGate(save, selection).ok);
}

// ───────────── 日志条目与地图标记 ─────────────
export interface QuestEntry {
  key: string;
  eventId?: string;
  line: QuestLine;
  lineId: string;
  title: string;
  objective: string;
  detail?: string;
  place?: string;
  hints: string[];
  warn?: string;
  authored: boolean;
}
export interface QuestMarker { key: string; line: QuestLine; locationId: string; name: string; color: string; icon: string; label: string; crossCountry?: boolean }

const missingLogged = new Set<string>();
function logMissingObjective(save: SaveData, beatKey: string): void {
  const marker = `${runtimeOf(save)?.modId}|${beatKey}`;
  if (missingLogged.has(marker)) return;
  missingLogged.add(marker);
  logEvent({ code: 'LCQ-SAV-057', echo: false, detail: { beatKey, modId: String(runtimeOf(save)?.modId || '') } });
}

const deadlineTurnsOf = (eventId: string): number | undefined => {
  const value = (GAME_NUMBERS.story as any)?.beatProgress?.deadlineTurns?.[eventId];
  return Number.isInteger(value) && value >= 1 ? value : undefined;
};
/** 作者写明到点的拍：离到点（含收束那一回合）还剩几回合。没写的返回 undefined。 */
export function questDeadlineLeft(save: SaveData, eventId: string): number | undefined {
  const runtime = runtimeOf(save);
  const event = (runtime?.events || []).find((item: any) => item?.id === eventId);
  const turns = deadlineTurnsOf(eventId);
  if (turns === undefined || !event?.offscreenResolution) return undefined;
  return Math.max(0, turns - (Number(runtime.stallTurns) || 0));
}

/** 第 i 级提示的回合数；作者写明到点的拍到点回合数不大于某级回合数时那一级不触发（undefined）。 */
function hintThresholds(eventId: string | undefined): Array<number | undefined> {
  const deadline = eventId ? deadlineTurnsOf(eventId) : undefined;
  return (questConfig().hintTurns || []).map(turns => deadline !== undefined && deadline <= turns ? undefined : turns);
}

const styleOf = (line: QuestLine | undefined): MarkerStyle => questConfig().markerStyle[line || 'main'] || questConfig().markerStyle.main;
const releasedHints = (hints: QuestHint[] | undefined, level: number): string[] =>
  (hints || []).filter(hint => hint.level <= level).sort((a, b) => a.level - b.level).map(hint => hint.text);

function departureEntry(save: SaveData, mods: readonly ScenarioMod[], beatKey: string, level: number): QuestEntry {
  const offer = getStageDepartureOffer(save)!;
  const next = nextStageModOf(save, mods);
  const spec = questArrivalSpec(offer.nextStageId) || (next ? questArrivalSpec(next.manifest.id) : undefined);
  const place = locationName(next?.scenario.opening?.locationId);
  if (!spec?.objective) logMissingObjective(save, beatKey);
  return {
    key: beatKey,
    line: spec?.line || 'main',
    lineId: spec?.lineId || 'lcq.main',
    title: spec?.title || styleOf(spec?.line).label,
    objective: spec?.objective || questConfig().departureObjective.replace('{place}', place || offer.label),
    detail: spec?.detail,
    place: place || undefined,
    hints: releasedHints(spec?.hints, level),
    authored: Boolean(spec?.objective),
  };
}

function beatEntry(save: SaveData, event: any, level: number, focus: boolean): QuestEntry | undefined {
  const spec = questBeatSpec(event.id);
  if (!spec && !focus) return undefined;
  if (!spec?.objective) logMissingObjective(save, event.id);
  const where = Object.values(spec?.actions || {}).map(action => action.completion?.where).find(Boolean);
  const placeId = where && where !== 'any' ? stripPrefix(where, 'place:') : event.locationId;
  const left = questDeadlineLeft(save, event.id);
  return {
    key: event.id,
    eventId: event.id,
    line: spec?.line || 'main',
    lineId: spec?.lineId || 'lcq.main',
    title: spec?.title || styleOf(spec?.line).label,
    objective: spec?.objective || String(event.objective || ''),
    detail: spec?.detail,
    place: where === 'any' ? questConfig().anywhereText : locationName(placeId) || undefined,
    hints: focus ? releasedHints(spec?.hints, level) : [],
    warn: left !== undefined && left <= questConfig().deadlineWarnTurns ? questConfig().deadlineWarnText : undefined,
    authored: Boolean(spec?.objective),
  };
}

/** 任务日志：当前（本拍＋其余激活拍里作者写了条目的）与已完成栏。开关关、没有剧本时返回空。 */
export function questLogView(save: SaveData | null | undefined, mods: readonly ScenarioMod[] = []): { current: QuestEntry[]; done: QuestDoneEntry[] } {
  const runtime = runtimeOf(save);
  if (!save || !runtime || !questGuideEnabled(save)) return { current: [], done: [] };
  const beatKey = questBeatKey(save);
  const state = stateOf(save);
  const level = state?.beatKey === beatKey ? Number(state.hintLevel) || 0 : 0;
  const current: QuestEntry[] = [];
  if (beatKey.startsWith('departure:')) current.push(departureEntry(save, mods, beatKey, level));
  else if (beatKey) {
    const focus = getScenarioFocusEvent(runtime) as any;
    const entry = focus ? beatEntry(save, focus, level, true) : undefined;
    if (entry) current.push(entry);
    for (const id of runtime.activeEventIds || []) {
      if (id === focus?.id) continue;
      const event = (runtime.events || []).find((item: any) => item?.id === id);
      const other = event ? beatEntry(save, event, 0, false) : undefined;
      if (other) current.push(other);
    }
  }
  return { current, done: [...(state?.done || [])].reverse() };
}

/** 地图任务标记：只取当前激活拍的 completion.where／markers（或拍的 locationId）与待启程落点，不读模型叙事。 */
export function questMarkers(save: SaveData | null | undefined, mods: readonly ScenarioMod[] = []): QuestMarker[] {
  const runtime = runtimeOf(save);
  if (!save || !runtime || !questGuideEnabled(save)) return [];
  const beatKey = questBeatKey(save);
  const out: QuestMarker[] = [];
  const push = (markerKey: string, line: QuestLine | undefined, locationId: string | undefined, crossCountry = false) => {
    const id = canonicalLocationId(locationId || '');
    if (!id || out.some(marker => marker.key === markerKey && marker.locationId === id)) return;
    const style = styleOf(line);
    out.push({ key: markerKey, line: line || 'main', locationId: id, name: locationName(id), color: style.color, icon: style.icon, label: style.label, ...(crossCountry ? { crossCountry } : {}) });
  };
  if (beatKey.startsWith('departure:')) {
    const next = nextStageModOf(save, mods);
    const spec = questArrivalSpec(next?.manifest.id || stripPrefix(beatKey, 'departure:'));
    if (spec?.marker === 'hidden') return out;
    const pending = extOf(save)?.stageDepartureMap;
    const to = next?.scenario.opening?.locationId;
    const here = currentLocation(save).canonicalLocationId;
    const cross = Boolean(to && countryOf(to) && countryOf(here) && countryOf(to) !== countryOf(here));
    push(beatKey, spec?.line, cross && pending?.mapTargetId ? pending.mapTargetId : to, cross);
    return out;
  }
  for (const id of runtime.activeEventIds || []) {
    const event = (runtime.events || []).find((item: any) => item?.id === id);
    const spec = questBeatSpec(id);
    if (!event || (!spec && id !== getScenarioFocusEvent(runtime)?.id) || spec?.marker === 'hidden') continue;
    const wheres = Object.values(spec?.actions || {}).map(action => action.completion?.where).filter(Boolean) as string[];
    if (wheres.includes('any')) continue;
    const refs = spec?.markers?.length ? spec.markers : wheres.length ? wheres.map(where => `place:${stripPrefix(where, 'place:')}`) : [];
    if (!refs.length && event.locationId) push(id, spec?.line, event.locationId);
    for (const ref of refs) {
      if (ref.startsWith('npc:')) {
        // 人物位置以拍的 locationId 为准（模型叙事写的位置不算，设计稿风险 3）；approach 且 moveMarker 时跟到玩家所在地。
        const approach = approachedNow(save, id);
        push(id, spec?.line, approach?.moveMarker && approach.who === stripPrefix(ref, 'npc:') ? currentLocation(save).canonicalLocationId : event.locationId);
      } else push(id, spec?.line, stripPrefix(ref, 'place:'));
    }
  }
  return out;
}

// ───────────── 回合收尾：空转分级、approach、已完成栏 ─────────────
function doneEntryOf(save: SaveData, beatKey: string): QuestDoneEntry | undefined {
  const runtime = runtimeOf(save);
  const missed = (runtime?.offscreenResolvedEventIds || []).includes(beatKey);
  if (!beatKey || beatKey.startsWith('departure:') || !(missed || (runtime?.completedEventIds || []).includes(beatKey))) return undefined;
  const event = (runtime.events || []).find((item: any) => item?.id === beatKey);
  const spec = questBeatSpec(beatKey);
  const success = event?.playerCompletionContract?.actions?.map((action: any) => action?.outcomeText?.success).find((text: unknown) => typeof text === 'string' && text && !playerLineLeaksAuthorNotes(text));
  const result = missed ? questConfig().missedText : spec?.doneText || success || undefined;
  return {
    key: beatKey,
    line: spec?.line || 'main',
    lineId: spec?.lineId || 'lcq.main',
    title: spec?.title || styleOf(spec?.line).label,
    objective: spec?.objective || String(event?.objective || ''),
    ...(result ? { result } : {}),
    ...(missed ? { missed } : {}),
  };
}

export interface QuestTurnNote { notice?: string; approach?: string }
/**
 * 每个叙事回合收尾调用一次（开关开时取代 noteBeatActionIdleTurn／noteStageDepartureIdleTurn）：
 * 本拍没换就记一回合空转（首次看到记 0）；满 hintTurns[i] 放出第 i+1 级提示并返回 logUpdatedNotice；
 * 满 approachTurns 且作者写了 approach：记下待注入的引子（下一回合 takeQuestApproachLead 取走）并记 LCQ-SAV-058。
 * 拍换了：上一拍若已完成就移进已完成栏（最多 doneMax 条），计数作废。只提示、不结算。改入参（系统.扩展.questLog）。
 */
export function noteQuestIdleTurn(save: SaveData | null | undefined): QuestTurnNote {
  const ext = extOf(save);
  if (!save || !ext || !questGuideEnabled(save)) return {};
  const cfg = questConfig();
  const stageId = String(runtimeOf(save)?.modId || '');
  const beatKey = questBeatKey(save);
  const prev = stateOf(save);
  const done = [...(prev?.done || [])];
  if (prev && prev.beatKey !== beatKey) {
    const entry = doneEntryOf(save, prev.beatKey);
    if (entry && !done.some(item => item.key === entry.key)) done.push(entry);
  }
  while (done.length > Math.max(1, Number(cfg.doneMax) || 1)) done.shift();
  const same = prev && prev.stageId === stageId && prev.beatKey === beatKey;
  const idleTurns = same ? (Number(prev!.idleTurns) || 0) + 1 : 0;
  const eventId = beatKey.startsWith('departure:') ? undefined : beatKey;
  const thresholds = hintThresholds(eventId);
  const level = thresholds.filter(turns => turns !== undefined && turns > 0 && idleTurns >= turns).length;
  const prevLevel = same ? Number(prev!.hintLevel) || 0 : 0;
  const state: QuestState = { stageId, beatKey, idleTurns, hintLevel: Math.max(level, prevLevel), done, ...(same && prev!.approached ? { approached: true, approachPending: prev!.approachPending } : {}) };
  const note: QuestTurnNote = {};
  const hints = eventId ? questBeatSpec(eventId)?.hints : questArrivalSpec(stripPrefix(beatKey, 'departure:'))?.hints;
  if (beatKey && state.hintLevel > prevLevel && releasedHints(hints, state.hintLevel).length > releasedHints(hints, prevLevel).length) note.notice = cfg.logUpdatedNotice;
  const approach = eventId ? questBeatSpec(eventId)?.approach : undefined;
  const deadline = eventId ? deadlineTurnsOf(eventId) : undefined;
  const approachTurns = Number(cfg.approachTurns) || 0;
  if (approach && approachTurns > 0 && !state.approached && idleTurns >= approachTurns && !(deadline !== undefined && deadline <= approachTurns)) {
    state.approached = true;
    state.approachPending = true;
    note.approach = approach.text;
    note.notice ||= cfg.logUpdatedNotice;
    logEvent({ code: 'LCQ-SAV-058', echo: false, detail: { beatId: eventId, who: approach.who, idleTurns, modId: stageId } });
  }
  ext[STATE_KEY] = state;
  return note;
}

/** 取走待注入的 approach 引子（作者原文），只给下一回合叙事用一次；改入参。没有返回 undefined。 */
export function takeQuestApproachLead(save: SaveData | null | undefined): string | undefined {
  const state = stateOf(save);
  if (!save || !state?.approachPending || !questGuideEnabled(save) || state.beatKey !== questBeatKey(save)) return undefined;
  state.approachPending = false;
  return questBeatSpec(state.beatKey)?.approach?.text;
}

/**
 * 同国启程「到达即切」：本关已就绪、下一关开场落点与当前同国，人这次从别处到了落点（before 不在、after 在），返回下一关 id。
 * 落点就是当前所在地时到达无从触发，靠手打启程短语（用户 2026-11-03 定 Q6=C）。跨国沿用 stageDepartureArrived。
 */
export function questArrivedDeparture(before: SaveData | null | undefined, after: SaveData | null | undefined, mods: readonly ScenarioMod[] = []): string | undefined {
  if (!before || !after || !questGuideEnabled(after) || runtimeOf(after)?.gameOver) return undefined;
  const offer = getStageDepartureOffer(after);
  const next = offer ? nextStageModOf(after, mods) : undefined;
  const to = next?.scenario.opening?.locationId;
  if (!offer || !to) return undefined;
  const from = currentLocation(before).canonicalLocationId, here = currentLocation(after).canonicalLocationId;
  if (countryOf(here) && countryOf(to) && countryOf(here) !== countryOf(to)) return undefined;
  return atLocation(here, to) && !atLocation(from, to) ? offer.nextStageId : undefined;
}

/** 作者数据自检（测试与 content 校验用）：目标字数、提示级、approach、hidden 须带 hints、短语条数。返回问题列表。 */
export function validateQuestData(data: QuestData = DATA): string[] {
  const cfg = questConfig(), problems: string[] = [];
  const checkAliases = (where: string, aliases?: QuestAliases) => {
    for (const field of ['matchAny', 'rejectIf'] as const) {
      const list = aliases?.[field];
      if (list && (list.length < 1 || list.length > 8)) problems.push(`${where}.${field} 须 1–8 条`);
    }
  };
  const checkSpec = (where: string, spec: QuestBeatSpec | QuestArrivalSpec) => {
    if (!spec.objective) problems.push(`${where} 缺 objective`);
    else if ([...spec.objective].length > cfg.objectiveMaxChars) problems.push(`${where}.objective 超过 ${cfg.objectiveMaxChars} 字`);
    if (spec.line && !['main', 'country', 'character'].includes(spec.line)) problems.push(`${where}.line 非法`);
    if (spec.marker === 'hidden' && !spec.hints?.length) problems.push(`${where} marker:hidden 须写 hints`);
    for (const hint of spec.hints || []) if (!Number.isInteger(hint.level) || hint.level < 1 || !hint.text) problems.push(`${where}.hints 级别或文字非法`);
    if (/行动\s*·|lcq\.event\./u.test(spec.objective || '')) problems.push(`${where}.objective 含按钮前缀或事件 id`);
  };
  for (const [id, spec] of Object.entries(data.beats || {})) {
    checkSpec(id, spec);
    if (spec.approach && (!spec.approach.who || !spec.approach.text)) problems.push(`${id}.approach 须写 who 与 text`);
    for (const [actionId, action] of Object.entries(spec.actions || {})) {
      const what = action.completion?.what;
      if (what && !['intent', 'arrive', 'talk', 'combat'].includes(what)) problems.push(`${id}.${actionId}.completion.what 非法`);
      const where = action.completion?.where;
      if (where && where !== 'any' && !locationName(stripPrefix(where, 'place:'))) problems.push(`${id}.${actionId}.completion.where 不是已登记地点`);
      checkAliases(`${id}.${actionId}.aliases`, action.aliases);
    }
  }
  for (const [stageId, stage] of Object.entries(data.stages || {})) {
    if (!stage.arrival) continue;
    checkSpec(`${stageId}.arrival`, stage.arrival);
    checkAliases(`${stageId}.arrival.aliases`, stage.arrival.aliases);
  }
  return problems;
}
