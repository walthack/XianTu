import type { SaveData } from '@/types/game';

/** Only imported ready checkpoints fork; the original and normal saves stay unchanged. */
export function checkpointWorkingCopy(source: SaveData, sourceSlot: string): SaveData | null {
  const marker = (source as any)?.系统?.扩展?.战斗检查点来源;
  if (!marker?.newSceneReady || marker.workingCopy) return null;
  const copy = JSON.parse(JSON.stringify(source)) as SaveData;
  const next = (copy as any).系统.扩展.战斗检查点来源;
  next.workingCopy = true;
  next.sourceSlot = sourceSlot;
  return copy;
}
