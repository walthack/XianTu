// 战斗试玩整拍集成：遇敌 → 开战 → 掷骰 → 落账 → 收尾 → 终点，A / B 两种模式、三种结局、重打、刷新续用。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const S04 = 'lcq.stage_04';
const EVENT = 'lcq.event.s04_02';
const rt = save => save.世界.状态.剧本模组;
const stageMod = async () => JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${S04}.json`, import.meta.url), 'utf8'));

async function mods() {
  return {
    overlay: await loadTs('../src/dev/combatTrial/overlay.ts'),
    flow: await loadTs('../src/dev/combatTrial/flow.ts'),
    data: await loadTs('../src/dev/combatTrial/f03Scenario.ts'),
    state: await loadTs('../src/dev/combatTrial/trialState.ts'),
    runtime: await loadTs('../src/modules/scenarioMods/runtime.ts'),
    qingyu: await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts'),
  };
}

function click(m, save, actionId) {
  const action = m.runtime.getCurrentStoryEventActions(save).find(item => item.actionId === actionId);
  assert.ok(action, `动作 ${actionId} 不可见；当前：${JSON.stringify(m.runtime.getCurrentStoryEventActions(save).map(item => item.actionId))}`);
  rt(save).worldTurn++;
  assert.equal(m.runtime.recordStoryEventStructuredAction(save, action).attempted, true);
  return m.runtime.advanceScenarioRuntime(save).saveData;
}

/** 模拟管线：点「迎向雾里」后把固定遇敌文字写成一条叙事。 */
function engage(m, save) {
  const next = click(m, save, 'trial_engage');
  next.系统.历史.叙事.push({ type: 'gm', content: `${m.data.ENCOUNTER_TEXT}\n\n你腹中忽然掠过一阵阴寒，冰蛊仍未解除。`, time: '【南荒·熊耳铺外】', actionOptions: [] });
  return next;
}

async function started(mode, extra = {}) {
  const m = await mods();
  let save = m.overlay.createCombatTrialSave(await stageMod(), { mode, generatedAt: '2026-10-04T12:00:00.000Z', ...extra });
  save = engage(m, save);
  const begun = m.flow.beginBattle(save);
  assert.ok(begun, '遇敌后应能开战');
  return { m, save: begun };
}

function playAll(m, save, pick) {
  let guard = 0;
  while (m.state.readTrialState(save).status === 'engaged') {
    assert.ok(guard++ < 12);
    const view = m.flow.battleView(save);
    const result = m.flow.rollChoice(save, pick(view).id);
    save = result.save;
  }
  return save;
}

test('开战：存战前快照，B 模式把第一阶段写进叙事；重复调用不再开战', async () => {
  const { m, save } = await started('B', { forced: [20, 20] });
  const ext = m.state.readTrialState(save);
  assert.equal(ext.status, 'engaged');
  assert.ok(ext.snapshot && m.state.readTrialState(ext.snapshot).status === 'idle');
  assert.equal(ext.snapshot.系统.扩展.战斗试玩.snapshot, null, '快照里不嵌套快照');
  assert.match(save.系统.历史.叙事.at(-1).content, /第一阶段 · 雾中第一次交手/);
  assert.equal(m.flow.beginBattle(save), null);
  const view = m.flow.battleView(save);
  assert.equal(view.choices.length, 3);
  for (const choice of view.choices) {
    assert.equal(Math.round((choice.chance.胜 + choice.chance.败 + choice.chance.大败) * 1000) / 1000, 1);
    assert.ok(choice.factors.length >= 3 && choice.factors.some(f => f.label === '六司'));
  }
});

test('遇敌文字还没写进叙事时不开战（管线可能晚于存档状态）', async () => {
  const m = await mods();
  let save = m.overlay.createCombatTrialSave(await stageMod(), { mode: 'B' });
  save = click(m, save, 'trial_engage');
  assert.equal(m.flow.beginBattle(save), null);
  save.系统.历史.叙事.push({ type: 'gm', content: m.data.ENCOUNTER_TEXT, time: 't', actionOptions: [] });
  assert.ok(m.flow.beginBattle(save));
});

const SCRIPTS = [
  // [模式, 指定骰点, 期望档位, 期望结果标记, 收尾动作]
  ['B', [20, 20], '胜', 'win', 'trial_after_win'],
  ['B', [9, 9], '败', 'lose', 'trial_after_lose'],
  ['B', [1, 1], '大败', 'rout', 'trial_after_rout'],
  ['A', [20, 20, 20, 20, 20], '胜', 'win', 'trial_after_win'],
  ['A', [10, 10, 10, 10, 10], '败', 'lose', 'trial_after_lose'],
  ['A', [1, 1, 1, 1, 1], '大败', 'rout', 'trial_after_rout'],
];

for (const [mode, rolls, tier, result, epilogue] of SCRIPTS) {
  test(`整拍走通：${mode} 模式，骰 ${rolls.join(',')} → ${tier}；落账、收尾、终点`, async () => {
    const { m, save: begun } = await started(mode, { forced: rolls });
    const hpBefore = begun.角色.属性.气血.当前;
    // 两种模式都始终选第一个选项（B：硬接 / A：进攻），骰点由指定序列决定
    let save = playAll(m, begun, view => view.choices[0]);
    const ext = m.state.readTrialState(save);
    assert.equal(ext.status, 'resolved');
    assert.equal(ext.tier, tier, `期望 ${tier}，实际 ${ext.tier}`);
    assert.equal(rt(save).flags['trial.combat.result'], result);
    assert.equal(rt(save).flags['trial.combat.mode'], mode);
    // 战斗实录追加进同一条叙事，并带上援手赶到
    const entry = save.系统.历史.叙事[ext.narrativeIndex];
    assert.ok(entry.content.startsWith(m.data.ENCOUNTER_TEXT.slice(0, 30)));
    assert.match(entry.content, /武二郎冲进雾里/);
    assert.equal(save.系统.历史.叙事.length, 2, '战斗实录不新增叙事条目（开场 + 遇敌条目）');
    // 主角落账：胜 = 外伤轻（B 阶段累计可能更重，至少有外伤），气血不增
    const effects = save.角色.效果.filter(item => item.来源 === '山涧雾战');
    assert.ok(effects.length <= 1);
    if (tier === '大败') assert.ok(effects.length === 1 && /重/.test(effects[0].状态名称));
    assert.ok(save.角色.属性.气血.当前 <= hpBefore && save.角色.属性.气血.当前 >= 1);
    // 战后记录里的主角外伤与最终伤势一致，且只出现一次
    const woundLines = ext.battle.ledger.filter(line => line.step === '战后' && /^程宗扬 外伤（/.test(line.text));
    const wound = m.flow.battleView(save).wound;
    assert.equal(woundLines.length, wound === '无' ? 0 : 1, JSON.stringify(woundLines));
    if (woundLines.length) assert.ok(woundLines[0].text.startsWith(`程宗扬 外伤（${wound}）`), `${woundLines[0].text} vs ${wound}`);
    assert.ok(effects.length === 0 || effects[0].状态名称 === `外伤（${wound}）`);
    // 战斗结束后恰有一个收尾按钮
    assert.deepEqual(m.runtime.getCurrentStoryEventActions(save).map(item => item.actionId).filter(id => id.startsWith('trial_after_')), [epilogue]);
    save = click(m, save, epilogue);
    assert.ok(rt(save).completedEventIds.includes(EVENT));
    assert.equal(m.qingyu.isNanhuangDemoFinished(save), true);
    // 战斗卡片之后重复掷骰被拒绝
    assert.throws(() => m.flow.rollChoice(save, 'attack'), /没有进行中的战斗/);
  });
}

test('NPC 伤情：B 大败 → 凝羽内伤；B 败 → 祁远肩伤；B 胜 → 无；A 没护住凝羽且败 → 凝羽内伤', async () => {
  const injuriesAfter = async (mode, rolls, epilogue, strategy) => {
    const { m, save } = await started(mode, { forced: rolls });
    let done = playAll(m, save, strategy || (view => view.choices[0]));
    done = click(m, done, epilogue);
    return JSON.stringify(rt(done).sceneLedger.injuries);
  };
  assert.match(await injuriesAfter('B', [1, 1], 'trial_after_rout'), /内伤（中）/);
  const lose = await injuriesAfter('B', [9, 9], 'trial_after_lose');
  assert.match(lose, /肩伤加重一级/);
  assert.doesNotMatch(lose, /内伤/);
  assert.equal(await injuriesAfter('B', [20, 20], 'trial_after_win'), '{}');
  assert.match(await injuriesAfter('A', [10, 10, 10, 10, 10], 'trial_after_lose'), /内伤（中）/, 'A：没护住凝羽且败，凝羽带内伤');
});

test('A：第二回合起选「护住凝羽」且成功 → 败局凝羽无内伤', async () => {
  const { m, save } = await started('A', { forced: [10, 20, 20, 20, 20] });
  let current = save;
  let turn = 0;
  while (m.state.readTrialState(current).status === 'engaged') {
    const view = m.flow.battleView(current);
    const protect = view.choices.find(choice => choice.id === 'protect');
    // 第 2 回合护住凝羽（成功），其余回合进攻
    const choice = turn === 1 && protect ? protect : view.choices.find(item => item.id === 'attack');
    current = m.flow.rollChoice(current, choice.id).save;
    turn++;
  }
  const ext = m.state.readTrialState(current);
  assert.equal(ext.battle.protectedNingyu, true);
  if (ext.tier !== '胜') {
    const done = click(m, current, `trial_after_${ext.tier === '败' ? 'lose' : 'rout'}`);
    assert.ok(!Object.values(rt(done).sceneLedger.injuries).some(text => /内伤/.test(text)) || ext.tier === '大败');
  }
});

test('刷新安全：每掷一步存档都能 JSON 往返；从中途存档继续，与不间断打完结果逐骰一致（指定骰 + 种子）', async () => {
  const opts = { forced: [14, 3], seed: 42 };
  const { m, save } = await started('B', opts);
  const straight = playAll(m, save, view => view.choices[1]);
  // 中途「刷新」：掷一步后序列化再读回，继续
  let resumed = save;
  resumed = m.flow.rollChoice(resumed, m.flow.battleView(resumed).choices[1].id).save;
  resumed = JSON.parse(JSON.stringify(resumed));
  resumed = playAll(m, resumed, view => view.choices[1]);
  const a = m.state.readTrialState(straight);
  const b = m.state.readTrialState(resumed);
  assert.deepEqual(b.battle.resolutions.map(r => [r.roll, r.outcome]), a.battle.resolutions.map(r => [r.roll, r.outcome]));
  assert.equal(b.diceUsed, a.diceUsed);
});

test('回到战前重打：恢复快照、换模式、骰点序列重新开始；战前状态没有被战斗污染', async () => {
  const { m, save: begun } = await started('B', { forced: [1, 1] });
  const hpBefore = begun.角色.属性.气血.当前;
  const lost = playAll(m, begun, view => view.choices[0]);
  assert.equal(m.state.readTrialState(lost).tier, '大败');
  assert.ok(lost.角色.属性.气血.当前 < hpBefore);
  const restored = m.flow.restartFromSnapshot(lost, 'A');
  assert.ok(restored);
  const ext = m.state.readTrialState(restored);
  assert.deepEqual([ext.mode, ext.status, ext.diceUsed, ext.rematches, ext.snapshot], ['A', 'idle', 0, 1, null]);
  assert.equal(restored.角色.属性.气血.当前, hpBefore);
  assert.equal(rt(restored).flags['trial.combat.result'], undefined);
  assert.equal(restored.系统.历史.叙事.length, 2);
  assert.ok(!restored.系统.历史.叙事.at(-1).content.includes('武二郎冲进雾里'));
  assert.equal(restored.角色.效果.filter(item => item.来源 === '山涧雾战').length, 0);
  // 再开战：新模式，骰序列从头
  const again = m.flow.beginBattle(restored);
  assert.ok(again);
  const first = m.flow.rollChoice(again, 'attack');
  assert.equal(first.resolution.roll, 1, '指定骰点序列在重打时重新开始');
  // 打完一场再重打也行（结束后点收尾之前、之后都有快照）
  let finished = playAll(m, again, view => view.choices[0]);
  finished = click(m, finished, `trial_after_${{ 胜: 'win', 败: 'lose', 大败: 'rout' }[m.state.readTrialState(finished).tier]}`);
  const third = m.flow.restartFromSnapshot(finished, 'B');
  assert.ok(third && !rt(third).completedEventIds.includes(EVENT));
  assert.equal(m.qingyu.isNanhuangDemoFinished(third), false);
});

test('没有战斗时视图为空；没有快照时无法重打', async () => {
  const m = await mods();
  const save = m.overlay.createCombatTrialSave(await stageMod(), { mode: 'A' });
  assert.equal(m.flow.battleView(save), null);
  assert.equal(m.flow.restartFromSnapshot(save, 'B'), null);
  assert.throws(() => m.flow.rollChoice(save, 'attack'), /没有进行中的战斗/);
});
