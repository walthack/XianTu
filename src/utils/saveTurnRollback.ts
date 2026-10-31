/**
 * 失败回合撤回（真机 REPORT-8091-69ab6bdd 127 补测：闭关回合「AI响应为空或格式错误」，时间没推进，判定写入的境界 +10% 却留下）。
 * 判定结果、自由行动结算都在叙事回合之前就写进存档；回合失败（没有可用响应、也没有已提交的事务）时，
 * 发送流程用回合开始前的快照整份恢复。这里只判断「要不要恢复」，恢复本身由 MainGamePanel 调 gameStateStore 完成。
 */
import type { SaveData } from '@/types/game';

/** 仅元数据时间戳不同不算有改动，免得无谓重存。 */
function comparable(save: SaveData | null | undefined): string {
  if (!save) return '';
  const copy = JSON.parse(JSON.stringify(save));
  if (copy?.元数据) { delete copy.元数据.更新时间; delete copy.元数据.游戏时长秒; }
  return JSON.stringify(copy);
}

/** 回合开始前快照与当前状态确有差异时才恢复。 */
export function shouldRestorePreTurnSave(preTurn: SaveData | null | undefined, current: SaveData | null | undefined): boolean {
  if (!preTurn) return false;
  return comparable(preTurn) !== comparable(current);
}
