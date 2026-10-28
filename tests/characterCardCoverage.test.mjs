import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { GENERATED_ROOT, HAS_GENERATED_STAGES, skipUnless } from './sourceTree.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generatedRoot = fileURLToPath(GENERATED_ROOT);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

test('every structured stage character is shipped in the canonical character registry', { skip: skipUnless(HAS_GENERATED_STAGES, 'qingyu/stages/') }, () => {
  const registry = readJson(path.join(root, 'src/modules/scenarioMods/builtins/character-registry.json')).characters;
  const coveredNames = new Set(registry.flatMap(character => [
    character.canonicalName,
    ...(character.aliases || []),
  ]).filter(Boolean));
  const missing = new Map();

  for (const book of ['qingyu', 'yunlong', 'yange']) {
    const stageDir = path.join(generatedRoot, book, 'stages');
    for (const file of fs.readdirSync(stageDir).filter(name => name.endsWith('.json')).sort()) {
      const mod = readJson(path.join(stageDir, file));
      for (const character of mod.canon?.characters || []) {
        if (!coveredNames.has(character.name)) {
          const key = `${character.id} (${character.name})`;
          const stages = missing.get(key) || [];
          stages.push(mod.manifest?.id || file.replace(/\.json$/, ''));
          missing.set(key, stages);
        }
      }
    }
  }

  assert.deepEqual(
    [...missing.entries()],
    [],
    `structured stage characters missing shipped canonical records:\n${JSON.stringify(Object.fromEntries(missing), null, 2)}`,
  );
});
