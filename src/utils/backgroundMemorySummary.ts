import type { SaveData } from '@/types/game';

export interface MemorySummaryThresholdSettings {
  midTermTrigger?: unknown;
}

export function shouldQueueAutomaticMemorySummary(
  saveData: SaveData,
  settings: MemorySummaryThresholdSettings,
): boolean {
  const configured = Number(settings?.midTermTrigger);
  const threshold = Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 25;
  const memories = (saveData as any)?.社交?.记忆?.中期记忆;
  return Array.isArray(memories) && memories.length >= threshold;
}

/** Schedule auxiliary summarization only after the primary narrative state has committed. */
export function queueIsolatedMemorySummary(
  task: () => Promise<unknown>,
  onError: (error: unknown) => void = error => console.error('[记忆总结] 后台任务失败:', error),
  schedule: (callback: () => void) => void = queueMicrotask,
): void {
  schedule(() => {
    void Promise.resolve()
      .then(task)
      .catch(onError);
  });
}

/** Remove only the exact prefix that was summarized; preserve memories appended while the API was in flight. */
export function remainingMemoriesAfterSummary(
  currentMemories: unknown,
  summarizedPrefix: string[],
): string[] | null {
  if (!Array.isArray(currentMemories) || summarizedPrefix.length === 0) return null;
  if (currentMemories.length < summarizedPrefix.length) return null;
  const prefixUnchanged = summarizedPrefix.every((memory, index) => currentMemories[index] === memory);
  return prefixUnchanged ? currentMemories.slice(summarizedPrefix.length) : null;
}

/**
 * 总结结果回来时若有前台回合在途：回合开头取的存档快照里没有这次总结，回合末整份写回会把它盖掉。
 * 先等回合结束再落账；回合只往中期记忆后面追加，落账处的前缀核对仍然成立。
 * 返回 'settled'（回合已结束或本来就没有）、'cancelled'（shouldCancel 为真，如存档已切换）、'timeout'。
 */
export async function waitForForegroundTurnToSettle(
  isTurnActive: () => boolean,
  options: { timeoutMs: number; pollMs?: number; shouldCancel?: () => boolean },
): Promise<'settled' | 'cancelled' | 'timeout'> {
  const pollMs = options.pollMs ?? 50;
  const deadline = Date.now() + options.timeoutMs;
  while (isTurnActive()) {
    if (options.shouldCancel?.()) return 'cancelled';
    if (Date.now() >= deadline) return 'timeout';
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
  return options.shouldCancel?.() ? 'cancelled' : 'settled';
}
