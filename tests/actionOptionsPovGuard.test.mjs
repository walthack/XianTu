import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const modPromise = loadTs('../src/utils/actionOptionsPovGuard.ts');

test('#14 含主角名的同伴视角选项被拒收', async () => {
  const { filterActionOptionsByPov } = await modPromise;
  const { kept, dropped } = filterActionOptionsByPov(
    [
      '跟上程宗扬前往上林苑，途中询问他对洛阳局势的判断',
      '提醒程宗扬：霍子孟与剑玉姬可能有暗中勾连',
      '前往北寺狱会见中行说',
      '与霍子孟深入密谈，摸清他的底线',
    ],
    '程宗扬',
  );
  assert.deepEqual(kept, ['前往北寺狱会见中行说', '与霍子孟深入密谈，摸清他的底线']);
  assert.equal(dropped.length, 2);
});

test('主角视角选项全保留', async () => {
  const { filterActionOptionsByPov } = await modPromise;
  const opts = ['前往藏经阁查阅典籍', '向师兄打听宗门近况', '在此处闭关修炼'];
  const { kept, dropped } = filterActionOptionsByPov(opts, '程宗扬');
  assert.deepEqual(kept, opts);
  assert.deepEqual(dropped, []);
});

test('主角名过短或缺失时不过滤(防误伤)', async () => {
  const { filterActionOptionsByPov } = await modPromise;
  const opts = ['云游四方', '闭关'];
  assert.deepEqual(filterActionOptionsByPov(opts, '').kept, opts);
  assert.deepEqual(filterActionOptionsByPov(opts, '云').kept, opts);
});
