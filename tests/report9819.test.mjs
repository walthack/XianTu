// REPORT-8091-98199e80 复测修复回归。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.location = { search: '', hostname: 'localhost' };
const { GAME_NUMBERS } = await loadTs('../src/modules/sceneModule/numbers.ts');

// ───────────── 2) P1 南荒自由交手不扣血，只有掷骰拍扣血 ─────────────
// 根因：场面收场后「与来敌交手」打的是模型临场写出的无名来袭者，不在 freeActionRosterOf 在场名单里，也不是任何已知人物；
// 自由行动票按 target_unavailable（target_not_present）拒掉，到不了判定、不掷骰，气血不动——统一写回（combatWriteback）根本没被调用。
// 修（设计稿 2.4「自由交手打模型临场写出的敌人：仍走 freeAction 判定，用同一写回函数」）：freeAction.ticket.unlistedFoe 列出的变体（physical.attack），
// 目标不是任何已知人物时置空、按「对来敌出手」签发判定，确认后只结算玩家一方：非成功档扣气血、打到 ≤ combatDownedAt 判负出判负首行、记 LCQ-SAV-056。
const FX = await import('./freeActionFixture.mjs');
const { resetLogState } = await loadTs('../src/modules/diagnostics/log.ts');
const { logStore } = await loadTs('../src/modules/diagnostics/store.ts');
const WB = await loadTs('../src/modules/sceneModule/host/combatWriteback.ts');
const foeTicket = () => FX.ticket('physical', 'attack', null);
const rawAttack = (targetId, evidence = '挥刀砍向那头豹子') => ({ actionClass: 'physical', variant: 'attack', targetId, degree: 'normal', performed: 'yes', evidence, itemId: null });

test('2 无名来敌：攻击票不再按 target_unavailable 拒；点名的已知人物不在场照旧拒；提示词写明 targetId 填 null', () => {
  const save = FX.makeSave({ present: [] });
  for (const reported of [null, 'null', 'lcq.enemy.guiwang_warrior', 'lcq.enemy.guiwang_warrior#scene:1', 'some_made_up']) {
    const checked = FX.mods.ticket.validateFreeActionTickets([rawAttack(reported)], '我挥刀砍向那头豹子', save);
    assert.deepEqual(checked.refusals, [], String(reported));
    assert.deepEqual(checked.tickets.map(t => [t.actionClass, t.variant, t.targetId]), [['physical', 'attack', null]], String(reported));
  }
  const named = FX.mods.ticket.validateFreeActionTickets([rawAttack(FX.WANG_ZHE, '挥刀砍向王哲')], '我挥刀砍向王哲', save);
  assert.equal(named.tickets.length, 0);
  assert.equal(named.refusals.length, 1, '王哲不在场：照旧给「未发生」');
  const absent = FX.mods.ticket.validateFreeActionTickets([rawAttack('liuchao.character.su_daji', '挥刀砍向苏妲己')], '我挥刀砍向苏妲己', save);
  assert.deepEqual([absent.tickets.length, absent.discards[0]?.reason], [0, 'target_not_present'], '角色总表里的个人（本存档无关系档）不在场：照旧拒');
  const grab = FX.mods.ticket.validateFreeActionTickets([{ ...rawAttack(null), variant: 'grab', evidence: '扑上去按住那头豹子' }], '我扑上去按住那头豹子', save);
  assert.equal(grab.tickets.length, 0, '不在 unlistedFoe.variants 里的变体照旧拒');
  assert.match(JSON.stringify(FX.mods.ticket.ticketPromptSection(save).payload.classes), /无名来敌（不在roster）也出票，targetId填null/);
  assert.deepEqual(FX.mods.config.validateFreeActionConfig(), []);
});

test('2 自由交手失手扣血（统一写回、记 LCQ-SAV-056），一路打到 0 判负：判负首行、拉回 afterLossContinueHp；成功档不扣', async () => {
  await resetLogState();
  const hp = GAME_NUMBERS.combat.woundRules.hp, ratio = GAME_NUMBERS.freeAction.aftermath.hpLoss.ratio;
  const save = FX.makeSave({ present: [] });
  save.角色.属性.气血 = { 当前: 35, 上限: 100 };
  const win = FX.runJudged(save, foeTicket(), 'success');
  assert.equal(win.prepared.kind, 'issued');
  assert.match(win.prepared.proposal.actionText, /对来敌施行「攻击」/);
  assert.equal(win.result.ok, true);
  assert.equal(save.角色.属性.气血.当前, 35, '成功档不扣（hpLoss.ratio 没有成功档）');
  const seen = [35];
  let last;
  for (let i = 0; i < 10 && save.角色.属性.气血.当前 > hp.afterLossContinueHp; i++) {
    FX.advanceTurn(save);
    last = FX.runJudged(save, foeTicket(), 'failure');
    assert.equal(last.result.ok, true);
    seen.push(save.角色.属性.气血.当前);
  }
  assert.deepEqual(seen.slice(0, 3), [35, 35 - Math.round(100 * ratio.failure), 35 - 2 * Math.round(100 * ratio.failure)]);
  assert.equal(save.角色.属性.气血.当前, hp.afterLossContinueHp, '打到 ≤ combatDownedAt 判负后拉回');
  assert.ok(last.result.facts.some(line => /败/.test(line)), last.result.facts.join('|'));
  assert.equal(save.系统.扩展.combatHeadline, WB.combatLoseHeadline(), '判负首行待写进本回合正文');
  assert.match(WB.finishCombatNarrative(save, '豹子扑倒了你。'), new RegExp('^' + WB.combatLoseHeadline()));
  const wb = (await logStore.all()).filter(entry => entry.code === 'LCQ-SAV-056');
  assert.ok(wb.length >= 3, `combat.writeback 记了 ${wb.length} 条`);
  assert.deepEqual([wb.at(-1).detail.source, wb.at(-1).detail.downed], ['freeAction', true]);
  // 不写任何人的好感与记忆
  assert.equal(FX.runtimeOf(save).pendingLineAffinityGrants, undefined);
});

// ───────────── 3) P2 启程／主线按钮闲置不点没有任何提示（唐线进线前_13 连续 4 回合） ─────────────
// 根因：那一拍的按钮「行动 · 前往宣平坊宅院赴宴」是本拍主线动作（playerCompletionContract），不是本关收束后的启程按钮；
// 闲置提示只做了启程（noteStageDepartureIdleTurn 只认 getStageDepartureOffer），主线按钮空转没有任何提示。
// 修：noteBeatActionIdleTurn——本拍主线按钮在场、本拍没推进，空转满 story.beatProgress.actionIdleTurns 回合弹 actionIdleNotice，只提示、不代结算；
// 启程按钮在场时仍只由启程提示管。回合数与文字都在 mod-kit。
const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const init = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const cp = await loadTs('../src/modules/contentPacks/index.ts');
const ec = await loadTs('../src/modules/scenarioMods/entityCatalog.ts');
const cr = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
const BP = await loadTs('../src/modules/scenarioMods/beatProgress.ts');
const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
const quiet = fn => { const log = console.log, info = console.info, warn = console.warn; console.log = console.info = console.warn = () => {}; try { return fn(); } finally { Object.assign(console, { log, info, warn }); } };
const stage01 = () => {
  const mod = ec.resolveScenarioContent(cp.applyContentPackOverlays(JSON.parse(read('src/modules/scenarioMods/builtins/data/lcq.stage_01.json'))));
  cr.resolveScenarioCharacters(mod.canon?.characters, mod.manifest.id);
  return quiet(() => R.advanceScenarioRuntime(init.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), init.buildStrictScenarioInitialization(mod))).saveData);
};
const idleTurn = save => {
  save.世界.状态.剧本模组.worldTurn++;
  save.系统.历史.叙事.push({ type: 'gm', content: '你在原地歇息片刻，整理思绪。' });
  save = quiet(() => R.advanceScenarioRuntime(save).saveData);
  return { save, notice: BP.noteBeatActionIdleTurn(save), departure: BP.noteStageDepartureIdleTurn(save) };
};

test('3 主线按钮空转 N 回合（N 读 mod-kit）只提示一次、提示后重新计数；拍不推进、不自动结算；推进后计数作废', () => {
  const cfg = GAME_NUMBERS.story.beatProgress, N = cfg.actionIdleTurns;
  assert.ok(N > 0);
  assert.match(cfg.actionIdleNotice, /\{label\}/);
  assert.deepEqual(JSON.parse(read('mod-kit/game-numbers.qingyu.json')).story.beatProgress.actionIdleNotice, cfg.actionIdleNotice);
  let save = stage01();
  const beat = R.getCurrentStoryEventActions(save)[0];
  assert.ok(beat, 's01_01 有主线按钮');
  const notices = [];
  for (let i = 0; i < 2 * N + 2; i++) { const out = idleTurn(save); save = out.save; notices.push(out.notice); assert.equal(out.departure, undefined); }
  const at = notices.map((n, i) => n ? i : -1).filter(i => i >= 0);
  // 第一回合看到按钮记 0，再空转 N 回合提示一次；提示后重新计数。
  assert.deepEqual(at, [N, 2 * N], JSON.stringify(notices));
  assert.equal(notices[N], cfg.actionIdleNotice.replace('{label}', beat.label));
  assert.equal(R.getCurrentStoryEventActions(save)[0]?.eventId, beat.eventId, '只提示，拍没被代结算');
  // 点了按钮推进到下一拍：计数从 0 重来
  quiet(() => R.recordStoryEventStructuredAction(save, R.getCurrentStoryEventActions(save)[0]));
  save = idleTurn(save).save;
  const next = R.getCurrentStoryEventActions(save)[0];
  if (next && next.eventId !== beat.eventId) assert.equal(save.系统.扩展.beatActionIdle?.turns ?? 0, 0);
  const panel = read('src/components/dashboard/MainGamePanel.vue');
  assert.match(panel, /const idleActionNotice = idleSave \? noteBeatActionIdleTurn\(idleSave\) : undefined;\s*idleDepartureNotice \|\|= idleActionNotice;/);
});
