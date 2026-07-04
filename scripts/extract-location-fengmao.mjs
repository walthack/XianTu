#!/usr/bin/env node
// 地点风貌富化 + region 字段（一次扫描两用：环境描写治本 + 地点→角色漫游召回的地理锚点）。
// 对 atlas 41 地点逐个扫原文：{region(国别/文化圈), 风貌(建筑/植被/市井一句), 民俗}。
// 断点续（已有 result 跳过）；M2.7→重试→DeepSeek 三级兜底。产物 shared-atlas/location-fengmao/*.json + REPORT.md
// 用法：node scripts/extract-location-fengmao.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const outDir = join(gen, 'shared-atlas/location-fengmao');
const material = '/Volumes/botsvault/06_material';
const BOOKS = { qingyu: 'A-六朝清羽记.epub', yunlong: 'B- 六朝云龙吟.epub', yange: 'C-六朝燕歌行.epub' };
const REGIONS = '唐国、汉国、宋国、秦国、晋国、昭南、南荒、海上/海外、跨国、未知';

const envText = existsSync(join(root, '.env')) ? readFileSync(join(root, '.env'), 'utf8') : '';
const OR_KEY = Object.fromEntries(envText.split(/\r?\n/).flatMap(l => { const m = l.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*)\s*$/); if (!m) return []; let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); return [[m[1], v]]; })).OPENROUTER_API_KEY;

const cache = {};
function chapters(id) {
  if (cache[id]) return cache[id];
  const tmp = mkdtempSync(join(tmpdir(), `xt-lf-${id}-`));
  execFileSync('unzip', ['-o', '-q', join(material, BOOKS[id]), '-d', tmp]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(tmp, p)).find(existsSync);
  return cache[id] = readdirSync(base).filter(f => /\.x?html?$/i.test(f)).sort().map(f => readFileSync(join(base, f), 'utf8').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim());
}
function windows(kws, span = 380, maxPer = 5, budget = 10000) {
  const perBook = Math.floor(budget / 3);
  const sel = [];
  for (const b of Object.keys(BOOKS)) {
    const out = []; const seen = new Set();
    for (const kw of kws) for (const t of chapters(b)) {
      let pos = 0, n = 0;
      while (n < maxPer) { const i = t.indexOf(kw, pos); if (i < 0) break; const key = `${b}:${i}:${kw}`;
        if (!seen.has(key)) { seen.add(key); out.push(t.slice(Math.max(0, i - span), i + kw.length + span)); } pos = i + kw.length; n++; }
    }
    let used = 0; for (const w of out) { if (used + w.length > perBook) break; sel.push(w); used += w.length; }
  }
  return sel.join('\n---\n');
}
const SYS = '你是小说地理设定考据员。只依据片段判断，不脑补。严格输出 JSON。';
const userPrompt = (name, aliases, ev) => `地点「${name}」${aliases.length ? `（别名：${aliases.join('、')}）` : ''}。依据原文片段判断：
1) region：该地点属于哪个国家/文化圈（从「${REGIONS}」中选一个）。
2) fengmao：一句话（≤60字）概括该地风貌——建筑样式/植被气候/市井景象，供游戏环境描写。
3) customs：当地民俗/特产/氛围一句话（≤40字，无则空）。
输出 JSON：{"name","region","fengmao","customs","confidence":"高|中|低"}

片段：
${ev || '（未命中，按地名与国别常识推断，confidence 填低）'}`;

function askMiniMax(name, aliases, ev) {
  const msgs = [{ role: 'system', content: SYS }, { role: 'user', content: userPrompt(name, aliases, ev) }];
  const mf = join(outDir, `${name}.messages.json`);
  writeFileSync(mf, JSON.stringify(msgs));
  const out = execFileSync('mmx', ['text', 'chat', '--messages-file', mf, '--model', 'MiniMax-M2.7', '--temperature', '0.1', '--max-tokens', '1024', '--non-interactive', '--quiet', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  try { const o = JSON.parse(out); return o?.choices?.[0]?.message?.content || o?.output || out; } catch { return out; }
}
async function askDeepSeek(user) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${OR_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'deepseek/deepseek-v4-flash', temperature: 0.1, max_tokens: 1024, messages: [{ role: 'system', content: SYS }, { role: 'user', content: user }] }) });
  if (!r.ok) throw new Error(`OR ${r.status}`);
  return JSON.parse(await r.text()).choices?.[0]?.message?.content || '';
}
const parse = t => { try { const j = String(t).match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || String(t).slice(String(t).indexOf('{'), String(t).lastIndexOf('}') + 1); return JSON.parse(j); } catch { return { parse_failed: true, raw: String(t).slice(0, 800) }; } };
const bad = r => r.parse_failed || !r.region;

async function run() {
  mkdirSync(outDir, { recursive: true });
  const atlas = JSON.parse(readFileSync(join(gen, 'shared-atlas/liuchao.shared-atlas.v1.json'), 'utf8')).atlas;
  const locations = atlas.locations.filter(l => l.coordinates);
  console.error(`地点 ${locations.length} 个`);
  const results = [];
  for (let i = 0; i < locations.length; i++) {
    const loc = locations[i];
    const resPath = join(outDir, `${loc.name}.json`);
    if (existsSync(resPath)) { results.push(JSON.parse(readFileSync(resPath, 'utf8'))); continue; }
    const kws = [loc.name, ...(loc.aliases || [])].filter(k => k && k.length >= 2);
    const ev = windows(kws);
    console.error(`[${i + 1}/${locations.length}] ${loc.name}: 证据 ${ev.length} 字`);
    let r; try { r = parse(askMiniMax(loc.name, loc.aliases || [], ev)); } catch (e) { r = { parse_failed: true, error: String(e.message).slice(0, 120) }; }
    if (bad(r)) { try { r = parse(askMiniMax(loc.name, loc.aliases || [], ev)); if (!bad(r)) r._retry = 1; } catch { /* keep */ } }
    if (bad(r) && OR_KEY) { try { const out = await askDeepSeek(userPrompt(loc.name, loc.aliases || [], ev)); const r3 = parse(out); if (!bad(r3)) r = { ...r3, _fallback: 'deepseek' }; } catch { /* keep */ } }
    r.name = loc.name; r.id = loc.id;
    writeFileSync(resPath, JSON.stringify(r, null, 2) + '\n');
    results.push(r);
  }
  const md = ['# 地点风貌/国别 扫描（供落地 canon.locations.region + 描述富化）', ''];
  for (const r of results) md.push(`- **${r.name}**【${r.region || '?'}】${r.fengmao || ''}${r.customs ? `｜民俗：${r.customs}` : ''}${r.confidence ? `（置信:${r.confidence}）` : ''}${r.parse_failed ? ' ⚠失败' : ''}`);
  writeFileSync(join(outDir, 'REPORT.md'), md.join('\n'));
  console.error('完成 → ' + outDir);
}
run().catch(e => { console.error(e); process.exit(1); });
