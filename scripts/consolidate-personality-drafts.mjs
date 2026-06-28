#!/usr/bin/env node

// 把三本 {book}.personality-draft.json 按角色归并成「全本统一一套」personality（用户定：统一不分本）。
// 合并：并集去重(精确+子串包含)、限 6 条；带 OVERRIDES 人工修正(小紫等)；跨本冲突仍并入但 markdown 里标 ⚠️。
// 产 character-canon/personality-consolidated.json（投影用）+ personality-consolidated-review.md（人审用）。不改 mod。

import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const canon = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash', 'character-canon');
const books = ['qingyu', 'yunlong', 'yange'];

// 人工正典修正：name -> { personality:[...], summary }。覆盖抽取结果。
const OVERRIDES = {
  小紫: {
    personality: ['心机深沉', '城府极深', '鬼点子多', '善扮乖藏锋', '暗中掌控全局（各房后宫皆被收服）', '对程宗扬温柔深情'],
    summary: '人称「紫妈妈」：外表银白长发、娇小如孩，实则心机深沉、城府极深、鬼点子层出，扮乖藏锋而暗中掌控全局，把后宫各房收得服服帖帖；对程宗扬温柔深情。',
  },
  程宗扬: {
    personality: ['随和洒脱', '待人温柔体贴', '机敏狡黠', '颇有城府', '善随机应变', '重情重义'],
    summary: '外表随和洒脱、待人温柔体贴，实则机敏狡黠、颇有城府，善随机应变，重情重义。',
  },
  秦桧: {
    personality: ['才智高绝', '狡诈多端', '城府深沉', '谨慎多疑', '狠辣果断', '对主忠贞不二'],
    summary: '才智高绝、城府深沉的狡诈谋士，谨慎狠辣，却对主君忠贞不二。',
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
  const consolidated = [];
  const lines = ['# 仙途 · 性格合并版（全本统一一套，待审）', '', '> 抽取自原文(extract-personality)→ 按角色并集去重。⚠️=跨本差异大或抽空，需你定。✎=已人工修正。', ''];
  for (const e of [...byName.values()].sort((a, b) => b.books.length - a.books.length)) {
    const ov = OVERRIDES[e.name];
    const merged = ov ? ov.personality : mergeTraits(e.traits);
    const summary = ov ? ov.summary : (e.summaries.sort((a, b) => b.length - a.length)[0] || '');
    // 跨本冲突信号：出现在>1本且并后条数明显多于单本（粗略）
    const multi = e.books.length > 1;
    const conflict = multi && !ov && e.books.some(b => (e.perBook[b] || []).length && mergeTraits([e.perBook[b]]).join() !== merged.join());
    const allWeak = e.weakBooks.length === e.books.length;
    const rebuild = !!ov?.rebuild;
    consolidated.push({ name: e.name, personality: merged, summary, books: e.books, override: !!ov, rebuild, needsReview: allWeak || conflict || rebuild });
    const tag = rebuild ? '✎⚙️需重抽' : (ov ? '✎' : (allWeak ? '⚠️空' : (conflict ? '⚠️跨本' : '')));
    lines.push(`### ${e.name} ${tag}　(${e.books.join('/')})`);
    lines.push(`- **合并**：${merged.join(' / ') || '（空，待给）'}`);
    if (multi) for (const b of e.books) lines.push(`  - ${b}: ${(e.perBook[b] || []).join(' / ') || '—'}`);
    lines.push('');
  }
  await writeFile(join(canon, 'personality-consolidated.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), characters: consolidated }, null, 2)}\n`);
  await writeFile(join(canon, 'personality-consolidated-review.md'), `${lines.join('\n')}\n`);
  const rev = consolidated.filter(c => c.needsReview).map(c => c.name);
  console.log(`合并 ${consolidated.length} 人 → personality-consolidated.{json,md}`);
  console.log(`人工修正(✎): ${Object.keys(OVERRIDES).join('、')}`);
  console.log(`需你定(⚠️ ${rev.length}): ${rev.join('、')}`);
}
run().catch(e => { console.error(e); process.exit(1); });
