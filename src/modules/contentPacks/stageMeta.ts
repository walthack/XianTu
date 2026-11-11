/**
 * 内容包 stageMeta（宋线 S2）：每条对应一个关（包内关或内置关），给隔离、称号奖励、界面章名、配乐、目标覆盖供数。
 * 这里只放纯查询，不 import catalog：读取方传入 CONTENT_PACKS.stageMeta，编译器与测试可传合成数据。
 * 编译期校验见 scripts/content-packs.mjs；chapterTitles 由编译器按 uiChapterId／defaultUiChapterId 填好，运行时不查关数据。
 */
export interface StageMetaEventPresentation { uiChapterId?: string; mood?: string; objective?: string }
export interface StageMetaMilestoneReward { titles: string[]; revokeTitles?: string[]; note: string }
export interface StageMeta {
  stageId: string;
  defaultLineQuarantined?: boolean;
  milestoneReward?: StageMetaMilestoneReward;
  presentation?: {
    defaultUiChapterId?: string;
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

/** 界面章名：按 modId + eventId 查；事件自己的 uiChapterId 优先，其次该关 defaultUiChapterId。 */
export function stageMetaChapterTitle(meta: readonly StageMeta[], modId: unknown, eventId: unknown): string | undefined {
  const m = stageMetaOf(meta, modId);
  if (!m || typeof eventId !== 'string' || !eventId) return undefined;
  const chapterId = m.presentation?.events?.[eventId]?.uiChapterId ?? m.presentation?.defaultUiChapterId;
  return chapterId ? m.chapterTitles?.[chapterId] || undefined : undefined;
}

/** 某关 stageMeta 里 uiChapterId 为该章的事件 id（按文件里的顺序）。 */
export function stageMetaUiChapterEventIds(meta: readonly StageMeta[], stageId: string, chapterId: string): Set<string> {
  return new Set(Object.entries(stageMetaOf(meta, stageId)?.presentation?.events || {})
    .filter(([, event]) => event.uiChapterId === chapterId).map(([eventId]) => eventId));
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
