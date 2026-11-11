import { CONTENT_PACKS } from '../contentPacks';
import { stageMetaEvent, type StageMeta } from '../contentPacks/stageMeta';
import {entityTemplateText} from './namedEntities';
/**
 * 玩家侧固定任务目标覆盖。
 *
 * 三级任务表中的 `reviewSummary` 是制作侧结果摘要；玩家目标默认读取 event.objective。
 * 本表只收经 Grok 全量筛查、Codex 逐条复审后仍需去剧透／去元语言的少数 event。
 * 它只改表现，不改 event、completion contract、hash、payload 或 Canon Rail 结果。
 */

export interface QuestObjectiveEventLike {
  id?: string;
  objective?: unknown;
}

export const FIXED_QUEST_OBJECTIVE_OVERRIDES: Readonly<Record<string, string>> = Object.freeze({});

export function resolveFixedQuestObjective(event: QuestObjectiveEventLike | null | undefined): string {
  return resolveFixedQuestObjectiveIn(CONTENT_PACKS.stageMeta || [], event);
}

/** 顺序：内容包 stageMeta 的 presentation.events[id].objective → 上表 → event.objective（编译期校验 stageMeta 不与上表重复）。B6 起原三条特判与上表两条都在昭南、塞外、太泉包 stageMeta，上表留空。 */
export function resolveFixedQuestObjectiveIn(stageMeta: readonly StageMeta[], event: QuestObjectiveEventLike | null | undefined): string {
  const eventId = String(event?.id || '').trim();
  const packObjective = stageMetaEvent(stageMeta, eventId)?.objective;
  // F0b：stageMeta 目标可写 {{entity:…}}／{{entityLabel:…}}（编译期校验，catalog 留模板，这里解析，同包二级线）；{"$text"} 编译时已换成正文
  if (packObjective) return packObjective.includes('{{') ? entityTemplateText(packObjective) : packObjective;
  if (eventId && FIXED_QUEST_OBJECTIVE_OVERRIDES[eventId]) {
    return FIXED_QUEST_OBJECTIVE_OVERRIDES[eventId];
  }
  return typeof event?.objective === 'string' ? event.objective.trim() : '';
}
