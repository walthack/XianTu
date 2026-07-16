import { cloneDeep, get, set } from 'lodash';
import type { SaveData } from '@/types/game';

function changedLeafPaths(before: unknown, after: unknown, prefix: string[] = []): string[][] {
  if (Object.is(before, after)) return [];
  if (!after || typeof after !== 'object' || Array.isArray(after)) return [prefix];
  const beforeObject = before && typeof before === 'object' && !Array.isArray(before)
    ? before as Record<string, unknown>
    : {};
  return Object.entries(after as Record<string, unknown>)
    .flatMap(([key, value]) => changedLeafPaths(beforeObject[key], value, [...prefix, key]));
}

/**
 * 三方合并后台事件对账结果：只应用隔离副本相对启动基线新增/改变的 flag，
 * 并按 id 追加分歧记录。当前存档在后台期间发生的其他变化一律保留。
 */
export function mergeDeferredReconcileResult(
  currentSave: SaveData,
  baselineSave: SaveData,
  isolatedSave: SaveData,
): boolean {
  const runtimePath = ['世界', '状态', '剧本模组'];
  const currentRuntime = get(currentSave, runtimePath) as Record<string, any> | undefined;
  const baselineRuntime = get(baselineSave, runtimePath) as Record<string, any> | undefined;
  const isolatedRuntime = get(isolatedSave, runtimePath) as Record<string, any> | undefined;
  if (!currentRuntime || !baselineRuntime || !isolatedRuntime) return false;

  let changed = false;
  for (const path of changedLeafPaths(baselineRuntime.flags || {}, isolatedRuntime.flags || {})) {
    if (!path.length) continue;
    set(currentRuntime.flags, path, cloneDeep(get(isolatedRuntime.flags, path)));
    changed = true;
  }

  const currentLedger = Array.isArray(currentRuntime.divergences) ? currentRuntime.divergences : (currentRuntime.divergences = []);
  const knownIds = new Set(currentLedger.map((item: any) => item?.id).filter(Boolean));
  for (const item of Array.isArray(isolatedRuntime.divergences) ? isolatedRuntime.divergences : []) {
    if (!item?.id || knownIds.has(item.id)) continue;
    currentLedger.push(cloneDeep(item));
    knownIds.add(item.id);
    changed = true;
  }

  return changed;
}
