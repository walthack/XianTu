#!/usr/bin/env node

// 逐角色抽「登场场景 + 关键剧情事件」，供后续补进 stage 事件（人工裁定，不直接写正典）。
// 语料：epub 全文关键词窗口；模型：MiniMax-M2.7（mmx）。产物：
//   character-canon/debut-events-scan/{name}.json + REPORT.md + evidence/{name}.md
// 用法：node scripts/extract-character-debut-events.mjs

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const outDir = join(gen, 'character-canon/debut-events-scan');
const evDir = join(outDir, 'evidence');
const material = '/Volumes/botsvault/06_material';
const BOOKS = {
  qingyu: { title: '六朝清羽记', epub: 'A-六朝清羽记.epub' },
  yunlong: { title: '六朝云龙吟', epub: 'B- 六朝云龙吟.epub' },
  yange: { title: '六朝燕歌行', epub: 'C-六朝燕歌行.epub' },
};

// 关注名单（用户给定 26 人）
const WATCH = ['小紫','潘金莲','云丹琉','云如瑶','卓云君','阮香凝','杨玉环','赵合德','吕雉','蛇夫人','尹馥兰','惊理','泉玉姬','成光','凝羽','阮香琳','齐羽仙','黛绮丝','白霓裳','赵飞燕','月霜','剑玉姬','乐明珠','秦桧','贾文和','萧遥逸'];
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const SCAN_LIST = ONLY || WATCH;

const reg = JSON.parse(readFileSync(join(root, 'src/modules/scenarioMods/builtins/character-registry.json'), 'utf8'));
const byName = new Map(reg.characters.map(c => [c.canonicalName, c]));

function loadBook(id) {
  const spec = BOOKS[id];
  const tmp = mkdtempSync(join(tmpdir(), `xt-de-${id}-`));
  execFileSync('unzip', ['-o', '-q', join(material, spec.epub), '-d', tmp]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(tmp, p)).find(existsSync);
  return readdirSync(base).filter(f => /\.x?html?$/i.test(f)).sort().map(f => ({
    book: spec.title, file: f,
    text: readFileSync(join(base, f), 'utf8').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim(),
  }));
}
const chapterCache = {};
function chapters(book) { return chapterCache[book] || (chapterCache[book] = loadBook(book)); }

function windows(kws, books, span = 420, maxPer = 6, budget = 14000) {
  // 跨本角色：预算按书均分，保证每本都有代表证据（否则词频高的前书吃光预算，后书故事线全丢）
  const perBook = Math.floor(budget / Math.max(1, books.length));
  const sel = [];
  for (const b of books) {
    const out = []; const seen = new Set();
    for (const kw of kws) for (const ch of chapters(b)) {
      let pos = 0, n = 0;
      while (n < maxPer) {
        const i = ch.text.indexOf(kw, pos); if (i < 0) break;
        const key = `${b}:${ch.file}:${i}`;
        if (!seen.has(key)) { seen.add(key); out.push(`【${ch.book}/${ch.file}/kw=${kw}】${ch.text.slice(Math.max(0, i - span), i + kw.length + span)}`); }
        pos = i + kw.length; n++;
      }
    }
    // 每本取 首段(登场) + 均匀抽样(全书弧线)，而非只取前面
    let used = 0; const picked = [];
    const step = Math.max(1, Math.ceil(out.length / Math.ceil(perBook / (span * 2 + 60))));
    for (let i = 0; i < out.length; i += (picked.length === 0 ? 1 : step)) {
      const w = out[i]; if (used + w.length > perBook) break; picked.push(w); used += w.length;
    }
    sel.push(...picked);
  }
  return sel.join('\n\n');
}

const SYS = '你是严谨的小说剧情整理员。只依据提供的全文检索片段判断，不脑补，不复述露骨细节。输出 JSON：{name, debut:{scene, howAppears, initialIdentity, locationHint, evidenceRefs}, keyEvents:[{title, description, locationHint, importance:high|mid, evidenceRefs}], needsHuman:boolean}。title 简短(如"毒发索心头血")；description 1-2句；locationHint 用书/集/章或事件名；evidenceRefs 用【书/file/kw】。';

async function askMiniMax(name, bookTitle, evidence) {
  const msgs = [
    { role: 'system', content: SYS },
    { role: 'user', content: `以下证据全部来自《${bookTitle}》单本。抽取角色「${name}」在**这一本**中的：\n1) 本书首次出场（场景/方式/初始身份/在哪集章附近；若本书中该角色只是被提及、无实际登场，debut 各字段留空并注明）。\n2) 本书内的关键/招牌剧情事件（转折、名场面），逐个给 title/description/locationHint/importance。\n只列原文明确支持的，证据不足写 needsHuman。\n\n检索片段：\n${evidence || '（未命中）'}` },
  ];
  const tmp = join(outDir, `${name}.messages.json`);
  writeFileSync(tmp, JSON.stringify(msgs, null, 2));
  const stdout = execFileSync('mmx', ['text', 'chat', '--messages-file', tmp, '--model', 'MiniMax-M2.7', '--temperature', '0.1', '--max-tokens', '4096', '--non-interactive', '--quiet', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  try { const o = JSON.parse(stdout); return o?.choices?.[0]?.message?.content || o?.output || o?.text || stdout; } catch { return stdout; }
}
const parse = t => { try { const j = String(t).match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || String(t).slice(String(t).indexOf('{'), String(t).lastIndexOf('}') + 1); return JSON.parse(j); } catch { return { parse_failed: true, raw: String(t).slice(0, 3000), needsHuman: true }; } };

// ---- DeepSeek 兜底（OpenRouter）----
const envText = existsSync(join(root, '.env')) ? readFileSync(join(root, '.env'), 'utf8') : '';
const OR_KEY = Object.fromEntries(envText.split(/\r?\n/).flatMap(l => { const m = l.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*)\s*$/); if (!m) return []; let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); return [[m[1], v]]; })).OPENROUTER_API_KEY;
async function askDeepSeek(sys, user) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${OR_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'deepseek/deepseek-v4-flash', temperature: 0.1, max_tokens: 4096, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }),
  });
  if (!r.ok) throw new Error(`OpenRouter ${r.status}`);
  return JSON.parse(await r.text()).choices?.[0]?.message?.content || '';
}
// 坏结果判定：解析失败 / 内容全空 / 短拒答
const isBad = (r) => r.parse_failed || (!(r.keyEvents || []).length && !(r.debut && (r.debut.scene || r.debut.locationHint)));
const looksRefusal = (t) => String(t).trim().length < 40 && /无法|抱歉|不能|拒绝/.test(String(t));

const BOOK_ORDER = ['qingyu', 'yunlong', 'yange'];

async function run() {
  await mkdir(evDir, { recursive: true });
  const results = [];
  for (let idx = 0; idx < SCAN_LIST.length; idx++) {
    const name = SCAN_LIST[idx];
    const c = byName.get(name);
    const kws = [name, ...((c && c.aliases) || [])].filter(Boolean);
    const books = ((c && c.books && c.books.length) ? c.books : Object.keys(BOOKS))
      .slice().sort((a, b) => BOOK_ORDER.indexOf(a) - BOOK_ORDER.indexOf(b));
    // 按本独立搜索+独立抽取（每本满额预算），再确定性合并
    const perBook = [];
    for (const b of books) {
      const ev = windows(kws, [b]);
      if (!ev) { perBook.push({ book: b, skipped: 'no_evidence' }); continue; }
      writeFileSync(join(evDir, `${name}.${b}.md`), `# ${name} @${b}\nkw=${kws.join(',')}\n\n${ev}\n`);
      console.error(`[${idx + 1}/${SCAN_LIST.length}] ${name} @${BOOKS[b].title}: 证据 ${ev.length} 字 → MiniMax...`);
      // 三级兜底：M2.7 → M2.7 重试(空返回/坏JSON是随机抽风) → DeepSeek(最烈内容会软拒,但格式稳)
      let r; try { r = parse(await askMiniMax(name, BOOKS[b].title, ev)); } catch (e) { r = { parse_failed: true, error: String(e.message).slice(0, 200), needsHuman: true }; }
      if (isBad(r)) {
        console.error(`  ↳ MiniMax 坏结果,重试一次...`);
        try { const r2 = parse(await askMiniMax(name, BOOKS[b].title, ev)); if (!isBad(r2)) r = { ...r2, _retry: 'minimax#2' }; } catch { /* keep r */ }
      }
      if (isBad(r) && OR_KEY) {
        console.error(`  ↳ 仍坏,DeepSeek 兜底...`);
        try {
          const dsUser = `以下证据全部来自《${BOOKS[b].title}》单本。抽取角色「${name}」在这一本中的：1)首次出场(场景/方式/初始身份/位置) 2)关键剧情事件(title/description/locationHint/importance)。只列原文明确支持的。\n\n检索片段：\n${ev}`;
          const dsOut = await askDeepSeek(SYS, dsUser);
          if (!looksRefusal(dsOut)) { const r3 = parse(dsOut); if (!isBad(r3)) r = { ...r3, _fallback: 'deepseek' }; }
          else console.error(`  ↳ DeepSeek 软拒答`);
        } catch (e) { console.error(`  ↳ DeepSeek 失败: ${String(e.message).slice(0, 80)}`); }
      }
      r.book = b;
      perBook.push(r);
      writeFileSync(join(outDir, `${name}.${b}.json`), JSON.stringify(r, null, 2) + '\n');
    }
    // 合并：登场=书序最早一本的 debut；事件=按书序拼接并打上书标签
    const merged = { name, needsHuman: perBook.some(r => r.needsHuman || r.parse_failed), perBookScanned: books, debut: null, keyEvents: [] };
    for (const r of perBook) {
      if (r.skipped || r.parse_failed) continue;
      const label = BOOKS[r.book]?.title || r.book;
      if (!merged.debut && r.debut && (r.debut.scene || r.debut.locationHint)) merged.debut = { ...r.debut, book: label };
      for (const e of r.keyEvents || []) merged.keyEvents.push({ ...e, book: label });
    }
    writeFileSync(join(outDir, `${name}.result.json`), JSON.stringify(merged, null, 2) + '\n');
    results.push(merged);
  }
  const md = ['# 重要角色 登场/关键事件 抽取（人工裁定用，未写回正典）', '', `生成：${new Date().toISOString()}`, `模型：MiniMax-M2.7  角色：${SCAN_LIST.length}`, ''];
  for (const r of results) {
    md.push(`## ${r.name}${r.needsHuman ? '  ⚠needsHuman' : ''}`);
    if (r.debut) md.push(`- 登场【${r.debut.book || '?'}】：${r.debut.scene || ''}（${r.debut.howAppears || ''}｜初始身份:${r.debut.initialIdentity || ''}｜${r.debut.locationHint || ''}）`);
    for (const e of (r.keyEvents || [])) md.push(`- [${e.importance || '?'}]【${e.book || '?'}】${e.title}：${e.description}（${e.locationHint || ''}）`);
    if (r.parse_failed) md.push('- ⚠ 解析失败，见 result.json');
    md.push('');
  }
  writeFileSync(join(outDir, ONLY ? `REPORT-${ONLY.join('_')}.md` : 'REPORT.md'), md.join('\n'));
  console.error('完成 → ' + outDir);
}
run().catch(e => { console.error(e); process.exit(1); });
