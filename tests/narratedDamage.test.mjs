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
    ratio: 0.15,
    severity: 'minor',
    reason: '叙事战斗失败受伤补账（战斗:失败,判定值:32,难度:40,基础:5,幸运:+4,环境:-3,状态:+26）',
  });
});

test('does not infer damage from a failed combat judgement without explicit injury', async () => {
  const { detectNarratedPlayerDamage } = await loadTs('../src/utils/narratedDamage.ts');

  const text = '短刃寒光已至咽喉！〔战斗:失败,判定值:32,难度:40,基础:5,幸运:+4,环境:-3,状态:+26〕你踉跄后退，险险避开刀锋。';

  assert.equal(detectNarratedPlayerDamage(text, [], makeSaveData()), null);
});

test('detects non-bleeding combat impact on failed judgement', async () => {
  const { detectNarratedPlayerDamage } = await loadTs('../src/utils/narratedDamage.ts');

  const text = '〔战斗:失败,判定值:32,难度:40〕刀锋没有见血，却震得护体灵光碎裂，程宗扬胸口发闷，气血一阵翻涌。';

  assert.deepEqual(detectNarratedPlayerDamage(text, [], makeSaveData()), {
    amount: -10,
    ratio: 0.10,
    severity: 'minor',
    reason: '叙事战斗失败受伤补账（战斗:失败,判定值:32,难度:40）',
  });
});

test('does not infer damage from negated non-bleeding impact narration', async () => {
  const { detectNarratedPlayerDamage } = await loadTs('../src/utils/narratedDamage.ts');

  const text = '〔战斗:失败,判定值:32,难度:40〕程宗扬被逼得连退两步，只是衣袖破开，并未受伤。';

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
    amount: -10,
    ratio: 0.10,
    severity: 'minor',
    reason: '叙事战斗失败受伤补账（战斗:失败,判定值:32,难度:40）',
  });
});

test('uses a light 5 percent fallback for minor narrated injuries', async () => {
  const { detectNarratedPlayerDamage } = await loadTs('../src/utils/narratedDamage.ts');

  const text = '〔战斗:失败,判定值:32,难度:40〕混乱中你挂了彩，气息微乱，却还站得稳。';

  assert.deepEqual(detectNarratedPlayerDamage(text, [], makeSaveData()), {
    amount: -5,
    ratio: 0.05,
    severity: 'minor',
    reason: '叙事战斗失败受伤补账（战斗:失败,判定值:32,难度:40）',
  });
});

test('detects major narrated player damage on disastrous combat failure', async () => {
  const { detectNarratedPlayerDamage } = await loadTs('../src/utils/narratedDamage.ts');

  const text = '〔战斗:大失败,判定值:20,难度:40〕你被一刀贯穿胸口，鲜血喷溅，整个人重重摔倒。';

  assert.equal(detectNarratedPlayerDamage(text, [], makeSaveData(80, 100))?.amount, -40);
  assert.equal(detectNarratedPlayerDamage(text, [], makeSaveData(80, 100))?.ratio, 0.4);
});

test('narrated damage fallback never reduces a living player to the zero-health death state', async () => {
  const { detectNarratedPlayerDamage } = await loadTs('../src/utils/narratedDamage.ts');
  const text = '〔战斗:大失败,判定值:5,难度:40〕你被一刀贯穿胸口，鲜血喷溅，整个人重重摔倒。';
  assert.equal(detectNarratedPlayerDamage(text, [], makeSaveData(5, 100))?.amount, -4);
});

test('unmarked zero health recovers as severe injury, while explicit player death remains zero', async () => {
  const { recoverUnmarkedPlayerZeroHealth } = await loadTs('../src/utils/playerVitalGuard.ts');
  const fainted = makeSaveData(0, 2400);
  fainted.角色.身份 = { 名字: '程宗扬' };
  assert.deepEqual(recoverUnmarkedPlayerZeroHealth(fainted, '程宗扬眼前一黑，昏了过去。'), {
    oldValue: 0,
    newValue: 24,
    reason: '正文未明确写玩家死亡，气血归零按昏迷/重伤保底恢复至上限 1%',
  });
  assert.equal(fainted.角色.属性.气血.当前, 24);

  const dead = makeSaveData(0, 2400);
  dead.角色.身份 = { 名字: '程宗扬' };
  assert.equal(recoverUnmarkedPlayerZeroHealth(dead, '程宗扬气绝身亡。'), null);
  assert.equal(dead.角色.属性.气血.当前, 0);
});
