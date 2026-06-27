#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const atlasDir = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash', 'shared-atlas');
const ocrDir = join(atlasDir, 'ocr');
const outputPath = join(atlasDir, 'map-labels.raw.json');
const maps = ['jin-nanzhao', 'song-taiquan', 'han-qin', 'tang'];
const minimumConfidence = 0.45;

async function load(name) {
  return JSON.parse(await readFile(join(ocrDir, `${name}.vision.json`), 'utf8'))
    .filter(item => item.confidence >= minimumConfidence && item.text.trim());
}

function fitAxis(pairs, localKey, worldKey) {
  const n = pairs.length;
  const meanLocal = pairs.reduce((sum, pair) => sum + pair.local[localKey], 0) / n;
  const meanWorld = pairs.reduce((sum, pair) => sum + pair.world[worldKey], 0) / n;
  const numerator = pairs.reduce((sum, pair) => sum + (pair.local[localKey] - meanLocal) * (pair.world[worldKey] - meanWorld), 0);
  const denominator = pairs.reduce((sum, pair) => sum + (pair.local[localKey] - meanLocal) ** 2, 0);
  const scale = numerator / denominator;
  return { scale, offset: meanWorld - scale * meanLocal };
}

function transform(item, registration) {
  return {
    x: registration.x.scale * item.x + registration.x.offset,
    y: registration.y.scale * item.y + registration.y.offset,
  };
}

const world = await load('liuchao-world');
const worldByText = new Map(world.map(item => [item.text, item]));
const registrations = {};
const observations = world.map(item => ({
  text: item.text,
  x: Math.round(item.x * 10000),
  y: Math.round(item.y * 10000),
  confidence: item.confidence,
  sourceMap: 'liuchao-world',
  coordinateBasis: 'direct',
}));

for (const map of maps) {
  const local = await load(map);
  let pairs = local.filter(item => worldByText.has(item.text)).map(item => ({ local: item, world: worldByText.get(item.text) }));
  if (pairs.length < 4) throw new Error(`${map}: insufficient exact-name registration anchors (${pairs.length})`);
  let registration = { x: fitAxis(pairs, 'x', 'x'), y: fitAxis(pairs, 'y', 'y') };
  pairs = pairs.filter(pair => {
    const point = transform(pair.local, registration);
    return Math.hypot(point.x - pair.world.x, point.y - pair.world.y) < 0.035;
  });
  registration = { x: fitAxis(pairs, 'x', 'x'), y: fitAxis(pairs, 'y', 'y') };
  const rms = Math.sqrt(pairs.reduce((sum, pair) => {
    const point = transform(pair.local, registration);
    return sum + (point.x - pair.world.x) ** 2 + (point.y - pair.world.y) ** 2;
  }, 0) / pairs.length);
  registrations[map] = { ...registration, anchors: pairs.map(pair => pair.local.text), rmsError: rms };
  for (const item of local) {
    const point = transform(item, registration);
    if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) continue;
    observations.push({
      text: item.text,
      x: Math.round(point.x * 10000),
      y: Math.round(point.y * 10000),
      confidence: item.confidence,
      sourceMap: map,
      coordinateBasis: 'registered',
    });
  }
}

const groups = [];
for (const observation of observations.sort((a, b) => a.text.localeCompare(b.text, 'zh-Hans') || b.confidence - a.confidence)) {
  const group = groups.find(candidate => candidate.text === observation.text && Math.hypot(candidate.x - observation.x, candidate.y - observation.y) < 300);
  if (!group) {
    groups.push({ text: observation.text, x: observation.x, y: observation.y, observations: [observation] });
    continue;
  }
  group.observations.push(observation);
  const weight = group.observations.reduce((sum, item) => sum + item.confidence, 0);
  group.x = Math.round(group.observations.reduce((sum, item) => sum + item.x * item.confidence, 0) / weight);
  group.y = Math.round(group.observations.reduce((sum, item) => sum + item.y * item.confidence, 0) / weight);
}

await writeFile(outputPath, JSON.stringify({
  schema: 'xiantu.scenario-atlas-map-label-draft',
  version: 1,
  warning: 'Machine OCR draft. Every label must be cross-checked against appendix images and novel evidence before becoming canon.',
  coordinateSystem: { width: 10000, height: 10000, origin: 'top-left' },
  registrations,
  labels: groups.sort((a, b) => a.y - b.y || a.x - b.x),
}, null, 2));
console.log(`wrote ${outputPath}: ${groups.length} candidate labels`);
