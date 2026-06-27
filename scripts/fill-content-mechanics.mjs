// #1 物品/功法机制数值:按品级(神仙天地玄黄凡 rank 7..1)× 类型 确定性赋值。
// 装备类(weapon/armor)→ item.attributeBonus(装备增幅)；功法 → technique.techniqueEffects(功法效果)。
// 补空不覆盖。备份 stages-pre-mechanics-backup。 Usage: [--dry-run]
import { readFile, readdir, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const dryRun = process.argv.includes('--dry-run');
const books = ['qingyu', 'yunlong', 'yange'];
async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }

// grade 字符串 → 品质字(与 relationships.parseQuality 一致的简化版)
const QMAP = { 神器: '神', 神级: '神', 神品: '神', 神器碎片: '神', 仙品: '仙', 唯一: '仙', 极品: '仙', 法宝: '仙', 灵宝: '仙', 天品: '天', 天级: '天', 上品: '天', 高阶: '天', 地品: '地', 地级: '地', 秘法: '地', 玄品: '玄', 玄级: '玄', 灵品: '玄', 秘术: '玄', 特殊: '玄', 中品: '黄', 黄品: '黄', 黄级: '黄', 非凡: '黄', 法器: '黄', 精良: '黄', 下品: '凡', 凡品: '凡', 凡: '凡' };
const RANK = { 神: 7, 仙: 6, 天: 5, 地: 4, 玄: 3, 黄: 2, 凡: 1 };
function rankOf(grade) {
  if (grade && QMAP[grade]) return RANK[QMAP[grade]];
  for (const q of ['神', '仙', '天', '地', '玄', '黄', '凡']) if (grade?.includes(q)) return RANK[q];
  return 1;
}

async function run() {
  let iN = 0, tN = 0;
  for (const book of books) {
    const stageDir = join(gen, book, 'stages');
    if (!dryRun) { const bk = join(gen, book, 'stages-pre-mechanics-backup'); if (existsSync(bk)) await rm(bk, { recursive: true }); await cp(stageDir, bk, { recursive: true }); }
    for (const f of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
      const m = await readJson(join(stageDir, f));
      let ch = false;
      for (const it of m.content?.items || []) {
        if (it.attributeBonus) continue;
        const r = rankOf(it.grade);
        if (it.type === 'weapon') { it.attributeBonus = { 气血上限: r * 15, 后天六司: { 根骨: r * 2 } }; iN++; ch = true; }
        else if (it.type === 'armor') { it.attributeBonus = { 气血上限: r * 40, 后天六司: { 根骨: r } }; iN++; ch = true; }
        // 丹药/材料/其他：使用类，无装备增幅
      }
      for (const tc of m.content?.techniques || []) {
        if (tc.techniqueEffects) continue;
        const r = rankOf(tc.grade);
        tc.techniqueEffects = { 修炼速度加成: Math.round(r * 8) / 100, 属性加成: { 悟性: r, 灵性: Math.ceil(r / 2) } };
        tN++; ch = true;
      }
      if (ch && !dryRun) await writeFile(join(stageDir, f), `${JSON.stringify(m, null, 2)}\n`);
    }
  }
  console.log(`装备增幅 +${iN} 物品 / 功法效果 +${tN} 功法。${dryRun ? '(DRY)' : '备份 stages-pre-mechanics-backup。'}`);
}
run().catch(e => { console.error(e); process.exit(1); });
