import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const modPromise = loadTs('../src/modules/scenarioMods/runtime.ts');

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

// Codex #2：LLM 不得通过 tavern command 直写引擎专属冷却字段；布尔提议仍放行
test('#2 越权封堵：commandValidator 拒绝 LLM 直写 steeringCooldown、放行布尔提议', async () => {
  const { validateCommand } = await loadTs('../src/utils/commandValidator.ts');
  const blocked = validateCommand({ action: 'set', key: '世界.状态.剧本模组.steeringCooldown', value: 4 }, 0);
  assert.equal(blocked.valid, false, 'LLM 直写 steeringCooldown 必须被拒');
  const allowed = validateCommand({ action: 'set', key: '系统.扩展.任务追踪.主线偏移提议', value: true }, 0);
  assert.equal(allowed.valid, true, 'set 主线偏移提议(布尔信号)应放行');
});
