import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const modPromise = loadTs('../src/modules/scenarioMods/runtime.ts');
const stage11Url = new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_11_lieshan_battle.json', import.meta.url);

// 玩家是否"主动偏移主线"由乙（分步第2步 LLM 写布尔 系统.扩展.任务追踪.主线偏移提议）判定——
// 关键词正则甲已废弃（Codex 五轮复审：正则追不上自然语言的否定/复合/语义）。
// 冷却字段存于 runtime(世界.状态.剧本模组.steeringCooldown)——引擎专属，LLM 命令写不到。
function stalledSave(cooldown) {
  const rt = {
    flags: {},
    currentChapterId: 'c1',
    chapters: [{ id: 'c1', eventIds: ['e1'], completion: [{ path: 'flags.chapdone', operator: 'eq', value: true }] }],
    events: [{ id: 'e1', name: 'E1', completion: [{ path: 'flags.e1done', operator: 'eq', value: true }] }],
    activeEventIds: ['e1'],
    completedEventIds: [],
    completedChapterIds: [],
    stallTurns: 5,
  };
  if (cooldown !== undefined) rt.steeringCooldown = cooldown;
  return { 世界: { 状态: { 剧本模组: rt } } };
}

test('无冷却：停滞轮数正常累加', async () => {
  const { advanceScenarioRuntime } = await modPromise;
  const { saveData } = advanceScenarioRuntime(stalledSave(undefined));
  assert.equal(saveData.世界.状态.剧本模组.stallTurns, 6);
});

test('冷却期：暂停 stall 累加 + 冷却逐轮递减', async () => {
  const { advanceScenarioRuntime } = await modPromise;
  const { saveData } = advanceScenarioRuntime(stalledSave(2));
  assert.equal(saveData.世界.状态.剧本模组.stallTurns, 5, 'stall 应暂停不累加');
  assert.equal(saveData.世界.状态.剧本模组.steeringCooldown, 1, '冷却应递减到 1');
});

test('冷却递减到 0 后恢复累加', async () => {
  const { advanceScenarioRuntime } = await modPromise;
  const { saveData } = advanceScenarioRuntime(stalledSave(1));
  assert.equal(saveData.世界.状态.剧本模组.steeringCooldown, 0, '冷却应递减到 0');
  assert.equal(saveData.世界.状态.剧本模组.stallTurns, 5, '本轮仍在冷却(>0)故暂停');
});

test('星月湖战争在玩家长期缺席时由世界自行结算，不伪记为玩家完成', async () => {
  const { advanceScenarioRuntime, OFFSCREEN_WORLD_EVENT_STALL_THRESHOLD } = await modPromise;
  const eventIds = ['lcq.event.s11_04_xingyue_appears', 'lcq.event.s11_05_wangtao_breaks'];
  const save = stalledSave(undefined);
  const rt = save.世界.状态.剧本模组;
  rt.modId = 'lcq.stage_11_lieshan_battle';
  rt.stallTurns = OFFSCREEN_WORLD_EVENT_STALL_THRESHOLD;
  rt.events = eventIds.map(id => ({ id, name: id, axisId: 'qingyu.241.1', axisBeat: '星月湖与宋军战事推进', critical: true }));
  rt.activeEventIds = [eventIds[0]];
  rt.chapters = [{ id: 'c1', eventIds, completion: [{ path: 'flags.chapdone', operator: 'eq', value: true }] }];

  const { saveData, transitions } = advanceScenarioRuntime(save);
  const resolved = saveData.世界.状态.剧本模组;
  assert.equal(resolved.flags['world.xingyuehu_war.offscreen_resolved'], true);
  assert.deepEqual(resolved.offscreenResolvedEventIds, eventIds);
  assert.deepEqual(resolved.completedEventIds, [], '缺席结算不得伪记为玩家完成事件');
  assert.equal(resolved.activeEventIds.includes(eventIds[0]), false);
  assert.equal(resolved.divergences[0].id, 'offscreen.lcq.xingyuehu_war');
  assert.match(resolved.divergences[0].worldDelta, /江州提前戒严/);
  assert.ok(transitions.some(item => item.type === 'world_event_resolved'));
});

test('星月湖战争未到缺席阈值时绝不自动结算', async () => {
  const { advanceScenarioRuntime, OFFSCREEN_WORLD_EVENT_STALL_THRESHOLD } = await modPromise;
  const save = stalledSave(undefined);
  const rt = save.世界.状态.剧本模组;
  rt.modId = 'lcq.stage_11_lieshan_battle';
  rt.stallTurns = OFFSCREEN_WORLD_EVENT_STALL_THRESHOLD - 1;
  rt.events = [{ id: 'lcq.event.s11_04_xingyue_appears', name: '星月湖现身', axisId: 'qingyu.241.1', axisBeat: '星月湖与宋军战事推进', critical: true }];
  rt.activeEventIds = ['lcq.event.s11_04_xingyue_appears'];
  rt.chapters = [{ id: 'c1', eventIds: rt.activeEventIds, completion: [{ path: 'flags.chapdone', operator: 'eq', value: true }] }];

  const { saveData } = advanceScenarioRuntime(save);
  assert.equal(saveData.世界.状态.剧本模组.flags['world.xingyuehu_war.offscreen_resolved'], undefined);
});

test('任意剧本可用事件级 offscreenResolution 数据合同结算世界事件', async () => {
  const { advanceScenarioRuntime } = await modPromise;
  const save = stalledSave(undefined);
  const rt = save.世界.状态.剧本模组;
  rt.modId = 'demo.world_stage';
  rt.stallTurns = 3;
  rt.events = [{
    id: 'demo.event.war', name: '边城战事', axisId: 'demo.axis.1', axisBeat: '边城战事爆发', critical: true,
    offscreenResolution: {
      id: 'offscreen.demo.war', afterStallTurns: 3, flagKey: 'world.demo_war.resolved',
      resolvedEventIds: ['demo.event.war'], worldDelta: '玩家缺席时边城已经失守', evidence: '测试合同',
    },
  }];
  rt.activeEventIds = ['demo.event.war'];
  rt.chapters = [{ id: 'c1', eventIds: rt.activeEventIds, completion: [{ path: 'flags.chapdone', operator: 'eq', value: true }] }];
  const { saveData, transitions } = advanceScenarioRuntime(save);
  const resolved = saveData.世界.状态.剧本模组;
  assert.equal(resolved.flags['world.demo_war.resolved'], true);
  assert.deepEqual(resolved.offscreenResolvedEventIds, ['demo.event.war']);
  assert.equal(resolved.completedEventIds.length, 0);
  assert.match(resolved.divergences[0].worldDelta, /边城已经失守/);
  assert.equal(resolved.chronicle[0].type, 'world');
  assert.ok(transitions.some(item => item.id === 'offscreen.demo.war'));
});

test('场外合同只能从当前已激活节点启动，不能同阈值烧掉未来事件', async () => {
  const { advanceScenarioRuntime, OFFSCREEN_WORLD_EVENT_STALL_THRESHOLD } = await modPromise;
  const save = stalledSave(undefined);
  const rt = save.世界.状态.剧本模组;
  rt.stallTurns = OFFSCREEN_WORLD_EVENT_STALL_THRESHOLD;
  rt.events.push({
    id: 'future.event', name: '未来朝局', critical: true,
    offscreenResolution: {
      id: 'offscreen.future.event',
      afterStallTurns: 2,
      flagKey: 'world.future.offscreen',
      resolvedEventIds: ['future.event'],
      worldDelta: '未来朝局自行结算。',
      evidence: '测试合同',
    },
  });
  const { saveData, transitions } = advanceScenarioRuntime(save);
  const after = saveData.世界.状态.剧本模组;
  assert.equal(after.flags['world.future.offscreen'], undefined);
  assert.equal(after.offscreenResolvedEventIds?.includes('future.event') || false, false);
  assert.equal(transitions.some(item => item.id === 'offscreen.future.event'), false);
});

test('真实 stage_11 缺席结算后可进入下一关，不遗留旧战场锚点', async () => {
  const { advanceScenarioRuntime, OFFSCREEN_WORLD_EVENT_STALL_THRESHOLD } = await modPromise;
  const stage = JSON.parse(await readFile(stage11Url, 'utf8'));
  const { scenario, manifest } = stage;
  const { saveData } = advanceScenarioRuntime({
    世界: {
      状态: {
        剧本模组: {
          modId: manifest.id,
          flags: structuredClone(scenario.initialFlags),
          chapters: structuredClone(scenario.chapters),
          events: structuredClone(scenario.events),
          currentChapterId: scenario.chapters[0].id,
          activeEventIds: [scenario.events[0].id],
          completedEventIds: [],
          completedChapterIds: [],
          nextStageId: manifest.nextStageId,
          nextStageReadyId: null,
          stallTurns: OFFSCREEN_WORLD_EVENT_STALL_THRESHOLD,
        },
      },
    },
  });
  const rt = saveData.世界.状态.剧本模组;
  assert.equal(rt.nextStageReadyId, manifest.nextStageId);
  assert.equal(rt.currentChapterId, null);
  assert.equal(rt.activeEventIds.length, 0);
  assert.ok(rt.offscreenResolvedEventIds.includes('lcq.event.s11_10_sanchuankou_defeat'));
});

// Codex #2：LLM 不得通过 tavern command 直写引擎专属冷却字段；布尔提议仍放行
test('#2 越权封堵：commandValidator 拒绝 LLM 直写 steeringCooldown、放行布尔提议', async () => {
  const { validateCommand } = await loadTs('../src/utils/commandValidator.ts');
  const blocked = validateCommand({ action: 'set', key: '世界.状态.剧本模组.steeringCooldown', value: 4 }, 0);
  assert.equal(blocked.valid, false, 'LLM 直写 steeringCooldown 必须被拒');
  const allowed = validateCommand({ action: 'set', key: '系统.扩展.任务追踪.主线偏移提议', value: true }, 0);
  assert.equal(allowed.valid, true, 'set 主线偏移提议(布尔信号)应放行');
});

test('分歧账本由引擎独占，commandValidator 拒绝 LLM 伪造世界线历史', async () => {
  const { validateCommand } = await loadTs('../src/utils/commandValidator.ts');
  const blocked = validateCommand({
    action: 'push',
    key: '世界.状态.剧本模组.divergences',
    value: { worldDelta: '凭空改史' },
  }, 0);
  assert.equal(blocked.valid, false);
  assert.match(blocked.errors.join('\n'), /禁止AI操作/);
});

test('世界时钟与事件时间线由引擎独占，LLM 不能伪造发生或获知时间', async () => {
  const { validateCommand } = await loadTs('../src/utils/commandValidator.ts');
  for (const key of [
    '世界.状态.剧本模组.worldTurn',
    '世界.状态.剧本模组.worldPush.due',
    '世界.状态.剧本模组.actorEngine.entitlements',
    '世界.状态.剧本模组.eventTimeline.lyg.event.s01_08.playerLearnedAtTurn',
    '世界.状态.剧本模组.playerKnowledge.knowledge.player.event.lyg.event.s01_08',
    '世界.状态.剧本模组.offscreenResolvedEventIds',
    '世界.状态.剧本模组.chronicle',
  ]) {
    const blocked = validateCommand({ action: 'set', key, value: true }, 0);
    assert.equal(blocked.valid, false, `${key} must be engine-only`);
  }
});

test('存档修复通道仅允许 set，避免未来执行器扩展时放大写入面', async () => {
  const { validateRepairCommand } = await loadTs('../src/utils/commandValidator.ts');
  const allowed = validateRepairCommand({ action: 'set', key: '角色.属性.气血.当前', value: 80 }, 0);
  const rejected = validateRepairCommand({ action: 'delete', key: '角色.属性.气血.当前' }, 1);

  assert.equal(allowed.valid, true);
  assert.equal(rejected.valid, false);
  assert.match(rejected.errors.join('；'), /存档修复仅允许 set/);
});

test('行动判定状态只能由本地引擎写入', async () => {
  const { validateCommand } = await loadTs('../src/utils/commandValidator.ts');
  const blocked = validateCommand({ action: 'set', key: '系统.扩展.判定.pending', value: { outcome: 'success' } }, 0);
  assert.equal(blocked.valid, false, 'LLM 不得伪造判定结果');
  assert.match(blocked.errors.join('\n'), /禁止AI操作/);
});
