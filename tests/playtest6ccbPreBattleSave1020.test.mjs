import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './loadTs.mjs';

const { writePreBattleSave } = await loadTs('../src/modules/sceneModule/host/preBattleSlot.ts');

// 复现 6ccb 真机：读过「战前存档」后它就是当前激活槽；开战后每拍 persist 写回当前激活槽，
// 战前档被覆盖成战斗第 1 拍（预览已出）。用一个模拟槽表重放：开战→写战前档→每拍写当前激活槽。
function harness(active) {
  const slots = {}; let current = active; let live = { inFight: false };
  const ops = {
    activeSlot: () => current,
    saveToSlot: async name => { slots[name] = { ...live }; },
    setActiveSlot: name => { current = name; },
  };
  const persistBeat = () => { live = { inFight: true }; slots[current] = { ...live }; };
  return { slots, ops, persistBeat, get current() { return current; } };
}

test('当前激活槽就是战前存档：先挪到战斗进行中槽，战前档留在战外', async () => {
  const h = harness('战前存档');
  const r = await writePreBattleSave(h.ops);
  h.persistBeat(); h.persistBeat();
  assert.equal(r.movedTo, '战斗进行中');
  assert.equal(h.current, '战斗进行中');
  assert.equal(h.slots['战前存档'].inFight, false, '战前存档必须在战外');
  assert.equal(h.slots['战斗进行中'].inFight, true);
});

test('普通槽开战：不挪槽，战前档在战外', async () => {
  const h = harness('自动存档');
  const r = await writePreBattleSave(h.ops);
  h.persistBeat();
  assert.equal(r.movedTo, undefined);
  assert.equal(h.slots['战前存档'].inFight, false);
});
