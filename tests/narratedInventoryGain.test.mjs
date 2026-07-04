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

test('prefers bracketed item names during inventory check narration', async () => {
  const { detectNarratedInventoryPossessions } = await loadTs('../src/utils/narratedInventory.ts');

  const text = '程宗扬将怀中的物品一一取出清点，将行囊里的物件摊开在掌心——【仙品·龙睛玉】温润的青芒中紫光流转，【云氏玉简】边缘云纹清晰。';

  assert.deepEqual(detectNarratedInventoryPossessions(text), ['仙品·龙睛玉', '云氏玉简']);
});

test('normalizes action phrases before inventory identity comparison', async () => {
  const {
    getInventoryItemIdentityKey,
    normalizeNarratedItemName,
  } = await loadTs('../src/utils/narratedInventory.ts');

  assert.equal(normalizeNarratedItemName('【取出云氏玉简】'), '云氏玉简');
  assert.equal(getInventoryItemIdentityKey('取出云氏玉简'), getInventoryItemIdentityKey('云氏玉简'));
  assert.equal(getInventoryItemIdentityKey('颗冰凉的龙睛玉'), getInventoryItemIdentityKey('龙睛玉'));
  assert.equal(getInventoryItemIdentityKey('的龙睛玉'), getInventoryItemIdentityKey('龙睛玉'));
  assert.notEqual(getInventoryItemIdentityKey('仙品·龙睛玉'), getInventoryItemIdentityKey('龙睛玉'));
});

test('rejects sentence fragments during carried item reconciliation', async () => {
  const { detectNarratedInventoryPossessions } = await loadTs('../src/utils/narratedInventory.ts');

  const text = '程宗扬将龙睛玉收入怀中，玉身散发的气息极其复杂——既有与碧奴玉相近的灵韵，也有掌心那颗冰凉的龙睛玉传来的微光。';

  assert.deepEqual(detectNarratedInventoryPossessions(text), ['龙睛玉']);
});
