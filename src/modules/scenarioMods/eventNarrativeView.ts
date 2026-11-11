import { projectNamingText } from './ledger/naming';
import type { ScenarioCondition, ScenarioModEvent } from './schema';
import type { ScenarioDivergence } from './divergenceLedger';
import { locationWithin } from './travel/locationIds';
import { resolveFixedQuestObjective } from './fixedQuestObjectives';
import { evaluateLedgerCondition } from './ledgerConditions';
import { computePresentNames } from './presence';
import { CONTENT_PACKS, packText } from '../contentPacks';
import { stageMetaChapterTitle, stageMetaEvent, stageMetaRouteChapterTitle, stageMetaUiChapterEventIds, stageMetaUiChapterGroups, type StageMeta, type StageMetaCompatNarrativeVariant } from '../contentPacks/stageMeta';

// 旧存档把事件快照直接落在 runtime.events 中。它们不会随着内置关卡
// 数据升级而自动补齐 narrativeVariants，因此这里保留极小的兼容层。
// 对列入兼容层的稳定事件，代码侧覆盖旧快照中的过时 variant；否则老存档
// 即使升级应用，仍会继续使用当初写进 runtime.events 的旧完成合同。
// F0b（2026-11-11）：本表与内容包 stageMeta 事件的 compatNarrativeVariants 同形（按事件 id，TS 表有就不看包，编译期禁止两边都有）；
// 带 priority: 'before-event-variants' 的条目先于事件自带的 narrativeVariants 生效，只改写文案字段、不参与 narrativeVariantReplacesCanonRail。
// B6 起数据全在塞外、昭南、晋包 stageMeta，TS 表留空。
type CompatNarrativeVariant = Omit<StageMetaCompatNarrativeVariant, 'when' | 'replacesCanonRail'> & { when: ScenarioCondition[]; replacesCanonRail?: boolean };
export const TS_COMPAT_NARRATIVE_VARIANTS: Readonly<Record<string, CompatNarrativeVariant[]>> = {};

function compatNarrativeVariants(eventId: string): readonly CompatNarrativeVariant[] | undefined {
  return Object.prototype.hasOwnProperty.call(TS_COMPAT_NARRATIVE_VARIANTS, eventId)
    ? TS_COMPAT_NARRATIVE_VARIANTS[eventId]
    : stageMetaEvent(CONTENT_PACKS.stageMeta || [], eventId)?.compatNarrativeVariants as CompatNarrativeVariant[] | undefined;
}
/** 兼容层里只填补老存档缺失 variants 的那部分（不含 before-event-variants）。 */
function fillInCompatVariants(eventId: string): CompatNarrativeVariant[] | undefined {
  return compatNarrativeVariants(eventId)?.filter(item => !item.priority);
}

function flagValue(flags: Record<string, unknown>, path: string): unknown {
  if (!path.startsWith('flags.')) return undefined;
  const key = path.slice('flags.'.length);
  let cur: unknown = flags;
  for (const part of key.split('.')) {
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) { cur = undefined; break; }
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur === undefined ? flags[key] : cur;
}

/** 账本路径（identity./done./line./acq./knows./party.）先交 ledgerConditions；不传 runtime 时不命中。 */
function matches(condition: ScenarioCondition, flags: Record<string, unknown>, runtime?: unknown): boolean {
  const ledger = evaluateLedgerCondition(condition, runtime);
  if (ledger !== undefined) return ledger;
  const actual = flagValue(flags, condition.path);
  if (condition.operator === 'eq') return actual === condition.value;
  if (condition.operator === 'neq') return actual !== condition.value;
  return false;
}

function relatedDivergence(
  event: ScenarioModEvent,
  divergences: ScenarioDivergence[] | undefined,
): ScenarioDivergence | undefined {
  const related = new Set(event.relatedCharacterIds || []);
  if (!related.size || !Array.isArray(divergences)) return undefined;
  return [...divergences].reverse().find(item =>
    item.revealed !== false && item.characterStates.some(state => related.has(state.characterId)),
  );
}

function projectFromDivergence(event: ScenarioModEvent, divergence: ScenarioDivergence): ScenarioModEvent {
  const states = divergence.characterStates
    .filter(state => (event.relatedCharacterIds || []).includes(state.characterId))
    .map(state => `${state.characterId}=${state.status}`)
    .join('、');
  const consequence = `本世界线既有事实：${divergence.worldDelta}${states ? `（${states}）` : ''}`;
  return {
    ...event,
    name: `${event.name}·世界线承接`,
    description: `${consequence}。原事件只能作为因果背景，必须改写为这一变化造成的新局面。`,
    axisBeat: `${consequence}。让仍在场的人物据此采取具体行动，不得复写已失效的原著结果。`,
    objective: `承接“${divergence.worldDelta}”造成的后果`,
  };
}

/** 返回当前存档分歧下可见的事件文案；事件 id / 完成条件不变，避免把追认误当重演。 */
function resolveScenarioEventNarrativeRaw(
  event: ScenarioModEvent,
  flags: Record<string, unknown>,
  divergences?: ScenarioDivergence[],
  runtime?: unknown,
): ScenarioModEvent {
  const first = compatNarrativeVariants(event.id)?.find(item => item.priority === 'before-event-variants'
    && item.when.every(condition => matches(condition, flags, runtime)));
  if (first) {
    const { when, priority, ...rewrite } = first;
    return { ...event, ...rewrite, ...(rewrite.relatedFactionIds ? { relatedFactionIds: [...rewrite.relatedFactionIds] } : {}) };
  }
  const compatibilityVariants = fillInCompatVariants(event.id);
  // 新版内置关卡的数据是权威；兼容层只填补老存档快照缺失的 variants，不能反向覆盖新数据。
  const variants = event.narrativeVariants?.length ? event.narrativeVariants : compatibilityVariants;
  const variant = variants?.find(item => item.when.every(condition => matches(condition, flags, runtime)));
  if (variant) return { ...event, ...variant };
  const divergence = relatedDivergence(event, divergences);
  if (divergence) return projectFromDivergence(event, divergence);
  const objective = resolveFixedQuestObjective(event);
  return objective && objective !== event.objective ? { ...event, objective } : event;
}

/** 页面与叙事共享称呼出口；投影副本，不改合同哈希或存档里的事件真值。 */
export function resolveScenarioEventNarrative(event: ScenarioModEvent, flags: Record<string, unknown>, divergences?: ScenarioDivergence[], runtime?: Parameters<typeof projectNamingText>[1]): ScenarioModEvent {
  const view = resolveScenarioEventNarrativeRaw(event, flags, divergences, runtime);
  if (!runtime) return view;
  return { ...view, name: projectNamingText(view.name, runtime), description: projectNamingText(view.description || '', runtime, 'narration'), objective: projectNamingText(view.objective || '', runtime), axisBeat: projectNamingText(view.axisBeat || '', runtime, 'narration') };
}

type QuestCompassRuntime = {
  opening?: { playerCharacterId?: string };
  canon?: {
    characters?: Array<{ id?: string; name?: string }>;
    locations?: Array<{ id?: string; name?: string }>;
  };
  eventActionStates?: Record<string, { preparations?: string[] }>;
} | null | undefined;

/** 汉宫「宫变之夜」章的拍：汉线 S4 起取自汉包 stageMeta（packs/han/stage-meta.json 里 uiChapterId 为该章的事件，文件顺序）；导出名保留（测试钉住）。 */
export const HAN_PALACE_NIGHT_EVENT_IDS: ReadonlySet<string> = stageMetaUiChapterEventIds(CONTENT_PACKS.stageMeta || [], 'lyl.han_palace_endgame', 'lyl.chapter.han_palace_endgame_night');

/** 洛都「洛都风云」章的拍：同上，取自汉包 stageMeta；导出名保留（测试钉住）。 */
export const LUOYANG_COURT_EVENT_IDS: ReadonlySet<string> = stageMetaUiChapterEventIds(CONTENT_PACKS.stageMeta || [], 'lyl.luoyang_cloud_secret', 'lyl.chapter.luoyang_cloud_secret_court');

/** 长安初定「留仙坪」章的承重拍：唐线 S4 起取自唐包 stageMeta（packs/tang/stage-meta.json 里 uiChapterId 为该章的事件，文件顺序）；导出名保留（测试钉住）。同章另挂的两条非 rail 拍开放在灞桥段，不在此列。 */
export const LIUXIANPING_EVENT_IDS: ReadonlySet<string> = stageMetaUiChapterEventIds(CONTENT_PACKS.stageMeta || [], 'lyg.changgan_begins', 'lyg.chapter.changgan_begins_liuxianping');

/** 长安插曲首章（rail 章）以外三章的拍，按章名分：同上，取自唐包 stageMeta（按章首次出现的顺序分组）；导出名保留（测试钉住）。 */
export const CHANGGAN_INTERLUDE_CHAPTER_EVENT_IDS: ReadonlyArray<readonly [string, ReadonlySet<string>]> = stageMetaUiChapterGroups(CONTENT_PACKS.stageMeta || [], 'lyg.changgan_interlude');

/**
 * 地图入口口信拍（mapEntries[].eventId，如咸阳传闻）被注入到出发关里演；章名取它所属目标关的章，
 * 不随出发关的拍落进「抵达长安灞桥」之类的章（REPORT-8091-da90cb13 P2-2）。
 */
function mapEntryHookChapterTitle(packs: ChapterTitlePacks, modId: string | undefined, eventId: string): string | undefined {
  const entry = (packs.mapEntries || []).find(e => e.eventId === eventId && e.stageId !== modId);
  const stage = entry && packs.stages.find(s => s.manifest.id === entry.stageId);
  return (stage?.scenario.chapters || []).find(c => (c.eventIds || []).includes(eventId))?.title || undefined;
}

/**
 * 内容包关的事件可写 presentation.uiChapterId：界面标那一章的标题，不改挂章（整关停在 rail 章上时，后几幕的拍照幕标）。
 * 只按 modId + eventId 查 catalog，不读存档里烘焙的事件或章对象（旧档烘焙的事件没有这个字段）。
 */
function packUiChapterTitle(packs: ChapterTitlePacks, modId: string | undefined, eventId: string): string | undefined {
  const stage = packs.stages.find(s => s.manifest.id === modId);
  const uiChapterId = stage?.scenario.events?.find(e => e.id === eventId)?.presentation?.uiChapterId;
  return uiChapterId ? stage?.scenario.chapters?.find(c => c.id === uiChapterId)?.title || undefined : undefined;
}

/** storyChapterTitle 读的 catalog 段（测试与编译器校验可传合成数据）。 */
export type ChapterTitlePacks = Pick<typeof CONTENT_PACKS, 'mapEntries' | 'stages' | 'stageMeta'>;

export function storyChapterTitle(modId: string | undefined, eventId: string | undefined, fallback: string): string {
  return storyChapterTitleIn(CONTENT_PACKS, modId, eventId, fallback);
}

export function storyChapterTitleIn(packs: ChapterTitlePacks, modId: string | undefined, eventId: string | undefined, fallback: string): string {
  const hookTitle = eventId ? mapEntryHookChapterTitle(packs, modId, eventId) : undefined;
  if (hookTitle) return hookTitle;
  // 内容包关：事件写了 presentation.uiChapterId 的标那一章；没写的照下面回退
  const packTitle = eventId ? packUiChapterTitle(packs, modId, eventId) : undefined;
  if (packTitle) return packTitle;
  // 内容包 stageMeta（包内关或内置关）：事件的 uiChapterId，其次该关 defaultUiChapterId；排在地图入口口信拍与包内关章名之后
  const metaTitle = eventId ? stageMetaChapterTitle(packs.stageMeta || [], modId, eventId) : undefined;
  if (metaTitle) return metaTitle;
  // 内容包 stageMeta 关级 uiChapterByRouteLocation（F0b）：按 storyRouteLocation 分段（B6 起塞外 stage_02 的按地点分段在这里）
  const routeTitle = eventId ? stageMetaRouteChapterTitle(packs.stageMeta || [], modId, eventId, storyRouteLocationIn(packs.stageMeta || [], eventId), fallback) : undefined;
  if (routeTitle !== undefined) return routeTitle;
  return fallback;
}

/** 作者写死地点的商路／押送拍（F0b：与内容包 stageMeta 事件的 routeLocation 合并，TS 表优先，编译期禁止两边都有）。B6 起 5 条都在塞外包 stageMeta，TS 表留空。 */
export const TS_STORY_ROUTE_LOCATIONS: Readonly<Record<string, string>> = {};

export function storyRouteLocation(eventId: string): string | undefined {
  return storyRouteLocationIn(CONTENT_PACKS.stageMeta || [], eventId);
}

export function storyRouteLocationIn(stageMeta: readonly StageMeta[], eventId: string): string | undefined {
  // 可选姿态拍（`<主线事件>_ins_<线>`）演在主线事件所在的路上，不另起地点。
  eventId = eventId.split('_ins_')[0];
  return (TS_STORY_ROUTE_LOCATIONS as Record<string, string>)[eventId] ?? stageMetaEvent(stageMeta, eventId)?.routeLocation;
}

/** 合同已有准备拍落账（事件进行中）时，去X 指向下一个可做动作 sceneLocation 里能认出的正典地点（取名字最长的命中）；认不出、或还没开打，仍用事件 locationId（fix5939-2） */
function questCompassLocationId(event: ScenarioModEvent, runtime: QuestCompassRuntime): string | undefined {
  const preps = runtime?.eventActionStates?.[event.id]?.preparations || [];
  const actions = event.playerCompletionContract?.actions || [];
  if (!preps.length || !actions.length) return event.locationId;
  const next = actions.find(a => (a.requiresPreparation || []).every(p => preps.includes(p))
    && !(a.kind === 'prepare' && a.grantsPreparation && preps.includes(a.grantsPreparation)));
  const scene = next?.sceneLocation;
  if (!scene) return event.locationId;
  // 本地按名字包含匹配，不引 travelLedger（避免 travelLedger→secondaryLines 循环依赖）
  const hit = (runtime?.canon?.locations || [])
    .filter(item => item.id && item.name && scene.includes(item.name))
    .sort((a, b) => String(b.name).length - String(a.name).length)[0];
  return hit?.id || event.locationId;
}

function questCompassTargets(event: ScenarioModEvent, runtime: QuestCompassRuntime, present?: ReadonlySet<string>): { locName: string; who: string[] } {
  const locationId = questCompassLocationId(event, runtime);
  const locName = String((runtime?.canon?.locations || []).find(item => item.id === locationId)?.name || '').trim();
  const playerId = String(runtime?.opening?.playerCharacterId
    || ((runtime?.canon?.characters || []).some(item => item.id === 'liuchao.character.cheng_zongyang')
      ? 'liuchao.character.cheng_zongyang' : ''));
  const playerName = String((runtime?.canon?.characters || []).find(item => item.id === playerId)?.name || '').trim();
  const who = [...new Set((event.relatedCharacterIds || [])
    .filter(id => id && id !== playerId && !present?.has(id))
    .map(id => String((runtime?.canon?.characters || []).find(item => item.id === id)?.name || '').trim())
    .filter(name => name.length >= 2 && name !== playerName))]
    .slice(0, 2);
  return { locName, who };
}

/**
 * 罗盘「见X」要剔除的人：已经相识（acquaintances encountered）且此刻就在玩家身边的人。
 * 「身边」沿用在场判定 computePresentNames 的位置同建筑段与近期正文兜底（不含活跃事件／开场名单——那会把所有相关人都判成在场）。
 * 真机 REPORT-8091-cd167d7a：段强一路同行，任务卡仍写「◆见段强」「◆去草原 · 见段强」。
 */
export function questCompassPresentIds(save: unknown, recentNarrative?: string): Set<string> {
  const data = save as { 角色?: { 位置?: { 描述?: unknown } }; 社交?: { 关系?: Record<string, any> }; 世界?: { 状态?: { 剧本模组?: any } } } | null | undefined;
  const relations = data?.社交?.关系 || {};
  const acquaintances = data?.世界?.状态?.剧本模组?.acquaintances || {};
  const met = new Set(Object.values(acquaintances as Record<string, any>)
    .filter(item => item?.kind === 'encountered' && typeof item.characterId === 'string')
    .map(item => item.characterId as string));
  const present = computePresentNames({
    playerLocation: String(data?.角色?.位置?.描述 || ''),
    relations,
    recentNarrative,
  });
  const ids = new Set<string>();
  for (const [key, npc] of Object.entries(relations)) {
    const id = String(npc?.角色ID || key);
    const name = String(npc?.名字 || key);
    if (met.has(id) && present.has(name)) ids.add(id);
  }
  return ids;
}

/** 当前拍要去哪、见谁。已在目标地点时不再写「去某地」；present 里的人（已同行）不再写「见某人」。 */
export function questCompassPhrases(
  event: ScenarioModEvent | null | undefined,
  runtime: QuestCompassRuntime,
  atLocationId?: string,
  present?: ReadonlySet<string>,
): string[] {
  if (!event) return [];
  const { locName, who } = questCompassTargets(event, runtime, present);
  const phrases: string[] = [];
  const locationId = questCompassLocationId(event, runtime);
  if (!storyRouteLocation(event.id) && locName && locationId && !locationWithin(atLocationId, locationId)) phrases.push(`去${locName}`);
  for (const name of who) phrases.push(`见${name}`);
  return phrases;
}

/** 罗盘只显示目标、不写去哪见谁的拍（F0b：与内容包 stageMeta 事件的 compassObjectiveOnly 合并；B6 起数据在塞外包，TS 集合留空）。 */
export const TS_COMPASS_OBJECTIVE_ONLY_EVENT_IDS: ReadonlySet<string> = new Set<string>();

/** 任务栏罗盘：去哪、见谁。不剧透结果，不替代 objective。 */
export function formatQuestCompass(
  event: ScenarioModEvent | null | undefined,
  runtime: QuestCompassRuntime,
  atLocationId?: string,
  present?: ReadonlySet<string>,
): string {
  const objective = resolveFixedQuestObjective(event);
  if (event?.id && (TS_COMPASS_OBJECTIVE_ONLY_EVENT_IDS.has(event.id) || stageMetaEvent(CONTENT_PACKS.stageMeta || [], event.id)?.compassObjectiveOnly)) return objective;
  const pointer = questCompassPhrases(event, runtime, atLocationId, present).join(' · ');
  if (!pointer) return objective;
  if (!objective) return pointer;
  return `${pointer}：${objective}`;
}

/** 仅显式声明的分歧投影可替代 Canon Rail；普通条件化文案仍保留默认正典合同。 */
export function narrativeVariantReplacesCanonRail(
  event: ScenarioModEvent,
  flags: Record<string, unknown>,
  divergences?: ScenarioDivergence[],
  runtime?: unknown,
): boolean {
  const compatibilityVariants = fillInCompatVariants(event.id);
  const variants = event.narrativeVariants?.length ? event.narrativeVariants : compatibilityVariants;
  const explicitReplacement = variants?.some(item => item.replacesCanonRail === true
    && item.when.every(condition => matches(condition, flags, runtime))) ?? false;
  return explicitReplacement || Boolean(relatedDivergence(event, divergences));
}

/** 认知/路径按已携带的编年史顺序跨关排，不比较不同关的本地回合。 */
export function ledgerRecordOrder(runtime: any, record: { sourceEventId?: string }): number {
  const entry = (runtime?.chronicle || []).find((c: any) => record.sourceEventId && String(c.id).endsWith('.' + record.sourceEventId));
  if (entry) return Number(entry.sequence) || 0;
  return runtime?.events?.some((e: any) => e.id === record.sourceEventId)
    ? Math.max(0, ...(runtime.chronicle || []).map((c: any) => Number(c.sequence) || 0)) + 1 : 0;
}
export function ledgerRecordTurnLabel(runtime: any, record: { sourceEventId?: string }, turn: unknown): string {
  const entry = (runtime?.chronicle || []).find((c: any) => record.sourceEventId && String(c.id).endsWith('.' + record.sourceEventId));
  const stage = entry?.stageId || (runtime?.events?.some((e: any) => e.id === record.sourceEventId) ? runtime.modId : '');
  const label = String(stage || '').match(/stage_(\d+b?)/)?.[1];
  const local = Number(turn) > 0 ? `第 ${Number(turn)} 回合` : !record.sourceEventId ? '开场已知' : '回合未记录';
  return `${label ? `第${label}关 · ` : ''}${local}`;
}

/** 「认知与路径」面板只给玩家看中文：任何带拉丁字母的字段（lyg./lyl./lcq. 原始键、method 等英文维度）都不直接显示（REPORT-8091-f76e07a7 ⑤）。 */
const RAW_LEDGER_TEXT = /[A-Za-z]/;
const PATH_DIMENSION_LABELS: Readonly<Record<string, string>> = {
  position: '立场', allegiance: '归属', method: '做法', participation: '参与', route: '路线',
  trust: '信任', hostility: '敌意', obligation: '人情', caution: '戒备',
};
const ledgerName = (runtime: any, id: unknown): string | undefined => {
  const pool = [...(runtime?.canon?.characters || []), ...(runtime?.canon?.factions || []), ...(runtime?.canon?.locations || []), ...(runtime?.events || [])];
  const name = pool.find((item: any) => item?.id === id)?.name;
  return typeof name === 'string' && name.trim() && !RAW_LEDGER_TEXT.test(name) ? name : undefined;
};
export function ledgerKnowledgeClaim(runtime: any, fact: { claim?: unknown; subjectId?: unknown }): string {
  if (typeof fact.claim === 'string' && fact.claim.trim() && !RAW_LEDGER_TEXT.test(fact.claim)) return fact.claim;
  const name = ledgerName(runtime, fact.subjectId);
  return name ? `你已知晓${name}` : '已记录一条线索（原记录缺少名称）';
}
export function ledgerKnowledgeSource(runtime: any, fact: { source?: { label?: unknown }; sourceEventId?: unknown }): string {
  const label = fact.source?.label;
  return typeof label === 'string' && label.trim() && !RAW_LEDGER_TEXT.test(label) ? label : ledgerName(runtime, fact.sourceEventId) || '已发生的剧情';
}
export function ledgerPathLabel(receipt: { label?: unknown }): string {
  return typeof receipt.label === 'string' && receipt.label.trim() && !RAW_LEDGER_TEXT.test(receipt.label) ? receipt.label : '已作出的选择';
}
export function ledgerPathDimension(dimension: unknown): string {
  const raw = String(dimension || '');
  if (PATH_DIMENSION_LABELS[raw]) return PATH_DIMENSION_LABELS[raw];
  return raw && !RAW_LEDGER_TEXT.test(raw) ? raw : '剧情分支';
}

/** 停滞几轮后给玩家看推进提示（与叙事端「回主线轻引子」同阈值）。 */
export const QUEST_STALL_HINT_TURNS = 4;
/**
 * 主线停滞时的玩家可见引导（真机 69ab：stage01 自由输入 19 回合不推进，玩家不知道要点「主线」按钮）。
 * 只在当前拍确有可点的主线动作时出现；不改任何数据。
 */
export function questStallHint(stallTurns: unknown, mainActionLabel: string | undefined, objective?: string): string {
  const turns = Number(stallTurns) || 0;
  if (turns < QUEST_STALL_HINT_TURNS || !mainActionLabel) return '';
  const goal = String(objective || '').trim();
  const goalNote = goal && !mainActionLabel.includes(goal) ? `（${goal}）` : '';
  return `主线已有 ${turns} 轮没有推进：可直接点行动区的「主线 · ${mainActionLabel}」，或照目标行动${goalNote}。`;
}

/** 按所在地点换展示的动作（F0b：与内容包 stageMeta 事件的 actionPresentation 合并，TS 表在前；TS 表里存正文键，用时才 packText；B6 起数据在太泉包，TS 表留空）。 */
export const TS_STORY_ACTION_PRESENTATIONS: ReadonlyArray<{ eventId: string; actionId: string; whenLocationId: string; labelTextId: string; playerLineTextId: string }> = [];

/** 旅行已经落位后，行动展示承接所在地；合同 id/hash 与结算条件不变。 */
export function storyActionPresentation<T extends { eventId: string; actionId: string; label: string; playerLine: string }>(action: T, save: any): T {
  const at = save?.角色?.位置?.locationId;
  const ts = TS_STORY_ACTION_PRESENTATIONS.find(p => p.eventId === action.eventId && p.actionId === action.actionId && p.whenLocationId === at);
  if (ts) return { ...action, label: packText(ts.labelTextId), playerLine: packText(ts.playerLineTextId) };
  const pack = stageMetaEvent(CONTENT_PACKS.stageMeta || [], action.eventId)?.actionPresentation?.find(p => p.actionId === action.actionId && p.whenLocationId === at);
  return pack ? { ...action, label: pack.label, playerLine: pack.playerLine } : action;
}
