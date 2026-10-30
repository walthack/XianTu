import type { SaveData } from '@/types/game';
import { CONTENT_PACKS } from '../contentPacks';
import { resolveLedgerPath } from './ledgerConditions';
import { activeScene } from '../sceneModule/host/ext';

export interface MapEntry { id: string; stageId: string; eventId: string; locationId: string; readyPath: string }

export function mapEntryReady(save: SaveData, entry: MapEntry): boolean {
  const rt = (save as any).世界?.状态?.剧本模组;
  const ext = (save as any).系统?.扩展 || {};
  return !!rt && !rt.gameOver && !activeScene(save) && rt.modId !== entry.stageId
    && !ext.mapEntryResume && !Object.values(ext).some((v: any) => typeof v?.kind === 'string' && /demo|playtest/.test(v.kind))
    && resolveLedgerPath(entry.readyPath, rt, save)?.value === true;
}

/** At the post-ledger seam: persisted delivery survives stage changes; previews only change their clone. */
export function syncMapEntryMessages(save: SaveData, rt: any, transitions: Array<{ type: string; id: string }>): void {
  for (const entry of CONTENT_PACKS.mapEntries || []) {
    const previous = (save as any).系统?.扩展?.mapEntryMessages?.[entry.id];
    if (resolveLedgerPath(`done.${entry.eventId}`, rt, save)?.value === true) {
      if (previous) previous.done = true;
      continue;
    }
    if (previous?.done || !mapEntryReady(save, entry)) continue;
    const system = (save as any).系统 ||= {};
    const ext = system.扩展 ||= {};
    const state = (ext.mapEntryMessages ||= {})[entry.id] ||= {};
    const template = CONTENT_PACKS.stages.find(s => s.manifest.id === entry.stageId)?.scenario.events?.find(e => e.id === entry.eventId);
    if (!template) continue;
    if (!rt.events.some((e: any) => e.id === entry.eventId)) {
      // Optional message actions coexist with the current main story anchor.
      rt.events.push({ ...structuredClone(template), critical: false, exploration: true });
    }
    const chapter = rt.chapters.find((c: any) => c.id === rt.currentChapterId);
    if (chapter && !chapter.eventIds.includes(entry.eventId)) chapter.eventIds.push(entry.eventId);
    if (!rt.activeEventIds.includes(entry.eventId)) rt.activeEventIds.push(entry.eventId);
    if (!state.delivered) {
      state.delivered = true;
      transitions.push({ type: 'event_activated', id: entry.eventId });
    }
  }
}
