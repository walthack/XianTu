#!/usr/bin/env node

// 三书逐章全量重抽（MiniMax M2.7）。仅写隔离草稿，绝不覆盖 DeepSeek extraction、主轴或 stage。
// 每章成功即落盘，重复运行自动跳过已完成章节；失败章节保留在 pending，便于安全续跑。
// Usage: node scripts/reextract-trilogy-minimax.mjs [qingyu|yunlong|yange ...]

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generated = join(root, 'mod-kit', 'generated');
const sourceRoot = join(generated, 'deepseek-v4-flash');
const outputRoot = join(generated, 'minimax-m2.7', 'trilogy-reextract-2026-07-16');
const MAX_ATTEMPTS = 3;
const MAX_TOKENS = 2200;
const DELAY_MS = 350;

const BOOKS = {
  qingyu: { title: '六朝清羽记', epub: 'A-六朝清羽记.epub' },
  yunlong: { title: '六朝云龙吟', epub: 'B- 六朝云龙吟.epub' },
  yange: { title: '六朝燕歌行', epub: 'C-六朝燕歌行.epub' },
};

function sleep(ms) { return new Promise(resolveSleep => setTimeout(resolveSleep, ms)); }

function loadChapters(epub) {
  const material = '/Volumes/botsvault/06_material';
  const directory = mkdtempSync(join(tmpdir(), 'xiantu-minimax-reextract-'));
  execFileSync('unzip', ['-o', '-q', join(material, epub), '-d', directory]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS']
    .map(segment => join(directory, segment))
    .find(existsSync);
  if (!base) throw new Error(`找不到 EPUB 章节目录: ${epub}`);
  const chapters = new Map();
  for (const file of readdirSync(base).filter(name => /\.x?html?$/i.test(name))) {
    const text = readFileSync(join(base, file), 'utf8')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    chapters.set(file, text);
  }
  return chapters;
}

function parseJson(text) {
  const fenced = String(text).match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || String(text).slice(String(text).indexOf('{'), String(text).lastIndexOf('}') + 1);
  return JSON.parse(candidate);
}

function extractText(response) {
  const content = response?.content;
  if (!Array.isArray(content)) return '';
  return content.filter(part => part?.type === 'text').map(part => part.text || '').join('\n');
}

function minimaxJson(system, user) {
  return new Promise((resolveCall, reject) => {
    // --quiet 在当前 mmx 版本会吞掉 text chat stdout，故保留机器可读 --output json 但不传 --quiet。
    const child = spawn('mmx', [
      'text', 'chat',
      '--system', system,
      '--message', `user:${user}`,
      '--model', 'MiniMax-M2.7',
      '--max-tokens', String(MAX_TOKENS),
      '--temperature', '0',
      '--non-interactive',
      '--output', 'json',
    ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`mmx exit ${code}: ${stderr.slice(-240)}`));
      try {
        const response = JSON.parse(stdout);
        if (response?.stop_reason === 'max_tokens') throw new Error('MiniMax output truncated');
        const text = extractText(response);
        if (!text.trim()) throw new Error('MiniMax returned no text content');
        resolveCall(parseJson(text));
      } catch (error) {
        reject(new Error(`MiniMax response parse failed: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
  });
}

const SYSTEM = [
  '你是小说改编的剧情事件提取助手。给你的原文仅是成人向小说的参考背景，任务只提取可用于游戏的主线事实。',
  '严格脱敏：不得复述任何露骨性行为、性暴力或身体细节；相关内容最多用一句中性因果概述，且 isMajor=false。',
  '只提取本章真实发生的战斗、权谋、生死、身份/关系剧变、关键物品或局势结果；不补写、不预测、不解释暗线。',
  '每章通常 0–3 条；只有会改变后续剧情走向的事件才标 isMajor=true。',
  '只返回合法 JSON：{"events":[{"name":"不超过24字","summary":"不超过80字的脱敏事实句","isMajor":true,"isClimax":false,"participants":["已在本章明确出现的人名"]}]}。',
].join('');

function normalizeEvents(value, sourceIndex, heading) {
  if (!Array.isArray(value?.events)) throw new Error('events is not an array');
  return value.events.slice(0, 5).flatMap((event, eventOrdinal) => {
    if (!event || typeof event !== 'object') return [];
    const name = String(event.name || '').trim().slice(0, 80);
    const summary = String(event.summary || '').trim().slice(0, 240);
    if (!name || !summary) return [];
    return [{
      sourceIndex,
      eventOrdinal,
      heading,
      name,
      summary,
      isMajor: event.isMajor === true,
      isClimax: event.isClimax === true,
      participants: Array.isArray(event.participants)
        ? event.participants.filter(name => typeof name === 'string').map(name => name.trim()).filter(Boolean).slice(0, 12)
        : [],
    }];
  });
}

async function loadOrCreate(output, book) {
  if (!existsSync(output)) return {
    schema: 'xiantu.minimax-trilogy-reextract.v1',
    status: 'draft',
    book,
    bookTitle: BOOKS[book].title,
    model: 'MiniMax-M2.7',
    createdAt: new Date().toISOString(),
    note: '隔离草稿：只供内容裁定与后续人工核对，禁止直接覆盖 DeepSeek extraction、主轴或关卡。',
    attempted: [],
    failures: [],
    events: [],
  };
  return JSON.parse(await readFile(output, 'utf8'));
}

async function persist(output, draft) {
  draft.updatedAt = new Date().toISOString();
  draft.events.sort((a, b) => a.sourceIndex - b.sourceIndex || (a.eventOrdinal ?? 0) - (b.eventOrdinal ?? 0));
  draft.attempted = [...new Set(draft.attempted)].sort((a, b) => a - b);
  await writeFile(output, `${JSON.stringify(draft, null, 2)}\n`);
}

async function runBook(book) {
  const spec = BOOKS[book];
  const output = join(outputRoot, `${book}.reextract.DRAFT.json`);
  const sourceIndex = JSON.parse(readFileSync(join(sourceRoot, book, 'source-index.json'), 'utf8'));
  const chapters = loadChapters(spec.epub);
  const draft = await loadOrCreate(output, book);
  const completed = process.env.XIANTU_REEXTRACT_FORCE === '1'
    ? new Set()
    : new Set(draft.attempted || []);
  const limit = Number.parseInt(process.env.XIANTU_REEXTRACT_LIMIT || '', 10);
  const pendingAll = sourceIndex.filter(meta => !completed.has(meta.index));
  const pending = Number.isFinite(limit) && limit > 0 ? pendingAll.slice(0, limit) : pendingAll;
  console.error(`[${book}] ${completed.size}/${sourceIndex.length} completed; pending ${pending.length}`);

  for (const meta of pending) {
    const text = chapters.get(meta.file);
    if (!text) {
      draft.failures = [...(draft.failures || []).filter(item => item.sourceIndex !== meta.index), { sourceIndex: meta.index, heading: meta.heading, reason: 'EPUB chapter file missing' }];
      await persist(output, draft);
      continue;
    }
    let result = null;
    let failure = '';
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        result = await minimaxJson(SYSTEM, `书名：《${spec.title}》\n章节：${meta.heading}\n\n原文（仅作参考背景）：\n${text.slice(0, 5600)}`);
        break;
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
        console.error(`[${book} #${meta.index}] attempt ${attempt}/${MAX_ATTEMPTS}: ${failure}`);
        await sleep(attempt * 1500);
      }
    }
    if (!result) {
      draft.failures = [...(draft.failures || []).filter(item => item.sourceIndex !== meta.index), { sourceIndex: meta.index, heading: meta.heading, reason: failure }];
      await persist(output, draft);
      continue;
    }
    draft.events = [...(draft.events || []).filter(event => event.sourceIndex !== meta.index), ...normalizeEvents(result, meta.index, meta.heading)];
    draft.attempted.push(meta.index);
    draft.failures = (draft.failures || []).filter(item => item.sourceIndex !== meta.index);
    await persist(output, draft);
    console.error(`[${book} #${meta.index}] ${meta.heading}: ${draft.events.filter(event => event.sourceIndex === meta.index).length} events`);
    await sleep(DELAY_MS);
  }
  const major = draft.events.filter(event => event.isMajor).length;
  console.error(`[${book}] complete ${draft.attempted.length}/${sourceIndex.length}; events=${draft.events.length}; major=${major}; failures=${draft.failures.length}`);
}

async function main() {
  const selected = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(BOOKS);
  for (const book of selected) if (!BOOKS[book]) throw new Error(`unknown book: ${book}`);
  await mkdir(outputRoot, { recursive: true });
  for (const book of selected) await runBook(book);
}

main().catch(error => { console.error(error); process.exit(1); });
