#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { applyWorldSimRefinementOverlay } from './world-sim-refinement-overlay.mjs';
import { BASELINE_OMEN_TEXT, FORBIDDEN_OMEN_TEXT, LATIN_RESIDUE } from './world-sim-omen-guards.mjs';

const root = resolve(import.meta.dirname, '..');
const generatedRoot = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');

// 每批一个隔离工件目录和一份 tracked overlay；已完成的批次保持可重跑。
const batches = {
  'qingyu-yunlong': { books: ['qingyu', 'yunlong'], artifact: 'world-sim-refinement-2026-08-14', overlay: 'qingyu-yunlong.json' },
  yange: { books: ['yange'], artifact: 'world-sim-refinement-yange-2026-08-14', overlay: 'yange.json' },
};
const batchId = process.env.WORLD_SIM_BATCH || 'qingyu-yunlong';
const batch = batches[batchId];
if (!batch) throw new Error(`unknown WORLD_SIM_BATCH ${batchId}; expected ${Object.keys(batches).join('|')}`);

const artifactRoot = join(root, '.xiantu-server', batch.artifact);
const overlayPath = join(root, 'mod-kit', 'world-sim-refinements', batch.overlay);
const books = batch.books;
const command = process.argv[2] || 'prepare';


function compactCharacter(character) {
  if (!character) return undefined;
  return {
    id: character.id,
    name: character.name,
    role: character.role,
    description: character.description,
    profile: character.profile,
  };
}

async function loadStages() {
  const rows = [];
  for (const book of books) {
    const stageDir = join(generatedRoot, book, 'stages');
    const files = (await readdir(stageDir)).filter(name => name.endsWith('.json') && !name.endsWith('.uncertainties.json')).sort();
    for (const file of files) {
      const path = join(stageDir, file);
      const mod = JSON.parse(await readFile(path, 'utf8'));
      const events = new Map((mod.scenario?.events || []).map(event => [event.id, event]));
      const characters = new Map((mod.canon?.characters || []).map(character => [character.id, character]));
      const locations = new Map((mod.canon?.locations || []).map(location => [location.id, location.name]));
      const situations = (mod.scenario?.worldSimulation?.situations || [])
        .filter(situation => situation.id.startsWith('world-sim.baseline.') && situation.omen)
        .map(situation => {
          const event = events.get(situation.sourceEventId);
          const allowedCharacterIds = (event?.relatedCharacterIds || []).filter(id => characters.has(id));
          return {
            stageId: mod.manifest.id,
            situationId: situation.id,
            sourceEventId: situation.sourceEventId,
            omenId: situation.omen.id,
            current: {
              title: situation.title,
              summary: situation.summary,
              observableFacts: situation.omen.observableFacts,
              environmentFallback: situation.omen.environmentFallback,
              presentation: situation.omen.presentation,
            },
            event: {
              name: event?.name,
              description: event?.description,
              objective: event?.objective,
              axisBeat: event?.axisBeat,
              location: locations.get(event?.locationId),
            },
            allowedCharacterIds,
            characters: allowedCharacterIds.map(id => compactCharacter(characters.get(id))).filter(Boolean),
          };
        });
      rows.push({
        book,
        file,
        path,
        stageId: mod.manifest.id,
        stageName: mod.manifest.name,
        opening: mod.scenario?.opening,
        situations,
      });
    }
  }
  return rows;
}

function outputSchema(count) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['entries'],
    properties: {
      entries: {
        type: 'array',
        minItems: count,
        maxItems: count,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['situationId', 'title', 'summary', 'observableFacts', 'preferredCharacterIds', 'environmentFallback', 'presentation'],
          properties: {
            situationId: { type: 'string' },
            title: { type: 'string' },
            summary: { type: 'string' },
            observableFacts: { type: 'array', minItems: 2, maxItems: 3, items: { type: 'string' } },
            preferredCharacterIds: { type: 'array', maxItems: 2, items: { type: 'string' } },
            environmentFallback: { type: 'string' },
            presentation: {
              type: 'object',
              additionalProperties: false,
              required: ['title', 'text'],
              properties: { title: { type: 'string' }, text: { type: 'string' } },
            },
          },
        },
      },
    },
  };
}

function promptForStage(stage) {
  const data = {
    stageId: stage.stageId,
    stageName: stage.stageName,
    opening: stage.opening,
    situations: stage.situations,
  };
  return `你是六朝架空历史互动叙事的内容编辑。请把下面一个 stage 的自动模板征兆逐条精修，并严格输出 schema JSON。\n\n目标：在承重事件发生前，让玩家从人物言行、使者口信、现场痕迹或环境异动感到局势变化；只写当前可观察事实，结果必须未知，玩家可以继续当前行动。\n\n硬约束：\n1. entries 数量、顺序、situationId 与输入完全一致，不漏项。\n2. 不改变人物性格、身份或知识边界；preferredCharacterIds 只能从该条 allowedCharacterIds 选择，没合适人物就留空。\n3. 不写玩家、系统、回合、倒计时、机会卡、原著、剧情、结局、尚未发生、事情还没开始等元语言。\n4. 不断言死亡、登基、遇袭成功、被俘、叛逃等确定结果；可以写换防、失联、封路、异常调动、器物痕迹、传言互相矛盾等征兆。\n5. 不添加新事实；所有具体细节必须能由 event、location、人物卡或较保守的现场感官推得。无法安全具体化时宁可克制。\n6. title 4–18字；summary 20–90字，描述当前压力而非结果；observableFacts 2–3条，每条8–45字；environmentFallback 25–100字；presentation.title 2–12字；presentation.text 45–140字。\n7. presentation.text 要像正文中自然插入的一小段，明确传递局势变化但不替玩家决定去留；避免每条都用“有人低声提到”“正在重新核对”。\n8. 成人或私密内容只作中性、不露骨的情境暗示，不扩写身体或性行为。\n9. 全部文字必须是中文，不得出现任何英文单词或拉丁字母；人名必须与输入的人物卡完全一致，不得改字、不得自造新人名。\n10. 若该 event 本身要玩家去发现某个身份、真名、内奸或秘密，征兆只能写引出怀疑的可观察摩擦，不得用肯定句提前说出谜底。\n\n输入数据：\n${JSON.stringify(data)}`;
}

async function prepare() {
  // 人工纵切关（如 lyg.dingtao_beijing）没有 baseline situation，不进本批。
  const stages = (await loadStages()).filter(stage => stage.situations.length > 0);
  await mkdir(join(artifactRoot, 'prompts'), { recursive: true });
  await mkdir(join(artifactRoot, 'results'), { recursive: true });
  await writeFile(join(artifactRoot, 'targets.json'), `${JSON.stringify(stages, null, 2)}\n`);
  for (const stage of stages) {
    await writeFile(join(artifactRoot, 'prompts', `${stage.stageId}.txt`), promptForStage(stage));
    await writeFile(join(artifactRoot, 'prompts', `${stage.stageId}.schema.json`), JSON.stringify(outputSchema(stage.situations.length)));
  }
  console.log(JSON.stringify({ stages: stages.length, situations: stages.reduce((sum, stage) => sum + stage.situations.length, 0), artifactRoot }, null, 2));
}

function runGrok(promptPath, schemaPath) {
  return new Promise((resolvePromise, rejectPromise) => {
    const args = [
      '--prompt-file', promptPath,
      '--model', 'grok-4.6',
      // low 档实测有两类单关退化：用占位条目凑满 schema 定长（shixiang_ambush），
      // 以及整段情节挪到别的事件上（changgan_interlude）。两者 medium 重跑均可修复。
      '--reasoning-effort', process.env.WORLD_SIM_EFFORT || 'medium',
      '--disable-web-search', '--no-memory', '--no-subagents',
      '--tools', '',
      '--json-schema', requireText(schemaPath),
    ];
    const child = spawn('grok', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const timer = setTimeout(() => child.kill('SIGTERM'), 600_000);
    child.on('error', rejectPromise);
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) rejectPromise(new Error(`grok exit ${code}: ${stderr.slice(-1200)}`));
      else resolvePromise({ stdout, stderr });
    });
  });
}

function parseFirstJsonObject(text) {
  const start = text.indexOf('{');
  if (start < 0) throw new Error('grok stdout has no JSON object');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(start, index + 1));
    }
  }
  throw new Error('grok stdout contains incomplete JSON');
}

function requireText(path) {
  return globalThis.__schemaCache?.get(path) || '';
}

async function run() {
  const allTargets = JSON.parse(await readFile(join(artifactRoot, 'targets.json'), 'utf8'));
  const selectedIds = new Set(process.argv.slice(3));
  const targets = selectedIds.size ? allTargets.filter(stage => selectedIds.has(stage.stageId)) : allTargets;
  globalThis.__schemaCache = new Map();
  for (const stage of targets) {
    const schemaPath = join(artifactRoot, 'prompts', `${stage.stageId}.schema.json`);
    globalThis.__schemaCache.set(schemaPath, await readFile(schemaPath, 'utf8'));
  }
  const failures = [];
  let cursor = 0;
  async function worker(workerId) {
    while (cursor < targets.length) {
      const stage = targets[cursor++];
      const resultPath = join(artifactRoot, 'results', `${stage.stageId}.json`);
      try {
        const promptPath = join(artifactRoot, 'prompts', `${stage.stageId}.txt`);
        const schemaPath = join(artifactRoot, 'prompts', `${stage.stageId}.schema.json`);
        const result = await runGrok(promptPath, schemaPath);
        const wrapper = parseFirstJsonObject(result.stdout);
        const structured = wrapper.structuredOutput || JSON.parse(wrapper.text);
        await writeFile(resultPath, `${JSON.stringify({
          stageId: stage.stageId,
          model: 'grok-4.6-build',
          costUsd: Number(wrapper.total_cost_usd || 0),
          usage: wrapper.usage,
          output: structured,
        }, null, 2)}\n`);
        await writeFile(join(artifactRoot, 'results', `${stage.stageId}.stderr.log`), result.stderr);
        console.log(`[${workerId}] ${stage.stageId}: ${structured.entries?.length || 0}/${stage.situations.length}`);
      } catch (error) {
        failures.push({ stageId: stage.stageId, error: String(error) });
        console.error(`[${workerId}] ${stage.stageId}: FAILED ${error}`);
      }
    }
  }
  await Promise.all([worker(1), worker(2)]);
  await writeFile(join(artifactRoot, 'failures.json'), `${JSON.stringify(failures, null, 2)}\n`);
  if (failures.length) process.exitCode = 1;
}

function validateProposal(stage, proposal) {
  const issues = [];
  const expected = stage.situations;
  const entries = proposal?.entries || [];
  if (entries.length !== expected.length) issues.push(`entry count ${entries.length} != ${expected.length}`);
  const expectedById = new Map(expected.map(item => [item.situationId, item]));
  const seen = new Set();
  for (const entry of entries) {
    const target = expectedById.get(entry.situationId);
    if (!target) { issues.push(`unknown situation ${entry.situationId}`); continue; }
    if (seen.has(entry.situationId)) issues.push(`duplicate situation ${entry.situationId}`);
    seen.add(entry.situationId);
    const texts = [entry.title, entry.summary, ...(entry.observableFacts || []), entry.environmentFallback, entry.presentation?.title, entry.presentation?.text];
    for (const value of texts) {
      if (typeof value !== 'string' || !value.trim()) issues.push(`${entry.situationId}: empty text`);
      else {
        if (FORBIDDEN_OMEN_TEXT.test(value)) issues.push(`${entry.situationId}: forbidden wording: ${value}`);
        if (BASELINE_OMEN_TEXT.test(value)) issues.push(`${entry.situationId}: baseline wording remains: ${value}`);
        if (LATIN_RESIDUE.test(value)) issues.push(`${entry.situationId}: latin residue: ${value}`);
      }
    }
    if (entry.title.length < 4 || entry.title.length > 18) issues.push(`${entry.situationId}: title length`);
    if (entry.summary.length < 20 || entry.summary.length > 100) issues.push(`${entry.situationId}: summary length`);
    if ((entry.observableFacts || []).length < 2 || (entry.observableFacts || []).length > 3) issues.push(`${entry.situationId}: facts count`);
    if (entry.environmentFallback.length < 20 || entry.environmentFallback.length > 120) issues.push(`${entry.situationId}: fallback length`);
    if (entry.presentation.text.length < 35 || entry.presentation.text.length > 170) issues.push(`${entry.situationId}: presentation length`);
  }
  for (const target of expected) if (!seen.has(target.situationId)) issues.push(`missing situation ${target.situationId}`);
  return issues;
}

async function merge() {
  const targets = JSON.parse(await readFile(join(artifactRoot, 'targets.json'), 'utf8'));
  const entries = [];
  const issues = [];
  let totalCostUsd = 0;
  for (const stage of targets) {
    try {
      const result = JSON.parse(await readFile(join(artifactRoot, 'results', `${stage.stageId}.json`), 'utf8'));
      totalCostUsd += Number(result.costUsd || result.usage?.total_cost_usd || 0);
      const stageIssues = validateProposal(stage, result.output);
      if (stageIssues.length) { issues.push({ stageId: stage.stageId, issues: stageIssues }); continue; }
      const targetById = new Map(stage.situations.map(item => [item.situationId, item]));
      for (const entry of result.output.entries) {
        const target = targetById.get(entry.situationId);
        const allowed = new Set(target.allowedCharacterIds);
        entries.push({
          stageId: stage.stageId,
          situationId: entry.situationId,
          sourceEventId: target.sourceEventId,
          title: entry.title.trim(),
          summary: entry.summary.trim(),
          observableFacts: entry.observableFacts.map(item => item.trim()),
          preferredCharacterIds: [...new Set(entry.preferredCharacterIds || [])].filter(id => allowed.has(id)),
          environmentFallback: entry.environmentFallback.trim(),
          presentation: { title: entry.presentation.title.trim(), text: entry.presentation.text.trim() },
        });
      }
    } catch (error) {
      issues.push({ stageId: stage.stageId, issues: [String(error)] });
    }
  }
  const merged = { version: 1, generatedAt: new Date().toISOString(), model: 'grok-4.6-build', books, entries };
  await writeFile(join(artifactRoot, 'merged-draft.json'), `${JSON.stringify(merged, null, 2)}\n`);
  await writeFile(join(artifactRoot, 'merge-issues.json'), `${JSON.stringify(issues, null, 2)}\n`);
  console.log(JSON.stringify({ entries: entries.length, stagesWithIssues: issues.length, totalCostUsd, issues }, null, 2));
  if (issues.length) process.exitCode = 1;
}

async function apply() {
  const overlay = JSON.parse(await readFile(join(artifactRoot, 'merged-draft.json'), 'utf8'));
  await mkdir(join(root, 'mod-kit', 'world-sim-refinements'), { recursive: true });
  await writeFile(overlayPath, `${JSON.stringify(overlay, null, 2)}\n`);
  let applied = 0;
  for (const stage of await loadStages()) {
    const mod = JSON.parse(await readFile(stage.path, 'utf8'));
    applied += applyWorldSimRefinementOverlay(mod, overlay);
    await writeFile(stage.path, `${JSON.stringify(mod, null, 2)}\n`);
  }
  console.log(JSON.stringify({ overlayPath, applied }, null, 2));
}

if (command === 'prepare') await prepare();
else if (command === 'run') await run();
else if (command === 'merge') await merge();
else if (command === 'apply') await apply();
else throw new Error(`unknown command: ${command}`);
