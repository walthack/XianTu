#!/usr/bin/env node
// 地点风貌/region 落地（一次扫描两用）：
// ① atlas + 全 stage canon.locations：加 region 字段；描述追加风貌句（仅置信高/中，防低置信脑补如"巴郡麻辣火锅"）
// ② 输出 location-region 映射供 registry 构建做角色地理锚点。幂等。
// 用法：node scripts/apply-location-fengmao.mjs
import fs from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const scanDir = join(gen, 'shared-atlas/location-fengmao');

const results = fs.readdirSync(scanDir).filter(f => f.endsWith('.json') && !f.endsWith('.messages.json'))
  .map(f => JSON.parse(fs.readFileSync(join(scanDir, f), 'utf8')))
  .filter(r => !r.parse_failed && r.region && r.region !== '未知');
// 用户正典（人工权威，覆盖任何扫描结果）：太泉古阵=现代科技遗迹的六朝式误读（2026-07-04 用户设定）
const USER_CANON = [
  { name: '太泉古阵', region: '太泉', confidence: '高', fengmao: '上古遗迹实为另一个时代的造物：金铁构筑的廊道厅堂、长明不灭的"夜明珠"、显影人像的"光影幻璧"、轻韧透亮的"琉璃纸"、不用牛马自行奔走的"铁车"残骸，六朝人以自身语汇敬畏称之。', customs: '入阵者以"仙家遗泽"解读诸般造物并各自命名；唯穿越者能认出真身，认知差微妙有趣。' },
];
const byName = new Map(results.map(r => [r.name, r]));
for (const uc of USER_CANON) byName.set(uc.name, uc);
console.log(`可落地地点: ${results.length}`);

function enrich(loc) {
  const r = byName.get(loc.name);
  if (!r) return false;
  let changed = false;
  if (loc.region !== r.region) { loc.region = r.region; changed = true; }
  const trusted = r.confidence === '高' || r.confidence === '中';
  if (trusted && r.fengmao && !(loc.description || '').includes(r.fengmao.slice(0, 12))) {
    const base = (loc.description || '').replace(/——简介待补.*$/, '').trim();
    loc.description = base ? `${base} ${r.fengmao}` : r.fengmao;
    if (r.customs && !loc.description.includes(r.customs.slice(0, 10))) loc.description += `（民俗：${r.customs}）`;
    changed = true;
  }
  return changed;
}

// ① atlas
const atlasPath = join(gen, 'shared-atlas/liuchao.shared-atlas.v1.json');
const atlasDoc = JSON.parse(fs.readFileSync(atlasPath, 'utf8'));
let atlasChanged = 0;
for (const loc of atlasDoc.atlas.locations || []) if (enrich(loc)) atlasChanged++;
if (atlasChanged) fs.writeFileSync(atlasPath, JSON.stringify(atlasDoc, null, 2) + '\n');
console.log(`atlas 富化: ${atlasChanged}`);

// ② stages
let stageLocs = 0, stagesTouched = 0;
for (const b of ['qingyu', 'yunlong', 'yange']) {
  const dir = join(gen, b, 'stages');
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json') && !x.endsWith('.uncertainties.json'))) {
    const p = join(dir, f); const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    let changed = false;
    for (const loc of m.canon.locations || []) if (enrich(loc)) { stageLocs++; changed = true; }
    if (changed) { stagesTouched++; fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n'); }
  }
}
console.log(`stage 地点富化: ${stageLocs} 处 / ${stagesTouched} 关`);

// ③ 输出 location→region 映射（registry 构建消费）
const map = Object.fromEntries(results.map(r => [r.name, r.region]));
fs.writeFileSync(join(scanDir, 'location-region-map.json'), JSON.stringify(map, null, 2) + '\n');
console.log(`region 映射: ${Object.keys(map).length} 条 → location-region-map.json`);
