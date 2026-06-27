#!/usr/bin/env node

// Roadmap #1: strengthen each stage's scenario.events into an advanceable flag chain.
// Deterministic (no LLM): for each stage, take the major/climax events extracted
// from the novel within the stage's exclusive chapter segment, order them, and emit
// a linear flag chain (event[i].conditions depend on event[i-1].done; climax last).
// References (relatedCharacterIds/FactionIds/locationId) only use entities that
// already exist in the stage canon (validator enforces referential integrity).
//
// Usage: node scripts/strengthen-stage-events.mjs [book...] [--max=N] [--dry-run]

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generatedRoot = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const maxEvents = Number((argv.find(a => a.startsWith('--max=')) || '').split('=')[1] || 9);
const bookArgs = argv.filter(a => !a.startsWith('--'));
const allBooks = [
  { id: 'qingyu', prefix: 'lcq' },
  { id: 'yunlong', prefix: 'lyl' },
  { id: 'yange', prefix: 'lyg' },
];
const books = allBooks.filter(b => bookArgs.length === 0 || bookArgs.includes(b.id));

async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }

function loadEvents(batches) {
  const map = new Map();
  for (const b of batches) for (const e of b.events || []) {
    if (!e || typeof e !== 'object') continue;
    const si = (e.sourceIndices || []).filter(Number.isFinite).sort((a, c) => a - c);
    if (!si.length) continue;
    const key = `${e.name}@${si[0]}`;
    if (!map.has(key)) map.set(key, { name: e.name, summary: e.summary || e.name, si, participants: e.participants || [], locations: e.locations || [], factions: e.factions || [], isMajor: !!e.isMajor, isClimax: !!e.isClimax });
  }
  return [...map.values()];
}

// Build name -> id lookup; matches by inclusion either direction (handles aliases like 阿姬曼 vs 阿姬曼·芭娜).
function nameMatcher(entities) {
  const list = entities.map(e => ({ id: e.id, name: e.name, aliases: e.aliases || [] }));
  return raw => {
    const name = String(raw || '').trim();
    if (!name) return null;
    for (const e of list) {
      const names = [e.name, ...e.aliases].filter(Boolean);
      if (names.some(n => n === name || n.includes(name) || name.includes(n))) return e.id;
    }
    return null;
  };
}

function slug(prefix, stageNum, seq) {
  return `${prefix}.event.s${String(stageNum).padStart(2, '0')}_${String(seq).padStart(2, '0')}`;
}

function segmentsFor(stages) {
  // Each stage owns [openingAfterSourceIndex, nextOpening-1]; last owns through its sourceEndIndex.
  const ordered = stages
    .map((s, i) => ({ s, i, start: s.openingAfterSourceIndex ?? s.sourceStartIndex }))
    .sort((a, b) => a.start - b.start);
  const byId = new Map();
  for (let k = 0; k < ordered.length; k += 1) {
    const cur = ordered[k];
    const nextStart = ordered[k + 1]?.start;
    const end = nextStart ? Math.min(cur.s.sourceEndIndex, nextStart - 1) : cur.s.sourceEndIndex;
    byId.set(cur.s.id, { start: cur.start, end: Math.max(cur.start, end) });
  }
  return byId;
}

for (const book of books) {
  const plan = await readJson(join(generatedRoot, book.id, 'stage-plan.json'));
  const exDir = join(generatedRoot, book.id, 'extraction');
  const batches = await Promise.all((await readdir(exDir)).filter(n => n.endsWith('.json')).map(n => readJson(join(exDir, n))));
  const events = loadEvents(batches);
  const segs = segmentsFor(plan.stages || []);
  const stageDir = join(generatedRoot, book.id, 'stages');

  for (const stage of plan.stages || []) {
    const stagePath = join(stageDir, `${stage.id}.json`);
    let mod;
    try { mod = await readJson(stagePath); } catch { continue; }
    const seg = segs.get(stage.id);
    if (!seg) continue;
    const stageNum = Number(stage.id.match(/(\d+)/)?.[1] || (plan.stages.indexOf(stage) + 1));

    const matchChar = nameMatcher(mod.canon?.characters || []);
    const matchFaction = nameMatcher(mod.canon?.factions || []);
    const matchLoc = nameMatcher(mod.canon?.locations || []);

    // pick major/climax events in segment, ordered by source index, climax kept and pushed to the end
    let inSeg = events.filter(e => e.si.some(i => i >= seg.start && i <= seg.end) && (e.isMajor || e.isClimax))
      .sort((a, b) => a.si[0] - b.si[0]);
    // cap: keep all climax + earliest majors up to maxEvents, preserving order
    if (inSeg.length > maxEvents) {
      const climax = inSeg.filter(e => e.isClimax);
      const majors = inSeg.filter(e => !e.isClimax).slice(0, Math.max(0, maxEvents - climax.length));
      inSeg = [...majors, ...climax].sort((a, b) => a.si[0] - b.si[0]);
    }
    if (!inSeg.length) continue;

    const newEvents = [];
    const initialFlags = { [`chapter.${stage.id}.started`]: true, [`chapter.${stage.id}.done`]: false };
    let prevFlag = `chapter.${stage.id}.started`;
    inSeg.forEach((e, idx) => {
      const id = slug(book.prefix, stageNum, idx + 1);
      const doneFlag = `event.s${String(stageNum).padStart(2, '0')}_${String(idx + 1).padStart(2, '0')}.done`;
      const relChars = [...new Set(e.participants.map(matchChar).filter(Boolean))];
      const relFactions = [...new Set(e.factions.map(matchFaction).filter(Boolean))];
      const locId = e.locations.map(matchLoc).find(Boolean) || null;
      const ev = {
        id,
        name: e.name,
        description: e.summary,
        conditions: [{ path: `flags.${prevFlag}`, operator: 'eq', value: true }],
        completion: [{ path: `flags.${doneFlag}`, operator: 'eq', value: true }],
      };
      if (relChars.length) ev.relatedCharacterIds = relChars;
      if (relFactions.length) ev.relatedFactionIds = relFactions;
      if (locId) ev.locationId = locId;
      newEvents.push(ev);
      initialFlags[doneFlag] = false;
      prevFlag = doneFlag;
    });

    const chapter = {
      id: `${book.prefix}.chapter.${stage.id.split('.').pop()}`,
      title: stage.title || mod.scenario?.chapters?.[0]?.title || '本阶段',
      summary: `${stage.title || ''}：${inSeg[0].name} … ${inSeg[inSeg.length - 1].name}`.trim(),
      activation: [{ path: `flags.chapter.${stage.id}.started`, operator: 'eq', value: true }],
      completion: [{ path: `flags.${prevFlag}`, operator: 'eq', value: true }],
      eventIds: newEvents.map(e => e.id),
    };

    // "补漏不重做": only strengthen stages that are thinner than what we'd produce.
    // Never reduce an already-rich stage's event count.
    const existing = mod.scenario?.events?.length || 0;
    if (newEvents.length <= existing) {
      console.log(`${book.id}/${stage.id}: skip (现有 ${existing} >= 新 ${newEvents.length}，保留原样)`);
      continue;
    }

    mod.scenario.events = newEvents;
    mod.scenario.chapters = [chapter];
    mod.scenario.initialFlags = initialFlags;

    if (!dryRun) await writeFile(stagePath, JSON.stringify(mod, null, 2));
    console.log(`${book.id}/${stage.id}: seg ${seg.start}-${seg.end} | ${existing} -> ${newEvents.length} events (climax ${inSeg.filter(e => e.isClimax).length})`);
  }
}
console.log(dryRun ? 'DRY RUN — no files written.' : 'Stage events strengthened.');
