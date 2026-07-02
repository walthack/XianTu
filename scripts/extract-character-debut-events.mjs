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

function windows(kws, books, span = 420, maxPer = 6) {
  const out = []; const seen = new Set();
  for (const b of books) for (const kw of kws) for (const ch of chapters(b)) {
    let pos = 0, n = 0;
    while (n < maxPer) {
      const i = ch.text.indexOf(kw, pos); if (i < 0) break;
      const key = `${b}:${ch.file}:${i}`;
      if (!seen.has(key)) { seen.add(key); out.push(`【${ch.book}/${ch.file}/kw=${kw}】${ch.text.slice(Math.max(0, i - span), i + kw.length + span)}`); }
      pos = i + kw.length; n++;
    }
  }
  let used = 0, sel = [];
  for (const w of out) { if (used + w.length > 14000) break; sel.push(w); used += w.length; }
  return sel.join('\n\n');
}

const SYS = '你是严谨的小说剧情整理员。只依据提供的全文检索片段判断，不脑补，不复述露骨细节。输出 JSON：{name, debut:{scene, howAppears, initialIdentity, locationHint, evidenceRefs}, keyEvents:[{title, description, locationHint, importance:high|mid, evidenceRefs}], needsHuman:boolean}。title 简短(如"毒发索心头血")；description 1-2句；locationHint 用书/集/章或事件名；evidenceRefs 用【书/file/kw】。';

async function askMiniMax(name, evidence) {
  const msgs = [
    { role: 'system', content: SYS },
    { role: 'user', content: `抽取角色「${name}」的：\n1) 登场场景（首次怎么出场：场景/方式/初始身份/在哪本哪集章附近）。\n2) 关键/招牌剧情事件（转折、名场面），逐个给 title/description/locationHint/importance。\n只列原文明确支持的，证据不足写 needsHuman。\n\n全文检索片段：\n${evidence || '（未命中）'}` },
  ];
  const tmp = join(outDir, `${name}.messages.json`);
  writeFileSync(tmp, JSON.stringify(msgs, null, 2));
  const stdout = execFileSync('mmx', ['text', 'chat', '--messages-file', tmp, '--model', 'MiniMax-M2.7', '--temperature', '0.1', '--max-tokens', '4096', '--non-interactive', '--quiet', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  try { const o = JSON.parse(stdout); return o?.choices?.[0]?.message?.content || o?.output || o?.text || stdout; } catch { return stdout; }
}
const parse = t => { try { const j = String(t).match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || String(t).slice(String(t).indexOf('{'), String(t).lastIndexOf('}') + 1); return JSON.parse(j); } catch { return { parse_failed: true, raw: String(t).slice(0, 3000), needsHuman: true }; } };

async function run() {
  await mkdir(evDir, { recursive: true });
  const results = [];
  for (let idx = 0; idx < WATCH.length; idx++) {
    const name = WATCH[idx];
    const c = byName.get(name);
    const kws = [name, ...((c && c.aliases) || [])].filter(Boolean);
    const books = (c && c.books && c.books.length) ? c.books : Object.keys(BOOKS);
    const ev = windows(kws, books);
    writeFileSync(join(evDir, `${name}.md`), `# ${name}\nkw=${kws.join(',')} books=${books}\n\n${ev}\n`);
    console.error(`[${idx + 1}/${WATCH.length}] ${name}: 证据 ${ev.length} 字 → MiniMax...`);
    let r; try { r = parse(await askMiniMax(name, ev)); } catch (e) { r = { name, error: String(e.message), needsHuman: true }; }
    r.name = r.name || name;
    writeFileSync(join(outDir, `${name}.result.json`), JSON.stringify(r, null, 2) + '\n');
    results.push(r);
  }
  const md = ['# 重要角色 登场/关键事件 抽取（人工裁定用，未写回正典）', '', `生成：${new Date().toISOString()}`, `模型：MiniMax-M2.7  角色：${WATCH.length}`, ''];
  for (const r of results) {
    md.push(`## ${r.name}${r.needsHuman ? '  ⚠needsHuman' : ''}`);
    if (r.debut) md.push(`- 登场：${r.debut.scene || ''}（${r.debut.howAppears || ''}｜初始身份:${r.debut.initialIdentity || ''}｜${r.debut.locationHint || ''}）`);
    for (const e of (r.keyEvents || [])) md.push(`- [${e.importance || '?'}] ${e.title}：${e.description}（${e.locationHint || ''}）`);
    if (r.parse_failed) md.push('- ⚠ 解析失败，见 result.json');
    md.push('');
  }
  writeFileSync(join(outDir, 'REPORT.md'), md.join('\n'));
  console.error('完成 → ' + outDir);
}
run().catch(e => { console.error(e); process.exit(1); });
