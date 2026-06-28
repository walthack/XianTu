#!/usr/bin/env node

// 重生成 66 主要角色的 character.description（小说化简介）。动机：旧 blurb 会给人设加暗黑滤镜
// （如把天真的乐明珠写成淬毒腹黑）。这次喂【已修正的 personality + appearance + role + 约束】，
// 要求 DeepSeek 忠实这些既定设定、不另加未提及的阴暗/反差，生成 1-2 句小说化简介。
// 产 character-canon/character-descriptions.json（仅更新这 66，键=id），并投影进各关 character.description（覆盖）。
// 备份 stages-pre-descv2-backup。Usage: node scripts/regenerate-main-descriptions.mjs [--dry-run] [--apply-only]

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile, cp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canon = join(gen, 'character-canon');
const model = process.env.XIANTU_DESC_MODEL || 'deepseek/deepseek-v4-flash';
const books = ['qingyu', 'yunlong', 'yange'];
const dryRun = process.argv.includes('--dry-run');
const applyOnly = process.argv.includes('--apply-only');

function parseEnv(t) { return Object.fromEntries(t.split(/\r?\n/).flatMap(l => { const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/); if (!m) return []; let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); return [[m[1], v]]; })); }
function parseJson(t) { const f = String(t).match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]; const c = f || String(t).slice(String(t).indexOf('{'), String(t).lastIndexOf('}') + 1); return JSON.parse(c); }
async function ask(messages, label) {
  const env = existsSync(join(root, '.env')) ? parseEnv(await readFile(join(root, '.env'), 'utf8')) : {};
  const apiKey = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY missing');
  for (let i = 1; i <= 4; i++) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'XianTu Desc' }, body: JSON.stringify({ model, temperature: 0.4, max_tokens: 800, response_format: { type: 'json_object' }, messages }) });
      const b = await r.text(); if (!r.ok) throw new Error(`${r.status}: ${b.slice(0, 200)}`);
      return parseJson(JSON.parse(b).choices?.[0]?.message?.content || '');
    } catch (e) { console.error(`[${label}] ${i}/4 ${e.message}`); await new Promise(s => setTimeout(s, i * 2000)); }
  }
  throw new Error('failed');
}

async function gatherProfiles() {
  // name -> { id, role, appearance(best), notes[], gender }
  const byName = new Map();
  for (const b of books) {
    const dir = join(gen, b, 'stages');
    for (const f of (await readdir(dir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
      const m = JSON.parse(await readFile(join(dir, f), 'utf8'));
      for (const c of m.canon?.characters || []) {
        const e = byName.get(c.name) || { name: c.name, id: c.id, role: '', appearance: '', notes: [], gender: '' };
        e.id = c.id;
        if ((c.role || '').length > e.role.length) e.role = c.role || '';
        const app = c.profile?.appearance || '';
        if (app.length > e.appearance.length && !/原文未|未载|未知/.test(app)) e.appearance = app;
        for (const n of c.profile?.notes || []) if (!e.notes.includes(n)) e.notes.push(n);
        const g = c.gender || c.profile?.gender; if (g && !e.gender) e.gender = g;
        byName.set(c.name, e);
      }
    }
  }
  return byName;
}

async function generate() {
  const cons = JSON.parse(await readFile(join(canon, 'personality-consolidated.json'), 'utf8'));
  const namesArg = (process.argv.find(a => a.startsWith('--names=')) || '').replace('--names=', '');
  const only = namesArg ? new Set(namesArg.split(',').map(s => s.trim())) : null;
  const mains = cons.characters.filter(c => (c.personality || []).length && (!only || only.has(c.name)));
  const profiles = await gatherProfiles();
  const existing = existsSync(join(canon, 'character-descriptions.json')) ? JSON.parse(await readFile(join(canon, 'character-descriptions.json'), 'utf8')) : {};
  let done = 0;
  for (const c of mains) {
    const p = profiles.get(c.name);
    if (!p) { console.error(`  ${c.name}: 无 profile，跳过`); continue; }
    const msg = [
      { role: 'system', content: '你是仙侠小说角色简介撰写助手。依据给定的【性格/外貌/身份/约束】撰写 1-2 句中文小说化简介。铁律：(1)以【性格与身份】为主轴，外貌至多一笔点缀，不得堆砌身体/胸臀等描写；(2)忠实既定设定，不得添加设定里没有的反差、阴暗面或秘密（例如不得给天真单纯的角色硬加“暗藏杀机”）；(3)语气与性格一致。只输出 JSON。' },
      { role: 'user', content: `为角色「${c.name}」写简介，输出 {"description":"..."}。
性格（须忠实）：${c.personality.join('、')}
身份：${p.role || '原作人物'}
性别：${p.gender || '未知'}
外貌：${p.appearance || '（略）'}
${p.notes.length ? `约束/设定：${p.notes.join('；')}` : ''}` },
    ];
    try {
      const out = await ask(msg, c.name);
      if (out.description) { existing[p.id] = out.description; done++; console.error(`  ${c.name} ✓ ${out.description.slice(0, 40)}…`); }
    } catch (e) { console.error(`  ${c.name}: 失败 ${e.message}`); }
  }
  if (!dryRun) await writeFile(join(canon, 'character-descriptions.json'), `${JSON.stringify(existing, null, 2)}\n`);
  console.error(`生成 ${done}/${mains.length} 条 → character-descriptions.json`);
  return existing;
}

async function apply() {
  const desc = JSON.parse(await readFile(join(canon, 'character-descriptions.json'), 'utf8'));
  let total = 0;
  for (const b of books) {
    const dir = join(gen, b, 'stages');
    if (!dryRun) { const bk = join(gen, b, 'stages-pre-descv2-backup'); if (existsSync(bk)) await rm(bk, { recursive: true }); await cp(dir, bk, { recursive: true }); }
    for (const f of (await readdir(dir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
      const m = JSON.parse(await readFile(join(dir, f), 'utf8'));
      let changed = false;
      for (const c of m.canon?.characters || []) {
        const d = desc[c.id];
        if (d && c.description !== d) { c.description = d; changed = true; total++; }
      }
      if (changed && !dryRun) await writeFile(join(dir, f), `${JSON.stringify(m, null, 2)}\n`);
    }
  }
  console.error(`投影 description ${total} 处${dryRun ? ' [DRY]' : '（备份 stages-pre-descv2-backup）'}`);
}

async function run() { if (!applyOnly) await generate(); await apply(); }
run().catch(e => { console.error(e); process.exit(1); });
