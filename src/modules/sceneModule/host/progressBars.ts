import type { Contract, SceneState } from '../types';

export interface SceneProgressBar { key: string; label: string; text: string; step: number; max: number }

/** 中立方（护人戏的「护队后方」等）的进度轨道：交锋卡上画成进度条。档位文字取合同 scale，不另写。 */
export function sceneProgressBars(contract: Contract | undefined, state: SceneState | undefined): SceneProgressBar[] {
  if (!contract || !state) return [];
  const out: SceneProgressBar[] = [];
  for (const party of contract.parties as any[]) {
    if (party.side !== 'neutral') continue;
    for (const track of party.tracks || []) {
      if (track.kind !== 'progress' || !Array.isArray(track.scale) || track.scale.length < 2) continue;
      const raw = Number((state as any).tracks?.[party.id]?.[track.id] ?? track.initial ?? 0);
      const max = track.scale.length - 1, step = Math.max(0, Math.min(max, Number.isFinite(raw) ? raw : 0));
      out.push({ key: `${party.id}.${track.id}`, label: party.ref || party.id, text: track.scale[step], step, max });
    }
  }
  return out;
}
