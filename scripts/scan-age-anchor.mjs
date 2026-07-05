#!/usr/bin/env node
// 年龄批量锚定扫描：对无 birthYear 的主要角色，从三本原文推定故事当下年龄（主角约20岁/纪元220年时）。
// 只产审核表（REPORT.md）供用户批，不落卡。M2.7 → 重试 → DeepSeek 三级兜底；断点续跑。
// 已知坑：中文数字年龄（十四五→14）；不要把出生年/位阶数字当年龄；AI 曾把年龄写成负出生年。
// 用法：node scripts/scan-age-anchor.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const outDir = join(gen, 'character-canon/age-anchor-audit');
const material = '/Volumes/botsvault/06_material';
const BOOKS = { qingyu: 'A-六朝清羽记.epub', yunlong: 'B- 六朝云龙吟.epub', yange: 'C-六朝燕歌行.epub' };

const TODO = JSON.parse(readFileSync('/private/tmp/claude-501/-Users-clawbot-Projects-XianTu/e5b7759a-5aba-452a-83f2-564d6226f7f5/scratchpad/age-scan.json', 'utf8'));
const registry = JSON.parse(readFileSync(join(root, 'src/modules/scenarioMods/builtins/character-registry.json'), 'utf8'));
const entryOf = new Map(registry.characters.map(c => [c.canonicalName, c]));

const envText = existsSync(join(root, '.env')) ? readFileSync(join(root, '.env'), 'utf8') : '';
const OR_KEY = Object.fromEntries(envText.split(/\r?\n/).flatMap(l => { const m = l.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*)\s*$/); if (!m) return []; let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); return [[m[1], v]]; })).OPENROUTER_API_KEY;

const cache = {};
function chapters(id) {
  if (cache[id]) return cache[id];
  const tmp = mkdtempSync(join(tmpdir(), `xt-age-${id}-`));
  execFileSync('unzip', ['-o', '-q', join(material, BOOKS[id]), '-d', tmp]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(tmp, p)).find(existsSync);
  return cache[id] = readdirSync(base).filter(f => /\.x?html?$/i.test(f)).sort().map(f => readFileSync(join(base, f), 'utf8').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim());
}
// 年龄线索通常在外貌描写附近：名字窗口 + 优先含 岁/年纪/老/少/青年/妇/童 的窗口
const AGE_HINT = /岁|年纪|年幼|年少|少年|少女|青年|中年|老者|老人|老妇|妇人|孩童|稚|苍老|白发|花甲|古稀|弱冠|及笄|豆蔻/;
function windows(kws, span = 320, maxPer = 6, budget = 11000) {
  const hinted = []; const plain = []; const seen = new Set();
  for (const b of Object.keys(BOOKS)) for (const t of chapters(b)) {
    for (const kw of kws) { let pos = 0, n = 0;
      while (n < maxPer) { const i = t.indexOf(kw, pos); if (i < 0) break; const key = `${b}:${Math.floor(i / 500)}`;
        if (!seen.has(key)) { seen.add(key); const w = t.slice(Math.max(0, i - span), i + kw.length + span);
          (AGE_HINT.test(w) ? hinted : plain).push(w); n++; } pos = i + kw.length; }
    }
  }
  let used = 0; const sel = [];
  for (const w of [...hinted, ...plain]) { if (used + w.length > budget) break; sel.push(w); used += w.length; }
  return sel.join('\n\n');
}
const SYS = '你是小说人物年龄考据员。只依据片段推断，不脑补。严格输出 JSON。';
const userPrompt = (name, identity, ev) => `人物「${name}」（${identity}）。推定其在**故事当下**（主角程宗扬约20岁时）的年龄。
注意：
- 中文数字要换算（十四五→14、三十出头→31、年过五旬→52）
- 不要把出生年、位阶、境界数字当年龄；不要给负数
- 无明确数字时用描写推断（少女≈16-18、青年≈20-28、中年≈35-45、老者≈60+、须发皆白≈65+），置信标低
- 修士驻颜：以**实际年龄**为准（原文若提"看似二十实则百岁"取百岁）
输出 JSON：{"name":"${name}","age":整数,"basis":"一句原文依据≤40字","confidence":"高|中|低"}
片段不足以判断时 age 填 null、confidence 填低。

片段：
${ev || '（未命中）'}`;

function askMiniMax(user) {
  const mf = join(outDir, '_age.messages.json');
  writeFileSync(mf, JSON.stringify([{ role: 'system', content: SYS }, { role: 'user', content: user }]));
  const out = execFileSync('mmx', ['text', 'chat', '--messages-file', mf, '--model', 'MiniMax-M2.7', '--temperature', '0.1', '--max-tokens', '600', '--non-interactive', '--quiet', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  try { const o = JSON.parse(out); return o?.choices?.[0]?.message?.content || o?.output || out; } catch { return out; }
}
async function askDeepSeek(user) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${OR_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'deepseek/deepseek-v4-flash', temperature: 0.1, max_tokens: 600, messages: [{ role: 'system', content: SYS }, { role: 'user', content: user }] }) });
  if (!r.ok) throw new Error(`OR ${r.status}`);
  return JSON.parse(await r.text()).choices?.[0]?.message?.content || '';
}
const parse = t => { try { const j = String(t).match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || String(t).slice(String(t).indexOf('{'), String(t).lastIndexOf('}') + 1); return JSON.parse(j); } catch { return { parse_failed: true }; } };
const bad = r => r.parse_failed || (r.age !== null && (!Number.isFinite(r.age) || r.age <= 0 || r.age > 3000));

async function run() {
  mkdirSync(outDir, { recursive: true });
  const results = [];
  let i = 0;
  for (const name of TODO) {
    i++;
    const dst = join(outDir, `${name.replace(/[\/\\]/g, '_')}.json`);
    if (existsSync(dst)) { results.push(JSON.parse(readFileSync(dst, 'utf8'))); continue; }
    const entry = entryOf.get(name);
    const kws = [name, ...((entry?.aliases) || [])].filter(a => a && a.length >= 2 && !/[（(]/.test(a)).slice(0, 5);
    const identity = String(entry?.staticProfile?.identitySummary || '').slice(0, 50);
    const ev = windows(kws);
    const user = userPrompt(name, identity, ev);
    let r; try { r = parse(askMiniMax(user)); } catch { r = { parse_failed: true }; }
    if (bad(r)) { try { const r2 = parse(askMiniMax(user)); if (!bad(r2)) r = r2; } catch { /* keep */ } }
    if (bad(r) && OR_KEY) { try { const r3 = parse(await askDeepSeek(user)); if (!bad(r3)) r = { ...r3, _fallback: 'deepseek' }; } catch { /* keep */ } }
    if (bad(r)) r = { name, age: null, basis: '', confidence: '低', parse_failed: true };
    r.name = name;
    writeFileSync(dst, JSON.stringify(r, null, 2) + '\n');
    results.push(r);
    console.error(`[${i}/${TODO.length}] ${name}: ${r.age ?? '?'}岁/${r.confidence || '?'}`);
  }
  // 审核表
  const ok = results.filter(r => Number.isFinite(r.age) && (r.confidence === '高' || r.confidence === '中'));
  const low = results.filter(r => !ok.includes(r));
  const md = ['# 年龄批量锚定·审核表（供人工批，未落卡）', '',
    `> 纪元基点200，故事当下≈220年；出生年 = 220 − 年龄。共扫 ${results.length}，可信 ${ok.length}，低置信/失败 ${low.length}。`,
    '> 批法：整行默认通过；有异议的写「名字 年龄」即可（如 潘金莲 22）。', '',
    '## 高/中置信（默认通过项）', '', '| 角色 | 推定年龄 | 出生年 | 依据 | 置信 |', '|---|---|---|---|---|'];
  for (const r of ok.sort((a, b) => (a.confidence === b.confidence ? 0 : a.confidence === '高' ? -1 : 1))) {
    md.push(`| ${r.name} | ${r.age} | ${220 - r.age} | ${String(r.basis || '').slice(0, 50)} | ${r.confidence}${r._fallback ? '(DS)' : ''} |`);
  }
  md.push('', '## 低置信/未推出（需人工定或留空）', '');
  for (const r of low) md.push(`- ${r.name}（${r.age ?? '?'}岁/${r.confidence}${r.parse_failed ? '·失败' : ''}）${r.basis || ''}`);
  writeFileSync(join(outDir, 'REPORT.md'), md.join('\n'));
  console.error(`完成：可信 ${ok.length}/${results.length} → ${outDir}/REPORT.md`);
}
run().catch(e => { console.error(e); process.exit(1); });
