// 票校验的细节：真机（MiniMax-M2.7-highspeed）暴露的模型习惯——把“空”写成字符串 "null"、同一句里对同一人报多张票。
import assert from 'node:assert/strict';
import test from 'node:test';
import { DUAN_QIANG, WANG_ZHE, makeSave, mods } from './freeActionFixture.mjs';

const validate = (raw, text, save = makeSave({ present: [WANG_ZHE] })) => mods.ticket.validateFreeActionTickets(raw, text, save);
const t = (variant, targetId, evidence, extra = {}) => ({ actionClass: variant === 'attack' || variant === 'grab' ? 'physical' : 'verbal', variant, targetId, degree: 'normal', performed: 'yes', evidence, itemId: null, ...extra });

test('空值写成字符串 "null" / "" 按空处理（真机见过 itemId:"null"）；名单外目标仍不收票', () => {
  const text = '我拔刀，一刀砍向王哲！';
  assert.equal(validate([t('attack', WANG_ZHE, '一刀砍向王哲', { itemId: 'null' })], text).tickets.length, 1);
  assert.equal(validate([t('attack', WANG_ZHE, '一刀砍向王哲', { itemId: '' })], text).tickets[0].itemId, null);
  assert.equal(validate([t('attack', 'null', '一刀砍向王哲')], text).discards[0].reason, 'target_not_present');
  const stray = validate([t('attack', WANG_ZHE, '一刀砍向王哲', { itemId: 'lcq.item.not_mine' })], text);
  assert.equal(stray.tickets.length, 1, '不需要物品的变体带了名单外 itemId：置空，票照收');
  assert.equal(stray.tickets[0].itemId, null);
  assert.deepEqual(stray.discards, []);
});

test('同一人被报几张票：留分量最重的（好感基础点绝对值最大），与报的先后无关；其余记 duplicate_target', () => {
  const text = '我先嘲讽王哲，再拔刀砍他';
  const a = validate([t('taunt', WANG_ZHE, '嘲讽王哲'), t('attack', WANG_ZHE, '拔刀砍他')], text);
  assert.deepEqual(a.tickets.map(x => x.variant), ['attack']);
  assert.deepEqual(a.discards.map(x => x.reason), ['duplicate_target']);
  const b = validate([t('attack', WANG_ZHE, '拔刀砍他'), t('taunt', WANG_ZHE, '嘲讽王哲')], text);
  assert.deepEqual(b.tickets.map(x => x.variant), ['attack']);
  const tie = validate([t('taunt', WANG_ZHE, '嘲讽王哲'), t('taunt', WANG_ZHE, '嘲讽')], text);
  assert.equal(tie.tickets.length, 1);
});

test('同一句里对两个人动手：各一张票（每个目标至多一张）', () => {
  const save = makeSave({ present: [WANG_ZHE] });
  const out = validate([t('attack', WANG_ZHE, '对着王哲挥砍'), t('attack', DUAN_QIANG, '段强同时挥砍')], '我拿起剑，对着王哲和段强同时挥砍', save);
  assert.equal(out.tickets.length, 1, '“对着王哲挥砍”不是原话里的连续片段：证据对不上的那张作废');
  assert.equal(out.discards[0].reason, 'bad_evidence');
  const ok = validate([t('attack', WANG_ZHE, '对着王哲和段强同时挥砍'), t('attack', DUAN_QIANG, '对着王哲和段强同时挥砍')], '我拿起剑，对着王哲和段强同时挥砍', save);
  assert.deepEqual(ok.tickets.map(x => x.targetId).sort(), [DUAN_QIANG, WANG_ZHE].sort());
});

test('提示词要求证据逐字摘自原话、不拼接；喂药变体的标签点明“下毒”（真机把“下毒”误报成欺骗）', () => {
  const { system, payload } = mods.ticket.ticketPromptSection(makeSave({ present: [WANG_ZHE] }));
  assert.match(system, /逐字摘自玩家原话/);
  const give = payload.classes.find(c => c.actionClass === 'give');
  assert.ok(give.variants.some(v => v.variant === 'feed_pill' && v.label.includes('下毒')));
});
