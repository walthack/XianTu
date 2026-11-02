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
