#!/usr/bin/env node

// 抽取“约束型设定”：角色因功法/血脉/体质/誓约/门规而对身体状态或亲密/关系行为产生的硬性限制，
// 以及破坏该限制的后果。只读 extraction 的结构化证据(relationships.evidence / contentFacts.fact /
// events.summary)，不读原文，不改任何 mod。输出 character-canon/<book>.character-constraints-draft.json。

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sourceRoot = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const outputRoot = join(sourceRoot, 'character-canon');
const model = process.env.XIANTU_CONSTRAINTS_MODEL || 'deepseek/deepseek-v4-flash';
const groupSize = Number(process.env.XIANTU_CONSTRAINTS_GROUP_SIZE || 6);
const maxTokens = Number(process.env.XIANTU_CONSTRAINTS_MAX_TOKENS || 12000);

const books = [
  { id: 'qingyu', title: '六朝清羽记' },
  { id: 'yunlong', title: '六朝云龙吟' },
  { id: 'yange', title: '六朝燕歌行' },
];

function parseArgs() {
  const raw = process.argv.slice(2);
  const picked = new Set(raw.filter(a => !a.startsWith('--')));
  return { books: books.filter(b => picked.size === 0 || picked.has(b.id)) };
}

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
          'X-Title': `XianTu Character Constraints ${label}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
          messages,
        }),
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 800)}`);
      const content = JSON.parse(body).choices?.[0]?.message?.content || '';
      return parseJson(content);
    } catch (error) {
      lastError = error;
      console.error(`[${label}] attempt ${attempt}/4 failed: ${error.message}`);
      await new Promise(r => setTimeout(r, attempt * 2000));
    }
  }
  throw lastError;
}

// 把所有 batch 聚合成 per-character 证据包；只保留确有自由文本证据的角色。
async function aggregate(bookId) {
  const dir = join(sourceRoot, bookId, 'extraction');
  const files = (await readdir(dir)).filter(f => /^batch-\d+\.json$/.test(f)).sort();
  const byName = new Map();
  // roster = 出现在 characterStates 里的真实角色名；据此把 contentFacts 里的势力/物品 holder 排除。
  const roster = new Set();
  const ensure = name => {
    if (!byName.has(name)) byName.set(name, { name, role: '', affiliations: new Set(), abilities: new Set(), relationships: [], facts: [], events: new Set() });
    return byName.get(name);
  };
  for (const f of files) {
    const d = JSON.parse(await readFile(join(dir, f), 'utf8'));
    for (const c of d.characterStates || []) if (c.name) roster.add(c.name);
  }
  for (const f of files) {
    const d = JSON.parse(await readFile(join(dir, f), 'utf8'));
    for (const c of d.characterStates || []) {
      if (!c.name) continue;
      const a = ensure(c.name);
      if (c.role && !a.role) a.role = c.role;
      for (const x of c.affiliations || []) a.affiliations.add(x);
      for (const x of c.abilitiesHeld || []) a.abilities.add(x);
      for (const r of c.relationships || []) {
        if (r.evidence || r.relation) a.relationships.push({ other: r.other, relation: r.relation, evidence: r.evidence });
      }
    }
    for (const cf of d.contentFacts || []) {
      if (!cf.fact) continue;
      for (const h of cf.holders || []) if (roster.has(h)) ensure(h).facts.push({ name: cf.name, kind: cf.kind, fact: cf.fact });
    }
    for (const e of d.events || []) {
      if (!e.summary) continue;
      for (const p of e.participants || []) {
        if (byName.has(p)) byName.get(p).events.add(e.summary);
      }
    }
  }
  // 仅保留携带 evidence 或 fact 的角色（约束一定有文本痕迹）。
  return [...byName.values()]
    .filter(c => c.relationships.some(r => r.evidence) || c.facts.length)
    .map(c => ({
      name: c.name,
      role: c.role,
      affiliations: [...c.affiliations],
      abilities: [...c.abilities],
      relationships: c.relationships,
      facts: c.facts,
      events: [...c.events].slice(0, 8),
    }));
}

function prompt(book, group) {
  return [
    {
      role: 'system',
      content: '你是修仙小说设定分析助手。你的任务是从已抽取的结构化证据中，识别“约束型设定”：角色因其功法、血脉、体质、誓约或门规，而对自身身体状态或亲密/关系行为产生的硬性限制，以及破坏该限制会导致的后果。只依据输入证据，不臆造；没有约束的角色不要输出。涉及亲密情节时，只用非露骨的规则化措辞描述约束本身（例如“本门功法要求保持处子之身”），不要复述露骨情节。',
    },
    {
      role: 'user',
      content: `《${book.title}》角色证据如下。请抽取约束型设定。

输出严格 JSON：
{
  "book": "${book.id}",
  "characters": [{
    "name": "姓名",
    "constraints": [{
      "category": "功法约束|血脉约束|体质约束|誓约约束|门规约束",
      "rule": "非露骨的规则化描述",
      "consequence": "破坏约束的后果，未知则留空",
      "evidence": "支撑此约束的输入证据短句"
    }]
  }]
}

只输出确有证据支撑约束的角色；其余一律不出现在 characters 中。

INPUT:
${JSON.stringify(group)}`,
    },
  ];
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function run() {
  const { books: targets } = parseArgs();
  await mkdir(outputRoot, { recursive: true });
  for (const book of targets) {
    const chars = await aggregate(book.id);
    const groups = chunk(chars, groupSize);
    console.error(`[${book.id}] ${chars.length} 个候选角色 → ${groups.length} 组`);
    const results = [];
    for (let i = 0; i < groups.length; i += 1) {
      const label = `${book.id}-g${i + 1}`;
      const out = await openRouterJson(prompt(book, groups[i]), label);
      for (const c of out.characters || []) {
        if (c.constraints?.length) results.push(c);
      }
      console.error(`  ${label}: +${(out.characters || []).filter(c => c.constraints?.length).length} 个有约束角色`);
    }
    const outPath = join(outputRoot, `${book.id}.character-constraints-draft.json`);
    await writeFile(outPath, `${JSON.stringify({ book: book.id, generatedAt: new Date().toISOString(), characters: results }, null, 2)}\n`);
    console.error(`[${book.id}] 写入 ${outPath}（${results.length} 个角色有约束）`);
  }
}

run().catch(err => { console.error(err); process.exit(1); });
