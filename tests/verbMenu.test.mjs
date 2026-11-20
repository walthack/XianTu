// 新界面（?ui=new）右列三个动词键：把这一手能做的事归到「察看／交谈／行动」下的纯函数。
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './loadTs.mjs';

const { verbOfText, stripVerbPrefix, groupVerbItems, sceneStandingLines, VERB_KEYS } = await loadTs('../src/components/uiNew/verbMenu.ts');

test('四个键：察看、交谈、行动、前往', () => {
  assert.deepEqual(VERB_KEYS.map(v => v.label), ['察看', '交谈', '行动', '前往']);
});

test('没有 verb 字段的句子按开头归类，认不出的归行动', () => {
  assert.equal(verbOfText('找掩体观察四周'), 'look');
  assert.equal(verbOfText('先确认段强还在身边'), 'look');
  assert.equal(verbOfText('弄清这片草原是哪里'), 'look');
  assert.equal(verbOfText('向师兄打听宗门近况'), 'talk');
  assert.equal(verbOfText('我悄悄问她要什么'), 'talk');
  assert.equal(verbOfText('在此处闭关修炼'), 'act');
  assert.equal(verbOfText('前往藏经阁查阅典籍'), 'go');
  assert.equal(verbOfText('回头看一眼'), 'look');
  assert.equal(verbOfText(''), 'act');
});

test('剧本动作按钮去掉开头重复的动词', () => {
  assert.equal(stripVerbPrefix('行动 · 航班上异变突起'), '航班上异变突起');
  assert.equal(stripVerbPrefix('交谈 · 月霜 · 问她来意'), '月霜 · 问她来意');
  assert.equal(stripVerbPrefix('挺直腰板谈成买卖'), '挺直腰板谈成买卖');
});

test('剧本动作按 interaction.verb 归键，建议按字面归键，不带来源标签', () => {
  const engine = [
    { label: '行动 · 稳住自己', actionText: '稳住自己', playerLine: '我稳住自己', interaction: { verb: 'act' } },
    { label: '观察 · 营地', actionText: '察看营地', playerLine: '我察看营地', interaction: { verb: 'observe' } },
    { label: '交谈 · 段强', actionText: '问段强', playerLine: '我问段强', interaction: { verb: 'talk' } },
    { label: '前往 · 帅帐', actionText: '去帅帐', playerLine: '我去帅帐', interaction: { verb: 'move' } },
    { label: '向碧鲮人打听霓龙丝', actionText: '向碧鲮人打听霓龙丝' },
  ];
  const groups = groupVerbItems(engine, ['找掩体观察四周', '在此处调息', '我察看营地', '', '在此处调息']);
  assert.deepEqual(groups.look.map(i => i.label).sort(), ['找掩体观察四周', '营地'].sort());
  assert.deepEqual(groups.talk.map(i => i.label).sort(), ['向碧鲮人打听霓龙丝', '段强'].sort());
  assert.deepEqual(groups.act.map(i => i.label).sort(), ['在此处调息', '稳住自己'].sort());
  assert.deepEqual(groups.go.map(i => i.label), ['帅帐']);
  // 与剧本动作原句相同的建议不重复列；空串、重复建议去掉
  assert.equal(groups.look.filter(i => i.label === '我察看营地').length, 0);
  assert.equal(groups.look.find(i => i.label === '营地').engine, engine[1]);
  assert.equal(groups.act.find(i => i.label === '在此处调息').engine, undefined);
});

test('同一批内容换个传入顺序，键下的排法不变', () => {
  const a = { label: '行动 · 甲', interaction: { verb: 'act' } }, b = { label: '行动 · 乙', interaction: { verb: 'act' } };
  const one = groupVerbItems([a, b], ['丙丁', '戊己']).act.map(i => i.label);
  const two = groupVerbItems([b, a], ['戊己', '丙丁']).act.map(i => i.label);
  assert.deepEqual(one, two);
});

test('察看、交谈下常驻当前场景的几条：看看四周、在场的每个人', () => {
  assert.deepEqual(sceneStandingLines(['月霜', '', '月霜', '王哲']), { look: ['看看四周', '打量月霜', '打量王哲'], talk: ['找月霜说话', '找王哲说话'] });
  assert.deepEqual(sceneStandingLines([]), { look: ['看看四周'], talk: [] });
  const groups = groupVerbItems([], ['看看四周'], sceneStandingLines(['月霜']));
  assert.deepEqual(groups.look.map(i => i.label).sort(), ['打量月霜', '看看四周']);
  assert.deepEqual(groups.talk.map(i => i.label), ['找月霜说话']);
  assert.deepEqual(groups.act, []);
});

test('剧本里的赶路动作（verb 为 move）归到「前往」，不混在行动里', () => {
  const groups = groupVerbItems([{ label: '东北 · 约三日', actionText: '前往五原城', interaction: { verb: 'move' } }, { label: '行动 · 包扎伤口', interaction: { verb: 'act' } }], []);
  assert.deepEqual(groups.go.map(i => i.label), ['东北 · 约三日']);
  assert.deepEqual(groups.act.map(i => i.label), ['包扎伤口']);
});
