#!/usr/bin/env node

// Apply the reviewed alias-unification decisions to v3 character canon.
// Scope: character-cards-v3 aggregate/per-book files, character-alias-registry,
// character-id-map files, and a concise report. This script is intentionally
// narrow and does not touch scenario stage JSON.

import { cp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const canonDir = join(root, 'mod-kit/generated/deepseek-v4-flash/character-canon');
const reviewDir = join(canonDir, 'alias-unification-review');
const reviewedPath = join(reviewDir, 'alias-unification-proposals.reviewed.json');
const books = ['qingyu', 'yunlong', 'yange'];
const cardFiles = [
  join(canonDir, 'character-cards-v3.json'),
  ...books.map(book => join(canonDir, `${book}.character-cards-v3.json`)),
];
const idMapFiles = books.map(book => join(canonDir, `${book}.character-id-map.json`));
const registryPath = join(canonDir, 'character-alias-registry.json');
const backupDir = join(canonDir, 'backups', `alias-unification-apply-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const dry = process.argv.includes('--dry-run');

const manualMergeNotes = [
  ['林娘子', '阮香凝'],
  ['泉奴', '泉玉姬'],
  ['殇振羽', '殇侯'],
  ['朱老头', '殇侯'],
  ['太皇太后郭氏', '郭氏'],
  ['严先生', '严君平'],
  ['杨贤妃', '杨艳'],
];

function uniq(values) {
  return [...new Set((values || []).map(v => String(v || '').trim()).filter(Boolean))];
}

function splitAliases(value) {
  return uniq(String(value || '').split(/\n|、|\/|,/).map(s => s.trim()));
}

function roleToTier(role = '') {
  if (/公主|王|皇|太后|贤妃|教御|首领|高手|杀手/.test(role)) return '主要';
  return '次要';
}

function makeCard({ name, alias = '', id = '', role = '', books = [], note = '' }) {
  const aliases = splitAliases(alias).filter(a => a !== name);
  return {
    canonicalName: name,
    aliases,
    gender: '',
    books: uniq(books),
    tier: roleToTier(role),
    review: {
      approved: true,
      reviewed: true,
      flags: ['alias-unification-created'],
      conflicts: [],
      aliasApplied: aliases,
      registryId: id || undefined,
      note: note || undefined,
    },
    staticProfile: {
      identitySummary: role || '人工审核补入角色',
      personality: [],
      appearance: '',
      speechStyle: '',
      principles: [],
      goals: [],
      weaknesses: [],
      signatureAbilities: [],
      relationToProtagonist: [],
      formsOfAddress: aliases.length ? [`别名/称谓：${aliases.join('、')}`] : [],
      joining: [],
      keyEvents: note ? [note] : [],
      ending: [],
    },
    phaseIdentities: [],
    sourceCards: [{
      book: uniq(books).join('/') || '',
      tier: roleToTier(role),
      approved: true,
      reviewed: true,
      identity: role || '人工审核补入角色',
      relationToProtagonist: '',
      sourceChapters: [],
      hits: 0,
      source: 'alias-unification-review',
    }],
  };
}

function ensureAliasOnCard(card, alias, note = '') {
  if (!alias || alias === card.canonicalName) return false;
  const before = JSON.stringify([card.aliases, card.review, card.staticProfile?.formsOfAddress]);
  card.aliases = uniq([...(card.aliases || []), alias]);
  card.review = card.review || { approved: true, reviewed: true, flags: [], conflicts: [] };
  card.review.aliasApplied = uniq([...(card.review.aliasApplied || []), alias]);
  if (note) card.review.aliasReviewNote = uniq([...(card.review.aliasReviewNote || []), note]);
  const forms = card.staticProfile?.formsOfAddress || [];
  if (!forms.some(item => String(item).includes(alias))) {
    card.staticProfile = card.staticProfile || {};
    card.staticProfile.formsOfAddress = [...forms, `别名/称谓：${alias}`];
  }
  return JSON.stringify([card.aliases, card.review, card.staticProfile?.formsOfAddress]) !== before;
}

function removeAliasFromCard(card, alias) {
  const before = JSON.stringify([card.aliases, card.staticProfile?.formsOfAddress]);
  card.aliases = (card.aliases || []).filter(a => a !== alias);
  if (card.staticProfile?.formsOfAddress) {
    card.staticProfile.formsOfAddress = card.staticProfile.formsOfAddress.filter(item => !String(item).includes(`：${alias}`));
  }
  return JSON.stringify([card.aliases, card.staticProfile?.formsOfAddress]) !== before;
}

function mergeArrayField(into, from, key) {
  into[key] = uniq([...(into[key] || []), ...(from[key] || [])]);
}

function mergeProfile(into, from) {
  into.staticProfile = into.staticProfile || {};
  const a = into.staticProfile;
  const b = from.staticProfile || {};
  for (const key of ['personality', 'principles', 'goals', 'weaknesses', 'signatureAbilities', 'relationToProtagonist', 'formsOfAddress', 'joining', 'keyEvents', 'ending']) {
    a[key] = uniq([...(a[key] || []), ...(b[key] || [])]);
  }
  for (const key of ['identitySummary', 'appearance', 'speechStyle']) {
    if (!a[key] && b[key]) a[key] = b[key];
  }
}

function mergeCard(characters, fromName, intoName, aliasesToCarry = []) {
  const fromIndex = characters.findIndex(c => c.canonicalName === fromName);
  let into = characters.find(c => c.canonicalName === intoName);
  if (fromIndex < 0) return false;
  const from = characters[fromIndex];
  if (!into) {
    from.canonicalName = intoName;
    into = from;
    for (const alias of uniq([fromName, ...(aliasesToCarry || [])])) ensureAliasOnCard(into, alias, `rename-merge:${fromName}->${intoName}`);
    into.review = into.review || { approved: true, reviewed: true, flags: [], conflicts: [] };
    into.review.flags = uniq([...(into.review.flags || []), 'alias-unification-merged']);
    into.review.aliasMerged = uniq([...(into.review.aliasMerged || []), fromName]);
    return true;
  }
  mergeArrayField(into, from, 'books');
  mergeArrayField(into, from, 'aliases');
  for (const alias of uniq([fromName, ...(aliasesToCarry || [])])) ensureAliasOnCard(into, alias, `merge:${fromName}->${intoName}`);
  mergeProfile(into, from);
  into.phaseIdentities = [...(into.phaseIdentities || []), ...(from.phaseIdentities || [])];
  into.sourceCards = [...(into.sourceCards || []), ...(from.sourceCards || [])];
  into.review = into.review || { approved: true, reviewed: true, flags: [], conflicts: [] };
  into.review.flags = uniq([...(into.review.flags || []), 'alias-unification-merged']);
  into.review.aliasMerged = uniq([...(into.review.aliasMerged || []), fromName]);
  characters.splice(fromIndex, 1);
  return true;
}

function addOrUpdateRegistry(registry, { id = '', name, alias = '', role = '', books = [], note = '' }) {
  if (!name) return null;
  let rec = null;
  if (id) rec = registry.characters.find(r => r.id === id);
  if (!rec) rec = registry.characters.find(r => r.canonicalName === name);
  if (!rec) {
    rec = { id, canonicalName: name, aliases: [], role, books: uniq(books) };
    registry.characters.push(rec);
  }
  rec.canonicalName = name;
  if (id) rec.id = id;
  if (role && !rec.role) rec.role = role;
  rec.books = uniq([...(rec.books || []), ...(books || [])]);
  rec.aliases = uniq([...(rec.aliases || []), ...splitAliases(alias)]).filter(a => a !== name);
  if (note) rec.reviewNote = uniq([...(rec.reviewNote || []), note]);
  return rec;
}

function mergeRegistry(registry, fromName, intoName, aliasesToCarry = []) {
  const into = registry.characters.find(r => r.canonicalName === intoName || r.aliases?.includes(intoName));
  const fromIndex = registry.characters.findIndex(r => r.canonicalName === fromName);
  if (!into) return false;
  const from = fromIndex >= 0 ? registry.characters[fromIndex] : null;
  into.canonicalName = intoName;
  into.aliases = uniq([...(into.aliases || []), fromName, ...(aliasesToCarry || []), ...(from?.aliases || [])]).filter(a => a !== intoName);
  into.books = uniq([...(into.books || []), ...(from?.books || [])]);
  into.multiNameAcrossStages = uniq([...(into.multiNameAcrossStages || []), fromName, ...(from?.multiNameAcrossStages || [])]);
  if (from?.aliasSources) into.aliasSources = [...(into.aliasSources || []), ...from.aliasSources];
  if (fromIndex >= 0 && registry.characters[fromIndex] !== into) registry.characters.splice(fromIndex, 1);
  return true;
}

function updateIdMaps(maps, fromName, intoName, targetId) {
  for (const map of maps) {
    if (map[fromName]) {
      map[intoName] = { ...(map[intoName] || map[fromName]), id: targetId || map[fromName].id, role: map[intoName]?.role || map[fromName].role || '' };
      delete map[fromName];
    }
  }
}

function byBookFiles(cardsData) {
  return new Map(cardsData.slice(1).map(item => [item.book, item.data]));
}

async function main() {
  if (!existsSync(reviewedPath)) throw new Error(`missing reviewed proposals: ${reviewedPath}`);
  if (!dry) {
    await mkdir(backupDir, { recursive: true });
    await Promise.all([
      cp(reviewedPath, join(backupDir, 'alias-unification-proposals.reviewed.json')),
      cp(registryPath, join(backupDir, 'character-alias-registry.json')),
      ...cardFiles.map(file => cp(file, join(backupDir, file.split('/').pop()))),
      ...idMapFiles.map(file => cp(file, join(backupDir, file.split('/').pop()))),
    ]);
  }

  const review = JSON.parse(await readFile(reviewedPath, 'utf8'));
  const registry = JSON.parse(await readFile(registryPath, 'utf8'));
  const cardsData = [];
  for (const file of cardFiles) {
    const data = JSON.parse(await readFile(file, 'utf8'));
    cardsData.push({ file, data, book: file.match(/([^/]+)\.character-cards-v3\.json$/)?.[1] || '' });
  }
  const idMaps = [];
  for (const file of idMapFiles) idMaps.push(JSON.parse(await readFile(file, 'utf8')));
  const perBook = byBookFiles(cardsData);
  const report = [];

  const addCardEverywhere = payload => {
    const targetBooks = uniq(payload.books || []);
    for (const { data, book } of cardsData) {
      if (book && !targetBooks.includes(book)) continue;
      let card = data.characters.find(c => c.canonicalName === payload.name);
      if (!card) {
        card = makeCard(payload);
        data.characters.push(card);
        report.push(`create_card: ${payload.name}${book ? ` (${book})` : ' (aggregate)'}`);
      } else {
        for (const alias of splitAliases(payload.alias)) if (ensureAliasOnCard(card, alias, payload.note)) report.push(`add_alias_existing_card: ${payload.name} <- ${alias}${book ? ` (${book})` : ''}`);
      }
    }
  };

  for (const p of review.proposals.filter(p => p.reviewed === true && p.approved === true && p.action === 'add_alias')) {
    for (const { data, book } of cardsData) {
      const card = data.characters.find(c => c.canonicalName === p.targetCanonicalName);
      if (!card) continue;
      if (book && !(card.books || []).includes(book)) continue;
      if (ensureAliasOnCard(card, p.alias, p.note || 'alias-unification approved')) report.push(`add_alias: ${p.targetCanonicalName} <- ${p.alias}${book ? ` (${book})` : ''}`);
    }
    addOrUpdateRegistry(registry, { name: p.targetCanonicalName, alias: p.alias, books: p.books || [], note: p.note || 'alias-unification approved' });
  }

  for (const p of review.proposals.filter(p => p.reviewed === true && p.approved === true && p.action === 'merge_character')) {
    for (const { data, book } of cardsData) {
      if (mergeCard(data.characters, p.mergeFrom, p.mergeInto, p.aliasesToCarry || [p.alias])) report.push(`merge_card: ${p.mergeFrom} -> ${p.mergeInto}${book ? ` (${book})` : ' (aggregate)'}`);
    }
    mergeRegistry(registry, p.mergeFrom, p.mergeInto, p.aliasesToCarry || [p.alias]);
    const targetRec = registry.characters.find(r => r.canonicalName === p.mergeInto);
    updateIdMaps(idMaps, p.mergeFrom, p.mergeInto, targetRec?.id);
  }

  for (const p of review.proposals.filter(p => p.reviewed === true && p.approved === true && p.action === 'missing_registry_character')) {
    const payload = {
      id: p.id || '',
      name: p.suggestedName,
      alias: p.alias || '',
      role: p.role || '',
      books: p.books || [],
      note: p.note || '',
    };
    addCardEverywhere(payload);
    addOrUpdateRegistry(registry, payload);
  }

  for (const p of review.proposals.filter(p => p.reviewed === true && p.approved === false && p.action === 'add_alias')) {
    for (const { data } of cardsData) {
      const card = data.characters.find(c => c.canonicalName === p.targetCanonicalName);
      if (card && removeAliasFromCard(card, p.alias)) report.push(`remove_rejected_alias: ${p.targetCanonicalName} <- ${p.alias}`);
    }
    const rec = registry.characters.find(r => r.canonicalName === p.targetCanonicalName);
    if (rec) rec.aliases = (rec.aliases || []).filter(a => a !== p.alias);
  }

  for (const [from, into] of manualMergeNotes) {
    for (const { data, book } of cardsData) {
      if (mergeCard(data.characters, from, into, [from])) report.push(`manual_note_merge_card: ${from} -> ${into}${book ? ` (${book})` : ' (aggregate)'}`);
      const target = data.characters.find(c => c.canonicalName === into);
      if (target && ensureAliasOnCard(target, from, `review note merge:${into}`)) report.push(`manual_note_alias: ${into} <- ${from}${book ? ` (${book})` : ''}`);
    }
    mergeRegistry(registry, from, into, [from]);
  }

  // Explicit corrections from rejected notes that are not represented as rows.
  addOrUpdateRegistry(registry, { id: 'lyg.character.np085', name: '郭氏', alias: '太皇太后(唐)', role: '太皇太后', books: ['yange'], note: '太皇太后郭氏 merge:郭氏' });
  const guoRegistry = registry.characters.find(r => r.canonicalName === '郭氏');
  if (guoRegistry) {
    guoRegistry.aliases = (guoRegistry.aliases || []).filter(alias => !['太皇太后', '太皇太后郭氏'].includes(alias));
    guoRegistry.aliases = uniq([...(guoRegistry.aliases || []), '太皇太后(唐)']);
  }
  for (const { data, book } of cardsData) {
    const guo = data.characters.find(c => c.canonicalName === '郭氏');
    if (guo && (!book || book === 'yange')) {
      guo.aliases = (guo.aliases || []).filter(alias => !['太皇太后', '太皇太后郭氏'].includes(alias));
      if (guo.staticProfile?.formsOfAddress) {
        guo.staticProfile.formsOfAddress = guo.staticProfile.formsOfAddress.filter(item => !String(item).includes('太皇太后郭氏') && !String(item).includes('别名/称谓：太皇太后'));
      }
      ensureAliasOnCard(guo, '太皇太后(唐)', '太皇太后郭氏 merge:郭氏');
    }
  }
  for (const map of idMaps) {
    if (map['郭氏（太皇太后）']) {
      map['郭氏'] = { ...map['郭氏（太皇太后）'], role: map['郭氏（太皇太后）'].role || '太皇太后' };
      delete map['郭氏（太皇太后）'];
    }
    if (map['太皇太后郭氏']) {
      map['郭氏'] = { ...map['郭氏'], id: map['太皇太后郭氏'].id || map['郭氏']?.id || 'lyg.character.np085', role: '太皇太后' };
      delete map['太皇太后郭氏'];
    }
    if (map['定陶王刘欣']) {
      map['刘欣'] = { ...map['定陶王刘欣'], role: map['定陶王刘欣'].role || '定陶王' };
      delete map['定陶王刘欣'];
    }
    if (map['抚王李纮']) {
      map['李纮'] = { ...map['抚王李纮'], role: map['抚王李纮'].role || '老亲王' };
      delete map['抚王李纮'];
    }
  }

  for (const { data } of cardsData) {
    data.characters.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName, 'zh-Hans-CN'));
    data.stats = data.stats || {};
    data.stats.canonicalCharacters = data.characters.length;
    data.stats.aliasUnificationAppliedAt = new Date().toISOString();
  }
  registry.characters.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName, 'zh-Hans-CN'));
  registry.aliasUnificationAppliedAt = new Date().toISOString();

  if (!dry) {
    for (const { file, data } of cardsData) await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
    for (let i = 0; i < idMapFiles.length; i++) await writeFile(idMapFiles[i], `${JSON.stringify(idMaps[i], null, 2)}\n`);
    await writeFile(join(reviewDir, 'alias-unification-apply-report.md'), `${[
      '# Alias Unification Apply Report',
      '',
      `- Applied at: ${new Date().toISOString()}`,
      `- Backup: ${backupDir}`,
      `- Operations: ${report.length}`,
      '',
      ...report.map(line => `- ${line}`),
      '',
    ].join('\n')}`);
  }
  console.log(JSON.stringify({ dry, backupDir, operations: report.length, report: report.slice(0, 80) }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
