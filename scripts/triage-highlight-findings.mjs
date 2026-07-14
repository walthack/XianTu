#!/usr/bin/env node

// 高光/机趣审计的分级 triage：把 audit 出的原始命中(过火严重)喂回 LLM，
// 按 S/A/B/C/D 五级打分 + 给处置推荐(新建beat/补写现有/跳过)，产出短名单(S/A)供人工过目。
// 只读 highlight-audit.{model}.json，不改 stage。
//
// Usage:
//   node scripts/triage-highlight-findings.mjs --model=deepseek            # 三本全分级
//   node scripts/triage-highlight-findings.mjs --model=deepseek --book=yange

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const BOOKS = { qingyu: '六朝清羽记', yunlong: '六朝云龙吟', yange: '六朝燕歌行' };

// 角色全局 beat 频率（跨全部 stage 的 relatedCharacterIds 计数）→ 聚光灯稀缺度。
function loadCharFreq() {
  const freq = new Map(); // name -> count
  const id2name = new Map();
  for (const book of Object.keys(BOOKS)) {
    const dir = join(gen, book, 'stages');
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
      let d; try { d = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { continue; }
      for (const c of d.canon?.characters || []) id2name.set(c.id, c.name);
    }
  }
  for (const book of Object.keys(BOOKS)) {
    const dir = join(gen, book, 'stages');
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
      let d; try { d = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { continue; }
      for (const e of d.scenario?.events || []) for (const cid of e.relatedCharacterIds || []) {
        const nm = id2name.get(cid); if (nm) freq.set(nm, (freq.get(nm) || 0) + 1);
      }
    }
  }
  return freq;
}
const CHAR_FREQ = loadCharFreq();

// 稀缺乘子：出场越少，单个高光越珍贵；主角级打折。
function scarcityMult(charName) {
  const n = CHAR_FREQ.get(charName) || 0;
  if (n === 0) return 1.0;         // 未匹配到已有角色，不加不减
  if (n <= 4) return 1.6;
  if (n <= 19) return 1.3;
  if (n <= 79) return 1.0;
  return 0.65;                      // ≥80 主角/核心常驻
}

// 综合优先级：tier 基础分 × 稀缺乘子 + 定义性 beat 加成。
function priorityScore(g) {
  const base = { S: 100, A: 70, B: 40, C: 15, D: 0 }[g.tier] ?? 0;
  const defBonus = ['死亡', '登场', '转身'].includes(g.def) ? 25 : 0;
  return Math.round(base * scarcityMult(g.char) + defBonus);
}
const GRADER_MODEL = process.env.XIANTU_TRIAGE_MODEL || 'deepseek/deepseek-v4-flash';
const BATCH = Number(process.env.XIANTU_TRIAGE_BATCH || 40);

const arg = (k, def) => { const m = process.argv.find(a => a.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : def; };
const sourceModel = arg('model', 'deepseek');
const onlyBook = arg('book', '');

function loadKey() {
  const p = join(root, '.env');
  if (existsSync(p)) for (const l of readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^OPENROUTER_API_KEY=(.*)$/); if (m) return m[1].trim(); }
  return process.env.OPENROUTER_API_KEY;
}
const KEY = loadKey();

const RUBRIC = [
  '你是小说改编游戏的剧情节点(beat)分级编辑。下面是自动审计抽出的“高光/机趣”候选，审计过火、良莠不齐。',
  '请为每条按显著性打级，标准如下：',
  '  S = 名场面/名梗，非落 beat 不可：系列级记忆点，如主要人物之死、震撼立威、标志性反转、传世机趣(现代词被古风世界正经建制化那类)。',
  '  A = 强高光/强机趣：很值得一个独立 beat，读者会记住。',
  '  B = 不错但非必须：可用来丰富已有 beat，不值得单开。',
  '  C = 一般/局部：戏剧性有限，跳过。',
  '  D = 勉强算不上高光/机趣：噪声，弃。',
  '再给处置推荐 rec：',
  '  new = 新建一个 beat；enrich = 补写到 coverage=flattened 命中的现有 beat；skip = 不处理。',
  '判级从严，宁可降级：S 全书应是极少数。coverage=missing 更可能 new，coverage=flattened 更可能 enrich。',
  '另外每条给出：char = 这个时刻的主角色姓名（谁的高光/机趣，取最核心的一个）；def = 是否该角色的定义性时刻，取值 死亡|登场|转身|无（转身=重大立场/命运转折）。',
  '输出严格 JSON 数组，逐条对应输入序号：[{"i":序号,"tier":"S|A|B|C|D","rec":"new|enrich|skip","char":"角色名","def":"死亡|登场|转身|无","note":一句理由(≤30字)}]。只输出 JSON。',
].join('\n');

async function grade(batch, label) {
  const listing = batch.map((f, k) => `${k}. [${f.type}/${f.coverage}] ${f.title || ''}｜原文:${f.source || ''}｜why:${f.why || ''}｜matchedBeat:${f.matchedBeat || '无'}`).join('\n');
  const user = `候选清单（共${batch.length}条）：\n${listing}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ model: GRADER_MODEL, temperature: 0.1, messages: [{ role: 'system', content: RUBRIC }, { role: 'user', content: user }] }),
      });
      const j = await res.json();
      const c = j.choices?.[0]?.message?.content || '';
      const a = c.indexOf('['), b = c.lastIndexOf(']');
      const parsed = a >= 0 && b > a ? JSON.parse(c.slice(a, b + 1)) : null;
      if (Array.isArray(parsed)) return parsed;
      throw new Error('unparseable');
    } catch (e) { if (attempt === 3) { console.error(`  [${label}] 失败: ${e.message}`); return []; } }
  }
  return [];
}

function cacheDir(book) { const d = join(gen, book, '_triage-cache'); if (!existsSync(d)) mkdirSync(d, { recursive: true }); return d; }

async function triageBook(book) {
  const src = join(gen, book, `highlight-audit.${sourceModel}.json`);
  if (!existsSync(src)) { console.log(`跳过 ${book}：无 ${src}`); return; }
  const findings = JSON.parse(readFileSync(src, 'utf8'));
  console.log(`\n=== ${BOOKS[book]}：${findings.length} 条待分级 ===`);
  const graded = [];
  for (let i = 0; i < findings.length; i += BATCH) {
    const batch = findings.slice(i, i + BATCH);
    const label = `${book} ${i + 1}-${i + batch.length}`;
    const hash = createHash('sha1').update(sourceModel).update(GRADER_MODEL).update(JSON.stringify(batch)).digest('hex').slice(0, 12);
    const cp = join(cacheDir(book), `${hash}.json`);
    let grades;
    if (existsSync(cp)) grades = JSON.parse(readFileSync(cp, 'utf8'));
    else { grades = await grade(batch, label); writeFileSync(cp, JSON.stringify(grades)); process.stdout.write(`  ${label} ✓\n`); }
    const byI = new Map(grades.map(g => [g.i, g]));
    batch.forEach((f, k) => { const g = byI.get(k) || {}; graded.push({ ...f, tier: g.tier || 'D', rec: g.rec || 'skip', char: g.char || '', def: g.def || '无', note: g.note || '' }); });
  }
  writeOut(book, graded);
}

function writeOut(book, graded) {
  for (const g of graded) g.pri = priorityScore(g);
  const count = t => graded.filter(g => g.tier === t).length;
  const stats = ['S', 'A', 'B', 'C', 'D'].map(t => `${t} ${count(t)}`).join(' / ');
  // 短名单：S/A 直接进；B 若经稀缺+定义性加权后分数过线（≥70，即够到一个 A 的量级）也进。
  const shortlist = graded
    .filter(g => g.tier === 'S' || g.tier === 'A' || (g.tier === 'B' && g.pri >= 70))
    .sort((x, y) => y.pri - x.pri);
  const fr = g => CHAR_FREQ.get(g.char) || 0;
  const line = g => `- **[${g.tier}·优先${g.pri}]** ${g.type}｜${g.title || ''}　→ \`${g.rec}\`　\`${g.window || ''}\`\n  - 角色：${g.char || '?'}（全书${fr(g)}beat${g.def && g.def !== '无' ? `·${g.def}` : ''}）\n  - ${g.why || ''}${g.matchedBeat ? `（现beat：${g.matchedBeat}）` : ''}\n  - 判级：${g.note || ''}\n  - 补写：${g.suggestion || ''}`;
  const md = [
    `# ${BOOKS[book]} 高光/机趣分级短名单（源:${sourceModel} 审计 → 分级）`,
    ``,
    `分级统计：${stats}。短名单共 ${shortlist.length} 条，按**综合优先级**排序（tier基础分 × 角色稀缺乘子 + 定义性beat加成）。配角的定义性高光会压过主角的顶格高光。`,
    ``,
    ...shortlist.map(line), ``,
  ].join('\n');
  writeFileSync(join(gen, book, `highlight-shortlist.${sourceModel}.md`), md);
  writeFileSync(join(gen, book, `highlight-graded.${sourceModel}.json`), JSON.stringify(graded, null, 1));
  console.log(`  ${stats} → 短名单 ${shortlist.length} 条 | highlight-shortlist.${sourceModel}.md`);
}

async function main() {
  if (!KEY) throw new Error('OPENROUTER_API_KEY 缺失');
  const books = onlyBook ? [onlyBook] : Object.keys(BOOKS);
  for (const b of books) await triageBook(b);
}
main().catch(e => { console.error(e); process.exit(1); });
