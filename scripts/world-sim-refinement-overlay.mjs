import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultOverlayPath = resolve(scriptDir, '..', 'mod-kit', 'world-sim-refinements', 'qingyu-yunlong.json');

export async function loadWorldSimRefinementOverlay(path = defaultOverlayPath) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return { version: 1, entries: [] };
    throw error;
  }
}

export function applyWorldSimRefinementOverlay(mod, overlay) {
  const entries = (overlay?.entries || []).filter(entry => entry.stageId === mod?.manifest?.id);
  if (!entries.length) return 0;
  const situations = new Map((mod.scenario?.worldSimulation?.situations || []).map(item => [item.id, item]));
  let applied = 0;
  for (const entry of entries) {
    const situation = situations.get(entry.situationId);
    if (!situation || situation.sourceEventId !== entry.sourceEventId || !situation.omen) {
      throw new Error(`world-sim refinement target mismatch: ${entry.stageId}/${entry.situationId}`);
    }
    situation.title = entry.title;
    situation.summary = entry.summary;
    situation.omen.observableFacts = [...entry.observableFacts];
    situation.omen.environmentFallback = entry.environmentFallback;
    situation.omen.presentation = { ...entry.presentation };
    const preferred = (entry.preferredCharacterIds || []).map(characterId => ({ kind: 'related_npc', characterId }));
    situation.omen.transmitters = [...preferred, { kind: 'messenger' }, { kind: 'environment' }];
    applied += 1;
  }
  return applied;
}

export async function applyTrackedWorldSimRefinements(mod) {
  return applyWorldSimRefinementOverlay(mod, await loadWorldSimRefinementOverlay());
}
