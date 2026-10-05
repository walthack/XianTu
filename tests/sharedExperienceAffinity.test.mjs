import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const runtimePromise = loadTs('../src/modules/scenarioMods/runtime.ts');

/**
 * 共历事件好感结算：好感变化此前几乎全靠模型裁量——门禁只管"不超 ±15"，
 * 不管"该不该加"。于是陪人闯生死关可能 +5、寒暄可能 +12，玩家感受不到因果。
 */
function baseSave({ completed = [], offscreen = [], granted, events = [], relations } = {}) {
  return {
    角色: { 身份: { 名字: '程宗扬' }, 位置: { 描述: '中州·建康城·栖云别院·正堂' } },
    元数据: { 时间: { 年: 220, 月: 1, 日: 8 } },
    社交: {
      关系: relations || {
        小紫: { 名字: '小紫', 好感度: 40, 与玩家关系: '主仆' },
        吕雉: { 名字: '吕雉', 好感度: 38, 与玩家关系: '政治盟友' },
      },
    },
    世界: {
      状态: {
        剧本模组: {
          modId: 'test.stage',
          mode: 'strict',
          currentChapterId: null,
          flags: {},
          chapters: [],
          events,
          activeEventIds: [],
          completedEventIds: completed,
          completedChapterIds: [],
          offscreenResolvedEventIds: offscreen,
          ...(granted ? { affinityGrantedEventIds: granted } : {}),
          canon: {
            characters: [
              { id: 'c.xiaozi', name: '小紫' },
              { id: 'c.lvzhi', name: '吕雉' },
            ],
          },
        },
      },
    },
  };
}

const favOf = (save, name) => save.社交.关系[name].好感度;

test('旧档首次结算只登记不补发（避免重复计算历史）', async () => {
  // 真机实测：某旧档已完成 7 个事件，首次结算让小紫 40→64，一次跳两档。
  // 存档里的好感本身就包含了那些事件的影响，补发是重复计算。
  const { advanceScenarioRuntime } = await runtimePromise;
  const save = baseSave({
    completed: ['e1', 'e2'],
    events: [
      { id: 'e1', name: '旧事一', critical: true, relatedCharacterIds: ['c.xiaozi'] },
      { id: 'e2', name: '旧事二', critical: true, relatedCharacterIds: ['c.xiaozi'] },
    ],
  });
  const out = advanceScenarioRuntime(save).saveData;
  assert.equal(favOf(out, '小紫'), 40, '历史事件不得补发好感');
  assert.deepEqual(
    [...out.世界.状态.剧本模组.affinityGrantedEventIds].sort(),
    ['e1', 'e2'],
    '但须登记为已结算，避免下一轮再补',
  );
});

test('新档建档即初始化空数组——第一个事件不被当成存量吞掉', async () => {
  // "字段不存在＝旧档"这个语义只有在建档时写入空数组才成立。
  // 否则新档第一轮也会走"首次登记不补发"分支，把真实完成的第一个事件白白吞掉。
  const fs = await import('node:fs');
  for (const file of ['strictInitializer.ts', 'expandInitializer.ts']) {
    const src = fs.readFileSync(new URL(`../src/modules/scenarioMods/${file}`, import.meta.url), 'utf8');
    assert.match(src, /affinityGrantedEventIds: \[\]/, `${file} 建档时须初始化为空数组`);
  }
});

test('登记之后新完成的事件正常给分', async () => {
  const { advanceScenarioRuntime } = await runtimePromise;
  const save = baseSave({
    completed: ['e1'],
    granted: [],  // 已完成首次登记
    events: [{ id: 'e1', name: '共闯神龙殿', critical: true, relatedCharacterIds: ['c.xiaozi'] }],
  });
  const { saveData } = advanceScenarioRuntime(save);
  assert.equal(favOf(saveData, '小紫'), 48, 'critical 事件应给 +8');
  assert.equal(favOf(saveData, '吕雉'), 38, '不相关角色不变');
});

test('普通事件给较小增量', async () => {
  const { advanceScenarioRuntime } = await runtimePromise;
  const save = baseSave({
    completed: ['e1'],
    granted: [],
    events: [{ id: 'e1', name: '闲谈', critical: false, relatedCharacterIds: ['c.xiaozi'] }],
  });
  assert.equal(favOf(advanceScenarioRuntime(save).saveData, '小紫'), 43);
});

test('场外结算的事件不给分——没参与凭什么拉近关系', async () => {
  const { advanceScenarioRuntime } = await runtimePromise;
  const save = baseSave({
    completed: ['e1'],
    granted: [],
    offscreen: ['e1'],
    events: [{ id: 'e1', name: '她独自赴的局', critical: true, relatedCharacterIds: ['c.xiaozi'] }],
  });
  assert.equal(favOf(advanceScenarioRuntime(save).saveData, '小紫'), 40, '场外事件不应加好感');
});

test('每个事件只结算一次（completedEventIds 是累积的）', async () => {
  const { advanceScenarioRuntime } = await runtimePromise;
  const save = baseSave({
    completed: ['e1'],
    granted: [],
    events: [{ id: 'e1', name: '共闯神龙殿', critical: true, relatedCharacterIds: ['c.xiaozi'] }],
  });
  const once = advanceScenarioRuntime(save).saveData;
  assert.equal(favOf(once, '小紫'), 48);
  // 同一存档再推进一回合：不得重复给分
  const twice = advanceScenarioRuntime(once).saveData;
  assert.equal(favOf(twice, '小紫'), 48, '重复结算即通货膨胀');
  const granted = twice.世界.状态.剧本模组.affinityGrantedEventIds;
  assert.deepEqual(granted, ['e1'], '已结算事件须留痕');
});

test('结算仍受 cap 约束：立场先于情感者不会被共历事件突破', async () => {
  const { advanceScenarioRuntime } = await runtimePromise;
  // 吕雉 cap = 39（相识上限）。当前 38，critical 给 +8 应止步于 39。
  const save = baseSave({
    completed: ['e1'],
    granted: [],
    events: [{ id: 'e1', name: '同谋', critical: true, relatedCharacterIds: ['c.lvzhi'] }],
  });
  assert.equal(favOf(advanceScenarioRuntime(save).saveData, '吕雉'), 39, '应被 cap 截住');
});

test('已达上限者直接跳过，不写入', async () => {
  const { advanceScenarioRuntime } = await runtimePromise;
  const save = baseSave({
    completed: ['e1'],
    granted: [],
    events: [{ id: 'e1', name: '同谋', critical: true, relatedCharacterIds: ['c.lvzhi'] }],
    relations: { 吕雉: { 名字: '吕雉', 好感度: 39, 与玩家关系: '政治盟友' } },
  });
  assert.equal(favOf(advanceScenarioRuntime(save).saveData, '吕雉'), 39);
});

test('关系表里没有的角色不会被凭空创建', async () => {
  const { advanceScenarioRuntime } = await runtimePromise;
  const save = baseSave({
    completed: ['e1'],
    granted: [],
    events: [{ id: 'e1', name: '某事', critical: true, relatedCharacterIds: ['c.unknown'] }],
  });
  const out = advanceScenarioRuntime(save).saveData;
  assert.equal(Object.keys(out.社交.关系).length, 2, '不得新增关系条目');
});

// —— 可见性：引擎侧的变化必须能到玩家眼前，否则因果只存在于代码里 ——

test('结算返回变动明细，含事件出处', async () => {
  const { advanceScenarioRuntime } = await runtimePromise;
  const save = baseSave({
    completed: ['e1'],
    granted: [],
    events: [{ id: 'e1', name: '共闯神龙殿', critical: true, relatedCharacterIds: ['c.xiaozi'] }],
  });
  const { affinityGrants } = advanceScenarioRuntime(save);
  assert.equal(affinityGrants.length, 1);
  assert.deepEqual(affinityGrants[0], {
    name: '小紫', characterId: 'c.xiaozi', from: 40, to: 48, eventId: 'e1', eventName: '共闯神龙殿',
  });
});

test('无变动时明细为空，不产生噪声', async () => {
  const { advanceScenarioRuntime } = await runtimePromise;
  const save = baseSave({ completed: [], granted: [], events: [] });
  assert.deepEqual(advanceScenarioRuntime(save).affinityGrants, []);
});

test('明细进入玩家可见的状态变化流', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/utils/AIBidirectionalSystem.ts', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('affinityGrants || []'), src.indexOf('里程碑奖励'));
  assert.match(block, /changes\.push/, '须推进 changes（stateChanges）');
  assert.match(block, /npcRecordPath\(grant\.characterId, '好感度'\)/, 'key 须用标准路径以复用既有格式化');
  assert.match(block, /oldValue: grant\.from/, '须带前后值，否则显示不出增减');
});

test('好感结算发生在姿态推进之前（姿态须反映结算后的值）', async () => {
  const { advanceScenarioRuntime } = await runtimePromise;
  // 小紫 38 → +8 = 46，越过 high 门槛 40+3=43，滞回首轮进 pending
  const save = baseSave({
    completed: ['e1'],
    granted: [],
    events: [{ id: 'e1', name: '共闯', critical: true, relatedCharacterIds: ['c.xiaozi'] }],
    relations: { 小紫: { 名字: '小紫', 好感度: 38, 与玩家关系: '主仆' } },
  });
  const out = advanceScenarioRuntime(save).saveData;
  assert.equal(favOf(out, '小紫'), 46);
  const stance = out.世界.状态.剧本模组.stanceStates?.['c.xiaozi'];
  assert.ok(stance, '姿态状态应已写入');
  // 首轮无历史状态时滞回退化为瞬时投影（另有测试覆盖），所以直接看姿态值：
  // 结算前 38 属 mid、结算后 46 属 high——得到 high 即证明结算跑在姿态推进之前。
  assert.equal(stance.stance, 'high', '姿态须据结算后的 46 计算，而非结算前的 38');
});
