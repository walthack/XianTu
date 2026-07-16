#!/usr/bin/env node

// 将 MiniMax 全量重抽的 major 事件逐章与既有高光裁定基线对照。
// 仅产隔离裁定档；绝不写入 stage、主轴、既有 highlight 工单或 canon。
// Usage: node scripts/adjudicate-highlight-supplements-minimax.mjs [qingyu|yunlong|yange ...]

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const baselineRoot = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const draftRoot = join(root, 'mod-kit', 'generated', 'minimax-m2.7', 'trilogy-reextract-2026-07-16');
const BOOKS = { qingyu: '六朝清羽记', yunlong: '六朝云龙吟', yange: '六朝燕歌行' };
const MAX_TOKENS = 2200;
const SEX = /阳具|献身|口含|交合|云雨|房事|鼎炉|春宫|情欲|性交|媾和|媾欢|淫辱|奸淫|裸身|裸露|处子之身|以身相酬|双修/;

function sleep(ms) { return new Promise(resolveSleep => setTimeout(resolveSleep, ms)); }
function parseJson(text) {
  const fenced = String(text).match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced || String(text).slice(String(text).indexOf('['), String(text).lastIndexOf(']') + 1);
  return JSON.parse(source);
}
function extractText(response) {
  return Array.isArray(response?.content)
    ? response.content.filter(part => part?.type === 'text').map(part => part.text || '').join('\n')
    : '';
}
function minimaxJson(system, user) {
  return new Promise((resolveCall, reject) => {
    const child = spawn('mmx', [
      'text', 'chat', '--system', system, '--message', `user:${user}`,
      '--model', 'MiniMax-M2.7', '--max-tokens', String(MAX_TOKENS), '--temperature', '0',
      '--non-interactive', '--output', 'json',
    ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`mmx exit ${code}: ${stderr.slice(-240)}`));
      try {
        const response = JSON.parse(stdout);
        if (response?.stop_reason === 'max_tokens') throw new Error('MiniMax output truncated');
        const text = extractText(response);
        if (!text.trim()) throw new Error('MiniMax returned no text');
        resolveCall(parseJson(text));
      } catch (error) { reject(error); }
    });
  });
}
function normalize(value) { return String(value || '').replace(/\s+/g, '').replace(/[()（）]/g, ''); }
function tierScore(item) { return ({ S: 5, A: 4, B: 3, C: 2, D: 1 })[item.tier] || 0; }
function loadBaseline(book, sourceIndex) {
  const index = JSON.parse(readFileSync(join(baselineRoot, book, 'source-index.json'), 'utf8'));
  const heading = index.find(item => item.index === sourceIndex)?.heading || '';
  const rows = [];
  for (const model of ['deepseek', 'minimax']) {
    const path = join(baselineRoot, book, `highlight-graded.${model}.json`);
    if (!existsSync(path)) continue;
    for (const item of JSON.parse(readFileSync(path, 'utf8'))) {
      if (!['S', 'A', 'B'].includes(item.tier)) continue;
      if (SEX.test(`${item.title || ''}${item.source || ''}`)) continue;
      const window = normalize(item.window);
      const key = normalize(heading);
      if (key && (window.includes(key) || key.includes(window.replace(/片\d+$/, '')))) rows.push(item);
    }
  }
  const unique = new Map();
  for (const item of rows.sort((a, b) => tierScore(b) - tierScore(a) || (b.pri || 0) - (a.pri || 0))) {
    const key = `${item.char || ''}|${item.title || ''}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()].slice(0, 24).map(item => ({ tier: item.tier, char: item.char, title: item.title, rec: item.rec, note: item.note || item.why || '' }));
}
function cleanEvents(events) {
  const safe = []; const quarantined = [];
  for (const event of events) {
    const record = { title: event.name, summary: event.summary, participants: event.participants || [], isClimax: Boolean(event.isClimax), eventOrdinal: event.eventOrdinal ?? 0 };
    if (SEX.test(`${record.title}${record.summary}`)) quarantined.push(record);
    else safe.push(record);
  }
  return { safe, quarantined };
}
const SYSTEM = [
  '你是小说改编游戏的高光补强裁定编辑。既有高光条目是权威基线，新事件只能作为补强候选，绝不能推翻或重复已有裁定。',
  '依据事件的戏剧性、人物定义性、可演出性做严格判断：S=系列名场面，A=强高光，B=可补写，C/D=跳过。宁可跳过。',
  'decision 只能是 covered（已被基线充分覆盖）、enrich（同一高光但可补一个非敏感演出点）、new（确有独立新高光）、skip（不够高光）。',
  '不得复述成人、性暴力或露骨内容；若输入没有足够事实则 skip。只返回 JSON 数组。',
].join('');

async function adjudicate(book) {
  const input = join(draftRoot, `${book}.reextract.DRAFT.json`);
  const output = join(draftRoot, `${book}.highlight-supplement.adjudicated.DRAFT.json`);
  const draft = JSON.parse(await readFile(input, 'utf8'));
  let archive = existsSync(output)
    ? JSON.parse(await readFile(output, 'utf8'))
    : { schema: 'xiantu.highlight-supplement-adjudication.v1', status: 'in_progress', book, bookTitle: BOOKS[book], model: 'MiniMax-M2.7', note: '既有高光为权威基线；本档仅记录新抽取事件的补强裁定，未自动写入正典或关卡。', chapters: {}, quarantined: [] };
  const groups = new Map();
  for (const event of draft.events || []) if (event.isMajor) {
    if (!groups.has(event.sourceIndex)) groups.set(event.sourceIndex, []);
    groups.get(event.sourceIndex).push(event);
  }
  const allIndexes = [...groups.keys()].sort((a, b) => a - b);
  const limit = Number.parseInt(process.env.XIANTU_HIGHLIGHT_ADJUDICATE_LIMIT || '', 10);
  const indexes = Number.isFinite(limit) && limit > 0 ? allIndexes.slice(0, limit) : allIndexes;
  for (const sourceIndex of indexes) {
    if (archive.chapters[String(sourceIndex)]) continue;
    const { safe, quarantined } = cleanEvents(groups.get(sourceIndex));
    archive.quarantined.push(...quarantined.map(event => ({ sourceIndex, ...event, disposition: 'desensitize_before_review' })));
    if (!safe.length) {
      archive.chapters[String(sourceIndex)] = { sourceIndex, decisions: [] };
      await writeFile(output, `${JSON.stringify(archive, null, 2)}\n`);
      continue;
    }
    const baseline = loadBaseline(book, sourceIndex);
    const user = JSON.stringify({
      chapterSourceIndex: sourceIndex,
      existingBaseline: baseline,
      candidates: safe.map((event, i) => ({ i, ...event })),
      output: '[{"i":0,"decision":"covered|enrich|new|skip","tier":"S|A|B|C|D","char":"最主要角色名","reason":"不超过24字"}]',
    });
    let result = null; let lastError = '';
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try { result = await minimaxJson(SYSTEM, user); if (!Array.isArray(result)) throw new Error('response is not an array'); break; }
      catch (error) { lastError = error instanceof Error ? error.message : String(error); await sleep(1500 * attempt); }
    }
    if (!result) throw new Error(`${book} sourceIndex ${sourceIndex} adjudication failed: ${lastError}`);
    const decisions = safe.map((event, i) => {
      const found = result.find(item => item?.i === i) || {};
      const decision = ['covered', 'enrich', 'new', 'skip'].includes(found.decision) ? found.decision : 'skip';
      const tier = ['S', 'A', 'B', 'C', 'D'].includes(found.tier) ? found.tier : 'D';
      return { ...event, decision, tier, char: String(found.char || '').slice(0, 40), reason: String(found.reason || '').slice(0, 100), baselineCount: baseline.length };
    });
    archive.chapters[String(sourceIndex)] = { sourceIndex, decisions };
    archive.updatedAt = new Date().toISOString();
    await writeFile(output, `${JSON.stringify(archive, null, 2)}\n`);
    console.error(`[${book} #${sourceIndex}] ${decisions.length} candidates; new/enrich ${decisions.filter(item => ['new', 'enrich'].includes(item.decision) && ['S', 'A', 'B'].includes(item.tier)).length}`);
  }
  archive.status = Object.keys(archive.chapters).length >= allIndexes.length ? 'complete' : 'in_progress';
  if (archive.status === 'complete') archive.completedAt = new Date().toISOString();
  await writeFile(output, `${JSON.stringify(archive, null, 2)}\n`);
}

const selected = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(BOOKS);
for (const book of selected) if (!BOOKS[book]) throw new Error(`unknown book: ${book}`);
(async () => { for (const book of selected) await adjudicate(book); })().catch(error => { console.error(error); process.exit(1); });
