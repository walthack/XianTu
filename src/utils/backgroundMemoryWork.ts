import { noteBackgroundStartedAfterCommit } from './turnTelemetry';
import type { SaveData } from '@/types/game';

export function scheduleBackgroundMemoryWork(saveData: SaveData, saveSlotId?: string): void {
  const slot = saveSlotId || '';
  if (!slot) return;
  noteBackgroundStartedAfterCommit();
  const snapshot = saveData;
  void (async () => {
    try {
      const { vectorMemoryService } = await import('@/services/vectorMemoryService');
      const { narrativeRagService } = await import('@/services/narrativeRagService');
      const { characterRagService } = await import('@/services/characterRagService');
      if (slot) {
        await vectorMemoryService.init(slot);
        await narrativeRagService.init(slot);
      }
      await characterRagService.init();
      if (vectorMemoryService.isEnabled()) {
        const memories = (snapshot as any)?.社交?.记忆?.长期记忆 || [];
        if (Array.isArray(memories) && memories.length > 0) {
          await vectorMemoryService.syncFromLongTermMemories(memories);
        }
      }
      if (narrativeRagService.isEnabled()) {
        await narrativeRagService.ensureIndexed(snapshot);
      }
      if (characterRagService.isEnabled()) {
        await characterRagService.ensureIndexed();
      }
    } catch (error) {
      console.warn('[后台记忆] 索引失败（不影响回合）:', error);
    }
  })();
}
