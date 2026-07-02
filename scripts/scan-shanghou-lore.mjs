#!/usr/bin/env node
// 扫「殇侯门/生死根/鬼巫王」真实起源设定（AI 在此留白处编造，需固化正典）。
// MiniMax 依原文抽，供人工核，不直接写正典。产物 character-canon/shanghou-lore-scan/{topic}.json + REPORT.md
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outDir = join(root, 'mod-kit/generated/deepseek-v4-flash/character-canon/shanghou-lore-scan');
const material = '/Volumes/botsvault/06_material';
const BOOKS = { qingyu: 'A-六朝清羽记.epub', yunlong: 'B- 六朝云龙吟.epub', yange: 'C-六朝燕歌行.epub' };

const cache = {};
function chapters(id) {
  if (cache[id]) return cache[id];
  const tmp = mkdtempSync(join(tmpdir(), `xt-sh-${id}-`));
  execFileSync('unzip', ['-o', '-q', join(material, BOOKS[id]), '-d', tmp]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(tmp, p)).find(existsSync);
  return cache[id] = readdirSync(base).filter(f => /\.x?html?$/i.test(f)).sort().map(f => readFileSync(join(base, f), 'utf8').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim());
}
function windows(kws, books, span = 420, maxPer = 8, budget = 15000) {
  const out = []; const seen = new Set();
  for (const b of books) { const chs = chapters(b);
    for (const kw of kws) for (let ci = 0; ci < chs.length; ci++) { const t = chs[ci]; let pos = 0, n = 0;
      while (n < maxPer) { const i = t.indexOf(kw, pos); if (i < 0) break; const key = `${b}:${ci}:${i}`;
        if (!seen.has(key)) { seen.add(key); out.push(`【${b}/ch${ci}/kw=${kw}】${t.slice(Math.max(0, i - span), i + kw.length + span)}`); } pos = i + kw.length; n++; } } }
  let used = 0, sel = []; for (const w of out) { if (used + w.length > budget) break; sel.push(w); used += w.length; } return sel.join('\n\n');
}
function ask(sys, user, tmpName) {
  const mf = join(outDir, tmpName);
  writeFileSync(mf, JSON.stringify([{ role: 'system', content: sys }, { role: 'user', content: user }], null, 2));
  const out = execFileSync('mmx', ['text', 'chat', '--messages-file', mf, '--model', 'MiniMax-M2.7', '--temperature', '0.1', '--max-tokens', '4096', '--non-interactive', '--quiet', '--output', 'json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  try { const o = JSON.parse(out); return o?.choices?.[0]?.message?.content || o?.output || out; } catch { return out; }
}
const SYS = '你是严谨的小说设定考据员，只依据提供的原文片段回答，不脑补、不复述露骨细节。严格输出 JSON（中文）。区分"原文明确"与"未明说"。';

mkdirSync(outDir, { recursive: true });
const tasks = [
  { topic: 'shengsigen', kws: ['生死根'], books: ['qingyu', 'yunlong', 'yange'],
    q: '「生死根」是什么？由来/谁种下/作用/在谁身上/与殇侯、程宗扬、鬼巫王的关系。输出 JSON：{"是什么","由来","种植者/来源","作用","涉及人物":[],"与殇侯门恩怨的关系","原文明确度":"明确|部分|未明说","evidenceRefs":[]}' },
  { topic: 'shanghoumen_vs_zhengdao', kws: ['殇侯门', '毒宗', '殇振羽', '殇侯'], books: ['yunlong', 'yange', 'qingyu'],
    q: '殇侯门（毒宗）与正道/正派的恩怨起源是什么？殇侯为何与正道对立、被谁背叛或联手坑害？涉及哪些人物（师父/老头子/兄弟/同门）？输出 JSON：{"恩怨起源","殇侯遭遇(被谁坑/背叛)","关键人物关系":[{"人物","与殇侯关系"}],"正道领头人","原文明确度","evidenceRefs":[]}' },
  { topic: 'guiwuwang', kws: ['鬼巫王', '鬼王峒'], books: ['qingyu', 'yunlong'],
    q: '鬼巫王的真实身份/来历是什么？与殇侯、生死根、黑魔海、龙神的关系？他本名/师承？输出 JSON：{"真实身份","本名","师承/来历","与殇侯关系","与生死根关系","与龙神关系","原文明确度","evidenceRefs":[]}' },
  { topic: 'shanghou_past', kws: ['殇振羽', '刘病已', '刘谋', '刘次卿', '朱八八'], books: ['yunlong', 'yange'],
    q: '殇侯（殇振羽，别名刘病已/刘次卿/刘谋/朱八八）的完整过往：师承何人（老头子是谁）、如何堕入魔道/创殇侯门、与哪些人有血缘或师门渊源、生死根如何牵涉。输出 JSON：{"完整过往","师承(老头子身份)","堕魔/立门经过","血缘或师门渊源":[{"人物","关系"}],"与生死根牵涉","原文明确度","evidenceRefs":[]}' },
];
const results = {};
for (const t of tasks) {
  const ev = windows(t.kws, t.books);
  console.error(`[${t.topic}] 证据 ${ev.length} 字 → MiniMax...`);
  const raw = ask(SYS, `${t.q}\n\n原文片段：\n${ev}`, `${t.topic}.messages.json`);
  let parsed; try { parsed = JSON.parse(String(raw).match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || String(raw).slice(String(raw).indexOf('{'), String(raw).lastIndexOf('}') + 1)); } catch { parsed = { parse_failed: true, raw: String(raw).slice(0, 4000) }; }
  writeFileSync(join(outDir, `${t.topic}.json`), JSON.stringify(parsed, null, 2) + '\n');
  results[t.topic] = parsed;
}
writeFileSync(join(outDir, 'REPORT.md'), '# 殇侯门/生死根/鬼巫王 真实起源扫描（人工核 → 固化正典）\n\n```json\n' + JSON.stringify(results, null, 2) + '\n```\n');
console.error('完成 → ' + outDir);
