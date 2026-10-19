// 6ccb 真机 P0：主角气血打到 1／挂「倒下（加重）」后不判负（F03、F04、F09 都见到，F09 打到第 25 拍仍不结束）。
// 单测为何没拦住：fee4HpDownedAndWounds1020 只断言 hpDowned 旗标与 isDowned()，没断言「合同没写 partyDowned(pc)」时也会判负；
// F09 的 defeat 只有「一阳耗尽」一条，F03/F04 同样没有主角倒下条件。本文件用真机现场（CP-6ccb-11 的场面状态）复现。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';
const scene = await loadTs('../src/modules/sceneModule/scene.ts');
const registry = await loadTs('../src/modules/sceneModule/contracts/registry.ts');
const N = JSON.parse(readFileSync(new URL('../mod-kit/numbers-combat.json', import.meta.url), 'utf8')).combat.woundRules;
const fx = JSON.parse(readFileSync(new URL('./fixtures/playtest-6ccb/f09-stuck-beat25.json', import.meta.url), 'utf8')).f09Stuck;

test('配置：主角倒下即判负（全局）已打开', () => assert.equal(N.hp.playerDownedLoses, true));

test('真机现场 F09 第 25 拍：气血 1、hpDowned、挂 incapacitated → 判负', () => {
  const c = registry.sceneContractById('combat.f09.yinsha');
  assert.ok(c, 'F09 合同');
  assert.ok(!(c.defeat.conditions || []).some(x => x.kind === 'partyDowned' && x.party === 'pc'), '合同本身不含主角倒下条件——这正是卡死原因');
  const state = structuredClone(fx.active);
  assert.equal(fx.hp.当前, 1);
  assert.equal(state.status, 'engaged');
  assert.equal(scene.isLost(c, state), true);
  assert.equal(scene.settleDownedAfterHostSync(c, state), true);
  assert.equal(state.status, 'decided');
  assert.equal(state.outcome.kind, 'lose');
});

test('只挂 downed 类状态（没 hpDowned）也判负；只有 hpDowned（没状态）也判负；都没有不判负', () => {
  const c = registry.sceneContractById('combat.f09.yinsha');
  const a = structuredClone(fx.active); delete a.hpDowned; assert.equal(scene.isLost(c, a), true);
  const b = structuredClone(fx.active); b.statuses.pc = []; assert.equal(scene.isLost(c, b), true);
  const d = structuredClone(fx.active); d.statuses.pc = []; delete d.hpDowned; assert.equal(scene.isLost(c, d), false);
});

test('F03、F04 合同同样适用（不靠合同自己写 partyDowned）', () => {
  for (const id of ['combat.f03.mountain_stream_fog', 'combat.f04.crow_man']) {
    const c = registry.sceneContractById(id);
    assert.ok(c, id);
    const pc = c.parties.find(p => p.player).id;
    const st = { status: 'engaged', beat: 2, statuses: {}, tracks: {}, sceneTracks: {}, tags: [], flags: {}, present: Object.fromEntries(c.parties.map(p => [p.id, true])), departed: {}, hpDowned: { [pc]: true } };
    assert.equal(scene.playerDownedLoses(c, st), true, id);
  }
});

test('controller：每拍 syncSceneStatuses 之后当拍判负', () => {
  const src = readFileSync(new URL('../src/modules/sceneModule/host/controller.ts', import.meta.url), 'utf8');
  assert.match(src, /syncSceneStatuses\(save,c,a\.state\);\n[^\n]*\n\s*if\(settleDownedAfterHostSync\(c,a\.state/);
});
