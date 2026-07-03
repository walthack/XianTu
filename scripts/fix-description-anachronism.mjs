#!/usr/bin/env node
// 修 description 时代错乱（B5 小说化描述用全书视角写、被投影进早期关卡 → NPC 未卜先知）：
//   1) 程宗扬：37 关 description ← 该关 stage-projection 阶段身份（卡内矩阵，无剧透）
//   2) 舞都(地点)：封侯前的关卡(lcq 全部 + lyl axisOrder<封侯关) 描述改中性，不提"程宗扬封地"
//   3) 祁远(清羽)："长安的银钱"→"账面上的银钱"（长安产业是后书才有）
//   4) 徐君房(云龙)：删"唐皇私下召见的占卜官"分句（唐皇线属燕歌）
// 幂等。用法：node scripts/fix-description-anachronism.mjs
import fs from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');

// 程宗扬 各关阶段身份
const cards = JSON.parse(fs.readFileSync(join(gen, 'character-canon/character-cards-v3.json'), 'utf8'));
const czy = cards.characters.find(c => c.canonicalName === '程宗扬');
const phaseByStage = new Map(
  (czy.phaseIdentities || []).filter(p => p.scope === 'stage-projection' && p.stageId && p.identity)
    .map(p => [p.stageId, p.identity]),
);

const FENGHOU_STAGE = 'lyl.luoyang_coup'; // 封侯关：此关(含)之后 舞阳侯 合法
let fenghouOrder = Infinity;

const stages = [];
for (const b of ['qingyu', 'yunlong', 'yange']) {
  const dir = join(gen, b, 'stages');
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json') && !x.endsWith('.uncertainties.json'))) {
    const p = join(dir, f); const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    stages.push({ p, m, book: b });
    if (m.manifest.id === FENGHOU_STAGE) fenghouOrder = m.manifest.axisOrder ?? Infinity;
  }
}

let fixed = { 程宗扬: 0, 舞都: 0, 祁远: 0, 徐君房: 0 };
for (const { p, m, book } of stages) {
  const stageId = m.manifest.id;
  const order = m.manifest.axisOrder ?? 999;
  const preFenghou = book === 'qingyu' || (book === 'yunlong' && order < fenghouOrder);
  let changed = false;

  for (const c of m.canon.characters || []) {
    if (c.name === '程宗扬') {
      const identity = phaseByStage.get(stageId);
      if (identity && c.description !== identity) { c.description = identity; fixed.程宗扬++; changed = true; }
    }
    if (c.name === '祁远' && book === 'qingyu' && c.description?.includes('长安的银钱')) {
      c.description = c.description.replace('长安的银钱', '账面上的银钱'); fixed.祁远++; changed = true;
    }
    if (c.name === '徐君房' && book !== 'yange' && c.description?.includes('唐皇')) {
      c.description = c.description.replace(/[，,]?又是唐皇私下召见的占卜官/, ''); fixed.徐君房++; changed = true;
    }
  }
  if (preFenghou) {
    for (const l of m.canon.locations || []) {
      if (l.name === '舞都' && /程宗扬封地|舞阳侯/.test(l.description || '')) {
        l.description = '汉国境内的一座都邑。'; fixed.舞都++; changed = true;
      }
    }
  }
  if (changed) fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n');
}
console.log('修复:', JSON.stringify(fixed));
// 残留校验
let residual = 0;
for (const { m, book } of stages) {
  const order = m.manifest.axisOrder ?? 999;
  const preFenghou = book === 'qingyu' || (book === 'yunlong' && order < fenghouOrder);
  if (!preFenghou) continue;
  for (const c of m.canon.characters || []) if (c.name === '程宗扬' && /舞阳侯|杨玉环|赤兔马/.test(c.description || '')) residual++;
  for (const l of m.canon.locations || []) if (l.name === '舞都' && /程宗扬|舞阳侯/.test(l.description || '')) residual++;
}
console.log(residual ? `⚠ 残留 ${residual}` : '✓ 封侯前关卡无残留');
