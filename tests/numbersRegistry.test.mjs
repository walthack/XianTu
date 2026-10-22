// Numbers registry：四分包（战斗/成长/运行/助战）合并、冷启动 LCQ-NUM-007、热改 LCQ-NUM-008、与 applyGameNumbers 衔接。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const readJson = (rel) => JSON.parse(readFileSync(path.join(root, rel), 'utf8'));

const COMBAT_KEYS = ['combat', 'difficulty', 'judgement', 'factors', 'weights', 'goalModifiers', 'sceneDefaults', 'historicalPrototype'];
const PROGRESS_KEYS = ['levels', 'training', 'techniques', 'status', 'currency', 'freeAction', 'affinity', 'reputation', 'lineBonds', 'npcCard', 'story', 'shop', 'crafting'];
const RUNTIME_KEYS = ['version', 'tuning', 'diagnostics', 'saves', 'aiRetry', 'feedback', 'e2eSmoke', 'perf'];
const ASSIST_KEYS = ['assist'];

test('权威四分包顶层键无重叠且并集盖住合并视图', () => {
  const combat = readJson('mod-kit/numbers-combat.json');
  const progress = readJson('mod-kit/numbers-progress.json');
  const runtime = readJson('mod-kit/numbers-runtime.json');
  const assist = readJson('mod-kit/numbers-assist.json');
  const merged = readJson('mod-kit/game-numbers.qingyu.json');
  assert.deepEqual(Object.keys(assist).sort(), [...ASSIST_KEYS].sort());
  assert.deepEqual(Object.keys(combat).sort(), [...COMBAT_KEYS].sort());
  assert.deepEqual(Object.keys(progress).sort(), [...PROGRESS_KEYS].sort());
  assert.deepEqual(Object.keys(runtime).sort(), [...RUNTIME_KEYS].sort());
  const union = new Set([...Object.keys(combat), ...Object.keys(progress), ...Object.keys(runtime), ...Object.keys(assist)]);
  assert.deepEqual([...union].sort(), Object.keys(merged).sort());
  for (const key of Object.keys(merged)) {
    const src = key in combat ? combat[key] : key in progress ? progress[key] : key in assist ? assist[key] : runtime[key];
    assert.deepEqual(merged[key], src, key);
  }
});

test('GAME_NUMBERS 冷启动合并形状与生成物一致，registry 通过', async () => {
  const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
  const registry = await loadTs('../src/modules/sceneModule/numbersRegistry.ts');
  const merged = readJson('mod-kit/game-numbers.qingyu.json');
  assert.deepEqual(structuredClone(numbers.GAME_NUMBERS), merged);
  assert.deepEqual(registry.validateAgainstRegistry(numbers.GAME_NUMBERS, 'cold'), []);
});

test('本轮迁入的 6 条键已在配置且代码可读', async () => {
  const N = (await loadTs('../src/modules/sceneModule/numbers.ts')).GAME_NUMBERS;
  assert.equal(N.judgement.dice.sides, 20);
  assert.equal(N.affinity.range.min, -100);
  assert.equal(N.affinity.range.max, 100);
  assert.equal(N.status.permanentMinutesThreshold, 99999);
  assert.equal(N.sceneDefaults.brief.narrateMaxChars, 700);
  assert.equal(N.sceneDefaults.auditKeep, 200);
  assert.equal(N.status.freeText.minConfidence, 0.9);
  const dice = await loadTs('../src/modules/sceneModule/dice.ts');
  const face = dice.dieAt(1, 'action', 0);
  assert.ok(face >= 1 && face <= N.judgement.dice.sides);
});

test('冷启动缺段 → LCQ-NUM-007', async () => {
  const registry = await loadTs('../src/modules/sceneModule/numbersRegistry.ts');
  const tree = structuredClone(readJson('mod-kit/game-numbers.qingyu.json'));
  delete tree.judgement;
  const errors = registry.validateAgainstRegistry(tree, 'cold');
  assert.ok(errors.some(e => /缺段：judgement/.test(e)));
});

test('热改 registry 范围失败 → LCQ-NUM-008，且 GAME_NUMBERS 未改', async () => {
  const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
  const before = numbers.GAME_NUMBERS.judgement.dice.sides;
  assert.throws(
    () => numbers.applyGameNumbers({ judgement: { dice: { sides: 1 } } }),
    err => err.code === 'LCQ-NUM-008' && /sides/.test(err.message),
  );
  assert.equal(numbers.GAME_NUMBERS.judgement.dice.sides, before);
});

test('热改未知键仍 LCQ-NUM-002；类型错仍 LCQ-NUM-003', async () => {
  const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
  assert.throws(() => numbers.applyGameNumbers({ nope: 1 }), err => err.code === 'LCQ-NUM-002');
  assert.throws(() => numbers.applyGameNumbers({ judgement: { dice: { sides: 'x' } } }), err => err.code === 'LCQ-NUM-003');
});

test('场景骰 / 好感钳制读配置', async () => {
  const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
  const affinity = await loadTs('../src/modules/scenarioMods/affinityLadder.ts');
  assert.equal(affinity.clampAffinity(-999), numbers.GAME_NUMBERS.affinity.range.min);
  assert.equal(affinity.clampAffinity(999), numbers.GAME_NUMBERS.affinity.range.max);
  const tiers = await loadTs('../src/modules/sceneModule/tiers.ts');
  const sides = numbers.GAME_NUMBERS.judgement.dice.sides;
  const hit = tiers.resolveCheck({ face: sides, modifier: -50, difficulty: 30, grounded: true }, tiers.resolveSettings());
  assert.equal(hit.tier, 'great_success');
  assert.equal(hit.natTriggered, 'nat20');
});
