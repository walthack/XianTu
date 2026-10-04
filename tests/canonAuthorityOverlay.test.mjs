import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  applyCanonAuthorityOverlay,
  applyTrackedCanonAuthorityOverlay,
  assertCanonAuthorityOverlaysApplied,
  buildCanonAuthorityOps,
  deepEqual,
  loadTrackedCanonAuthorityOverlays,
} from '../scripts/canon-authority-overlay.mjs';
import { applyTrackedWorldSimRefinements } from '../scripts/world-sim-refinement-overlay.mjs';
import { loadTs } from './loadTs.mjs';

const generatedRoot = new URL('../mod-kit/generated/deepseek-v4-flash/', import.meta.url);
const builtinDir = new URL('../src/modules/scenarioMods/builtins/data/', import.meta.url);
const gitignoreUrl = new URL('../.gitignore', import.meta.url);

const STAGES = [
  { stageId: 'lcq.stage_04b_lingfei_baiyi_crisis', book: 'qingyu' },
  { stageId: 'lcq.stage_05b', book: 'qingyu' },
  { stageId: 'lcq.stage_06', book: 'qingyu' },
  { stageId: 'lcq.stage_07_qingyuan_jiankang', book: 'qingyu' },
  { stageId: 'lcq.stage_08_jiankang_coup', book: 'qingyu' },
  { stageId: 'lyl.lin_an_bridge', book: 'yunlong' },
  { stageId: 'lcq.stage_03b_snake_flower_bridge', book: 'qingyu' },
  { stageId: 'lcq.stage_04', book: 'qingyu' },
  { stageId: 'lcq.stage_02', book: 'qingyu' },
];

function miniMod(name = 'old') {
  return {
    manifest: { id: 'test.stage' },
    scenario: {
      initialFlags: { 'event.a.done': false, 'event.b.done': false },
      events: [{ id: 'test.event.a', name }],
    },
  };
}

async function loadGenerated(stage) {
  const url = new URL(`${stage.book}/stages/${stage.stageId}.json`, generatedRoot);
  return JSON.parse(await readFile(url, 'utf8'));
}

async function loadBuiltin(stageId) {
  return JSON.parse(await readFile(new URL(`${stageId}.json`, builtinDir), 'utf8'));
}

test('set/insert ops are deterministic, idempotent, and fail closed on source drift', () => {
  const overlay = {
    stageId: 'test.stage',
    ops: [
      {
        op: 'insertKeys',
        path: 'scenario.initialFlags',
        afterKey: 'event.a.done',
        beforeKey: 'event.b.done',
        entries: { 'event.x.done': false },
      },
      {
        op: 'set',
        path: 'scenario.events[id=test.event.a].name',
        from: 'old',
        to: 'new',
      },
      {
        op: 'insertAfter',
        path: 'scenario.events',
        afterId: 'test.event.a',
        value: { id: 'test.event.x', name: 'extra' },
      },
    ],
  };

  const first = miniMod();
  assert.equal(applyCanonAuthorityOverlay(first, overlay), 3);
  assert.equal(first.scenario.events[0].name, 'new');
  assert.deepEqual(Object.keys(first.scenario.initialFlags), ['event.a.done', 'event.x.done', 'event.b.done']);
  assert.deepEqual(first.scenario.events.map(event => event.id), ['test.event.a', 'test.event.x']);

  const second = structuredClone(first);
  assert.equal(applyCanonAuthorityOverlay(second, overlay), 0);
  assert.deepEqual(second, first);

  const drifted = miniMod('other');
  assert.throws(() => applyCanonAuthorityOverlay(drifted, overlay), /source drift/);
});

test('buildCanonAuthorityOps refuses deletions and reconstructs by applying the ops', () => {
  const from = miniMod();
  const to = miniMod('new');
  to.scenario.events.push({ id: 'test.event.x', name: 'extra' });
  to.scenario.initialFlags = { 'event.a.done': false, 'event.x.done': false, 'event.b.done': false };
  const ops = buildCanonAuthorityOps(from, to);
  const applied = miniMod();
  applyCanonAuthorityOverlay(applied, { stageId: 'test.stage', ops });
  assert.equal(deepEqual(applied, to), true);

  const wouldDelete = miniMod();
  delete wouldDelete.scenario.events;
  assert.throws(() => buildCanonAuthorityOps(miniMod(), wouldDelete), /would delete/);
});

test('clearing a non-empty id-array fail-closes; empty→filled and non-id arrays still set', () => {
  assert.throws(
    () => buildCanonAuthorityOps(
      { scenario: { events: [{ id: 'a' }, { id: 'b' }] } },
      { scenario: { events: [] } },
    ),
    /would delete ids a, b at scenario.events/,
  );

  assert.deepEqual(
    buildCanonAuthorityOps(
      { scenario: { events: [] } },
      { scenario: { events: [{ id: 'a' }] } },
    ),
    [{ op: 'set', path: 'scenario.events', from: [], to: [{ id: 'a' }] }],
  );

  assert.deepEqual(
    buildCanonAuthorityOps(
      { scenario: { tags: ['old', 'also'] } },
      { scenario: { tags: ['new'] } },
    ),
    [{ op: 'set', path: 'scenario.tags', from: ['old', 'also'], to: ['new'] }],
  );
  assert.deepEqual(
    buildCanonAuthorityOps(
      { scenario: { tags: ['old'] } },
      { scenario: { tags: [] } },
    ),
    [{ op: 'set', path: 'scenario.tags', from: ['old'], to: [] }],
  );
  assert.deepEqual(
    buildCanonAuthorityOps(
      { scenario: { notes: [{ name: 'x' }] } },
      { scenario: { notes: [] } },
    ),
    [{ op: 'set', path: 'scenario.notes', from: [{ name: 'x' }], to: [] }],
  );
});

test('id-addressed source keeps a valid id-array; malformed target or source fail-closes', () => {
  const fromAB = { scenario: { events: [{ id: 'a' }, { id: 'b' }] } };

  assert.throws(
    () => buildCanonAuthorityOps(fromAB, { scenario: { events: [{ note: 'no-id-field' }] } }),
    /target id-array item missing string id at scenario.events\[0\]/,
  );
  assert.throws(
    () => buildCanonAuthorityOps(fromAB, { scenario: { events: [{ id: 'a' }, { note: 'x' }] } }),
    /target id-array item missing string id at scenario.events\[1\]/,
  );
  assert.throws(
    () => buildCanonAuthorityOps(fromAB, { scenario: { events: [{}] } }),
    /target id-array item missing string id at scenario.events\[0\]/,
  );
  assert.throws(
    () => buildCanonAuthorityOps(fromAB, { scenario: { events: [null] } }),
    /target id-array item missing string id at scenario.events\[0\]/,
  );
  assert.throws(
    () => buildCanonAuthorityOps(fromAB, { scenario: { events: [{ id: 1 }] } }),
    /target id-array item missing string id at scenario.events\[0\]/,
  );
  assert.throws(
    () => buildCanonAuthorityOps(fromAB, { scenario: { events: [{ id: null }] } }),
    /target id-array item missing string id at scenario.events\[0\]/,
  );
  assert.throws(
    () => buildCanonAuthorityOps(fromAB, { scenario: { events: [{ id: '' }] } }),
    /target id-array has empty id at scenario.events\[0\]/,
  );
  assert.throws(
    () => buildCanonAuthorityOps(fromAB, { scenario: { events: [{ id: 'c' }, { id: 'c' }] } }),
    /target id-array has duplicate id c at scenario.events/,
  );
  assert.throws(
    () => buildCanonAuthorityOps(fromAB, { scenario: { events: [{ id: 'a' }, { id: 'a' }] } }),
    /target id-array has duplicate id a at scenario.events/,
  );
  assert.throws(
    () => buildCanonAuthorityOps(fromAB, { scenario: { events: null } }),
    /must keep id-addressed array at scenario.events/,
  );
  assert.throws(
    () => buildCanonAuthorityOps(fromAB, { scenario: { events: 'oops' } }),
    /must keep id-addressed array at scenario.events/,
  );
  assert.throws(
    () => buildCanonAuthorityOps(fromAB, { scenario: { events: { id: 'a' } } }),
    /must keep id-addressed array at scenario.events/,
  );
  assert.throws(
    () => buildCanonAuthorityOps(
      { scenario: { events: [{ id: 'a' }, { id: 'a' }] } },
      { scenario: { events: [{ id: 'a' }, { id: 'a' }, { id: 'b' }] } },
    ),
    /source id-array has duplicate id a at scenario.events/,
  );
  assert.throws(
    () => buildCanonAuthorityOps(
      { scenario: { events: [{ id: '' }] } },
      { scenario: { events: [{ id: 'a' }] } },
    ),
    /source id-array has empty id at scenario.events\[0\]/,
  );

  assert.deepEqual(
    buildCanonAuthorityOps(fromAB, { scenario: { events: [{ id: 'c' }] } }),
    [{
      op: 'set',
      path: 'scenario.events',
      from: [{ id: 'a' }, { id: 'b' }],
      to: [{ id: 'c' }],
    }],
  );
  assert.deepEqual(
    buildCanonAuthorityOps(fromAB, { scenario: { events: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } }),
    [{ op: 'insertAfter', path: 'scenario.events', afterId: 'b', value: { id: 'c' } }],
  );
  assert.deepEqual(
    buildCanonAuthorityOps(
      { scenario: { events: [{ id: 'a' }] } },
      { scenario: { events: [{ id: 'a', name: 'x' }] } },
    ),
    [{
      op: 'insertKeys',
      path: 'scenario.events[id=a]',
      afterKey: 'id',
      beforeKey: null,
      entries: { name: 'x' },
    }],
  );
  assert.deepEqual(
    buildCanonAuthorityOps(
      { scenario: { events: [{ id: 'a' }, { name: 'x' }] } },
      { scenario: { events: [{ id: 'b' }] } },
    ),
    [{
      op: 'set',
      path: 'scenario.events',
      from: [{ id: 'a' }, { name: 'x' }],
      to: [{ id: 'b' }],
    }],
  );
  assert.deepEqual(
    buildCanonAuthorityOps(
      { scenario: { events: [{ id: 1 }] } },
      { scenario: { events: [{ id: 'a' }] } },
    ),
    [{ op: 'set', path: 'scenario.events', from: [{ id: 1 }], to: [{ id: 'a' }] }],
  );
  assert.deepEqual(
    buildCanonAuthorityOps(
      { scenario: { events: [] } },
      { scenario: { events: [{ id: 'a' }, { id: 'a' }] } },
    ),
    [{ op: 'set', path: 'scenario.events', from: [], to: [{ id: 'a' }, { id: 'a' }] }],
  );
});

test('tracked overlays are exactly the nine generated→builtin closures', async () => {
  const catalog = await loadTrackedCanonAuthorityOverlays();
  assert.deepEqual(catalog.stageIds, STAGES.map(stage => stage.stageId));
  assert.equal(catalog.manifest.overlays.length, 9);
});

test('generated plus tracked overlay reconstructs the Git-tracked builtins', async () => {
  const catalog = await loadTrackedCanonAuthorityOverlays();
  for (const stage of STAGES) {
    const generated = await loadGenerated(stage);
    const builtin = await loadBuiltin(stage.stageId);
    assert.equal(deepEqual(generated, builtin), false, `${stage.stageId} generated already equals builtin`);
    await applyTrackedWorldSimRefinements(generated);
    const result = await applyTrackedCanonAuthorityOverlay(generated, catalog);
    assert.equal(result.matched, true, stage.stageId);
    assert.equal(result.applied > 0, true, stage.stageId);
    assert.equal(deepEqual(generated, builtin), true, `${stage.stageId} overlay did not reconstruct builtin`);
    assert.equal(
      `${JSON.stringify(generated, null, 2)}\n`,
      `${JSON.stringify(builtin, null, 2)}\n`,
      `${stage.stageId} stringify drifted`,
    );
    const again = await applyTrackedCanonAuthorityOverlay(generated, catalog);
    assert.equal(again.applied, 0, `${stage.stageId} second apply is not idempotent`);
  }
});

test('source drift in a load-bearing generated field fails closed', async () => {
  const catalog = await loadTrackedCanonAuthorityOverlays();
  const generated = await loadGenerated(STAGES.find(stage => stage.stageId === 'lcq.stage_05b'));
  const slay = generated.scenario.events.find(event => event.id === 'lcq.event.slay_dragon');
  slay.description = 'drifted source';
  await applyTrackedWorldSimRefinements(generated);
  assert.throws(
    () => applyCanonAuthorityOverlay(generated, catalog.byStageId.get('lcq.stage_05b')),
    /source drift/,
  );
});

test('missing overlay directory and unlisted overlay files fail closed', async () => {
  await assert.rejects(
    loadTrackedCanonAuthorityOverlays(join(tmpdir(), `xiantu-missing-overlays-${Date.now()}`)),
    /overlay directory missing/,
  );

  const dir = await mkdtemp(join(tmpdir(), 'xiantu-overlay-extra-'));
  try {
    await writeFile(join(dir, 'manifest.json'), `${JSON.stringify({
      version: 1,
      overlays: [{ stageId: 'test.stage', file: 'test.stage.json', book: 'qingyu' }],
    }, null, 2)}\n`);
    await writeFile(join(dir, 'test.stage.json'), `${JSON.stringify({
      version: 1,
      stageId: 'test.stage',
      ops: [{ op: 'set', path: 'manifest.id', from: 'test.stage', to: 'test.stage' }],
    }, null, 2)}\n`);
    await writeFile(join(dir, 'extra.json'), '{}\n');
    await assert.rejects(loadTrackedCanonAuthorityOverlays(dir), /overlay files/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('sync fails closed if a listed overlay stage is not consumed', async () => {
  const catalog = await loadTrackedCanonAuthorityOverlays();
  await assert.rejects(
    assertCanonAuthorityOverlaysApplied(new Set(['lcq.stage_05b']), catalog),
    /did not apply overlays/,
  );
});

test('stage_06 quarantine and frozen s06_03 ids stay in place', async () => {
  const { DEFAULT_LINE_QUARANTINED_STAGE_IDS } = await loadTs('../src/modules/scenarioMods/canonRail.ts');
  assert.equal(DEFAULT_LINE_QUARANTINED_STAGE_IDS.has('lcq.stage_06'), true);

  const stage06 = await loadBuiltin('lcq.stage_06');
  assert.deepEqual(stage06.scenario.events.map(event => [event.id, event.axisId, event.axisSeq]), [
    ['lcq.event.s06_01', 'qingyu.114.2', 205],
    ['lcq.event.s06_02', 'qingyu.117.1', 211],
    ['lcq.event.s06_03', 'qingyu.116.1', 210],
    ['lcq.event.s06_04', 'qingyu.120.1', 217],
    ['lcq.event.s06_05', 'qingyu.122.2', 222],
    ['lcq.event.s06_06', 'qingyu.126.2', 226],
  ]);
  assert.equal(stage06.scenario.events.find(event => event.id === 'lcq.event.s06_03').axisMethod, 'source-rebuilt-frozen-if-anchor');

  const overlay = (await loadTrackedCanonAuthorityOverlays()).byStageId.get('lcq.stage_06');
  assert.equal(overlay.ops.length, 1);
  assert.equal(overlay.ops[0].path.includes('s06_03'), true);
  assert.equal(JSON.stringify(overlay).includes('missing'), false);
});

test('generated stage tree stays gitignored; overlay is the tracked authority delta', async () => {
  const gitignore = await readFile(gitignoreUrl, 'utf8');
  assert.match(gitignore, /^mod-kit\/generated\/\*$/m);
  assert.match(gitignore, /^mod-kit\/generated\/deepseek-v4-flash\/\*$/m);
  assert.equal(gitignore.includes('!mod-kit/generated/deepseek-v4-flash/qingyu/'), false);
  assert.equal(gitignore.includes('!mod-kit/generated/deepseek-v4-flash/yunlong/'), false);
});
