/**
 * 自由行动写 NPC 记忆：两层里只写层 1（个人记忆）。层 2（私有知情）永不写（裁定 #149）。
 * - 轻事件：社交.关系[id].记忆[] 末尾追加一条模板文本，保留最近 memory.keep 条。
 * - 大事（|好感增量| ≥ affinity.majorAbs）：另写一条 episode 到 actorEngine.actorMemory[id].episodes，
 *   排序与封顶口径同 runtime.ts 的 normalizeMemoryEpisodes（按显著度留 memory.episodeKeep=12 条，再按时间排）；该函数未导出，这里重写并由单测核对一致。
 * 记忆正文是内容包模板，不收叙事正文、不收模型文字。
 */
import type { SaveData } from '@/types/game';
import { relationshipOf } from '../ledger/affinityIdentity';
import { freeActionConfig } from './config';

export interface MemoryEpisode { id: string; eventId: string; summary: string; tags: string[]; salience: number; occurredAtTurn: number }

const runtimeOf = (save: unknown): any => (save as any)?.世界?.状态?.剧本模组;

/** 与 runtime.ts normalizeMemoryEpisodes 同口径。 */
export function normalizeEpisodes(episodes: MemoryEpisode[]): MemoryEpisode[] {
  return structuredClone(episodes)
    .sort((a, b) => b.salience - a.salience || b.occurredAtTurn - a.occurredAtTurn || (a.id < b.id ? -1 : 1))
    .slice(0, freeActionConfig().memory.episodeKeep)
    .sort((a, b) => a.occurredAtTurn - b.occurredAtTurn || (a.id < b.id ? -1 : 1));
}

export function pushLightMemory(save: SaveData, targetId: string, text: string): void {
  const profile = relationshipOf(save as any, targetId)?.profile as any;
  if (!profile) return;
  const keep = freeActionConfig().memory.keep;
  const memories: string[] = Array.isArray(profile.记忆) ? profile.记忆 : [];
  memories.push([...text].slice(0, freeActionConfig().memory.chars).join(''));
  profile.记忆 = memories.slice(-keep);
}

export function pushMajorEpisode(save: SaveData, targetId: string, episode: MemoryEpisode): void {
  const runtime = runtimeOf(save);
  if (!runtime) return;
  const engine = runtime.actorEngine ||= { surfacedAgendaIds: [], receipts: [], entitlements: [] };
  const memory = engine.actorMemory ||= {};
  const current = memory[targetId] ||= { relationships: {}, knowledge: [], episodes: [], updatedAtTurn: episode.occurredAtTurn };
  const episodes: MemoryEpisode[] = Array.isArray(current.episodes) ? current.episodes : [];
  if (!episodes.some(item => item.id === episode.id)) episodes.push(structuredClone(episode));
  current.episodes = normalizeEpisodes(episodes);
  current.updatedAtTurn = episode.occurredAtTurn;
}
