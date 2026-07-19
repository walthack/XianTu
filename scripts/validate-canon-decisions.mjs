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
  {
    decision: 108,
    description: '原典未限定玉姬总数为十二，不得回流固定数字编制',
    banned: ['十二玉姬'],
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
  ...await jsonFiles(path.join(builtinRoot, 'data')),
  path.join(builtinRoot, 'character-registry.json'),
  path.join(stageRoot, 'character-canon/qingyu.character-cards-v2.json'),
  path.join(stageRoot, 'character-canon/yunlong.character-cards-v2.json'),
  path.join(stageRoot, 'character-canon/yange.character-cards-v2.json'),
  path.join(stageRoot, 'character-canon/faction-details-v2-additions.json'),
  path.join(root, 'scripts/apply-char-support.mjs'),
  path.join(root, 'scripts/apply-review-decisions-to-canon.mjs'),
  path.join(root, 'scripts/extract-faction-details-from-epub.mjs'),
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
