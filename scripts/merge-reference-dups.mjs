#!/usr/bin/env node

// 任务3：清参照层(id-map)同人多ID。SAFE=纯同名(跨书/np占位/称号变体)机械合并到 canonical liuchao 实拼音 id；
// UNCERTAIN=括号引入了"新人名"(非称号)的(如 小紫（紫妈妈）、高智商（甄厚道）、阮香琳（蛇夫人）)→ 不动，写入 uncertainties.md 待议。
// 级联改 stages 引用 + 三本 id-map；canonical 撞名守卫；备份 stages-pre-refmerge-backup。
//
// Usage: node scripts/merge-reference-dups.mjs [--dry-run]

import { readFile, readdir, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canonDir = join(gen, 'character-canon');
const dryRun = process.argv.includes('--dry-run');
const books = ['qingyu', 'yunlong', 'yange'];

const TITLE = /^(太后|皇后|皇太后|太皇太后|公主|郡王|博陆郡王|江王|定陶王|王|皇|帝|妃|贵妃|君|襄城君|湖阳君|夫人|蛇夫人|侯|将军|大人|尊者|老祖|掌教|宗主|唐皇|皇帝|太子|世子)$/;
const slugOf = id => id.replace(/^.*\.character\./, '');
const isNp = s => /^np\d+$/.test(s);
const deParen = s => s.replace(/[（(][^）)]*[）)]/g, '').split(/[·•・]/)[0].trim();
const parenContents = s => [...s.matchAll(/[（(]([^）)]+)[）)]/g)].map(m => m[1].trim());

async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }

const REF1 = new Set(['characterId', 'fromCharacterId', 'toCharacterId', 'playerCharacterId']);
const REFA = new Set(['featuredCharacterIds', 'relatedCharacterIds', 'allowedCharacterIds']);
function remapRefs(node, remap) {
  if (Array.isArray(node)) return node.forEach(x => remapRefs(x, remap));
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (REF1.has(k) && typeof v === 'string' && remap.has(v)) node[k] = remap.get(v);
    else if (REFA.has(k) && Array.isArray(v)) node[k] = v.map(x => (remap.has(x) ? remap.get(x) : x));
    else remapRefs(v, remap);
  }
}

async function run() {
  const reg = await readJson(join(canonDir, 'character-alias-registry.json'));
  const groups = {};
  for (const c of reg.characters) { const k = deParen(c.realName || c.canonicalName); (groups[k] = groups[k] || []).push(c); }

  const remap = new Map();
  const safeReport = [], uncertain = [];
  for (const [person, recs] of Object.entries(groups)) {
    const ids = [...new Set(recs.map(c => c.id))];
    if (ids.length < 2) continue;
    // 可疑：任一记录的括号里出现"非称号的新人名"
    const novel = new Set();
    for (const c of recs) for (const p of parenContents(c.canonicalName)) {
      const dp = deParen(p);
      if (dp && dp !== person && !TITLE.test(dp) && !person.includes(dp) && !dp.includes(person)) novel.add(p);
    }
    if (novel.size) { uncertain.push({ person, ids, novel: [...novel] }); continue; }
    // canonical 必须用实拼音；全 np 组(跨书 np 号会碰撞)无法生成干净 canonical → 暂不合并、标记。
    const slugs = ids.map(slugOf);
    const pinyin = slugs.filter(s => !isNp(s));
    if (!pinyin.length) { uncertain.push({ person, ids, noPinyin: true }); continue; }
    const slug = pinyin.sort((a, b) => (b.split('_').length - a.split('_').length) || a.localeCompare(b))[0];
    const canonical = `liuchao.character.${slug}`;
    for (const id of ids) if (id !== canonical) remap.set(id, canonical);
    safeReport.push({ person, canonical, ids });
  }
  // 撞名守卫
  const owner = new Map();
  for (const r of safeReport) { if (owner.has(r.canonical) && owner.get(r.canonical) !== r.person) throw new Error(`canonical 冲突 ${r.canonical}: ${owner.get(r.canonical)} vs ${r.person}`); owner.set(r.canonical, r.person); }

  console.log(`SAFE 合并 ${safeReport.length} 组(${remap.size} 旧id→canonical)；UNCERTAIN ${uncertain.length} 组待议。`);
  if (dryRun) { for (const u of uncertain) console.log('  ⚠️', u.person, u.novel ? `←括号新名: ${u.novel.join('、')}` : '(全np缺拼音)'); console.log('DRY RUN'); return; }

  // 应用到 stages
  for (const book of books) {
    const stageDir = join(gen, book, 'stages');
    const backup = join(gen, book, 'stages-pre-refmerge-backup');
    if (existsSync(backup)) await rm(backup, { recursive: true });
    await cp(stageDir, backup, { recursive: true });
    for (const f of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
      const m = await readJson(join(stageDir, f));
      for (const c of m.canon?.characters || []) if (c.id && remap.has(c.id)) c.id = remap.get(c.id);
      // 关卡内角色去重
      const seen = new Map(); const kept = [];
      for (const c of m.canon?.characters || []) { if (seen.has(c.id)) { const a = seen.get(c.id); for (const k of ['skillIds', 'techniqueIds', 'itemIds']) if (Array.isArray(c[k])) a[k] = [...new Set([...(a[k] || []), ...c[k]])]; if (!a.profile && c.profile) a.profile = c.profile; } else { seen.set(c.id, c); kept.push(c); } }
      if (m.canon) m.canon.characters = kept;
      remapRefs(m, remap);
      // 关系去重
      if (Array.isArray(m.canon?.playerRelationships)) { const s = new Set(); m.canon.playerRelationships = m.canon.playerRelationships.filter(r => (s.has(r.characterId) ? false : (s.add(r.characterId), true))); }
      if (Array.isArray(m.canon?.relationships)) { const s = new Set(); m.canon.relationships = m.canon.relationships.filter(r => r.fromCharacterId !== r.toCharacterId && (s.has(`${r.fromCharacterId}::${r.toCharacterId}`) ? false : (s.add(`${r.fromCharacterId}::${r.toCharacterId}`), true))); }
      await writeFile(join(stageDir, f), `${JSON.stringify(m, null, 2)}\n`);
    }
  }
  // id-map
  for (const book of books) {
    const f = join(canonDir, `${book}.character-id-map.json`);
    if (!existsSync(f)) continue;
    const map = await readJson(f);
    for (const v of Object.values(map)) if (v?.id && remap.has(v.id)) v.id = remap.get(v.id);
    await writeFile(f, `${JSON.stringify(map, null, 2)}\n`);
  }
  // uncertainties.md 追加
  const uPath = join(canonDir, 'uncertainties.md');
  let prev = existsSync(uPath) ? await readFile(uPath, 'utf8') : '# 仙途 · 待议/不确定清单\n';
  const novelU = uncertain.filter(u => u.novel);
  const noPyU = uncertain.filter(u => u.noPinyin);
  prev += `\n## 任务3 参照层合并\n### A. 括号引入新人名，疑似异人(${novelU.length}) — 待核是否同一人\n`;
  for (const u of novelU) prev += `- **${u.person}**（${u.ids.length} id）括号新名：${u.novel.join('、')}\n`;
  prev += `\n### B. 全 np 占位、缺实拼音(${noPyU.length}) — 同一人但无干净 canonical，暂不合并(需补拼音 id)\n`;
  for (const u of noPyU) prev += `- **${u.person}**：${u.ids.join('、')}\n`;
  await writeFile(uPath, prev);
  console.log(`SAFE 合并完成；UNCERTAIN ${uncertain.length} 组写入 uncertainties.md。备份 stages-pre-refmerge-backup。`);
}
run().catch(e => { console.error(e); process.exit(1); });
