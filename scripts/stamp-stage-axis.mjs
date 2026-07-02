#!/usr/bin/env node

// 落地:给 18 关 scenario event 盖软 axisId(来自 alignment 匹配,best-effort)+ 关卡盖 axisVersion + 主轴排序位。
// 契约:event.id 冻结(append-only)=存档键;axisId 为软元数据(不入存档键)。additive,不改 event.id/flag。
// Usage: node scripts/stamp-stage-axis.mjs

import { readFileSync } from 'node:fs';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const ccDir = join(gen, 'character-canon');
const binding = JSON.parse(readFileSync(join(ccDir, 'axis-binding.json'), 'utf8'));
const seqToNode = new Map(binding.nodes.map(n => [n.seq, n]));
const axisToNode = new Map(binding.nodes.map(n => [n.axisId, n]));
const align = JSON.parse(readFileSync(join(ccDir, 'axis-stage-alignment.json'), 'utf8'));

async function run() {
  let stamped = 0, evTotal = 0, evMatched = 0;
  const report = [];
  for (const book of ['qingyu', 'yunlong', 'yange']) {
    const stageDir = join(gen, book, 'stages');
    const sp = JSON.parse(await readFile(join(gen, book, 'stage-plan.json'), 'utf8'));
    const stages = Array.isArray(sp) ? sp : (sp.stages || []);
    const orderByStart = [...stages].sort((a, b) => a.sourceStartIndex - b.sourceStartIndex).map(s => s.id);
    const alignBook = align.books[book];
    for (const f of (await readdir(stageDir)).filter(n => /^lcq?\.|^ly[lg]?\./.test(n) && n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
      const p = join(stageDir, f);
      const mod = JSON.parse(await readFile(p, 'utf8'));
      const id = mod.manifest.id;
      const aStage = alignBook?.stages.find(s => s.id === id);
      // event 软 axisId
      const evs = mod.scenario?.events || [];
      for (const e of evs) {
        evTotal++;
        if (e.axisMethod === 'reviewed-no-anchor') {
          e.axisId = null;
          delete e.axisSeq;
          delete e.axisAnchor;
          delete e.axisBeat;
          continue;
        }
        const match = aStage?.events.find(x => x.event === (e.name)) ;
        const node = match?.seq ? seqToNode.get(match.seq) : (e.axisId ? axisToNode.get(e.axisId) : null);
        if (node) {
          e.axisId = node.axisId;
          e.axisSeq = node.seq;
          e.axisAnchor = node.anchor;
          e.axisBeat = node.beat;
          evMatched++;
        } else {
          e.axisId = null;
          delete e.axisSeq;
          delete e.axisAnchor;
          delete e.axisBeat;
        }
      }
      // mod 级戳
      mod.manifest.axisVersion = binding.axisVersion;
      mod.manifest.axisOrder = orderByStart.indexOf(id);          // 主轴排序位(按 sourceStartIndex,可靠)
      mod.manifest.axisSeqLo = aStage?.seqLo ?? null;
      mod.manifest.axisSeqHi = aStage?.seqHi ?? null;
      mod.manifest.eventIdContract = 'append-only-frozen';        // 存档契约声明
      await writeFile(p, JSON.stringify(mod, null, 2) + '\n');
      stamped++;
      const mm = evs.filter(e => e.axisId).length;
      report.push(`  ${id}: 序#${mod.manifest.axisOrder} 跨度#${mod.manifest.axisSeqLo}~${mod.manifest.axisSeqHi} event软axisId ${mm}/${evs.length}`);
    }
  }
  console.error(`盖戳完成: ${stamped} 关 | event 软axisId ${evMatched}/${evTotal} (${(evMatched/evTotal*100).toFixed(0)}%)`);
  report.forEach(r => console.error(r));
}
run();
