#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generatedRoot = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const outputDir = join(generatedRoot, 'shared-atlas');
const outputPath = join(outputDir, 'liuchao.shared-atlas.v1.json');
const model = 'deepseek/deepseek-v4-flash';
const books = ['qingyu', 'yunlong', 'yange'];

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) return [];
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return [[match[1], value]];
  }));
}

const apiKey = parseEnv(await readFile(join(root, '.env'), 'utf8')).OPENROUTER_API_KEY;
if (!apiKey) throw new Error('OPENROUTER_API_KEY is missing from .env');

async function exists(path) {
  try { await readFile(path); return true; } catch { return false; }
}

async function openRouter(messages, maxTokens = 30000) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/qianye60/XianTu',
      'X-Title': 'XianTu Shared Canon Atlas Generator',
    },
    body: JSON.stringify({ model, temperature: 0.05, max_tokens: maxTokens, response_format: { type: 'json_object' }, messages }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 1200)}`);
  const json = JSON.parse(body);
  const message = json.choices?.[0]?.message || {};
  return { content: message.content || message.reasoning || '', usage: json.usage || {} };
}

function jsonFromModel(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(candidate);
}

async function withRetries(label, worker, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await worker(); } catch (error) {
      lastError = error;
      console.error(`[${label}] ${attempt}/${attempts}: ${error.message}`);
      await new Promise(resolvePromise => setTimeout(resolvePromise, attempt * 1500));
    }
  }
  throw lastError;
}

function stripUsage(value) {
  if (Array.isArray(value)) return value.map(stripUsage);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== '_usage').map(([key, item]) => [key, stripUsage(item)]));
}

async function collectBookEvidence(book) {
  const bookDir = join(generatedRoot, book);
  const extractionDir = join(bookDir, 'extraction');
  const extractionNames = (await readdir(extractionDir)).filter(name => name.endsWith('.json')).sort();
  const geographicFacts = [];
  for (const name of extractionNames) {
    const batch = stripUsage(JSON.parse(await readFile(join(extractionDir, name), 'utf8')));
    geographicFacts.push({
      batch: batch.batch,
      sourceRange: batch.sourceRange,
      events: (batch.events || []).filter(event => event.locations?.length || event.factions?.length),
      characterLocations: (batch.characterStates || []).filter(character => character.location).map(character => ({
        name: character.name, firstSeenSourceIndex: character.firstSeenSourceIndex,
        lastSeenSourceIndex: character.lastSeenSourceIndex, location: character.location, affiliations: character.affiliations,
      })),
    });
  }
  const stageDir = join(bookDir, 'stages');
  const stageNames = (await readdir(stageDir)).filter(name => name.endsWith('.json') && !name.endsWith('.uncertainties.json')).sort();
  const stages = await Promise.all(stageNames.map(async name => {
    const mod = JSON.parse(await readFile(join(stageDir, name), 'utf8'));
    return {
      modId: mod.manifest.id,
      continents: mod.world.continents || [],
      locations: mod.canon?.locations || [],
      factions: mod.canon?.factions || [],
      opening: mod.scenario.opening,
    };
  }));
  return { book, geographicFacts, stages };
}

async function summarizeBook(book) {
  const cachePath = join(outputDir, `${book}.geography.json`);
  if (await exists(cachePath)) return JSON.parse(await readFile(cachePath, 'utf8'));
  const evidence = await collectBookEvidence(book);
  const { result, parsed } = await withRetries(`${book} geography`, async () => {
    const result = await openRouter([
      { role: 'system', content: '你是严谨的小说地理考据员。只使用给定的完整正文抽取事实，合并别名，区分明确事实与布局推断，只输出 JSON。' },
      { role: 'user', content: `根据以下《六朝》系列单册全文抽取结果，建立紧凑地理事实清单。不要发明地点、势力或路线。sourceRef 必须使用真实 sourceIndex。输出 {"book":"${book}","continents":[...],"locations":[{"name":"...","aliases":[],"type":"...","continent":"...","relativeFacts":["..."],"sourceRefs":[{"sourceIndex":1,"heading":"...","summary":"..."}]}],"factions":[{"name":"...","aliases":[],"type":"...","headquarters":"...","sourceRefs":[...]}],"routes":[{"from":"...","to":"...","type":"...","fact":"...","sourceRefs":[...]}],"stageLocalEntities":[{"modId":"...","locations":[{"localId":"...","name":"..."}],"factions":[{"localId":"...","name":"..."}]}],"uncertainties":[...]}. 地点、势力各最多 80 项，优先保留阶段 Mod 使用及主要剧情涉及的实体。\n\n${JSON.stringify(evidence)}` },
    ], 18000);
    return { result, parsed: jsonFromModel(result.content) };
  });
  await writeFile(cachePath, JSON.stringify({ ...parsed, _usage: result.usage }, null, 2));
  return parsed;
}

await mkdir(outputDir, { recursive: true });
const summaries = [];
for (const book of books) {
  console.log(`[atlas] summarizing ${book}`);
  summaries.push(await summarizeBook(book));
}

const requirements = await readFile(join(root, 'mod-kit', 'SHARED_ATLAS_GENERATION_REQUIREMENTS.md'), 'utf8');
const schema = await readFile(join(root, 'mod-kit', 'schema', 'xiantu.scenario-atlas.v1.schema.json'), 'utf8');
const sourceManifest = JSON.parse(await readFile(join(outputDir, 'source-manifest.json'), 'utf8'));
const mapLabelDraft = JSON.parse(await readFile(join(outputDir, 'map-labels.raw.json'), 'utf8'));
const { result: atlasResult, parsed: atlas } = await withRetries('shared atlas', async () => {
  const result = await openRouter([
    { role: 'system', content: '你是小说正典地图架构师。你负责把自己从三册完整正文抽取出的地理事实统一成可玩的共享地图。只输出符合 Schema 的 JSON。' },
    { role: 'user', content: `${requirements}\n\nJSON SCHEMA:\n${schema}\n\nAPPENDIX MAP SOURCE MANIFEST:\n${JSON.stringify(sourceManifest)}\n\nREGISTERED APPENDIX MAP OCR DRAFT:\n${JSON.stringify(mapLabelDraft)}\n\nTHREE-BOOK GEOGRAPHY EVIDENCE:\n${JSON.stringify(summaries.map(stripUsage))}\n\n请生成最终地图。地图地名与坐标优先依据附录图 OCR 草稿；OCR 是候选而非真值，必须用多图重复识别、上下文和小说证据修正常繁体、拆字及误字。至少两张图同位置重复识别或能被小说事实确认后才可成为实体，否则写入 uncertainties。所有多边形首尾点必须相同。无法从附录图读取边界细节时可做简化多边形，但必须标记 layout_only；禁止新增证据中不存在的实体。stageBindings 必须覆盖输入中的全部阶段。` },
  ], 32000);
  return { result, parsed: jsonFromModel(result.content) };
});
atlas._generation = { model, generatedAt: new Date().toISOString(), usage: atlasResult.usage };
await writeFile(outputPath, JSON.stringify(atlas, null, 2));
console.log(`[atlas] wrote ${outputPath}`);
