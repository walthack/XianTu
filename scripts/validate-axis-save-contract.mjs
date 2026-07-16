#!/usr/bin/env node

// R2-3 主轴/存档契约门禁。
// - 冻结层：stage/chapter/event ID + 已有 completion flag 路径，只增不删、不改名、不挪用。
// - 软绑定层：axisId/seq/anchor 必须自洽；seq 只排序，不进入冻结快照。
// Usage:
//   node scripts/validate-axis-save-contract.mjs --freeze  # 首次铸快照
//   node scripts/validate-axis-save-contract.mjs           # 日常门禁

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generated = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const canon = join(generated, 'character-canon');
const snapshotPath = join(canon, 'SAVE-CONTRACT.json');
const books = ['qingyu', 'yunlong', 'yange'];
const errors = [];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function stageDocuments() {
  const documents = [];
  for (const book of books) {
    const directory = join(generated, book, 'stages');
    for (const file of readdirSync(directory).filter(name => name.endsWith('.json') && !name.endsWith('.uncertainties.json')).sort()) {
      const path = join(directory, file);
      documents.push({ book, path, document: readJson(path) });
    }
  }
  return documents;
}

function flagPaths(conditions) {
  return [...new Set((conditions || [])
    .map(condition => condition?.path)
    .filter(path => typeof path === 'string' && path.startsWith('flags.')))]
    .sort();
}

function buildSnapshot(stages) {
  const contracts = {};
  for (const { book, document } of stages) {
    const stageId = document.manifest?.id;
    contracts[stageId] = {
      book,
      chapterIds: (document.scenario?.chapters || []).map(chapter => chapter.id).sort(),
      eventIds: (document.scenario?.events || []).map(event => event.id).sort(),
      chapterFlagPaths: Object.fromEntries((document.scenario?.chapters || [])
        .map(chapter => [chapter.id, flagPaths(chapter.completion)])),
      eventFlagPaths: Object.fromEntries((document.scenario?.events || [])
        .map(event => [event.id, flagPaths(event.completion)])),
    };
  }
  return {
    schema: 'xiantu.save-contract.v1',
    frozenAt: new Date().toISOString(),
    rule: 'stage/chapter/event IDs and existing completion flag paths are append-only. New IDs/paths may be added; frozen entries may not be removed, renamed, moved, or repurposed.',
    stages: Object.fromEntries(Object.entries(contracts).sort(([a], [b]) => a.localeCompare(b))),
  };
}

function containsAll(current, frozen, label) {
  const currentSet = new Set(current || []);
  for (const value of frozen || []) if (!currentSet.has(value)) errors.push(`${label}: frozen value missing: ${value}`);
}

function validateFrozenSnapshot(stages) {
  if (!existsSync(snapshotPath)) {
    errors.push(`missing ${snapshotPath}; run --freeze once after review`);
    return;
  }
  const snapshot = readJson(snapshotPath);
  if (snapshot.schema !== 'xiantu.save-contract.v1') errors.push(`unsupported snapshot schema: ${snapshot.schema}`);
  const currentById = new Map(stages.map(item => [item.document.manifest?.id, item]));
  for (const [stageId, frozen] of Object.entries(snapshot.stages || {})) {
    const current = currentById.get(stageId);
    if (!current) {
      errors.push(`frozen stage missing or renamed: ${stageId}`);
      continue;
    }
    if (current.book !== frozen.book) errors.push(`${stageId}: moved book ${frozen.book} -> ${current.book}`);
    const chapters = current.document.scenario?.chapters || [];
    const events = current.document.scenario?.events || [];
    containsAll(chapters.map(chapter => chapter.id), frozen.chapterIds, `${stageId}.chapterIds`);
    containsAll(events.map(event => event.id), frozen.eventIds, `${stageId}.eventIds`);
    const chaptersById = new Map(chapters.map(chapter => [chapter.id, chapter]));
    const eventsById = new Map(events.map(event => [event.id, event]));
    for (const [chapterId, paths] of Object.entries(frozen.chapterFlagPaths || {})) {
      const chapter = chaptersById.get(chapterId);
      if (chapter) containsAll(flagPaths(chapter.completion), paths, `${stageId}.${chapterId}.completion`);
    }
    for (const [eventId, paths] of Object.entries(frozen.eventFlagPaths || {})) {
      const event = eventsById.get(eventId);
      if (event) containsAll(flagPaths(event.completion), paths, `${stageId}.${eventId}.completion`);
    }
  }
}

function validateTimelineAndBinding(stages) {
  const timeline = readJson(join(canon, 'story-timeline.json'));
  const binding = readJson(join(canon, 'axis-binding.json'));
  const nodes = timeline.nodes || [];
  const axisNodes = binding.nodes || [];
  if (timeline.totalNodes !== nodes.length) errors.push(`story-timeline.totalNodes=${timeline.totalNodes}, actual=${nodes.length}`);
  if (nodes.length !== axisNodes.length) errors.push(`timeline nodes=${nodes.length}, axis-binding nodes=${axisNodes.length}`);

  const axisIds = new Set();
  const axisById = new Map();
  const seqs = new Set();
  const ordinals = new Map();
  for (let index = 0; index < axisNodes.length; index += 1) {
    const axis = axisNodes[index];
    const timelineNode = nodes[index];
    const expectedSeq = index + 1;
    if (axis.seq !== expectedSeq || timelineNode?.seq !== expectedSeq) errors.push(`seq discontinuity at index ${index}: timeline=${timelineNode?.seq}, axis=${axis.seq}`);
    if (seqs.has(axis.seq)) errors.push(`duplicate axis seq: ${axis.seq}`);
    seqs.add(axis.seq);
    const ordinalKey = `${axis.book}|${axis.idx}`;
    const ordinal = (ordinals.get(ordinalKey) || 0) + 1;
    ordinals.set(ordinalKey, ordinal);
    const expectedAxisId = `${axis.book}.${axis.idx}.${ordinal}`;
    if (axis.axisId !== expectedAxisId) errors.push(`axisId mismatch: ${axis.axisId}, expected ${expectedAxisId}`);
    if (axisIds.has(axis.axisId)) errors.push(`duplicate axisId: ${axis.axisId}`);
    axisIds.add(axis.axisId);
    axisById.set(axis.axisId, axis);
    for (const field of ['book', 'idx', 'anchor', 'beat']) {
      if (axis[field] !== timelineNode?.[field]) errors.push(`${axis.axisId}: binding/timeline ${field} mismatch`);
    }
  }

  const eventIds = new Map();
  for (const { document } of stages) {
    const stageId = document.manifest?.id;
    if (!stageId) {
      errors.push('stage missing manifest.id');
      continue;
    }
    if (document.manifest?.eventIdContract !== 'append-only-frozen') errors.push(`${stageId}: eventIdContract is not append-only-frozen`);
    if (document.manifest?.axisVersion !== binding.axisVersion) errors.push(`${stageId}: axisVersion ${document.manifest?.axisVersion} != ${binding.axisVersion}`);
    for (const event of document.scenario?.events || []) {
      if (!event.id) errors.push(`${stageId}: event missing id`);
      const owner = eventIds.get(event.id);
      if (owner) errors.push(`duplicate event.id ${event.id}: ${owner} and ${stageId}`);
      eventIds.set(event.id, stageId);
      if (!event.axisId) continue;
      const axis = axisById.get(event.axisId);
      if (!axis) {
        errors.push(`${stageId}/${event.id}: missing axisId ${event.axisId}`);
        continue;
      }
      if (event.axisSeq !== undefined && event.axisSeq !== axis.seq) errors.push(`${stageId}/${event.id}: axisSeq ${event.axisSeq} != ${axis.seq}`);
      if (event.axisAnchor !== undefined && event.axisAnchor !== axis.anchor) {
        const compositeAxisIds = String(event.axisAnchor).split('+').filter(value => /^[a-z]+(?:\.[a-z]+)?\.\d+\.\d+$/.test(value));
        if (compositeAxisIds.length) {
          if (!compositeAxisIds.includes(event.axisId)) errors.push(`${stageId}/${event.id}: composite axisAnchor does not include primary ${event.axisId}`);
          for (const compositeAxisId of compositeAxisIds) if (!axisById.has(compositeAxisId)) errors.push(`${stageId}/${event.id}: composite axisAnchor missing ${compositeAxisId}`);
        } else {
          errors.push(`${stageId}/${event.id}: axisAnchor mismatch`);
        }
      }
    }
  }

  function validateAxisReferences(value, location) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => validateAxisReferences(item, `${location}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (['axisId', 'forkAxisId', 'sourceAxisId'].includes(key) && typeof child === 'string' && child && !axisById.has(child)) {
        errors.push(`${location}.${key}: missing axis node ${child}`);
      }
      validateAxisReferences(child, `${location}.${key}`);
    }
  }
  for (const book of books) {
    validateAxisReferences(readJson(join(canon, `${book}.story-spines.json`)), `${book}.story-spines`);
    validateAxisReferences(readJson(join(canon, `${book}.if-branches.json`)), `${book}.if-branches`);
  }
  return { timelineNodes: nodes.length, axisNodes: axisNodes.length, stages: stages.length, events: eventIds.size };
}

const stages = stageDocuments();
if (process.argv.includes('--freeze')) {
  const snapshot = buildSnapshot(stages);
  writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`frozen save contract: ${Object.keys(snapshot.stages).length} stages -> ${snapshotPath}`);
  process.exit(0);
}

validateFrozenSnapshot(stages);
const stats = validateTimelineAndBinding(stages);
if (errors.length) {
  console.error(`R2-3 contract validation failed (${errors.length}):`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`R2-3 contract PASS: ${stats.timelineNodes} axis nodes | ${stats.stages} stages | ${stats.events} event IDs`);
