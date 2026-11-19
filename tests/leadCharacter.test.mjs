// 新界面立绘区「主要角色」定法（临时规则，用户未定）：keep / a / b / c / d / 无人在场，以及剪影按性别选。
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './loadTs.mjs';

const { pickLeadCharacter, speakersInOrder, silhouetteKindFor } = await loadTs('../src/components/uiNew/leadCharacter.ts');

const base = { eventId: 'e1', presentNames: [], eventCharacterNames: [], narrativeText: '', playerName: '我', previous: null };
const pick = (over) => pickLeadCharacter({ ...base, ...over });

test('1. 事件没变、上一次的还在场 → 不换（即使别人先说话）', () => {
  const r = pick({
    presentNames: ['凝羽', '谢艺'], narrativeText: '〈谢艺〉“走。”',
    previous: { eventId: 'e1', name: '凝羽', rule: 'c' },
  });
  assert.deepEqual(r, { eventId: 'e1', name: '凝羽', rule: 'keep' });
});

test('1. 事件没变但上一次的不在场 → 重新定', () => {
  const r = pick({ presentNames: ['谢艺'], previous: { eventId: 'e1', name: '凝羽', rule: 'a' } });
  assert.deepEqual(r, { eventId: 'e1', name: '谢艺', rule: 'a' });
});

test('2a. 在场（不算主角）只有一个 → 就是他', () => {
  assert.deepEqual(pick({ presentNames: ['我', '凝羽'] }), { eventId: 'e1', name: '凝羽', rule: 'a' });
});

test('2b. 事件牵涉的人（不算主角）只有一个且在场 → 就是他，优先于说话人', () => {
  const r = pick({ presentNames: ['凝羽', '谢艺'], eventCharacterNames: ['我', '谢艺'], narrativeText: '〈凝羽〉“嗯。”' });
  assert.deepEqual(r, { eventId: 'e1', name: '谢艺', rule: 'b' });
});

test('2b 不成立（牵涉的人不在场／不止一个／取不到）→ 往下走', () => {
  assert.equal(pick({ presentNames: ['凝羽', '谢艺'], eventCharacterNames: ['段强'] }), null);
  assert.equal(pick({ presentNames: ['凝羽', '谢艺'], eventCharacterNames: ['凝羽', '谢艺'] }), null);
  assert.equal(pick({ presentNames: ['凝羽', '谢艺'] }), null);
});

test('2c. 第一个说话的、在场的人；不在场的说话人和主角跳过', () => {
  const r = pick({ presentNames: ['凝羽', '谢艺'], narrativeText: '〈我〉“谁？”〈段强〉“我。”他走开。〈谢艺〉“别动。”〈凝羽〉“好。”' });
  assert.deepEqual(r, { eventId: 'e1', name: '谢艺', rule: 'c' });
});

test('2d. 换了事件、定不了 → 沿用上一次的（还在场）；不在场 → 没有', () => {
  const prev = { eventId: 'e0', name: '凝羽', rule: 'a' };
  assert.deepEqual(pick({ presentNames: ['凝羽', '谢艺'], previous: prev }), { eventId: 'e1', name: '凝羽', rule: 'd' });
  assert.equal(pick({ presentNames: ['谢艺', '段强'], previous: prev }), null);
});

test('3. 在场为空（或只有主角）→ 没有', () => {
  assert.equal(pick({ presentNames: [], previous: { eventId: 'e1', name: '凝羽', rule: 'a' } }), null);
  assert.equal(pick({ presentNames: ['我'], eventCharacterNames: ['凝羽'], narrativeText: '〈凝羽〉“在。”' }), null);
});

test('说话人按先后去重；写坏的记号不算', () => {
  assert.deepEqual(speakersInOrder('〈甲〉“一”〈乙〉“二”〈甲〉“三”〈丙〉没引号'), ['甲', '乙']);
});

test('剪影按性别选：男／女／其余都是不分性别', () => {
  assert.equal(silhouetteKindFor('男'), 'male');
  assert.equal(silhouetteKindFor('女'), 'female');
  for (const g of ['无', '未知', '男|女|未知', '', undefined]) assert.equal(silhouetteKindFor(g), 'neutral');
});
