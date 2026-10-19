import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';

const fx = n => JSON.parse(readFileSync(new URL(`./fixtures/playtest-6ccb/${n}`, import.meta.url), 'utf8'));

// P1-f：LCQ-SAV-020 是拍数门禁诊断码（beatLimit.ts）。combat.beatLimit.max 默认 0＝不限，所以 F09 打到 24 拍也不会记。
test('LCQ-SAV-020：默认 max=0 不触发；只有设了正整数才在超拍时记', async () => {
  const bl = await loadTs('../src/modules/sceneModule/beatLimit.ts');
  const registry = await loadTs('../src/modules/sceneModule/contracts/registry.ts');
  const f09 = fx('f09-stuck-beat25.json');
  const state = f09.f09Stuck.active;
  const c = registry.sceneContractById(state.contractId);
  assert.equal(bl.beatLimitConfig().max, 0);
  assert.equal(bl.checkBeatLimit(c, state), false);
  assert.equal(bl.checkBeatLimit(c, state, { max: 20 }), true);
});

// P1-c：真机 F02 后喂的是「锦囊」（凡品、无疗伤标签），不是珍品药。规则判无效、不消耗、不收侍从——存档是对的；
// 叙事里的「珍品」「有起色」是叙事模型编的（AIBS 冻结，只报告）。
test('F02 喂锦囊：判「没有用处」，诗薇莫仍待救、不成侍从', async () => {
  const rescue = await loadTs('../src/modules/scenarioMods/shiweimoRescue.ts');
  const save = fx('f02-after-fed.json');
  const r = rescue.settleShiweimoAction(save, { targetId: rescue.SHIWEIMO_ID, itemId: 'lcq.item.jin_nang' });
  assert.equal(r.handled, true);
  assert.deepEqual(r.facts, ['这东西对她的伤没有用处。']);
  assert.equal(save.系统.扩展.lcq_shiweimo.status, 'pending');
});
