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
