#!/usr/bin/env node

// DeepSeek 二审角色卡：对照 epub 原文找偏差，只产报告，不改正典。
// Usage:
//   node scripts/review-character-cards-with-deepseek.mjs
//   node scripts/review-character-cards-with-deepseek.mjs --limit=3 --only=凝羽,乐明珠

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canonDir = join(gen, 'character-canon');
const material = '/Volumes/botsvault/06_material';
const model = process.env.XIANTU_CARD_REVIEW_MODEL || 'deepseek/deepseek-v4-flash';
const maxTokens = Number(process.env.XIANTU_CARD_REVIEW_MAX_TOKENS || 2500);
const evidenceBudget = Number(process.env.XIANTU_CARD_REVIEW_EVIDENCE_BUDGET || 10000);
const sensitiveRe = /性癖|阴|阳具|肉棒|龟头|乳|胸|臀|肛|后庭|性交|交合|破身|处女膜|淫|性奴|口交|射精|精液|阴户|阴道|肉穴|勃起|高潮|裸体|玉体|私处|下体|肉体|双飞|侍奉|床|媚肉|欲|春宫|采补|性事|房事|合欢|奸|裸|私密|三围/;

const books = [
  { id: 'qingyu', title: '六朝清羽记', epub: 'A-六朝清羽记.epub', cards: 'qingyu.character-cards-v2.json' },
  { id: 'yunlong', title: '六朝云龙吟', epub: 'B- 六朝云龙吟.epub', cards: 'yunlong.character-cards-v2.json' },
  { id: 'yange', title: '六朝燕歌行', epub: 'C-六朝燕歌行.epub', cards: 'yange.character-cards-v2.json' },
];

const defaultTargets = [
  '凝羽', '小紫', '苏妲己', '乐明珠', '潘金莲', '吕雉', '杨玉环', '赵飞燕', '赵合德',
  '卓云君', '阮香凝', '黎锦香', '蛇夫人', '惊理', '泉玉姬', '剑玉姬', '齐羽仙',
  '程宗扬', '殇侯', '殇振羽', '秦桧', '武二郎', '谢艺', '秦翰', '一世不拾大师', '古冥隐',
];

function arg(name) {
  const item = process.argv.slice(2).find(v => v === `--${name}` || v.startsWith(`--${name}=`));
  if (!item) return '';
  return item.includes('=') ? item.slice(item.indexOf('=') + 1) : '1';
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
  const source = String(text || '');
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || source.slice(source.indexOf('{'), source.lastIndexOf('}') + 1);
  if (!candidate.trim()) throw new Error(`empty JSON content: ${source.slice(0, 120)}`);
  return JSON.parse(candidate);
}

async function openRouterJson(messages, label) {
  const envPath = join(root, '.env');
  const env = existsSync(envPath) ? parseEnv(await readFile(envPath, 'utf8')) : {};
  const apiKey = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY missing');
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const useJsonMode = attempt <= 2;
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/qianye60/XianTu',
          'X-Title': 'XianTu Character Canon Review',
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: maxTokens,
          ...(useJsonMode ? { response_format: { type: 'json_object' } } : {}),
          messages,
        }),
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 600)}`);
      return parseJson(JSON.parse(body).choices?.[0]?.message?.content || '');
    } catch (error) {
      lastError = error;
      console.error(`[${label}] attempt ${attempt}/4 failed: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, attempt * 2000));
    }
  }
  throw lastError;
}

function cleanHtml(raw) {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadBook(book) {
  const dir = mkdtempSync(join(tmpdir(), `xt-review-${book.id}-`));
  execFileSync('unzip', ['-o', '-q', join(material, book.epub), '-d', dir]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(dir, p)).find(p => existsSync(p));
  if (!base) throw new Error(`找不到章节目录: ${book.epub}`);
  return readdirSync(base)
    .filter(f => /\.x?html?$/i.test(f))
    .sort((a, b) => Number(a.match(/\d+/)?.[0] || 0) - Number(b.match(/\d+/)?.[0] || 0))
    .map(file => {
      const text = cleanHtml(readFileSync(join(base, file), 'utf8'));
      const title = text.match(/第[0-9〇零一二三四五六七八九十百千两]+[章集][·\s、，：:.-]*[^\s。！？]{0,16}/)?.[0] || file.replace(/\.x?html?$/i, '');
      return { book: book.id, title, file, text };
    });
}

function variantsOf(name) {
  const bare = name.replace(/[（(][^）)]*[）)]/g, '').trim();
  const inner = [...name.matchAll(/[（(]([^）)]+)[）)]/g)].flatMap(m => m[1].split(/[·•・/、]/).map(s => s.trim()));
  return [...new Set([name, bare, ...inner].filter(v => v && v.length >= 2))];
}

function findEvidence(name, chapters) {
  const variants = variantsOf(name);
  const hit = s => variants.some(v => s.includes(v));
  const chunks = [];
  for (const ch of chapters) {
    let index = ch.text.indexOf(variants.find(v => ch.text.includes(v)) || '\u0000');
    let count = 0;
    while (index >= 0 && count < 8) {
      const start = Math.max(0, index - 420);
      const end = Math.min(ch.text.length, index + 680);
      const text = ch.text.slice(start, end).replace(/\s+/g, ' ').trim();
      if (sensitiveRe.test(text)) {
        count += 1;
        const nextStart = index + 1;
        const nextIndexes = variants.map(v => ch.text.indexOf(v, nextStart)).filter(i => i >= 0);
        index = nextIndexes.length ? Math.min(...nextIndexes) : -1;
        continue;
      }
      chunks.push({
        book: ch.book,
        title: ch.title,
        text,
      });
      count += 1;
      const nextStart = index + 1;
      const nextIndexes = variants.map(v => ch.text.indexOf(v, nextStart)).filter(i => i >= 0);
      index = nextIndexes.length ? Math.min(...nextIndexes) : -1;
    }
  }
  const scored = chunks.map(item => {
    const density = variants.reduce((n, v) => n + (item.text.match(new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 0);
    const reviewSignal = /性格|为人|身份|本名|原名|又名|称|关系|结局|身死|死|容貌|外貌|美|丑|处女|破身|好色|主人|侍奴|妻|妾|道侣|师|徒|男|女/.test(item.text) ? 3 : 0;
    return { ...item, score: density + reviewSignal };
  }).sort((a, b) => b.score - a.score);
  const selected = [];
  let used = 0;
  const seen = new Set();
  for (const item of scored) {
    const key = `${item.book}:${item.title}:${item.text.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const line = `【${item.book}/${item.title}】${item.text}`;
    if (used + line.length > evidenceBudget) break;
    selected.push(line);
    used += line.length;
    if (selected.length >= 12) break;
  }
  return selected;
}

function scoreCard(card) {
  return Object.values(card).filter(v => {
    if (Array.isArray(v)) return v.length > 0;
    return v !== undefined && v !== null && v !== '';
  }).length + (card._manual ? 20 : 0) + (card._approved ? 10 : 0) + (card._reviewed ? 5 : 0);
}

async function loadCards() {
  const byName = new Map();
  for (const book of books) {
    const file = join(canonDir, book.cards);
    const data = JSON.parse(await readFile(file, 'utf8'));
    for (const card of data.characters || []) {
      const entries = byName.get(card.name) || [];
      entries.push({ book: book.id, card, score: scoreCard(card) });
      byName.set(card.name, entries);
    }
  }
  const order = new Map(books.map((book, index) => [book.id, index]));
  for (const [name, entries] of byName) {
    byName.set(name, entries.sort((a, b) => (order.get(a.book) ?? 99) - (order.get(b.book) ?? 99)));
  }
  return byName;
}

function summarizeCard(card) {
  const fields = ['name', 'gender', '身份', '年龄', '性格', '外貌', '说话风格', '人格底线', '目标动机', '弱点软肋', '与主角关系', '称呼', '加入经过', '关键情节', '结局下场', '备注', '种族'];
  const out = {};
  for (const key of fields) {
    if (card[key] === undefined || card[key] === '' || (Array.isArray(card[key]) && !card[key].length)) continue;
    if (Array.isArray(card[key])) {
      const values = card[key].map(value => String(value)).filter(value => !sensitiveRe.test(value));
      if (values.length) out[key] = values;
    } else if (!sensitiveRe.test(String(card[key]))) {
      out[key] = card[key];
    }
  }
  return out;
}

function renderResult(name, sourceBooks, result) {
  const issues = Array.isArray(result.issues) ? result.issues : [];
  const severity = result.severity || (issues.length ? '待确认' : '无明显问题');
  const lines = [`## ${name}`, `- 角色卡来源：${sourceBooks.join('、')}`, `- 结论：${severity}`, `- 总结：${result.summary || ''}`, ''];
  if (!issues.length) {
    lines.push('- 未发现明确偏差。', '');
    return lines;
  }
  lines.push('| 角色 | 卡里写的 | 原文实际 | 偏差类型 | 短证据 | 建议处理 |');
  lines.push('|---|---|---|---|---|---|');
  for (const issue of issues) {
    const row = [
      name,
      issue.card || '',
      issue.source || '',
      issue.type || '',
      issue.evidence || '',
      issue.suggestion || '',
    ].map(v => String(v).replace(/\|/g, '/').replace(/\s+/g, ' ').trim());
    lines.push(`| ${row.join(' | ')} |`);
  }
  lines.push('');
  return lines;
}

async function run() {
  await mkdir(join(canonDir, '_logs'), { recursive: true });
  const only = arg('only');
  const limit = Number(arg('limit') || 0);
  const targetList = only ? only.split(/[,，]/).map(s => s.trim()).filter(Boolean) : defaultTargets;
  const targets = limit > 0 ? targetList.slice(0, limit) : targetList;
  console.error(`[start] targets=${targets.length}${only ? ' (explicit)' : ''}${limit ? ` limit=${limit}` : ''}`);
  const outPath = join(canonDir, '角色二审报告.deepseek.md');
  const jsonlPath = join(canonDir, '_logs', 'character-card-review.deepseek.jsonl');
  const cards = await loadCards();
  const allChapters = books.flatMap(book => loadBook(book));
  const header = [
    '# 角色卡二审报告（DeepSeek 对照原文）',
    '',
    `> 生成时间：${new Date().toISOString()}`,
    '> 范围：只报告偏差，不自动修改角色卡或 mod。',
    '> 注意：本报告仅用于虚构小说人物正典审校；敏感字段已从模型输入中排除，另由人工核验。',
    '',
  ];
  await writeFile(outPath, `${header.join('\n')}\n`);
  await writeFile(jsonlPath, '');
  const allRendered = [...header];
  const topIssues = [];
  for (const name of targets) {
    const entries = cards.get(name) || (name === '殇侯' ? cards.get('殇振羽') : null);
    if (!entries?.length) {
      const missing = [`## ${name}`, '- 未找到对应角色卡。', ''];
      allRendered.push(...missing);
      await writeFile(outPath, `${allRendered.join('\n')}\n`);
      continue;
    }
    const reviewName = name === '殇侯' && entries.some(entry => entry.card.name === '殇振羽') ? '殇侯' : name;
    const evidence = findEvidence(reviewName, allChapters);
    const sourceBooks = entries.map(entry => entry.book);
    const sourceCards = entries.map(entry => ({
      book: entry.book,
      score: entry.score,
      card: summarizeCard(entry.card),
    }));
    let result;
    try {
      result = await openRouterJson([
        {
          role: 'system',
          content: [
            '你是小说角色正典二审员。只依据给定角色卡与原文证据，找出角色卡相对原文的偏差。',
            '任务背景：所有材料均为虚构小说人物设定，用途是文学/游戏改编的角色一致性审校，不涉及现实人物、现实行为指导或情色创作。',
            '同一角色可能跨多部小说出现；请按同一角色名聚合判断，并在发现不同来源角色卡互相冲突时指出来源差异。',
            '不要改写角色卡，不要补写剧情。若证据不足，输出不确定。',
            '偏差类型可用：臆造、张冠李戴、性别/身份错、关系错、外貌错、性格错、结局错、证据不足。',
            '敏感字段已从输入中排除，不需要审计。',
            '输出严格 JSON：{"severity":"无明显问题|轻微|中等|严重|待确认","summary":"一句话","issues":[{"card":"卡里写的","source":"原文实际","type":"偏差类型","evidence":"原文短证据，不超过40字","suggestion":"建议处理"}],"topIssue":"最严重问题一句话或空"}',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            `角色：${name}`,
            `角色卡来源（按小说顺序）：${sourceBooks.join('、')}`,
            `多来源角色卡 JSON：${JSON.stringify(sourceCards, null, 2)}`,
            '',
            `原文证据窗口：\n${evidence.length ? evidence.join('\n\n') : '未检索到该角色名附近原文。'}`,
          ].join('\n'),
        },
      ], name);
    } catch (error) {
      result = {
        severity: '待确认',
        summary: `DeepSeek 未完成该角色审计：${error.message}`,
        issues: [{
          card: '该角色卡',
          source: '模型拒答或返回空 JSON',
          type: '模型未完成',
          evidence: '',
          suggestion: '后续用人工/更窄字段/更严格脱敏重跑该角色',
        }],
        topIssue: `DeepSeek 未完成 ${name} 审计`,
      };
      console.error(`[skip] ${name}: ${error.message}`);
    }
    const rendered = renderResult(name, sourceBooks, result);
    allRendered.push(...rendered);
    if (result.topIssue) topIssues.push({ name, issue: result.topIssue, severity: result.severity || '' });
    await writeFile(jsonlPath, `${JSON.stringify({ name, sourceBooks, result }, null, 0)}\n`, { flag: 'a' });
    await writeFile(outPath, `${allRendered.join('\n')}\n`);
    console.error(`[done] ${name}: ${result.severity || ''} ${result.summary || ''}`);
  }
  allRendered.push('## Top 严重偏差候选', '');
  if (!topIssues.length) allRendered.push('- 暂无。');
  else {
    for (const item of topIssues.slice(0, 8)) allRendered.push(`- ${item.name}（${item.severity}）：${item.issue}`);
  }
  await writeFile(outPath, `${allRendered.join('\n')}\n`);
  console.error(`写入 ${outPath}`);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
