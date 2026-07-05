#!/usr/bin/env node
// 章节 BOSS 能力深扫（防瞎编）：对各篇章战力反派，逐项考据 能力/外貌/声口/手段/交锋/结局，
// 每项必须带原文短证；现有卡上能力逐项验真伪。
// 防误杀（鬼羽剑教训）：①窗口全书均匀采样（不偏前期章节）②模型判"未见"的能力名，
// 再做全文字符串复核——原文有词的不删、标"待人工"。
// M2.7 → 重试 → DeepSeek 兜底；断点续跑。产物 character-canon/boss-ability-scan/{名}.json + REPORT.md
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const outDir = join(gen, 'character-canon/boss-ability-scan');
const material = '/Volumes/botsvault/06_material';
const BOOKS = { qingyu: 'A-六朝清羽记.epub', yunlong: 'B- 六朝云龙吟.epub', yange: 'C-六朝燕歌行.epub' };

const BOSSES = ['剑玉姬', '西门庆', '焚无尘', '古格尔', '阿伽门侬', '吕冀', '仇士良', '李辅国', '释特昧普', '米远志', '八臂魔僧', '徐敖', '鱼弘志', '窥基'];

const registry = JSON.parse(readFileSync(join(root, 'src/modules/scenarioMods/builtins/character-registry.json'), 'utf8'));
const entryOf = new Map(registry.characters.map(c => [c.canonicalName, c]));

const envText = existsSync(join(root, '.env')) ? readFileSync(join(root, '.env'), 'utf8') : '';
const OR_KEY = Object.fromEntries(envText.split(/\r?\n/).flatMap(l => { const m = l.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*)\s*$/); if (!m) return []; let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); return [[m[1], v]]; })).OPENROUTER_API_KEY;

const cache = {};
function chapters(id) {
  if (cache[id]) return cache[id];
  const tmp = mkdtempSync(join(tmpdir(), `xt-boss-${id}-`));
  execFileSync('unzip', ['-o', '-q', join(material, BOOKS[id]), '-d', tmp]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(tmp, p)).find(existsSync);
  return cache[id] = readdirSync(base).filter(f => /\.x?html?$/i.test(f)).sort().map(f => readFileSync(join(base, f), 'utf8').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim());
}
// 全书均匀采样：先收集全部命中窗口，再等距抽取填满预算（防前期偏置漏高潮章）
function windows(kws, span = 320, maxPer = 6, budget = 14000) {
  const all = []; const seen = new Set();
  for (const b of Object.keys(BOOKS)) for (const t of chapters(b)) {
    for (const kw of kws) { let pos = 0, n = 0;
      while (n < maxPer) { const i = t.indexOf(kw, pos); if (i < 0) break; const key = `${b}:${Math.floor(i / 600)}`;
        if (!seen.has(key)) { seen.add(key); all.push(t.slice(Math.max(0, i - span), i + kw.length + span)); n++; } pos = i + kw.length; }
    }
  }
  if (!all.length) return '';
  const avg = span * 2 + 30;
  const want = Math.max(1, Math.floor(budget / avg));
  const step = Math.max(1, all.length / want);
  const sel = []; let used = 0;
  for (let i = 0; i < all.length && used < budget; i += step) {
    const w = all[Math.floor(i)]; sel.push(w); used += w.length;
  }
  return sel.join('\n\n');
}
function fullText() {
  if (cache.__full) return cache.__full;
  let s = '';
  for (const b of Object.keys(BOOKS)) s += chapters(b).join('');
  return cache.__full = s;
}
const SYS = '你是小说人物考据员。只依据片段判断，每一项必须给≤40字原文短证；片段没有的写"原文未见"。严格输出 JSON。';
const userPrompt = (name, identity, existing, ev) => `人物「${name}」（${identity}）。逐项考据：
- verifyExisting: 现有卡上的能力逐项验真：${JSON.stringify(existing)}——每项 {名, 判:"证实|未见", 证}
- abilities: 原文实际展现的能力/武器/招法（数组，每项{名,证}；含名称的招式尽量给原名）
- appearance: {述,证}
- speech: {述,证}（尽量引原话）
- clash: 与主角一方交锋的关键节点（数组，每项{节,证}，按剧情顺序）
- ending: {述,证}（下场/生死；书籍简介的内容也算证）
输出 JSON：{"verifyExisting":[],"abilities":[],"appearance":{},"speech":{},"clash":[],"ending":{}}

片段：
${ev || '（未命中）'}`;

function askMiniMax(user) {
  const mf = join(outDir, '_boss.messages.json');
  writeFileSync(mf, JSON.stringify([{ role: 'system', content: SYS }, { role: 'user', content: user }]));
  const out = execFileSync('mmx', ['text', 'chat', '--messages-file', mf, '--model', 'MiniMax-M2.7', '--temperature', '0.1', '--max-tokens', '2800', '--non-interactive', '--quiet', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  try { const o = JSON.parse(out); return o?.choices?.[0]?.message?.content || o?.output || out; } catch { return out; }
}
async function askDeepSeek(user) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${OR_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'deepseek/deepseek-v4-flash', temperature: 0.1, max_tokens: 2800, messages: [{ role: 'system', content: SYS }, { role: 'user', content: user }] }) });
  if (!r.ok) throw new Error(`OR ${r.status}`);
  return JSON.parse(await r.text()).choices?.[0]?.message?.content || '';
}
const parse = t => { try { const j = String(t).match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || String(t).slice(String(t).indexOf('{'), String(t).lastIndexOf('}') + 1); return JSON.parse(j); } catch { return null; } };

async function run() {
  mkdirSync(outDir, { recursive: true });
  const summary = [];
  for (const name of BOSSES) {
    const dst = join(outDir, `${name}.json`);
    if (existsSync(dst)) { summary.push(JSON.parse(readFileSync(dst, 'utf8'))); continue; }
    const entry = entryOf.get(name);
    const kws = [name, ...((entry?.aliases) || [])].filter(a => a && a.length >= 2 && !/[（(]/.test(a)).slice(0, 4);
    const identity = String(entry?.staticProfile?.identitySummary || '').slice(0, 60);
    const existing = (entry?.staticProfile?.signatureAbilities || []).map(s => String(s).slice(0, 30));
    const ev = windows(kws);
    const user = userPrompt(name, identity, existing, ev);
    let r = parse(askMiniMax(user));
    if (!r || !Array.isArray(r.abilities)) r = parse(askMiniMax(user));
    if ((!r || !Array.isArray(r.abilities)) && OR_KEY) { try { r = parse(await askDeepSeek(user)); if (r) r._fallback = 'deepseek'; } catch { /* keep */ } }
    if (!r) { console.error(`⚠ ${name} 失败`); continue; }
    // 防误杀二次核验：模型判"未见"的现有能力名，全文字符串复核
    const full = fullText();
    for (const v of r.verifyExisting || []) {
      if (v?.判 === '未见' && v?.名) {
        const kw = String(v.名).replace(/[（(].*$/, '').slice(0, 6);
        const hits = kw.length >= 2 ? full.split(kw).length - 1 : 0;
        v.复核 = hits > 0 ? `⚠原文含"${kw}"×${hits}，待人工` : '全文无词，可删';
      }
    }
    r.name = name;
    writeFileSync(dst, JSON.stringify(r, null, 2) + '\n');
    summary.push(r);
    console.error(`${name}: 能力${(r.abilities || []).length} 验旧${(r.verifyExisting || []).length} 结局:${(r.ending?.述 || '?').slice(0, 20)}`);
  }
  // 汇总报告
  const md = ['# 章节 BOSS 能力深扫（逐项带证 · 供落卡）', ''];
  for (const r of summary) {
    md.push(`## ${r.name}`);
    if ((r.verifyExisting || []).length) {
      md.push('**旧卡能力验真：**');
      for (const v of r.verifyExisting) md.push(`- ${v.名}: ${v.判}${v.复核 ? `（${v.复核}）` : ''} ${v.证 && v.判 === '证实' ? `｜${String(v.证).slice(0, 40)}` : ''}`);
    }
    md.push('**原文能力：**');
    for (const a of r.abilities || []) md.push(`- ${a.名}｜${String(a.证 || '').slice(0, 50)}`);
    if (r.ending?.述) md.push(`**结局：** ${r.ending.述}｜${String(r.ending.证 || '').slice(0, 50)}`);
    md.push('');
  }
  writeFileSync(join(outDir, 'REPORT.md'), md.join('\n'));
  console.error(`完成 ${summary.length}/${BOSSES.length} → ${outDir}/REPORT.md`);
}
run().catch(e => { console.error(e); process.exit(1); });
