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

function hasNegatedPlayerDamageNarration(text: string): boolean {
  return /(?:没有|未曾|并未|并没有|只是|仅是|不过)[^。；\n]{0,16}(?:受伤|中招|命中|砍中|刺中|割破)|(?:毫发无伤|未伤分毫|没有受伤|并未受伤|未曾受伤|无伤大雅)/.test(text);
}

function hasExplicitPlayerDamageNarration(text: string): boolean {
  if (!text || text === '（AI生成失败）') return false;
  if (hasNegatedPlayerDamageNarration(text)) {
    return false;
  }
  const injuryPattern = /(?:被|遭|让|令|使)[^。；\n]{0,18}(?:砍中|刺中|斩中|击中|命中|割破|划破|贯穿|洞穿|撕开|撕裂|重创|击伤|打伤)|(?:咽喉|肩|臂|胸|腹|背|肋|腿|腰)[^。；\n]{0,18}(?:一痛|剧痛|鲜血|见血|裂开|割破|划破)|(?:鲜血|血线|血珠|血花|伤口|受伤|中招|挂彩|挂了彩)/;
  const impactPattern = /(?:被|遭|让|令|使)[^。；\n]{0,18}(?:震退|击退|震飞|击飞|撞飞|扫飞|掀翻|砸倒|摔倒|震得|撞得|压得|打得)|(?:胸口发闷|气血翻涌|气息紊乱|经脉震荡|经脉刺痛|护体灵光[^。；\n]{0,8}(?:碎|裂|散)|护身法器[^。；\n]{0,8}(?:碎|裂)|虎口发麻|半身发麻|眼前发黑|闷哼一声|喉头一甜)/;
  return injuryPattern.test(text) || impactPattern.test(text);
}

function getMinorDamageRatio(text: string): number {
  if (/(?:重创|重伤|贯穿|洞穿|撕裂|喷溅|血流如注|鲜血淋漓|震飞|击飞|撞飞|扫飞|掀翻|眼前发黑|喉头一甜|(?:胸|腹|咽喉)[^。；\n]{0,12}(?:贯穿|洞穿|撕裂|割破|划破|鲜血|剧痛))/.test(text)) return 0.15;
  if (/(?:刺中|砍中|斩中|击中|命中|割破|划破|撕开|伤口|鲜血|血珠|血花|血痕|见血|中招|震退|击退|砸倒|摔倒|气血翻涌|气息紊乱|经脉震荡|胸口发闷)/.test(text)) return 0.10;
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
  if (!hasExplicitPlayerDamageNarration(text)) return null;

  const current = get(saveData, PLAYER_HEALTH_PATH);
  const max = get(saveData, '角色.属性.气血.上限');
  if (typeof current !== 'number' || typeof max !== 'number') return null;
  if (!Number.isFinite(current) || !Number.isFinite(max) || current <= 0 || max <= 0) return null;

  const severity: NarratedPlayerDamage['severity'] = judgement.margin <= -15 ? 'major' : 'minor';
  const ratio = severity === 'major' ? 0.4 : getMinorDamageRatio(text);
  const amount = -Math.max(1, Math.min(current, Math.round(max * ratio)));

  return {
    amount,
    ratio,
    severity,
    reason: `叙事战斗${severity === 'major' ? '大失败重伤' : '失败受伤'}补账（${judgement.label}）`,
  };
}
