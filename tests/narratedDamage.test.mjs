import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

function makeSaveData(current = 100, max = 100) {
  return {
    角色: {
      属性: {
        气血: { 当前: current, 上限: max },
      },
    },
  };
}

test('detects narrated player damage on failed combat judgement with explicit injury', async () => {
  const { detectNarratedPlayerDamage } = await loadTs('../src/utils/narratedDamage.ts');

  const text = '短刃寒光已至咽喉！〔战斗:失败,判定值:32,难度:40,基础:5,幸运:+4,环境:-3,状态:+26〕你闪避慢了一线，咽喉被刀锋割破，血珠沿着领口滚落。';

  assert.deepEqual(detectNarratedPlayerDamage(text, [], makeSaveData()), {
    amount: -15,
    severity: 'minor',
    reason: '叙事战斗失败受伤补账（战斗:失败,判定值:32,难度:40,基础:5,幸运:+4,环境:-3,状态:+26）',
  });
});

test('does not infer damage from a failed combat judgement without explicit injury', async () => {
  const { detectNarratedPlayerDamage } = await loadTs('../src/utils/narratedDamage.ts');

  const text = '短刃寒光已至咽喉！〔战斗:失败,判定值:32,难度:40,基础:5,幸运:+4,环境:-3,状态:+26〕你踉跄后退，险险避开刀锋。';

  assert.equal(detectNarratedPlayerDamage(text, [], makeSaveData()), null);
});

test('does not add fallback damage when commands already update health or effects', async () => {
  const { detectNarratedPlayerDamage } = await loadTs('../src/utils/narratedDamage.ts');

  const text = '〔战斗:失败,判定值:32,难度:40〕你被短刃刺中肩头，鲜血立刻渗出。';
  const commands = [{ action: 'add', key: '角色.属性.气血.当前', value: -8 }];

  assert.equal(detectNarratedPlayerDamage(text, commands, makeSaveData()), null);
});

test('detects major narrated player damage on disastrous combat failure', async () => {
  const { detectNarratedPlayerDamage } = await loadTs('../src/utils/narratedDamage.ts');

  const text = '〔战斗:大失败,判定值:20,难度:40〕你被一刀贯穿胸口，鲜血喷溅，整个人重重摔倒。';

  assert.equal(detectNarratedPlayerDamage(text, [], makeSaveData(80, 100))?.amount, -50);
});
