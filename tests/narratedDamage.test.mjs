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

test('does not add fallback damage when commands already add a status effect', async () => {
  const { detectNarratedPlayerDamage } = await loadTs('../src/utils/narratedDamage.ts');

  const text = '你被巨兽的利爪划过，鲜血淋漓，身受重伤！〔战斗:大失败,判定值:5,难度:40〕';
  const commands = [
    {
      action: 'push',
      key: '角色.效果',
      value: { 状态名称: '重伤', 类型: '负面', 描述: '巨兽利爪造成的重伤。' },
    },
  ];

  assert.equal(detectNarratedPlayerDamage(text, commands, makeSaveData(100, 200)), null);
});

test('detects injury narration even when a failed dodge partially succeeds', async () => {
  const { detectNarratedPlayerDamage } = await loadTs('../src/utils/narratedDamage.ts');

  const text = '在幽暗的山洞深处，你与一只暗影狼王鏖战许久。〔战斗:失败,判定值:32,难度:40〕狼王一声低吼，利爪如墨色闪电般划出，你堪堪侧身闪避，但那锐利的爪尖还是在你臂膀上撕开了一道血痕，鲜血顺着袖口滴落在冰冷的石地上。';

  assert.deepEqual(detectNarratedPlayerDamage(text, [], makeSaveData()), {
    amount: -15,
    severity: 'minor',
    reason: '叙事战斗失败受伤补账（战斗:失败,判定值:32,难度:40）',
  });
});

test('detects major narrated player damage on disastrous combat failure', async () => {
  const { detectNarratedPlayerDamage } = await loadTs('../src/utils/narratedDamage.ts');

  const text = '〔战斗:大失败,判定值:20,难度:40〕你被一刀贯穿胸口，鲜血喷溅，整个人重重摔倒。';

  assert.equal(detectNarratedPlayerDamage(text, [], makeSaveData(80, 100))?.amount, -50);
});
