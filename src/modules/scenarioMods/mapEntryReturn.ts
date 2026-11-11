import type { SaveData } from '@/types/game';
import { CONTENT_PACKS, packText } from '../contentPacks';
import { activeScene } from '../sceneModule/host/ext';
import { hasPendingProductionCriticalEvent } from './runtime';
import type { MapEntry } from './mapEntries';

/**
 * 地图入口关走完后回出发关：判定沿用 stage_ready 的条件（无当前章、无激活事件、无待完成关键事件），只去掉对 nextStageId 的要求。
 * 入口关自带下一关的走正常启程链；条目没声明 returnLabelTextId 的入口不提供返回。
 * 不能并进 mapEntries.ts：runtime.ts 已导入 mapEntries，反向导入 runtime 会成环。
 */
export function mapEntryReturnTarget(save: SaveData): { entry: MapEntry; base: any } | null {
  const rt = (save as any)?.世界?.状态?.剧本模组;
  const resume = (save as any)?.系统?.扩展?.mapEntryResume;
  const entry = (CONTENT_PACKS.mapEntries || []).find(e => e.id === resume?.entryId);
  if (!rt || !entry?.returnLabelTextId || !resume?.runtime?.modId) return null;
  if (rt.modId !== entry.stageId || rt.nextStageId || rt.gameOver || activeScene(save)) return null;
  if (rt.currentChapterId || (rt.activeEventIds || []).length || hasPendingProductionCriticalEvent(rt)) return null;
  return { entry, base: resume.runtime };
}

/** 填入出发关名：文案里的 {stage}。 */
export function mapEntryReturnText(textId: string, base: any): string {
  return packText(textId).replace(/\{stage\}/g, String(base?.modName || base?.modId || ''));
}

/** 返回出发关是玩家主动点的命令，不自动切关。 */
export function getMapEntryReturnOffer(save: SaveData): { entryId: string; label: string } | null {
  const target = mapEntryReturnTarget(save);
  return target ? { entryId: target.entry.id, label: mapEntryReturnText(target.entry.returnLabelTextId!, target.base) } : null;
}
