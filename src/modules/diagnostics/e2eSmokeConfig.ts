/** 端到端冒烟聚合（scripts/e2e-smoke.mjs）的数值：单个脚本超时。数值在 game-numbers.qingyu.json 的 e2eSmoke 段，这里只登记体检。 */
import { GAME_NUMBERS, registerNumbersValidator } from '../sceneModule/numbers';

export interface E2eSmokeConfig { scriptTimeoutMs: number }

export function validateE2eSmokeConfig(cfg: E2eSmokeConfig | undefined = (GAME_NUMBERS as { e2eSmoke?: E2eSmokeConfig }).e2eSmoke): string[] {
  if (!cfg || typeof cfg !== 'object') return ['e2eSmoke 段缺失'];
  return Number.isInteger(cfg.scriptTimeoutMs) && cfg.scriptTimeoutMs > 0 ? [] : ['e2eSmoke.scriptTimeoutMs 须为正整数（毫秒）'];
}
registerNumbersValidator(() => validateE2eSmokeConfig());
