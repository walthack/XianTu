#!/usr/bin/env node

// Offline inventory for the canon-rail migration. It neither touches built-in
// Mods nor starts the app; its output is a review artifact only.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const canonDir = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash', 'character-canon');
const builtinsDir = join(root, 'src', 'modules', 'scenarioMods', 'builtins', 'data');
const outputDir = join(canonDir, 'canon-rail');

const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const isCritical = event => event.critical !== undefined
  ? event.critical === true
  : event.axisMethod !== 'reviewed-no-anchor' && event.axisId !== null
    && Boolean(event.axisBeat || event.axisId || typeof event.axisSeq === 'number');
const bookForStage = id => id.startsWith('lcq.') ? 'qingyu' : id.startsWith('lyl.') ? 'yunlong' : id.startsWith('lyg.') ? 'yange' : null;

const [binding, arcs, alignment] = await Promise.all([
  readJson(join(canonDir, 'axis-binding.json')),
  readJson(join(canonDir, 'relationship-arcs-draft.json')),
  readJson(join(canonDir, 'axis-stage-alignment.json')),
]);
const nodeByAxisId = new Map((binding.nodes || []).map(node => [node.axisId, node]));
const arcsBySeq = new Map((arcs.arcs || []).map(arc => [arc.seq, arc]));
const alignmentByStageEvent = new Map();
for (const [book, bookData] of Object.entries(alignment.books || {})) {
  for (const stage of bookData.stages || []) {
    for (const event of stage.events || []) {
      alignmentByStageEvent.set(`${stage.id}\u0000${event.event}`, { book, ...event });
    }
  }
}

const files = (await readdir(builtinsDir)).filter(file => file.endsWith('.json')).sort();
const events = [];
const orderingIssues = [];
for (const file of files) {
  const mod = await readJson(join(builtinsDir, file));
  const stageId = mod.manifest?.id || file.replace(/\.json$/, '');
  const book = bookForStage(stageId);
  let previousCritical = null;
  for (const event of mod.scenario?.events || []) {
    if (!isCritical(event)) continue;
    const axis = event.axisId ? nodeByAxisId.get(event.axisId) : null;
    const aligned = alignmentByStageEvent.get(`${stageId}\u0000${event.name}`);
    const arc = axis ? arcsBySeq.get(axis.seq) : null;
    const reviewReasons = [];
    if (!book) reviewReasons.push('unknown_book');
    if (!event.axisId) reviewReasons.push('missing_axis_id');
    if (event.axisId && !axis) reviewReasons.push('unknown_axis_id');
    if (!axis?.anchor) reviewReasons.push('missing_source_anchor');
    if (aligned && typeof aligned.score === 'number' && aligned.score < 0.5) reviewReasons.push('low_alignment_score');
    if (!event.description?.trim() && !event.axisBeat?.trim()) reviewReasons.push('missing_event_fact');
    if (typeof axis?.seq === 'number' && previousCritical && axis.seq < previousCritical.axisSeq) {
      reviewReasons.push('axis_order_inversion');
      orderingIssues.push({
        stageId,
        previousEventId: previousCritical.eventId,
        previousEventName: previousCritical.eventName,
        previousAxisSeq: previousCritical.axisSeq,
        eventId: event.id,
        eventName: event.name,
        axisSeq: axis.seq,
      });
    }
    events.push({
      eventId: event.id,
      eventName: event.name,
      stageId,
      book,
      axisId: event.axisId || null,
      axisSeq: axis?.seq ?? event.axisSeq ?? null,
      source: axis ? { anchor: axis.anchor, sourceIndex: axis.idx, heading: axis.heading, beat: axis.beat } : null,
      eventFact: event.axisBeat || event.description || '',
      completion: event.completion || [],
      relatedCharacterIds: event.relatedCharacterIds || [],
      relationshipArcSeq: arc ? [arc.seq] : [],
      relationshipArcPairs: arc?.pairs?.map(pair => `${pair.a}↔${pair.b}`) || [],
      alignmentScore: aligned?.score ?? null,
      needsSourceReview: reviewReasons.length > 0,
      reviewReasons,
    });
    if (typeof axis?.seq === 'number') previousCritical = { eventId: event.id, eventName: event.name, axisSeq: axis.seq };
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  scope: 'offline-only; not loaded by runtime',
  builtinStages: files.length,
  criticalEvents: events.length,
  exactAxisBinding: events.filter(event => event.axisId && event.source).length,
  relationshipArcLinked: events.filter(event => event.relationshipArcSeq.length > 0).length,
  needsSourceReview: events.filter(event => event.needsSourceReview).length,
  axisOrderInversions: orderingIssues.length,
  byBook: Object.fromEntries(['qingyu', 'yunlong', 'yange'].map(book => {
    const rows = events.filter(event => event.book === book);
    return [book, {
      criticalEvents: rows.length,
      exactAxisBinding: rows.filter(event => event.axisId && event.source).length,
      relationshipArcLinked: rows.filter(event => event.relationshipArcSeq.length > 0).length,
      needsSourceReview: rows.filter(event => event.needsSourceReview).length,
    }];
  })),
};

await mkdir(outputDir, { recursive: true });
const out = { schema: 'liuchao.canon-rail-audit/v1', summary, orderingIssues, events };
await writeFile(join(outputDir, 'audit.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
