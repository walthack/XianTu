import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const modPromise = loadTs('../src/modules/scenarioMods/relationships.ts');

const char = (over = {}) => ({ id: 'liuchao.character.test', name: '测试', ...over });

test('幼帝不因高境界变老：孩童关键词走绝对年龄段', async () => {
  const { estimateNpcAge } = await modPromise;
  const age = estimateNpcAge(char({ id: 'liuchao.character.liu_xin', role: '幼帝', realm: '元婴' }));
  assert.ok(age >= 4 && age <= 12, `幼帝应 4-12 岁，实得 ${age}`);
});

test('幼子(郭靖)无境界也落孩童段', async () => {
  const { estimateNpcAge } = await modPromise;
  const age = estimateNpcAge(char({ id: 'liuchao.character.guo_jing', role: '幼子' }));
  assert.ok(age >= 4 && age <= 12, `幼子应 4-12 岁，实得 ${age}`);
});

test('"幼妹"是辈分不是孩童，不误伤成年角色', async () => {
  const { estimateNpcAge } = await modPromise;
  const age = estimateNpcAge(char({ id: 'liuchao.character.yun_ru_yao', role: '正妻', profile: { origin: '云世商会家主幼妹' } }));
  assert.ok(age >= 16, `成年角色不应落孩童段，实得 ${age}`);
});

test('六朝寿命压缩：高境界不再是几百岁老妖怪', async () => {
  const { estimateNpcAge } = await modPromise;
  for (const realm of ['金丹', '元婴', '化神', '炼虚', '合体', '渡劫']) {
    for (const id of ['a', 'bb', 'ccc', 'dddd', 'eeeee']) {
      const age = estimateNpcAge(char({ id, realm }));
      assert.ok(age < 100, `${realm} 估龄应低于寿元上限 100，实得 ${age}`);
      assert.ok(age >= 16, `${realm} 估龄下限异常，实得 ${age}`);
    }
  }
});

test('少年少女落 13-18 段', async () => {
  const { estimateNpcAge } = await modPromise;
  const age = estimateNpcAge(char({ id: 'x1', role: '少女', realm: '金丹' }));
  assert.ok(age >= 13 && age <= 18, `少女应 13-18 岁，实得 ${age}`);
});
