import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const modPromise = loadTs('../src/modules/scenarioMods/relationships.ts');

const char = (over = {}) => ({ id: 'liuchao.character.test', name: '测试', ...over });

test('C01：幼帝称谓不产生未成年年龄', async () => {
  const { estimateNpcAge } = await modPromise;
  const age = estimateNpcAge(char({ id: 'liuchao.character.liu_xin', role: '幼帝', realm: '元婴' }));
  assert.ok(age >= 18 && age < 100, `全员应满18且低于估龄寿元上限，实得 ${age}`);
});

test('C01：幼子称谓也遵守成年下限', async () => {
  const { estimateNpcAge } = await modPromise;
  const age = estimateNpcAge(char({ id: 'liuchao.character.guo_jing', role: '幼子' }));
  assert.ok(age >= 18 && age < 100, `全员应满18且低于估龄寿元上限，实得 ${age}`);
});

test('"幼妹"是辈分不是孩童，不误伤成年角色', async () => {
  const { estimateNpcAge } = await modPromise;
  const age = estimateNpcAge(char({ id: 'liuchao.character.yun_ru_yao', role: '正妻', profile: { origin: '云世商会家主幼妹' } }));
  assert.ok(age >= 18, `成年角色不应落孩童段，实得 ${age}`);
});

test('六朝寿命压缩：高境界不再是几百岁老妖怪', async () => {
  const { estimateNpcAge } = await modPromise;
  for (const realm of ['金丹', '元婴', '化神', '炼虚', '合体', '渡劫']) {
    for (const id of ['a', 'bb', 'ccc', 'dddd', 'eeeee']) {
      const age = estimateNpcAge(char({ id, realm }));
      assert.ok(age < 100, `${realm} 估龄应低于寿元上限 100，实得 ${age}`);
      assert.ok(age >= 18, `${realm} 估龄下限异常，实得 ${age}`);
    }
  }
});

test('C01：少女称谓不覆盖成年估龄规则', async () => {
  const { estimateNpcAge } = await modPromise;
  const age = estimateNpcAge(char({ id: 'x1', role: '少女', realm: '金丹' }));
  assert.ok(age >= 18 && age < 100, `少女应满18且低于估龄寿元上限，实得 ${age}`);
});
