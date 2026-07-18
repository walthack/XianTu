import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const modPromise = loadTs('../src/utils/modelCommandPipeline.ts');
const SAVE = { 元数据: { 时间: { 年: 220, 月: 1, 日: 1, 小时: 8, 分钟: 0 } } };

test('时间只进不退:set 年份倒退被拒', async () => {
  const { validateModelCommandPipeline } = await modPromise;
  const res = await validateModelCommandPipeline([
    { action: 'set', key: '元数据.时间.年', value: 200 },
  ], SAVE);
  assert.equal(res.validCommands.length, 0);
  assert.ok(res.rejectedCommands[0].errors[0].includes('只进不退'));
});

test('时间只进不退:整对象 set 携带倒退年份同拦', async () => {
  const { validateModelCommandPipeline } = await modPromise;
  const res = await validateModelCommandPipeline([
    { action: 'set', key: '元数据.时间', value: { 年: 200, 月: 10, 日: 15 } },
  ], SAVE);
  assert.equal(res.validCommands.length, 0);
});

test('正常推进与闭关跳年放行', async () => {
  const { validateModelCommandPipeline } = await modPromise;
  const res = await validateModelCommandPipeline([
    { action: 'add', key: '元数据.时间.分钟', value: 30 },
    { action: 'set', key: '元数据.时间.年', value: 221 },
    { action: 'add', key: '元数据.时间.年', value: 10 },
  ], SAVE);
  assert.equal(res.validCommands.length, 3, JSON.stringify(res.rejectedCommands));
});

test('主角出生日期禁改', async () => {
  const { validateModelCommandPipeline } = await modPromise;
  const res = await validateModelCommandPipeline([
    { action: 'set', key: '角色.身份.出生日期', value: { 年: 180, 月: 10, 日: 15 } },
  ], SAVE);
  assert.equal(res.validCommands.length, 0);
  assert.ok(JSON.stringify(res.rejectedCommands).includes('纪元基点'));
});
