#!/usr/bin/env node
// 认知差词典扫描：六朝叫法 ↔ 现代物 词对（水晶=玻璃、霓龙丝=尼龙、九天玄兽=汽车…）。
// 锚点=现代词（主角POV内心翻译时原文会出现），开窗喂模型抓词对+窗口内其他词对。
// M2.7→重试→DeepSeek 兜底。产物 character-canon/term-pairs/{book}.json + REPORT.md
// 用法：node scripts/extract-term-pairs.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const outDir = join(gen, 'character-canon/term-pairs');
const material = '/Volumes/botsvault/06_material';
const BOOKS = { qingyu: 'A-六朝清羽记.epub', yunlong: 'B- 六朝云龙吟.epub', yange: 'C-六朝燕歌行.epub' };

// 现代词锚点（叙述/主角内心会出现的地球词）+ 已知六朝词（反向验证）
const ANCHORS = ['尼龙','玻璃','塑料','水泥','电灯','灯泡','汽车','火车','自行车','发动机','电池','太阳能','电线','肥皂','香皂','望远镜','放大镜','温度计','酒精','蒸馏','罐头','巧克力','咖啡','钟表','拉链','橡胶','沥青','火柴','打火机','眼镜','投影','报纸','银行','支票','保险','股份','拍卖','足球','嘉年华','立交桥','电梯','冰箱','自来水','混凝土','炸药','手榴弹','坦克','飞机','降落伞','雷达','马达','轴承','弹簧','齿轮'];
const LIUCHAO_KNOWN = ['霓龙丝','九天玄兽','夜明珠','琉璃纸','拉链坊'];

const envText = existsSync(join(root, '.env')) ? readFileSync(join(root, '.env'), 'utf8') : '';
const OR_KEY = Object.fromEntries(envText.split(/\r?\n/).flatMap(l => { const m = l.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*)\s*$/); if (!m) return []; let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); return [[m[1], v]]; })).OPENROUTER_API_KEY;

function loadBook(id) {
  const tmp = mkdtempSync(join(tmpdir(), `xt-tp-${id}-`));
  execFileSync('unzip', ['-o', '-q', join(material, BOOKS[id]), '-d', tmp]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(tmp, p)).find(existsSync);
  return readdirSync(base).filter(f => /\.x?html?$/i.test(f)).sort().map(f => readFileSync(join(base, f), 'utf8').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim());
}
function windows(texts, kws, span = 260, maxPer = 3, budget = 13000) {
  const out = []; const seen = new Set();
  for (const kw of kws) for (let ci = 0; ci < texts.length; ci++) {
    const t = texts[ci]; let pos = 0, n = 0;
    while (n < maxPer) { const i = t.indexOf(kw, pos); if (i < 0) break; const key = `${ci}:${Math.floor(i / 500)}`;
      if (!seen.has(key)) { seen.add(key); out.push(`【kw=${kw}】${t.slice(Math.max(0, i - span), i + kw.length + span)}`); } pos = i + kw.length; n++; }
  }
  let used = 0; const sel = [];
  for (const w of out) { if (used + w.length > budget) break; sel.push(w); used += w.length; }
  return sel.join('\n\n');
}
const SYS = '你是小说设定词典编纂员。只依据片段判断，不脑补。严格输出 JSON。';
const userPrompt = (book, ev) => `以下片段来自《${book}》。这部小说的特色：现代事物在六朝世界有本土叫法（穿越者主角内心会用现代词翻译）。
从片段中抽取所有「六朝叫法 ↔ 现代事物」词对。已知例：水晶=玻璃、霓龙丝=尼龙、九天玄兽（蜕壳）=汽车、夜明珠=电灯、琉璃纸=塑料。
每对输出：{"liuchao":"六朝叫法","modern":"现代物","evidence":"一句原文依据(≤40字)"}
注意：只收原文明确对应/主角明确翻译的；纯现代词（主角内心独白无本土对应）不收。
输出 JSON：{"book":"${book}","pairs":[...]}

片段：
${ev}`;
function askMiniMax(user) {
  const mf = join(outDir, '_tp.messages.json');
  writeFileSync(mf, JSON.stringify([{ role: 'system', content: SYS }, { role: 'user', content: user }]));
  const out = execFileSync('mmx', ['text', 'chat', '--messages-file', mf, '--model', 'MiniMax-M2.7', '--temperature', '0.1', '--max-tokens', '3072', '--non-interactive', '--quiet', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  try { const o = JSON.parse(out); return o?.choices?.[0]?.message?.content || o?.output || out; } catch { return out; }
}
async function askDeepSeek(user) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${OR_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'deepseek/deepseek-v4-flash', temperature: 0.1, max_tokens: 3072, messages: [{ role: 'system', content: SYS }, { role: 'user', content: user }] }) });
  if (!r.ok) throw new Error(`OR ${r.status}`);
  return JSON.parse(await r.text()).choices?.[0]?.message?.content || '';
}
const parse = t => { try { const j = String(t).match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || String(t).slice(String(t).indexOf('{'), String(t).lastIndexOf('}') + 1); return JSON.parse(j); } catch { return { parse_failed: true, raw: String(t).slice(0, 500) }; } };
const bad = r => r.parse_failed || !Array.isArray(r.pairs);

async function run() {
  mkdirSync(outDir, { recursive: true });
  const all = new Map(); // liuchao -> {modern, evidence, books:[]}
  for (const [book, label] of [['qingyu', '六朝清羽记'], ['yunlong', '六朝云龙吟'], ['yange', '六朝燕歌行']]) {
    const texts = loadBook(book);
    // 两批窗口：现代词锚点 + 已知六朝词
    for (const [tag, kws] of [['modern', ANCHORS], ['liuchao', LIUCHAO_KNOWN]]) {
      const ev = windows(texts, kws);
      if (!ev) continue;
      console.error(`[${book}/${tag}] 证据 ${ev.length} 字`);
      const user = userPrompt(label, ev);
      let r; try { r = parse(askMiniMax(user)); } catch (e) { r = { parse_failed: true, error: String(e.message).slice(0, 100) }; }
      if (bad(r)) { try { const r2 = parse(askMiniMax(user)); if (!bad(r2)) r = r2; } catch { /* keep */ } }
      if (bad(r) && OR_KEY) { try { const r3 = parse(await askDeepSeek(user)); if (!bad(r3)) r = r3; } catch { /* keep */ } }
      if (bad(r)) { console.error(`  ⚠ 失败`); continue; }
      writeFileSync(join(outDir, `${book}-${tag}.json`), JSON.stringify(r, null, 2) + '\n');
      for (const p of r.pairs) {
        if (!p?.liuchao || !p?.modern) continue;
        const key = p.liuchao.trim();
        if (!all.has(key)) all.set(key, { modern: p.modern.trim(), evidence: p.evidence || '', books: [label] });
        else if (!all.get(key).books.includes(label)) all.get(key).books.push(label);
      }
      console.error(`  → ${r.pairs.length} 对`);
    }
  }
  const rows = [...all.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh'));
  const md = ['# 六朝↔现代 认知差词典（扫描稿，供人工核）', '', '| 六朝叫法 | 现代物 | 出处书 | 依据 |', '|---|---|---|---|'];
  for (const [lc, v] of rows) md.push(`| ${lc} | ${v.modern} | ${v.books.join('/')} | ${v.evidence} |`);
  writeFileSync(join(outDir, 'REPORT.md'), md.join('\n'));
  writeFileSync(join(outDir, 'term-pairs.json'), JSON.stringify(Object.fromEntries(rows.map(([k, v]) => [k, v.modern])), null, 2) + '\n');
  console.error(`完成：${rows.length} 对 → ${outDir}/REPORT.md`);
}
run().catch(e => { console.error(e); process.exit(1); });
