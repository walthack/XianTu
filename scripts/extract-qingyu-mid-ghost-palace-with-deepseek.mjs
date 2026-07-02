#!/usr/bin/env node

// Extract source-grounded evidence for the proposed lcq.stage_05b
// (Qingyu source indices 95-110). This produces an evidence pack only; it does
// not generate or modify a scenario mod.
//
// Usage:
//   node scripts/extract-qingyu-mid-ghost-palace-with-deepseek.mjs
//   XIANTU_QINGYU_MID_LIMIT=3 node scripts/extract-qingyu-mid-ghost-palace-with-deepseek.mjs

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canonDir = join(gen, 'character-canon');
const epub = '/Volumes/botsvault/06_material/A-六朝清羽记.epub';
const model = process.env.XIANTU_QINGYU_MID_MODEL || 'deepseek/deepseek-v4-flash';
const maxTokens = Number(process.env.XIANTU_QINGYU_MID_MAX_TOKENS || 2600);
const limit = Number(process.env.XIANTU_QINGYU_MID_LIMIT || 0);
const range = [95, 110];
const resume = process.env.XIANTU_QINGYU_MID_RESUME !== '0';
const sensitiveRe = /阴|阳具|肉棒|龟头|乳|胸|臀|肛|后庭|性交|交合|破身|处女膜|淫|性奴|口交|射精|精液|阴户|阴道|肉穴|勃起|高潮|裸体|玉体|私处|下体|肉体|双飞|侍奉|媚肉|欲火|春宫|采补|性事|房事|合欢|奸|裸|私密|泄身|开苞|蜜穴|花径|玉门|肉缝|肏|操|插|抽送|呻吟/;

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) return [];
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return [[match[1], value]];
  }));
}

function parseJson(text) {
  const source = String(text || '');
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || source.slice(source.indexOf('{'), source.lastIndexOf('}') + 1);
  if (!candidate.trim()) throw new Error(`empty JSON content: ${source.slice(0, 160)}`);
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
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/qianye60/XianTu',
          'X-Title': 'XianTu Qingyu Mid Ghost Palace Evidence',
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
      await new Promise(resolve => setTimeout(resolve, attempt * 1800));
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

function desensitizeForModel(text) {
  const sentences = text.split(/(?<=[。！？!?])|(?=第[一二三四五六七八九十百千0-9]+章)/);
  const kept = [];
  let masked = 0;
  for (const sentence of sentences) {
    const compact = sentence.replace(/\s+/g, ' ').trim();
    if (!compact) continue;
    if (sensitiveRe.test(compact)) {
      masked += 1;
      if (masked <= 80) kept.push('[成人情节已脱敏，仅保留其作为剧情风险/控制/药效/关系转折的存在。]');
      continue;
    }
    kept.push(compact);
  }
  return kept.join(' ').replace(/(?:\\[成人情节已脱敏[^\\]]+\\]\\s*){2,}/g, '[成人情节已脱敏，仅保留其作为剧情风险/控制/药效/关系转折的存在。] ');
}

function loadChapterMap() {
  const dir = mkdtempSync(join(tmpdir(), 'xt-qingyu-mid-'));
  execFileSync('unzip', ['-o', '-q', epub, '-d', dir]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(part => join(dir, part)).find(path => existsSync(path));
  if (!base) throw new Error('找不到 EPUB 文本目录');
  const chapters = new Map();
  for (const file of readdirSync(base).filter(name => /\.x?html?$/i.test(name))) {
    chapters.set(file, cleanHtml(readFileSync(join(base, file), 'utf8')));
  }
  return chapters;
}

const systemPrompt = [
  '你是游戏改编的原文证据抽取助手。以下文本来自成人向武侠小说《六朝清羽记》，仅作为剧情正典参考。',
  '用户提供的正文已经预先脱敏，标记为[成人情节已脱敏]的地方不要还原、不要猜测细节。',
  '任务：为游戏关卡 lcq.stage_05b 抽取剧情证据，不写关卡正文，不扩写，不编造。',
  '脱敏规则：成人/露骨内容只用中性概括，例如“受制”“药效危机”“救援解法”“亲密风险”；不得复述身体细节。',
  '输出紧凑严格 JSON，不要 Markdown，不要注释：',
  '{chapterIndex,heading,events:[{name,summary,axisFit,isMajor,participants,factions,locations,limits}],entities:{characters:[string],factions:[string],locations:[string]},stageNotes:[string]}',
  'axisFit 只能是 main|bridge|minor|exclude。constraints 写给游戏改编的边界。avoidDetails 写应避免的露骨/剧透/误写点。',
].join('\n');

async function writeOutputs(outputs) {
  const jsonPath = join(canonDir, 'qingyu-mid-ghost-palace.deepseek-evidence.json');
  const mdPath = join(canonDir, 'qingyu-mid-ghost-palace.deepseek-evidence.md');
  await writeFile(jsonPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    model,
    range,
    note: 'DeepSeek evidence extraction only; not a scenario mod.',
    chapters: outputs,
  }, null, 2)}\n`);

  const lines = [
    '# DeepSeek 证据抽取：lcq.stage_05b',
    '',
    `范围：清羽 source index #${range[0]}~#${range[1]}`,
    `模型：${model}`,
    '',
  ];
  for (const chapter of outputs) {
    lines.push(`## #${chapter.sourceIndex} ${chapter.heading}`, '');
    if (chapter.error) {
      lines.push(`- ⚠️ 抽取失败：${chapter.error}`, '');
      continue;
    }
    for (const event of chapter.events || []) {
      lines.push(`- ${event.isMajor ? '★' : '·'} ${event.name} [${event.axisFit}]`);
      lines.push(`  - 摘要：${event.summary || ''}`);
      if (event.participants?.length) lines.push(`  - 人物：${event.participants.join('、')}`);
      if (event.factions?.length) lines.push(`  - 势力：${event.factions.join('、')}`);
      if (event.locations?.length) lines.push(`  - 地点：${event.locations.join('、')}`);
      const rawLimits = event.limits || event.constraints || event.avoidDetails || [];
      const limits = Array.isArray(rawLimits) ? rawLimits : [String(rawLimits)].filter(Boolean);
      if (limits.length) lines.push(`  - 改编边界：${limits.join('；')}`);
    }
    if (chapter.stageNotes?.length) {
      lines.push('', '关卡备注：');
      for (const note of chapter.stageNotes) lines.push(`- ${note}`);
    }
    lines.push('');
  }
  await writeFile(mdPath, `${lines.join('\n')}\n`);
}

async function run() {
  const sourceIndex = JSON.parse(readFileSync(join(gen, 'qingyu', 'source-index.json'), 'utf8'));
  const chapters = loadChapterMap();
  const jsonPath = join(canonDir, 'qingyu-mid-ghost-palace.deepseek-evidence.json');
  const outputs = resume && existsSync(jsonPath)
    ? JSON.parse(readFileSync(jsonPath, 'utf8')).chapters || []
    : [];
  const done = new Set(outputs.filter(item => !item.error).map(item => item.sourceIndex));
  const metas = sourceIndex
    .filter(item => item.index >= range[0] && item.index <= range[1])
    .slice(0, limit > 0 ? limit : undefined);

  for (const meta of metas) {
    if (done.has(meta.index)) {
      console.error(`#${meta.index} ${meta.heading}: skip existing`);
      continue;
    }
    const text = chapters.get(meta.file);
    if (!text) {
      console.error(`missing chapter text: #${meta.index} ${meta.file}`);
      continue;
    }
    const excerpt = desensitizeForModel(text).slice(0, 9000);
    try {
      const result = await openRouterJson([
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            `章节 index: ${meta.index}`,
            `章节标题: ${meta.heading}`,
            '请抽取本章对 lcq.stage_05b 有用的剧情证据。每章最多 4 个 events。',
            '正文：',
            excerpt,
          ].join('\n'),
        },
      ], `qingyu#${meta.index}`);
      outputs.push({ sourceIndex: meta.index, file: meta.file, heading: meta.heading, ...result });
      console.error(`#${meta.index} ${meta.heading}: events=${result.events?.length || 0}`);
    } catch (error) {
      outputs.push({ sourceIndex: meta.index, file: meta.file, heading: meta.heading, error: error.message });
      console.error(`#${meta.index} ${meta.heading}: FAILED ${error.message}`);
    }
    await writeOutputs(outputs);
  }

  await writeOutputs(outputs);
  const mdPath = join(canonDir, 'qingyu-mid-ghost-palace.deepseek-evidence.md');
  console.error(`wrote ${jsonPath}`);
  console.error(`wrote ${mdPath}`);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
