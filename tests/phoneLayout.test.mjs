// 新界面窄屏摆法（?ui=new 且窗口 <1024）的纯函数：字框每段字数随宽度变、底行时间缩写。
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './loadTs.mjs';

const { segmentMaxLenForWidth, shortGameTime } = await loadTs('../src/components/uiNew/phoneLayout.ts');
const { SEGMENT_MAX_LEN } = await loadTs('../src/utils/narrativeSegments.ts');

test('电脑宽（≥1024）每段上限不变', () => {
  assert.equal(segmentMaxLenForWidth(1024), SEGMENT_MAX_LEN);
  assert.equal(segmentMaxLenForWidth(1440), SEGMENT_MAX_LEN);
  assert.equal(segmentMaxLenForWidth(Number.NaN), SEGMENT_MAX_LEN);
});

test('手机宽每段约 85 字，随宽度变，有上下限', () => {
  assert.equal(segmentMaxLenForWidth(390), 85);
  assert.ok(segmentMaxLenForWidth(430) > 85 && segmentMaxLenForWidth(430) < 100);
  assert.equal(segmentMaxLenForWidth(200), 60);
  assert.ok(segmentMaxLenForWidth(768) <= SEGMENT_MAX_LEN);
  assert.ok(segmentMaxLenForWidth(1023) <= SEGMENT_MAX_LEN);
});

test('底行时间：带日期的只留时分，其余原样', () => {
  assert.equal(shortGameTime('仙道200年1月1日 08:15'), '08:15');
  assert.equal(shortGameTime('今日 08:15'), '今日 08:15');
  assert.equal(shortGameTime(''), '');
});
