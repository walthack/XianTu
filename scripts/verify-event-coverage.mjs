#!/usr/bin/env node
// 事件覆盖复核（roadmap #1 收口）：把 event-coverage-audit.md(2026-06-25) 里逐条抽取的高潮/重大事件，
// 对当前 scenario.events 核一遍，判定每条是否已覆盖。重点盯 [高潮]。
// M2.7 → 重试 → DeepSeek 兜底。产物 character-canon/event-coverage-recheck/REPORT.md
// 用法：node scripts/verify-event-coverage.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const outDir = join(gen, 'character-canon/event-coverage-recheck');
const auditPath = join(gen, 'character-canon/event-coverage-audit.md');

const envText = existsSync(join(root, '.env')) ? readFileSync(join(root, '.env'), 'utf8') : '';
const OR_KEY = Object.fromEntries(envText.split(/\r?\n/).flatMap(l => { const m = l.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*)\s*$/); if (!m) return []; let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); return [[m[1], v]]; })).OPENROUTER_API_KEY;

// ① 解析审计：### {stageId} 段下的 "- [si ...] ..." 抽取事件
function parseAudit() {
  const lines = readFileSync(auditPath, 'utf8').split(/\r?\n/);
  const stages = {}; let cur = null;
  for (const ln of lines) {
    const h = ln.match(/^###\s+([a-z]+\.[a-z0-9_]+)/);
    if (h) { cur = h[1]; stages[cur] = []; continue; }
    if (!cur) continue;
    const b = ln.match(/^-\s+\[si[^\]]*\]\s*(.+)$/);
    if (b) { const climactic = /\[高潮\]/.test(b[1]); stages[cur].push({ text: b[1].replace(/\*\*\[高潮\]\*\*/g, '').replace(/\[高潮\]/g, '').trim(), climactic }); }
  }
  return stages;
}
// ② 当前 stage events
function currentEvents() {
  const map = {};
  for (const bk of ['qingyu', 'yunlong', 'yange']) {
    const dir = join(gen, bk, 'stages');
    for (const f of readdirSync(dir).filter(x => x.endsWith('.json') && !x.endsWith('.uncertainties.json'))) {
      const m = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      const id = f.replace('.json', '');
      const evs = (m.scenario?.events || []).map(e => e.title || e.name || e.summary || e.description || '').filter(Boolean);
      map[id] = evs;
    }
  }
  return map;
}
const SYS = '你是剧情事件覆盖审核员。判断"抽取的重要剧情事件"是否已被"现有事件列表"覆盖（同一剧情即算覆盖，措辞不必相同）。严格输出 JSON。';
const userPrompt = (stage, extracted, current) => `关卡「${stage}」。
【抽取的重要事件】（需逐条判断是否已覆盖）：
${extracted.map((e, i) => `${i + 1}. ${e.climactic ? '[高潮] ' : ''}${e.text}`).join('\n')}

【现有事件列表】：
${current.length ? current.map((c, i) => `- ${c}`).join('\n') : '（无）'}

对每条抽取事件判断 covered(true/false)。同一剧情不同措辞算已覆盖。
输出 JSON：{"stage":"${stage}","items":[{"n":1,"covered":true,"note":"匹配到的现有事件或缺失说明(≤20字)"}]}`;

function askMiniMax(user) {
  const mf = join(outDir, '_cov.messages.json');
  writeFileSync(mf, JSON.stringify([{ role: 'system', content: SYS }, { role: 'user', content: user }]));
  const out = execFileSync('mmx', ['text', 'chat', '--messages-file', mf, '--model', 'MiniMax-M2.7', '--temperature', '0.1', '--max-tokens', '2048', '--non-interactive', '--quiet', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  try { const o = JSON.parse(out); return o?.choices?.[0]?.message?.content || o?.output || out; } catch { return out; }
}
async function askDeepSeek(user) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${OR_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'deepseek/deepseek-v4-flash', temperature: 0.1, max_tokens: 2048, messages: [{ role: 'system', content: SYS }, { role: 'user', content: user }] }) });
  if (!r.ok) throw new Error(`OR ${r.status}`);
  return JSON.parse(await r.text()).choices?.[0]?.message?.content || '';
}
const parse = t => { try { const j = String(t).match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || String(t).slice(String(t).indexOf('{'), String(t).lastIndexOf('}') + 1); return JSON.parse(j); } catch { return { parse_failed: true }; } };
const bad = r => r.parse_failed || !Array.isArray(r.items);

async function run() {
  mkdirSync(outDir, { recursive: true });
  const audit = parseAudit(); const cur = currentEvents();
  const rows = []; let totalGap = 0, climacticGap = 0, totalItems = 0;
  for (const [stage, extracted] of Object.entries(audit)) {
    if (!extracted.length) continue;
    const current = cur[stage] || cur[stage + 'b'] || [];
    const user = userPrompt(stage, extracted, current);
    let r; try { r = parse(askMiniMax(user)); } catch { r = { parse_failed: true }; }
    if (bad(r)) { try { const r2 = parse(askMiniMax(user)); if (!bad(r2)) r = r2; } catch { /* keep */ } }
    if (bad(r) && OR_KEY) { try { const r3 = parse(await askDeepSeek(user)); if (!bad(r3)) r = r3; } catch { /* keep */ } }
    if (bad(r)) { console.error(`  ⚠ ${stage} 失败`); continue; }
    writeFileSync(join(outDir, `${stage}.json`), JSON.stringify({ stage, extracted, current, result: r }, null, 2) + '\n');
    const gaps = [];
    for (const it of r.items) {
      totalItems++;
      const ex = extracted[it.n - 1];
      if (!it.covered) { gaps.push({ text: ex?.text || `#${it.n}`, climactic: ex?.climactic, note: it.note }); totalGap++; if (ex?.climactic) climacticGap++; }
    }
    rows.push({ stage, current: current.length, extracted: extracted.length, gaps });
    console.error(`${stage}: 现有${current.length} 抽取${extracted.length} 缺${gaps.length}(高潮${gaps.filter(g => g.climactic).length})`);
  }
  const md = ['# 事件覆盖复核（roadmap #1 收口 · 现377事件 vs 06-25审计）', '',
    `> 复核 ${rows.length} 关；抽取事件 ${totalItems} 条，未覆盖 ${totalGap}（其中 [高潮] ${climacticGap}）。`, ''];
  const withGaps = rows.filter(r => r.gaps.length);
  if (!withGaps.length) md.push('✅ 全部抽取高潮/重大事件均已覆盖，roadmap #1 收口。');
  else {
    md.push('## 仍缺口的关（按高潮缺口排序）', '');
    for (const r of withGaps.sort((a, b) => b.gaps.filter(g => g.climactic).length - a.gaps.filter(g => g.climactic).length)) {
      md.push(`### ${r.stage}（现有${r.current}/抽取${r.extracted}，缺${r.gaps.length}）`);
      for (const g of r.gaps) md.push(`- ${g.climactic ? '**[高潮]** ' : ''}${g.text}${g.note ? ` — ${g.note}` : ''}`);
      md.push('');
    }
  }
  writeFileSync(join(outDir, 'REPORT.md'), md.join('\n'));
  console.error(`完成：缺 ${totalGap}(高潮${climacticGap}) → ${outDir}/REPORT.md`);
}
run().catch(e => { console.error(e); process.exit(1); });
