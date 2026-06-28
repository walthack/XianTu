// D4 审计:找"晚期内容混进早期关卡"——角色 firstSeen 远晚于关卡 sourceEndIndex；物品 acquiredAt 远晚于。
// 非破坏,只产 character-canon/time-node-violations.md + .json。阈值 margin 避免误报边界。
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canonDir = join(gen, 'character-canon');
const books = [['qingyu', '六朝清羽记'], ['yunlong', '六朝云龙吟'], ['yange', '六朝燕歌行']];
const MARGIN = Number(process.env.XIANTU_D4_MARGIN || 5);
async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }

async function run() {
  const out = { margin: MARGIN, books: {} };
  const lines = ['# 仙途 · 时间节点违规审计(D4)', '', `> 角色 firstSeen / 物品 acquiredAt 晚于关卡 sourceEndIndex 超过 ${MARGIN} = 违规(晚期内容混进早期关卡)。`, ''];
  let totC = 0, totI = 0;
  for (const [book, title] of books) {
    const sp = await readJson(join(gen, book, 'stage-plan.json')); const stages = Array.isArray(sp) ? sp : (sp.stages || []);
    const spById = new Map(stages.map(s => [s.id, s]));
    // extraction: 角色 firstSeen (min), 物品 acquiredAt (min, by item name)
    const charFirst = {}, itemAcq = {};
    const ex = join(gen, book, 'extraction');
    for (const f of (await readdir(ex)).filter(n => /^batch-\d+\.json$/.test(n))) {
      const d = await readJson(join(ex, f));
      for (const c of d.characterStates || []) { if (!c.name) continue; const v = c.firstSeenSourceIndex; if (Number.isFinite(v)) charFirst[c.name] = Math.min(charFirst[c.name] ?? 1e9, v); }
      for (const cf of d.contentFacts || []) { if (!cf.name) continue; const v = cf.acquiredAtSourceIndex; if (Number.isFinite(v)) itemAcq[cf.name] = Math.min(itemAcq[cf.name] ?? 1e9, v); }
    }
    const stageDir = join(gen, book, 'stages');
    out.books[book] = { stages: [] };
    for (const f of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
      const m = await readJson(join(stageDir, f)); const id = m.manifest.id; const end = spById.get(id)?.sourceEndIndex;
      if (!Number.isFinite(end)) continue;
      const itemName = new Map((m.content?.items || []).map(i => [i.id, i.name]));
      const badChars = [], badItems = [];
      for (const c of m.canon?.characters || []) { const fs = charFirst[c.name]; if (Number.isFinite(fs) && fs > end + MARGIN) badChars.push({ name: c.name, id: c.id, firstSeen: fs }); }
      for (const c of m.canon?.characters || []) for (const iid of c.itemIds || []) { const nm = itemName.get(iid); const aq = nm && itemAcq[nm]; if (Number.isFinite(aq) && aq > end + MARGIN) badItems.push({ holder: c.name, item: nm, id: iid, acquiredAt: aq }); }
      if (badChars.length || badItems.length) {
        out.books[book].stages.push({ id, end, badChars, badItems });
        lines.push(`### ${m.manifest.name}　\`${id}\`(范围止于 #${end})`);
        for (const b of badChars) lines.push(`- 👤 角色 **${b.name}** firstSeen #${b.firstSeen}(晚 ${b.firstSeen - end})`);
        for (const b of badItems) lines.push(`- 🎒 物品 **${b.item}**(持有 ${b.holder})acquiredAt #${b.acquiredAt}(晚 ${b.acquiredAt - end})`);
        lines.push('');
        totC += badChars.length; totI += badItems.length;
      }
    }
  }
  lines.splice(3, 0, `**合计:违规角色条目 ${totC}，违规物品条目 ${totI}(margin ${MARGIN})。**`, '');
  await writeFile(join(canonDir, 'time-node-violations.md'), `${lines.join('\n')}\n`);
  await writeFile(join(canonDir, 'time-node-violations.json'), `${JSON.stringify(out, null, 2)}\n`);
  console.log(`违规角色 ${totC} / 物品 ${totI}（margin ${MARGIN}）→ time-node-violations.{md,json}`);
}
run().catch(e => { console.error(e); process.exit(1); });
