// 新界面背包页的纯函数：字徽取字、能做的事（同老面板按钮条件）、分类牌子、空背包提示。
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './loadTs.mjs';

const { itemGlyph, itemActions, categoryTabs, emptyInventoryText } = await loadTs('../src/components/uiNew/inventoryView.ts');

test('字徽：取最后一个汉字，去掉末尾的子／儿', () => {
  assert.equal(itemGlyph('金创药'), '药');
  assert.equal(itemGlyph('火折子'), '折');
  assert.equal(itemGlyph('竹筒'), '筒');
  assert.equal(itemGlyph('锦囊'), '囊');
  assert.equal(itemGlyph('珠子'), '珠');
  assert.equal(itemGlyph('子'), '子');
  assert.equal(itemGlyph('《九阳神功》'), '功');
  assert.equal(itemGlyph('Key'), 'K');
  assert.equal(itemGlyph(''), '?');
});

const idle = { equipped: false, cultivating: false, equipBusy: false, cultivateBusy: false };
const labels = (a) => a.map(x => `${x.label}${x.disabled ? '(禁)' : ''}`);

test('能做的事：装备 → 装备/卸下＋丢弃，忙时禁用', () => {
  assert.deepEqual(labels(itemActions('装备', idle)), ['装备', '丢弃']);
  assert.deepEqual(labels(itemActions('装备', { ...idle, equipped: true, equipBusy: true })), ['卸下(禁)', '丢弃']);
});

test('能做的事：功法 → 修炼/停止修炼＋丢弃，忙时禁用', () => {
  assert.deepEqual(labels(itemActions('功法', idle)), ['修炼', '丢弃']);
  assert.deepEqual(labels(itemActions('功法', { ...idle, cultivating: true, cultivateBusy: true })), ['停止修炼(禁)', '丢弃']);
});

test('能做的事：丹药/材料/其他（含剧情物品）→ 使用＋丢弃，和老面板一样不加限制', () => {
  for (const type of ['丹药', '材料', '其他']) assert.deepEqual(labels(itemActions(type, idle)), ['使用', '丢弃']);
  assert.deepEqual(itemActions('丹药', idle).map(a => a.key), ['use', 'discard']);
});

test('分类牌子：全部＋传进来的分类，不多不少', () => {
  assert.deepEqual(categoryTabs(['装备', '功法', '丹药', '材料', '其他']).map(t => t.id), ['all', '装备', '功法', '丹药', '材料', '其他']);
  assert.equal(categoryTabs([])[0].label, '全部');
});

test('空背包提示同老面板分支', () => {
  assert.deepEqual(emptyInventoryText('all'), { key: '空空如也', tip: '' });
  assert.equal(emptyInventoryText('装备').key, '暂无装备');
  assert.equal(emptyInventoryText('其他').key, '暂无其他物品');
  assert.deepEqual(emptyInventoryText('丹药'), { key: '暂无{0}', arg: '丹药', tip: '可以试试搜索其他分类' });
});
