#!/usr/bin/env node

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const baseDir = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const atlasPath = join(baseDir, 'shared-atlas', 'liuchao.shared-atlas.v1.json');
const auditPath = join(baseDir, 'shared-atlas', 'repair-audit.json');
const atlas = JSON.parse(await readFile(atlasPath, 'utf8'));
const audit = JSON.parse(await readFile(auditPath, 'utf8'));
const rawByMod = new Map((audit.deepSeekPatch.stageBindings || []).map(item => [item.stageModId, item]));
const locationsByName = new Map();
const factionsByName = new Map();
for (const location of atlas.atlas.locations) for (const name of [location.name, ...(location.aliases || [])]) locationsByName.set(name, location.id);
for (const faction of atlas.atlas.factions) for (const name of [faction.name, ...(faction.aliases || [])]) factionsByName.set(name, faction.id);

atlas.stageBindings = atlas.stageBindings.filter(item => item.modId);
const existing = new Set(atlas.stageBindings.map(item => item.modId));
const stageDir = join(baseDir, 'yange', 'stages');
for (const name of (await readdir(stageDir)).filter(item => item.endsWith('.json') && !item.endsWith('.uncertainties.json')).sort()) {
  const mod = JSON.parse(await readFile(join(stageDir, name), 'utf8'));
  if (existing.has(mod.manifest.id)) continue;
  const raw = rawByMod.get(mod.manifest.id);
  if (!raw) throw new Error(`missing DeepSeek repair binding: ${mod.manifest.id}`);
  const rawLocations = new Map((raw.bindings || []).map(item => [item.sourceId, item.targetId]));
  const locationBindings = {};
  const factionBindings = {};
  const unmappedLocalEntities = [];
  for (const location of mod.canon?.locations || []) {
    const target = rawLocations.get(location.id) || locationsByName.get(location.name);
    if (target) locationBindings[location.id] = target;
    else unmappedLocalEntities.push({ kind: 'location', localId: location.id, reason: '附录地图和 DeepSeek 定向映射均未提供可靠对应地点。' });
  }
  for (const faction of mod.canon?.factions || []) {
    const target = factionsByName.get(faction.name);
    if (target) factionBindings[faction.id] = target;
    else unmappedLocalEntities.push({ kind: 'faction', localId: faction.id, reason: '共享地图没有同名或已确认别名的势力实体。' });
  }
  atlas.stageBindings.push({
    modId: mod.manifest.id,
    book: 'yange',
    locationBindings,
    factionBindings,
    visibleLocationIds: [...new Set(Object.values(locationBindings))],
    activeFactionIds: [...new Set(Object.values(factionBindings))],
    unmappedLocalEntities,
  });
}

await writeFile(atlasPath, JSON.stringify(atlas, null, 2));
console.log(`normalized ${atlasPath}`);
