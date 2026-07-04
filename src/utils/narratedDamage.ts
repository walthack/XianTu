import { get } from 'lodash';
import type { SaveData } from '@/types/game';

export interface NarratedPlayerDamage {
  amount: number;
  ratio: number;
  severity: 'minor' | 'major';
  reason: string;
}

const PLAYER_HEALTH_PATH = '角色.属性.气血.当前';

function hasPlayerDamageCommand(commands: unknown[]): boolean {
  if (!Array.isArray(commands)) return false;
  return commands.some((command) => {
    if (!command || typeof command !== 'object') return false;
    const cmd = command as Record<string, unknown>;
    const action = typeof cmd.action === 'string' ? cmd.action : '';
    const key = typeof cmd.key === 'string' ? cmd.key.trim() : '';
    if (!['set', 'add', 'push', 'delete'].includes(action)) return false;
    return (
      key === PLAYER_HEALTH_PATH ||
      key === '角色.效果' ||
      key.startsWith('角色.属性.气血.') ||
      key.startsWith('角色.效果.')
    );
  });
}

function parseFailedCombatJudgement(text: string): { margin: number; label: string } | null {
  const judgementPattern = /〔([^〕]*(?:战斗|逃跑)[^〕]*)〕/g;
  for (const match of text.matchAll(judgementPattern)) {
    const marker = match[1] || '';
    const valueMatch = marker.match(/判定值[:：]\s*(-?\d+)/);
    const difficultyMatch = marker.match(/难度[:：]\s*(-?\d+)/);
    if (!valueMatch || !difficultyMatch) continue;
    const value = Number(valueMatch[1]);
    const difficulty = Number(difficultyMatch[1]);
    if (!Number.isFinite(value) || !Number.isFinite(difficulty)) continue;
    if (value >= difficulty) continue;
    return { margin: value - difficulty, label: marker };
  }
  return null;
}

function hasExplicitPlayerInjuryNarration(text: string): boolean {
  if (!text || text === '（AI生成失败）') return false;
  if (/(?:没有|未曾|并未|并没有|险些|差点|几乎|擦着|贴着|避开|躲开|闪过|避过|未伤|无伤)[^。；\n]{0,16}(?:受伤|中招|命中|砍中|刺中|割破|鲜血|见血)/.test(text)) {
    return false;
  }
  return /(?:被|遭|让|令|使)[^。；\n]{0,18}(?:砍中|刺中|斩中|击中|命中|割破|划破|贯穿|洞穿|撕开|撕裂|重创|击伤|打伤)|(?:咽喉|肩|臂|胸|腹|背|肋|腿|腰)[^。；\n]{0,18}(?:一痛|剧痛|鲜血|见血|裂开|割破|划破)|(?:鲜血|血线|血珠|血花|伤口|受伤|中招|挂彩|挂了彩)/.test(text);
}

function getMinorDamageRatio(text: string): number {
  if (/(?:重创|重伤|贯穿|洞穿|撕裂|胸|腹|咽喉|喷溅|血流如注|鲜血淋漓)/.test(text)) return 0.15;
  if (/(?:刺中|砍中|斩中|击中|命中|割破|划破|撕开|伤口|鲜血|血珠|血花|血痕|见血|中招)/.test(text)) return 0.10;
  return 0.05;
}

export function detectNarratedPlayerDamage(
  text: string,
  commands: unknown[],
  saveData: SaveData
): NarratedPlayerDamage | null {
  if (!text || hasPlayerDamageCommand(commands)) return null;

  const judgement = parseFailedCombatJudgement(text);
  if (!judgement) return null;
  if (!hasExplicitPlayerInjuryNarration(text)) return null;

  const current = get(saveData, PLAYER_HEALTH_PATH);
  const max = get(saveData, '角色.属性.气血.上限');
  if (typeof current !== 'number' || typeof max !== 'number') return null;
  if (!Number.isFinite(current) || !Number.isFinite(max) || current <= 0 || max <= 0) return null;

  const severity: NarratedPlayerDamage['severity'] = judgement.margin <= -15 ? 'major' : 'minor';
  const ratio = severity === 'major' ? 0.5 : getMinorDamageRatio(text);
  const amount = -Math.max(1, Math.min(current, Math.round(max * ratio)));

  return {
    amount,
    ratio,
    severity,
    reason: `叙事战斗${severity === 'major' ? '大失败重伤' : '失败受伤'}补账（${judgement.label}）`,
  };
}
