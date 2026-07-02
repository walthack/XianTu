#!/usr/bin/env node

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const canonDir = join(root, 'mod-kit/generated/deepseek-v4-flash/character-canon');
const sourceFiles = [
  { book: 'qingyu', path: join(canonDir, 'qingyu.character-cards-v2.json') },
  { book: 'yunlong', path: join(canonDir, 'yunlong.character-cards-v2.json') },
  { book: 'yange', path: join(canonDir, 'yange.character-cards-v2.json') },
];
const stageDir = join(root, 'src/modules/scenarioMods/builtins/data');

const STAGE_BOOK_PREFIX = {
  lcq: 'qingyu',
  lyl: 'yunlong',
  lyg: 'yange',
};

const PROTAGONIST = '程宗扬';
const FEMALE_HAREM_TERMS = ['后宫', '侍妾', '情人', '性奴', '奴婢', '主子', '主人', '收服', '归顺', '从属'];
const SECOND_REVIEW_TERMS = [
  '推断',
  '疑似',
  '未明确',
  '原文未载',
  '不详',
  '需要二验',
  '待二验',
  '待复核',
  '需复核',
  '阶段身份',
];

function unique(values) {
  const seen = new Set();
  const out = [];
  for (const value of values.flat().filter(value => value !== undefined && value !== null && value !== '')) {
    const key = typeof value === 'string' ? value.trim() : JSON.stringify(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function compact(value, max = 180) {
  const s = String(value || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

function textOf(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(textOf).join('；');
  if (typeof value === 'object') return Object.values(value).map(textOf).join('；');
  return String(value);
}

function stageBook(mod) {
  const id = mod.manifest?.id || '';
  return STAGE_BOOK_PREFIX[id.split('.')[0]] || '';
}

function stageSeq(mod) {
  const manifest = mod.manifest || {};
  const lo = Number.isFinite(manifest.axisSeqLo) ? manifest.axisSeqLo : null;
  const hi = Number.isFinite(manifest.axisSeqHi) ? manifest.axisSeqHi : lo;
  return { lo, hi };
}

function stageCharacterIdentity(character) {
  const profile = character.profile || {};
  return {
    role: character.role || '',
    description: character.description || '',
    origin: profile.origin || '',
    notes: asArray(profile.notes),
    relationText: '',
    raw: textOf([
      character.role,
      character.description,
      profile.origin,
      profile.notes,
      character.affiliations,
    ]),
  };
}

function canonicalV2Identity(cards) {
  const identities = unique(cards.map(card => card['身份']).filter(Boolean));
  if (!identities.length) return '';
  const phased = identities.find(value => value.includes('阶段身份'));
  return phased || identities[0];
}

function inferReviewFlags(name, cards, stageRows) {
  const sourceText = cards.map(card => textOf(card)).join('；');
  const relationshipText = cards.map(card => textOf([card['身份'], card['与主角关系'], card['加入经过'], card['关键情节'], card['目标动机']])).join('；')
    .replace(/非后宫成员/g, '')
    .replace(/非后宫/g, '')
    .replace(/不是后宫/g, '')
    .replace(/不是程宗扬后宫/g, '')
    .replace(/并非后宫/g, '');
  const flags = [];
  if (cards.length > 1) flags.push('duplicate-merged');
  if (SECOND_REVIEW_TERMS.some(term => sourceText.includes(term))) flags.push('needs-second-review');
  if (stageRows.length > 1 && new Set(stageRows.map(row => row.identity.origin || row.identity.role)).size > 1) flags.push('stage-identity-varies');
  if (cards.some(card => card.gender === '女') && FEMALE_HAREM_TERMS.some(term => relationshipText.includes(term))) flags.push('female-relationship-phase-needed');
  if (name === PROTAGONIST) flags.push('protagonist-phase-identity-required');
  if (name === '秦桧' || name === '徐君房') flags.push('known-phase-identity');
  return unique(flags);
}

function explicitPhaseRules(name, cards) {
  if (name === PROTAGONIST) {
    return [
      {
        scope: 'identity-chain',
        seq: 'lcq.stage_01-lcq.stage_02',
        identity: '序章：现代穿越者/左武军临时依附，不作为六朝社会身份链起点',
        status: 'allowed',
      },
      {
        scope: 'identity-chain',
        seq: 'lcq.stage_03',
        identity: '苏妲己名下奴隶（白湖商馆奴隶）',
        status: 'allowed',
      },
      {
        scope: 'identity-chain',
        seq: 'stage-specific',
        identity: '随国家、任务、出使名义变化；必须读取当前 stage 的 opening.playerRole / role / affiliations',
        status: 'rule',
      },
    ];
  }
  if (name === '秦桧') {
    return [
      {
        scope: 'identity-chain',
        seq: '<643',
        identity: '殇侯指派给程宗扬的第一智囊/家主伴当',
        status: 'allowed',
        forbidden: ['盘江程氏股东', '朝廷官员'],
      },
      {
        scope: 'identity-chain',
        seq: '>=643',
        identity: '盘江程氏股东/商业谋主',
        status: 'allowed',
      },
      {
        scope: 'identity-chain',
        seq: '封官后',
        identity: '朝廷官员（现任阶段身份，不写“曾”）',
        status: 'allowed',
      },
    ];
  }
  if (name === '徐君房') {
    return [
      {
        scope: 'identity-chain',
        seq: '太泉段',
        identity: '太泉古阵当地向导/方士，尚无官职',
        status: 'allowed',
        forbidden: ['秦国正使', '唐皇占卜官'],
      },
      {
        scope: 'identity-chain',
        seq: '燕歌后期',
        identity: '秦国正使/唐皇私下召见的方士',
        status: 'allowed',
      },
    ];
  }
  const identity = canonicalV2Identity(cards);
  if (identity?.includes('阶段身份')) {
    return [{ scope: 'identity-chain', seq: 'see-text', identity, status: 'rule' }];
  }
  return [];
}

function inferRelationshipPhases(card) {
  let text = textOf([card['身份'], card['与主角关系'], card['加入经过'], card['关键情节'], card['目标动机']]);
  text = text
    .replace(/非后宫成员/g, '')
    .replace(/非后宫/g, '')
    .replace(/不是后宫/g, '')
    .replace(/不是程宗扬后宫/g, '')
    .replace(/并非后宫/g, '');
  const phases = [];
  if (card.gender === '女' && FEMALE_HAREM_TERMS.some(term => text.includes(term))) {
    phases.push({
      scope: 'relationship-chain',
      seq: '转折前',
      identity: '原阵营/中立/敌对身份，禁止提前称为后宫、侍妾、情人或程宗扬阵营成员',
      status: 'forbid-final-state-before-turning-point',
    });
    phases.push({
      scope: 'relationship-chain',
      seq: '关系转折后',
      identity: '按原文转折事件后，才可写入程宗扬阵营/后宫/侍妾/情人等关系身份',
      status: 'allowed-after-turning-point',
    });
  }
  return phases;
}

function mergeCard(name, cards, stageRows) {
  const books = unique(cards.map(card => card.__book));
  const genders = unique(cards.map(card => card.gender));
  const conflicts = [];
  if (genders.length > 1) conflicts.push({ field: 'gender', values: genders });
  const sourceCards = cards.map(card => ({
    book: card.__book,
    tier: card.tier || '',
    approved: Boolean(card._approved),
    reviewed: Boolean(card._reviewed),
    identity: card['身份'] || '',
    relationToProtagonist: card['与主角关系'] || '',
    sourceChapters: asArray(card.sourceChapters),
    hits: card._hits || 0,
  }));
  const profile = {
    identitySummary: canonicalV2Identity(cards),
    personality: unique(cards.flatMap(card => asArray(card['性格']))),
    appearance: unique(cards.map(card => card['外貌']).filter(Boolean)).join('；'),
    speechStyle: unique(cards.map(card => card['说话风格']).filter(Boolean)).join('；'),
    principles: unique(cards.flatMap(card => asArray(card['人格底线']))),
    goals: unique(cards.map(card => card['目标动机']).filter(Boolean)),
    weaknesses: unique(cards.map(card => card['弱点软肋']).filter(Boolean)),
    signatureAbilities: unique(cards.flatMap(card => asArray(card['标志武器功法']))),
    relationToProtagonist: unique(cards.map(card => card['与主角关系']).filter(Boolean)),
    formsOfAddress: unique(cards.map(card => card['称呼']).filter(Boolean)),
    joining: unique(cards.map(card => card['加入经过']).filter(Boolean)),
    keyEvents: unique(cards.flatMap(card => asArray(card['关键情节']))),
    ending: unique(cards.map(card => card['结局下场']).filter(Boolean)),
  };
  const phaseIdentities = [
    ...explicitPhaseRules(name, cards),
    ...cards.flatMap(inferRelationshipPhases),
    ...stageRows.map(row => ({
      scope: 'stage-projection',
      stageId: row.stageId,
      book: row.book,
      seqLo: row.seqLo,
      seqHi: row.seqHi,
      identity: row.identity.origin || row.identity.role || '',
      role: row.identity.role || '',
      description: compact(row.identity.description),
      notes: row.identity.notes.filter(note => note.includes('阶段身份') || note.includes('关系') || note.includes('目标')).slice(0, 4),
      status: 'stage-current',
    })).filter(row => row.identity || row.role || row.notes.length),
  ];
  return {
    canonicalName: name,
    gender: genders[0] || '',
    books,
    tier: cards.some(card => card.tier === '主要') ? '主要' : '次要',
    review: {
      approved: cards.every(card => card._approved === true),
      reviewed: cards.every(card => card._reviewed === true),
      flags: inferReviewFlags(name, cards, stageRows),
      conflicts,
    },
    staticProfile: profile,
    phaseIdentities,
    sourceCards,
  };
}

const allCards = [];
for (const source of sourceFiles) {
  const data = JSON.parse(await readFile(source.path, 'utf8'));
  for (const [index, card] of (data.characters || []).entries()) {
    allCards.push({ ...card, __book: source.book, __index: index });
  }
}

const stageRowsByName = new Map();
if (existsSync(stageDir)) {
  for (const file of (await readdir(stageDir)).filter(file => file.endsWith('.json')).sort()) {
    const mod = JSON.parse(await readFile(join(stageDir, file), 'utf8'));
    const { lo, hi } = stageSeq(mod);
    for (const character of mod.canon?.characters || []) {
      if (!character.name) continue;
      if (!stageRowsByName.has(character.name)) stageRowsByName.set(character.name, []);
      stageRowsByName.get(character.name).push({
        stageId: mod.manifest?.id || file.replace(/\.json$/, ''),
        book: stageBook(mod),
        seqLo: lo,
        seqHi: hi,
        identity: stageCharacterIdentity(character),
      });
    }
  }
}

const byName = new Map();
for (const card of allCards) {
  if (!card.name) continue;
  if (!byName.has(card.name)) byName.set(card.name, []);
  byName.get(card.name).push(card);
}

const characters = [...byName.entries()]
  .map(([name, cards]) => mergeCard(name, cards, stageRowsByName.get(name) || []))
  .sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === '主要' ? -1 : 1;
    return a.canonicalName.localeCompare(b.canonicalName, 'zh-Hans-CN');
  });

const v3 = {
  schema: 'xiantu.character-cards-v3',
  version: 3,
  generatedAt: new Date().toISOString(),
  sources: sourceFiles.map(source => source.path.replace(`${root}/`, '')),
  policy: {
    identity: '身份随剧情变化时必须写入 phaseIdentities；stage 投影只应使用当前 stage 可用身份。',
    protagonist: '程宗扬的“穿越者”是来历底色，不是六朝社会身份链起点。',
    relationship: '女性非后宫角色转为后宫/侍妾/情人/程宗扬阵营时，也视为身份变化；转折前禁用最终关系身份。',
    duplicateMerge: '同名角色按 canonicalName 合并，sourceCards 保留原卷来源，review.flags 标注重复/二验/阶段身份风险。',
  },
  stats: {
    sourceCards: allCards.length,
    canonicalCharacters: characters.length,
    duplicateMergedCharacters: characters.filter(card => card.review.flags.includes('duplicate-merged')).length,
    needsSecondReview: characters.filter(card => card.review.flags.includes('needs-second-review')).length,
    femaleRelationshipPhaseNeeded: characters.filter(card => card.review.flags.includes('female-relationship-phase-needed')).length,
  },
  characters,
};

await writeFile(join(canonDir, 'character-cards-v3.json'), `${JSON.stringify(v3, null, 2)}\n`);

for (const book of ['qingyu', 'yunlong', 'yange']) {
  const bookCharacters = characters.filter(card => card.books.includes(book));
  await writeFile(join(canonDir, `${book}.character-cards-v3.json`), `${JSON.stringify({
    ...v3,
    scope: book,
    stats: {
      canonicalCharacters: bookCharacters.length,
      duplicateMergedCharacters: bookCharacters.filter(card => card.review.flags.includes('duplicate-merged')).length,
      needsSecondReview: bookCharacters.filter(card => card.review.flags.includes('needs-second-review')).length,
    },
    characters: bookCharacters,
  }, null, 2)}\n`);
}

const report = [];
report.push('# 角色卡 v3 生成报告');
report.push('');
report.push(`生成时间：${v3.generatedAt}`);
report.push('');
report.push(`- v2 原始卡：${v3.stats.sourceCards}`);
report.push(`- v3 去重角色：${v3.stats.canonicalCharacters}`);
report.push(`- 合并重复角色：${v3.stats.duplicateMergedCharacters}`);
report.push(`- 需要二验：${v3.stats.needsSecondReview}`);
report.push(`- 女性关系身份需阶段化：${v3.stats.femaleRelationshipPhaseNeeded}`);
report.push('');
report.push('## 口径');
report.push('');
report.push('- 身份随剧情给予时，写入 `phaseIdentities`，并可附 `seq/stageId/forbidden`。');
report.push('- 女性角色从非后宫/敌对/中立转为后宫、侍妾、情人或程宗扬阵营，视为身份变化。');
report.push('- 同名角色已按 `canonicalName` 合并，原始来源保存在 `sourceCards`。');
report.push('');
report.push('## 重复合并角色');
report.push('');
for (const card of characters.filter(card => card.review.flags.includes('duplicate-merged')).slice(0, 160)) {
  report.push(`- **${card.canonicalName}**：${card.books.join(' / ')}；来源 ${card.sourceCards.length} 张；flags=${card.review.flags.join(', ')}`);
}
report.push('');
report.push('## 需要二验角色');
report.push('');
for (const card of characters.filter(card => card.review.flags.includes('needs-second-review')).slice(0, 200)) {
  report.push(`- **${card.canonicalName}**：${card.books.join(' / ')}；flags=${card.review.flags.join(', ')}`);
}
report.push('');
report.push('## 女性关系身份需阶段化');
report.push('');
for (const card of characters.filter(card => card.review.flags.includes('female-relationship-phase-needed')).slice(0, 200)) {
  report.push(`- **${card.canonicalName}**：${card.books.join(' / ')}；关系=${compact(card.staticProfile.relationToProtagonist.join('；'), 160)}`);
}
await writeFile(join(canonDir, 'character-cards-v3-report.md'), `${report.join('\n')}\n`);

console.log(join(canonDir, 'character-cards-v3.json'));
console.log(join(canonDir, 'character-cards-v3-report.md'));
