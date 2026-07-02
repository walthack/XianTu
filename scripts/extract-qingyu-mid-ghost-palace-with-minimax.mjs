#!/usr/bin/env node

// MiniMax M2.7 fallback extractor for lcq.stage_05b evidence. Use it when
// DeepSeek refuses a chapter or returns low-quality evidence. This script only
// writes a fallback evidence pack; it never modifies scenario mods.
//
// Usage:
//   node scripts/extract-qingyu-mid-ghost-palace-with-minimax.mjs --failed
//   node scripts/extract-qingyu-mid-ghost-palace-with-minimax.mjs --only=96,101

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canonDir = join(gen, 'character-canon');
const epub = '/Volumes/botsvault/06_material/A-六朝清羽记.epub';
const range = [95, 110];
const model = process.env.XIANTU_MINIMAX_FALLBACK_MODEL || 'MiniMax-M2.7';
const sensitiveRe = /阴|阳具|肉棒|龟头|乳|胸|臀|肛|后庭|性交|交合|破身|处女膜|淫|性奴|口交|射精|精液|阴户|阴道|肉穴|勃起|高潮|裸体|玉体|私处|下体|肉体|双飞|侍奉|媚肉|欲火|春宫|采补|性事|房事|合欢|奸|裸|私密|泄身|开苞|蜜穴|花径|玉门|肉缝|肏|操|插|抽送|呻吟/;

function arg(name) {
  const item = process.argv.slice(2).find(value => value === `--${name}` || value.startsWith(`--${name}=`));
  if (!item) return '';
  return item.includes('=') ? item.slice(item.indexOf('=') + 1) : '1';
}

function parseJson(text) {
  const source = String(text || '');
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || source.slice(source.indexOf('{'), source.lastIndexOf('}') + 1);
  if (!candidate.trim()) throw new Error(`empty JSON content: ${source.slice(0, 160)}`);
  return JSON.parse(candidate);
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
  for (const sentence of sentences) {
    const compact = sentence.replace(/\s+/g, ' ').trim();
    if (!compact) continue;
    if (sensitiveRe.test(compact)) {
      if (kept.at(-1) !== '[成人情节已脱敏，仅保留其作为剧情风险/控制/药效/关系转折的存在。]') {
        kept.push('[成人情节已脱敏，仅保留其作为剧情风险/控制/药效/关系转折的存在。]');
      }
      continue;
    }
    kept.push(compact);
  }
  return kept.join(' ');
}

function loadChapterMap() {
  const dir = mkdtempSync(join(tmpdir(), 'xt-qingyu-minimax-'));
  execFileSync('unzip', ['-o', '-q', epub, '-d', dir]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(part => join(dir, part)).find(path => existsSync(path));
  if (!base) throw new Error('找不到 EPUB 文本目录');
  const chapters = new Map();
  for (const file of readdirSync(base).filter(name => /\.x?html?$/i.test(name))) {
    chapters.set(file, cleanHtml(readFileSync(join(base, file), 'utf8')));
  }
  return chapters;
}

function targetIndices() {
  const only = arg('only');
  if (only) return only.split(',').map(value => Number(value.trim())).filter(Boolean);
  if (arg('failed')) {
    const p = join(canonDir, 'qingyu-mid-ghost-palace.deepseek-evidence.json');
    if (!existsSync(p)) return [];
    const evidence = JSON.parse(readFileSync(p, 'utf8'));
    return (evidence.chapters || []).filter(chapter => chapter.error).map(chapter => chapter.sourceIndex);
  }
  return Array.from({ length: range[1] - range[0] + 1 }, (_, index) => range[0] + index);
}

function mmxJson(prompt, label) {
  const result = spawnSync('mmx', [
    'text',
    'chat',
    '--model', model,
    '--message', `user:${prompt}`,
    '--output', 'json',
    '--quiet',
    '--non-interactive',
  ], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 8,
  });
  if (result.status !== 0) throw new Error(`[${label}] mmx failed ${result.status}: ${result.stderr || result.stdout}`);
  return parseJson(result.stdout);
}

const system = [
  '你是游戏改编的原文证据抽取助手。正文已脱敏，禁止还原成人细节。',
  '只抽取《六朝清羽记》lcq.stage_05b 可用证据，不写关卡正文，不扩写，不编造。',
  '输出严格 JSON：{chapterIndex,heading,events:[{name,summary,axisFit,isMajor,participants,factions,locations,limits}],entities:{characters:[string],factions:[string],locations:[string]},stageNotes:[string]}',
  'axisFit 只能是 main|bridge|minor|exclude。',
].join('\n');

async function run() {
  const sourceIndex = JSON.parse(readFileSync(join(gen, 'qingyu', 'source-index.json'), 'utf8'));
  const chapters = loadChapterMap();
  const targets = new Set(targetIndices());
  const outputs = [];
  for (const meta of sourceIndex.filter(item => targets.has(item.index))) {
    const text = chapters.get(meta.file);
    if (!text) continue;
    const prompt = [
      system,
      `章节 index: ${meta.index}`,
      `章节标题: ${meta.heading}`,
      '每章最多 4 个 events。',
      '正文：',
      desensitizeForModel(text).slice(0, 9000),
    ].join('\n');
    try {
      const result = mmxJson(prompt, `qingyu#${meta.index}`);
      outputs.push({ sourceIndex: meta.index, file: meta.file, heading: meta.heading, ...result });
      console.error(`#${meta.index} ${meta.heading}: events=${result.events?.length || 0}`);
    } catch (error) {
      outputs.push({ sourceIndex: meta.index, file: meta.file, heading: meta.heading, error: error.message });
      console.error(`#${meta.index} ${meta.heading}: FAILED ${error.message}`);
    }
  }

  const jsonPath = join(canonDir, 'qingyu-mid-ghost-palace.minimax-evidence.json');
  const mdPath = join(canonDir, 'qingyu-mid-ghost-palace.minimax-evidence.md');
  await writeFile(jsonPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    model,
    range,
    targets: [...targets],
    note: 'MiniMax M2.7 fallback evidence extraction only; not a scenario mod.',
    chapters: outputs,
  }, null, 2)}\n`);
  const lines = ['# MiniMax 2.7 备用证据抽取：lcq.stage_05b', '', `模型：${model}`, ''];
  for (const chapter of outputs) {
    lines.push(`## #${chapter.sourceIndex} ${chapter.heading}`, '');
    if (chapter.error) {
      lines.push(`- ⚠️ 抽取失败：${chapter.error}`, '');
      continue;
    }
    for (const event of chapter.events || []) {
      const limits = Array.isArray(event.limits) ? event.limits : [event.limits].filter(Boolean);
      lines.push(`- ${event.isMajor ? '★' : '·'} ${event.name} [${event.axisFit}]`);
      lines.push(`  - 摘要：${event.summary || ''}`);
      if (event.participants?.length) lines.push(`  - 人物：${event.participants.join('、')}`);
      if (event.factions?.length) lines.push(`  - 势力：${event.factions.join('、')}`);
      if (event.locations?.length) lines.push(`  - 地点：${event.locations.join('、')}`);
      if (limits.length) lines.push(`  - 改编边界：${limits.join('；')}`);
    }
    lines.push('');
  }
  await writeFile(mdPath, `${lines.join('\n')}\n`);
  console.error(`wrote ${jsonPath}`);
  console.error(`wrote ${mdPath}`);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
