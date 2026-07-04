#!/usr/bin/env node
// 地点风貌·按篇扫描（用户指正：作者大章按地点分篇——宋国篇/唐国篇/太泉古阵篇，
// 整篇即该地点弧的天然语料，比地名关键词开窗准得多）。
// 每篇均匀采样章节 → MiniMax(兜底 DeepSeek) 抽「本篇出现的 atlas 地点」逐个 {region,风貌,民俗,confidence}。
// 产物覆盖写 shared-atlas/location-fengmao/{地点}.json（与 apply-location-fengmao.mjs 同格式，arc 版置信优先）。
// 用法：node scripts/scan-location-fengmao-by-arc.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const outDir = join(gen, 'shared-atlas/location-fengmao');
const material = '/Volumes/botsvault/06_material';
const BOOKS = { qingyu: 'A-六朝清羽记.epub', yunlong: 'B- 六朝云龙吟.epub', yange: 'C-六朝燕歌行.epub' };

const envText = existsSync(join(root, '.env')) ? readFileSync(join(root, '.env'), 'utf8') : '';
const OR_KEY = Object.fromEntries(envText.split(/\r?\n/).flatMap(l => { const m = l.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*)\s*$/); if (!m) return []; let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); return [[m[1], v]]; })).OPENROUTER_API_KEY;

function loadBook(id) {
  const tmp = mkdtempSync(join(tmpdir(), `xt-arc-${id}-`));
  execFileSync('unzip', ['-o', '-q', join(material, BOOKS[id]), '-d', tmp]);
  const ncx = execFileSync('find', [tmp, '-name', '*.ncx']).toString().trim().split('\n')[0];
  const xml = readFileSync(ncx, 'utf8');
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(tmp, p)).find(existsSync);
  const points = [...xml.matchAll(/<navPoint[^>]*>\s*<navLabel>\s*<text>([^<]*)<\/text>\s*<\/navLabel>\s*<content src="([^"]+)"/g)].map(m => ({ t: m[1].trim(), src: m[2].split('#')[0].split('/').pop() }));
  const arcs = []; let cur = null;
  for (const p of points) {
    if (/篇$/.test(p.t)) { cur = { arc: p.t, files: [] }; arcs.push(cur); }
    else if (cur && /章/.test(p.t) && !cur.files.includes(p.src)) cur.files.push(p.src);
  }
  const read = f => { try { return readFileSync(join(base, f), 'utf8').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim(); } catch { return ''; } };
  return arcs.map(a => ({ ...a, read }));
}

// 均匀采样：n 章里取 k 个点，每点截 slice 字
function sampleArc(arc, k = 12, slice = 1000) {
  const files = arc.files; if (!files.length) return '';
  const idxs = [...new Set(Array.from({ length: k }, (_, i) => Math.floor(i * (files.length - 1) / Math.max(1, k - 1))))];
  return idxs.map(i => `【${arc.arc}·第${i + 1}/${files.length}章附近】${arc.read(files[i]).slice(200, 200 + slice)}`).filter(s => s.length > 40).join('\n\n');
}

const atlas = JSON.parse(readFileSync(join(gen, 'shared-atlas/liuchao.shared-atlas.v1.json'), 'utf8')).atlas;
const LOC_NAMES = atlas.locations.filter(l => l.coordinates).map(l => l.name);
const SYS = '你是小说地理设定考据员。只依据本篇片段判断，不脑补。严格输出 JSON。';
const userPrompt = (arc, ev) => `以下片段全部来自《${arc}》这一篇（作者按地点分篇，本篇即一个地域弧）。
候选地点表（只从中挑本篇实际出现/所在的）：${LOC_NAMES.join('、')}
对本篇涉及的每个候选地点输出：
- region：所属国家/文化圈（唐国/汉国/宋国/秦国/晋国/昭南/南荒/太泉/海上/跨国）
- fengmao：一句 ≤60 字风貌（建筑/植被/市井，供游戏环境描写）
- customs：民俗/特产一句 ≤40 字（无则空）
输出 JSON：{"arc":"${arc}","locations":[{"name","region","fengmao","customs","confidence":"高|中|低"}]}
只写原文支持的；本篇没实际出现的地点不要列。

片段：
${ev}`;

function askMiniMax(user) {
  const mf = join(outDir, '_arc.messages.json');
  writeFileSync(mf, JSON.stringify([{ role: 'system', content: SYS }, { role: 'user', content: user }]));
  const out = execFileSync('mmx', ['text', 'chat', '--messages-file', mf, '--model', 'MiniMax-M2.7', '--temperature', '0.1', '--max-tokens', '3072', '--non-interactive', '--quiet', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  try { const o = JSON.parse(out); return o?.choices?.[0]?.message?.content || o?.output || out; } catch { return out; }
}
async function askDeepSeek(user) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${OR_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'deepseek/deepseek-v4-flash', temperature: 0.1, max_tokens: 3072, messages: [{ role: 'system', content: SYS }, { role: 'user', content: user }] }) });
  if (!r.ok) throw new Error(`OR ${r.status}`);
  return JSON.parse(await r.text()).choices?.[0]?.message?.content || '';
}
const parse = t => { try { const j = String(t).match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || String(t).slice(String(t).indexOf('{'), String(t).lastIndexOf('}') + 1); return JSON.parse(j); } catch { return { parse_failed: true, raw: String(t).slice(0, 600) }; } };

async function run() {
  mkdirSync(outDir, { recursive: true });
  const collected = new Map(); // name -> result（后写覆盖：弧序即时间序，取更晚/更高置信）
  for (const [book] of Object.entries(BOOKS)) {
    const arcs = loadBook(book);
    for (const arc of arcs) {
      const ev = sampleArc(arc);
      console.error(`[${book}] ${arc.arc}（${arc.files.length}章，采样 ${ev.length} 字）`);
      const user = userPrompt(arc.arc, ev);
      let r; try { r = parse(askMiniMax(user)); } catch (e) { r = { parse_failed: true, error: String(e.message).slice(0, 100) }; }
      if (r.parse_failed || !Array.isArray(r.locations)) { try { r = parse(askMiniMax(user)); } catch { /* keep */ } }
      if ((r.parse_failed || !Array.isArray(r.locations)) && OR_KEY) { try { r = parse(await askDeepSeek(user)); if (Array.isArray(r.locations)) r._fallback = 'deepseek'; } catch { /* keep */ } }
      if (!Array.isArray(r.locations)) { console.error(`  ⚠ ${arc.arc} 失败`); continue; }
      writeFileSync(join(outDir, `arc-${book}-${arc.arc}.json`), JSON.stringify(r, null, 2) + '\n');
      for (const loc of r.locations) {
        if (!loc?.name || !LOC_NAMES.includes(loc.name)) continue;
        const prev = collected.get(loc.name);
        const rank = c => c === '高' ? 3 : c === '中' ? 2 : 1;
        if (!prev || rank(loc.confidence) >= rank(prev.confidence)) collected.set(loc.name, { ...loc, _arc: arc.arc });
      }
      console.error(`  → ${r.locations.map(l => l.name).join('、')}`);
    }
  }
  // 覆盖写单地点结果（arc 版为准）
  let wrote = 0;
  for (const [name, loc] of collected) {
    writeFileSync(join(outDir, `${name}.json`), JSON.stringify({ name, id: atlas.locations.find(l => l.name === name)?.id, region: loc.region, fengmao: loc.fengmao, customs: loc.customs || '', confidence: loc.confidence || '中', _source: `arc:${loc._arc}` }, null, 2) + '\n');
    wrote++;
  }
  console.error(`完成：arc 版覆盖 ${wrote} 个地点结果（未覆盖者保留关键词版）`);
}
run().catch(e => { console.error(e); process.exit(1); });
