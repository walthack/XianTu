#!/usr/bin/env node

// 把三本 {book}.personality-draft.json 按角色归并成「全本统一一套」personality（用户定：统一不分本）。
// 合并：并集去重(精确+子串包含)、限 6 条；带 OVERRIDES 人工修正(小紫等)；跨本冲突仍并入但 markdown 里标 ⚠️。
// 产 character-canon/personality-consolidated.json（投影用）+ personality-consolidated-review.md（人审用）。不改 mod。

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const canon = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash', 'character-canon');
const books = ['qingyu', 'yunlong', 'yange'];

// 权威人物卡（NAS）：含 **性格** 字段，优先级高于原文抽取（用户：别太歪）。
const CARD_FILES = ['六朝清羽记-人物卡.md', '六朝燕歌行-人物卡.md'].map(f => `/Volumes/botsvault/06_material/${f}`);
async function loadCards() {
  const map = new Map(); // name -> { traits:[], raw }
  for (const f of CARD_FILES) {
    if (!existsSync(f)) continue;
    const lines = (await readFile(f, 'utf8')).split(/\r?\n/);
    let name = null;
    for (const ln of lines) {
      const h = ln.match(/^###\s+(.+?)\s*$/);
      if (h) { name = h[1].replace(/（[^）]*）/g, '').trim(); continue; }
      const p = ln.match(/性格\*\*\s*[:：]\s*(.+)$/);
      if (p && name) {
        const raw = p[1].replace(/[^一-龥、，,；;\s]/g, '').trim();
        const traits = raw.split(/[、，,；;\s]+/).map(s => s.trim()).filter(s => s.length >= 2 && !/未直接展现|未展现/.test(s));
        if (traits.length) { const e = map.get(name) || { traits: [], raw: '' }; e.traits.push(...traits); e.raw = e.raw ? `${e.raw}；${raw}` : raw; map.set(name, e); }
        name = null;
      }
    }
  }
  return map;
}

// 人工正典修正：name -> { personality:[...], summary }。覆盖抽取结果。
const OVERRIDES = {
  小紫: {
    personality: ['心机深沉', '城府极深', '鬼点子多', '善扮乖藏锋', '暗中掌控全局（各房后宫皆被收服）', '对程宗扬温柔深情'],
    summary: '人称「紫妈妈」：外表银白长发、娇小如孩，实则心机深沉、城府极深、鬼点子层出，扮乖藏锋而暗中掌控全局，把后宫各房收得服服帖帖；对程宗扬温柔深情。',
  },
  // 程宗扬：从 OVERRIDES 移除，改由人物卡authoritative（务实精明有野心/政商博弈/审时度势/城府极深）。
  秦桧: {
    personality: ['阴险狡诈', '城府极深', '才智高绝', '狠辣果断', '对主忠贞不二'],
    summary: '据人物卡：阴险狡诈、城府极深的奸臣形象；对外奸诈狠辣，对主君程宗扬却忠贞不二。',
  },
  潘金莲: {
    personality: ['冷艳', '外冷心软', '有受虐倾向', '美艳风流', '谨慎多疑'],
    summary: '外表冷艳、内心心软，美艳风流，带受虐倾向。',
  },
  惊理: {
    personality: ['冷血无情', '机械冷漠', '谨慎', '热衷侍奉主人房事', '热衷调教下仆'],
    summary: '对外冷血无情、机械冷漠；私下却热衷于侍奉主人房事、调教下仆。',
  },
  // 阮家姐妹：采集混淆（D2 阮香琳/阮香凝/蛇夫人 撞名遗留），用户给种子，标 rebuild 待单独重抽
  阮香琳: {
    personality: ['豪爽快语', '精明干练', '现实势利', '小心眼易吃醋', '敢顶嘴'],
    summary: '豪爽快语、精明干练，却现实势利（为攀附权势不惜牺牲女儿），小心眼易吃醋。（消歧重抽确认版）',
  },
  阮香凝: {
    personality: ['温柔细腻', '柔顺文静', '护幼慈爱', '外柔内韧', '善于珠算'],
    summary: '温柔细腻、柔顺文静，护幼慈爱，外柔内韧，精于珠算。（消歧重抽确认；此前误混入姐姐的嫉恨/心机，已剔除）',
  },
  鬼巫王: {
    personality: ['阴险狡诈', '诡谲难测', '心狠手辣'],
    summary: '阴险狡诈、诡谲难测的鬼巫之王，心狠手辣。',
  },
  // 乐明珠 抽取已准确，无需覆盖。刘骜 用户未给，留空。
};

// 线索不足/抽歪的标记（review 里高亮，等用户给）
const WEAK = /线索不足|未检索|抽取失败|死因存疑|被利用|非善终|关系恶劣/;

function isWeak(c) {
  if (!c.personality || c.personality.length === 0) return true;
  return WEAK.test((c.summary || '') + c.personality.join(''));
}
function mergeTraits(lists) {
  const out = [];
  for (const t of lists.flat()) {
    const s = String(t).trim();
    if (!s) continue;
    if (out.some(o => o === s || o.includes(s) || s.includes(o))) continue;
    out.push(s);
  }
  return out.slice(0, 6);
}

async function run() {
  const byName = new Map(); // name -> { books:[], perBook:{}, traits:[], summaries:[], weakBooks:[] }
  for (const b of books) {
    const d = JSON.parse(await readFile(join(canon, `${b}.personality-draft.json`), 'utf8'));
    for (const c of d.characters || []) {
      const e = byName.get(c.name) || { name: c.name, books: [], perBook: {}, traits: [], summaries: [], weakBooks: [] };
      e.books.push(b);
      e.perBook[b] = c.personality || [];
      e.traits.push(c.personality || []);
      if (c.summary) e.summaries.push(c.summary);
      if (isWeak(c)) e.weakBooks.push(b);
      byName.set(c.name, e);
    }
  }
  const cards = await loadCards();
  console.log(`人物卡覆盖 ${cards.size} 角色（权威源，优先于抽取）`);
  const consolidated = [];
  const cardConflicts = [];
  const lines = ['# 仙途 · 性格合并版（全本统一一套，待审）', '', '> 优先级：用户OVERRIDES > 人物卡 > 原文抽取。📇=据人物卡。✎=人工修正。⚠️=冲突/抽空。', ''];
  for (const e of [...byName.values()].sort((a, b) => b.books.length - a.books.length)) {
    const ov = OVERRIDES[e.name];
    const card = cards.get(e.name);
    let merged, summary, src;
    if (ov) { merged = ov.personality; summary = ov.summary; src = 'override'; }
    else if (card && card.traits.length) { merged = mergeTraits([card.traits, e.traits.flat()]); summary = `据人物卡：${card.raw}`; src = 'card'; }
    else { merged = mergeTraits(e.traits); summary = e.summaries.sort((a, b) => b.length - a.length)[0] || ''; src = 'extract'; }
    // override 与人物卡冲突：卡里有该角色，但 override 没覆盖卡里任一特征（如 秦桧 卡=奸臣 vs 用户+忠贞不二）
    const cardConflict = !!ov && !!card && card.traits.length && !card.traits.some(t => ov.personality.some(p => p.includes(t) || t.includes(p)));
    if (cardConflict) cardConflicts.push(`${e.name}（卡：${card.raw} ｜ 你定：${ov.personality.join('、')}）`);
    const multi = e.books.length > 1;
    const conflict = multi && src === 'extract' && e.books.some(b => (e.perBook[b] || []).length && mergeTraits([e.perBook[b]]).join() !== merged.join());
    const allWeak = e.weakBooks.length === e.books.length && !card;
    const rebuild = !!ov?.rebuild;
    consolidated.push({ name: e.name, personality: merged, summary, books: e.books, source: src, rebuild, needsReview: allWeak || conflict || rebuild || cardConflict });
    const tag = cardConflict ? '⚠️卡冲突' : rebuild ? '✎⚙️需重抽' : (src === 'override' ? '✎' : src === 'card' ? '📇' : (allWeak ? '⚠️空' : (conflict ? '⚠️跨本' : '')));
    lines.push(`### ${e.name} ${tag}　(${e.books.join('/')})`);
    lines.push(`- **合并**：${merged.join(' / ') || '（空，待给）'}`);
    if (card) lines.push(`  - 📇人物卡: ${card.raw}`);
    if (multi) for (const b of e.books) lines.push(`  - ${b}: ${(e.perBook[b] || []).join(' / ') || '—'}`);
    lines.push('');
  }
  await writeFile(join(canon, 'personality-consolidated.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), characters: consolidated }, null, 2)}\n`);
  await writeFile(join(canon, 'personality-consolidated-review.md'), `${lines.join('\n')}\n`);
  const rev = consolidated.filter(c => c.needsReview).map(c => c.name);
  console.log(`合并 ${consolidated.length} 人（卡 ${consolidated.filter(c => c.source === 'card').length} / override ${consolidated.filter(c => c.source === 'override').length} / 抽取 ${consolidated.filter(c => c.source === 'extract').length}）`);
  if (cardConflicts.length) console.log(`⚠️ override 与人物卡冲突 ${cardConflicts.length}:\n  ${cardConflicts.join('\n  ')}`);
  console.log(`需你定(⚠️ ${rev.length}): ${rev.join('、')}`);
}
run().catch(e => { console.error(e); process.exit(1); });
