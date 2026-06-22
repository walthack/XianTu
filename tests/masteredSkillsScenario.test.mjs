import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

test('technique skill refresh preserves standalone scenario abilities', async () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
    clear: () => storage.clear(),
  };
  const { updateMasteredSkills } = await loadTs('../src/utils/masteredSkillsCalculator.ts');
  const saveData = {
    角色: {
      技能: {
        掌握技能: [{ 技能名称: '生死根', 技能描述: '唯一异能', 来源: '剧本正典', 熟练度: 0, 使用次数: 0 }],
        装备栏: [],
        冷却: {},
      },
      背包: {
        物品: {
          nineYang: {
            类型: '功法',
            名称: '九阳神功',
            修炼进度: 0,
            功法技能: [{ 技能名称: '真阳引导', 技能描述: '引导真阳', 熟练度要求: 0 }],
          },
        },
      },
    },
    系统: { 缓存: {} },
  };

  const skills = updateMasteredSkills(saveData);

  assert.deepEqual(skills.map(skill => skill.技能名称), ['真阳引导', '生死根']);
  assert.deepEqual(saveData.角色.技能.掌握技能.map(skill => skill.技能名称), ['真阳引导', '生死根']);
});
