// 6ccb 真机 P1：F02 B 线玩家用「逼退」的打法，收场仍是「倒下」——合同里没有「逼退」类目标，被当成攻击。
// 新增 drive_off（逼她退开，finishAs 松口退开）；松口退开在救治窗口规则内（与 persuade 同一收场）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './loadTs.mjs';
const mod = await loadTs('../src/modules/sceneModule/index.ts');
const reg = await loadTs('../src/modules/sceneModule/contracts/registry.ts');
const rec = await loadTs('../src/modules/sceneModule/host/recognize.ts');
const rescue = await loadTs('../src/modules/scenarioMods/shiweimoRescue.ts');
const CTX = { factors: 0, playerDefense: 0 };
const c = reg.sceneContractById('combat.f02.snake_assault');

test('「逼退她」「把她逼退」识别为 drive_off，不再落到攻击', () => {
  const s = mod.beginScene(c, { seed: 1 }).state;
  for (const t of ['我逼退她', '我把她逼退', '吓退她']) assert.equal(rec.recognizeByRules(c, s, t)?.goal, 'drive_off', t);
  assert.equal(rec.recognizeByRules(c, s, '我挥刀攻击')?.goal, 'attack');
});

test('骰面全满按 drive_off 打完，收场是「松口退开」，可进救治窗口', () => {
  let s = mod.beginScene(c, { forced: { action: Array(20).fill(20), defense: Array(20).fill(20) } }).state;
  for (let i = 0; i < 8 && s.status !== 'decided'; i++) s = mod.confirmAction(c, s, { goal: 'drive_off', magnitude: 1, scope: 'single', targets: ['snake_man'], levers: [] }, CTX).state;
  assert.equal(s.status, 'decided');
  assert.equal(s.outcome.kind, 'win');
  const row = mod.closeScene(c, s, {}).writeBack.finalStates.find(r => r.party === 'snake_man');
  assert.equal(row.label, '松口退开');
  assert.equal(rescue.rescueWindowOpen('松口退开', 1), true);
});
