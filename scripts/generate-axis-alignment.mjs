// C1 主轴对齐：把每个 stage 及其事件对齐到故事主轴(story-timeline)的 seq/锚点。
// 每关 → 主轴 seq 跨度(由 sourceStart/End)；每事件 → 该跨度内 beat 最相似的主轴节点；统计覆盖/空缺。
// 输出 character-canon/axis-stage-alignment.{md,json}(参照文档，不改 mod)。

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canonDir = join(gen, 'character-canon');
const books = [['qingyu', '六朝清羽记'], ['yunlong', '六朝云龙吟'], ['yange', '六朝燕歌行']];
async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }
function bg(s) { const c = (s || '').replace(/[，。、；：（）()【】“”"'\s★]+/g, ''); const g = new Set(); for (let i = 0; i + 1 < c.length; i++)g.add(c.slice(i, i + 2)); return g; }
function jac(a, b) { if (!a.size || !b.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n); }

async function run() {
  const timeline = await readJson(join(canonDir, 'story-timeline.json'));
  const lines = ['# 仙途 · 主轴↔关卡对齐', '', '> 每关对齐到故事主轴 seq 跨度；每事件匹配到最相似主轴节点。供 roadmap #1(主轴真值源)/if线/拓展引用。', ''];
  const jsonOut = { books: {} };
  let totalCovered = 0, totalNodes = 0;
  for (const [book, title] of books) {
    const nodes = timeline.nodes.filter(n => n.book === book);
    const nodeBg = nodes.map(n => ({ n, bg: bg(n.beat) }));
    const sp = await readJson(join(gen, book, 'stage-plan.json')); const stages = Array.isArray(sp) ? sp : (sp.stages || []);
    const stageDir = join(gen, book, 'stages');
    const stageFile = {}; for (const f of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) { const m = await readJson(join(stageDir, f)); stageFile[m.manifest.id] = m; }
    lines.push(`## 《${title}》`, '');
    const coveredSeqs = new Set();
    jsonOut.books[book] = { stages: [] };
    for (const s of stages) {
      const inRange = nodes.filter(n => n.idx >= s.sourceStartIndex && n.idx <= s.sourceEndIndex);
      const seqLo = inRange[0]?.seq, seqHi = inRange[inRange.length - 1]?.seq;
      const m = stageFile[s.id]; const events = m?.scenario?.events || [];
      const evMatches = [];
      for (const e of events) {
        const ebg = bg(`${e.name} ${e.description || ''}`);
        let best = null, bestScore = 0;
        for (const { n, bg: nb } of nodeBg) { if (n.idx < s.sourceStartIndex || n.idx > s.sourceEndIndex) continue; const sc = jac(ebg, nb); if (sc > bestScore) { bestScore = sc; best = n; } }
        if (best && bestScore >= 0.12) { coveredSeqs.add(best.seq); evMatches.push({ event: e.name, seq: best.seq, anchor: best.anchor, score: +bestScore.toFixed(2) }); }
        else evMatches.push({ event: e.name, seq: null });
      }
      lines.push(`### ${m?.manifest?.name || s.id}　\`${s.id}\``);
      lines.push(`- 主轴跨度：${seqLo != null ? `#${seqLo} ~ #${seqHi}` : '(范围内无主轴节点)'}（源 idx ${s.sourceStartIndex}-${s.sourceEndIndex}，含 ${inRange.length} 节点）`);
      for (const em of evMatches) lines.push(`  - 事件「${em.event}」→ ${em.seq ? `#${em.seq} 〔${em.anchor}〕(${em.score})` : '⚠️ 未匹配到主轴节点'}`);
      lines.push('');
      jsonOut.books[book].stages.push({ id: s.id, seqLo, seqHi, sourceRange: [s.sourceStartIndex, s.sourceEndIndex], events: evMatches });
      totalNodes += inRange.length;
    }
    // 覆盖统计：被关卡范围覆盖的主轴节点数 vs 全书节点
    const inAnyStage = new Set();
    for (const s of stages) for (const n of nodes) if (n.idx >= s.sourceStartIndex && n.idx <= s.sourceEndIndex) inAnyStage.add(n.seq);
    totalCovered += inAnyStage.size;
    lines.push(`> 《${title}》主轴节点 ${nodes.length}，被关卡范围覆盖 ${inAnyStage.size}（${Math.round(100 * inAnyStage.size / nodes.length)}%），未覆盖 ${nodes.length - inAnyStage.size}。`, '');
  }
  lines.splice(3, 0, `**全局：主轴 ${timeline.nodes.length} 节点，被关卡范围覆盖 ${totalCovered}（${Math.round(100 * totalCovered / timeline.nodes.length)}%）。**`, '');
  await writeFile(join(canonDir, 'axis-stage-alignment.md'), `${lines.join('\n')}\n`);
  await writeFile(join(canonDir, 'axis-stage-alignment.json'), `${JSON.stringify(jsonOut, null, 2)}\n`);
  console.log(`写入 axis-stage-alignment.{md,json}；全局覆盖 ${totalCovered}/${timeline.nodes.length}`);
}
run().catch(e => { console.error(e); process.exit(1); });
