#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const path = resolve(process.argv[2] || 'mod-kit/generated/deepseek-v4-flash/shared-atlas/liuchao.shared-atlas.v1.json');
const doc = JSON.parse(await readFile(path, 'utf8'));
const errors = [];
const idPattern = /^[a-z][a-z0-9._-]*$/;
const atlas = doc.atlas || {};
const allGroups = [atlas.continents || [], atlas.locations || [], atlas.factions || [], atlas.routes || []];
const allIds = new Set();

if (doc.schema !== 'xiantu.scenario-atlas' || doc.version !== 1) errors.push('schema/version is invalid');
for (const group of allGroups) for (const entity of group) {
  if (!idPattern.test(entity.id || '')) errors.push(`invalid id: ${entity.id}`);
  if (allIds.has(entity.id)) errors.push(`duplicate id: ${entity.id}`);
  allIds.add(entity.id);
  if (!entity.name) errors.push(`missing name: ${entity.id}`);
  if (!Array.isArray(entity.sourceRefs) || !entity.sourceRefs.length) errors.push(`missing sourceRefs: ${entity.id}`);
}
const continentIds = new Set((atlas.continents || []).map(item => item.id));
const locationIds = new Set((atlas.locations || []).map(item => item.id));
const factionIds = new Set((atlas.factions || []).map(item => item.id));
const pointOk = point => point && Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 10000 && point.y >= 0 && point.y <= 10000;
const polygonOk = polygon => Array.isArray(polygon) && polygon.length >= 4 && polygon.every(pointOk) && polygon[0].x === polygon.at(-1).x && polygon[0].y === polygon.at(-1).y;
for (const continent of atlas.continents || []) if (!polygonOk(continent.bounds)) errors.push(`invalid/uncLOSED continent polygon: ${continent.id}`);
for (const location of atlas.locations || []) {
  if (!continentIds.has(location.continentId)) errors.push(`unknown continent ${location.continentId}: ${location.id}`);
  if (!pointOk(location.coordinates)) errors.push(`invalid coordinates: ${location.id}`);
  if (!['map_explicit', 'explicit', 'relative_inference', 'layout_only'].includes(location.placementBasis)) errors.push(`invalid placementBasis: ${location.id}`);
}
for (const faction of atlas.factions || []) {
  if (!locationIds.has(faction.headquartersLocationId)) errors.push(`unknown headquarters ${faction.headquartersLocationId}: ${faction.id}`);
  if (!pointOk(faction.position) || !polygonOk(faction.territory)) errors.push(`invalid faction geometry: ${faction.id}`);
}
for (const route of atlas.routes || []) {
  if (!locationIds.has(route.fromLocationId) || !locationIds.has(route.toLocationId)) errors.push(`unknown route endpoint: ${route.id}`);
  if (!(route.waypoints || []).every(pointOk)) errors.push(`invalid route waypoint: ${route.id}`);
}
const expectedMods = [];
for (const book of ['qingyu', 'yunlong', 'yange']) {
  const { readdir } = await import('node:fs/promises');
  const dir = resolve(`mod-kit/generated/deepseek-v4-flash/${book}/stages`);
  for (const name of await readdir(dir)) if (name.endsWith('.json') && !name.endsWith('.uncertainties.json')) {
    const mod = JSON.parse(await readFile(resolve(dir, name), 'utf8'));
    expectedMods.push({ book, mod });
  }
}
const bindings = new Map((doc.stageBindings || []).map(binding => [binding.modId, binding]));
for (const { book, mod } of expectedMods) {
  const binding = bindings.get(mod.manifest.id);
  if (!binding) { errors.push(`missing stageBinding: ${mod.manifest.id}`); continue; }
  if (binding.book !== book) errors.push(`wrong book binding: ${mod.manifest.id}`);
  const unmapped = new Set((binding.unmappedLocalEntities || []).map(item => `${item.kind}:${item.localId}`));
  for (const location of mod.canon?.locations || []) if (!binding.locationBindings?.[location.id] && !unmapped.has(`location:${location.id}`) && !locationIds.has(location.id)) errors.push(`unaccounted location ${mod.manifest.id}:${location.id}`);
  for (const faction of mod.canon?.factions || []) if (!binding.factionBindings?.[faction.id] && !unmapped.has(`faction:${faction.id}`) && !factionIds.has(faction.id)) errors.push(`unaccounted faction ${mod.manifest.id}:${faction.id}`);
  for (const target of Object.values(binding.locationBindings || {})) if (!locationIds.has(target)) errors.push(`unknown bound location ${mod.manifest.id}:${target}`);
  for (const target of Object.values(binding.factionBindings || {})) if (!factionIds.has(target)) errors.push(`unknown bound faction ${mod.manifest.id}:${target}`);
  for (const id of binding.visibleLocationIds || []) if (!locationIds.has(id)) errors.push(`unknown visible location ${mod.manifest.id}:${id}`);
  for (const id of binding.activeFactionIds || []) if (!factionIds.has(id)) errors.push(`unknown active faction ${mod.manifest.id}:${id}`);
}
if ((doc.stageBindings || []).length !== expectedMods.length) errors.push(`expected ${expectedMods.length} stageBindings, got ${(doc.stageBindings || []).length}`);

console.log(`${path}: ${errors.length ? 'INVALID' : 'VALID'}`);
console.log(`continents=${atlas.continents?.length || 0} locations=${atlas.locations?.length || 0} factions=${atlas.factions?.length || 0} routes=${atlas.routes?.length || 0} stages=${doc.stageBindings?.length || 0}`);
for (const error of errors) console.error(`- ${error}`);
process.exitCode = errors.length ? 1 : 0;
