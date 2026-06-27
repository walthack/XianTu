#!/usr/bin/env node

// Roadmap #5 (deterministic part): normalize faction canon — unify the messy 中英 type
// strings into a consistent set, fill the universally-missing level (势力等级) from member
// count + type, and give factions baseline features when empty. Does NOT touch faction-to-
// faction relations (no schema field / no extraction data — needs a schema PR + LLM later).
//
// Usage: node scripts/normalize-faction-canon.mjs [book...] [--dry-run]

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generatedRoot = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const bookArgs = argv.filter(a => !a.startsWith('--'));
const allBooks = [{ id: 'qingyu' }, { id: 'yunlong' }, { id: 'yange' }];
const books = allBooks.filter(b => bookArgs.length === 0 || bookArgs.includes(b.id));

async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }

const TYPE_RULES = [
  [/朝廷|官府|国家|帝国|诸侯|王朝|government|state|外戚|政治|官方/, '朝廷'],
  [/军|营|团|army|military|佣兵|卫/, '军队'],
  [/商会|商馆|镖局|钱庄|商行|trade|merchant|货/, '商会'],
  [/世家|家族|clan|门阀/, '世家'],
  [/部族|部落|族|tribe|蛮/, '部族'],
  [/江湖|帮会|联盟|league|帮派|绿林/, '江湖'],
  [/寺|庙|佛门|寺院|教派|教团|temple|庵/, '教派'],
  [/魔道|魔门|邪/, '魔道'],
  [/情报|秘密|secret|间谍|机构|暗/, '秘盟'],
  [/宗|门|山门|道观|修行宗门|sect|隐秘宗派|观堂/, '宗门'],
];
function normType(type, name) {
  const t = `${type || ''} ${name || ''}`;
  for (const [re, out] of TYPE_RULES) if (re.test(t)) return out;
  return '组织';
}
const LEVELS = ['小门派', '三流', '二流', '一流', '超级'];
function levelOf(memberCount, type) {
  let idx = memberCount >= 12 ? 3 : memberCount >= 6 ? 2 : memberCount >= 3 ? 1 : 0;
  if (/朝廷|帝国|魔道/.test(type)) idx += 1; // states/big powers run larger
  return LEVELS[Math.min(idx, 4)];
}
const DEFAULT_FEATURES = {
  宗门: ['修行传承', '门规森严'], 朝廷: ['统御一方', '律法治世'], 军队: ['兵戈之利', '令行禁止'],
  商会: ['货通四海', '人脉广布'], 世家: ['底蕴深厚', '血脉传承'], 部族: ['同族同心', '悍勇善战'],
  江湖: ['义气为先', '消息灵通'], 教派: ['信徒众多', '教义维系'], 魔道: ['手段狠辣', '令人忌惮'],
  秘盟: ['行事隐秘', '耳目遍布'], 组织: ['自成一系'],
};

for (const book of books) {
  const stageDir = join(generatedRoot, book.id, 'stages');
  const files = (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'));
  // member count per faction id (unique character names with that affiliation, across the book)
  const members = new Map();
  const mods = new Map();
  for (const fn of files) {
    const mod = await readJson(join(stageDir, fn));
    mods.set(fn, mod);
    for (const c of mod.canon?.characters || []) {
      const fids = [c.factionId, ...((c.affiliations || []).map(a => a.factionId))].filter(Boolean);
      for (const fid of fids) {
        const set = members.get(fid) || new Set(); set.add(c.name); members.set(fid, set);
      }
    }
  }

  let changed = 0;
  for (const fn of files) {
    const mod = mods.get(fn);
    let touched = false;
    for (const f of mod.canon?.factions || []) {
      const nt = normType(f.type, f.name);
      if (f.type !== nt) { f.type = nt; touched = true; }
      const cnt = (members.get(f.id) || new Set()).size;
      const lvl = levelOf(cnt, nt);
      if (f.level !== lvl) { f.level = lvl; touched = true; }
      if (!(f.features || []).length) { f.features = (DEFAULT_FEATURES[nt] || ['自成一系']).slice(); touched = true; }
    }
    if (touched) { if (!dryRun) await writeFile(join(stageDir, fn), JSON.stringify(mod, null, 2)); changed += 1; }
  }
  console.log(`${book.id}: 归一势力正典，更新 ${changed} 个 stage`);
}
console.log(dryRun ? 'DRY RUN — 未写文件。' : '势力正典已归一（type/level/features）。');
