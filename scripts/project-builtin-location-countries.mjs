// Refresh only country projections from the master catalog, including checkouts without source stages.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { projectLocationCountries } from './entity-catalog-projection.mjs';
const root = new URL('../src/modules/scenarioMods/builtins/', import.meta.url);
const manifestPath = new URL('manifest.json', root);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const hash = createHash('sha256');
for (const id of manifest.ids) {
  const path = new URL(`data/${id}.json`, root);
  const mod = JSON.parse(readFileSync(path, 'utf8'));
  projectLocationCountries(mod);
  const text = `${JSON.stringify(mod, null, 2)}\n`;
  hash.update(id).update(text);
  writeFileSync(path, text);
}
manifest.version = hash.digest('hex').slice(0, 12);
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Projected location countries into ${manifest.ids.length} builtins: ${manifest.version}`);
