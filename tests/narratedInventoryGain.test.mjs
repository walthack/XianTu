import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

test('detects narrated item gain when commands omit inventory mutation', async () => {
  const { getMissingNarratedInventoryGains } = await loadTs('../src/utils/narratedInventory.ts');

  const text = '云苍峰长老递来一枚温润玉简，你把玉简收下，收入袖中。';
  const commands = [{ action: 'add', key: '元数据.时间.分钟', value: 10 }];

  assert.deepEqual(getMissingNarratedInventoryGains(text, commands), ['玉简']);
});

test('does not flag narrated item gain when inventory mutation exists', async () => {
  const { getMissingNarratedInventoryGains } = await loadTs('../src/utils/narratedInventory.ts');

  const text = '你接过那枚云苍峰玉简，郑重收好。';
  const commands = [
    {
      action: 'set',
      key: '角色.背包.物品.item_yuncangfeng_yujian',
      value: {
        物品ID: 'item_yuncangfeng_yujian',
        名称: '云苍峰玉简',
        类型: '杂物',
        品质: { quality: '凡', grade: 0 },
        数量: 1,
        描述: '云苍峰长老所赠，记有入门要点。',
      },
    },
  ];

  assert.deepEqual(getMissingNarratedInventoryGains(text, commands), []);
});

test('detects carried items confirmed in possession narration', async () => {
  const { detectNarratedInventoryPossessions } = await loadTs('../src/utils/narratedInventory.ts');

  const text = '程宗扬再次伸手探入怀中——确认那枚温润的【仙品·龙睛玉】与清凉的【云氏玉简】都安然无恙。';

  assert.deepEqual(detectNarratedInventoryPossessions(text), ['仙品·龙睛玉', '云氏玉简']);
});
