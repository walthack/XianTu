#!/usr/bin/env node
// 阶段身份二审：对 MiniMax-v3 audit 标出的 11 个女角，核实「转折点」——原文里她们从原阵营/中立
// 转为程宗扬后宫/奴婢的事件与章节，以及转折前的正确身份。目的：判断早期 stage 是否泄漏未来身份。
// M2.7 → 重试 → DeepSeek 三级兜底。产物 character-canon/phase-identity-review/{名}.json + REVIEW.md
// 仅产出 review，不改正典（人工审批后再落）。用法：node scripts/verify-phase-identity.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const outDir = join(gen, 'character-canon/phase-identity-review');
const material = '/Volumes/botsvault/06_material';
const BOOKS = { qingyu: 'A-六朝清羽记.epub', yunlong: 'B- 六朝云龙吟.epub', yange: 'C-六朝燕歌行.epub' };

// 每人：名 + 关系关键词（缩小到转折相关语料）
const TARGETS = [
  { name: '阿夕', kws: ['阿夕'] },
  { name: '何漪莲', kws: ['何漪莲', '漪莲'] },
  { name: '黄氏', kws: ['黄氏'] },
  { name: '刘娥', kws: ['刘娥'] },
  { name: '潘金莲', kws: ['潘金莲', '金莲'] },
  { name: '萧氏', kws: ['萧氏'] },
  { name: '雁儿', kws: ['雁儿'] },
  { name: '虞白樱', kws: ['虞白樱', '白樱'] },
  { name: '云丹琉', kws: ['云丹琉', '丹琉'] },
  { name: '赵合德', kws: ['赵合德', '合德'] },
  { name: '林娘子', kws: ['林娘子'] },
];

const envText = existsSync(join(root, '.env')) ? readFileSync(join(root, '.env'), 'utf8') : '';
const OR_KEY = Object.fromEntries(envText.split(/\r?\n/).flatMap(l => { const m = l.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*)\s*$/); if (!m) return []; let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); return [[m[1], v]]; })).OPENROUTER_API_KEY;

const cache = {};
function chaptered(id) {
  if (cache[id]) return cache[id];
  const tmp = mkdtempSync(join(tmpdir(), `xt-phase-${id}-`));
  execFileSync('unzip', ['-o', '-q', join(material, BOOKS[id]), '-d', tmp]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(tmp, p)).find(existsSync);
  const files = readdirSync(base).filter(f => /\.x?html?$/i.test(f)).sort();
  return cache[id] = files.map((f, i) => {
    const raw = readFileSync(join(base, f), 'utf8');
    const title = (raw.match(/第[\d一二三四五六七八九十百]+章[^<]{0,20}/) || [''])[0];
    return { i, title: title.trim(), text: raw.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim() };
  });
}
// 取首次出现 + 均匀分布的窗口（转折可能在中后段）
function windows(kws, span = 300, budget = 12000) {
  const out = [];
  for (const b of Object.keys(BOOKS)) {
    const chs = chaptered(b);
    const marks = [];
    for (const ch of chs) for (const kw of kws) {
      let pos = 0; const i = ch.text.indexOf(kw, pos);
      if (i >= 0) { marks.push({ b, ch, kw }); break; }
    }
    // 均匀采样命中章节
    const step = Math.max(1, Math.ceil(marks.length / 6));
    for (let k = 0; k < marks.length; k += step) {
      const { b, ch, kw } = marks[k]; const i = ch.text.indexOf(kw);
      out.push(`【${b}·${ch.title || '第?章'}】${ch.text.slice(Math.max(0, i - span), i + span)}`);
    }
  }
  let used = 0; const sel = [];
  for (const w of out) { if (used + w.length > budget) break; sel.push(w); used += w.length; }
  return sel.join('\n\n');
}
const SYS = '你是小说人物关系考据员。只依据片段判断，不脑补，不复述露骨细节。严格输出 JSON。';
const userPrompt = (name, ev) => `人物「${name}」。本作特点：不少女角从原阵营/中立身份，经某转折事件后成为主角程宗扬的后宫/奴婢/情人。
据原文片段判断她的阶段身份链：
- preIdentity：转折前身份/阵营（原本是谁、什么立场，≤40字）
- turningPoint：转折事件（是什么事让她转向程宗扬，≤50字）
- turningChapter：转折发生的章节（原文标注的第N章，无法确定填"未明"）
- postIdentity：转折后身份（≤30字）
- isGenuineReversal：是否真反转（原敌对/中立→归顺，true）还是一直就是侍从（false）
- confidence：高|中|低
输出 JSON：{"name":"${name}","preIdentity","turningPoint","turningChapter","postIdentity","isGenuineReversal":true,"confidence":"中"}
只写原文明确支持的。

片段：
${ev || '（未命中）'}`;

function askMiniMax(user) {
  const mf = join(outDir, '_phase.messages.json');
  writeFileSync(mf, JSON.stringify([{ role: 'system', content: SYS }, { role: 'user', content: user }]));
  const out = execFileSync('mmx', ['text', 'chat', '--messages-file', mf, '--model', 'MiniMax-M2.7', '--temperature', '0.1', '--max-tokens', '1600', '--non-interactive', '--quiet', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  try { const o = JSON.parse(out); return o?.choices?.[0]?.message?.content || o?.output || out; } catch { return out; }
}
async function askDeepSeek(user) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${OR_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'deepseek/deepseek-v4-flash', temperature: 0.1, max_tokens: 1600, messages: [{ role: 'system', content: SYS }, { role: 'user', content: user }] }) });
  if (!r.ok) throw new Error(`OR ${r.status}`);
  return JSON.parse(await r.text()).choices?.[0]?.message?.content || '';
}
const parse = t => { try { const j = String(t).match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || String(t).slice(String(t).indexOf('{'), String(t).lastIndexOf('}') + 1); return JSON.parse(j); } catch { return { parse_failed: true, raw: String(t).slice(0, 500) }; } };
const bad = r => r.parse_failed || !r.preIdentity;

async function run() {
  mkdirSync(outDir, { recursive: true });
  const results = [];
  for (const t of TARGETS) {
    const ev = windows(t.kws);
    console.error(`${t.name}: 证据 ${ev.length} 字`);
    const user = userPrompt(t.name, ev);
    let r; try { r = parse(askMiniMax(user)); } catch (e) { r = { parse_failed: true, error: String(e.message).slice(0, 100) }; }
    if (bad(r)) { try { const r2 = parse(askMiniMax(user)); if (!bad(r2)) r = r2; } catch { /* keep */ } }
    if (bad(r) && OR_KEY) { try { const r3 = parse(await askDeepSeek(user)); if (!bad(r3)) r = { ...r3, _fallback: 'deepseek' }; } catch { /* keep */ } }
    r.name = t.name;
    writeFileSync(join(outDir, `${t.name}.json`), JSON.stringify(r, null, 2) + '\n');
    results.push(r);
    console.error(`  → 转折:${r.turningChapter || '?'} / ${r.confidence || '?'}`);
  }
  const md = ['# 阶段身份二审（11 女角转折点核实 · 供人工审批，未落正典）', '',
    '> 核心问题：早期 stage 是否泄漏未来（后宫/奴婢）身份。转折前应标原阵营身份。', '',
    '| 角色 | 转折前身份 | 转折点(章) | 转折后 | 真反转 | 置信 |', '|---|---|---|---|---|---|'];
  for (const r of results) md.push(`| ${r.name} | ${r.preIdentity || '?'} | ${r.turningPoint || '?'}${r.turningChapter && r.turningChapter !== '未明' ? `（${r.turningChapter}）` : ''} | ${r.postIdentity || '?'} | ${r.isGenuineReversal ? '是' : '否'} | ${r.confidence || '?'}${r._fallback ? '(DS)' : ''} |`);
  md.push('', '## 处理建议', '- 真反转=是 且 有转折章：早期 stage 应改标「转折前身份」，转折后 stage 才标后宫/奴婢。', '- 真反转=否：本就是侍从，早期标注无需改。', '- 置信低/转折未明：保留待人工原文复核。');
  writeFileSync(join(outDir, 'REVIEW.md'), md.join('\n'));
  console.error(`完成 → ${outDir}/REVIEW.md`);
}
run().catch(e => { console.error(e); process.exit(1); });
