// 新界面立绘区「主要角色」定法（一手最多换一次）：a / b / c / keep / d / 定不出时空着 / 无人在场，以及剪影按性别选。
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './loadTs.mjs';

const { pickLeadCharacter, speakersInOrder, silhouetteKindFor } = await loadTs('../src/components/uiNew/leadCharacter.ts');

const base = { eventId: 'e1', presentNames: [], eventCharacterNames: [], narrativeText: '', playerName: '我', previous: null };
const pick = (over) => pickLeadCharacter({ ...base, ...over });

test('在场为空（或只有主角）→ 没有', () => {
  assert.equal(pick({ presentNames: [], previous: { eventId: 'e1', name: '凝羽', rule: 'a' } }), null);
  assert.equal(pick({ presentNames: ['我'], eventCharacterNames: ['凝羽'], narrativeText: '〈凝羽〉“在。”' }), null);
});

test('a. 在场（不算主角）只有一个 → 就是他', () => {
  assert.deepEqual(pick({ presentNames: ['我', '凝羽'] }), { eventId: 'e1', name: '凝羽', rule: 'a' });
  const r = pick({ presentNames: ['谢艺'], previous: { eventId: 'e1', name: '凝羽', rule: 'a' } });
  assert.deepEqual(r, { eventId: 'e1', name: '谢艺', rule: 'a' });
});

test('b. 事件牵涉的人（不算主角）只有一个且在场 → 就是他，不跟说话人换', () => {
  const r = pick({ presentNames: ['凝羽', '谢艺'], eventCharacterNames: ['我', '谢艺'], narrativeText: '〈凝羽〉“嗯。”〈凝羽〉“走。”' });
  assert.deepEqual(r, { eventId: 'e1', name: '谢艺', rule: 'b' });
});

test('c. 这一手说话句数最多的在场的人；不在场的说话人和主角不算', () => {
  const r = pick({ presentNames: ['凝羽', '谢艺'], narrativeText: '〈我〉“谁？”〈我〉“说。”〈段强〉“我。”〈段强〉“是我。”〈凝羽〉“好。”〈谢艺〉“别动。”〈谢艺〉“走。”' });
  assert.deepEqual(r, { eventId: 'e1', name: '谢艺', rule: 'c' });
});

test('c. 上一次的人还在场但这一手别人说得多 → 换人（一手换一次）', () => {
  const r = pick({
    presentNames: ['凝羽', '谢艺'], narrativeText: '〈凝羽〉“嗯。”〈谢艺〉“走。”〈谢艺〉“快。”',
    previous: { eventId: 'e1', name: '凝羽', rule: 'c' },
  });
  assert.deepEqual(r, { eventId: 'e1', name: '谢艺', rule: 'c' });
});

test('c. 来回对话句数并列：上一次的人在并列里 → 不换；不在 → 取先开口的', () => {
  const text = '〈谢艺〉“走。”〈凝羽〉“不。”〈谢艺〉“走！”〈凝羽〉“不。”';
  const kept = pick({ presentNames: ['凝羽', '谢艺', '段强'], narrativeText: text, previous: { eventId: 'e1', name: '凝羽', rule: 'c' } });
  assert.deepEqual(kept, { eventId: 'e1', name: '凝羽', rule: 'c' });
  const first = pick({ presentNames: ['凝羽', '谢艺', '段强'], narrativeText: text, previous: { eventId: 'e1', name: '段强', rule: 'c' } });
  assert.deepEqual(first, { eventId: 'e1', name: '谢艺', rule: 'c' });
});

test('keep／d. 这一手没有在场的人说话 → 沿用上一次的（还在场）', () => {
  const same = pick({ presentNames: ['凝羽', '谢艺'], narrativeText: '风停了。', previous: { eventId: 'e1', name: '谢艺', rule: 'c' } });
  assert.deepEqual(same, { eventId: 'e1', name: '谢艺', rule: 'keep' });
  const moved = pick({ presentNames: ['凝羽', '谢艺'], previous: { eventId: 'e0', name: '谢艺', rule: 'a' } });
  assert.deepEqual(moved, { eventId: 'e1', name: '谢艺', rule: 'd' });
});

test('e. 都定不了 → 没有（先空着）', () => {
  assert.equal(pick({ presentNames: ['我', '凝羽', '谢艺'] }), null);
  assert.equal(pick({ presentNames: ['凝羽', '谢艺'], eventCharacterNames: ['凝羽', '谢艺'] }), null);
  assert.equal(pick({ presentNames: ['谢艺', '段强'], previous: { eventId: 'e0', name: '凝羽', rule: 'a' } }), null);
});

test('同一份输入反复算（界面会重算）结果不变', () => {
  const input = { presentNames: ['凝羽', '谢艺'], narrativeText: '〈谢艺〉“走。”〈凝羽〉“不。”' };
  const first = pick(input);
  assert.deepEqual(pick({ ...input, previous: first }), first);
});

test('说话人按先后去重；写坏的记号不算', () => {
  assert.deepEqual(speakersInOrder('〈甲〉“一”〈乙〉“二”〈甲〉“三”〈丙〉没引号'), ['甲', '乙']);
});

test('剪影按性别选：男／女／其余都是不分性别', () => {
  assert.equal(silhouetteKindFor('男'), 'male');
  assert.equal(silhouetteKindFor('女'), 'female');
  for (const g of ['无', '未知', '男|女|未知', '', undefined]) assert.equal(silhouetteKindFor(g), 'neutral');
});
