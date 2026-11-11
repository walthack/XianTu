/**
 * 第三级：人物任务。
 *
 * **形态是插入段，不是第三条节点序列**（用户裁定 2026-08-16）：
 *
 * > 「角色剧情是**二级线的下层插入事件**……这样才能产生——
 * >  **如果这个角色不在场，这个 event 会变成另外一个样**的效果。」
 *
 * 所以每一拍都挂在一个**已存在的故事 event** 上，回答的是「这一拍因为带着谁而不同」，
 * 而不是「第几步做什么」。三级权重依次递减：主轴 － 二级线 － 人物任务；
 * 人物任务**不抢上级已认领的 event**，只在它下面当插入段（`insert`）。
 *
 * 数据最初由 `docs/R3-10-CHARACTER-QUESTS-DRAFT-2026-08-16.md` 机械抽取生成（scratchpad `extract_cq.py`／`gen_cq.py`）。
 * **权威来源现在是 `packs/characters/character-beats.json`**（B2 2026-11-11 原样搬入、顺序不变）：
 * 改人物任务与高光改那份 JSON，再跑 `node scripts/content-packs.mjs`；不再改文档重抽，本文件的两张 TS 表保持为空。
 * 编译期逐条校验 `ready`／`insert` 的 id 真实存在、`new` 的建议 id 尚不存在。
 *
 * 内容包 `characterBeats`（F0a）：包里的人物任务与高光并在 TS 表之后（`mergeCharacterBeats`），导出名不变；
 * 编译期校验 status、事件存在性（`new` 的建议 id 必须**不存在**）、quest id 唯一、与 TS 表不重复。
 */
import { CONTENT_PACKS } from '../contentPacks';
import type { PackCharacterBeats } from '../contentPacks/coreFormats';

export type CharacterBeatStatus =
  /** 已有独立 event 承载这一拍。 */
  | 'ready'
  /** 正典有、游戏没落地，`eventIds` 是建议 id，**尚不存在**。 */
  | 'new'
  /** 挂在上级链已认领的 event 下面当插入段——同一拍，两边读到的东西不同。 */
  | 'insert';

export interface CharacterQuestBeat {
  /** 制作侧事件结果摘要；玩家目标由绑定 event 的固定 objective 提供。 */
  reviewSummary: string;
  status: CharacterBeatStatus;
  /** `ready`／`insert` 为真实 event id（两拍并进时多个）；`new` 为建议 id。 */
  eventIds: string[];
}

export interface CharacterQuest {
  id: string;
  /** 人物名——与正典角色表同名，供 UI 与提示词直接用。 */
  name: string;
  beats: CharacterQuestBeat[];
}

/**
 * A 档单点高光：**不成线**，但这一拍是属于这个人的。
 *
 * 来源是孤儿归类（2026-08-17）——它们本来就在事件层里，只是没人认领。
 * 「料不够并不是这个角色不需要登场的理由」（用户裁定），故一律保留为挂点，
 * 够料的日后升格成 `CHARACTER_QUESTS` 里的线。
 */
export interface CharacterHighlight {
  name: string;
  /** 这一拍/这几拍的真实 event id。 */
  eventIds: string[];
  /** 制作侧摘要；不直接作为玩家任务目标。 */
  reviewSummary: string;
}

export const TS_CHARACTER_QUESTS: CharacterQuest[] = [];

export const TS_CHARACTER_HIGHLIGHTS: CharacterHighlight[] = [];

/** TS 表在前、包按 catalog 顺序在后；quest id 与 TS 重复即报错（编译期已查，这里兜底）。 */
export function mergeCharacterBeats(
  ts: { quests: readonly CharacterQuest[]; highlights: readonly CharacterHighlight[] },
  pack: Partial<PackCharacterBeats> | undefined,
): { quests: CharacterQuest[]; highlights: CharacterHighlight[] } {
  const quests = [...ts.quests, ...(pack?.quests || [])];
  const ids = new Set<string>();
  for (const quest of quests) { if (ids.has(quest.id)) throw new Error(`character quest ${quest.id}: duplicate id`); ids.add(quest.id); }
  return { quests, highlights: [...ts.highlights, ...(pack?.highlights || [])] };
}

const MERGED = mergeCharacterBeats({ quests: TS_CHARACTER_QUESTS, highlights: TS_CHARACTER_HIGHLIGHTS }, CONTENT_PACKS.characterBeats);
/** 全部人物任务：TS 表加内容包（catalog 没有这一段时等于 TS 表）。 */
export const CHARACTER_QUESTS: CharacterQuest[] = MERGED.quests;
/** 全部单点高光：TS 表加内容包。 */
export const CHARACTER_HIGHLIGHTS: CharacterHighlight[] = MERGED.highlights;

/**
 * 当前这一拍上，有谁的戏。
 *
 * 这是人物任务唯一的运行时入口——它不问"进行到第几步"，只问
 * **"我现在踩着的这个 event，因为谁而不一样"**。这与形态一致：插入段不是序列。
 * `new` 的拍不返回：那些 event 还不存在，返回了就是把玩家指向走不到的地方。
 */
export function characterBeatsAt(eventId: string | undefined): Array<{ name: string; reviewSummary: string }> {
  if (!eventId) return [];
  const out: Array<{ name: string; reviewSummary: string }> = [];
  for (const quest of CHARACTER_QUESTS) {
    for (const beat of quest.beats) {
      if (beat.status !== 'new' && beat.eventIds.includes(eventId)) {
        out.push({ name: quest.name, reviewSummary: beat.reviewSummary });
      }
    }
  }
  for (const highlight of CHARACTER_HIGHLIGHTS) {
    if (highlight.eventIds.includes(eventId)) {
      out.push({ name: highlight.name, reviewSummary: highlight.reviewSummary });
    }
  }
  return out;
}

/** 每条人物线走了多少——只统计真实可走的拍（`new` 不计入分母，它还不存在）。 */
export function characterQuestProgress(
  completedEventIds: readonly string[] | undefined,
): Array<{ id: string; name: string; done: number; total: number }> {
  const done = new Set(completedEventIds || []);
  return CHARACTER_QUESTS.map(quest => {
    const walkable = quest.beats.filter(b => b.status !== 'new');
    return {
      id: quest.id,
      name: quest.name,
      // 一拍可能并进多个 event，任一完成即算这一拍走过。
      done: walkable.filter(b => b.eventIds.some(id => done.has(id))).length,
      total: walkable.length,
    };
  });
}
