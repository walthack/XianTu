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

test('manual input, suggested action wording, and queued operations share the expanded risk classifier', async () => {
  const { buildLocalJudgementPreflight, composeJudgementAction } = await loadTs('../src/utils/judgementPreflight.ts');
  const save = { 角色: { 身份: { 先天六司: {}, 后天六司: {} }, 位置: { 灵气浓度: 50 } } };
  const cases = [
    ['挡住追兵', 'combat'],
    ['拔剑斩向守卫', 'combat'],
    ['暗中偷袭守卫', 'combat'],
    ['挥拳打向对方', 'combat'],
    ['他打了守卫一拳', 'combat'],
    ['我打出一掌', 'combat'],
    ['朝他射出一箭', 'combat'],
    ['打晕守卫', 'combat'],
    ['下毒害他', 'combat'],
    ['抢劫商队', 'combat'],
    ['抢夺腰牌', 'combat'],
    ['试着劝他放我们过去', 'social'],
    ['我想骗过门房', 'scheme'],
    ['搜索暗室里的机关', 'explore'],
    ['伪装成送货人潜入府邸', 'stealth'],
    ['趁乱偷走腰牌', 'stealth'],
    ['撬锁进入密室', 'stealth'],
    ['偷听密谈', 'stealth'],
    ['刺探军情', 'stealth'],
    ['锻造一柄法器', 'craft'],
    ['冲击境界', 'cultivate'],
    ['甩开身后的追踪者', 'escape'],
  ];
  for (const [action, kind] of cases) {
    assert.equal(buildLocalJudgementPreflight(action, save, 3)?.kind, kind, action);
  }

  const suggestedAction = '游说守将打开城门';
  assert.equal(buildLocalJudgementPreflight(composeJudgementAction(suggestedAction, ''), save, 3)?.kind, 'social');
  assert.equal(buildLocalJudgementPreflight(composeJudgementAction('', '【操作】盗取守卫腰牌'), save, 3)?.kind, 'stealth');
  for (const safeAction of ['我与店家闲聊近况', '他打了个哈欠', '我先打了个招呼', '打出一张牌', '抢夺先机', '我抢下话语权，继续解释来意', '躲开麻烦']) {
    assert.equal(buildLocalJudgementPreflight(safeAction, save, 3), null, safeAction);
  }
});

test('R3 grab-and-dodge battlefield wording hits one combat proposal without widening 抢下/躲开', async () => {
  const { buildLocalJudgementPreflight } = await loadTs('../src/utils/judgementPreflight.ts');
  const save = { 角色: { 身份: { 先天六司: {}, 后天六司: {} }, 位置: { 灵气浓度: 50 } } };
  const r3 = '我猛地扑向最近的一具尸体，抢下他手里的短刀，然后借着草丛翻滚躲开射来的箭。';
  const proposal = buildLocalJudgementPreflight(r3, save, 1);
  assert.ok(proposal, 'fixed R3 input must reach local risk preflight');
  assert.equal(proposal.kind, 'combat', 'RISK_RULES keeps combat before escape/stealth; 抢下手里短刀 is the first hit');
  assert.equal(proposal.status, 'pending');
  assert.equal(
    buildLocalJudgementPreflight('我抢下话语权，继续解释来意', save, 1),
    null,
    'ordinary 抢下 without a weapon-in-hand object must stay unjudged',
  );
  assert.equal(buildLocalJudgementPreflight('躲开射来的箭', save, 1)?.kind, 'escape');
  assert.equal(buildLocalJudgementPreflight('抢下他手里的短刀', save, 1)?.kind, 'combat');
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
  assert.equal(
    buildLocalJudgementPreflight('我用九阳神功说服店家', save, 1).factors.some(factor => factor.source === 'skill'),
    false,
    'a mastered canon skill must still match the judgement kind',
  );
});

test('explicit matching talent affects situational judgement but never grants an implicit bonus', async () => {
  const { buildLocalJudgementPreflight } = await loadTs('../src/utils/judgementPreflight.ts');
  const save = {
    角色: {
      身份: {
        先天六司: {}, 后天六司: {},
        天赋: [{ name: '听风辨位', description: '擅长感应、追踪与侦察细微声息' }],
      },
      位置: { 灵气浓度: 50 },
    },
  };
  const named = buildLocalJudgementPreflight('我运用听风辨位探查暗门', save, 1);
  assert.deepEqual(named.factors.filter(factor => factor.source === 'talent'), [
    { label: '天赋·听风辨位', value: 4, source: 'talent' },
  ]);
  const unnamed = buildLocalJudgementPreflight('我探查暗门', save, 1);
  assert.equal(unnamed.factors.some(factor => factor.source === 'talent'), false);
});

test('清羽现场短刀只凭已落账持有回执提供 item factor', async () => {
  const { buildLocalJudgementPreflight } = await loadTs('../src/utils/judgementPreflight.ts');
  const demo = await loadTs('../src/modules/scenarioMods/fastNarrativeDemoAdjudication.ts');
  const { hashJudgementAction } = await loadTs('../src/utils/judgementEngine.ts');
  const ON_STORAGE = { getItem: key => (key === 'xiantu.fastNarrativeDemo.v1' ? 'true' : null) };
  const OFF_STORAGE = { getItem: () => null };
  const sourceAction = '我猛地扑向最近的一具尸体，抢下他手里的短刀，然后借着草丛翻滚躲开射来的箭。';
  const actionHash = hashJudgementAction(sourceAction);
  const judgement = {
    id: 'judge-held-knife', status: 'resolved', actionText: sourceAction, actionHash,
    kind: 'combat', whyNow: '战场抢刀有风险', difficulty: { band: 'hard', value: 20 }, factors: [],
    stakes: { success: '抢到短刀', partial: '短刀脱手', failure: '未能取刀' },
    canonPolicy: 'route_process_only', sourceEventId: 'lcq.event.s01_02', createdAtTurn: 1,
    roll: 12, total: 22, outcome: 'success', appliedEffects: [], resolvedAtTurn: 1,
  };
  const save = {
    角色: { 身份: { 先天六司: {}, 后天六司: {} }, 位置: { 灵气浓度: 50 } },
    世界: { 状态: { 剧本模组: { modId: 'lcq.stage_01', activeEventIds: ['lcq.event.s01_02'] } } },
    系统: { 扩展: {
      判定: { version: 1, recent: [judgement] },
      清羽记开局: { kind: 'qingyu-demo-v1' },
    } },
  };
  assert.equal(demo.settleFastNarrativeDemoAdjudication(save, judgement, { storage: ON_STORAGE }).applied, true);

  const explicit = buildLocalJudgementPreflight('我用短刀格挡迎面劈来的兵刃', save, 2, ON_STORAGE);
  assert.deepEqual(explicit.factors.filter(factor => factor.source === 'item'), [
    { label: '现场物品·凡品短刀', value: 3, source: 'item' },
  ]);
  assert.equal(
    buildLocalJudgementPreflight('我观察手里的短刀', save, 2, ON_STORAGE),
    null,
    '只提到短刀而没有风险动作或明确使用，不应凭空触发判定',
  );
  assert.equal(
    buildLocalJudgementPreflight('我用短刀格挡迎面劈来的兵刃', save, 2, OFF_STORAGE)
      .factors.some(factor => factor.source === 'item'),
    false,
    '总开关关闭时不授予物品因子',
  );

  const expiredRecent = structuredClone(save);
  expiredRecent.系统.扩展.判定.recent = [];
  assert.equal(
    buildLocalJudgementPreflight('我用短刀格挡迎面劈来的兵刃', expiredRecent, 2, ON_STORAGE)
      .factors.some(factor => factor.source === 'item'),
    true,
    '清空 recent 不得让已经合法签发的回执失效',
  );

  const tamperedHash = structuredClone(save);
  tamperedHash.系统.扩展.清羽记开局.adjudication.actionReceipts[0].verificationHash = 'forged';
  assert.equal(
    buildLocalJudgementPreflight('我用短刀格挡迎面劈来的兵刃', tamperedHash, 2, ON_STORAGE)
      .factors.some(factor => factor.source === 'item'),
    false,
    '篡改回执摘要必须 fail closed',
  );

  const tamperedReceipt = structuredClone(save);
  tamperedReceipt.系统.扩展.清羽记开局.adjudication.actionReceipts[0].outcome = 'failure';
  assert.equal(
    buildLocalJudgementPreflight('我用短刀格挡迎面劈来的兵刃', tamperedReceipt, 2, ON_STORAGE)
      .factors.some(factor => factor.source === 'item'),
    false,
    '篡改回执字段必须 fail closed',
  );
});
