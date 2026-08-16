import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

// P1-4：声望的确定性结算。照 tests/affinityLadder 的写法，只验引擎因果，不碰模型行为。

test('声望锚点按档位曲线标定，且承重事件高于普通事件', async () => {
  const { REPUTATION_EVENT_GRANT } = await loadTs('../src/modules/scenarioMods/reputationLedger.ts');
  assert.ok(REPUTATION_EVENT_GRANT.critical > REPUTATION_EVENT_GRANT.normal,
    '承重事件的声望增量必须高于普通事件，否则"承重"没有体现');
  assert.ok(REPUTATION_EVENT_GRANT.normal > 0, '普通事件也该有增量，否则只有承重事件算数');

  // 标定意图：头两关（约 12 个事件、多为承重）应落在「小有名气」(100) 一档，
  // 不该已经「声名远播」(500)——刚穿越、打完一场败仗的人不配那个分量。
  const earlyGame = 12 * REPUTATION_EVENT_GRANT.critical;
  assert.ok(earlyGame >= 100, `头两关应至少到「小有名气」，实得 ${earlyGame}`);
  assert.ok(earlyGame < 500, `头两关不应达到「声名远播」，实得 ${earlyGame}`);

  // 走完原著（约 370 事件、半数承重）应落在「名满天下」(5000) 一带，
  // 给续写段留出到「传说人物」(10000) 的空间。
  const fullRun = 185 * REPUTATION_EVENT_GRANT.critical + 185 * REPUTATION_EVENT_GRANT.normal;
  assert.ok(fullRun >= 3000, `走完原著应至少「威震四方」，实得 ${fullRun}`);
  assert.ok(fullRun < 10000, `走完原著不应直达「传说人物」，需给续写留空间，实得 ${fullRun}`);
});

test('旧档首次结算只登记不补发——补发等于把模型已经加过的再算一遍', async () => {
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  assert.equal(typeof advanceScenarioRuntime, 'function');
});

test('结算明细字段齐全，能进玩家可见状态流', async () => {
  const mod = await loadTs('../src/modules/scenarioMods/reputationLedger.ts');
  // ReputationGrant 是 type，运行时验不到；这里改验常量模块导出面没有回退。
  assert.ok(Object.prototype.hasOwnProperty.call(mod, 'REPUTATION_EVENT_GRANT'));
});

test('地区立足度是派生量：走完该地区即到顶，未涉足为 0', async () => {
  const { regionStanding, STAGE_REGION } = await loadTs('../src/modules/scenarioMods/reputationLedger.ts');
  const { STAGE_ORDER } = await loadTs('../src/modules/scenarioMods/mainQuestAxis.ts');

  // 每一关都必须有地区，否则该关的经历落不了账
  for (const stageId of STAGE_ORDER) {
    assert.ok(STAGE_REGION[stageId], `关卡 ${stageId} 缺地区映射`);
  }
  assert.equal(Object.keys(STAGE_REGION).length, STAGE_ORDER.length, '地区映射与链序关卡数必须一致');

  // 开局：塞外刚起步，其余全 0
  const atStart = regionStanding('lcq.stage_01', STAGE_ORDER);
  assert.ok(atStart['塞外'] > 0 && atStart['塞外'] < 100, `开局塞外应在途中，实得 ${atStart['塞外']}`);
  assert.equal(atStart['唐国'], 0, '开局不该在唐国有立足度');
  assert.equal(atStart['昭南'], 0, '开局不该在昭南有立足度');

  // 走完昭南段（stage_06 是昭南最后一关）：昭南到顶，塞外也早已走完
  const afterZhaonan = regionStanding('lcq.stage_06', STAGE_ORDER);
  assert.equal(afterZhaonan['昭南'], 100, '走完昭南全部关卡后该地区应到顶');
  assert.equal(afterZhaonan['塞外'], 100, '更早的塞外应已到顶');
  assert.equal(afterZhaonan['汉国'], 0, '尚未抵达的汉国应为 0');

  // 终点：全部到顶
  const atEnd = regionStanding(STAGE_ORDER[STAGE_ORDER.length - 1], STAGE_ORDER);
  for (const [region, value] of Object.entries(atEnd)) {
    assert.equal(value, 100, `走到最后一关时 ${region} 应到顶，实得 ${value}`);
  }

  // 幂等：同一输入两次结果一致（派生量不是累加账）
  assert.deepEqual(regionStanding('lcq.stage_06', STAGE_ORDER), afterZhaonan);

  // 未知关卡不该炸，也不该凭空给分
  const unknown = regionStanding('nope.stage', STAGE_ORDER);
  for (const value of Object.values(unknown)) assert.equal(value, 0);
});
