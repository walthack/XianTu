import { cloneDeep } from 'lodash';
import { noteBackgroundStartedAfterCommit } from './turnTelemetry';
import type { SaveData } from '@/types/game';

export interface BackgroundMemoryWorkTask {
  saveSlot: string;
  revision: number;
  snapshot: SaveData;
  isStale: () => boolean;
  waitIfForegroundBusy: () => Promise<void>;
}

export type BackgroundMemoryWorkRunner = (task: BackgroundMemoryWorkTask) => Promise<void>;

let latestRevisionBySlot = new Map<string, number>();
let slotChains = new Map<string, Promise<void>>();
let flushTail: Promise<void> = Promise.resolve();
let foregroundDepth = 0;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function beginForegroundAiTurn(): void {
  foregroundDepth += 1;
}

export function endForegroundAiTurn(): void {
  foregroundDepth = Math.max(0, foregroundDepth - 1);
}

export function isForegroundAiTurnActive(): boolean {
  return foregroundDepth > 0;
}

export function currentMemoryWorkRevision(saveSlot: string): number {
  return latestRevisionBySlot.get(saveSlot) || 0;
}

export function bumpMemoryWorkRevision(saveSlot: string): number {
  const slot = saveSlot || '';
  if (!slot) return 0;
  const revision = (latestRevisionBySlot.get(slot) || 0) + 1;
  latestRevisionBySlot.set(slot, revision);
  return revision;
}

export function resetBackgroundMemoryWorkForTests(): void {
  latestRevisionBySlot = new Map();
  slotChains = new Map();
  flushTail = Promise.resolve();
  foregroundDepth = 0;
}

export function flushBackgroundMemoryWorkForTests(): Promise<void> {
  return flushTail;
}

/**
 * One exclusive writer per save slot. Different slots may run in parallel.
 * Long LLM calls must stay outside this queue; only index/memory writes enter it.
 */
export function runExclusive<T>(saveSlot: string, task: () => Promise<T>): Promise<T> {
  const slot = saveSlot || '';
  if (!slot) return task();
  const previous = slotChains.get(slot) || Promise.resolve();
  const run = previous
    .catch(() => undefined)
    .then(task);
  slotChains.set(slot, run.then(() => undefined, () => undefined));
  flushTail = Promise.all([flushTail, slotChains.get(slot)]).then(() => undefined);
  return run;
}

async function runDefaultIndex(task: BackgroundMemoryWorkTask): Promise<void> {
  const snapshot = task.snapshot as any;
  if (task.isStale()) return;
  await task.waitIfForegroundBusy();
  if (task.isStale()) return;

  const { vectorMemoryService } = await import('@/services/vectorMemoryService');
  const { narrativeRagService } = await import('@/services/narrativeRagService');
  const { characterRagService } = await import('@/services/characterRagService');

  if (task.saveSlot) {
    if (task.isStale()) return;
    await task.waitIfForegroundBusy();
    if (task.isStale()) return;
    await vectorMemoryService.init(task.saveSlot);
    await narrativeRagService.init(task.saveSlot);
  }
  if (task.isStale()) return;
  await characterRagService.init();

  if (vectorMemoryService.isEnabled()) {
    if (task.isStale()) return;
    await task.waitIfForegroundBusy();
    if (task.isStale()) return;
    const memories = snapshot?.社交?.记忆?.长期记忆 || [];
    if (Array.isArray(memories) && memories.length > 0) {
      await vectorMemoryService.syncFromLongTermMemories(memories);
    }
  }
  if (narrativeRagService.isEnabled()) {
    if (task.isStale()) return;
    await task.waitIfForegroundBusy();
    if (task.isStale()) return;
    await narrativeRagService.ensureIndexed(snapshot);
  }
  if (characterRagService.isEnabled()) {
    if (task.isStale()) return;
    await task.waitIfForegroundBusy();
    if (task.isStale()) return;
    await characterRagService.ensureIndexed();
  }
}

export function scheduleBackgroundMemoryWork(
  saveData: SaveData,
  saveSlotId?: string,
  runner: BackgroundMemoryWorkRunner = runDefaultIndex,
): number | null {
  const slot = saveSlotId || '';
  if (!slot) return null;
  noteBackgroundStartedAfterCommit();
  const revision = bumpMemoryWorkRevision(slot);
  const snapshot = cloneDeep(saveData);
  void runExclusive(slot, async () => {
    if (latestRevisionBySlot.get(slot) !== revision) return;
    const isStale = () => latestRevisionBySlot.get(slot) !== revision;
    const waitIfForegroundBusy = async () => {
      while (foregroundDepth > 0) {
        if (isStale()) return;
        await delay(10);
      }
    };
    try {
      await waitIfForegroundBusy();
      if (isStale()) return;
      await runner({
        saveSlot: slot,
        revision,
        snapshot,
        isStale,
        waitIfForegroundBusy,
      });
    } catch (error) {
      console.warn('[后台记忆] 索引失败（不影响回合）:', error);
    }
  });
  return revision;
}

/** After a memory summary lands, invalidate stale snapshot index jobs, then write the new vector. */
export async function commitMemorySummaryIndex(input: {
  saveSlot: string;
  write: () => Promise<void>;
}): Promise<void> {
  const slot = input.saveSlot || '';
  if (!slot) {
    await input.write();
    return;
  }
  bumpMemoryWorkRevision(slot);
  await runExclusive(slot, input.write);
}
