#!/usr/bin/env node
// 一次性扫「岳帅(岳鸟人)线」三件事，供人工裁定建卡：
//   1) 岳帅生平（身份/星月湖地位/与碧姬小紫关系/死因/武功/结局）
//   2) 星月湖八骏完整名单（8人+骏骥代号+部属身份）
//   3) 碧姬(碧奴/碧鲮族)身体异能 + 登场桥段
// 产物：character-canon/yueshuai-scan/{topic}.json + REPORT.md
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outDir = join(root, 'mod-kit/generated/deepseek-v4-flash/character-canon/yueshuai-scan');
const material = '/Volumes/botsvault/06_material';
const BOOKS = { qingyu: 'A-六朝清羽记.epub', yunlong: 'B- 六朝云龙吟.epub', yange: 'C-六朝燕歌行.epub' };

const cache = {};
function chapters(id) {
  if (cache[id]) return cache[id];
  const tmp = mkdtempSync(join(tmpdir(), `xt-ys-${id}-`));
  execFileSync('unzip', ['-o', '-q', join(material, BOOKS[id]), '-d', tmp]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(tmp, p)).find(existsSync);
  return cache[id] = readdirSync(base).filter(f => /\.x?html?$/i.test(f)).sort().map(f =>
    readFileSync(join(base, f), 'utf8').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim());
}
function windows(kws, books, span = 400, maxPer = 8, budget = 15000) {
  const out = []; const seen = new Set();
  for (const b of books) for (const kw of kws) { const chs = chapters(b);
    for (let ci = 0; ci < chs.length; ci++) { const t = chs[ci]; let pos = 0, n = 0;
      while (n < maxPer) { const i = t.indexOf(kw, pos); if (i < 0) break;
        const key = `${b}:${ci}:${i}`; if (!seen.has(key)) { seen.add(key); out.push(`【${b}/ch${ci}/kw=${kw}】${t.slice(Math.max(0, i - span), i + kw.length + span)}`); }
        pos = i + kw.length; n++; } } }
  let used = 0, sel = []; for (const w of out) { if (used + w.length > budget) break; sel.push(w); used += w.length; } return sel.join('\n\n');
}
function ask(sys, user, tmpName) {
  const mf = join(outDir, tmpName);
  writeFileSync(mf, JSON.stringify([{ role: 'system', content: sys }, { role: 'user', content: user }], null, 2));
  const out = execFileSync('mmx', ['text', 'chat', '--messages-file', mf, '--model', 'MiniMax-M2.7', '--temperature', '0.1', '--max-tokens', '4096', '--non-interactive', '--quiet', '--output', 'json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  try { const o = JSON.parse(out); return o?.choices?.[0]?.message?.content || o?.output || out; } catch { return out; }
}
const SYS = '你是严谨的小说设定考据员，只依据提供的原文片段回答，不脑补、不复述露骨细节。输出严格 JSON（可含中文）。';

mkdirSync(outDir, { recursive: true });
const tasks = [
  { topic: 'yueshuai', kws: ['岳鸟人', '岳帅'], books: ['qingyu', 'yunlong', 'yange'],
    q: '抽取「岳帅（岳鸟人）」的人物档案。输出 JSON：{"canonicalName":"岳帅","aliases":[],"identitySummary":"(星月湖地位/身份)","relationToProtagonist":"(与程宗扬关系,若无写无直接关系)","keyEvents":[],"signatureAbilities":[],"ending":"(生死结局,如已死写明)","spouses":["(妻妾,如碧姬)"],"children":["(子女/遗孤,如小紫)"],"eightSteeds_relation":"(与星月湖八骏的关系)","needsHuman":bool}' },
  { topic: 'eight_steeds', kws: ['八骏', '星月湖'], books: ['qingyu', 'yunlong', 'yange'],
    q: '「星月湖八骏」指哪八个人？逐个给 {name(本名), codename(骏/骥代号如龙骥), role}。并说明八骏与岳帅的关系、他们的共同使命（是否为保护岳帅遗孀/遗孤）。输出 JSON：{"eightSteeds":[{"name","codename","role"}],"mission":"(共同使命)","needsHuman":bool}。只列原文明确支持的，不足8人就列已知的并 needsHuman:true。' },
  { topic: 'biji_ability', kws: ['碧奴', '碧姬', '碧鲮'], books: ['qingyu'],
    q: '碧姬（碧奴，碧鲮族）的身体异能/特殊能力是什么？她的登场桥段（如珍珠舞衣、与阁罗、展示身体能力）如何？输出 JSON：{"abilities":["(碧鲮族异能/身体能力)"],"debutScene":"(登场桥段描述,不露骨)","identityNote":"(她与岳帅关系,如是否岳帅妻妾)","needsHuman":bool}' },
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
writeFileSync(join(outDir, 'REPORT.md'), '# 岳帅线扫描（人工裁定）\n\n```json\n' + JSON.stringify(results, null, 2) + '\n```\n');
console.error('完成 → ' + outDir);
