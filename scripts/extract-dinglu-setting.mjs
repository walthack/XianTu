#!/usr/bin/env node

// 「鼎炉」双修设定抽取：MiniMax M2.7 + DeepSeek 各自回原文抽，产物仅供人工裁定。
// 产物：mod-kit/generated/deepseek-v4-flash/character-canon/dinglu-setting-scan/
//   evidence.md / minimax.result.json / deepseek.result.json / REPORT.md
//
// Usage: node scripts/extract-dinglu-setting.mjs

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, readFileSync as rf } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outDir = join(root, 'mod-kit/generated/deepseek-v4-flash/character-canon/dinglu-setting-scan');
const material = '/Volumes/botsvault/06_material';
const BOOKS = {
  qingyu: { title: '六朝清羽记', epub: 'A-六朝清羽记.epub' },
  yunlong: { title: '六朝云龙吟', epub: 'B- 六朝云龙吟.epub' },
  yange: { title: '六朝燕歌行', epub: 'C-六朝燕歌行.epub' },
};
const KEYWORDS = ['鼎炉', '炉鼎', '鼎体', '玉鼎', '五行', '木行', '金行', '水行', '火行', '土行', '珍品', '极品', '玉液', '凝奴', '凝羽', '卓云君', '双修', '采补', '龙气', '太一经', '品级'];
const QUESTION = `这是一部修炼小说的「鼎炉」修炼体系设定，请做设定分类学抽取，只列原文明确支持的事实：
1) 「鼎炉/炉鼎」在该修炼体系中的定义与作用（作为双修/修炼载体）。
2) 与合适的鼎炉修炼，对修炼者修为/功力的增益机制；有无代价/副作用（如反噬、鼎炉自身修为受限）。
3) 鼎炉的【品级】体系：原文如何分级（如"得一即可称为珍品"的珍品级、极品等）？
4) 鼎炉的【五行属性】体系：原文如何按金/木/水/火/土分类？举例（如"凝奴…正是珍品级的木行之鼎"）。
5) 【尽量找全】所有被原文称为鼎炉的女性角色（不止凝羽/阮香凝/申婉盈），逐个列出其：品级、五行属性、增益/证据。
- 只写设定层分类事实，不复述露骨情节细节。证据不足写 unknown。每条结论带 evidenceRefs（格式【书/file/kw】）。`;

function loadBook(bookId) {
  const spec = BOOKS[bookId];
  const epubPath = join(material, spec.epub);
  if (!existsSync(epubPath)) throw new Error(`missing epub: ${epubPath}`);
  const tmp = mkdtempSync(join(tmpdir(), `xt-dl-${bookId}-`));
  execFileSync('unzip', ['-o', '-q', epubPath, '-d', tmp]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(tmp, p)).find(existsSync);
  const chapters = [];
  for (const file of readdirSync(base).filter(f => /\.x?html?$/i.test(f)).sort()) {
    const text = rf(join(base, file), 'utf8').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
    chapters.push({ bookTitle: spec.title, file, text });
  }
  return chapters;
}
function findWindows(chapters, keywords, span = 480, maxPerKeyword = 5) {
  const out = []; const seen = new Set();
  for (const kw of keywords) for (const ch of chapters) {
    let pos = 0, count = 0;
    while (count < maxPerKeyword) {
      const idx = ch.text.indexOf(kw, pos); if (idx < 0) break;
      const key = `${ch.file}:${idx}`;
      if (!seen.has(key)) { seen.add(key); out.push({ book: ch.bookTitle, file: ch.file, keyword: kw, snippet: ch.text.slice(Math.max(0, idx - span), idx + kw.length + span) }); }
      pos = idx + kw.length; count++;
    }
  }
  return out;
}
function trimEvidence(windows, maxChars = 16000) {
  const sel = []; let used = 0;
  for (const w of windows) { const line = `【${w.book}/${w.file}/kw=${w.keyword}】${w.snippet}`; if (used + line.length > maxChars) break; sel.push(line); used += line.length; }
  return sel.join('\n\n');
}
const SYS = '你是严谨的修炼小说设定分类整理员。只依据用户提供的全文检索片段判断，不脑补，不复述露骨情节。输出 JSON：{setting_summary, mechanism, grade_system, wuxing_system, examples:[{name,is_dinglu,grade,wuxing,effect,confidence,evidenceRefs}], caveats, needsHuman:boolean}。';

async function askMiniMax(evidence) {
  const messages = [{ role: 'system', content: SYS }, { role: 'user', content: `${QUESTION}\n\n全文检索片段：\n${evidence}` }];
  const tmp = join(outDir, 'minimax.messages.json');
  await writeFile(tmp, JSON.stringify(messages, null, 2));
  const stdout = execFileSync('mmx', ['text', 'chat', '--messages-file', tmp, '--model', 'MiniMax-M2.7', '--temperature', '0.1', '--max-tokens', '4096', '--non-interactive', '--quiet', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
  try { const o = JSON.parse(stdout); return o?.choices?.[0]?.message?.content || o?.output || o?.text || stdout; } catch { return stdout; }
}
async function askDeepSeek(evidence) {
  const env = Object.fromEntries((existsSync(join(root, '.env')) ? rf(join(root, '.env'), 'utf8') : '').split('\n').filter(Boolean).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
  const apiKey = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY missing');
  const messages = [{ role: 'system', content: SYS }, { role: 'user', content: `${QUESTION}\n\n全文检索片段：\n${evidence}` }];
  for (let i = 1; i <= 4; i++) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'deepseek/deepseek-v4-flash', temperature: 0.1, max_tokens: 4096, response_format: { type: 'json_object' }, messages }) });
      const b = await r.text(); if (!r.ok) throw new Error(`${r.status}: ${b.slice(0, 120)}`);
      const c = JSON.parse(b).choices?.[0]?.message?.content || ''; if (!c.trim()) throw new Error('empty');
      return c;
    } catch (e) { console.error(`  [deepseek] ${i}/4 ${e.message}`); await new Promise(s => setTimeout(s, i * 3000)); }
  }
  return '{"error":"deepseek_failed"}';
}
function parseLoose(t) { try { const j = String(t).match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || String(t).slice(String(t).indexOf('{'), String(t).lastIndexOf('}') + 1); return JSON.parse(j); } catch { return { parse_failed: true, raw: String(t).slice(0, 4000), needsHuman: true }; } }

async function run() {
  await mkdir(outDir, { recursive: true });
  const chapters = Object.keys(BOOKS).flatMap(loadBook);
  const windows = findWindows(chapters, KEYWORDS);
  const evidence = trimEvidence(windows);
  await writeFile(join(outDir, 'evidence.md'), `# 鼎炉设定 检索证据\n\n窗口数：${windows.length}\n\n${evidence}\n`);
  console.error(`窗口 ${windows.length}，证据 ${evidence.length} 字`);

  console.error('→ MiniMax...');
  let mmx = null; try { mmx = parseLoose(await askMiniMax(evidence)); } catch (e) { mmx = { error: String(e.message), needsHuman: true }; }
  await writeFile(join(outDir, 'minimax.result.json'), JSON.stringify(mmx, null, 2) + '\n');
  console.error('→ DeepSeek...');
  let ds = null; try { ds = parseLoose(await askDeepSeek(evidence)); } catch (e) { ds = { error: String(e.message), needsHuman: true }; }
  await writeFile(join(outDir, 'deepseek.result.json'), JSON.stringify(ds, null, 2) + '\n');

  const fmt = (o) => '```json\n' + JSON.stringify(o, null, 2) + '\n```';
  await writeFile(join(outDir, 'REPORT.md'), `# 鼎炉设定 · 双模型抽取（人工裁定用，未写回正典）\n\n生成：${new Date().toISOString()}\n检索窗口：${windows.length}\n\n## MiniMax-M2.7\n${fmt(mmx)}\n\n## DeepSeek-V4-Flash\n${fmt(ds)}\n`);
  console.error('完成 → ' + outDir);
}
run().catch(e => { console.error(e); process.exit(1); });
