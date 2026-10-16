/**
 * 模块化叙事路径的 NPC 角色卡有界层。角色卡=每回合现算给模型看的几行文字，不是存档；
 * 静态部分来自角色总表（经阶段档物化），动态部分来自存档（docs/CHARACTER-DATA-STRUCTURE.md）。
 *
 * 旧路径（storyContext.formatFocusedCharacter）把立场、底线、记忆、承重保护都发给模型；
 * 试玩存档走模块化路径，那些全部缺席。本模块按角色 id 从存档/正典里把同一批数据取回来，
 * 只复用旧路径的函数（formatRelationStance / formatAffinityCap / shouldRevealBottomLine /
 * formatSealedCharacter / loadBearing*），不另写一套规则。
 *
 * 有界：条数与字数上限全部来自 GAME_NUMBERS.npcCard；只对 maxCards 个在场人物取卡；
 * 记忆取末 N 条，事件取最近 N 条，均不随游玩长度增长；外貌标签来自角色身上的状态（actorStatusRead），条数受 status.appearance.maxTags 限制。
 *
 * 阶段门：底线、禁用、身份门禁只读「当前关卡投影后的」profile.notes（characterResolver 已按关过滤），
 * 不回落静态卡/关系记录里的 人格底线，所以南荒关对底线的阻挡原样保留。
 */
import type { SaveData } from '@/types/game';
import { GAME_NUMBERS } from '../sceneModule/numbers';
import { relationshipOf } from './ledger/affinityIdentity';
import { formatRelationStance } from './relationStance';
import { formatAffinityCap } from './affinityCaps';
import { getRegistrySpeechStyleById } from './characterResolver';
import { appearanceTagsOf } from './actorStatusRead';
import {
  BOTTOMLINE_HIDDEN_NOTE,
  formatLoadBearingProtection,
  formatSealedCharacter,
  loadBearingCharacterIds,
  shouldRevealBottomLine,
} from './storyContext';

const GATE_NOTE_TAGS = ['本阶段禁用', '关系身份门禁'] as const;

export interface NpcCard {
  card: string[];
  /** 画像里没有谈吐时的注册表补位；调用方负责套泄密过滤。封口人物不给。 */
  speechStyle?: string;
}

function clip(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** 该角色身上带 major_episode 标签的记忆（自由行动 ≥ majorAbs 的好感变化，及作者回应里的大事），最近的在后。 */
function majorEpisodes(runtime: any, characterId: string): any[] {
  const episodes: any[] = runtime.actorEngine?.actorMemory?.[characterId]?.episodes || [];
  return episodes.filter(item => Array.isArray(item?.tags) && item.tags.includes('major_episode'))
    .sort((a, b) => (a.occurredAtTurn - b.occurredAtTurn) || (a.id < b.id ? -1 : 1));
}

function recentRelatedEvents(runtime: any, characterId: string, count: number, chars: number): string[] {
  const related = new Set<string>((runtime.events || [])
    .filter((event: any) => (event.relatedCharacterIds || []).includes(characterId))
    .map((event: any) => event.id));
  const chronicle: any[] = runtime.chronicle || [];
  const found: string[] = [];
  for (let i = chronicle.length - 1; i >= 0 && found.length < count; i--) {
    const entry = chronicle[i];
    if (entry?.type !== 'event') continue;
    const prefix = `chronicle.${entry.stageId}.`;
    if (!String(entry.id).startsWith(prefix) || !related.has(String(entry.id).slice(prefix.length))) continue;
    found.push(clip(`${entry.title}：${entry.detail ?? ''}`, chars));
  }
  // 大事记忆（自由行动等）最近的优先；有编年史事件时至少给它留一个位置，合计仍不超过 count。
  const chronicleFound = found.reverse();
  const episodes = majorEpisodes(runtime, characterId);
  const episodeSlots = Math.min(episodes.length, chronicleFound.length ? Math.max(0, count - 1) : count);
  const recentEpisodes = episodes.slice(episodes.length - episodeSlots).map(item => clip(item.summary, chars)).filter(Boolean);
  return [...chronicleFound.slice(Math.max(0, chronicleFound.length - (count - recentEpisodes.length))), ...recentEpisodes];
}

export function readNpcCard(saveData: SaveData, characterId: string): NpcCard | undefined {
  const runtime = (saveData as any)?.世界?.状态?.剧本模组;
  const character = runtime?.canon?.characters?.find((item: any) => item.id === characterId);
  if (!character) return undefined;
  const sealed = formatSealedCharacter(character, runtime, false);
  if (sealed !== undefined) return { card: [sealed] };

  const cfg = GAME_NUMBERS.npcCard;
  const profile = character.profile || {};
  const record = relationshipOf(saveData as any, characterId)?.profile as any;
  const canonFav = runtime.canon?.playerRelationships?.find((item: any) => item.characterId === characterId)?.favorability;
  const fav = Number(record?.好感度 ?? canonFav ?? 0) || 0;
  const label = String(record?.与玩家关系 ?? '');
  const notes: string[] = Array.isArray(profile.notes) ? profile.notes.map((note: unknown) => String(note)) : [];

  // 顺序即优先级：超出 maxCardChars 时从末尾开始丢。
  const lines: string[] = [];
  if (record || canonFav !== undefined) {
    lines.push(formatRelationStance(character.name, {
      favorability: fav,
      relationLabel: label,
      stance: runtime.stanceStates?.[characterId]?.stance || runtime.stanceStates?.[character.name]?.stance,
    }));
    const cap = formatAffinityCap(character.name, label);
    if (cap) lines.push(cap.trim());
  }
  const gates = notes
    .filter(note => GATE_NOTE_TAGS.some(tag => note.startsWith(`【${tag}】`)))
    .slice(0, cfg.maxGateNotes)
    .map(note => clip(note, cfg.noteChars));
  if (gates.length) lines.push(`阶段门：${gates.join('；')}`);
  const bottom = notes.find(note => note.startsWith('【底线】'));
  if (bottom) lines.push(shouldRevealBottomLine(fav, label) ? clip(bottom, cfg.noteChars) : BOTTOMLINE_HIDDEN_NOTE);
  if (loadBearingCharacterIds(runtime).has(characterId)) lines.push(formatLoadBearingProtection([character.name]));
  const memories = (Array.isArray(record?.记忆) ? record.记忆 : []).slice(-cfg.maxMemories)
    .map((memory: unknown) => clip(memory, cfg.memoryChars)).filter(Boolean);
  if (memories.length) lines.push(`最近记忆：${memories.join('；')}`);
  const appearance = appearanceTagsOf(saveData, characterId);
  if (appearance.length) lines.push(`外貌：${appearance.join('、')}`);
  const events = recentRelatedEvents(runtime, characterId, cfg.maxEvents, cfg.eventChars);
  if (events.length) lines.push(`相关重大事件：${events.join('；')}`);

  while (lines.length > 1 && lines.reduce((total, line) => total + line.length, 0) > cfg.maxCardChars) lines.pop();
  const speechStyle = getRegistrySpeechStyleById(characterId);
  return { card: lines, ...(speechStyle ? { speechStyle } : {}) };
}
