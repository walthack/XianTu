#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const registryPath = join(root, 'src/modules/scenarioMods/builtins/character-registry.json');
const scanDir = join(root, 'mod-kit/generated/deepseek-v4-flash/character-canon/boss-ability-scan');

const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
const targets = registry.characters.filter(
  character => (character.staticProfile?.signatureAbilities || []).length > 0,
);
const targetNames = new Set(targets.map(character => character.canonicalName));
const resultFiles = readdirSync(scanDir).filter(
  file => file.endsWith('.json') && !file.startsWith('_'),
);

const issues = [];
let verified = 0;
let unseen = 0;
let manualReview = 0;

for (const character of targets) {
  const name = character.canonicalName;
  const expectedAbilities = character.staticProfile.signatureAbilities.map(String);
  const resultPath = join(scanDir, `${name}.json`);
  let result;

  try {
    result = JSON.parse(readFileSync(resultPath, 'utf8'));
  } catch (error) {
    issues.push({ name, kind: 'missing_or_invalid_json', detail: error.message });
    continue;
  }

  if (!Array.isArray(result.verifyExisting)) {
    issues.push({ name, kind: 'missing_verify_existing', expected: expectedAbilities });
    continue;
  }

  const actualAbilities = result.verifyExisting.map(item => String(item?.名 || ''));
  const missing = expectedAbilities.filter(ability => !actualAbilities.includes(ability));
  const stale = actualAbilities.filter(ability => !expectedAbilities.includes(ability));
  const duplicates = actualAbilities.filter(
    (ability, index) => ability && actualAbilities.indexOf(ability) !== index,
  );
  const invalidVerdicts = result.verifyExisting
    .filter(item => !['证实', '未见'].includes(item?.判))
    .map(item => ({ ability: item?.名, verdict: item?.判 }));

  for (const item of result.verifyExisting) {
    if (item?.判 === '证实') verified += 1;
    if (item?.判 === '未见') unseen += 1;
    if (String(item?.复核 || '').includes('待人工')) manualReview += 1;
  }

  if (missing.length || stale.length || duplicates.length || invalidVerdicts.length) {
    issues.push({
      name,
      kind: 'verify_existing_mismatch',
      expectedCount: expectedAbilities.length,
      actualCount: actualAbilities.length,
      missing,
      stale,
      duplicates: [...new Set(duplicates)],
      invalidVerdicts,
    });
  }
}

const extraFiles = resultFiles
  .map(file => file.slice(0, -5))
  .filter(name => !targetNames.has(name));

const report = {
  targetCount: targets.length,
  resultFileCount: resultFiles.length,
  issueCount: issues.length,
  issues,
  extraFiles,
  verdicts: { verified, unseen, manualReview },
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`目标 ${report.targetCount} 人；结果文件 ${report.resultFileCount} 份；问题角色 ${report.issueCount} 人。`);
  console.log(`验旧结论：证实 ${verified}，未见 ${unseen}，待人工 ${manualReview}。`);
  for (const issue of issues) {
    console.log(`- ${issue.name}: ${issue.kind}`);
    if (issue.missing?.length) console.log(`  缺当前条目：${issue.missing.join('；')}`);
    if (issue.stale?.length) console.log(`  多旧条目：${issue.stale.join('；')}`);
    if (issue.duplicates?.length) console.log(`  重复条目：${issue.duplicates.join('；')}`);
  }
  if (extraFiles.length) console.log(`非目标 JSON：${extraFiles.join('；')}`);
}

if (issues.length) process.exitCode = 1;
