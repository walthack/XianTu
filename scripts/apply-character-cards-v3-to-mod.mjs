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
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generatedRoot = join(root, 'mod-kit/generated/deepseek-v4-flash');
const canonDir = join(generatedRoot, 'character-canon');
const cardsPath = join(canonDir, 'character-cards-v3.json');
const books = ['qingyu', 'yunlong', 'yange'];
const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');

// 角色总表（源数据 character-cards-v3.json）是跨书静态档案；个别早期关卡只出现未揭示身份的称谓，不能按 alias
// 自动补全真实身份与稳定画像。数据在 mod-kit/entity-ledger/card-time-gates.json（与运行时共用一份）。
const CARD_TIME_GATE_EXCLUSIONS = new Map(Object.entries(
  JSON.parse(readFileSync(join(root, 'mod-kit/entity-ledger/card-time-gates.json'), 'utf8')).stages,
).filter(([, gate]) => gate.at.includes('build')).map(([stageId, gate]) => [stageId, new Set(gate.exclude)]));

const DERIVED_TAGS = [
  '【历程】', '【生辰】',
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

function stagePhase(card, stageId) {
  return asArray(card.phaseIdentities).find(phase => phase.scope === 'stage-projection' && phase.stageId === stageId);
}

function phaseProfileValue(profile, currentPhase, key) {
  return currentPhase && Object.prototype.hasOwnProperty.call(currentPhase, key)
    ? currentPhase[key]
    : profile[key];
}

// 全量 P4：投影为「精简」角色 —— 只保留动态字段（role/gender + 运行时 profile 状态），
// 删除静态档案（appearance/personality/origin/派生 notes）。静态档案由 src/modules/scenarioMods/
// characterResolver.ts 在内置 mod 加载/物化时从 character-registry.json 还原。
// 本脚本只负责 slim 阶段字段与原始 notes 清理；派生 notes 只有运行时 resolver 一个实现，
// 避免构建期存在一份从未执行、却容易与运行时漂移的重复实现。
function applyCardToCharacter(character, card, stageId) {
  character.level = Number.isInteger(card.level)?card.level:null;
  character.levelSource = character.level===6 ? "清羽L18220：臻于六级，达到通幽" : "待剧情策划按原著逐时点核定；不从旧修仙名推导";
  if ('realm' in character || character.level !== null) character.realm = character.level===6 && character.id==='liuchao.character.xie_yi' ? "通幽" : "未知";
  if(card.presenceWindow) character.presenceWindow = structuredClone(card.presenceWindow);
  const profile = character.profile || {};
  const currentPhase = stagePhase(card, stageId);

  if (card.entityType) character.entityType = card.entityType;
  if (card.entityType === 'creature' || (card.gender && (!character.gender || character.gender === '未知'))) character.gender = card.gender;
  if (currentPhase?.role) character.role = currentPhase.role;

  // 只删【派生 notes】——它 100% 可由 registry 无损还原（等价性验证 notes 0 不一致）。
  // appearance/origin 保留不动：场景/提取特定，总表强制覆盖会抹掉场景差异。
  const blockedPrefixes = asArray(currentPhase?.blockedStageNotePrefixes);
  const keptNotes = asArray(profile.notes).filter(note =>
    !DERIVED_TAGS.some(tag => String(note).startsWith(tag))
    && !blockedPrefixes.some(prefix => String(note).startsWith(prefix)),
  );
  if (keptNotes.length) profile.notes = keptNotes; else delete profile.notes;

  // personality 通常稳定；存在显式逐关覆盖时，以阶段值阻断后期人格回灌。
  const cardPersonality = [...new Set(asArray(
    phaseProfileValue(card.staticProfile || {}, currentPhase, 'personality'),
  ).filter(Boolean))];
  if (cardPersonality.length) profile.personality = cardPersonality;

  // appearance 默认保持场景特写；只有人工写入逐关值时才覆盖，避免后期身体状态回灌。
  if (currentPhase && Object.prototype.hasOwnProperty.call(currentPhase, 'appearance')) {
    if (currentPhase.appearance) profile.appearance = currentPhase.appearance;
    else delete profile.appearance;
  }

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
      if (CARD_TIME_GATE_EXCLUSIONS.get(stageId)?.has(character.id)) continue;
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
