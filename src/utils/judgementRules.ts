/**
 * 行动判定的本地规则源。
 *
 * P0 只收口既有的幸运点/环境计算，保持旧行为不变；它尚不负责触发、
 * 掷骰结算或写入系统.扩展.判定。这些状态预留给后续本地判定引擎。
 */

import { GAME_NUMBERS } from '../modules/sceneModule/numbers';
import { judgementNumbers } from './judgementConfig';

export const JUDGEMENT_STATE_PATH = '系统.扩展.判定';

export interface TurnJudgementData {
  幸运点: number;
  气运值: number;
  环境: {
    灵气浓度: number;
    修炼修正: number;
    炼制修正: number;
    战斗修正: number;
  };
}

interface FortuneStats {
  气运?: unknown;
}

interface LocationStats {
  灵气浓度?: unknown;
}

/**
 * 保持原 AIBidirectionalSystem 的 `||` 回退和随机调用次数，避免 P0
 * 在玩家无感的情况下改变已有幸运点分布。
 */
export function calculateTurnJudgementData(
  innate: FortuneStats | null | undefined,
  acquired: FortuneStats | null | undefined,
  location: LocationStats | null | undefined,
  random: () => number = Math.random,
): TurnJudgementData {
  const { luck, environment } = judgementNumbers();
  const innateFortune = Number(innate?.气运) || luck.defaultInnate;
  const acquiredFortune = Number(acquired?.气运) || 0;
  const fortune = Math.min(GAME_NUMBERS.factors.fortuneMax, Math.max(GAME_NUMBERS.factors.fortuneMin, innateFortune + acquiredFortune));
  const baseRandom = Math.floor(random() * luck.randomSpan) + luck.randomOffset;
  const fortuneUpperBonus = Math.floor(random() * (fortune + 1));
  const fortuneLowerBonus = Math.ceil(fortune * luck.lowerBonusRatio);
  const spiritDensity = Number(location?.灵气浓度) || environment.defaultSpiritDensity;
  const offset = spiritDensity - environment.neutralSpiritDensity;

  return {
    幸运点: baseRandom + fortuneUpperBonus + fortuneLowerBonus,
    气运值: fortune,
    环境: {
      灵气浓度: spiritDensity,
      修炼修正: Math.round(offset / environment.divisor.cultivate),
      炼制修正: Math.round(offset / environment.divisor.craft),
      战斗修正: Math.round(offset / environment.divisor.combat),
    },
  };
}

/** P0 仅观测旧正文标签，绝不把模型声称的结果写回存档。 */
export function extractLegacyJudgementMarkers(text: string): string[] {
  return [...text.matchAll(/[〔〖]([^〕〗]*(?:骰点|判定值|最终值|总值|难度)[^〕〗]*)[〕〗]/g)].map(match => match[1]);
}

/** Legacy model-authored rolls are never authoritative and must not reach UI or memory as receipts. */
export function stripLegacyJudgementMarkers(text: string): string {
  return text
    .replace(/[〔〖][^〕〗]*(?:骰点|判定值|最终值|总值|难度)[^〕〗]*[〕〗]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
