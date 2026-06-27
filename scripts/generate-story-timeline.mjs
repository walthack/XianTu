#!/usr/bin/env node

// 把三本小说的主要事件整理成一条线性时间线（书序 清羽→云龙→燕歌，书内按 sourceIndex）。
// 事件骨架与排序是确定性的（来自 extraction events[].sourceIndices + 章节标题）；
// DeepSeek 只负责把每条事件 summary 压成一句干净的时间线节点（保人物/地点/因果，去重复，非露骨）。
// 输出 character-canon/story-timeline.md。

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generatedRoot = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const model = process.env.XIANTU_TIMELINE_MODEL || 'deepseek/deepseek-v4-flash';
const chunkSize = Number(process.env.XIANTU_TIMELINE_CHUNK || 35);
const maxTokens = Number(process.env.XIANTU_TIMELINE_MAX_TOKENS || 12000);

const books = [
  { id: 'qingyu', title: '六朝清羽记' },
  { id: 'yunlong', title: '六朝云龙吟' },
  { id: 'yange', title: '六朝燕歌行' },
];

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap(line => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) return [];
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return [[m[1], v]];
  }));
}

function parseJson(text) {
  const fenced = String(text).match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || String(text).slice(String(text).indexOf('{'), String(text).lastIndexOf('}') + 1);
  return JSON.parse(candidate);
}

async function openRouterJson(messages, label) {
  const envPath = join(root, '.env');
  const env = existsSync(envPath) ? parseEnv(await readFile(envPath, 'utf8')) : {};
  const apiKey = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is missing');
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/qianye60/XianTu',
          'X-Title': `XianTu Story Timeline ${label}`,
        },
        body: JSON.stringify({ model, temperature: 0, max_tokens: maxTokens, response_format: { type: 'json_object' }, messages }),
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 800)}`);
      return parseJson(JSON.parse(body).choices?.[0]?.message?.content || '');
    } catch (error) {
      lastError = error;
      console.error(`[${label}] attempt ${attempt}/4 failed: ${error.message}`);
      await new Promise(r => setTimeout(r, attempt * 2000));
    }
  }
  throw lastError;
}

// 收集一本书的主要事件，按首个 sourceIndex 排序，附章节标题。
async function collectEvents(book) {
  const dir = join(generatedRoot, book.id, 'extraction');
  const files = (await readdir(dir)).filter(f => /^batch-\d+\.json$/.test(f)).sort();
  const indexMap = new Map();
  const events = [];
  for (const f of files) {
    const d = JSON.parse(await readFile(join(dir, f), 'utf8'));
    for (const r of d.sourceRange || []) if (!indexMap.has(r.sourceIndex)) indexMap.set(r.sourceIndex, r.heading);
    for (const e of d.events || []) {
      if (!e.isMajor) continue;
      const idx = Math.min(...(e.sourceIndices || [Infinity]));
      events.push({ idx: Number.isFinite(idx) ? idx : 1e9, name: e.name, summary: e.summary, participants: (e.participants || []).slice(0, 6), climax: !!e.isClimax });
    }
  }
  events.sort((a, b) => a.idx - b.idx);
  return { events, heading: idx => indexMap.get(idx) || '' };
}

function prompt(book, slice) {
  return [
    { role: 'system', content: '你是小说剧情梳理助手。把给定的事件按原顺序逐条压成一句话的时间线节点：保留关键人物、地点、因果转折；合并明显重复；涉及亲密情节只用非露骨措辞概括对剧情/关系的影响。不得新增或臆造事件，不得改变顺序。' },
    { role: 'user', content: `《${book.title}》事件片段（已按时间排序，i 为序号，不得改动顺序或丢条目）。逐条输出 JSON：
{"beats":[{"i":0,"beat":"一句话时间线节点"}]}
每个输入 i 必须且只对应一个输出 i。

INPUT:
${JSON.stringify(slice.map((e, i) => ({ i, name: e.name, summary: e.summary, who: e.participants })))}` },
  ];
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function run() {
  await mkdir(join(generatedRoot, 'character-canon'), { recursive: true });
  const lines = ['# 仙途 · 六朝三部曲线性时间线', '', '> 书序：六朝清羽记 → 六朝云龙吟 → 六朝燕歌行。事件顺序与章节出处为确定性回溯，节点文字由 DeepSeek 压缩。★=高潮事件。', ''];
  for (const book of books) {
    const { events, heading } = await collectEvents(book);
    console.error(`[${book.id}] 主要事件 ${events.length} → ${Math.ceil(events.length / chunkSize)} 块`);
    const beats = new Array(events.length).fill(null);
    const groups = chunk(events.map((e, gi) => ({ ...e, gi })), chunkSize);
    let done = 0;
    for (let c = 0; c < groups.length; c += 1) {
      const out = await openRouterJson(prompt(book, groups[c]), `${book.id}-c${c + 1}`);
      for (const b of out.beats || []) {
        const e = groups[c][b.i];
        if (e && b.beat) beats[e.gi] = b.beat;
      }
      done += 1;
      console.error(`  ${book.id} 块 ${done}/${groups.length}`);
    }
    lines.push(`## 《${book.title}》`, '');
    let lastHeading = '';
    events.forEach((e, i) => {
      const h = heading(e.idx);
      if (h && h !== lastHeading) { lines.push(`### ${h}`); lastHeading = h; }
      const beat = beats[i] || e.summary || e.name;
      lines.push(`- ${e.climax ? '★ ' : ''}${beat}`);
    });
    lines.push('');
    // 每本完成即落盘，长任务中途失败不致全丢。
    await writeFile(join(generatedRoot, 'character-canon', 'story-timeline.md'), `${lines.join('\n')}\n`);
    console.error(`[${book.id}] 已写入部分时间线`);
  }
  console.error('时间线全部完成。');
}

run().catch(err => { console.error(err); process.exit(1); });
