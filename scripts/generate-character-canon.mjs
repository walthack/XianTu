#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const sourceRoot = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const outputRoot = join(sourceRoot, 'character-canon');
const nasRoot = '/Volumes/botsvault/06_material/XianTu-Mod-Kit/DeepSeek-V4-Flash/character-canon';
const obsidianRoot = '/Volumes/botsvault/08_memory/OpenClaw Wiki/syntheses/xiantu/character-canon';
const model = process.env.XIANTU_CHARACTER_CANON_MODEL || 'MiniMax-M2.7-highspeed';
const fallbackModel = process.env.XIANTU_CHARACTER_CANON_FALLBACK_MODEL || 'deepseek/deepseek-v4-flash';
const groupSize = Number(process.env.XIANTU_CHARACTER_CANON_GROUP_SIZE || 8);

const books = [
  { id: 'qingyu', title: '六朝清羽记' },
  { id: 'yunlong', title: '六朝云龙吟' },
  { id: 'yange', title: '六朝燕歌行' },
];

function parseArgs() {
  const rawArgs = process.argv.slice(2);
  const args = new Set(rawArgs);
  const bookArgs = new Set(rawArgs.filter(arg => !arg.startsWith('--')));
  return {
    books: books.filter(book => bookArgs.size === 0 || bookArgs.has(book.id)),
    force: args.has('--force'),
  };
}

function parseJson(text) {
  const raw = text.trim();
  let content = raw;
  try {
    const wrapped = JSON.parse(raw);
    content = typeof wrapped.text === 'string'
      ? wrapped.text
      : typeof wrapped.message?.content === 'string'
        ? wrapped.message.content
        : typeof wrapped.choices?.[0]?.message?.content === 'string'
          ? wrapped.choices[0].message.content
          : raw;
  } catch {
    content = raw;
  }
  const fenced = String(content).match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || String(content).slice(String(content).indexOf('{'), String(content).lastIndexOf('}') + 1);
  return JSON.parse(candidate);
}

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) return [];
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return [[match[1], value]];
  }));
}

async function openRouterJson(messages, label, maxTokens) {
  const envPath = join(root, '.env');
  const env = existsSync(envPath) ? parseEnv(await readFile(envPath, 'utf8')) : {};
  const apiKey = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is missing for fallback');
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/qianye60/XianTu',
          'X-Title': `XianTu Character Canon ${label}`,
        },
        body: JSON.stringify({
          model: fallbackModel,
          temperature: 0,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
          messages: [
            messages[0],
            {
              ...messages[1],
              content: `${messages[1].content}\n\n再次强调：输出必须是完整、闭合、可被 JSON.parse 解析的单个 JSON 对象。`,
            },
          ],
        }),
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 1000)}`);
      const content = JSON.parse(body).choices?.[0]?.message?.content || '';
      try {
        return parseJson(content);
      } catch (error) {
        const debugDir = join(outputRoot, '_debug');
        await mkdir(debugDir, { recursive: true });
        await writeFile(join(debugDir, `${label.replace(/[^a-z0-9._-]+/gi, '-')}-attempt-${attempt}.txt`), content);
        throw error;
      }
    } catch (error) {
      lastError = error;
      console.error(`[${label}] ${fallbackModel} attempt ${attempt}/4 failed: ${error.message}`);
      await new Promise(resolvePromise => setTimeout(resolvePromise, attempt * 2000));
    }
  }
  throw lastError;
}

async function mmxJson(messages, label, maxTokens = 8192) {
  if (process.env.XIANTU_CHARACTER_CANON_SKIP_MMX === '1') {
    console.error(`[${label}] MiniMax skipped; using ${fallbackModel}`);
    return openRouterJson(messages, label, maxTokens);
  }
  const messagesPath = join(tmpdir(), `xiantu-character-canon-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  await writeFile(messagesPath, JSON.stringify(messages, null, 2));
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const { stdout } = await execFileAsync('mmx', [
        'text', 'chat',
        '--model', model,
        '--messages-file', messagesPath,
        '--max-tokens', String(maxTokens),
        '--temperature', '0.1',
        '--non-interactive',
        '--quiet',
        '--output', 'json',
      ], {
        cwd: root,
        maxBuffer: 64 * 1024 * 1024,
        timeout: Number(process.env.XIANTU_CHARACTER_CANON_MMX_TIMEOUT_MS || 45000),
      });
      return parseJson(stdout);
    } catch (error) {
      lastError = error;
      const stderr = error.stderr ? String(error.stderr).slice(0, 1000) : '';
      console.error(`[${label}] MiniMax attempt ${attempt}/2 failed: ${error.message} ${stderr}`);
      await new Promise(resolvePromise => setTimeout(resolvePromise, attempt * 2000));
    }
  }
  console.error(`[${label}] falling back to ${fallbackModel}: ${lastError?.message || 'MiniMax failed'}`);
  return openRouterJson(messages, label, maxTokens);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function compactExtraction(entry) {
  return {
    batch: entry.batch,
    sourceRange: entry.sourceRange,
    events: entry.events || [],
    characterStates: entry.characterStates || [],
    contentFacts: entry.contentFacts || [],
    candidateStageEntries: entry.candidateStageEntries || [],
    uncertainties: entry.uncertainties || [],
  };
}

function arcPrompt(book, group, groupIndex) {
  return `你负责把《${book.title}》的正文抽取结果整理为可导入 XianTu 的角色正典事实片段。

只依据输入 JSON，不要编造。不要复述露骨情节；涉及亲密情节只保留对人物关系、心理、身份、剧情推进有影响的非露骨摘要。

输出严格 JSON：
{
  "book": "${book.id}",
  "fragment": ${groupIndex + 1},
  "characters": [{
    "canonicalName": "姓名",
    "aliases": [],
    "firstSeen": {"sourceIndex": 1, "heading": "..."},
    "lastSeen": {"sourceIndex": 2, "heading": "..."},
    "aliveState": "alive|dead|missing|unknown",
    "role": "剧情定位",
    "gender": "男|女|其他|unknown",
    "appearanceFacts": ["最多2条外貌/衣着/气质事实"],
    "personalityFacts": ["最多2条性格/行事风格事实"],
    "affiliations": [{"name": "势力/宗派/组织", "category": "sect|military|state|clan|organization", "role": "职位/身份", "exclusive": true}],
    "locations": ["地点名，最多3个"],
    "relationships": [{"other": "姓名", "relation": "关系", "scoreHint": 0}],
    "skills": [{"name": "技能/能力", "kind": "skill|technique", "exclusive": false}],
    "items": [{"name": "武器/装备/物品", "type": "weapon|armor|consumable|material|other", "holderStatus": "持有/失去/未知"}],
    "uncertainties": []
  }],
  "content": {
    "skills": [],
    "techniques": [],
    "items": []
  },
  "conflicts": [],
  "unresolved": []
}

必须特别注意：
- 不要把后期才出现或才获得的能力/装备提前。
- 如果人物死亡、离队、缺席，要写入 aliveState/stageAvailability。
- 宗派/势力归属是正典约束；某人属于某派时不要给其他派。
- 程宗扬的“生死根”这类唯一能力要标 exclusive。
- 每个片段最多输出 8 个最重要角色、8 条关系、8 个内容事实；宁可放入 unresolved，也不要输出超长 JSON。

INPUT:
${JSON.stringify(group)}`;
}

function mergePrompt(book, fragments, stagePlan) {
  return `你负责把《${book.title}》角色事实片段合并成 XianTu Scenario Mod 可用的角色库。

只依据输入片段和 stagePlan，不要编造。输出严格 JSON：
{
  "book": "${book.id}",
  "characters": [{
    "idSlug": "lowercase.ascii.slug",
    "name": "姓名",
    "aliases": [],
    "role": "剧情定位",
    "gender": "男|女|其他|unknown",
    "aliveStateByStage": {"stageId": "alive|dead|missing|absent|future|unknown"},
    "profile": {
      "appearance": "整合后的非露骨外貌/气质描述，缺证据则写原作未载",
      "personality": ["最多6项"],
      "currentAppearanceByStage": {"stageId": "该阶段状态"},
      "memoriesByStage": {"stageId": ["最多5条"]},
      "origin": "出身/身份",
      "race": "种族或原作未载",
      "spiritRoot": {"name": "灵根/特殊根性或原作未载", "tier": "品级或原作未载", "description": "说明"},
      "talents": [{"name": "天赋/体质/唯一能力", "description": "说明"}],
      "attributes": {"rootBone": 5, "spirituality": 5, "comprehension": 5, "fortune": 5, "charm": 5, "temperament": 5}
    },
    "affiliations": [{"factionName": "势力/宗派/组织", "category": "sect|military|state|clan|organization", "role": "职位/身份", "exclusive": true}],
    "locationByStage": {"stageId": "地点名或原作未载"},
    "skillNamesByStage": {"stageId": ["技能/能力名"]},
    "techniqueNamesByStage": {"stageId": ["功法名"]},
    "itemNamesByStage": {"stageId": ["武器/装备/物品名"]},
    "relationships": [{"otherName": "姓名", "relation": "关系", "score": 0, "stageId": "stageId", "evidence": "摘要"}],
    "evidence": [{"sourceIndex": 1, "heading": "...", "summary": "事实摘要"}],
    "unresolved": []
  }],
  "content": {
    "skills": [{"idSlug":"lowercase.ascii.slug","name":"名称","description":"说明","type":"类型","exclusiveHolderName":"姓名或空"}],
    "techniques": [{"idSlug":"lowercase.ascii.slug","name":"名称","description":"说明","grade":"品级","skillNames":["..."]}],
    "items": [{"idSlug":"lowercase.ascii.slug","name":"名称","description":"说明","type":"weapon|armor|consumable|material|other","exclusiveHolderName":"姓名或空"}]
  },
  "conflicts": [],
  "unresolved": []
}

阶段列表：
${JSON.stringify((stagePlan.stages || []).map(stage => ({ id: stage.id, title: stage.title, sourceStartIndex: stage.sourceStartIndex, sourceEndIndex: stage.sourceEndIndex, openingAfterSourceIndex: stage.openingAfterSourceIndex })))}

片段：
${JSON.stringify(fragments)}`;
}

async function copyTreeFiles(fromDir, toDir) {
  if (!existsSync(fromDir)) return;
  await mkdir(toDir, { recursive: true });
  const names = await readdir(fromDir, { withFileTypes: true });
  for (const entry of names) {
    const from = join(fromDir, entry.name);
    const to = join(toDir, entry.name);
    if (entry.isDirectory()) {
      await copyTreeFiles(from, to);
    } else {
      await copyFile(from, to);
    }
  }
}

async function writeSummary(book, canon) {
  const lines = [
    `# ${book.title} 角色库生成说明`,
    '',
    `- 生成模型：${model}`,
    `- 角色数：${canon.characters?.length || 0}`,
    `- 技能数：${canon.content?.skills?.length || 0}`,
    `- 功法数：${canon.content?.techniques?.length || 0}`,
    `- 物品数：${canon.content?.items?.length || 0}`,
    '',
    '## 角色索引',
    '',
    ...(canon.characters || []).map(character =>
      `- ${character.name}：${character.role || '原作未载'}；阶段状态 ${JSON.stringify(character.aliveStateByStage || {})}`),
  ];
  await writeFile(join(outputRoot, book.id, 'README.md'), `${lines.join('\n')}\n`);
}

async function processBook(book, force) {
  const extractionDir = join(sourceRoot, book.id, 'extraction');
  const stagePlanPath = join(sourceRoot, book.id, 'stage-plan.json');
  const outDir = join(outputRoot, book.id);
  const fragmentDir = join(outDir, 'fragments');
  await mkdir(fragmentDir, { recursive: true });
  const stagePlan = await readJson(stagePlanPath);
  const extractionFiles = (await readdir(extractionDir)).filter(name => name.endsWith('.json')).sort();
  const extractions = await Promise.all(extractionFiles.map(async name => compactExtraction(await readJson(join(extractionDir, name)))));
  const groups = [];
  for (let index = 0; index < extractions.length; index += groupSize) groups.push(extractions.slice(index, index + groupSize));

  for (let index = 0; index < groups.length; index += 1) {
    const fragmentPath = join(fragmentDir, `fragment-${String(index + 1).padStart(2, '0')}.json`);
    if (!force && existsSync(fragmentPath)) continue;
    const fragment = await mmxJson([
      { role: 'system', content: '你是严谨的小说事实整理员，只输出可解析 JSON。' },
      { role: 'user', content: arcPrompt(book, groups[index], index) },
    ], `${book.id} fragment ${index + 1}`);
    await writeFile(fragmentPath, JSON.stringify(fragment, null, 2));
    console.log(`[${book.title}] fragment ${index + 1}/${groups.length}`);
  }

  const fragmentFiles = (await readdir(fragmentDir)).filter(name => name.endsWith('.json')).sort();
  const fragments = await Promise.all(fragmentFiles.map(async name => readJson(join(fragmentDir, name))));
  const canonPath = join(outDir, `${book.id}.character-canon.json`);
  if (force || !existsSync(canonPath)) {
    const canon = await mmxJson([
      { role: 'system', content: '你是 XianTu 剧本 Mod 角色库合并器，只输出可解析 JSON。' },
      { role: 'user', content: mergePrompt(book, fragments, stagePlan) },
    ], `${book.id} merge`, 16000);
    await writeFile(canonPath, JSON.stringify(canon, null, 2));
    await writeSummary(book, canon);
    console.log(`[${book.title}] merged ${canon.characters?.length || 0} characters`);
  }
}

const args = parseArgs();
if (!args.books.length) throw new Error('No matching books requested.');
await mkdir(outputRoot, { recursive: true });
for (const book of args.books) await processBook(book, args.force);
await copyTreeFiles(outputRoot, nasRoot);
await copyTreeFiles(outputRoot, obsidianRoot);
console.log(`Character canon synced to ${nasRoot}`);
console.log(`Character canon synced to ${obsidianRoot}`);
