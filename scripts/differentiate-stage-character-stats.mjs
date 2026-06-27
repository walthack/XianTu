#!/usr/bin/env node

// Differentiate imported characters so they aren't identical defaults, assigning
// 灵根/天赋 from the game's own preset pools (creationData LOCAL_SPIRIT_ROOTS/LOCAL_TALENTS),
// and grading rare (novel-exclusive) things as high quality.
// Deterministic heuristics (name-hash for stable per-character variation). Tunable via
// the ROLE_* maps below.
//   - importance tier 0 protagonist /1 core /2 supporting /3 minor  (extraction count + role)
//   - 先天六司: tier baseline + role lean + ±1 jitter
//   - 灵根: role→五行 type, tier→品级(天/地/玄/黄品); rare roots (混沌/天妒之体…) only tier≤1
//   - 天赋: role→preset talent (everyone gets one) + the character's OWN exclusive innate skill
//   - content item/technique .grade: exclusive&独占→仙/极品, exclusive&共享→上品, else 中/下品
//
// Usage: node scripts/differentiate-stage-character-stats.mjs [book...] [--dry-run]

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
function hash(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; }
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pick = (arr, seed) => arr[hash(seed) % arr.length];

const DIMS = ['rootBone', 'spirituality', 'comprehension', 'fortune', 'charm', 'temperament'];
const ROOT_TIERS = ['天品', '地品', '玄品', '黄品'];
const FIVE = ['金灵根', '木灵根', '水灵根', '火灵根', '土灵根', '雷灵根', '冰灵根', '风灵根'];
const RARE_ROOTS = ['混沌灵根', '天妒之体', '虚空灵根', '星辰灵根', '时间灵根'];
// infer a 灵根 from the elemental flavour of a character's skills/items/innate names
// (e.g. 凝羽's 月光操纵 → 暗灵根, 乐明珠's 凤凰宝典 → 火灵根). Order matters: specific first.
const ELEMENT_MAP = [
  [/月|夜|暗|影|幽|冥|阴|魅/, '暗灵根'],
  [/光|明|日|曜|圣洁/, '光灵根'],
  [/凤|炎|焰|火|烈|赤|朱|阳神/, '火灵根'],
  [/冰|雪|寒|霜/, '冰灵根'],
  [/水|波|涛|海|鲛|潮/, '水灵根'],
  [/雷|电|霆/, '雷灵根'],
  [/风|罡|疾/, '风灵根'],
  [/毒|蛊/, '毒灵根'],
  [/血/, '血灵根'],
  [/剑|刀|锋|金铁|断门/, '金灵根'],
  [/木|草|花|药|林|藤|医/, '木灵根'],
  [/土|石|山|岩/, '土灵根'],
];
function elementFromClues(clues) {
  const text = clues.join(' ');
  for (const [re, rootName] of ELEMENT_MAP) if (re.test(text)) return rootName;
  return null;
}
const MINOR_TALENTS = ['老实人', '夜猫子', '农夫之子', '过目不忘', '一诺千金'];

// --- realm unification: map the novel's mixed 武道/级数/X阳 systems into the game's
// canonical 仙侠 RealmLevel so runtime REALM_ATTRIBUTE_STANDARDS can compute attributes.
const REALMS = ['凡人', '练气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '渡劫'];
const BOOK_OFFSET = { qingyu: 0, yunlong: 1, yange: 2 }; // sequels run stronger overall
function cn2num(s) { if (/^\d+$/.test(s)) return +s; const m = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }; return m[s] || 0; }
function parseRealmIndex(realm) {
  const r = realm || '';
  if (/渡劫/.test(r)) return 8; if (/合体/.test(r)) return 7; if (/炼虚/.test(r)) return 6;
  if (/化神/.test(r)) return 5; if (/元婴/.test(r)) return 4; if (/金丹|妖丹/.test(r)) return 3;
  if (/筑基/.test(r)) return 2; if (/练气/.test(r)) return 1;
  if (/超凡|通天|神级/.test(r)) return 5; if (/通幽/.test(r)) return 3;
  if (/坐照|入微/.test(r)) return 2; if (/固本/.test(r)) return 1;
  const yang = r.match(/([一二三四五六七八九十\d]+)阳/); if (yang) { const x = cn2num(yang[1]); return x <= 3 ? 1 : x <= 6 ? 2 : 3; }
  const lvl = r.match(/(?:第)?([一二三四五六七八九十\d]+)\s*级/); if (lvl) { const x = cn2num(lvl[1]); return clamp(Math.round(x / 2), 1, 8); }
  if (/真气.*重/.test(r)) return 1;
  if (/凡人|凡俗/.test(r)) return 0;
  return null; // 无/噪声 → tier fallback
}
function fallbackRealmIndex(tier, role, bookId) {
  let base = [2, 1, 1, 0][tier]; // keep the pyramid: most unknown NPCs are low realm
  if (/老祖|教御|掌教|宗主|尊者|侯|王|帝|大将军|帅|长老/.test(role || '')) base += 1;
  return clamp(base + (BOOK_OFFSET[bookId] || 0), 0, 8);
}

// --- tunable role mappings ---
function tierOf(count, role, isProtag) {
  const r = role || '';
  if (isProtag) return 0; // protagonist is matched by name only; role text like "主角的情人" must not promote NPCs
  if (count >= 8 || /侯|王|帝|后|太后|公主|将|帅|宗主|掌教|教御|首领|尊者|大将军/.test(r)) return 1;
  if (count >= 4 || /弟子|护卫|侍卫|谋士|医者|术士|将领|执事|长老|大侠|八骏/.test(r)) return 2;
  return 3;
}
function roleRoot(role) {
  const r = role || '';
  if (/医|丹|药/.test(r)) return '木灵根';
  if (/谋|智|相|执事/.test(r)) return '水灵根';
  if (/将|帅|武|护卫|侍卫|刀|剑/.test(r)) return '火灵根';
  if (/商|贾/.test(r)) return '土灵根';
  return null;
}
function roleTalent(role, tier, seed, isProtag) {
  const r = role || '';
  if (isProtag) return '天命主角';
  if (/医|丹|药/.test(r)) return '丹道圣手';
  if (/谋|智|相|执事/.test(r)) return pick(['神识过人', '过目不忘'], seed);
  if (/将|帅|武|护卫|侍卫|刀|剑/.test(r)) return pick(['天生神力', '剑骨天成', '体修奇才'], seed);
  if (/商|贾/.test(r)) return '多宝童子';
  if (/姬|妃|公主|后|美|舞|花魁|魅/.test(r)) return '顶级魅力';
  if (/宗主|掌教|长老|侯|王|帝|尊者/.test(r)) return '道心坚固';
  return tier <= 1 ? pick(['剑骨天成', '灵觉敏锐', '神识过人'], seed) : pick(MINOR_TALENTS, seed);
}
function roleLean(role) {
  const r = role || ''; const b = {};
  if (/医|术|谋|执事|长老|相/.test(r)) { b.comprehension = 2; b.spirituality = 1; }
  if (/将|帅|护卫|侍卫|武|刀|剑/.test(r)) b.rootBone = 2;
  if (/商|贾/.test(r)) { b.fortune = 2; b.charm = 1; }
  if (/姬|妃|公主|后|美|舞|花魁/.test(r)) b.charm = 2;
  if (/主角|侯|王|宗主|掌教/.test(r)) { b.temperament = 1; b.comprehension = 1; }
  return b;
}

for (const book of books) {
  const exDir = join(generatedRoot, book.id, 'extraction');
  const stageDir = join(generatedRoot, book.id, 'stages');
  const charAgg = new Map();
  const facts = new Map();
  for (const f of (await readdir(exDir)).filter(n => n.endsWith('.json'))) {
    const b = await readJson(join(exDir, f));
    for (const cs of b.characterStates || []) {
      if (!cs?.name) continue;
      const e = charAgg.get(cs.name) || { count: 0, roles: new Set() };
      e.count += 1; if (cs.role) e.roles.add(cs.role); charAgg.set(cs.name, e);
    }
    for (const cf of b.contentFacts || []) {
      if (!cf?.name || !cf.kind) continue;
      const k = `${cf.kind}:${cf.name}`;
      const e = facts.get(k) || { kind: cf.kind, name: cf.name, exclusive: false, holders: new Set() };
      if (cf.exclusive) e.exclusive = true;
      for (const h of cf.holders || []) e.holders.add(String(h));
      facts.set(k, e);
    }
  }
  const roleOf = n => [...(charAgg.get(n)?.roles || [])].join(' '); // match against ALL roles
  const tierByName = n => tierOf(charAgg.get(n)?.count || 0, roleOf(n), /程宗扬/.test(n));
  // a character's OWN innate ability = exclusive skill held by them alone (生死根), excluding
  // extraction noise where 境界/状态 got mislabeled as a skill (e.g. 入微级修为/真阳).
  const innateByHolder = new Map();
  const cluesByHolder = new Map(); // name -> [skill/item/技能 names] for elemental inference
  for (const e of facts.values()) {
    for (const h of e.holders) { const c = cluesByHolder.get(h) || []; c.push(e.name); cluesByHolder.set(h, c); }
    if (e.kind === 'skill' && e.exclusive && e.holders.size === 1) {
      if (/级|修为|第.|境界|阶段|真阳|筑基|突破/.test(e.name)) continue;
      const h = [...e.holders][0]; const arr = innateByHolder.get(h) || []; if (arr.length < 1) arr.push(e.name); innateByHolder.set(h, arr);
    }
  }

  let touched = 0;
  for (const fn of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
    const mod = await readJson(join(stageDir, fn));
    for (const ch of mod.canon?.characters || []) {
      const name = ch.name; const isProtag = /程宗扬/.test(name); const t = tierByName(name); const role = roleOf(name); const lean = roleLean(role);
      const profile = ch.profile = ch.profile || {};
      // 先天六司
      const base = [8, 7, 6, 5][t]; const attrs = {};
      for (const d of DIMS) attrs[d] = clamp(base + ((hash(name + d) % 3) - 1) + (lean[d] || 0), 1, 10);
      profile.attributes = attrs;
      // 灵根
      const innate = innateByHolder.get(name) || [];
      let rootName;
      if (innate.length && isProtag) rootName = '变异灵根';
      else {
        // 1) elemental flavour of the character's own skills/异能  2) rare root (tier≤1, occasional)
        // 3) role-based 五行  4) name-hashed 五行
        const elem = elementFromClues([...innate, ...(cluesByHolder.get(name) || [])]);
        rootName = elem
          || (t <= 1 && hash(name + 'rare') % 4 === 0 ? pick(RARE_ROOTS, name + 'rr') : (roleRoot(role) || pick(FIVE, name)));
      }
      profile.spiritRoot = {
        name: rootName,
        tier: rootName === '变异灵根' ? '天品' : ROOT_TIERS[t],
        description: innate.length ? `身怀${innate.join('、')}，由剧本正典认定。` : '依角色定位由剧本正典赋予。',
      };
      // 天赋：预设天赋（人人有一个）+ 自身专属异能
      const talents = [{ name: roleTalent(role, t, name + 'tal', isProtag), description: '由角色定位推定的天赋。' }];
      for (const n of innate) if (!talents.some(x => x.name === n)) talents.push({ name: n, description: `${name}的专属异能。` });
      profile.talents = talents;
      // 境界统一：解析现有 realm → 仙侠境界；无/噪声按重要性兜底
      const ri = parseRealmIndex(ch.realm);
      ch.realm = REALMS[ri != null ? ri : fallbackRealmIndex(t, role, book.id)];
      touched += 1;
    }
    // 品质分级
    for (const kind of ['items', 'techniques']) for (const entry of mod.content?.[kind] || []) {
      const fact = facts.get(`${kind === 'items' ? 'item' : 'technique'}:${entry.name}`);
      if (!fact) continue;
      const minTier = Math.min(...[...fact.holders].map(tierByName), 3);
      entry.grade = fact.exclusive ? (fact.holders.size === 1 && minTier === 0 ? '仙品' : minTier <= 1 ? '极品' : '上品') : (minTier <= 1 ? '中品' : '下品');
    }
    if (!dryRun) await writeFile(join(stageDir, fn), JSON.stringify(mod, null, 2));
  }
  console.log(`${book.id}: 差异化完成（角色实例 ${touched}）`);
}
console.log(dryRun ? 'DRY RUN — 未写文件。' : '角色属性已按预设库差异化。');
