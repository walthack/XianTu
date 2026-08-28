import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const modPromise = loadTs('../src/modules/scenarioMods/presence.ts');

// 取自真实存档 savedata_char_1783353015390_11111：玩家在栖云别院正堂，
// 同建筑 7 人、同城 12 人。同城会把隔着整座城的皇宫与城西荒院算进来。
const PLAYER = '中州·建康城·栖云别院·正堂';
const RELATIONS = {
  谢艺: { 名字: '谢艺', 当前位置: { 描述: '中州·建康城·栖云别院·正堂' } },
  乐明珠: { 名字: '乐明珠', 当前位置: { 描述: '中州·建康城·栖云别院·药房' } },
  凝羽: { 名字: '凝羽', 当前位置: { 描述: '中州·建康城·栖云别院' } },
  卓云君: { 名字: '卓云君', 当前位置: { 描述: '中州·建康城·栖云别院·后院东厢' } },
  小紫: { 名字: '小紫', 当前位置: { 描述: '中州·建康城·皇宫·冷宫旧址·偏殿' } },
  萧遥逸: { 名字: '萧遥逸', 当前位置: { 描述: '中州·建康城·皇宫·神龙殿外·宫门' } },
  白瑶: { 名字: '白瑶', 当前位置: { 描述: '中州·建康城·城西荒院·内庭·月下' } },
  武二郎: { 名字: '武二郎', 当前位置: { 描述: '南荒·鸩羽谷·茅屋' } },
};

test('建筑段取第 3 段，不足时逐级回退', async () => {
  const { buildingSegmentOf } = await modPromise;
  assert.equal(buildingSegmentOf('中州·建康城·栖云别院·正堂'), '栖云别院');
  assert.equal(buildingSegmentOf('中州·建康城'), '建康城');
  assert.equal(buildingSegmentOf('南荒'), '南荒');
  assert.equal(buildingSegmentOf(''), '');
  assert.equal(buildingSegmentOf(undefined), '');
});

test('同建筑算在场，同城不同处不算', async () => {
  const { computePresentNames } = await modPromise;
  const present = computePresentNames({ playerLocation: PLAYER, relations: RELATIONS });
  for (const name of ['谢艺', '乐明珠', '凝羽', '卓云君']) {
    assert.ok(present.has(name), `${name} 同在栖云别院，应判在场`);
  }
  for (const name of ['小紫', '萧遥逸', '白瑶', '武二郎']) {
    assert.ok(!present.has(name), `${name} 不在栖云别院，不应判在场`);
  }
});

test('同院不同房间仍算在场（不做全等匹配）', async () => {
  const { computePresentNames } = await modPromise;
  const present = computePresentNames({ playerLocation: PLAYER, relations: RELATIONS });
  assert.ok(present.has('乐明珠'), '药房与正堂同院');
  assert.ok(present.has('卓云君'), '后院东厢与正堂同院');
});

test('活跃事件强制在场——兜住位置字段滞后', async () => {
  // 实测：小紫位置字段还写着皇宫冷宫，人已经在玩家身边对话。位置由 LLM 维护会落后于剧情，
  // 所以事件相关角色必须无条件判在场，否则会把真正在场的人挡掉。
  const { computePresentNames } = await modPromise;
  const present = computePresentNames({
    playerLocation: PLAYER,
    relations: RELATIONS,
    eventCharacterNames: ['小紫'],
  });
  assert.ok(present.has('小紫'), '事件相关角色应无条件在场');
  assert.ok(!present.has('武二郎'), '未涉事且异地者仍不在场');
});

test('近期正文出场兜底位置滞后（真机实测缺陷的回归）', async () => {
  // 真机抓包：小紫位置字段停在「皇宫·冷宫旧址·偏殿」，人却已在玩家身边连说数轮，
  // 且当轮活跃事件不含她 → 被判离场，反过来告诉模型"不得让小紫登场"。
  const { computePresentNames } = await modPromise;
  const withoutNarrative = computePresentNames({ playerLocation: PLAYER, relations: RELATIONS });
  assert.ok(!withoutNarrative.has('小紫'), '仅靠位置会误判（缺陷现场）');

  const withNarrative = computePresentNames({
    playerLocation: PLAYER,
    relations: RELATIONS,
    recentNarrative: '小紫压低声音道：「程头儿，这局你看出几层？」',
  });
  assert.ok(withNarrative.has('小紫'), '刚在正文出场过即视为在场');
  assert.ok(!withNarrative.has('武二郎'), '未出场者不受影响');
});

test('玩家点名不构成在场（点名≠在场）', async () => {
  // recentNarrative 只喂 assistant 侧正文；玩家输入不进这里。
  // 这条锁住取数口径，防止有人图省事把玩家输入也拼进去，那样"点名即召唤"会复活。
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/modules/scenarioMods/storyContext.ts', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('const recentNarrative'), src.indexOf('const presentNames'));
  assert.match(block, /role.*!==.*'user'/, '必须过滤掉玩家输入');
  assert.match(block, /slice\(-2\)/, '只取最近两条，避免久远出场被当成在场');
});

test('开场声明的角色算在场', async () => {
  const { computePresentNames } = await modPromise;
  const present = computePresentNames({
    playerLocation: PLAYER,
    relations: RELATIONS,
    featuredCharacterNames: ['武二郎'],
  });
  assert.ok(present.has('武二郎'));
});

test('缺位置数据时不误判在场', async () => {
  const { computePresentNames } = await modPromise;
  assert.equal(computePresentNames({ relations: RELATIONS }).size, 0, '玩家无位置则不按位置判定');
  const noLoc = computePresentNames({
    playerLocation: PLAYER,
    relations: { 无名: { 名字: '无名' } },
  });
  assert.ok(!noLoc.has('无名'), 'NPC 无位置不应判在场');
});

test('不在场约束明确禁止本人登场，并指向打听/前往', async () => {
  const { formatAbsenceGuard } = await modPromise;
  const guard = formatAbsenceGuard('蛇夫人');
  assert.match(guard, /当前不在场/);
  assert.match(guard, /不得让其本人登场/);
  assert.match(guard, /听闻|传言|书信/, '须给出替代的提及方式');
  assert.match(guard, /打听|前往/, '须指向可行动的推进路径');
  assert.ok(guard.includes('蛇夫人'));
});

test('storyContext 对不在场角色注入约束，且主角不受影响', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/modules/scenarioMods/storyContext.ts', import.meta.url), 'utf8');
  const call = src.indexOf('formatAbsenceGuard(character.name)');
  assert.ok(call > 0, 'storyContext 应注入不在场约束');
  const guardWindow = src.slice(Math.max(0, call - 300), call);
  assert.match(guardWindow, /presentNames && !isProtagonist && !presentNames\.has\(character\.name\)/,
    '判据须同时排除主角并在 presentNames 缺省时保持既有行为');
});

test('实时关注已收窄到在场者（不再全量推演）', async () => {
  const { focusedNpcNamesFromState } = await modPromise;
  const state = {
    角色: { 位置: { 描述: PLAYER } },
    社交: {
      关系: {
        谢艺: { ...RELATIONS['谢艺'], 实时关注: true },
        小紫: { ...RELATIONS['小紫'], 实时关注: true },
        王哲: { 名字: '王哲', 当前位置: { 描述: PLAYER }, 实时关注: true, 当前外貌状态: '已死亡' },
        段强: { 名字: '段强', 当前位置: { 描述: PLAYER }, 实时关注: true, 当前外貌状态: '状态正常' },
      },
    },
    世界: { 状态: { 剧本模组: { flags: { 'event.s01_02.done': true }, completedEventIds: ['lcq.event.s01_02'] } } },
  };
  const names = focusedNpcNamesFromState(state);
  assert.ok(names.includes('谢艺'), '同建筑且实时关注的活人应入选');
  assert.ok(names.includes('王哲'), '正典档案外貌写已死亡的活人不得被排除');
  assert.equal(names.includes('小紫'), false, '不同建筑即使实时关注也不入选');
  assert.equal(names.includes('段强'), false, '已结算离场者不入实时关注');

  const beforeDeath = focusedNpcNamesFromState({
    ...state,
    社交: {
      关系: {
        段强: { 名字: '段强', 当前位置: { 描述: PLAYER }, 实时关注: true, 当前外貌状态: '已死亡' },
      },
    },
    世界: { 状态: { 剧本模组: { flags: {}, completedEventIds: [] } } },
  });
  assert.ok(beforeDeath.includes('段强'), 's01_02 未完成时，档案外貌已死亡不能提前排除段强');

  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/utils/AIBidirectionalSystem.ts', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('private getFocusedNpcNames'), src.indexOf('private buildFocusedNpcPrompt'));
  assert.match(fn, /return focusedNpcNamesFromState\(stateForAI\)/, '生产实时关注须委托共享名单');
});
