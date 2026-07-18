#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const stageRoot = path.join(root, 'mod-kit/generated/deepseek-v4-flash');
const builtinRoot = path.join(root, 'src/modules/scenarioMods/builtins');

const rules = [
  {
    decision: 55,
    description: '小紫是毒宗嫡传，不得回归为巫宗正统传人',
    banned: ['巫宗正统传人'],
  },
];

async function jsonFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await jsonFiles(target));
    else if (entry.isFile() && entry.name.endsWith('.json')) files.push(target);
  }
  return files;
}

const files = [
  ...await jsonFiles(path.join(stageRoot, 'qingyu/stages')),
  ...await jsonFiles(path.join(stageRoot, 'yunlong/stages')),
  ...await jsonFiles(path.join(stageRoot, 'yange/stages')),
  path.join(builtinRoot, 'character-registry.json'),
];
const errors = [];
for (const file of files) {
  const text = await readFile(file, 'utf8');
  for (const rule of rules) {
    for (const banned of rule.banned) {
      if (text.includes(banned)) {
        errors.push(`裁定 #${rule.decision}：${path.relative(root, file)} 命中禁词“${banned}”（${rule.description}）`);
      }
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`canon decision enforcement PASS: ${rules.length} rules / ${files.length} artifacts`);
