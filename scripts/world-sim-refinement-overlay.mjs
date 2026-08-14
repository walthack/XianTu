import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const overlayDir = resolve(scriptDir, '..', 'mod-kit', 'world-sim-refinements');
const defaultOverlayPath = join(overlayDir, 'qingyu-yunlong.json');

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

// 每批一份 overlay 文件；打包时全部装载，同一 situationId 不允许被两批同时认领。
export async function loadTrackedWorldSimRefinements() {
  const files = (await readdir(overlayDir)).filter(name => name.endsWith('.json')).sort();
  const entries = [];
  const claimed = new Map();
  for (const file of files) {
    const overlay = await loadWorldSimRefinementOverlay(join(overlayDir, file));
    for (const entry of overlay.entries || []) {
      const owner = claimed.get(entry.situationId);
      if (owner) throw new Error(`world-sim refinement conflict: ${entry.situationId} claimed by ${owner} and ${file}`);
      claimed.set(entry.situationId, file);
      entries.push(entry);
    }
  }
  return { version: 1, entries };
}

export async function applyTrackedWorldSimRefinements(mod) {
  return applyWorldSimRefinementOverlay(mod, await loadTrackedWorldSimRefinements());
}
