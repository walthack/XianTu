/**
 * 内容包 stageMeta（宋线 S2）：每条对应一个关（包内关或内置关），给隔离、称号奖励、界面章名、配乐、目标覆盖供数。
 * 这里只放纯查询，不 import catalog：读取方传入 CONTENT_PACKS.stageMeta，编译器与测试可传合成数据。
 * 编译期校验见 scripts/content-packs.mjs；chapterTitles 由编译器按 uiChapterId／defaultUiChapterId 填好，运行时不查关数据。
 */
/**
 * 事件展示字段。F0b（2026-11-11）新增：uiChapterTitle（直接给章名串，与 uiChapterId 二选一）、routeLocation（storyRouteLocation）、
 * compassObjectiveOnly（罗盘只显示目标）、lockedDecision（分支锁，首项是决定动作）、actionPresentation（按所在地点换动作展示）、
 * compatNarrativeVariants（旧档兼容叙事变体）；objective 可带 {{entity:…}} 模板（fixedQuestObjectives.ts 解析）。
 */
export interface StageMetaEventPresentation {
  uiChapterId?: string; mood?: string; objective?: string;
  uiChapterTitle?: string;
  routeLocation?: string;
  compassObjectiveOnly?: true;
  lockedDecision?: Array<[string, string]>;
  actionPresentation?: Array<{ actionId: string; whenLocationId: string; label: string; playerLine: string }>;
  compatNarrativeVariants?: StageMetaCompatNarrativeVariant[];
}
/** 旧档兼容变体：形状同 eventNarrativeView.ts 的 TS_COMPAT_NARRATIVE_VARIANTS 条目（作者 note 已剥掉）。 */
export interface StageMetaCompatNarrativeVariant {
  when: Array<{ path: string; operator: 'eq' | 'neq'; value: string | number | boolean }>;
  /** 先于事件自带的 narrativeVariants 生效（只改写文案字段，不参与 narrativeVariantReplacesCanonRail）。 */
  priority?: 'before-event-variants';
  replacesCanonRail?: true;
  name?: string; description?: string; axisBeat?: string; objective?: string; relatedFactionIds?: string[];
}
/** 关级：按 storyRouteLocation 分段的章名（规则按顺序取第一条命中；keepFallbackEventIds 里的事件照旧回退）。 */
export interface StageMetaRouteChapterTitles {
  keepFallbackEventIds?: string[];
  rules: Array<{ routeLocationIncludes: string; title: string }>;
  defaultTitle?: string;
}
export interface StageMetaMilestoneReward { titles: string[]; revokeTitles?: string[]; note: string }
export interface StageMeta {
  stageId: string;
  /** 关 → 地区（G2）：只给包内关写，运行时并入 reputationLedger.ts 的 STAGE_REGION；取值为 overrides stageRegions 已有的地区或某条国家线的 regions，overrides 已有的关不得再写（编译期校验）。 */
  region?: string;
  defaultLineQuarantined?: boolean;
  milestoneReward?: StageMetaMilestoneReward;
  presentation?: {
    defaultUiChapterId?: string;
    uiChapterByRouteLocation?: StageMetaRouteChapterTitles;
    chapters?: Record<string, { mood?: string }>;
    events?: Record<string, StageMetaEventPresentation>;
  };
  /** 编译器写入：uiChapterId／defaultUiChapterId → 该章标题。 */
  chapterTitles?: Record<string, string>;
}

export function stageMetaOf(meta: readonly StageMeta[], stageId: unknown): StageMeta | undefined {
  return typeof stageId === 'string' ? meta.find(m => m.stageId === stageId) : undefined;
}

/** 事件配乐与目标覆盖按事件 id 全局查（编译期保证同一事件只出现在一条 stageMeta 里）。 */
export function stageMetaEvent(meta: readonly StageMeta[], eventId: unknown): StageMetaEventPresentation | undefined {
  if (typeof eventId !== 'string' || !eventId) return undefined;
  for (const m of meta) { const e = m.presentation?.events?.[eventId]; if (e) return e; }
  return undefined;
}

export function stageMetaChapterMood(meta: readonly StageMeta[], chapterId: unknown): string | undefined {
  if (typeof chapterId !== 'string' || !chapterId) return undefined;
  for (const m of meta) { const mood = m.presentation?.chapters?.[chapterId]?.mood; if (mood) return mood; }
  return undefined;
}

/** 界面章名：按 modId + eventId 查；事件自己的 uiChapterTitle（章名串）、uiChapterId 优先（二者互斥），其次该关 defaultUiChapterId。 */
export function stageMetaChapterTitle(meta: readonly StageMeta[], modId: unknown, eventId: unknown): string | undefined {
  const m = stageMetaOf(meta, modId);
  if (!m || typeof eventId !== 'string' || !eventId) return undefined;
  const own = m.presentation?.events?.[eventId];
  if (own?.uiChapterTitle) return own.uiChapterTitle;
  const chapterId = own?.uiChapterId ?? m.presentation?.defaultUiChapterId;
  return chapterId ? m.chapterTitles?.[chapterId] || undefined : undefined;
}

/** 某关 stageMeta 里 uiChapterId 为该章的事件 id（按文件里的顺序）。 */
export function stageMetaUiChapterEventIds(meta: readonly StageMeta[], stageId: string, chapterId: string): Set<string> {
  return new Set(Object.entries(stageMetaOf(meta, stageId)?.presentation?.events || {})
    .filter(([, event]) => event.uiChapterId === chapterId).map(([eventId]) => eventId));
}

/** 某关 stageMeta 里写了 uiChapterId 的事件按章分组：[章标题, 事件 id]，章按首次出现的顺序、事件按文件顺序。 */
export function stageMetaUiChapterGroups(meta: readonly StageMeta[], stageId: string): Array<readonly [string, Set<string>]> {
  const m = stageMetaOf(meta, stageId), groups = new Map<string, Set<string>>();
  for (const [eventId, event] of Object.entries(m?.presentation?.events || {})) {
    if (event.uiChapterId) (groups.get(event.uiChapterId) || groups.set(event.uiChapterId, new Set()).get(event.uiChapterId)!).add(eventId);
  }
  return [...groups].map(([chapterId, ids]) => [m?.chapterTitles?.[chapterId] ?? chapterId, ids] as const);
}

/** 隔离关集合：stageMeta 写了 defaultLineQuarantined 的关按它（true 加入、false 去掉），没写的沿用 TS 表。 */
export function quarantinedStageIds(meta: readonly StageMeta[], tsIds: Iterable<string>): Set<string> {
  const out = new Set(tsIds);
  for (const m of meta) {
    if (m.defaultLineQuarantined === true) out.add(m.stageId);
    else if (m.defaultLineQuarantined === false) out.delete(m.stageId);
  }
  return out;
}

/**
 * 关级按地点分段的章名（F0b）：该关没声明时返回 undefined（调用方照旧往下走）；keepFallbackEventIds 里的事件返回 fallback；
 * 否则按顺序取第一条 routeLocation 包含 routeLocationIncludes 的规则，都不中取 defaultTitle，没有 defaultTitle 返回 fallback。
 */
export function stageMetaRouteChapterTitle(meta: readonly StageMeta[], modId: unknown, eventId: string, routeLocation: string | undefined, fallback: string): string | undefined {
  const r = stageMetaOf(meta, modId)?.presentation?.uiChapterByRouteLocation;
  if (!r || !eventId) return undefined;
  if (r.keepFallbackEventIds?.includes(eventId)) return fallback;
  return r.rules.find(rule => routeLocation?.includes(rule.routeLocationIncludes))?.title ?? r.defaultTitle ?? fallback;
}
