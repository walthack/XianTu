/**
 * 行动判定的本地规则源。
 *
 * P0 只收口既有的幸运点/环境计算，保持旧行为不变；它尚不负责触发、
 * 掷骰结算或写入系统.扩展.判定。这些状态预留给后续本地判定引擎。
 */

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
  const innateFortune = Number(innate?.气运) || 5;
  const acquiredFortune = Number(acquired?.气运) || 0;
  const fortune = Math.min(10, Math.max(0, innateFortune + acquiredFortune));
  const baseRandom = Math.floor(random() * 16) - 10;
  const fortuneUpperBonus = Math.floor(random() * (fortune + 1));
  const fortuneLowerBonus = Math.ceil(fortune * 0.5);
  const spiritDensity = Number(location?.灵气浓度) || 50;

  return {
    幸运点: baseRandom + fortuneUpperBonus + fortuneLowerBonus,
    气运值: fortune,
    环境: {
      灵气浓度: spiritDensity,
      修炼修正: Math.round((spiritDensity - 50) / 10),
      炼制修正: Math.round((spiritDensity - 50) / 15),
      战斗修正: Math.round((spiritDensity - 50) / 20),
    },
  };
}

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${value}`;
}

export function formatTurnJudgementPrompt(data: TurnJudgementData): string {
  return `# 本回合判定数据（前端已计算）
**幸运点**: ${signed(data.幸运点)}
**环境修正**:
  - 灵气浓度: ${data.环境.灵气浓度}
  - 修炼/突破: ${signed(data.环境.修炼修正)}
  - 炼丹/炼器: ${signed(data.环境.炼制修正)}
  - 战斗施法: ${signed(data.环境.战斗修正)}

⚠️ **重要**：判定时直接使用以上数值，不要自己计算！
- 幸运点固定为: ${signed(data.幸运点)}
- 环境修正根据判定类型选择对应的值`;
}

/** P0 仅观测旧正文标签，绝不把模型声称的结果写回存档。 */
export function extractLegacyJudgementMarkers(text: string): string[] {
  return [...text.matchAll(/〔([^〕]*(?:判定值|难度)[^〕]*)〕/g)].map(match => match[1]);
}
