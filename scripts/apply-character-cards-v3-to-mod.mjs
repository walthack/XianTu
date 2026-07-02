#!/usr/bin/env node

// Project character-cards-v3 into generated scenario stages.
//
// Landing path is the same as the v2 card flow documented in
// CHARACTER-CARD-TO-GAME.md:
//   character-cards-v3.json -> generated/*/stages/*.json canon.characters[].profile
//   sync-builtin-mods.mjs   -> src/modules/scenarioMods/builtins/data/*.json
//
// Usage:
//   node scripts/apply-character-cards-v3-to-mod.mjs [--dry-run] [--force]

import { cp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generatedRoot = join(root, 'mod-kit/generated/deepseek-v4-flash');
const canonDir = join(generatedRoot, 'character-canon');
const cardsPath = join(canonDir, 'character-cards-v3.json');
const books = ['qingyu', 'yunlong', 'yange'];
const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');

const DERIVED_TAGS = [
  '【关系】',
  '【称呼】',
  '【谈吐】',
  '【底线】',
  '【目标】',
  '【软肋】',
  '【绝技】',
  '【入伙】',
  '【情节】',
  '【结局】',
  '【阶段身份】',
  '【本阶段禁用】',
  '【人工正典】',
];

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function unique(values) {
  const out = [];
  const seen = new Set();
  for (const value of values.flat().filter(value => value !== undefined && value !== null && value !== '')) {
    const key = String(value).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function compact(value, max = 260) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function isUnset(value) {
  return !value || /^(未知|未载|原文未明确|原作未载|原作人物)$/.test(String(value).trim());
}

function stagePhase(card, stageId) {
  return asArray(card.phaseIdentities).find(phase => phase.scope === 'stage-projection' && phase.stageId === stageId);
}

function relationshipPhases(card) {
  return asArray(card.phaseIdentities).filter(phase => phase.scope === 'relationship-chain' || phase.scope === 'identity-chain');
}

function buildNotes(card, currentPhase) {
  const profile = card.staticProfile || {};
  const notes = [];
  const add = (tag, value, max = 360) => {
    const values = unique(asArray(value)).map(item => compact(item, max));
    if (values.length) notes.push(`【${tag}】${values.join('；')}`);
  };

  add('关系', profile.relationToProtagonist);
  add('称呼', profile.formsOfAddress);
  add('谈吐', profile.speechStyle);
  add('底线', profile.principles);
  add('目标', profile.goals);
  add('软肋', profile.weaknesses);
  add('绝技', profile.signatureAbilities);
  add('入伙', profile.joining);
  add('情节', asArray(profile.keyEvents).slice(0, 8));
  add('结局', profile.ending);

  for (const phase of relationshipPhases(card)) {
    const line = [
      phase.seq,
      phase.identity,
      phase.status ? `status=${phase.status}` : '',
    ].filter(Boolean).join('：');
    add('阶段身份', line, 520);
    if (phase.forbidden?.length) add('本阶段禁用', `${phase.seq}：${phase.forbidden.join('、')}`, 360);
  }

  if (currentPhase) {
    add('阶段身份', `当前关卡 ${currentPhase.stageId}：${currentPhase.identity || currentPhase.role || ''}`, 520);
    if (currentPhase.forbidden?.length) add('本阶段禁用', `${currentPhase.stageId}：${currentPhase.forbidden.join('、')}`, 360);
  }

  add('人工正典', card.review?.humanNotes);
  add('人工正典', card.review?.aliasMerged?.map(alias => `${alias} 已并入 ${card.canonicalName}`));
  add('人工正典', card.review?.followUps);

  return unique(notes);
}

function chooseOrigin(card, currentPhase) {
  return currentPhase?.identity || card.staticProfile?.identitySummary || '';
}

// 全量 P4：投影为「精简」角色 —— 只保留动态字段（role/gender + 运行时 profile 状态），
// 删除静态档案（appearance/personality/origin/派生 notes）。静态档案由 src/modules/scenarioMods/
// characterResolver.ts 在内置 mod 加载/物化时从 character-registry.json 还原。
// 还原逻辑与本文件的 buildNotes/chooseOrigin 一一对应（勿单方修改，需同步 resolver）。
function applyCardToCharacter(character, card, stageId) {
  const profile = character.profile || {};
  const currentPhase = stagePhase(card, stageId);

  if (card.gender && (!character.gender || character.gender === '未知')) character.gender = card.gender;
  if (currentPhase?.role) character.role = currentPhase.role;

  // 只删【派生 notes】——它 100% 可由 registry 无损还原（等价性验证 notes 0 不一致）。
  // appearance/origin 保留不动：场景/提取特定，卡强制覆盖会抹掉场景差异。
  const keptNotes = asArray(profile.notes).filter(note => !DERIVED_TAGS.some(tag => String(note).startsWith(tag)));
  if (keptNotes.length) profile.notes = keptNotes; else delete profile.notes;

  // personality：稳定属性，卡为准 → 卡非空则覆盖 stage（与 resolver.resolveOne 保持一致，勿单方改）。
  const cardPersonality = [...new Set(asArray(card.staticProfile?.personality).filter(Boolean))];
  if (cardPersonality.length) profile.personality = cardPersonality;

  character.profile = profile;
}

const cards = JSON.parse(await readFile(cardsPath, 'utf8'));
const byName = new Map();
for (const card of cards.characters || []) {
  byName.set(card.canonicalName, card);
  for (const alias of card.aliases || []) {
    if (!byName.has(alias)) byName.set(alias, card);
  }
}

let projected = 0;
let touchedCharacters = new Set();
let touchedStages = 0;
const missing = new Map();

for (const book of books) {
  const stageDir = join(generatedRoot, book, 'stages');
  if (!existsSync(stageDir)) continue;
  if (!dryRun) {
    const backupDir = join(generatedRoot, book, 'stages-pre-v3-cards-backup');
    if (existsSync(backupDir)) await rm(backupDir, { recursive: true });
    await cp(stageDir, backupDir, { recursive: true });
  }

  for (const file of (await readdir(stageDir)).filter(name => name.endsWith('.json') && !name.endsWith('.uncertainties.json')).sort()) {
    const path = join(stageDir, file);
    const mod = JSON.parse(await readFile(path, 'utf8'));
    const stageId = mod.manifest?.id || file.replace(/\.json$/, '');
    let changed = false;

    for (const character of mod.canon?.characters || []) {
      const card = byName.get(character.name);
      if (!card) {
        missing.set(character.name, (missing.get(character.name) || 0) + 1);
        continue;
      }
      applyCardToCharacter(character, card, stageId);
      changed = true;
      projected += 1;
      touchedCharacters.add(character.name);
    }

    if (changed) {
      touchedStages += 1;
      if (!dryRun) await writeFile(path, `${JSON.stringify(mod, null, 2)}\n`);
    }
  }
}

const topMissing = [...missing.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hans-CN'))
  .slice(0, 30)
  .map(([name, count]) => ({ name, count }));

console.log(JSON.stringify({
  dryRun,
  force,
  projected,
  touchedStages,
  touchedCharacters: touchedCharacters.size,
  topMissing,
}, null, 2));
