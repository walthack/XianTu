#!/usr/bin/env node
// 种族形态扫描：羽族/兽蛮人/鲛人/碧鲮 的具体外貌与形态描写（用户指出原文有明确描写）。
// M2.7 → 重试 → DeepSeek 三级兜底。产物 character-canon/race-features/{族}.json + REPORT.md
// 用法：node scripts/extract-race-features.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const outDir = join(gen, 'character-canon/race-features');
const material = '/Volumes/botsvault/06_material';
const BOOKS = { qingyu: 'A-六朝清羽记.epub', yunlong: 'B- 六朝云龙吟.epub', yange: 'C-六朝燕歌行.epub' };

const RACES = [
  { name: '羽族', kws: ['羽族', '飞羽族', '羽人'] },
  { name: '兽蛮人', kws: ['兽蛮人', '兽蛮', '蛮人'] },
  { name: '鲛人', kws: ['鲛人', '鲛女'] },
  { name: '碧鲮', kws: ['碧鲮', '碧鲮族', '碧鲮人'] },
];

const envText = existsSync(join(root, '.env')) ? readFileSync(join(root, '.env'), 'utf8') : '';
const OR_KEY = Object.fromEntries(envText.split(/\r?\n/).flatMap(l => { const m = l.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*)\s*$/); if (!m) return []; let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); return [[m[1], v]]; })).OPENROUTER_API_KEY;

const cache = {};
function chapters(id) {
  if (cache[id]) return cache[id];
  const tmp = mkdtempSync(join(tmpdir(), `xt-race-${id}-`));
  execFileSync('unzip', ['-o', '-q', join(material, BOOKS[id]), '-d', tmp]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(tmp, p)).find(existsSync);
  return cache[id] = readdirSync(base).filter(f => /\.x?html?$/i.test(f)).sort().map(f => readFileSync(join(base, f), 'utf8').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim());
}
function windows(kws, span = 420, maxPer = 6, budget = 14000) {
  const perBook = Math.floor(budget / 3);
  const sel = [];
  for (const b of Object.keys(BOOKS)) {
    const out = []; const seen = new Set();
    for (const kw of kws) for (const t of chapters(b)) {
      let pos = 0, n = 0;
      while (n < maxPer) { const i = t.indexOf(kw, pos); if (i < 0) break; const key = `${b}:${i}`;
        if (!seen.has(key)) { seen.add(key); out.push(`【${b}】${t.slice(Math.max(0, i - span), i + kw.length + span)}`); } pos = i + kw.length; n++; }
    }
    let used = 0; const step = Math.max(1, Math.ceil(out.length / Math.ceil(perBook / (span * 2 + 40))));
    for (let i = 0; i < out.length; i += (used === 0 ? 1 : step)) { const w = out[i]; if (!w || used + w.length > perBook) break; sel.push(w); used += w.length; }
  }
  return sel.join('\n\n');
}
const SYS = '你是小说种族设定考据员。只依据片段判断，不脑补，不复述露骨细节。严格输出 JSON。';
const userPrompt = (race, ev) => `种族「${race}」。依据原文片段整理其设定：
- appearance：外貌形态具体描写（体貌/肤色发色/特征器官如羽翼鳞尾等，≤120字，尽量引用原文措辞）
- physiology：生理/能力特点（水性/飞行/寿命/体质等，≤80字）
- distribution：分布/居地/与人族关系（≤60字）
- notable：代表人物（原文明确的）
- variants：亚种或形态差异（如有）
输出 JSON：{"race":"${race}","appearance","physiology","distribution","notable":[],"variants":"","confidence":"高|中|低"}
只写原文明确支持的。

片段：
${ev || '（未命中）'}`;

function askMiniMax(user) {
  const mf = join(outDir, '_race.messages.json');
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
const bad = r => r.parse_failed || !r.appearance;

async function run() {
  mkdirSync(outDir, { recursive: true });
  const results = [];
  for (const race of RACES) {
    const ev = windows(race.kws);
    console.error(`${race.name}: 证据 ${ev.length} 字`);
    const user = userPrompt(race.name, ev);
    let r; try { r = parse(askMiniMax(user)); } catch (e) { r = { parse_failed: true, error: String(e.message).slice(0, 100) }; }
    if (bad(r)) { try { const r2 = parse(askMiniMax(user)); if (!bad(r2)) r = { ...r2, _retry: 1 }; } catch { /* keep */ } }
    if (bad(r) && OR_KEY) { try { const r3 = parse(await askDeepSeek(user)); if (!bad(r3)) r = { ...r3, _fallback: 'deepseek' }; } catch { /* keep */ } }
    r.race = race.name;
    writeFileSync(join(outDir, `${race.name}.json`), JSON.stringify(r, null, 2) + '\n');
    results.push(r);
  }
  const md = ['# 种族形态设定扫描（供人工核 → 落风貌表/角色卡）', ''];
  for (const r of results) {
    md.push(`## ${r.race}${r.parse_failed ? ' ⚠失败' : ''}（置信:${r.confidence || '?'}）`);
    if (!r.parse_failed) {
      md.push(`- 外貌形态：${r.appearance || ''}`);
      md.push(`- 生理能力：${r.physiology || ''}`);
      md.push(`- 分布关系：${r.distribution || ''}`);
      if ((r.notable || []).length) md.push(`- 代表人物：${(r.notable || []).join('、')}`);
      if (r.variants) md.push(`- 亚种差异：${r.variants}`);
    }
    md.push('');
  }
  writeFileSync(join(outDir, 'REPORT.md'), md.join('\n'));
  console.error('完成 → ' + outDir);
}
run().catch(e => { console.error(e); process.exit(1); });
