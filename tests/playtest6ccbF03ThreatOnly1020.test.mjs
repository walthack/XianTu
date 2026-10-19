// 6ccb 真机 P1：F03 第 1 拍 4 次攻击全写成「→程宗扬」，绕向后方/阿夕一侧的两下也算打在主角身上。
// 改为 threatOnly：主角只做拦截判定，没拦住只推后方威胁轨，不挂伤、不扣气血、结果行不写「→主角」。
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './loadTs.mjs';
const mod = await loadTs('../src/modules/sceneModule/index.ts');
const enemy = await loadTs('../src/modules/sceneModule/enemy.ts');
const registry = await loadTs('../src/modules/sceneModule/contracts/registry.ts');
const lint = await loadTs('../src/modules/sceneModule/lint.ts');

test('F03 第 1 拍全被打中：两下威胁动作只推威胁轨，不算打在主角身上', () => {
  const c = registry.sceneContractById('combat.f03.mountain_stream_fog');
  const state = mod.beginScene(c, { forced: { defense: Array(20).fill(1) } }).state;
  state.status = 'engaged';
  const before = state.tracks.ally_threat?.threat || 0;
  const phase = enemy.resolveEnemyPhase(c, state, { factors: 0, playerDefense: 0 });
  const threat = phase.rolls.filter(r => ['threat_bride', 'threat_a_xi'].includes(r.actionId));
  assert.equal(threat.length, 2, JSON.stringify(phase.rolls.map(r => r.actionId)));
  for (const r of threat) { assert.equal(r.threatOnly, true); assert.equal(r.outcome, 'hit'); assert.deepEqual(r.statuses, []); assert.equal(r.woundTier, undefined); }
  assert.equal((state.tracks.ally_threat?.threat || 0) - before, 2, '威胁轨各推一格');
  const lines = mod.renderResultLines(c, { enemy: phase.rolls, assist: [], events: [], claims: [], statusEvents: [] });
  const tl = lines.filter(l => /绕向后方|一侧/.test(l));
  assert.equal(tl.length, 2);
  for (const l of tl) { assert.doesNotMatch(l, /→/); assert.match(l, /拦截 .*没拦住/); }
  assert.ok(lines.some(l => /铁斧劈向你→/.test(l)), '正面攻击照旧写「→主角」');
});

test('lint：threatOnly 不能带 woundRule／onHit.statuses', () => {
  const c = structuredClone(registry.sceneContractById('combat.f03.mountain_stream_fog'));
  c.enemyActions.find(a => a.id === 'threat_bride').woundRule = 'default';
  const out = lint.lintContract(c);
  const errs = (out.errors || out).map(String).join('\n');
  assert.match(errs, /threatOnly/);
});
