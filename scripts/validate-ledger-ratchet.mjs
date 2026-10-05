import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const registry = JSON.parse(readFileSync(resolve(root, 'src/modules/scenarioMods/builtins/character-registry.json')));
const names = new Set(registry.characters.flatMap(c => [c.canonicalName, ...c.aliases]).filter(n => /^[\u4e00-\u9fff]{2,8}$/.test(n)));
const counts = {};
function visit(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'builtins') visit(p); }
    else if (/\.(?:ts|vue)$/.test(entry.name)) {
      const text = readFileSync(p, 'utf8');
      const count = [...names].reduce((sum, name) => sum + text.split(name).length - 1, 0);
      if (count) counts[relative(root, p)] = count;
    }
  }
}
visit(resolve(root, 'src'));
const path = resolve(root, 'mod-kit/entity-ledger/ratchet-baseline.json');
if (process.argv.includes('--initialize')) {
  writeFileSync(path, JSON.stringify({ version: 1, ruling: '#194', note: 'Per-file literal-name occurrence budget; generated data and author JSON excluded. Lower budget only after migration evidence.', counts }, null, 2) + '\n');
} else {
  const baseline = JSON.parse(readFileSync(path));
  const increases = Object.entries(counts).filter(([file, n]) => n > (baseline.counts[file] || 0));
  if (increases.length) { console.error('ledger ratchet: literal-name budget increased', increases); process.exitCode = 1; }
  else console.log('ledger ratchet PASS', Object.values(counts).reduce((a,b)=>a+b,0), 'existing literal occurrences (not zero yet)');
}
