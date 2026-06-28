#!/usr/bin/env node

// 通读全文为「主要角色」生成/更新完整角色卡（身份/性格/外貌/与主角关系/关键情节 + 性癖）。
// 资料用途：原著为情色小说，仅作 mod 角色建模的资料整理，临床客观、忠实原文、无据则留空。
// 广检索：角色名 + 外貌/性格/亲密 关键词的句子（含距名±窗口的代词承接句）→ DeepSeek 出卡 JSON。
// 产 character-canon/<book>.character-cards-v2.json（草稿，不直接改 mod）。--names=A,B 限定；位置参数限定书。

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const material = '/Volumes/botsvault/06_material';
const model = process.env.XIANTU_CARD_MODEL || 'deepseek/deepseek-v4-flash';
const maxTokens = Number(process.env.XIANTU_CARD_MAX_TOKENS || 7000);
const budget = Number(process.env.XIANTU_CARD_PASSAGE_BUDGET || 7000);
const books = [
  { id: 'qingyu', title: '六朝清羽记', epub: 'A-六朝清羽记.epub' },
  { id: 'yunlong', title: '六朝云龙吟', epub: 'B- 六朝云龙吟.epub' },
  { id: 'yange', title: '六朝燕歌行', epub: 'C-六朝燕歌行.epub' },
];

// 三类线索关键词：外貌 / 性格 / 亲密(供性癖)。
const KW = /胸|乳|肌肤|肤|娇|身段|身姿|脸|眉|眼|眸|发|裙|腰|腿|臀|玉|丰|貌|美|唇|颈|肩|高挑|娇小|玲珑|婀娜|身材|气质|窈窕|性[格子情]|脾[气性]|为人|秉性|天真|单纯|狡|阴|腹黑|心机|城府|温[和柔]|暴|刚|胆|果|冷|傲|爽|豪|羞|忠|义|贪|奸|憨|精明|聪|霸道|柔弱|乖|调皮|狠|妒|喘|呻吟|阴|交|合|高潮|床|云雨|抽|湿|敏感|调教|束缚|羞辱|臣服|主奴|蜜|股|吮|舔|爱液|情欲|淫|媚|榻|帐|宠幸|侍寝|双修|采补|受虐|施虐|捆|鞭|裸|胴体|交欢|欢好|缠绵|呜咽|颤|酥|魅|勾引|风流|放荡|贞|年方|年约|芳龄|年纪|加入|跟随|收为|纳为|拜入|投奔|归顺|入伙|结义|结局|归宿|临终|遗言|战死|身亡|殒命|绝技|成名|师承|师从|门下|绝不|逆鳞/;

function parseEnv(t) { return Object.fromEntries(t.split(/\r?\n/).flatMap(l => { const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/); if (!m) return []; let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); return [[m[1], v]]; })); }
function parseJson(t) { const f = String(t).match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]; const c = f || String(t).slice(String(t).indexOf('{'), String(t).lastIndexOf('}') + 1); return JSON.parse(c); }
async function ask(messages, label) {
  const env = existsSync(join(root, '.env')) ? parseEnv(await readFile(join(root, '.env'), 'utf8')) : {};
  const apiKey = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY missing');
  for (let i = 1; i <= 4; i++) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'XianTu Card' }, body: JSON.stringify({ model, temperature: 0, max_tokens: maxTokens, response_format: { type: 'json_object' }, messages }) });
      const b = await r.text(); if (!r.ok) throw new Error(`${r.status}: ${b.slice(0, 200)}`);
      return parseJson(JSON.parse(b).choices?.[0]?.message?.content || '');
    } catch (e) { console.error(`[${label}] ${i}/4 ${e.message}`); await new Promise(s => setTimeout(s, i * 2000)); }
  }
  throw new Error('failed');
}
function load(epub) {
  const dir = mkdtempSync(join(tmpdir(), 'xt-card-')); execFileSync('unzip', ['-o', '-q', join(material, epub), '-d', dir]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(dir, p)).find(p => existsSync(p));
  const files = readdirSync(base).filter(f => /\d+\.x?html?$/i.test(f) && /^(chapter)?\d/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  return files.map(f => { const raw = readFileSync(join(base, f), 'utf8').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' '); const text = raw.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim(); const title = (text.match(/第[0-9〇零一二三四五六七八九十百千两]+[章集][·\s][^\s，。]{0,12}/) || [f.replace(/\.html?$/i, '')])[0]; return { title, text }; });
}
const ROLE_KW = /掌教|帮主|家主|老祖|主角|女主|首领|宗主|教主|城主|庄主|公主|王|帝|将军|太尉|反派|盟友|伴侣|未婚妻|妾|侍奴|徒弟|谋士/;
async function mainChars(bookId) {
  const dir = join(gen, bookId, 'stages'); const cnt = new Map(), role = new Map();
  for (const f of (await readdir(dir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) { const m = JSON.parse(await readFile(join(dir, f), 'utf8')); for (const c of m.canon?.characters || []) { cnt.set(c.name, (cnt.get(c.name) || 0) + 1); if (c.role && !role.get(c.name)) role.set(c.name, c.role); } }
  return [...cnt.keys()].filter(n => cnt.get(n) >= 3 || ROLE_KW.test(role.get(n) || ''));
}
function variants(name) { const inner = [...name.matchAll(/[（(]([^）)]+)[）)]/g)].map(m => m[1].trim()); const bare = name.replace(/[（(][^）)]*[）)]/g, '').trim(); const parts = []; for (const seg of [bare, ...inner]) parts.push(...seg.split(/[·•・]/)); return [...new Set([name, ...parts].map(s => s.trim()).filter(s => s.length >= 2))]; }
function retrieve(name, chapters) {
  const names = variants(name); const inText = s => names.some(v => s.includes(v));
  const hits = [];
  for (const ch of chapters) { if (!inText(ch.text)) continue; const sents = ch.text.split(/(?<=[。！？])|\n|※/).map(s => s.trim()).filter(s => s.length >= 4); const idx = []; sents.forEach((s, i) => { if (inText(s)) idx.push(i); }); const near = i => idx.some(j => Math.abs(j - i) <= 3); sents.forEach((s, i) => { const kc = (s.match(new RegExp(KW, 'g')) || []).length; const named = inText(s); if (!named && !(kc > 0 && near(i))) return; hits.push({ title: ch.title, sent: s, score: (named ? 1 : 0) + 2 * kc }); }); }
  hits.sort((a, b) => b.score - a.score); const picked = []; const seen = new Set(); let bud = budget;
  for (const h of hits) { if (seen.has(h.sent) || bud - h.sent.length < 0) continue; seen.add(h.sent); picked.push(h); bud -= h.sent.length; if (picked.length >= 45) break; }
  return { total: hits.length, picked };
}
function prompt(book, name, picked) {
  return [
    { role: 'system', content: '你是小说人物资料整理助手。以下原文节选出自一部情色小说，仅用于整理角色资料卡（供创作参考），客观临床中性措辞，不渲染不创作。两类字段区别处理：(A)【事实类】年龄/外貌/与主角关系/称呼/加入经过/关键情节/结局/标志武器功法/性癖/身体性特征——必须有明确原文依据，无则留空字符串或空数组，不得臆造；(B)【归纳类】性格/说话风格/人格底线/目标动机/弱点软肋——可基于角色在节选中的言行作合理归纳总结（须有行为支撑，不可凭空捏造），尽量填写不留空。性倾向/性癖好/身体性特征（支配/臣服、施虐/受虐、暴露、敏感部位、初次/经验等）属角色资料，据原文客观登记。' },
    { role: 'user', content: `角色：${name}（《${book.title}》）。仅依据以下原文节选，输出严格 JSON（字段无原文支持则留空字符串或空数组，勿臆造）：
{
 "name":"${name}","gender":"男|女|未知",
 "身份":"门派/职业/出身",
 "年龄":"原文明确写到的年纪，无则空",
 "性格":["性格特征短语"],
 "外貌":"整合成一段外貌描述",
 "说话风格":"口癖/语气特点，如毒舌、文绉绉、爱撒娇",
 "人格底线":["其坚守的原则/逆鳞，如绝不伤孩童"],
 "目标动机":"该角色想要什么、行为驱动",
 "弱点软肋":"性格或处境上的软肋",
 "标志武器功法":["招牌功法/武器/绝技"],
 "与主角关系":"与程宗扬的关系/名分",
 "称呼":"对程宗扬的称呼 / 被他人称呼",
 "加入经过":"仅当其为程宗扬的队伍成员或后宫：第几章因何缘由加入队伍/后宫、地位如何；非成员留空",
 "关键情节":["要点"],
 "结局下场":"原文交代的结局/归宿，无则空",
 "性癖":["客观登记的性倾向/性癖好"],
 "身体性特征":["敏感部位/初次/经验等客观登记"],
 "evidence":["支撑用原文短句，最多4"],"sourceChapters":["章节"]
}

原文节选：
${picked.map(p => `〔${p.title}〕${p.sent}`).join('\n')}` },
  ];
}
async function run() {
  const only = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const namesArg = (process.argv.find(a => a.startsWith('--names=')) || '').replace('--names=', '');
  const explicit = namesArg ? namesArg.split(',').map(s => s.trim()).filter(Boolean) : null;
  const targets = books.filter(b => only.length === 0 || only.includes(b.id));
  await mkdir(join(gen, 'character-canon'), { recursive: true });
  for (const book of targets) {
    const names = explicit || await mainChars(book.id);
    console.error(`[${book.id}] 角色 ${names.length}，加载原文…`);
    const chapters = load(book.epub);
    const results = [];
    for (const name of names) {
      const { total, picked } = retrieve(name, chapters);
      if (!picked.length) { results.push({ name, _hits: 0, 身份: '', 性格: [], 外貌: '', 与主角关系: '', 关键情节: [], 性癖: [] }); console.error(`  ${name}: 0`); continue; }
      try { const out = await ask(prompt(book, name, picked), `${book.id}-${name}`); out._hits = total; results.push(out); console.error(`  ${name}: ${total}句 → 性癖[${(out.性癖 || []).join('、') || '—'}]`); }
      catch (e) { results.push({ name, _hits: total, _error: true }); console.error(`  ${name}: 失败`); }
    }
    const out = join(gen, 'character-canon', `${book.id}.character-cards-v2.json`);
    let characters = results;
    // --names 时合并进已有文件（按 name 替换），避免覆盖整本卡
    if (explicit && existsSync(out)) {
      const prev = JSON.parse(await readFile(out, 'utf8'));
      const byName = new Map((prev.characters || []).map(c => [c.name, c]));
      for (const r of results) byName.set(r.name, r);
      characters = [...byName.values()];
    }
    await writeFile(out, `${JSON.stringify({ book: book.id, note: '原著为情色小说，本卡仅作角色资料整理；忠实原文、无据留空', generatedAt: new Date().toISOString(), characters }, null, 2)}\n`);
    console.error(`[${book.id}] 写入 ${out}（${characters.length}）${explicit ? '[合并]' : ''}`);
  }
}
run().catch(e => { console.error(e); process.exit(1); });
