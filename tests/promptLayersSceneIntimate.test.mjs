// 角色设定分层第 2 步：事件可选字段 scene: { intimate?, characters? } 与 promptLayers.beatIntimateFor（P8：只标已知亲密拍）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';
import { applyCanonAuthorityOverlay } from '../scripts/canon-authority-overlay.mjs';

const { beatIntimateFor } = await loadTs('../src/modules/scenarioMods/promptLayers.ts');
const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');

const DATA = new URL('../src/modules/scenarioMods/builtins/data/', import.meta.url);
const OVERLAYS = new URL('../mod-kit/canon-authority-overlays/', import.meta.url);
const readJson = url => JSON.parse(readFileSync(url, 'utf8'));
const F = 'liuchao.character.zhao_feiyan';
const B = 'liuchao.character.bai_nichang';
const LV = 'liuchao.character.lv_zhi';

// 已知亲密拍（依据见提交信息）；改动这张表须用户确认。
const EXPECTED = {
  'lyg.han_succession': {
    'lyg.event.han_succession_06_beat': [F],
    'lyg.event.han_succession_07_beat': [F],
    'lyg.event.dengji_yuzuo_yinhuan': [F],
  },
  'lyg.changgan_interlude': { 'lyg.event.changgan_interlude_07_beat': [F] },
  'lyg.liangzhou_league': { 'lyg.event.s06_08': [B] },
};

test('beatIntimateFor：intimate 为 true 且角色在 characters 里才真', () => {
  const beat = { relatedCharacterIds: ['a', 'b'], scene: { intimate: true, characters: ['b'] } };
  assert.equal(beatIntimateFor(beat, 'b'), true);
  assert.equal(beatIntimateFor(beat, 'a'), false, 'characters 给了就只认 characters');
  assert.equal(beatIntimateFor({ ...beat, scene: { intimate: false, characters: ['b'] } }, 'b'), false);
  assert.equal(beatIntimateFor({ ...beat, scene: { characters: ['b'] } }, 'b'), false, '没标 intimate 不算');
  assert.equal(beatIntimateFor({ ...beat, scene: { intimate: 'true', characters: ['b'] } }, 'b'), false, '只认布尔 true');
  assert.equal(beatIntimateFor({ ...beat, scene: { intimate: true, characters: [] } }, 'a'), false, '空名单不回落');
  assert.equal(beatIntimateFor({ relatedCharacterIds: ['a'] }, 'a'), false, '无 scene');
  assert.equal(beatIntimateFor(null, 'a'), false);
  assert.equal(beatIntimateFor(undefined, 'a'), false);
  assert.equal(beatIntimateFor(beat, ''), false);
  assert.equal(beatIntimateFor(beat, null), false);
});

test('beatIntimateFor：characters 省略时取 relatedCharacterIds', () => {
  const beat = { relatedCharacterIds: ['a', 'b'], scene: { intimate: true } };
  assert.equal(beatIntimateFor(beat, 'a'), true);
  assert.equal(beatIntimateFor(beat, 'b'), true);
  assert.equal(beatIntimateFor(beat, 'c'), false);
  assert.equal(beatIntimateFor({ scene: { intimate: true } }, 'a'), false, '两者都没有');
});

function modWithEvent(extra) {
  const mod = readJson(new URL('lyg.liangzhou_league.json', DATA));
  mod.scenario.events[0] = { ...mod.scenario.events[0], ...extra };
  return mod;
}
const sceneIssues = result => result.issues.filter(issue => issue.path.includes('.scene'));

test('校验：scene 可省；合法写法无报错；类型错误报在 scene 路径上', () => {
  const base = validateScenarioMod(modWithEvent({}));
  assert.deepEqual(sceneIssues(base), []);
  for (const scene of [{ intimate: true }, { intimate: false, characters: [F] }, { characters: [] }, {}]) {
    assert.deepEqual(sceneIssues(validateScenarioMod(modWithEvent({ scene }))), [], JSON.stringify(scene));
  }
  for (const [scene, code] of [
    ['intimate', 'invalid_type'],
    [[], 'invalid_type'],
    [{ intimate: 'yes' }, null],
    [{ characters: F }, 'invalid_type'],
    [{ characters: [''] }, null],
  ]) {
    const issues = sceneIssues(validateScenarioMod(modWithEvent({ scene })));
    assert.ok(issues.length > 0, `应报错：${JSON.stringify(scene)}`);
    if (code) assert.ok(issues.some(issue => issue.code === code), JSON.stringify(issues));
  }
});

test('内置关：scene 只出现在已知亲密拍，标注与表一致，且整关校验通过', () => {
  const found = {};
  for (const file of readdirSync(DATA).filter(name => name.endsWith('.json'))) {
    const mod = readJson(new URL(file, DATA));
    for (const event of mod.scenario?.events || []) {
      if (event.scene === undefined) continue;
      const stage = file.replace(/\.json$/, '');
      (found[stage] ||= {})[event.id] = event.scene.characters;
      assert.equal(event.scene.intimate, true, event.id);
      const cast = new Set((mod.canon?.characters || []).map(c => c.id));
      for (const id of event.scene.characters || event.relatedCharacterIds) assert.ok(cast.has(id), `${event.id} 角色 ${id} 须在本关 canon.characters`);
    }
  }
  assert.deepEqual(found, EXPECTED);
  for (const stage of Object.keys(EXPECTED)) {
    const result = validateScenarioMod(readJson(new URL(`${stage}.json`, DATA)));
    assert.deepEqual(sceneIssues(result), [], stage);
  }
});

test('内置关：吕雉不在任何亲密拍名单里（s06_08 只标白霓裳，吕雉待用户确认）', () => {
  const mod = readJson(new URL('lyg.liangzhou_league.json', DATA));
  const event = mod.scenario.events.find(e => e.id === 'lyg.event.s06_08');
  assert.ok(event.relatedCharacterIds.includes(LV), '前提：吕雉在 relatedCharacterIds');
  assert.equal(beatIntimateFor(event, B), true);
  assert.equal(beatIntimateFor(event, LV), false);
});

test('overlay 同步：scene 的 insertKeys 套到去掉 scene 的内置关上，得到现内置关（字节级）', () => {
  for (const stage of Object.keys(EXPECTED)) {
    const current = readJson(new URL(`${stage}.json`, DATA));
    const overlay = readJson(new URL(`${stage}.json`, OVERLAYS));
    const sceneOps = overlay.ops.filter(op => op.op === 'insertKeys' && op.entries && 'scene' in op.entries);
    assert.deepEqual(sceneOps.map(op => op.path.match(/\[id=(.+)\]/)[1]).sort(), Object.keys(EXPECTED[stage]).sort(), stage);
    const stripped = structuredClone(current);
    for (const event of stripped.scenario.events) delete event.scene;
    applyCanonAuthorityOverlay(stripped, { ...overlay, ops: sceneOps });
    assert.equal(JSON.stringify(stripped), JSON.stringify(current), stage);
  }
});
