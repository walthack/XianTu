#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const schema = await readFile(resolve(root, 'mod-kit/schema/xiantu.scenario-mod.v1.schema.json'), 'utf8');
const paths = process.argv.slice(2);
if (!paths.length) throw new Error('Pass one or more generated Mod JSON paths');

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) return [];
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return [[match[1], value]];
  }));
}

const apiKey = parseEnv(await readFile(resolve(root, '.env'), 'utf8')).OPENROUTER_API_KEY;
if (!apiKey) throw new Error('OPENROUTER_API_KEY is missing');

async function validate(path) {
  try {
    const result = await execFileAsync('node', ['scripts/validate-scenario-mod.mjs', path], { cwd: root });
    const output = `${result.stdout}${result.stderr}`;
    return { pass: !/\bFAIL\b|\bERROR\b/.test(output), output };
  } catch (error) {
    return { pass: false, output: `${error.stdout || ''}${error.stderr || ''}` };
  }
}

function parseJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  return JSON.parse(fenced || text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
}

async function repair(path, validation) {
  const original = await readFile(path, 'utf8');
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'XianTu Scenario Mod Repair' },
    body: JSON.stringify({
      model: 'deepseek/deepseek-v4-flash',
      temperature: 0,
      max_tokens: 32_000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: '你负责修复自己生成的 XianTu Scenario Mod。只输出修复后的完整 Mod JSON，不要包装。' },
        { role: 'user', content: `本地 validator 报告如下：\n${validation}\n\n只修复报告指出的结构、引用、flag 和状态机问题，同时修复明显的同类错误。保持原剧情阶段、人物状态、关系、能力获得时间和开场语义不变。缺失引用若是拼写错误就改为已存在 ID；若确实需要该实体，补充最小且与现有 Mod 事实一致的定义。不得删除正典约束来逃避校验。\n\nSCHEMA:\n${schema}\n\nMOD:\n${original}` },
      ],
    }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 500)}`);
  const content = JSON.parse(body).choices?.[0]?.message?.content || '';
  const repaired = parseJson(content);
  if (repaired.schema !== 'xiantu.scenario-mod') throw new Error('Repair did not return a scenario mod');
  await writeFile(path, JSON.stringify(repaired, null, 2));
}

async function repairWithRetries(path, validation) {
  let lastError;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      await repair(path, validation);
      return;
    } catch (error) {
      lastError = error;
      console.error(`RETRY ${path} response ${attempt}/6: ${error.message}`);
      await new Promise(resolvePromise => setTimeout(resolvePromise, attempt * 1000));
    }
  }
  throw lastError;
}

async function repairPath(path) {
  for (let round = 0; round < 8; round += 1) {
    const result = await validate(path);
    if (result.pass && !/WARNING/.test(result.output)) {
      console.log(`PASS ${path}`);
      return;
    }
    console.log(`REPAIR ${path} round ${round + 1}`);
    await repairWithRetries(path, `${result.output}\n特别注意：canon.relationships 的 fromCharacterId/toCharacterId 只能引用 canon.characters 中的人物 ID，不能引用 faction ID。`);
  }
  const final = await validate(path);
  if (!final.pass || /WARNING/.test(final.output)) throw new Error(`Repair exhausted for ${path}\n${final.output}`);
}

let cursor = 0;
await Promise.all(Array.from({ length: Math.min(4, paths.length) }, async () => {
  while (cursor < paths.length) await repairPath(paths[cursor++]);
}));
