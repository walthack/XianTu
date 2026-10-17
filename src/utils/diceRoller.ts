/**
 * 骰子系统 - 提供真随机的骰点功能
 */

/**
 * 投掷一个 d20 骰子（1-20）
 * 特殊规则：骰到1时有50%概率重投
 * @returns 1-20 之间的随机整数
 */
export function rollD20(): number {
  const result = Math.floor(Math.random() * 20) + 1;
  // 骰到1时，50%概率重投
  if (result === 1 && Math.random() < 0.5) {
    return Math.floor(Math.random() * 20) + 1;
  }
  return result;
}
