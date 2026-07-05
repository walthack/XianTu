#!/usr/bin/env node
// BOSS 决战场景深描：抓各 BOSS 战斗最密集的原文窗口（按战斗词密度选窗，非时序前缀），
// 提取决战编排——场地/回合往来/转折点/名台词/胜负，用于加深卡上的战斗描绘。
// M2.7 → 重试 → DeepSeek 兜底；断点续跑。产物 character-canon/boss-finale-scan/{名}.json + REPORT.md
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const outDir = join(gen, 'character-canon/boss-finale-scan');
const material = '/Volumes/botsvault/06_material';
const BOOKS = { qingyu: 'A-六朝清羽记.epub', yunlong: 'B- 六朝云龙吟.epub', yange: 'C-六朝燕歌行.epub' };

const BOSSES = ['鬼巫王', '剑玉姬', '西门庆', '焚无尘', '古格尔', '阿伽门侬', '吕冀', '仇士良', '李辅国', '释特昧普', '米远志', '八臂魔僧', '徐敖', '窥基'];
const BATTLE_RE = /刀|剑|掌|拳|枪|矛|箭|轰|喝|杀|血|斩|劈|刺|震|爆|真气|内力|招|阵|吼|扑|格挡|反击/g;

const registry = JSON.parse(readFileSync(join(root, 'src/modules/scenarioMods/builtins/character-registry.json'), 'utf8'));
const entryOf = new Map(registry.characters.map(c => [c.canonicalName, c]));

const envText = existsSync(join(root, '.env')) ? readFileSync(join(root, '.env'), 'utf8') : '';
const OR_KEY = Object.fromEntries(envText.split(/\r?\n/).flatMap(l => { const m = l.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*)\s*$/); if (!m) return []; let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); return [[m[1], v]]; })).OPENROUTER_API_KEY;

const cache = {};
function chapters(id) {
  if (cache[id]) return cache[id];
  const tmp = mkdtempSync(join(tmpdir(), `xt-fin-${id}-`));
  execFileSync('unzip', ['-o', '-q', join(material, BOOKS[id]), '-d', tmp]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(tmp, p)).find(existsSync);
  return cache[id] = readdirSync(base).filter(f => /\.x?html?$/i.test(f)).sort().map(f => readFileSync(join(base, f), 'utf8').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim());
}
// 战斗密度选窗：name 命中窗口按战斗词计分，取 Top 分值（天然聚焦决战章）
function battleWindows(kws, span = 420, maxPer = 8, budget = 15000) {
  const scored = []; const seen = new Set();
  for (const b of Object.keys(BOOKS)) for (const t of chapters(b)) {
    for (const kw of kws) { let pos = 0, n = 0;
      while (n < maxPer) { const i = t.indexOf(kw, pos); if (i < 0) break; const key = `${b}:${Math.floor(i / 700)}`;
        if (!seen.has(key)) { seen.add(key); const w = t.slice(Math.max(0, i - span), i + kw.length + span);
          scored.push({ w, s: (w.match(BATTLE_RE) || []).length }); n++; } pos = i + kw.length; }
    }
  }
  scored.sort((a, b) => b.s - a.s);
  const sel = []; let used = 0;
  for (const { w } of scored) { if (used + w.length > budget) break; sel.push(w); used += w.length; }
  return sel.join('\n\n');
}
const SYS = '你是小说战斗编排考据员。只依据片段判断，每一项带≤50字原文短证；片段没有的写"原文未见"。严格输出 JSON。';
const userPrompt = (name, identity, ev) => `人物「${name}」（${identity}）。考据其**最重要的一场（或几场）决战**的编排：
- battles: 数组，每场 {对阵:"与谁在何地", 回合:[{拍:"一句概括该回合攻防",证:"原文短证"}](3-6拍,按序), 转折:"胜负手/意外", 名台词:"战斗中原话(有则引)", 结果:"胜负与伤亡"}
- fightStyle: 一句总括其战斗风格（供叙事复刻："他打起来是什么样子"）
输出 JSON：{"battles":[],"fightStyle":""}

片段：
${ev || '（未命中）'}`;

function askMiniMax(user) {
  const mf = join(outDir, '_fin.messages.json');
  writeFileSync(mf, JSON.stringify([{ role: 'system', content: SYS }, { role: 'user', content: user }]));
  const out = execFileSync('mmx', ['text', 'chat', '--messages-file', mf, '--model', 'MiniMax-M2.7', '--temperature', '0.1', '--max-tokens', '3000', '--non-interactive', '--quiet', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  try { const o = JSON.parse(out); return o?.choices?.[0]?.message?.content || o?.output || out; } catch { return out; }
}
async function askDeepSeek(user) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${OR_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'deepseek/deepseek-v4-flash', temperature: 0.1, max_tokens: 3000, messages: [{ role: 'system', content: SYS }, { role: 'user', content: user }] }) });
  if (!r.ok) throw new Error(`OR ${r.status}`);
  return JSON.parse(await r.text()).choices?.[0]?.message?.content || '';
}
const parse = t => { try { const j = String(t).match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || String(t).slice(String(t).indexOf('{'), String(t).lastIndexOf('}') + 1); return JSON.parse(j); } catch { return null; } };

async function run() {
  mkdirSync(outDir, { recursive: true });
  const summary = [];
  for (const name of BOSSES) {
    const dst = join(outDir, `${name}.json`);
    if (existsSync(dst)) { summary.push(JSON.parse(readFileSync(dst, 'utf8'))); continue; }
    const entry = entryOf.get(name);
    const kws = [name, ...((entry?.aliases) || [])].filter(a => a && a.length >= 2 && !/[（(]/.test(a)).slice(0, 4);
    const identity = String(entry?.staticProfile?.identitySummary || '').slice(0, 60);
    const ev = battleWindows(kws);
    const user = userPrompt(name, identity, ev);
    let r = parse(askMiniMax(user));
    if (!r || !Array.isArray(r.battles)) r = parse(askMiniMax(user));
    if ((!r || !Array.isArray(r.battles)) && OR_KEY) { try { r = parse(await askDeepSeek(user)); if (r) r._fallback = 'deepseek'; } catch { /* keep */ } }
    if (!r) { console.error(`⚠ ${name} 失败`); continue; }
    r.name = name;
    writeFileSync(dst, JSON.stringify(r, null, 2) + '\n');
    summary.push(r);
    console.error(`${name}: ${(r.battles || []).length}场 | ${String(r.fightStyle || '').slice(0, 40)}`);
  }
  const md = ['# BOSS 决战场景深描（供加深战斗描绘落卡）', ''];
  for (const r of summary) {
    md.push(`## ${r.name}`, `**战斗风格：** ${r.fightStyle || '?'}`);
    for (const b of r.battles || []) {
      md.push(`### ${b.对阵 || '?'}`);
      for (const rd of b.回合 || []) md.push(`- ${rd.拍}｜${String(rd.证 || '').slice(0, 46)}`);
      if (b.转折) md.push(`- **转折**：${b.转折}`);
      if (b.名台词) md.push(`- **台词**：${b.名台词}`);
      if (b.结果) md.push(`- **结果**：${b.结果}`);
    }
    md.push('');
  }
  writeFileSync(join(outDir, 'REPORT.md'), md.join('\n'));
  console.error(`完成 ${summary.length}/${BOSSES.length} → ${outDir}/REPORT.md`);
}
run().catch(e => { console.error(e); process.exit(1); });
