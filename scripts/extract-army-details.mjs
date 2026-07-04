#!/usr/bin/env node
// 各国军队抽档：禁军/羽林军/凉州军/北府军/左武军/秦军军团… 逐个抽 {所属国,统属,性质规模,主将,特色,region}。
// 军队 faction 大量「简介待补」，且散落各国——按番号在三本原文开窗，模型判所属与特色。
// M2.7 → 重试 → DeepSeek 三级兜底。产物 character-canon/army-details/{军}.json + REPORT.md
// 用法：node scripts/extract-army-details.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const outDir = join(gen, 'character-canon/army-details');
const material = '/Volumes/botsvault/06_material';
const BOOKS = { qingyu: 'A-六朝清羽记.epub', yunlong: 'B- 六朝云龙吟.epub', yange: 'C-六朝燕歌行.epub' };

// 从现有 factions 收集军队番号（名≠简介待补的保留其现有描述，仅补 region/元数据）
function collectArmies() {
  const names = new Map(); // name -> existingDesc
  for (const b of ['qingyu', 'yunlong', 'yange']) {
    const dir = join(gen, b, 'stages');
    for (const f of readdirSync(dir).filter(x => x.endsWith('.json') && !x.endsWith('.uncertainties.json'))) {
      const m = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      for (const fa of m.canon.factions || []) {
        if (/(军团|禁军|北府军|羽林|凉州军|左武军|右武军|捧日|龙卫|胡骑|卫尉|虎贲|期门|城门校尉)/.test(fa.name) || /军$/.test(fa.name)) {
          const cur = names.get(fa.name);
          const d = String(fa.description || '');
          if (!cur || (/简介待补/.test(cur) && !/简介待补/.test(d))) names.set(fa.name, d);
        }
      }
    }
  }
  return names;
}

const envText = existsSync(join(root, '.env')) ? readFileSync(join(root, '.env'), 'utf8') : '';
const OR_KEY = Object.fromEntries(envText.split(/\r?\n/).flatMap(l => { const m = l.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*)\s*$/); if (!m) return []; let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); return [[m[1], v]]; })).OPENROUTER_API_KEY;

const cache = {};
function chapters(id) {
  if (cache[id]) return cache[id];
  const tmp = mkdtempSync(join(tmpdir(), `xt-army-${id}-`));
  execFileSync('unzip', ['-o', '-q', join(material, BOOKS[id]), '-d', tmp]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(tmp, p)).find(existsSync);
  return cache[id] = readdirSync(base).filter(f => /\.x?html?$/i.test(f)).sort().map(f => readFileSync(join(base, f), 'utf8').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim());
}
function windows(name, span = 300, maxPer = 4, budget = 12000) {
  const out = []; const seen = new Set();
  for (const b of Object.keys(BOOKS)) for (const t of chapters(b)) {
    let pos = 0, n = 0;
    while (n < maxPer) { const i = t.indexOf(name, pos); if (i < 0) break; const key = `${b}:${i}`;
      if (!seen.has(key)) { seen.add(key); out.push(`【${b}】${t.slice(Math.max(0, i - span), i + name.length + span)}`); } pos = i + name.length; n++; }
  }
  let used = 0; const sel = [];
  for (const w of out) { if (used + w.length > budget) break; sel.push(w); used += w.length; }
  return sel.join('\n\n');
}
const SYS = '你是小说军事设定考据员。只依据片段判断，不脑补。严格输出 JSON。';
const userPrompt = (name, ev) => `军队番号「${name}」。依据原文片段整理：
- polity：所属国/势力（唐国/汉国/宋国/秦国/晋国/昭南/南荒/太泉/域外/未明）
- affiliation：统属（隶属某君主/朝廷/权臣/宗门，一句≤30字）
- profile：性质与规模（禁军/边军/私军/联军；兵力/兵种特色，≤60字）
- commanders：主将/统帅（原文明确的，数组）
- traits：战力/装备/战绩特色一句（≤50字）
- region：地理归属（同 polity 国名，或"跨国/域外"）
输出 JSON：{"army":"${name}","polity","affiliation","profile","commanders":[],"traits","region","confidence":"高|中|低"}
只写原文明确支持的；番号未在片段出现则 confidence=低、字段留空。

片段：
${ev || '（未命中）'}`;

function askMiniMax(user) {
  const mf = join(outDir, '_army.messages.json');
  writeFileSync(mf, JSON.stringify([{ role: 'system', content: SYS }, { role: 'user', content: user }]));
  const out = execFileSync('mmx', ['text', 'chat', '--messages-file', mf, '--model', 'MiniMax-M2.7', '--temperature', '0.1', '--max-tokens', '2048', '--non-interactive', '--quiet', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  try { const o = JSON.parse(out); return o?.choices?.[0]?.message?.content || o?.output || out; } catch { return out; }
}
async function askDeepSeek(user) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${OR_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'deepseek/deepseek-v4-flash', temperature: 0.1, max_tokens: 2048, messages: [{ role: 'system', content: SYS }, { role: 'user', content: user }] }) });
  if (!r.ok) throw new Error(`OR ${r.status}`);
  return JSON.parse(await r.text()).choices?.[0]?.message?.content || '';
}
const parse = t => { try { const j = String(t).match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || String(t).slice(String(t).indexOf('{'), String(t).lastIndexOf('}') + 1); return JSON.parse(j); } catch { return { parse_failed: true, raw: String(t).slice(0, 600) }; } };
const bad = r => r.parse_failed || !r.polity;

async function run() {
  mkdirSync(outDir, { recursive: true });
  const armies = collectArmies();
  console.error(`军队番号 ${armies.size} 个: ${[...armies.keys()].join('、')}`);
  const results = [];
  for (const [name, existingDesc] of armies) {
    const ev = windows(name);
    console.error(`${name}: 证据 ${ev.length} 字`);
    const user = userPrompt(name, ev);
    let r; try { r = parse(askMiniMax(user)); } catch (e) { r = { parse_failed: true, error: String(e.message).slice(0, 100) }; }
    if (bad(r)) { try { const r2 = parse(askMiniMax(user)); if (!bad(r2)) r = r2; } catch { /* keep */ } }
    if (bad(r) && OR_KEY) { try { const r3 = parse(await askDeepSeek(user)); if (!bad(r3)) r = { ...r3, _fallback: 'deepseek' }; } catch { /* keep */ } }
    r.army = name; r._hadDesc = !/简介待补/.test(existingDesc) && existingDesc.length > 0;
    writeFileSync(join(outDir, `${name}.json`), JSON.stringify(r, null, 2) + '\n');
    results.push(r);
    console.error(`  → ${r.polity || '?'} / ${r.confidence || '?'}`);
  }
  const md = ['# 各国军队抽档（供人工核 → 落 faction 描述+region）', ''];
  md.push('| 番号 | 所属 | 统属 | 主将 | 特色 | 置信 | 备注 |', '|---|---|---|---|---|---|---|');
  for (const r of results) md.push(`| ${r.army} | ${r.polity || '?'} | ${r.affiliation || ''} | ${(r.commanders || []).join('、')} | ${r.traits || ''} | ${r.confidence || '?'}${r._fallback ? '(DS)' : ''} | ${r._hadDesc ? '已有描述' : ''} |`);
  writeFileSync(join(outDir, 'REPORT.md'), md.join('\n'));
  console.error(`完成 → ${outDir}/REPORT.md`);
}
run().catch(e => { console.error(e); process.exit(1); });
