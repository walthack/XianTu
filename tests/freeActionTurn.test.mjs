// 一个回合里自由行动的编排（界面 MainGamePanel 只调 turn.ts 的两步）：签发 → 确认 → 回执取票结算；重试幂等；多票取舍。
import assert from 'node:assert/strict';
import test from 'node:test';
import { DUAN_QIANG, NING_YU, WANG_ZHE, makeSave, mods, profileOf, runtimeOf, ticket } from './freeActionFixture.mjs';

const { issueFreeActionJudgement, settleFreeActionTurn } = mods.turn;
const { resolvePendingJudgement, getJudgementState } = mods.judgement;

test('判定类：发送前签发待确认判定 → 玩家确认 → 备份后按回执结算出事实块；重试（同一判定）不再写', () => {
  const save = makeSave({ present: [WANG_ZHE], favor: { [WANG_ZHE]: 55 } });
  const issue = issueFreeActionJudgement(save, [ticket('physical', 'attack', WANG_ZHE)]);
  assert.ok(issue.issued);
  assert.equal(getJudgementState(save).pending.id, issue.issued.id);
  assert.equal(profileOf(save, WANG_ZHE).好感度, 55, '确认前不写任何东西');
  const resolution = resolvePendingJudgement(save, issue.issued.id, { currentTurn: 1, testOutcome: 'success' });
  const settled = settleFreeActionTurn(save, [], resolution);
  assert.equal(settled.changed, true);
  assert.match(settled.block, /【本地自由行动已结算】/);
  assert.equal(profileOf(save, WANG_ZHE).好感度, 45);
  const memories = profileOf(save, WANG_ZHE).记忆.length;
  const again = settleFreeActionTurn(save, [], resolution);
  assert.equal(again.changed, false);
  assert.equal(again.block, settled.block, '重试给同样的事实');
  assert.equal(profileOf(save, WANG_ZHE).记忆.length, memories);
  assert.equal(profileOf(save, WANG_ZHE).好感度, 45);
});

test('不掷骰的类（亲近/给予）：不签发判定，备份后当场结算；判定与不掷骰的票同回合时先发判定、不留半截结算', () => {
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: -10, [DUAN_QIANG]: 50 } });
  const kiss = ticket('intimate', 'kiss', NING_YU), taunt = ticket('verbal', 'taunt', DUAN_QIANG);
  const issue = issueFreeActionJudgement(save, [kiss, taunt]);
  assert.ok(issue.issued, '判定类的票先发');
  assert.equal(profileOf(save, NING_YU).好感度, -10, '不掷骰的票这回合没有结算（放弃，不留半截）');
  const solo = makeSave({ present: [NING_YU], favor: { [NING_YU]: -10 } });
  const noJudge = issueFreeActionJudgement(solo, [kiss]);
  assert.equal(noJudge.issued, undefined);
  const settled = settleFreeActionTurn(solo, [kiss], undefined);
  assert.equal(settled.changed, true);
  assert.equal(profileOf(solo, NING_YU).好感度, -25);
  assert.match(settled.block, /本地自由行动已结算/);
});

test('闸门不过：签发阶段给出“未发生”事实块，零写入；结算阶段同样不写', () => {
  const save = makeSave({ present: [NING_YU], favor: { [NING_YU]: 60 }, chapter: 40, realm: '无修为' });
  const before = structuredClone(save);
  const issue = issueFreeActionJudgement(save, [ticket('cast', 'transfer_qi', NING_YU)]);
  assert.equal(issue.issued, undefined);
  assert.match(issue.refusalBlock, /本地自由行动未发生/);
  assert.deepEqual(save, before);
  const gift = settleFreeActionTurn(save, [ticket('give', 'gift', NING_YU, { itemId: 'no.such.item' })], undefined);
  assert.equal(gift.changed, false);
  assert.match(gift.block, /本地自由行动未发生/);
  assert.deepEqual(save, before);
});

test('伪造/被篡改的回执：不结算，不出事实块', () => {
  const save = makeSave({ present: [WANG_ZHE], favor: { [WANG_ZHE]: 55 } });
  const issue = issueFreeActionJudgement(save, [ticket('physical', 'attack', WANG_ZHE)]);
  const resolution = resolvePendingJudgement(save, issue.issued.id, { currentTurn: 1, testOutcome: 'success' });
  const forged = structuredClone(resolution);
  forged.authorityReceipt.variant = 'grab';
  const settled = settleFreeActionTurn(save, [], forged);
  assert.deepEqual([settled.changed, settled.block], [false, '']);
  assert.equal(profileOf(save, WANG_ZHE).好感度, 55);
  assert.equal(runtimeOf(save).freeAction, undefined, '没有写自由行动账');
});

test('取消待确认判定：无骰无后果', () => {
  const save = makeSave({ present: [WANG_ZHE], favor: { [WANG_ZHE]: 55 } });
  const issue = issueFreeActionJudgement(save, [ticket('physical', 'attack', WANG_ZHE)]);
  const cancelled = mods.judgement.cancelPendingJudgement(save, issue.issued.id, 1);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(settleFreeActionTurn(save, [], cancelled).changed, false);
  assert.equal(profileOf(save, WANG_ZHE).好感度, 55);
});
