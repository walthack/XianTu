#!/usr/bin/env node

// 修 atlas validator 的 unaccounted faction(D6势力id归一后 binding 未跟上 + 罗马化不一致)。
// 只改 shared-atlas 的 stageBindings(按中文名匹配):有atlas对应→加 factionBindings;无对应→加 unmappedLocalEntities。
// 不碰 stage mod / axisId 盖戳 / 人格。Usage: node scripts/fix-atlas-faction-bindings.mjs

import { readFileSync, copyFileSync, existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const atlasPath = join(gen, 'shared-atlas', 'liuchao.shared-atlas.v1.json');

async function run() {
  if (!existsSync(atlasPath + '.pre-facfix')) copyFileSync(atlasPath, atlasPath + '.pre-facfix');
  const doc = JSON.parse(await readFile(atlasPath, 'utf8'));
  const atlas = doc.atlas || doc;
  const factionIds = new Set((atlas.factions || []).map(f => f.id));
  const nameToId = new Map((atlas.factions || []).map(f => [f.name, f.id]));

  // 收集各关 canon.factions(取 id→name)
  const modFactions = {}; // modId -> [{id,name}]
  for (const book of ['qingyu', 'yunlong', 'yange']) {
    const dir = join(gen, book, 'stages');
    for (const f of (await (await import('node:fs/promises')).readdir(dir))) {
      if (!f.endsWith('.json') || f.includes('uncert')) continue;
      const m = JSON.parse(await readFile(join(dir, f), 'utf8'));
      modFactions[m.manifest.id] = (m.canon?.factions || []).map(x => ({ id: x.id, name: x.name }));
    }
  }

  let mapped = 0, unmapped = 0; const noMatch = [];
  for (const b of doc.stageBindings || []) {
    b.factionBindings = b.factionBindings || {};
    b.unmappedLocalEntities = b.unmappedLocalEntities || [];
    const already = new Set(b.unmappedLocalEntities.filter(u => u.kind === 'faction').map(u => u.localId));
    for (const { id, name } of modFactions[b.modId] || []) {
      if (b.factionBindings[id] || factionIds.has(id) || already.has(id)) continue; // 已账
      const atlasId = nameToId.get(name);
      if (atlasId) { b.factionBindings[id] = atlasId; mapped++; }
      else { b.unmappedLocalEntities.push({ kind: 'faction', localId: id, reason: `无atlas势力对应（名「${name}」不在9大势力）` }); unmapped++; noMatch.push(`${b.modId}:${id}(${name})`); }
    }
  }
  await writeFile(atlasPath, JSON.stringify(doc, null, 2) + '\n');
  console.error(`修复完成: 映射 ${mapped} | 标unmapped ${unmapped}`);
  if (noMatch.length) console.error('无atlas对应(入unmapped):\n  ' + noMatch.join('\n  '));
}
run();
