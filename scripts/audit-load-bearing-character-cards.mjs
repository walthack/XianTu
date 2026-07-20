#!/usr/bin/env node

// Deterministic coverage audit for character cards.
//
// Two intentionally separate layers:
// 1. Structured stage characters are a hard contract: every canon.characters[]
//    entry must resolve to a canonical card or alias.
// 2. Extraction-only names are review candidates, not automatic cards. They are
//    ranked by narrative responsibility so generic groups and one-line mentions
//    do not silently become character canon.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generatedRoot = path.join(root, 'mod-kit/generated/deepseek-v4-flash');
const canonRoot = path.join(generatedRoot, 'character-canon');
const books = ['qingyu', 'yunlong', 'yange'];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function addKnownName(known, ownerByName, name, owner) {
  const clean = String(name || '').trim();
  if (!clean) return;
  known.add(clean);
  if (!ownerByName.has(clean)) ownerByName.set(clean, owner);
}

const cards = readJson(path.join(canonRoot, 'character-cards-v3.json')).characters;
const known = new Set();
const ownerByName = new Map();
for (const card of cards) {
  for (const name of [
    card.canonicalName,
    ...(card.aliases || []),
    ...(card.review?.aliasMerged || []),
  ]) addKnownName(known, ownerByName, name, card.canonicalName);
}

const aliasRegistryPath = path.join(canonRoot, 'character-alias-registry.json');
if (fs.existsSync(aliasRegistryPath)) {
  for (const entry of readJson(aliasRegistryPath).characters || []) {
    const owner = ownerByName.get(entry.canonicalName);
    if (!owner) continue;
    for (const alias of entry.aliases || []) addKnownName(known, ownerByName, alias, owner);
  }
}

function resolveKnown(rawName) {
  const name = String(rawName || '').trim();
  if (!name) return null;
  if (known.has(name)) return ownerByName.get(name) || name;

  const parts = name
    .replace(/[（(][^）)]*[）)]/g, value => `|${value.slice(1, -1)}|`)
    .split(/[|、/]/)
    .map(value => value.trim())
    .filter(Boolean);
  for (const part of parts) if (known.has(part)) return ownerByName.get(part) || part;

  // Treat a known personal name plus a pure state/title suffix as the same card,
  // e.g. “安乐公主尸体”. Do not use unrestricted substring matching.
  for (const candidate of known) {
    if (candidate.length < 2 || !name.startsWith(candidate)) continue;
    const suffix = name.slice(candidate.length);
    if (/^(?:尸体|遗体|本人|一行|夫妇|母子|父子|主仆|及其部众)$/.test(suffix)) {
      return ownerByName.get(candidate) || candidate;
    }
  }
  return null;
}

const genericPattern = /(?:群臣|众人|百姓|军士|士卒|守军|追兵|部众|使者|武士|侍卫|内侍|宫女|侍女|奴婢|女忍者|老僧|尸体|家眷|官员|宾客|随从|仆役|敌军|全体|刺客|美妇|鲛人)$/;
function looksGeneric(name) {
  return genericPattern.test(name)
    || /(?:军|大营|商会|商行|天策府|鬼王峒)$/.test(name)
    || /^(?:一名|一位|两名|数名|众|某|其余|其他)/.test(name)
    || /[、/]/.test(name)
    || name.length < 2
    || name.length > 12;
}

const stageGaps = new Map();
const stageTexts = [];
for (const book of books) {
  const stageDir = path.join(generatedRoot, book, 'stages');
  for (const file of fs.readdirSync(stageDir).filter(name => name.endsWith('.json')).sort()) {
    const mod = readJson(path.join(stageDir, file));
    const stageId = mod.manifest?.id || file.replace(/\.json$/, '');
    const text = JSON.stringify(mod);
    stageTexts.push({ book, stageId, text });
    for (const character of mod.canon?.characters || []) {
      if (resolveKnown(character.name)) continue;
      const key = `${character.id} (${character.name})`;
      const row = stageGaps.get(key) || { id: character.id, name: character.name, stages: [] };
      row.stages.push(stageId);
      stageGaps.set(key, row);
    }
  }
}

const candidates = new Map();
function candidate(name, book, batch) {
  const clean = String(name || '').trim();
  if (!clean || resolveKnown(clean)) return null;
  const key = `${book}:${clean}`;
  if (!candidates.has(key)) {
    candidates.set(key, {
      book,
      name: clean,
      batches: new Set(),
      participantEvents: 0,
      majorEvents: 0,
      climaxEvents: 0,
      characterStates: 0,
      relationshipRefs: 0,
      contentHoldings: 0,
    });
  }
  const row = candidates.get(key);
  row.batches.add(batch);
  return row;
}

for (const book of books) {
  const extractionDir = path.join(generatedRoot, book, 'extraction');
  for (const file of fs.readdirSync(extractionDir).filter(name => /^batch-\d+\.json$/.test(name)).sort()) {
    const data = readJson(path.join(extractionDir, file));
    const batch = data.batch ?? file;
    for (const event of data.events || []) {
      for (const name of event.participants || []) {
        const row = candidate(name, book, batch);
        if (!row) continue;
        row.participantEvents += 1;
        if (event.isMajor) row.majorEvents += 1;
        if (event.isClimax) row.climaxEvents += 1;
      }
    }
    for (const state of data.characterStates || []) {
      const row = candidate(state.name, book, batch);
      if (row) row.characterStates += 1;
      for (const relationship of state.relationships || []) {
        const related = candidate(relationship.other, book, batch);
        if (related) related.relationshipRefs += 1;
      }
    }
    for (const fact of data.contentFacts || []) {
      for (const name of fact.holders || []) {
        const row = candidate(name, book, batch);
        if (row) row.contentHoldings += 1;
      }
    }
  }
}

const rankedCandidates = [...candidates.values()]
  // A contentFact holder can be a faction, location, army, or other collective.
  // It is supporting evidence only; it cannot nominate a character by itself.
  .filter(row => row.participantEvents > 0 || row.characterStates > 0 || row.relationshipRefs > 0)
  .map(row => {
  const stageMentions = stageTexts.filter(stage => stage.book === row.book && stage.text.includes(row.name)).length;
  const score = row.climaxEvents * 12
    + row.majorEvents * 6
    + row.characterStates * 5
    + row.relationshipRefs * 3
    + row.contentHoldings * 3
    + row.participantEvents * 2
    + row.batches.size * 2
    + stageMentions * 8;
  return {
    ...row,
    batches: [...row.batches].sort((a, b) => Number(a) - Number(b)),
    stageMentions,
    generic: looksGeneric(row.name),
    score,
  };
}).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'zh-Hans-CN'));

const result = {
  generatedAt: new Date().toISOString(),
  counts: {
    canonicalCards: cards.length,
    structuredStageGaps: stageGaps.size,
    extractionReviewCandidates: rankedCandidates.filter(row => !row.generic).length,
    genericExtractionLabels: rankedCandidates.filter(row => row.generic).length,
  },
  structuredStageGaps: [...stageGaps.values()],
  topExtractionReviewCandidates: rankedCandidates.filter(row => !row.generic).slice(0, 80),
  topGenericLabels: rankedCandidates.filter(row => row.generic).slice(0, 30),
};

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  console.log(JSON.stringify(result.counts, null, 2));
  console.log('\nStructured stage gaps:');
  console.log(JSON.stringify(result.structuredStageGaps, null, 2));
  console.log('\nTop extraction-only review candidates:');
  console.table(result.topExtractionReviewCandidates.slice(0, 30).map(row => ({
    book: row.book,
    name: row.name,
    score: row.score,
    batches: row.batches.length,
    events: row.participantEvents,
    major: row.majorEvents,
    climax: row.climaxEvents,
    states: row.characterStates,
    relations: row.relationshipRefs,
    holdings: row.contentHoldings,
    stages: row.stageMentions,
  })));
}

if (process.argv.includes('--fail-on-stage-gap') && stageGaps.size > 0) process.exitCode = 1;
