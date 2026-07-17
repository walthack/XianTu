import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

test('preflight only proposes cards for explicit risky actions', async () => {
  const { buildLocalJudgementPreflight, composeJudgementAction } = await loadTs('../src/utils/judgementPreflight.ts');
  const save = { 角色: { 身份: { 先天六司: { 气运: 9, 灵性: 7, 心性: 4 }, 后天六司: {} }, 位置: { 灵气浓度: 60 } } };
  assert.equal(buildLocalJudgementPreflight('我先和店家闲聊几句', save, 1), null);
  const proposal = buildLocalJudgementPreflight('我潜入守卫森严的府邸', save, 1);
  assert.equal(proposal.kind, 'stealth');
  assert.equal(proposal.status, 'pending');
  assert.ok(proposal.factors.some(factor => factor.label === '六司' && factor.value === 7));
  assert.match(proposal.stakes.greatSuccess, /大幅推进/);
  const queuedAction = composeJudgementAction('继续当前安排', '【操作】双修调息疗伤');
  assert.equal(buildLocalJudgementPreflight(queuedAction, save, 1).kind, 'cultivate');
});

test('active Canon Rail events use process-only policy while explicit rewrites require IF', async () => {
  const { buildLocalJudgementPreflight } = await loadTs('../src/utils/judgementPreflight.ts');
  const save = { 世界: { 状态: { 剧本模组: { modId: 'lcq.stage_01', activeEventIds: ['lcq.event.s01_04'] } } } };
  assert.equal(buildLocalJudgementPreflight('我潜入守卫森严的府邸', save, 1).canonPolicy, 'route_process_only');
  assert.equal(buildLocalJudgementPreflight('我收服卓云君并纳入后宫', save, 1).canonPolicy, 'if_only');
  assert.equal(buildLocalJudgementPreflight('我打算与卓云君结盟', save, 1).canonPolicy, 'if_only');
});

test('preflight consumes only explicit source-verified mastered scenario skills', async () => {
  const { buildLocalJudgementPreflight } = await loadTs('../src/utils/judgementPreflight.ts');
  const save = {
    角色: {
      身份: { 先天六司: {}, 后天六司: {} },
      位置: { 灵气浓度: 50 },
      技能: {
        掌握技能: [
          { 技能名称: '九阳神功', 熟练度: 40 },
          { 技能名称: '五虎断门刀', 熟练度: 100 },
          { 技能名称: '模型自造神功', 熟练度: 100 },
        ],
      },
    },
    世界: {
      状态: {
        剧本模组: {
          canon: {
            skills: [
              { id: 'skill.nineyang', name: '九阳神功', description: '太乙真宗核心功法，用于修炼真气。' },
              { id: 'skill.wuhu', name: '五虎断门刀', description: '武二郎的刀法，未传授给程宗扬。' },
            ],
          },
        },
      },
    },
  };

  const verified = buildLocalJudgementPreflight('我运转九阳神功闭关修炼', save, 1);
  assert.deepEqual(
    verified.factors.filter(factor => factor.source === 'skill'),
    [{ label: '正典技能·九阳神功', value: 8, source: 'skill' }],
  );
  assert.equal(
    buildLocalJudgementPreflight('我闭关修炼', save, 1).factors.some(factor => factor.source === 'skill'),
    false,
    'an unmentioned skill must not grant an automatic bonus',
  );
  assert.equal(
    buildLocalJudgementPreflight('我施展五虎断门刀迎战', save, 1).factors.some(factor => factor.source === 'skill'),
    false,
    'a canon entry explicitly marked untransmitted must not grant a bonus',
  );
  assert.equal(
    buildLocalJudgementPreflight('我施展模型自造神功迎战', save, 1).factors.some(factor => factor.source === 'skill'),
    false,
    'a save-only invented skill must not become a source-verified factor',
  );
});
