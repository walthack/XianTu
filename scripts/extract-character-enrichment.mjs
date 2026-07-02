#!/usr/bin/env node
// P1 三字段来源扫描：对全部 registry 角色扫「宗门归属 / 故事时点年龄 / 首次登场地点」。
// 交 MiniMax 依据 epub 全文检索片段判断；产物供人工裁定，不直接写正典。
// 断点续：已有 result.json 的跳过。产物：character-canon/enrichment-scan/{name}.result.json + evidence/ + REPORT.md
// 用法：node scripts/extract-character-enrichment.mjs   (建议后台跑，308 角色)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const outDir = join(gen, 'character-canon/enrichment-scan');
const evDir = join(outDir, 'evidence');
const material = '/Volumes/botsvault/06_material';
const BOOKS = {
  qingyu: { title: '六朝清羽记', epub: 'A-六朝清羽记.epub' },
  yunlong: { title: '六朝云龙吟', epub: 'B- 六朝云龙吟.epub' },
  yange: { title: '六朝燕歌行', epub: 'C-六朝燕歌行.epub' },
};

const reg = JSON.parse(readFileSync(join(root, 'src/modules/scenarioMods/builtins/character-registry.json'), 'utf8'));
// 规范势力名清单（P0 去重后）
const factionSet = new Set();
for (const b of Object.keys(BOOKS)) {
  const dir = join(gen, b, 'stages');
  for (const f of readdirSync(dir).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
    const m = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    for (const fa of m.canon?.factions || []) factionSet.add(fa.name);
  }
}
const factionList = [...factionSet].sort((a, b) => a.localeCompare(b, 'zh')).join('、');

function loadBook(id) {
  const spec = BOOKS[id];
  const tmp = mkdtempSync(join(tmpdir(), `xt-en-${id}-`));
  execFileSync('unzip', ['-o', '-q', join(material, spec.epub), '-d', tmp]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(tmp, p)).find(existsSync);
  return readdirSync(base).filter(f => /\.x?html?$/i.test(f)).sort().map(f => ({
    book: spec.title, file: f,
    text: readFileSync(join(base, f), 'utf8').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim(),
  }));
}
const chapterCache = {};
const chapters = (book) => chapterCache[book] || (chapterCache[book] = loadBook(book));

function windows(kws, books, span = 400, maxPer = 6) {
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

const SYS = '你是严谨的小说设定整理员。只依据提供的全文检索片段判断，不脑补、不复述露骨细节。输出严格 JSON。';
function userPrompt(name, aliases, ev) {
  return `抽取角色「${name}」${aliases.length ? `（别名：${aliases.join('、')}）` : ''}的三项设定：

1) affiliations 宗门/势力归属（可多个）：每项 {faction, role}。faction **尽量映射到以下已知势力名**，确无匹配再据原文新增：${factionList}。role=角色在该势力内的身份/职务（如"堂主""医女""禁军统领"）。
2) storyAge 故事时点年龄：{value, basis}。value=故事当前时段此角色的**年龄(岁)**，可写数字或区间(如"约30")。basis=原文依据(如"年方十六""三十许")。**只给年龄，不要推算出生年份**；原文无明确年龄线索则 value 写 null 并置 needsHuman:true。
3) debut 首次登场：{location, locator, scene}。location=登场地名；locator=书/集/章或事件定位；scene=一句话描述怎么出场。

只依据原文片段；证据不足的字段留空并置 needsHuman:true。
输出 JSON：{"name","affiliations":[{"faction","role"}],"storyAge":{"value","basis"},"debut":{"location","locator","scene"},"needsHuman":bool}

全文检索片段：
${ev || '（未命中，needsHuman:true）'}`;
}

function askMiniMax(name, aliases, ev) {
  const msgs = [{ role: 'system', content: SYS }, { role: 'user', content: userPrompt(name, aliases, ev) }];
  const tmp = join(outDir, `${name}.messages.json`);
  writeFileSync(tmp, JSON.stringify(msgs, null, 2));
  return execFileSync('mmx', ['text', 'chat', '--messages-file', tmp, '--model', 'MiniMax-M2.7', '--temperature', '0.1', '--max-tokens', '3072', '--non-interactive', '--quiet', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}
const parse = (t) => { try { const j = String(t).match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || String(t).slice(String(t).indexOf('{'), String(t).lastIndexOf('}') + 1); return JSON.parse(j); } catch { return { parse_failed: true, raw: String(t).slice(0, 3000), needsHuman: true }; } };

function run() {
  mkdirSync(evDir, { recursive: true });
  const chars = process.env.LIMIT ? reg.characters.slice(0, Number(process.env.LIMIT)) : reg.characters;
  let done = 0, skipped = 0;
  for (let idx = 0; idx < chars.length; idx++) {
    const c = chars[idx];
    const name = c.canonicalName;
    const resPath = join(outDir, `${name}.result.json`);
    if (existsSync(resPath)) { skipped++; continue; }
    const aliases = c.aliases || [];
    const kws = [name, ...aliases].filter(Boolean);
    const books = (c.books && c.books.length) ? c.books : Object.keys(BOOKS);
    const ev = windows(kws, books);
    writeFileSync(join(evDir, `${name}.md`), `# ${name}\nkw=${kws.join(',')} books=${books}\n\n${ev}\n`);
    console.error(`[${idx + 1}/${chars.length}] ${name}: 证据 ${ev.length} 字 → MiniMax...`);
    let r; try { r = parse(askMiniMax(name, aliases, ev)); } catch (e) { r = { name, error: String(e.message).slice(0, 300), needsHuman: true }; }
    r.name = r.name || name;
    r._id = c.id; r._books = books;
    writeFileSync(resPath, JSON.stringify(r, null, 2) + '\n');
    done++;
  }
  // 汇总 REPORT
  const results = readdirSync(outDir).filter(f => f.endsWith('.result.json')).map(f => JSON.parse(readFileSync(join(outDir, f), 'utf8')));
  const md = ['# 角色富化扫描（宗门归属/故事年龄/登场地点）— 人工裁定用，未写回正典', '', `生成：${new Date().toISOString()}  模型：MiniMax-M2.7  角色：${results.length}`, ''];
  for (const r of results.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh'))) {
    md.push(`## ${r.name}${r.needsHuman ? '  ⚠needsHuman' : ''}${r.parse_failed ? '  ⚠parse_failed' : ''}`);
    if (r.affiliations?.length) md.push(`- 归属：${r.affiliations.map(a => `${a.faction}(${a.role || ''})`).join('、')}`);
    if (r.storyAge && r.storyAge.value != null) md.push(`- 年龄：${r.storyAge.value}（${r.storyAge.basis || ''}）`);
    if (r.debut) md.push(`- 登场：${r.debut.location || '?'}｜${r.debut.locator || ''}｜${r.debut.scene || ''}`);
    md.push('');
  }
  writeFileSync(join(outDir, 'REPORT.md'), md.join('\n'));
  console.error(`完成：本次扫 ${done}，跳过(已存在) ${skipped} → ${outDir}/REPORT.md`);
}
run();
