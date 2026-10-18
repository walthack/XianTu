/**
 * 骰子系统 - 提供真随机的骰点功能
 */
import { judgementNumbers } from './judgementConfig';

/**
 * 投掷一个 d20 骰子（1-20）
 * 特殊规则：骰到1时有 judgement.dice.rerollOnOneChance 的概率重投（默认 50%）
 * @returns 1 到 judgement.dice.sides（默认 20）之间的随机整数
 */
export function rollD20(): number {
  const { sides, rerollOnOneChance } = judgementNumbers().dice;
  const result = Math.floor(Math.random() * sides) + 1;
  // 骰到1时，按配置的概率重投
  if (result === 1 && Math.random() < rerollOnOneChance) {
    return Math.floor(Math.random() * sides) + 1;
  }
  return result;
}
