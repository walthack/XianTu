import { get, set } from 'lodash';
import type { SaveData } from '@/types/game';

const HEALTH_PATH = '角色.属性.气血.当前';
const HEALTH_MAX_PATH = '角色.属性.气血.上限';
const PLAYER_NAME_PATH = '角色.身份.名字';

export interface NonfatalHealthRecovery {
  oldValue: number;
  newValue: number;
  reason: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * “气血=0”是 UI 的硬死亡开关，故只有正文明确写明玩家死亡时才允许落到 0。
 * NPC 死亡、事件标题中的“死亡”或“濒死”都不能据此杀死玩家。
 */
export function hasExplicitPlayerDeathNarration(saveData: SaveData, narration: string): boolean {
  const playerName = String(get(saveData, PLAYER_NAME_PATH) || '').trim();
  const subject = ['你', '玩家', '主角', playerName].filter(Boolean).map(escapeRegExp).join('|');
  if (!subject || !narration) return false;
  const death = '死亡|死去|身亡|毙命|殒命|陨落|气绝|断气|咽气|命绝|横死|丧命';
  return new RegExp(`(?:${subject})[^。；！？，,]{0,20}(?:${death})`).test(narration);
}

/**
 * 恢复“正文未写玩家死亡、数据却把气血扣为 0”的误杀存档。
 * 取上限 1%（至少 1）而非满血，保留昏迷/重伤的叙事后果。
 */
export function recoverUnmarkedPlayerZeroHealth(
  saveData: SaveData,
  narration: string,
): NonfatalHealthRecovery | null {
  const current = get(saveData, HEALTH_PATH);
  const max = get(saveData, HEALTH_MAX_PATH);
  if (typeof current !== 'number' || current > 0 || typeof max !== 'number' || max <= 0) return null;
  if (hasExplicitPlayerDeathNarration(saveData, narration)) return null;

  const restored = Math.max(1, Math.ceil(max * 0.01));
  set(saveData, HEALTH_PATH, restored);
  return {
    oldValue: current,
    newValue: restored,
    reason: '正文未明确写玩家死亡，气血归零按昏迷/重伤保底恢复至上限 1%',
  };
}
