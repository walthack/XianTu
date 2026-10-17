/**
 * 最小类型 stub（world_sim 已整体移除，旧 world_sim 存档不再支持）。
 * 仅因 runtime.ts（冻结文件，待批准修改）仍引用这里的导出而保留；
 * runtime.ts 清理获批后应整个删除本文件。
 */
import type { ScenarioModEvent } from './schema';

export interface WorldSimulationRuntimeState {
  actionReceipts?: unknown[];
  [key: string]: unknown;
}

export function getWorldSimulationFocusEvent(_runtime: unknown): ScenarioModEvent | undefined {
  return undefined;
}

/** 原实现仅对 world_sim 运行态生效（canon_companion 恒返回空）；现恒为空操作。 */
export function deliverDueWorldOmens(
  _runtime: unknown,
  _transitions: Array<{ type: string; id: string }>,
): unknown[] {
  return [];
}
