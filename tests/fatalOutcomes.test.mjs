import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { loadTs } from './loadTs.mjs';

// 玩家自己走进的绝路 → 本局结束。
//
// 立项由来（2026-08-19，制作人指定两处）：
//   seq 30  玩家执意留在战场不走 → 被王哲九阳自爆的焰浪吞没
//   seq 36  玩家拒绝三个月期限、要求受炮烙
//
// 制作人明确这是**特例，不与 A 档「节点可无限等待」冲突**：
// 压力来自场景本身（自爆焰浪正在逼近），不是超时惩罚。
// 因此时钟起点是「自爆那一步完成之后」，不是「进场就开始倒数」。
// 逼近只送可观察事实、由正文传达，不用 UI 倒计时（裁定 #155）。
//
// 正典依据：「王哲施展九阳神功……化为太阳之火与敌军同归于尽，草原化为十里焦土」；
// 该拍 rail 必达写的是「程宗扬带月霜离开」——**不走就死是这条的自然反面**，不是新编。

const DATA = 'src/modules/scenarioMods/builtins/data/lcq.stage_02.json';

function bootstrap(rtm, mod) {
  const progress = rtm.createScenarioProgress(mod);
  progress.flags = { ...(mod.scenario.initialFlags || {}) };
  progress.worldTurn = 0;
  progress.modId = mod.manifest.id;
  progress.currentChapterId = rtm.getInitialScenarioChapterId(mod);
  progress.nextStageId = 'NEXT';
  return rtm.advanceScenarioRuntime({ 世界: { 状态: { 剧本模组: progress } } }).saveData;
}

test('自爆焰浪：第 3 轮吞没，前两轮只送可观察事实', async () => {
  const rtm = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const mod = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  let save = bootstrap(rtm, mod);
  const rt = () => save.世界.状态.剧本模组;

  // 让 s02_02 进 active，并伪造「自爆那一步」刚在**当前**回合完成。
  // ⚠ 不能写死第 0 轮：bootstrap 里那次 advance 已经把 worldTurn 推过一次。
  rt().activeEventIds = ['lcq.event.s02_02'];
  const blastTurn = Math.max(0, Number(rt().worldTurn) || 0);
  rt().eventActionStates = {
    'lcq.event.s02_02': {
      contractHash: 'x', attemptCount: 1, preparations: [],
      attempts: [{ actionId: 'witness_wang_zhe_nine_suns', outcome: 'success', attemptedAtTurn: blastTurn, detail: '' }],
    },
  };

  // ⚠ 不要手动推 worldTurn：`updateDivergenceControl` 在回合开头就递增它，
  // 而本结算挂在其后。测试若再设一次就双重计数（第一版写错过，第 1 轮直接跳到第二条逼近）。
  const seen = [];
  for (let turn = 1; turn <= 3; turn += 1) {
    const out = rtm.advanceScenarioRuntime(save);
    save = out.saveData;
    seen.push(out.transitions.filter(t => t.type === 'fatal_approach' || t.type === 'game_over'));
  }

  assert.equal(seen[0].length, 1, '第 1 轮应送第一条逼近');
  assert.equal(seen[0][0].type, 'fatal_approach');
  assert.match(seen[0][0].detail, /热浪/);
  assert.equal(seen[1][0].type, 'fatal_approach', '第 2 轮送第二条');
  assert.equal(seen[2][0].type, 'game_over', '第 3 轮吞没');

  const over = rt().gameOver;
  assert.equal(over.endingId, 'lcq.ending.death.wangzhe_blast');
  assert.equal(over.title, '十里焦土');
  assert.ok(over.facts.some(f => f.includes('焰浪')), '结局事实里要写清是怎么死的');
  // 逼近文案不得预告死亡——那是结局才揭的
  const approach = mod.scenario.events.find(e => e.id === 'lcq.event.s02_02').fatalOutcomes.deadline.approach;
  for (const line of approach) {
    assert.ok(!/你会死|烧死|丧命|必死/.test(line), `逼近文案不得预告死亡：${line}`);
  }
});

test('本局结束后引擎停摆，不再推进任何进度', async () => {
  const rtm = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const mod = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  let save = bootstrap(rtm, mod);
  const rt = () => save.世界.状态.剧本模组;
  rt().gameOver = { endingId: 'x', title: 'x', facts: [], sourceEventId: 'y', atTurn: 0 };
  const before = JSON.stringify({ a: rt().activeEventIds, c: rt().completedEventIds, ch: rt().currentChapterId });
  const out = rtm.advanceScenarioRuntime(save);
  const after = out.saveData.世界.状态.剧本模组;
  assert.deepEqual(out.transitions, [], '结束后不应再产生任何 transition');
  assert.equal(JSON.stringify({ a: after.activeEventIds, c: after.completedEventIds, ch: after.currentChapterId }), before);
});

test('绝路选项与正常动作并列出现，且不写进合同', async () => {
  const mod = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const event = mod.scenario.events.find(e => e.id === 'lcq.event.sudaji_south_pact');
  const choices = event.fatalOutcomes.choices;
  assert.equal(choices.length, 1);
  assert.equal(choices[0].id, 'refuse_term_take_paolao');
  const contractIds = event.playerCompletionContract.actions.map(a => a.id);
  assert.ok(!contractIds.includes(choices[0].id), '绝路选项不得混进 playerCompletionContract，否则会进 contractHash');
  assert.equal(choices[0].ending.id, 'lcq.ending.death.paolao');
});

test('deadline 的 approach 条数必须是 turns - 1', async () => {
  // 少了就有轮次没提示，多了就送不完——两种都是把逼近节奏写坏。
  for (const file of fs.readdirSync('src/modules/scenarioMods/builtins/data/').filter(n => n.endsWith('.json'))) {
    const mod = JSON.parse(fs.readFileSync('src/modules/scenarioMods/builtins/data/' + file, 'utf8'));
    for (const event of mod.scenario?.events || []) {
      const d = event.fatalOutcomes?.deadline;
      if (!d) continue;
      // turns: 0 = 锚定动作落账当回合即结算（延后触发的旧选择后果，裁定 #169），没有中间回合，也就没有逼近条。
      assert.equal(d.approach.length, Math.max(0, d.turns - 1), `${event.id} 的 approach 条数与 turns 对不上`);
      assert.ok(d.ending.facts.length >= 2, `${event.id} 的结局事实太少，叙述写不出东西`);
    }
  }
});

test('逼近正文与结局事实必须真的进到提示词里', async () => {
  // transition 只带内部 id（`lcq.event.s02_02#0`），喂不到模型——
  // 这正是本轮先查后写的原因：`fatal_approach` 发出来了，但若没有第二条路，
  // 玩家永远看不到焰浪。制作人 2026-08-19：「倒计时让 LLM 自己用语言喂给玩家即可。」
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const rtm = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const mod = JSON.parse(fs.readFileSync(DATA, 'utf8'));

  // ① 逼近：正文必须拿到那句可观察事实，且不得出现机制口径
  let save = bootstrap(rtm, mod);
  const rt = () => save.世界.状态.剧本模组;
  rt().activeEventIds = ['lcq.event.s02_02'];
  rt().eventActionStates = {
    'lcq.event.s02_02': {
      contractHash: 'x', attemptCount: 1, preparations: [],
      attempts: [{
        actionId: 'witness_wang_zhe_nine_suns', outcome: 'success',
        attemptedAtTurn: Math.max(0, Number(rt().worldTurn) || 0), detail: '',
      }],
    },
  };
  save = rtm.advanceScenarioRuntime(save).saveData;
  assert.ok(rt().pendingFatalApproach?.texts?.length, '引擎应把本轮逼近事实挂到 runtime 上');
  const ctx = buildScenarioStoryPrompt(save) || '';
  assert.ok(rt().pendingFatalApproach.texts.every(t => ctx.includes(t)), '逼近事实没有进提示词——玩家将永远看不到焰浪');
  assert.ok(/不得.*倒计时/.test(ctx), '必须显式禁止把回合数写进正文');

  // ② 结局：事实要全部进提示词
  rt().gameOver = {
    endingId: 'lcq.ending.death.wangzhe_blast', title: '十里焦土',
    facts: ['王哲以九阳神功合一，化为太阳之火与敌军同归于尽', '程宗扬没有离开战场，被焰浪吞没'],
    sourceEventId: 'lcq.event.s02_02', atTurn: 9,
  };
  const overCtx = buildScenarioStoryPrompt(save) || '';
  assert.ok(overCtx.includes('十里焦土'), '结局标题要进提示词');
  for (const fact of rt().gameOver.facts) {
    assert.ok(overCtx.includes(fact), `结局事实漏了：${fact}`);
  }
  assert.ok(/本局到此为止|不得留生机/.test(overCtx), '必须禁止叙述给玩家留转机');
});


test('事件名不得成为按钮对象——那是内部标题，写的是本拍结果', async () => {
  // 真机实测（2026-08-19）：objective 与 action label 都已清理干净，
  // 玩家看到的按钮却是「行动 · 段强被射杀」——事件名经 fallbackTarget 把结局印回了按钮。
  const rtm = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const mod = JSON.parse(fs.readFileSync('src/modules/scenarioMods/builtins/data/lcq.stage_01.json', 'utf8'));
  const progress = rtm.createScenarioProgress(mod);
  progress.flags = { ...(mod.scenario.initialFlags || {}) };
  progress.worldTurn = 0;
  progress.modId = mod.manifest.id;
  progress.currentChapterId = rtm.getInitialScenarioChapterId(mod);
  let save = rtm.advanceScenarioRuntime({ 世界: { 状态: { 剧本模组: progress } } }).saveData;
  const runtime = save.世界.状态.剧本模组;
  runtime.activeEventIds = ['lcq.event.s01_02'];
  const labels = rtm.getCurrentStoryEventActions(save).map(action => action.label);
  assert.ok(labels.length > 0, '应当有可选动作');
  for (const label of labels) {
    assert.ok(!label.includes('段强被射杀'), `按钮把事件名当成了对象：${label}`);
  }
});
