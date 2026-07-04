#!/usr/bin/env node
// 人物底线(principles)扫描：对没有底线的角色，从三本原文推其「人格底线/道德红线」（他绝不会做的事、
// 坚守的原则）。主要角色优先。M2.7 → 重试 → DeepSeek 兜底。
// 产物 character-canon/bottomline-scan/{名}.json + combined.json。用法：node scripts/scan-bottomline.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const outDir = join(gen, 'character-canon/bottomline-scan');
const material = '/Volumes/botsvault/06_material';
const BOOKS = { qingyu: 'A-六朝清羽记.epub', yunlong: 'B- 六朝云龙吟.epub', yange: 'C-六朝燕歌行.epub' };

// 待扫名单（主要优先）；registry 取别名帮助命中
const TODO = JSON.parse(readFileSync('/private/tmp/claude-501/-Users-clawbot-Projects-XianTu/994f80a9-9c43-4d08-8f37-1f739eb4ec17/scratchpad/bottomline-todo.json', 'utf8'));
const registry = JSON.parse(readFileSync(join(root, 'src/modules/scenarioMods/builtins/character-registry.json'), 'utf8'));
const aliasOf = new Map(registry.characters.map(c => [c.canonicalName, [c.canonicalName, ...(c.aliases || [])].filter(a => a && a.length >= 2 && !/[（(]/.test(a))]));

const envText = existsSync(join(root, '.env')) ? readFileSync(join(root, '.env'), 'utf8') : '';
const OR_KEY = Object.fromEntries(envText.split(/\r?\n/).flatMap(l => { const m = l.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*)\s*$/); if (!m) return []; let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); return [[m[1], v]]; })).OPENROUTER_API_KEY;

const cache = {};
function chapters(id) {
  if (cache[id]) return cache[id];
  const tmp = mkdtempSync(join(tmpdir(), `xt-bl-${id}-`));
  execFileSync('unzip', ['-o', '-q', join(material, BOOKS[id]), '-d', tmp]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(tmp, p)).find(existsSync);
  return cache[id] = readdirSync(base).filter(f => /\.x?html?$/i.test(f)).sort().map(f => readFileSync(join(base, f), 'utf8').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim());
}
function windows(kws, span = 300, maxPer = 5, budget = 11000) {
  const out = []; const seen = new Set();
  for (const b of Object.keys(BOOKS)) for (const t of chapters(b)) {
    for (const kw of kws) { let pos = 0, n = 0;
      while (n < maxPer) { const i = t.indexOf(kw, pos); if (i < 0) break; const key = `${b}:${Math.floor(i / 500)}`;
        if (!seen.has(key)) { seen.add(key); out.push(t.slice(Math.max(0, i - span), i + kw.length + span)); n++; } pos = i + kw.length; }
    }
  }
  let used = 0; const sel = [];
  for (const w of out) { if (used + w.length > budget) break; sel.push(w); used += w.length; }
  return sel.join('\n\n');
}
const SYS = '你是小说人物性格考据员。只依据片段推断人物的道德底线/原则，不脑补，不复述露骨细节。严格输出 JSON。';
const userPrompt = (name, ev) => `人物「${name}」。据原文片段总结其「人物底线」——他/她坚守的原则、绝不会做的事、道德红线（1~3 条，每条≤25字，具体到这个人，不要泛泛而谈如"善良"）。
若片段不足以判断，principles 给空数组、confidence 填低。
输出 JSON：{"name":"${name}","principles":["..."],"confidence":"高|中|低"}

片段：
${ev || '（未命中）'}`;

function askMiniMax(user) {
  const mf = join(outDir, '_bl.messages.json');
  writeFileSync(mf, JSON.stringify([{ role: 'system', content: SYS }, { role: 'user', content: user }]));
  const out = execFileSync('mmx', ['text', 'chat', '--messages-file', mf, '--model', 'MiniMax-M2.7', '--temperature', '0.15', '--max-tokens', '900', '--non-interactive', '--quiet', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  try { const o = JSON.parse(out); return o?.choices?.[0]?.message?.content || o?.output || out; } catch { return out; }
}
async function askDeepSeek(user) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${OR_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'deepseek/deepseek-v4-flash', temperature: 0.15, max_tokens: 900, messages: [{ role: 'system', content: SYS }, { role: 'user', content: user }] }) });
  if (!r.ok) throw new Error(`OR ${r.status}`);
  return JSON.parse(await r.text()).choices?.[0]?.message?.content || '';
}
const parse = t => { try { const j = String(t).match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || String(t).slice(String(t).indexOf('{'), String(t).lastIndexOf('}') + 1); return JSON.parse(j); } catch { return { parse_failed: true }; } };
const bad = r => r.parse_failed || !Array.isArray(r.principles);

async function run() {
  mkdirSync(outDir, { recursive: true });
  const combined = {};
  let i = 0;
  for (const name of TODO) {
    i++;
    const dst = join(outDir, `${name.replace(/[\/\\]/g, '_')}.json`);
    if (existsSync(dst)) { combined[name] = JSON.parse(readFileSync(dst, 'utf8')); continue; } // 断点续跑
    const kws = aliasOf.get(name) || [name];
    const ev = windows(kws);
    const user = userPrompt(name, ev);
    let r; try { r = parse(askMiniMax(user)); } catch { r = { parse_failed: true }; }
    if (bad(r)) { try { const r2 = parse(askMiniMax(user)); if (!bad(r2)) r = r2; } catch { /* keep */ } }
    if (bad(r) && OR_KEY) { try { const r3 = parse(await askDeepSeek(user)); if (!bad(r3)) r = { ...r3, _fallback: 'deepseek' }; } catch { /* keep */ } }
    if (bad(r)) r = { name, principles: [], confidence: '低', parse_failed: true };
    r.name = name;
    writeFileSync(dst, JSON.stringify(r, null, 2) + '\n');
    combined[name] = r;
    console.error(`[${i}/${TODO.length}] ${name}: ${(r.principles || []).length}条/${r.confidence || '?'}`);
  }
  writeFileSync(join(outDir, 'combined.json'), JSON.stringify(combined, null, 2) + '\n');
  const hit = Object.values(combined).filter(r => (r.principles || []).length).length;
  console.error(`完成：${hit}/${TODO.length} 抽到底线 → ${outDir}`);
}
run().catch(e => { console.error(e); process.exit(1); });
