#!/usr/bin/env node

// 规整跨 stage 不一致的角色 ID。按角色名(跨书)归并 → 同名同一人 → canonical
// liuchao.character.<slug>(slug 取最常用变体)。级联改所有引用字段，更新 id-map.json。
// 仅处理"id-set>1 的不一致角色"，不动本就一致的，最小化爆炸半径。
// 拼音根明显不同的组打 ⚠️（仍按最常用变体修，提示人工复核）。
//
// Usage: node scripts/normalize-character-ids.mjs [--dry-run]

import { readFile, readdir, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generatedRoot = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canonDir = join(generatedRoot, 'character-canon');
const dryRun = process.argv.includes('--dry-run');
const books = ['qingyu', 'yunlong', 'yange'];

// 人工指定 canonical slug（拼音根冲突，按真实读音/name 字段确定）。
const OVERRIDE = {
  吕冀: 'lv_ji', 刘骜: 'liu_ao', 李昂: 'li_ang', 吕雉: 'lv_zhi', 白霓裳: 'bai_nichang',
  萧遥逸: 'xiao_yao_yi', 青面兽: 'qing_mian_shou', 高智商: 'gao_zhishang',
};

const REF_SINGULAR = new Set(['characterId', 'fromCharacterId', 'toCharacterId', 'playerCharacterId']);
const REF_ARRAY = new Set(['featuredCharacterIds', 'relatedCharacterIds', 'allowedCharacterIds']);

const slugOf = id => id.replace(/^.*\.character\./, '');
const deUnderscore = s => s.replace(/_/g, '');

async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }
async function stageFiles(book) {
  const dir = join(generatedRoot, book, 'stages');
  return (await readdir(dir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json')).map(n => join(dir, n));
}

// 递归改引用字段（不碰普通 id 字段）。
function remapRefs(node, map) {
  if (Array.isArray(node)) { node.forEach(x => remapRefs(x, map)); return; }
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (REF_SINGULAR.has(k) && typeof v === 'string' && map.has(v)) node[k] = map.get(v);
    else if (REF_ARRAY.has(k) && Array.isArray(v)) node[k] = v.map(x => (typeof x === 'string' && map.has(x) ? map.get(x) : x));
    else remapRefs(v, map);
  }
}

async function run() {
  // 1) 全局按名字聚合 id（带使用计数）。
  const byName = new Map(); // name -> Map(id -> count)
  for (const book of books) {
    for (const f of await stageFiles(book)) {
      const m = await readJson(f);
      for (const c of m.canon?.characters || []) {
        if (!c.name || !c.id) continue;
        const ids = byName.get(c.name) || new Map();
        ids.set(c.id, (ids.get(c.id) || 0) + 1);
        byName.set(c.name, ids);
      }
    }
  }

  // 2) 选 canonical + 构建 remap。
  const isNp = slug => /^np\d+$/.test(slug);
  const pickSlug = pool => {
    const bySlug = new Map();
    for (const v of pool) bySlug.set(v.slug, (bySlug.get(v.slug) || 0) + v.n);
    return [...bySlug.entries()].sort((a, b) =>
      b[1] - a[1] || (b[0].split('_').length - a[0].split('_').length) || a[0].localeCompare(b[0]))[0][0];
  };
  const remap = new Map();
  const report = [];
  const escalate = [];
  for (const [name, ids] of byName) {
    if (ids.size <= 1) continue; // 一致，不动
    const variants = [...ids.entries()].map(([id, n]) => ({ id, n, slug: slugOf(id) }));
    const pinyin = variants.filter(v => !isNp(v.slug));
    const pool = pinyin.length ? pinyin : variants; // 有真实拼音则忽略 np 占位
    // 池内去下划线后若仍有 >1 种拼音根 → 真歧义，除非 OVERRIDE 指定，否则交人工。
    if (!OVERRIDE[name] && pinyin.length && new Set(pool.map(v => deUnderscore(v.slug))).size > 1) {
      escalate.push({ name, variants: variants.map(v => `${v.id}×${v.n}`) });
      continue;
    }
    const canonical = `liuchao.character.${OVERRIDE[name] || pickSlug(pool)}`;
    for (const v of variants) if (v.id !== canonical) remap.set(v.id, canonical);
    report.push({ name, canonical, allNp: !pinyin.length, variants: variants.map(v => `${v.id}×${v.n}`) });
  }

  // canonical 撞名守卫：两个不同名字不能映到同一 canonical（np 占位最易踩）。
  const canonOwner = new Map();
  for (const r of report) {
    if (canonOwner.has(r.canonical)) throw new Error(`canonical 冲突：${r.canonical} 同时属于 ${canonOwner.get(r.canonical)} 和 ${r.name}，请人工指定。`);
    canonOwner.set(r.canonical, r.name);
  }

  console.log(`自动规整 ${report.length} 个，涉及旧 ID ${remap.size} 个；需人工定夺 ${escalate.length} 个。\n`);
  for (const r of report.sort((a, b) => Number(a.allNp) - Number(b.allNp))) {
    console.log(`${r.allNp ? '◻︎np ' : '   '}${r.name} → ${r.canonical}\n      ${r.variants.join('  |  ')}`);
  }
  if (escalate.length) {
    console.log('\n⚠️ 需你指定 canonical（拼音根冲突，自动选会错）：');
    for (const e of escalate) console.log(`   ${e.name}: ${e.variants.join('  |  ')}`);
  }
  if (dryRun) { console.log('\nDRY RUN — 未写文件。'); return; }

  // 3) 备份 + 应用
  let charIdChanges = 0, mergedEntries = 0;
  for (const book of books) {
    const stageDir = join(generatedRoot, book, 'stages');
    const backup = join(generatedRoot, book, 'stages-pre-idfix-backup');
    if (existsSync(backup)) await rm(backup, { recursive: true });
    await cp(stageDir, backup, { recursive: true });
    for (const f of await stageFiles(book)) {
      const m = await readJson(f);
      // 3a) characters[].id
      for (const c of m.canon?.characters || []) if (c.id && remap.has(c.id)) { c.id = remap.get(c.id); charIdChanges += 1; }
      // 3b) 同一 stage 内重映后 id 撞车 → 合并条目（保留字段更多的，union 数组）。
      const seen = new Map();
      const kept = [];
      for (const c of m.canon?.characters || []) {
        if (seen.has(c.id)) {
          const a = seen.get(c.id);
          for (const k of ['skillIds', 'techniqueIds', 'itemIds']) if (Array.isArray(c[k])) a[k] = [...new Set([...(a[k] || []), ...c[k]])];
          if (!a.profile && c.profile) a.profile = c.profile;
          mergedEntries += 1;
        } else { seen.set(c.id, c); kept.push(c); }
      }
      if (m.canon) m.canon.characters = kept;
      // 3c) 级联引用
      remapRefs(m, remap);
      await writeFile(f, `${JSON.stringify(m, null, 2)}\n`);
    }
  }

  // 4) 更新 id-map.json
  for (const book of books) {
    const f = join(canonDir, `${book}.character-id-map.json`);
    if (!existsSync(f)) continue;
    const map = await readJson(f);
    for (const v of Object.values(map)) if (v && typeof v === 'object' && v.id && remap.has(v.id)) v.id = remap.get(v.id);
    await writeFile(f, `${JSON.stringify(map, null, 2)}\n`);
  }

  console.log(`\n应用完成：改 characters[].id ${charIdChanges} 处，合并撞车条目 ${mergedEntries} 个。备份 stages-pre-idfix-backup。`);
}

run().catch(err => { console.error(err); process.exit(1); });
