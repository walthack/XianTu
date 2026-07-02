#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const canonDir = join(root, 'mod-kit/generated/deepseek-v4-flash/character-canon');
const outDir = join(canonDir, 'minimax-v3-audit');
const sourcePath = join(canonDir, 'character-cards-v3.json');

const focusFlags = new Set([
  'needs-second-review',
  'stage-identity-varies',
  'female-relationship-phase-needed',
]);

const sensitivePatterns = [
  /乳[^，。；、\s]*/g,
  /阴[^，。；、\s]*/g,
  /肛[^，。；、\s]*/g,
  /交欢|性交|强占|开苞|破处|泄欲|性爱|性奴|性伴侣|鼎炉|侍奴/g,
  /裸[^，。；、\s]*/g,
  /处子|元红/g,
];

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join('；');
  if (typeof value === 'object') return Object.values(value).map(textOf).filter(Boolean).join('；');
  return String(value);
}

function sanitize(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(sanitize).filter(value => value !== '');
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, val]) => [key, sanitize(val)])
        .filter(([, val]) => val !== '' && !(Array.isArray(val) && val.length === 0)),
    );
  }
  let text = String(value).replace(/\s+/g, ' ').trim();
  for (const pattern of sensitivePatterns) {
    text = text.replace(pattern, '[关系细节略]');
  }
  return text.slice(0, 420);
}

function compactSourceCard(card) {
  return sanitize({
    book: card.__book,
    name: card.name || card['姓名'] || card.canonicalName,
    identity: card['身份'],
    relationToProtagonist: card['与主角关系'],
    joining: card['加入经过'],
    keyEvents: asArray(card['关键情节']).slice(0, 8),
    notes: card['备注'] || card['二验备注'] || card['审核备注'],
  });
}

function compactPhase(phase) {
  return sanitize({
    scope: phase.scope,
    seq: phase.seq,
    stageId: phase.stageId,
    book: phase.book,
    seqLo: phase.seqLo,
    seqHi: phase.seqHi,
    identity: phase.identity,
    role: phase.role,
    notes: asArray(phase.notes).slice(0, 5),
    status: phase.status,
    forbidden: phase.forbidden,
  });
}

function compactCharacter(character) {
  return sanitize({
    canonicalName: character.canonicalName,
    gender: character.gender,
    books: character.books,
    tier: character.tier,
    flags: character.review?.flags || [],
    conflicts: character.review?.conflicts || [],
    identitySummary: character.staticProfile?.identitySummary,
    relationToProtagonist: character.staticProfile?.relationToProtagonist,
    joining: character.staticProfile?.joining,
    keyEvents: asArray(character.staticProfile?.keyEvents).slice(0, 10),
    phaseIdentities: asArray(character.phaseIdentities).map(compactPhase),
    sourceCards: asArray(character.sourceCards).map(compactSourceCard),
  });
}

function buildPrompt(batchName, characters) {
  return [
    {
      role: 'system',
      content: [
        '你是《六朝》游戏 Mod 人物卡正典二审员。',
        '只审核“游戏进程/主轴/阶段身份/关系阶段化”，不要扩写成人或人体细节。',
        '如果原文证据不足，请标记为 human_review，不要自行脑补。',
        '输出必须是 JSON，不要 Markdown，不要额外说明。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: '审核 XianTu character-cards-v3 的高风险人物卡',
        batch: batchName,
        focus: [
          'needs-second-review：判断是否仍需人工二验；若能收敛，给出建议口径。',
          'stage-identity-varies：检查是否存在身份提前、身份滞后、阶段身份缺失。',
          'female-relationship-phase-needed：检查女性角色是否需要“转折前/转折后”关系身份；只写政治、阵营、受制/脱险/归属变化，不写成人细节。',
        ],
        requiredOutputSchema: {
          batch: 'string',
          items: [
            {
              canonicalName: 'string',
              verdict: 'ok | fix | human_review',
              flagsConfirmed: ['string'],
              flagsToRemove: ['string'],
              missingPhaseRules: ['string'],
              suspectedLeaks: ['string'],
              suggestedCanonicalPatch: {
                identitySummary: 'string?',
                phaseIdentities: ['string'],
                relationBoundary: 'string?',
              },
              reason: 'short Chinese reason with evidence pointer',
            },
          ],
          globalFindings: ['string'],
        },
        characters,
      }),
    },
  ];
}

const data = JSON.parse(await readFile(sourcePath, 'utf8'));
const focused = data.characters
  .filter(character => asArray(character.review?.flags).some(flag => focusFlags.has(flag)))
  .map(compactCharacter);

const batches = [
  {
    name: 'needs-second-review',
    characters: focused.filter(character => character.flags.includes('needs-second-review')),
  },
  {
    name: 'stage-identity-varies',
    characters: focused.filter(character => character.flags.includes('stage-identity-varies') && !character.flags.includes('needs-second-review')),
  },
  {
    name: 'female-relationship-phase-needed',
    characters: focused.filter(character => character.flags.includes('female-relationship-phase-needed') && !character.flags.includes('needs-second-review') && !character.flags.includes('stage-identity-varies')),
  },
];

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'focused-characters.json'), JSON.stringify(focused, null, 2));

for (const batch of batches) {
  await writeFile(
    join(outDir, `${batch.name}.messages.json`),
    JSON.stringify(buildPrompt(batch.name, batch.characters), null, 2),
  );
}

await writeFile(
  join(outDir, 'README.md'),
  [
    '# MiniMax v3 Audit Pack',
    '',
    `- Source: \`${sourcePath}\``,
    `- Focused characters: ${focused.length}`,
    ...batches.map(batch => `- ${batch.name}: ${batch.characters.length}`),
    '',
    'Output files should be saved next to these message files as `*.minimax.json`.',
  ].join('\n'),
);

console.log(JSON.stringify({
  outDir,
  focusedCharacters: focused.length,
  batches: batches.map(batch => ({ name: batch.name, characters: batch.characters.length })),
}, null, 2));
