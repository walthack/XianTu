/**
 * 在场判定（2026-08-15）——"此刻谁真的在你面前"的单一判据。
 *
 * 立项理由：此前只有**正向补召回**（把在场却没被点名的 NPC 加进聚焦），没有**反向拦截**。
 * 于是玩家在输入里打出任何名字，该角色的档案就被注入，LLM 顺势让其登场——
 * 哪怕她远在南荒、哪怕这一关根本没有她、哪怕她还没加入。实测存档：24/27 个 NPC 挂着
 * 「实时关注」，位置横跨中州与南荒，其中还有关系标签已是「被杀死」的。
 *
 * 三个来源，命中任一即在场：
 *   1. **活跃事件** `relatedCharacterIds` —— 最硬。也用来兜住位置字段滞后：
 *      位置由 LLM 维护，实测小紫位置还写着皇宫冷宫，人已经在玩家身边说话了。
 *   2. **开场声明** `featuredCharacterIds`。
 *   3. **位置同建筑** —— 取玩家位置的建筑段（`·` 分隔第 3 段，缺省退到第 2 段），
 *      NPC 位置包含该段即算同处。实测同建筑 7 人、同城 12 人；同城会把隔着整座城的
 *      皇宫、城西荒院都算进来，太宽，故取建筑段。
 *
 * **玩家输入里点到名字不构成在场**——那只表示玩家想找他。不在场的人仍然注入档案
 * （防 OOC 的理由不变），但会附带"不得登场"的约束，改以听闻／传言／书信处理。
 */

export interface PresenceInput {
  /** 玩家位置描述，如「中州·建康城·栖云别院·正堂」。 */
  playerLocation?: string;
  /** 存档 社交.关系：名字 → { 当前位置描述 }。 */
  relations?: Record<string, unknown>;
  /** 当前活跃事件涉及的角色名（已由调用方解析 id → 名字）。 */
  eventCharacterNames?: Iterable<string>;
  /** 关卡开场声明的角色名。 */
  featuredCharacterNames?: Iterable<string>;
  /**
   * 最近几条**AI 叙事正文**（不含玩家输入）。刚在正文里出场过的人必然在场。
   *
   * 这条是位置字段滞后的兜底：位置由 LLM 维护，实测小紫位置还写着皇宫冷宫，
   * 人已经在玩家身边连说数轮——只靠位置会把她判成离场，反过来告诉模型"不得让她登场"。
   * **刻意不含玩家输入**：玩家打出名字只代表想找他，不代表人在。
   */
  recentNarrative?: string;
  /** Names that must not count as present even if featured or recently narrated. */
  excludeNames?: Iterable<string>;
}

/** 取位置描述的"建筑段"：第 3 段优先，不足则退到第 2 段，再不足用整串。 */
export function buildingSegmentOf(location: string | undefined): string {
  const segments = String(location || '')
    .split('·')
    .map(segment => segment.replace(/\s+/g, ''))
    .filter(Boolean);
  if (!segments.length) return '';
  return segments[2] || segments[1] || segments[0];
}

function locationDescriptionOf(npc: unknown): string {
  if (!npc || typeof npc !== 'object') return '';
  const raw = (npc as { 当前位置?: unknown }).当前位置;
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') return String((raw as { 描述?: unknown }).描述 || '');
  return '';
}

/**
 * 算出此刻在场的角色名集合。
 *
 * 位置匹配刻意只做"包含建筑段"而非全等：NPC 位置常带房间后缀（药房／正堂偏厅／后院东厢），
 * 全等会把同院不同房的人判成离场。
 */
export function computePresentNames(input: PresenceInput): Set<string> {
  const present = new Set<string>();
  for (const name of input.eventCharacterNames || []) if (name) present.add(String(name));
  for (const name of input.featuredCharacterNames || []) if (name) present.add(String(name));

  const building = buildingSegmentOf(input.playerLocation);
  if (building.length >= 2 && input.relations && typeof input.relations === 'object') {
    for (const [key, npc] of Object.entries(input.relations)) {
      if (!npc || typeof npc !== 'object') continue;
      const segments = locationDescriptionOf(npc)
        .split('·')
        .map(segment => segment.replace(/\s+/g, ''))
        .filter(Boolean);
      if (!segments.includes(building)) continue;
      present.add(String((npc as { 名字?: unknown }).名字 || key));
      present.add(String(key));
    }
  }

  // 近期正文兜底：刚出场过的人必然在场，不受位置字段滞后影响。
  const narrative = String(input.recentNarrative || '');
  if (narrative && input.relations && typeof input.relations === 'object') {
    for (const [key, npc] of Object.entries(input.relations)) {
      if (!npc || typeof npc !== 'object') continue;
      const name = String((npc as { 名字?: unknown }).名字 || key);
      if (name.length >= 2 && narrative.includes(name)) {
        present.add(name);
        present.add(String(key));
      }
    }
  }
  for (const name of input.excludeNames || []) {
    if (!name) continue;
    present.delete(String(name));
  }
  return present;
}

function coerceFlagScalar(value: unknown): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

function readRuntimeFlag(flags: Record<string, unknown> | undefined, path: string): unknown {
  if (!flags) return undefined;
  let nested: unknown = flags;
  for (const part of path.split('.')) {
    if (!nested || typeof nested !== 'object' || Array.isArray(nested)) {
      nested = undefined;
      break;
    }
    nested = (nested as Record<string, unknown>)[part];
  }
  if (nested !== undefined) return nested;
  if (Object.prototype.hasOwnProperty.call(flags, path)) return flags[path];
  return undefined;
}

function eventIsCompleted(runtime: { flags?: Record<string, unknown>; completedEventIds?: unknown } | null | undefined, eventId: string): boolean {
  if (!runtime) return false;
  const flagKey = `${String(eventId || '').replace(/^lcq\.event\./, 'event.')}.done`;
  if (coerceFlagScalar(readRuntimeFlag(runtime.flags, flagKey)) === true) return true;
  const completed = Array.isArray(runtime.completedEventIds) ? runtime.completedEventIds : [];
  return completed.includes(eventId);
}

/** Characters who have already left the living present cast. */
export function departedPresentNames(runtime: { flags?: Record<string, unknown>; completedEventIds?: unknown } | null | undefined): string[] {
  const names: string[] = [];
  if (eventIsCompleted(runtime, 'lcq.event.s01_02')) names.push('段强');
  if (eventIsCompleted(runtime, 'lcq.event.s02_02')) names.push('王哲');
  return names;
}

/** Live-watch names. Death/departure is `departedPresentNames` only — never `当前外貌状态` (canon profiles stamp 已死亡 on living 王哲/段强). */
export function focusedNpcNamesFromState(stateForAI: {
  社交?: { 关系?: Record<string, unknown> };
  角色?: { 位置?: { 描述?: unknown } };
  世界?: { 状态?: { 剧本模组?: { flags?: Record<string, unknown>; completedEventIds?: unknown } } };
}): string[] {
  const relationships = stateForAI?.社交?.关系;
  if (!relationships || typeof relationships !== 'object') return [];
  const runtime = stateForAI?.世界?.状态?.剧本模组;
  const present = computePresentNames({
    playerLocation: String(stateForAI?.角色?.位置?.描述 || ''),
    relations: relationships,
    excludeNames: departedPresentNames(runtime),
  });
  return Object.entries(relationships)
    .filter(([name, npc]) => {
      if (!npc || typeof npc !== 'object') return false;
      const record = npc as { 实时关注?: unknown; 名字?: unknown };
      const flag = record.实时关注;
      const tracked = flag === true || flag === 1 || flag === 'true' || flag === 'True' || flag === 'TRUE' || flag === '是';
      if (!tracked) return false;
      return present.has(String(name)) || present.has(String(record.名字 || ''));
    })
    .map(([name]) => String(name))
    .filter(name => name.trim().length > 0);
}

/** 不在场角色的档案约束。与传闻／征兆层咬合：想见人就得去打听、去找。 */
export function formatAbsenceGuard(name: string): string {
  return `  【当前不在场】${name}此刻不在你面前。**不得让其本人登场、说话或行动**；只能以听闻、传言、书信、旧事回忆或他人转述的方式提及。玩家若要见他，应通过打听消息、前往其所在之处等方式推进，不得凭一句提名就让人出现。`;
}
