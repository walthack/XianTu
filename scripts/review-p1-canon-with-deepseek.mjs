#!/usr/bin/env node

// P1 DeepSeek 复核/抽档：太皇太后身份、各国军队势力档、faction-details-v2-additions 二验。
// 只产报告，不覆盖正典或既有 additions。

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canonDir = join(gen, 'character-canon');
const material = '/Volumes/botsvault/06_material';
const model = process.env.XIANTU_P1_REVIEW_MODEL || 'deepseek/deepseek-v4-flash';
const maxTokens = Number(process.env.XIANTU_P1_REVIEW_MAX_TOKENS || 5000);
const passageBudget = Number(process.env.XIANTU_P1_PASSAGE_BUDGET || 12000);

const books = [
  { id: 'qingyu', title: '六朝清羽记', epub: 'A-六朝清羽记.epub' },
  { id: 'yunlong', title: '六朝云龙吟', epub: 'B- 六朝云龙吟.epub' },
  { id: 'yange', title: '六朝燕歌行', epub: 'C-六朝燕歌行.epub' },
];

const armyTargets = [
  { name: '左武军', aliases: ['左武军'] },
  { name: '禁军', aliases: ['禁军', '羽林', '神策军'] },
  { name: '凉州军', aliases: ['凉州军', '凉州盟'] },
  { name: '汉国军队', aliases: ['汉军', '汉国军', '汉国', '大汉'] },
  { name: '唐国军队', aliases: ['唐军', '唐国军', '唐国', '大唐', '神策军'] },
  { name: '宋国军队', aliases: ['宋军', '宋国军', '宋国', '大宋', '禁军'] },
  { name: '秦国军队', aliases: ['秦军', '秦国军', '秦国', '大秦'] },
  { name: '晋国军队', aliases: ['晋军', '晋国军', '晋国', '大晋'] },
];

const addReviewTargets = ['龙宸', '圣教', '广源行', '铁马堂', '剑霄门', '丹霞宗', '青龙寺', '娑梵寺', '罗马军团', '雪隼佣兵团'];
const targetAliases = {
  太皇太后: ['太皇太后', '太后'],
  龙宸: ['龙宸'],
  圣教: ['圣教', '魔尊', '大祭'],
  广源行: ['广源行'],
  铁马堂: ['铁马堂', '铁雄山', '铁中宝'],
  剑霄门: ['剑霄门', '黎锦香'],
  丹霞宗: ['丹霞宗', '丹霞', '柴永剑', '左彤芝'],
  青龙寺: ['青龙寺', '义操', '释特昧普'],
  娑梵寺: ['娑梵寺', '信永'],
  罗马军团: ['罗马军团', '罗马', '阿伽门侬'],
  雪隼佣兵团: ['雪隼佣兵团', '雪隼', '薛延山', '石之隼'],
};

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap(line => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) return [];
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return [[m[1], value]];
  }));
}

function parseJson(text) {
  const source = String(text || '');
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || source.slice(source.indexOf('{'), source.lastIndexOf('}') + 1);
  if (!candidate.trim()) throw new Error(`empty JSON: ${source.slice(0, 160)}`);
  return JSON.parse(candidate);
}

async function askJson(messages, label) {
  const envPath = join(root, '.env');
  const env = existsSync(envPath) ? parseEnv(await readFile(envPath, 'utf8')) : {};
  const apiKey = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY missing');
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/qianye60/XianTu',
          'X-Title': 'XianTu P1 Canon Review',
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

function loadChapters() {
  const chapters = [];
  for (const book of books) {
    const dir = mkdtempSync(join(tmpdir(), `xt-p1-${book.id}-`));
    execFileSync('unzip', ['-o', '-q', join(material, book.epub), '-d', dir]);
    const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(dir, p)).find(p => existsSync(p));
    if (!base) throw new Error(`找不到章节目录: ${book.epub}`);
    for (const file of readdirSync(base).filter(f => /\.x?html?$/i.test(f)).sort((a, b) => Number(a.match(/\d+/)?.[0] || 0) - Number(b.match(/\d+/)?.[0] || 0))) {
      const text = cleanHtml(readFileSync(join(base, file), 'utf8'));
      const title = text.match(/第[0-9〇零一二三四五六七八九十百千两]+[章集][·\s、，：:.-]*[^\s。！？]{0,16}/)?.[0] || file.replace(/\.x?html?$/i, '');
      chapters.push({ book: book.id, title, text });
    }
  }
  return chapters;
}

function retrieve(aliases, chapters) {
  const lines = [];
  for (const ch of chapters) {
    for (const alias of aliases) {
      let index = ch.text.indexOf(alias);
      let count = 0;
      while (index >= 0 && count < 10) {
        const start = Math.max(0, index - 360);
        const end = Math.min(ch.text.length, index + 760);
        const text = ch.text.slice(start, end).replace(/\s+/g, ' ').trim();
        lines.push({ line: `【${ch.book}/${ch.title}】${text}`, score: aliases.reduce((n, a) => n + (text.includes(a) ? 1 : 0), 0) });
        const nextStart = index + alias.length;
        index = ch.text.indexOf(alias, nextStart);
        count += 1;
      }
    }
  }
  lines.sort((a, b) => b.score - a.score);
  const picked = [];
  const seen = new Set();
  let used = 0;
  for (const item of lines) {
    const key = item.line.slice(0, 180);
    if (seen.has(key)) continue;
    seen.add(key);
    if (used + item.line.length > passageBudget) break;
    picked.push(item.line);
    used += item.line.length;
    if (picked.length >= 24) break;
  }
  return { total: lines.length, picked };
}

function loadExistingAddition(name) {
  const path = join(canonDir, 'faction-details-v2-additions.json');
  if (!existsSync(path)) return null;
  const data = JSON.parse(readFileSync(path, 'utf8'));
  return (data.factions || []).find(item => item.name === name) || null;
}

function renderArmy(item) {
  const fields = ['性质', '总部驻地', '统帅核心', '编制层级', '兵种装备', '战术特点', '旗下重要人物', '与主角关系', '关键事件', '存疑'];
  const lines = [`### ${item.name}`, ''];
  for (const field of fields) {
    const value = item[field];
    const text = Array.isArray(value) ? value.join('、') : (value || '');
    if (text) lines.push(`- **${field}**：${text}`);
  }
  if (Array.isArray(item.evidence) && item.evidence.length) lines.push(`- **证据**：${item.evidence.join('；')}`);
  lines.push('');
  return lines;
}

function renderAdditionReview(item) {
  const lines = [`### ${item.name}`, '', `- **结论**：${item.verdict || ''}`, `- **摘要**：${item.summary || ''}`];
  const issues = Array.isArray(item.issues) ? item.issues : [];
  if (issues.length) {
    lines.push('', '| 字段 | additions 写法 | 原文核验 | 问题类型 | 建议 |', '|---|---|---|---|---|');
    for (const issue of issues) {
      const row = [issue.field, issue.addition, issue.source, issue.type, issue.suggestion].map(v => String(v || '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim());
      lines.push(`| ${row.join(' | ')} |`);
    }
  }
  if (Array.isArray(item.evidence) && item.evidence.length) lines.push('', `- **证据**：${item.evidence.join('；')}`);
  lines.push('');
  return lines;
}

async function run() {
  await mkdir(join(canonDir, '_logs'), { recursive: true });
  console.error('加载三本 epub 原文...');
  const chapters = loadChapters();
  const jsonOut = { generatedAt: new Date().toISOString(), model, ta皇太后: null, armies: [], additionReviews: [] };

  const report = [
    '# P1 设定抽档与 additions 二验（DeepSeek）',
    '',
    `> 生成时间：${jsonOut.generatedAt}`,
    '> 范围：太皇太后身份、各国军队抽档、龙宸等 additions 二验。只产报告，不改正典。',
    '',
  ];

  console.error('复核太皇太后身份...');
  const queenEvidence = retrieve(targetAliases.太皇太后, chapters);
  jsonOut.ta皇太后 = await askJson([
    { role: 'system', content: '你是小说设定考据助手。只依据给定原文证据判断；证据不足必须说不确定。输出严格 JSON。' },
    {
      role: 'user',
      content: `任务：判断“太皇太后”在原文中具体指哪位人物/身份。输出：{"candidate":"候选身份或未知","confidence":"高|中|低|未知","reason":"一句话","evidence":["短证据最多4条"],"nextSteps":"还需查什么"}\n原文证据：\n${queenEvidence.picked.join('\n\n') || '未检索到。'}`,
    },
  ], '太皇太后');
  report.push('## 太皇太后身份', '', `- **候选**：${jsonOut.ta皇太后.candidate || ''}`, `- **置信度**：${jsonOut.ta皇太后.confidence || ''}`, `- **理由**：${jsonOut.ta皇太后.reason || ''}`, `- **证据**：${(jsonOut.ta皇太后.evidence || []).join('；')}`, `- **下一步**：${jsonOut.ta皇太后.nextSteps || ''}`, '');

  report.push('## 各国/军队抽档', '');
  for (const target of armyTargets) {
    console.error(`抽取 ${target.name}...`);
    const evidence = retrieve(target.aliases, chapters);
    const item = await askJson([
      { role: 'system', content: '你是小说军政势力设定整理助手。只据给定原文，客观抽档；无据留空或写存疑。输出严格 JSON。' },
      {
        role: 'user',
        content: `军队/国家军事势力：${target.name}。输出 JSON：{"name":"${target.name}","性质":"","总部驻地":"","统帅核心":[""],"编制层级":"","兵种装备":[""],"战术特点":[""],"旗下重要人物":[""],"与主角关系":"","关键事件":[""],"存疑":"","evidence":["原文短句最多4"]}\n原文：\n${evidence.picked.join('\n\n') || '未检索到。'}`,
      },
    ], target.name);
    jsonOut.armies.push(item);
    report.push(...renderArmy(item));
  }

  report.push('## faction-details-v2-additions 二验', '');
  for (const name of addReviewTargets) {
    console.error(`二验 ${name}...`);
    const evidence = retrieve(targetAliases[name] || [name], chapters);
    const existing = loadExistingAddition(name);
    const item = await askJson([
      { role: 'system', content: '你是小说势力正典二审员。只依据 additions 条目和原文证据，判断能否并入正典；无证据则标存疑。输出严格 JSON。' },
      {
        role: 'user',
        content: `势力：${name}\n待二验 additions JSON：${JSON.stringify(existing, null, 2)}\n输出 JSON：{"name":"${name}","verdict":"可并入|需修后并入|存疑/不可并入","summary":"一句话","issues":[{"field":"字段","addition":"additions写法","source":"原文核验","type":"无证据|矛盾|过度推断|字段可补","suggestion":"建议"}],"evidence":["短证据最多4"]}\n原文证据：\n${evidence.picked.join('\n\n') || '未检索到。'}`,
      },
    ], `二验-${name}`);
    jsonOut.additionReviews.push(item);
    report.push(...renderAdditionReview(item));
  }

  await writeFile(join(canonDir, 'p1-deepseek-review.json'), `${JSON.stringify(jsonOut, null, 2)}\n`);
  await writeFile(join(canonDir, 'P1-设定抽档与二验.deepseek.md'), `${report.join('\n')}\n`);
  console.error('写入 P1-设定抽档与二验.deepseek.md / p1-deepseek-review.json');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
