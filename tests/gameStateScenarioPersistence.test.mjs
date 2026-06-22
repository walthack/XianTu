import assert from 'node:assert/strict';
import test from 'node:test';

import { createPinia, setActivePinia } from 'pinia';

import { loadTs } from './loadTs.mjs';

test('game state load and save preserves scenario runtime metadata', async () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
    clear: () => storage.clear(),
  };
  setActivePinia(createPinia());
  const { useGameStateStore } = await loadTs('../src/stores/gameStateStore.ts');
  const store = useGameStateStore();
  const scenarioRuntime = {
    modId: 'liuchao.qingyu.grassland',
    modVersion: '1.1.0',
    mode: 'strict',
    currentChapterId: 'chapter.arrival',
    flags: { arrived: true },
  };
  const saveData = {
    元数据: {
      版本号: 3,
      存档ID: 'scenario-test',
      存档名: 'Scenario Test',
      创建时间: '2026-06-22T00:00:00.000Z',
      更新时间: '2026-06-22T00:00:00.000Z',
      游戏时长秒: 0,
      时间: { 年: 16, 月: 1, 日: 1, 小时: 0, 分钟: 0 },
    },
    角色: {
      身份: { 名字: '测试角色', 性别: '男', 种族: '人族' },
      属性: {},
      位置: { 描述: '六朝诸国·月牙平原山丘', x: 5000, y: 5000 },
      效果: [],
      背包: { 灵石: { 下品: 0, 中品: 0, 上品: 0, 极品: 0 }, 物品: {} },
      装备: {},
      功法: {},
      修炼: {},
      大道: { 大道列表: {} },
      技能: { 掌握技能: [], 装备栏: [], 冷却: {} },
    },
    社交: { 关系: {}, 宗门: null, 事件: {}, 记忆: {} },
    世界: { 信息: { 世界名称: '六朝并置世界' }, 状态: { 剧本模组: scenarioRuntime } },
    系统: {
      配置: {},
      设置: {},
      缓存: {},
      历史: { 叙事: [] },
      扩展: { 剧本模组: { modId: scenarioRuntime.modId, modVersion: scenarioRuntime.modVersion, mode: 'strict' } },
      联机: { 模式: '单机', 只读路径: [] },
    },
  };

  store.loadFromSaveData(saveData);
  const exported = store.toSaveData();

  assert.deepEqual(exported.世界.状态.剧本模组, scenarioRuntime);
  assert.deepEqual(exported.系统.扩展.剧本模组, {
    modId: 'liuchao.qingyu.grassland',
    modVersion: '1.1.0',
    mode: 'strict',
  });
});
