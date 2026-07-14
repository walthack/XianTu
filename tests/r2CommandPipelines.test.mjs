import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const modelPipelinePromise = loadTs('../src/utils/modelCommandPipeline.ts');
const repairPromise = loadTs('../src/utils/repairCommandPipeline.ts');

function scenarioSave() {
  return {
    角色: { 属性: { 声望: 0 } },
    世界: { 状态: { 剧本模组: { modId: 'lcq.stage_06', flags: {}, events: [], canon: { characters: [] } } } },
  };
}

test('skeleton 共用模型命令管线：runtime 写入被拒，合规命令清洗后保留', async () => {
  const { validateModelCommandPipeline } = await modelPipelinePromise;
  const result = await validateModelCommandPipeline([
    { action: 'set', key: '世界.状态.剧本模组.steeringCooldown', value: 9, injected: 'drop-me' },
    { action: 'set', key: '角色.属性.声望', value: 9, injected: 'drop-me' },
  ], scenarioSave());

  assert.equal(result.validCommands.length, 1);
  assert.deepEqual(result.validCommands[0], { action: 'set', key: '角色.属性.声望', value: 9 });
  assert.equal(result.rejectedCommands.length, 1);
  assert.match(result.rejectedCommands[0].errors.join('；'), /剧本|禁止|只读/);
});

test('AI 存档修复执行通路：只执行合规 set，拒绝 runtime 与非 set', async () => {
  const { executeValidatedRepairCommands } = await repairPromise;
  const save = scenarioSave();
  const profile = { 模式: '单机', 角色: { 名字: '测试' }, 存档列表: {} };
  const errors = await executeValidatedRepairCommands(save, profile, [
    { action: 'set', key: '角色.属性.声望', value: 12 },
    { action: 'set', key: '世界.状态.剧本模组.flags.event.s06_03.done', value: true },
    { action: 'delete', key: '角色.属性.声望' },
  ]);

  assert.equal(save.角色.属性.声望, 12);
  assert.equal(save.世界.状态.剧本模组.flags['event.s06_03.done'], undefined);
  assert.equal(errors.length, 2);
  assert.match(errors.join('\n'), /不得修改剧本运行时/);
  assert.match(errors.join('\n'), /仅允许 set/);
});

test('NPC 静态正典设定写保护：性别/灵根/种族/出生日期 拒绝 set 与 delete（R2-5）', async () => {
  const { validateModelCommandPipeline } = await modelPipelinePromise;
  const result = await validateModelCommandPipeline([
    { action: 'set', key: '社交.关系.凝羽.灵根', value: { name: '风灵根', tier: '天品' } },
    { action: 'set', key: '社交.关系.谢艺.性别', value: '女' },
    { action: 'set', key: '社交.关系.相雅.出生日期', value: { 年: -14, 月: 1, 日: 1 } },
    { action: 'delete', key: '社交.关系.小紫.种族' },
    { action: 'set', key: '社交.关系.凝羽.当前内心想法', value: '警惕四周' },
  ], scenarioSave());

  assert.equal(result.validCommands.length, 1);
  assert.equal(result.validCommands[0].key, '社交.关系.凝羽.当前内心想法');
  assert.equal(result.rejectedCommands.length, 4);
  for (const rejected of result.rejectedCommands) {
    assert.match(rejected.errors.join('；'), /正典静态设定/);
  }
});
