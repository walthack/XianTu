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
  // 原来写死 `=== 20`；清理后立刻红，而节点表本就该随内容增减。
  // 换掉时我又编了一个 12–30 的区间当界——**那同样是拍脑袋的数字，用户没有数量要求**
  // （用户 2026-08-16：「为啥要 20 上下，我又没数字要求」，并裁定太泉那段铺开更好）。
  //
  // 真正要防的只有一件事：主轴退化成逐拍。那就拿**真实的逐拍层**来比，不用发明的区间——
  // situation 那一级是每个局势一条（143 条），主轴若逼近它就说明摊平了。
  const PER_BEAT_LAYER = 143;
  assert.ok(
    MAIN_QUEST_NODES.length < PER_BEAT_LAYER / 2,
    `主轴 ${MAIN_QUEST_NODES.length} 条，已逼近逐拍层（${PER_BEAT_LAYER} 条）——主轴是叠在其上的主线层，不该与它同量级`,
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

// 2026-08-17 规则升级：主轴**不该再有**节点落在隔离关上。
//
// 原断言写的是「隔离关的节点靠地点锚仍可达」——那是权宜：当时最后一个节点
// （`enter_dong_recognize_biji`「当面辨认碧姬」）挂在隔离关 `lcq.stage_05` 等裁定，
// 只能靠地点锚兜底。孤儿救援已把该拍重建为可达的 `geluo_summons_biji`（seq 158），
// 主轴遂无隔离节点。原断言自己写着「若隔离名单已清空，本断言需重写而不是删除」，照办：
// 规则从「兜得住」升级为「不该发生」。地点锚兜底的能力保留在下面的用例里，未删。
test('主轴不得有节点落在隔离关上', async () => {
  const { MAIN_QUEST_NODES, resolveMainQuestNodes } = await loadTs('../src/modules/scenarioMods/mainQuestAxis.ts');
  const { DEFAULT_LINE_QUARANTINED_STAGE_IDS } = await loadTs('../src/modules/scenarioMods/canonRail.ts');

  const quarantinedNodes = MAIN_QUEST_NODES.filter(n => DEFAULT_LINE_QUARANTINED_STAGE_IDS.has(n.stageId));
  assert.deepEqual(
    quarantinedNodes.map(n => `[${n.stageId}] ${n.text}`),
    [],
    '主轴节点挂在被默认路线静默跳过的关上，玩家永远走不到——改挂可达关或找出该拍的可达版本',
  );

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
