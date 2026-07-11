#!/usr/bin/env node

// A narrowly scoped, sanitized source review for the stage_02 Canon Rail block.
// It sends only non-explicit plot sentences to DeepSeek V4 and never mutates canon.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const outDir = join(gen, 'character-canon', 'canon-rail', 'reviews');
const outFile = join(outDir, 'qingyu-stage02-deepseek-v4.json');
const reportFile = join(outDir, 'qingyu-stage02-deepseek-v4.REPORT.md');
const nasDir = '/Volumes/botsvault/06_material/XianTu-Mod-Kit/canon-rail-review';
const epub = '/Volumes/botsvault/06_material/A-六朝清羽记.epub';
const model = 'deepseek/deepseek-v4-flash';

const targets = [
  { id: 'lcq.event.s02_01', sourceIndex: 10, claimed: '王哲托付锦囊、太泉祭祀与守护月霜。' },
  { id: 'lcq.event.s02_03', sourceIndex: 11, claimed: '程宗扬与月霜逃亡（现有轴摘要却为秦军与罗马军团交战）。' },
  { id: 'lcq.event.s02_02', sourceIndex: 14, claimed: '左武军覆灭，王哲以九阳神功牺牲。' },
  { id: 'lcq.event.s02_04', sourceIndex: 17, claimed: '程宗扬在五原城被误抓为奴隶并遭烙印。' },
  { id: 'lcq.event.s02_05', sourceIndex: 19, claimed: '程宗扬被放出牢后遭伏击、反抗。' },
  { id: 'lcq.event.s02_06', sourceIndex: 20, claimed: '程宗扬识破苏妲己伪装，遭囚禁并被追问霓龙丝。' },
];

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*)\s*$/);
    if (!match) return [];
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return [[match[1], value]];
  }));
}

function loadChapters() {
  const dir = mkdtempSync(join(tmpdir(), 'xt-stage02-review-'));
  execFileSync('unzip', ['-o', '-q', epub, '-d', dir]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(path => join(dir, path)).find(existsSync);
  if (!base) throw new Error('EPUB 未找到章节目录');
  const chapters = new Map();
  for (const file of readdirSync(base).filter(file => /\.x?html?$/i.test(file))) {
    chapters.set(file, readFileSync(join(base, file), 'utf8')
      .replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim());
  }
  return chapters;
}

// Defensive redaction: source excerpts are converted to plot-only sentences before
// leaving the workspace. We do not ask the model to analyze adult material.
function sanitizeForOutline(text) {
  const adult = /性交|交合|双修|裸|乳房|阴[户道茎]|阳物|呻吟|欢好|脱衣|床笫|情欲|奸淫|处子|肉体|臀|亲吻|交媾/;
  return text.split(/(?<=[。！？])/u)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length >= 12 && !adult.test(sentence))
    .slice(0, 70)
    .join(' ')
    .slice(0, 5600);
}

function extractJson(text) {
  const fenced = String(text).match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const body = fenced || String(text).slice(String(text).indexOf('{'), String(text).lastIndexOf('}') + 1);
  return JSON.parse(body);
}

const index = JSON.parse(await readFile(join(gen, 'qingyu', 'source-index.json'), 'utf8'));
const chapters = loadChapters();
const excerpts = targets.map(target => {
  const meta = index.find(item => item.index === target.sourceIndex);
  if (!meta) throw new Error(`source-index 缺 ${target.sourceIndex}`);
  return { ...target, heading: meta.heading, excerpt: sanitizeForOutline(chapters.get(meta.file) || '') };
});
const env = existsSync(join(root, '.env')) ? parseEnv(await readFile(join(root, '.env'), 'utf8')) : {};
const key = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
if (!key) throw new Error('缺 OPENROUTER_API_KEY');

const system = `你是《六朝清羽记》的剧情大纲核验员。你收到的是经过成人内容剔除的小说参考节选，任务仅限战斗、旅程、权力、囚禁、死亡、身份和转折等非成人剧情概要。\n\n禁止输出、推测、复述或评价任何成人内容；若节选缺少足够证据，标记 unknown。只输出 JSON：{verdict:"confirmed|mismatched|unknown",sourceOrder:[eventId...],events:[{id,status:"supported|mismatched|unknown",safeSummary:"非成人一句话概要",reason:"证据理由",confidence:"high|medium|low"}],railRecommendation:"safe_to_add|hold_for_source_review"}。`;
const user = `请独立核验以下事件与节选是否匹配、顺序是否可支持 Canon Rail。\n\n${excerpts.map(item => `事件 ${item.id}\n声称：${item.claimed}\n来源 #${item.sourceIndex} ${item.heading}\n脱敏节选：${item.excerpt || '（无可用脱敏节选）'}`).join('\n\n')}`;

const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'XianTu Canon Rail Review' },
  body: JSON.stringify({
    model, temperature: 0, max_tokens: 1800, response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  }),
});
const raw = await response.text();
if (!response.ok) throw new Error(`DeepSeek 请求失败 ${response.status}: ${raw.slice(0, 300)}`);
const content = JSON.parse(raw).choices?.[0]?.message?.content || '';
const review = extractJson(content);
const artifact = {
  schema: 'liuchao.canon-rail-source-review/v1', model, generatedAt: new Date().toISOString(),
  scope: 'qingyu stage_02; non-explicit plot outline only', targets: targets.map(({ id, sourceIndex, claimed }) => ({ id, sourceIndex, claimed })), review,
};
await mkdir(outDir, { recursive: true });
await writeFile(outFile, `${JSON.stringify(artifact, null, 2)}\n`);
const report = `# Qingyu Stage 02 — DeepSeek V4 Canon Rail Review\n\n- Scope: non-explicit novel-outline verification only\n- Model: ${model}\n- Verdict: ${review.verdict || 'unknown'}\n- Recommendation: ${review.railRecommendation || 'hold_for_source_review'}\n- Event order: ${(review.sourceOrder || []).join(' → ') || 'unresolved'}\n\n## Per event\n\n${(review.events || []).map(event => `- ${event.id}: **${event.status}** (${event.confidence || 'unknown'}) — ${event.safeSummary || ''} ${event.reason || ''}`).join('\n')}\n`;
await writeFile(reportFile, report);
await mkdir(nasDir, { recursive: true });
await cp(outFile, join(nasDir, 'qingyu-stage02-deepseek-v4.json'));
await cp(reportFile, join(nasDir, 'qingyu-stage02-deepseek-v4.REPORT.md'));
console.log(JSON.stringify({ outFile, reportFile, nasDir, verdict: review.verdict, recommendation: review.railRecommendation }, null, 2));
