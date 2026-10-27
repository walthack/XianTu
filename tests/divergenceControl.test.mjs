import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

function save(overrides = {}) {
  return {
    世界: { 状态: { 剧本模组: {
      modId: 'demo.stage',
      currentChapterId: 'c1',
      chapters: [{ id: 'c1', title: '旧都风云', eventIds: ['e1'] }],
      events: [{ id: 'e1', name: '赴旧都', objective: '赶赴旧都面见故人', critical: true }],
      completedChapterIds: [], activeEventIds: ['e1'], completedEventIds: [],
      flags: {}, stallTurns: 8,
      canon: {
        characters: [{ name: '小紫', aliases: ['紫姑娘'] }],
        factions: [{ name: '黑魔海' }],
        locations: [{ name: '旧都' }],
      },
      ...overrides,
    } } },
    系统: { 历史: { 叙事: [
      { content: '镇魂碑前，九幽噬魂阵与巫神祭典即将开启。' },
      { content: '圣王宫召集神罚军，准备争夺天命神格。' },
    ] }, 扩展: { 任务追踪: { 即兴目标: [{ 标题: '参加巫神祭典' }] } } },
  };
}

test('deterministic divergence signal combines stall, canon hits and unfamiliar proper nouns', async () => {
  const { computeDivergenceSignal } = await loadTs('../src/modules/scenarioMods/divergenceControl.ts');
  const signal = computeDivergenceSignal(save());
  assert.equal(signal.level, 'high');
  assert.ok(signal.score >= 65);
  assert.ok(signal.unfamiliarProperNounDensity > 0);
});

test('active return archives the branch and lands on the nearest load-bearing anchor', async () => {
  const { returnToCanonAnchor } = await loadTs('../src/modules/scenarioMods/divergenceControl.ts');
  const data = save({ worldTurn: 9, divergenceSignal: { level: 'high', score: 80 } });
  const result = returnToCanonAnchor(data);
  assert.equal(result.ok, true);
  assert.equal(result.anchor, '赶赴旧都面见故人');
  assert.deepEqual(data.系统.扩展.任务追踪.即兴目标, []);
  const runtime = data.世界.状态.剧本模组;
  assert.equal(runtime.returnBridge.anchorEventId, 'e1');
  assert.equal(runtime.worldPush.reason, 'return_bridge');
  assert.match(runtime.divergences[0].worldDelta, /参加巫神祭典/);
  assert.match(runtime.divergences[0].worldDelta, /赶赴旧都面见故人/);
});

test('failed judgement gives the world an immediate weighted turn', async () => {
  const { updateDivergenceControl } = await loadTs('../src/modules/scenarioMods/divergenceControl.ts');
  const data = save({ stallTurns: 0 });
  data.系统.扩展.判定 = { recent: [{ id: 'j1', status: 'resolved', outcome: 'failure' }] };
  updateDivergenceControl(data, false);
  const runtime = data.世界.状态.剧本模组;
  assert.equal(runtime.worldPush.reason, 'failed_action');
  assert.equal(runtime.worldPush.intensity, 2);
  updateDivergenceControl(data, false);
  assert.equal(runtime.lastWorldPushJudgementId, 'j1');
  assert.equal(runtime.worldPush, undefined, 'a consumed world push must not repeat forever');
});

test('停滞但正文没有陌生专名（照建议行动、修炼）不算世界线偏离', async () => {
  const { computeDivergenceSignal } = await loadTs('../src/modules/scenarioMods/divergenceControl.ts');
  const data = save({ stallTurns: 9 });
  data.系统.历史.叙事 = [
    { content: '你盘膝坐下，照建议运转真气，丹田里的暖意一点点沉下去。' },
    { content: '你又练了一轮功，气息比昨日顺畅了些，小紫在旁边打了个哈欠。' },
  ];
  const signal = computeDivergenceSignal(data);
  assert.equal(signal.stallTurns, 9);
  assert.equal(signal.unfamiliarProperNounDensity, 0);
  assert.equal(signal.level, 'low');
  assert.equal(signal.score, 0);
});
