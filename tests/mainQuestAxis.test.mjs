import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const axisPromise = loadTs('../src/modules/scenarioMods/mainQuestAxis.ts');

test('resolveMainQuestLayer(undefined) 与未知关卡回落到层一', async () => {
  const { resolveMainQuestLayer } = await axisPromise;
  assert.equal(resolveMainQuestLayer(undefined)?.layer, 1);
  assert.equal(resolveMainQuestLayer('unknown.stage')?.layer, 1);
  assert.equal(resolveMainQuestLayer('')?.layer, 1);
});

test('resolveMainQuestLayer 按关卡升到对应层', async () => {
  const { resolveMainQuestLayer } = await axisPromise;
  assert.equal(resolveMainQuestLayer('lcq.stage_01')?.layer, 1);
  assert.equal(resolveMainQuestLayer('lcq.stage_02')?.layer, 2);
  assert.equal(resolveMainQuestLayer('lcq.stage_05')?.layer, 3);
  assert.equal(resolveMainQuestLayer('lyl.taiquan_sacred_fruit')?.layer, 4);
  assert.equal(resolveMainQuestLayer('lyl.taiquan_afterfall')?.layer, 5);
});

// 保密红线：层六靠三碎片解锁，resolveMainQuestLayer 一律不返回。
// 只断言解析结果，不扫描模块源码（源码含层六定义与禁令说明，扫全文会自伤或恒真）。
test('层六绝不由 resolveMainQuestLayer 返回（全 37 关）', async () => {
  const { MAIN_QUEST_LAYERS, STAGE_ORDER, resolveMainQuestLayer } = await axisPromise;
  assert.equal(STAGE_ORDER.length, 37);
  const layerSix = MAIN_QUEST_LAYERS.find(item => item.layer === 6);
  assert.ok(layerSix, '层六定义必须存在，否则“不返回”断言会恒真');
  assert.equal(layerSix.restricted, true);

  for (const stageId of STAGE_ORDER) {
    const resolved = resolveMainQuestLayer(stageId);
    assert.ok(resolved, `关卡 ${stageId} 应解析出层级`);
    assert.notEqual(resolved.layer, 6, `关卡 ${stageId} 不得返回层六`);
    assert.ok(!resolved.restricted, `关卡 ${stageId} 不得返回 restricted 层`);
    assert.notEqual(resolved.text, layerSix.text, `关卡 ${stageId} 不得带出层六文案`);
  }
});

test('MAIN_QUEST_NODES 完整性：20 条且关卡集合 ⊆ 主轴关', async () => {
  const { MAIN_QUEST_NODES, MAIN_QUEST_STAGES, STAGE_ORDER } = await axisPromise;
  assert.equal(MAIN_QUEST_NODES.length, 20);
  const stageOrder = new Set(STAGE_ORDER);
  const mainStages = new Set(MAIN_QUEST_STAGES.map(item => item.stageId));
  for (const node of MAIN_QUEST_NODES) {
    assert.ok(stageOrder.has(node.stageId), `节点 stageId ${node.stageId} 不在 STAGE_ORDER`);
  }
  const nodeStages = new Set(MAIN_QUEST_NODES.map(node => node.stageId));
  for (const stageId of nodeStages) {
    assert.ok(mainStages.has(stageId), `节点关卡 ${stageId} 不在 MAIN_QUEST_STAGES`);
  }
});

test('resolveMainQuestNodes 对二级线关卡返回空数组', async () => {
  const { resolveMainQuestNodes } = await axisPromise;
  assert.deepEqual(resolveMainQuestNodes('lcq.stage_04'), []);
  assert.deepEqual(resolveMainQuestNodes('lcq.stage_07_qingyuan_jiankang'), []);
  assert.deepEqual(resolveMainQuestNodes(undefined), []);
});

test('MAIN_QUEST_REQUIREMENTS 恰有两条完成要求', async () => {
  const { MAIN_QUEST_REQUIREMENTS } = await axisPromise;
  assert.equal(MAIN_QUEST_REQUIREMENTS.length, 2);
  assert.deepEqual(
    MAIN_QUEST_REQUIREMENTS.map(item => item.id),
    ['taiquan_rite', 'bloodline_survivor'],
  );
});
