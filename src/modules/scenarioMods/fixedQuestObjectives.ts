import { CONTENT_PACKS, packText } from '../contentPacks';
import { stageMetaEvent, type StageMeta } from '../contentPacks/stageMeta';
import {entityText,entityTemplateText} from './namedEntities';
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

export const FIXED_QUEST_OBJECTIVE_OVERRIDES: Readonly<Record<string, string>> = Object.freeze({
  'lcq.event.wuerlang_slays_dagu': entityText("撑住{{entity:character:lcq.character.nanhuang_dagu}}这一波围攻，看清武二郎能否打开缺口"),
  'lcq.event.s05b_02_xiaozi_exposed': entityText("质问小紫，把阿夕的异常和{{entity:character:lcq.character.nanhuang_heishe}}死因问清楚"),
});

export function resolveFixedQuestObjective(event: QuestObjectiveEventLike | null | undefined): string {
  return resolveFixedQuestObjectiveIn(CONTENT_PACKS.stageMeta || [], event);
}

/** 顺序：下面三条特判 → 内容包 stageMeta 的 presentation.events[id].objective → 上表 → event.objective（编译期校验 stageMeta 不与特判、上表重复）。 */
export function resolveFixedQuestObjectiveIn(stageMeta: readonly StageMeta[], event: QuestObjectiveEventLike | null | undefined): string {
  const eventId = String(event?.id || '').trim();
  if (eventId === 'lyl.event.han_shouyang_gaoyanei') return packText('report8091.han.arrived.objective');
  if (eventId === 'lcq.event.s02_04') return '先到点心铺，在店内拖延观察或伺机脱身，再应对追捕逃奴的人';
  if (eventId === 'lcq.event.huamiao_coop_boundary') return '跟云苍峰谈清进鬼王峒的合作边界';
  const packObjective = stageMetaEvent(stageMeta, eventId)?.objective;
  // F0b：stageMeta 目标可写 {{entity:…}}／{{entityLabel:…}}（编译期校验，catalog 留模板，这里解析，同包二级线）；{"$text"} 编译时已换成正文
  if (packObjective) return packObjective.includes('{{') ? entityTemplateText(packObjective) : packObjective;
  if (eventId && FIXED_QUEST_OBJECTIVE_OVERRIDES[eventId]) {
    return FIXED_QUEST_OBJECTIVE_OVERRIDES[eventId];
  }
  return typeof event?.objective === 'string' ? event.objective.trim() : '';
}
