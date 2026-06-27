#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const root = resolve(import.meta.dirname, '..');
const materialRoot = '/Volumes/botsvault/06_material';
const outputRoot = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const model = 'deepseek/deepseek-v4-flash';
const batchCharacters = 60_000;
const concurrency = 6;

const books = [
  { id: 'qingyu', title: '六朝清羽记', file: 'A-六朝清羽记.epub', prefix: 'lcq' },
  { id: 'yunlong', title: '六朝云龙吟', file: 'B- 六朝云龙吟.epub', prefix: 'lyl' },
  { id: 'yange', title: '六朝燕歌行', file: 'C-六朝燕歌行.epub', prefix: 'lyg' },
];

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) return [];
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return [[match[1], value]];
  }));
}

const env = parseEnv(await readFile(join(root, '.env'), 'utf8'));
const apiKey = env.OPENROUTER_API_KEY;
if (!apiKey) throw new Error('OPENROUTER_API_KEY is missing from .env');

const guide = await readFile(join(root, 'mod-kit', 'AGENT_GUIDE.md'), 'utf8');
const requirements = await readFile(join(root, 'mod-kit', 'NOVEL_SCENARIO_EXTRACTION_REQUIREMENTS.md'), 'utf8');
const schema = await readFile(join(root, 'mod-kit', 'schema', 'xiantu.scenario-mod.v1.schema.json'), 'utf8');
const strictTemplate = await readFile(join(root, 'mod-kit', 'templates', 'strict.template.json'), 'utf8');

function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function decodeEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replaceAll('&nbsp;', ' ').replaceAll('&amp;', '&').replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'");
}

function htmlToText(html) {
  return decodeEntities(html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(?:p|div|h[1-6]|li|blockquote|section)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

async function extractBook(book) {
  const extractDir = join(tmpdir(), `xiantu-${book.id}-epub`);
  await mkdir(extractDir, { recursive: true });
  execFileSync('unzip', ['-oq', join(materialRoot, book.file), '-d', extractDir]);
  const files = execFileSync('find', [extractDir, '-type', 'f'], { encoding: 'utf8' })
    .split('\n').filter(file => /\.(?:x?html?|htm)$/i.test(file)).sort(naturalCompare);
  const chapters = [];
  for (const file of files) {
    const html = await readFile(file, 'utf8');
    const text = htmlToText(html);
    if (text.length < 300) continue;
    const heading = decodeEntities((html.match(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i)?.[1] || basename(file))
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    chapters.push({ index: chapters.length + 1, file: basename(file), heading, text });
  }
  return chapters;
}

function makeBatches(chapters, maxCharacters = batchCharacters) {
  const batches = [];
  let current = [];
  let size = 0;
  for (const chapter of chapters) {
    if (current.length && size + chapter.text.length > maxCharacters) {
      batches.push(current); current = []; size = 0;
    }
    current.push(chapter); size += chapter.text.length;
  }
  if (current.length) batches.push(current);
  return batches;
}

async function openRouter(messages, maxTokens = 32_000) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/qianye60/XianTu',
      'X-Title': 'XianTu Scenario Mod Generator',
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages,
    }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 1000)}`);
  const json = JSON.parse(body);
  return { content: json.choices?.[0]?.message?.content || '', usage: json.usage || {} };
}

function jsonFromModel(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(candidate);
}

async function mapLimit(items, limit, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

async function withRetries(label, worker, attempts = 6) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await worker();
    } catch (error) {
      lastError = error;
      console.error(`[${label}] attempt ${attempt}/${attempts} failed: ${error.message}`);
      if (attempt < attempts) await new Promise(resolvePromise => setTimeout(resolvePromise, attempt * 1500));
    }
  }
  throw lastError;
}

async function exists(path) {
  try { await readFile(path); return true; } catch { return false; }
}

function batchPrompt(book, batch, index, total) {
  const body = batch.map(ch => `\n===== SOURCE ${ch.index}: ${ch.heading} (${ch.file}) =====\n${ch.text}`).join('\n');
  return `你负责亲自阅读小说正文并提取事实。以下是《${book.title}》按原书顺序切分的第 ${index + 1}/${total} 批完整正文。

只依据本批正文，输出严格 JSON，不要 Markdown。不要照抄长段原文，不要详细复述露骨性内容；相关场景仅按剧情作用概括。

输出结构：
{
  "batch": ${index + 1},
  "sourceRange": [{"sourceIndex": 1, "heading": "...", "file": "..."}],
  "events": [{"sourceIndices": [1], "name": "...", "summary": "...", "participants": ["..."], "locations": ["..."], "factions": ["..."], "isMajor": true, "isClimax": false, "preClimaxEntry": "适合开局时写具体切点，否则空字符串"}],
  "characterStates": [{"name": "...", "firstSeenSourceIndex": 1, "lastSeenSourceIndex": 1, "aliveState": "alive|dead|missing|unknown", "location": "...", "affiliations": ["..."], "role": "...", "relationships": [{"other": "...", "relation": "...", "evidence": "事实摘要"}], "abilitiesHeld": ["..."], "itemsHeld": ["..."]}],
  "contentFacts": [{"name": "...", "kind": "skill|technique|item", "holders": ["..."], "acquiredAtSourceIndex": 1, "exclusive": false, "fact": "..."}],
  "candidateStageEntries": [{"afterSourceIndex": 1, "beforeSourceIndex": 2, "title": "...", "whyPlayable": "...", "imminentConflict": "..."}],
  "uncertainties": ["..."]
}

必须追踪人物死亡/离场、关系变化、宗派归属、技能和物品实际获得时间。高潮前切点应让玩家能进入并改变即将发生的重要事件，不能选择高潮已经结束之后。保持紧凑：events 最多 15 条，characterStates 最多 15 条，contentFacts 最多 12 条，candidateStageEntries 最多 5 条；合并不影响状态的连续过场，优先保留重要事件和发生状态变化的人物。
${body}`;
}

async function processBook(book) {
  const bookDir = join(outputRoot, book.id);
  const extractionDir = join(bookDir, 'extraction');
  await mkdir(extractionDir, { recursive: true });
  const completedPlanPath = join(bookDir, 'stage-plan.json');
  if (await exists(completedPlanPath)) {
    const completedPlan = JSON.parse(await readFile(completedPlanPath, 'utf8'));
    const completed = await Promise.all((completedPlan.stages || []).map(stage =>
      exists(join(bookDir, 'stages', `${stage.id}.json`))));
    if (completed.length && completed.every(Boolean)) {
      console.log(`[${book.title}] already complete; skipping`);
      return;
    }
  }
  const chapters = await extractBook(book);
  const batches = makeBatches(chapters, book.id === 'yange' ? 30_000 : batchCharacters);
  await writeFile(join(bookDir, 'source-index.json'), JSON.stringify(chapters.map(({ text, ...rest }) => ({ ...rest, characters: text.length })), null, 2));
  console.log(`[${book.title}] ${chapters.length} source sections, ${batches.length} batches`);

  await mapLimit(batches, concurrency, async (batch, index) => {
    const path = join(extractionDir, `batch-${String(index + 1).padStart(3, '0')}.json`);
    if (await exists(path)) return;
    const { parsed, usage } = await withRetries(`${book.title} batch ${index + 1}`, async () => {
      const result = await openRouter([
        { role: 'system', content: '你是严谨的长篇小说事实抽取员。你必须亲自阅读提供的正文，只输出可解析 JSON，区分正文事实与不确定推断。' },
        { role: 'user', content: batchPrompt(book, batch, index, batches.length) },
      ]);
      return { parsed: jsonFromModel(result.content), usage: result.usage };
    });
    await writeFile(path, JSON.stringify({ ...parsed, _usage: usage }, null, 2));
    console.log(`[${book.title}] extracted ${index + 1}/${batches.length}`);
  });

  const extractionFiles = (await readdir(extractionDir)).filter(name => name.endsWith('.json')).sort();
  const extractions = await Promise.all(extractionFiles.map(async name => JSON.parse(await readFile(join(extractionDir, name), 'utf8'))));
  const synthesisDir = join(bookDir, 'synthesis');
  await mkdir(synthesisDir, { recursive: true });
  const extractionGroups = [];
  for (let index = 0; index < extractions.length; index += 7) extractionGroups.push(extractions.slice(index, index + 7));
  await mapLimit(extractionGroups, 3, async (group, index) => {
    const path = join(synthesisDir, `arc-${String(index + 1).padStart(2, '0')}.json`);
    if (await exists(path)) return;
    const compactGroup = group.map(({ _usage, ...item }) => item);
    const { parsed } = await withRetries(`${book.title} arc ${index + 1}`, async () => {
      const result = await openRouter([
        { role: 'system', content: '你是长篇小说剧情架构师。你正在汇总自己对连续正文批次的阅读结果，只输出 JSON。' },
        { role: 'user', content: `汇总《${book.title}》以下连续正文抽取结果。保留所有会影响 Mod 阶段边界的重要事件、高潮前切点、人物加入/死亡/离场、关系变化、势力归属、能力和装备获得时间。不要引入原结果没有的事实。输出 {"sourceStartIndex":1,"sourceEndIndex":2,"majorArcs":[{"name":"...","sourceStartIndex":1,"sourceEndIndex":2,"summary":"...","climaxSourceIndex":2,"preClimaxEntries":[{"afterSourceIndex":1,"beforeSourceIndex":2,"reason":"..."}]}],"characterStateChanges":[...],"contentAcquisitions":[...],"candidateStages":[...],"uncertainties":[...]}。\n\n${JSON.stringify(compactGroup)}` },
      ], 14_000);
      return { parsed: jsonFromModel(result.content) };
    });
    await writeFile(path, JSON.stringify(parsed, null, 2));
    console.log(`[${book.title}] synthesized arc ${index + 1}/${extractionGroups.length}`);
  });
  const arcFiles = (await readdir(synthesisDir)).filter(name => name.endsWith('.json')).sort();
  const arcSummaries = await Promise.all(arcFiles.map(async name => JSON.parse(await readFile(join(synthesisDir, name), 'utf8'))));
  const synthesisPath = join(bookDir, 'stage-plan.json');
  if (!(await exists(synthesisPath))) {
    const chapterCatalog = chapters.map(({ index, file, heading }) => ({ index, file, heading }));
    const { parsed, usage } = await withRetries(`${book.title} stage plan`, async () => {
      const result = await openRouter([
        { role: 'system', content: '你是长篇小说剧情架构师。你根据自己先前从完整正文逐批抽取的事实，选择可游玩的剧情开局。只输出 JSON。' },
        { role: 'user', content: `这是《${book.title}》完整正文阅读后形成的连续卷段汇总和全局源段目录。请自行选择 3 至 6 个相互有明显时期差异的 Mod 开局，优先放在重要情节或高潮开始前，让玩家能参与并改变进程。不得把后期人物、关系、能力、装备提前到早期阶段。\n\n输出 {"book":"...","stages":[{"id":"${book.prefix}.stage_slug","title":"...","openingAfterSourceIndex":1,"openingAfterHeading":"...","openingBeforeSourceIndex":2,"openingBeforeHeading":"...","sourceStartIndex":1,"sourceEndIndex":20,"era":"...","imminentConflict":"...","completedFacts":["..."],"forbiddenFutureFacts":["..."],"featuredCharacters":["..."],"reason":"..."}],"globalUncertainties":["..."]}。ID 只用小写 ASCII。每个索引必须使用下方全局目录中的真实 index；标题必须逐字匹配该 index 的 heading；sourceStartIndex <= openingAfterSourceIndex < openingBeforeSourceIndex <= sourceEndIndex。openingBeforeSourceIndex 必须等于 openingAfterSourceIndex + 1；只有中间恰好跨过一个卷标题时才允许 +2。它们表示开场紧邻的前后正文段，不是整个剧情范围。不要把后期事件错误映射到开篇索引。\n\nGLOBAL SOURCE CATALOG:\n${JSON.stringify(chapterCatalog)}\n\nFULL ARC SYNTHESIS:\n${JSON.stringify(arcSummaries)}` },
      ], 10_000);
      const candidate = jsonFromModel(result.content);
      const usedPairs = [];
      for (const stage of candidate.stages || []) {
        const resolved = await withRetries(`${book.title} map ${stage.id}`, async () => {
          const mappingResult = await openRouter([
            { role: 'system', content: '你负责把小说剧情阶段精确映射到全局章节目录。只输出 JSON。' },
            { role: 'user', content: `请为《${book.title}》这个 Mod 阶段重新定位开场相邻源段：${JSON.stringify(stage)}。输出 {"openingAfterSourceIndex":1,"openingAfterHeading":"...","openingBeforeSourceIndex":2,"openingBeforeHeading":"...","mappingReason":"..."}。必须根据剧情语义选择真实位置，before 必须等于 after+1；若中间是卷标题可为 after+2。不得使用这些已占用切点：${JSON.stringify(usedPairs)}。标题必须逐字复制目录。\n\nGLOBAL SOURCE CATALOG:\n${JSON.stringify(chapterCatalog)}\n\nARC EVIDENCE:\n${JSON.stringify(arcSummaries)}` },
          ], 3000);
          return { parsed: jsonFromModel(mappingResult.content) };
        });
        Object.assign(stage, resolved.parsed);
        const after = chapters.find(ch => ch.index === stage.openingAfterSourceIndex);
        const before = chapters.find(ch => ch.index === stage.openingBeforeSourceIndex);
        const pair = `${stage.openingAfterSourceIndex}:${stage.openingBeforeSourceIndex}`;
        if (!after || !before || after.heading !== stage.openingAfterHeading || before.heading !== stage.openingBeforeHeading ||
            stage.openingAfterSourceIndex >= stage.openingBeforeSourceIndex || stage.openingBeforeSourceIndex - stage.openingAfterSourceIndex > 2 ||
            usedPairs.includes(pair)) {
          throw new Error(`Invalid stage source mapping: ${stage.id} start=${stage.sourceStartIndex} after=${stage.openingAfterSourceIndex} before=${stage.openingBeforeSourceIndex} end=${stage.sourceEndIndex}`);
        }
        stage.sourceStartIndex = Math.min(stage.sourceStartIndex, stage.openingAfterSourceIndex);
        stage.sourceEndIndex = Math.max(stage.sourceEndIndex, stage.openingBeforeSourceIndex);
        usedPairs.push(pair);
      }
      return { parsed: candidate, usage: result.usage };
    });
    await writeFile(synthesisPath, JSON.stringify({ ...parsed, _usage: usage }, null, 2));
  }

  const stagePlan = JSON.parse(await readFile(synthesisPath, 'utf8'));
  const stagesDir = join(bookDir, 'stages');
  await mkdir(stagesDir, { recursive: true });
  await mapLimit(stagePlan.stages, 3, async stage => {
    const target = join(stagesDir, `${stage.id}.json`);
    const stageChapters = chapters.filter(ch => ch.index >= stage.sourceStartIndex && ch.index <= stage.sourceEndIndex);
    const openingIndex = Number(stage.openingBeforeSourceIndex || stage.openingAfterSourceIndex || stage.sourceStartIndex);
    const orderedByOpening = [...stageChapters].sort((a, b) => {
      const distance = Math.abs(a.index - openingIndex) - Math.abs(b.index - openingIndex);
      return distance || a.index - b.index;
    });
    const selected = [];
    let selectedCharacters = 0;
    for (const chapter of orderedByOpening) {
      if (selected.length && selectedCharacters + chapter.text.length > 180_000) continue;
      selected.push(chapter);
      selectedCharacters += chapter.text.length;
    }
    const relevant = selected.sort((a, b) => a.index - b.index);
    const relevantText = relevant.map(ch => `\n===== SOURCE ${ch.index}: ${ch.heading} (${ch.file}) =====\n${ch.text}`).join('\n');
    const evidence = extractions.filter(batch => batch.sourceRange?.some(s => s.sourceIndex >= stage.sourceStartIndex && s.sourceIndex <= stage.sourceEndIndex));
    const prompt = `你负责根据自己阅读的《${book.title}》正文生成一个 XianTu Strict Scenario Mod。开局是“${stage.title}”，位于重要事件发生前：${stage.imminentConflict}。

你必须完成剧情事实判断和结构化生成。只输出完全符合 Schema 的 Mod JSON 本身，不要外层包装，不要 Markdown。

要求：
- manifest.id 使用 ${stage.id}；author 写 DeepSeek V4 Flash + XianTu Mod Kit；Strict 模式。
- 玩家固定扮演本阶段原作主角，提供锁定 creationPreset。
- 4 至 8 个可推进章节，每章 1 至 3 个事件；第一章立即激活，后章由 flags 串联。
- 开场只初始化该时点存活且可互动的重要人物；死亡、未登场、离场人物不得冒充活跃 NPC。
- 主角关系用 playerRelationships，NPC-NPC 才用 relationships；好感值须符合该时点。
- affiliations、技能、功法、武器和唯一能力必须按正文当时状态；尚未获得的内容不得开局发放。
- 唯一能力 exclusive，限定传承 restricted。不要补造正文未证实的正典事实；为可玩性补充的内容必须在来源审计标注。
- 不复制正文长段，也不详细描述露骨性内容，只保留其非露骨剧情后果。

以下规范和 Schema 是硬约束：
--- AGENT GUIDE ---\n${guide}
--- EXTRACTION REQUIREMENTS ---\n${requirements}
--- JSON SCHEMA ---\n${schema}
--- STRICT TEMPLATE ---\n${strictTemplate}
--- STAGE PLAN ---\n${JSON.stringify(stage)}
--- PRIOR EXTRACTION EVIDENCE ---\n${JSON.stringify(evidence)}
--- ORIGINAL SOURCE TEXT ---\n${relevantText}`;
    let mod;
    if (await exists(target)) {
      mod = JSON.parse(await readFile(target, 'utf8'));
    } else {
      const generated = await withRetries(`${book.title} ${stage.id} mod`, async () => {
        const result = await openRouter([
          { role: 'system', content: '你是 XianTu 小说剧本 Mod 制作者。你亲自依据正文做事实提取与阶段生成，只输出可解析 JSON。' },
          { role: 'user', content: prompt },
        ], 32_000);
        const parsed = jsonFromModel(result.content);
        if (parsed?.schema !== 'xiantu.scenario-mod') throw new Error('Response is not a scenario mod');
        return { parsed };
      });
      mod = generated.parsed;
      await writeFile(target, JSON.stringify(mod, null, 2));
    }
    const sourcesPath = join(stagesDir, `${stage.id}.sources.md`);
    const relationsPath = join(stagesDir, `${stage.id}.relationship-audit.md`);
    if (!(await exists(sourcesPath)) || !(await exists(relationsPath))) {
      const { parsed: audit } = await withRetries(`${book.title} ${stage.id} audit`, async () => {
        const auditResult = await openRouter([
          { role: 'system', content: '你是小说 Mod 事实审计员。只输出 JSON。' },
          { role: 'user', content: `你刚刚依据《${book.title}》正文生成了以下 Mod。输出 {"sourcesMarkdown":"...","relationshipAuditMarkdown":"...","uncertainties":["..."]}。来源审计要列开场章节、人物状态、能力装备获得时间、未采用的不确定事实；关系审计要逐人列出与主角关系/好感依据、NPC-NPC 关系、死亡或未登场排除项。不要复制长段正文。\n\nSTAGE:\n${JSON.stringify(stage)}\n\nEVIDENCE:\n${JSON.stringify(evidence)}\n\nMOD:\n${JSON.stringify(mod)}` },
        ], 10_000);
        return { parsed: jsonFromModel(auditResult.content) };
      });
      await writeFile(sourcesPath, audit.sourcesMarkdown || '');
      await writeFile(relationsPath, audit.relationshipAuditMarkdown || '');
      await writeFile(join(stagesDir, `${stage.id}.uncertainties.json`), JSON.stringify(audit.uncertainties || [], null, 2));
    }
    console.log(`[${book.title}] generated ${stage.id}`);
  });
}

await mkdir(outputRoot, { recursive: true });
for (const book of books) await processBook(book);
console.log(`Done: ${outputRoot}`);
