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

test('MAIN_QUEST_NODES 完整性：数量在主线日志量级内，关卡集合 ⊆ 主轴关', async () => {
  const { MAIN_QUEST_NODES, MAIN_QUEST_STAGES, STAGE_ORDER } = await axisPromise;
  // 原来写死 `=== 20`，锁的是当时的数字不是规则——按判据清理后（砍 4 条越界、
  // 补 2 条血脉开场与 5 条太泉）立刻红，而节点表本来就该随内容增减。
  // 锁真正该守的：**别退化成逐拍**。对标上古卷轴 5 主线日志约 18–19 条，上限取 30；
  // 真超了说明又把 situation 那一级（143 条逐拍）摊进主轴了。
  assert.ok(
    MAIN_QUEST_NODES.length >= 12 && MAIN_QUEST_NODES.length <= 30,
    `主轴节点 ${MAIN_QUEST_NODES.length} 条——少于 12 说明两根支柱没覆盖全，多于 30 说明退化成逐拍`,
  );
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

// 地点锚（用户裁定 2026-08-16）：隔离关被默认路线跳过，节点不能因此失踪。
test('隔离关的主轴节点靠地点锚仍可达', async () => {
  const { MAIN_QUEST_NODES, resolveMainQuestNodes } = await loadTs('../src/modules/scenarioMods/mainQuestAxis.ts');
  const { DEFAULT_LINE_QUARANTINED_STAGE_IDS } = await loadTs('../src/modules/scenarioMods/canonRail.ts');

  const quarantinedNodes = MAIN_QUEST_NODES.filter(n => DEFAULT_LINE_QUARANTINED_STAGE_IDS.has(n.stageId));
  assert.ok(quarantinedNodes.length > 0, '若隔离名单已清空，本断言需重写而不是删除');

  // 每个落在隔离关上的节点都必须有地点锚，否则默认路线上永远渲染不出来
  for (const node of quarantinedNodes) {
    assert.ok(node.locationId, `隔离关节点缺地点锚，将不可达：[${node.stageId}] ${node.text}`);
    // 按地点也确实取得到
    const byLocation = resolveMainQuestNodes(undefined, node.locationId);
    assert.ok(byLocation.some(n => n.text === node.text), `地点锚 ${node.locationId} 取不到该节点`);
  }
});

test('地点锚不误伤：无关地点取不到节点', async () => {
  const { resolveMainQuestNodes } = await loadTs('../src/modules/scenarioMods/mainQuestAxis.ts');
  assert.deepEqual(resolveMainQuestNodes(undefined, 'liuchao.location.does_not_exist'), []);
  assert.deepEqual(resolveMainQuestNodes(undefined, undefined), []);
});
