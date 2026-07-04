#!/usr/bin/env node
// 军队抽档落地：把 army-details/*.json 写进 faction 描述+polity+region。
// - 仅置信高/中落描述；「简介待补」占位才合成描述，已有真实描述（左武军/罗马军团/马其顿军团）只补 polity/region 不覆盖。
// - type 归一为「军队」。幂等。
// 用法：node scripts/apply-army-details.mjs
import fs from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const scanDir = join(gen, 'character-canon/army-details');

const results = fs.readdirSync(scanDir).filter(f => f.endsWith('.json') && !f.endsWith('.messages.json'))
  .map(f => JSON.parse(fs.readFileSync(join(scanDir, f), 'utf8')))
  .filter(r => !r.parse_failed && r.army);
const byName = new Map(results.map(r => [r.army, r]));
console.log(`军队抽档结果: ${results.length}`);

function synth(r) {
  const parts = [];
  if (r.affiliation) parts.push(r.affiliation);
  if (r.profile) parts.push(r.profile);
  if ((r.commanders || []).length) parts.push(`主将：${r.commanders.join('、')}`);
  if (r.traits) parts.push(r.traits);
  return parts.join('；') + '。';
}
function enrich(fa) {
  const r = byName.get(fa.name);
  if (!r) return false;
  let changed = false;
  const trusted = r.confidence === '高' || r.confidence === '中';
  const placeholder = /简介待补/.test(fa.description || '') || !fa.description;
  if (r.polity && r.polity !== '未明' && fa.polity !== r.polity) { fa.polity = r.polity; changed = true; }
  if (r.region && r.region !== '未明' && fa.region !== r.region) { fa.region = r.region; changed = true; }
  if (fa.type !== '军队') { fa.type = '军队'; changed = true; }
  if (trusted && placeholder) {
    const desc = synth(r);
    if (desc.length > 3 && fa.description !== desc) { fa.description = desc; changed = true; }
  }
  return changed;
}

let stageF = 0, touched = 0;
for (const b of ['qingyu', 'yunlong', 'yange']) {
  const dir = join(gen, b, 'stages');
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json') && !x.endsWith('.uncertainties.json'))) {
    const p = join(dir, f); const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    let ch = false;
    for (const fa of m.canon.factions || []) if (enrich(fa)) { stageF++; ch = true; }
    if (ch) { touched++; fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n'); }
  }
}
console.log(`faction 富化: ${stageF} 处 / ${touched} 关`);
