import { CONTENT_PACKS, packText } from '../contentPacks';
import { stageMetaEvent, type StageMeta } from '../contentPacks/stageMeta';
import {entityText} from './namedEntities';
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
  'lcq.event.s03b_wanwu_night': '循谢艺的指点进入夜林，接回受惊的阿葭',
  'lcq.event.s03b_yinzhu_xiongerpu': '处理阴蛛留下的死者，再到熊耳铺找向导',
  'lcq.event.s04b_xi_furen_trade_route': '与樨夫人谈清白夷族长与商路的交换条件',
  'lcq.event.s05b_ice_gu_detour': '和祁远算清蛊患期限，商议前往叶媪山村',
  'lcq.event.s05b_wuer_suli_depart': '听苏荔说清来意，再与武二郎结清工钱道别',
  'lcq.event.s05b_shanghou_reads_letter': '接受殇侯解蛊，再请他辨认黑鸦使者的白纸信',
  'lcq.event.s05b_yeao_palm_ningyu_stays': '接受叶媪诊视，听清凝羽为何需要留村调养',
  'lcq.event.s03_12': '进入这座无灯火的蛇彝村，先安置商队',
  'lcq.event.debut_lemingzhu': '看清商队里那个被扯掉头饰的新娘',
  'lyg.event.debut_daiqisi': '看清佛堂废墟里被禁锢的那位妇人',
  'lyg.event.debut_shefuren': '看清卧室里挽鞭出场的黑衣侍奴',
  'lcq.event.blank_letter_and_dagu': '当面核这封白纸信笺，并应对小紫当着阁罗说的话',
  'lcq.event.hongmiao_controlled': '看清红苗此刻的状态，并把苏荔从阁罗手里暂时保下',
  'lcq.event.s04b_lingfei_baiyi_crisis_19': '从被巨浪淹没的竹楼里脱身',
  'lcq.event.s05b_10_slave_revolt_and_phoenix_change': '趁集会大乱，设法潜入鬼王宫',
  'lcq.event.wuerlang_joins': '问清走投无路的武二郎是否随队南行',
  'lcq.event.wuerlang_slays_dagu': entityText("撑住{{entity:character:lcq.character.nanhuang_dagu}}这一波围攻，看清武二郎能否打开缺口"),
  'lcq.event.s05b_02_xiaozi_exposed': entityText("质问小紫，把阿夕的异常和{{entity:character:lcq.character.nanhuang_heishe}}死因问清楚"),
  'lcq.event.s04_03': '听清乐明珠为什么要假扮新娘',
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
  if (packObjective) return packObjective;
  if (eventId && FIXED_QUEST_OBJECTIVE_OVERRIDES[eventId]) {
    return FIXED_QUEST_OBJECTIVE_OVERRIDES[eventId];
  }
  return typeof event?.objective === 'string' ? event.objective.trim() : '';
}
