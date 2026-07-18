import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const modPromise = loadTs('../src/services/progressAuditService.ts');

function goals(...titles) {
  return titles.map((t) => ({ 标题: t }));
}

test('low-confidence recommendation is not written', async () => {
  const { validateAuditedGoals } = await modPromise;
  const res = validateAuditedGoals(
    { recommended: [{ 标题: '护送谢艺前往草庐', evidence: '正文提到草庐', confidence: 0.5 }] },
    []
  );
  assert.deepEqual(res.finalGoals, []);
  assert.equal(res.changed, false);
});

test('completed verdict without evidence does not delete the old goal', async () => {
  const { validateAuditedGoals } = await modPromise;
  const res = validateAuditedGoals(
    { goals: [{ title: '救治小紫', status: 'completed', confidence: 0.9 }] },
    goals('救治小紫')
  );
  assert.deepEqual(res.finalGoals, [{ 标题: '救治小紫' }]);
  assert.equal(res.changed, false);
});

test('caps improvised goals at three and truncates the fourth', async () => {
  const { validateAuditedGoals } = await modPromise;
  const current = goals('追查碧奴玉牌线索', '护送谢艺前往草庐', '取回归海之心令牌');
  const res = validateAuditedGoals(
    { recommended: [{ 标题: '调查星月湖船队', evidence: '正文明确共鸣', confidence: 0.9 }] },
    current
  );
  assert.equal(res.finalGoals.length, 3);
  assert.ok(!res.finalGoals.some((g) => g.标题 === '调查星月湖船队'));
  assert.equal(res.changed, false);
});

test('rejects a distant hearsay item as an active goal', async () => {
  const { validateAuditedGoals } = await modPromise;
  const res = validateAuditedGoals(
    { recommended: [{ 标题: '听闻长安急报速归', evidence: '正文提到长安急报', confidence: 0.95 }] },
    []
  );
  assert.deepEqual(res.finalGoals, []);
  assert.equal(res.changed, false);
});

test('removes a goal the player explicitly abandoned (with grounded evidence)', async () => {
  const { validateAuditedGoals } = await modPromise;
  const res = validateAuditedGoals(
    { goals: [{ title: '追查碧奴玉牌线索', status: 'abandoned', evidence: '玩家明确放弃', confidence: 0.9 }] },
    goals('追查碧奴玉牌线索'),
    '玩家明确表示放弃追查碧奴玉牌线索。'
  );
  assert.deepEqual(res.finalGoals, []);
  assert.equal(res.changed, true);
});

test('keeps a completed goal whose evidence is not grounded in recent context', async () => {
  const { validateAuditedGoals } = await modPromise;
  const res = validateAuditedGoals(
    { goals: [{ title: '救治小紫', status: 'completed', evidence: '归海之心已温养神魂', confidence: 0.95 }] },
    goals('救治小紫'),
    '众人在渔村外的芦苇丛中赶路，无人提及小紫病情。'
  );
  assert.deepEqual(res.finalGoals, [{ 标题: '救治小紫' }]);
  assert.equal(res.changed, false);
});

test('deduplicates identical current goals without treating it as deletion', async () => {
  const { validateAuditedGoals } = await modPromise;
  const res = validateAuditedGoals({}, [{ 标题: '救治小紫' }, { 标题: '救治小紫。' }]);
  assert.deepEqual(res.finalGoals, [{ 标题: '救治小紫' }]);
});

test('does not truncate existing goals over the cap', async () => {
  const { validateAuditedGoals } = await modPromise;
  const current = goals('追查碧奴玉牌线索', '护送谢艺前往草庐', '取回归海之心令牌', '安葬旧友遗骨');
  const res = validateAuditedGoals({}, current);
  assert.equal(res.finalGoals.length, 4);
  assert.equal(res.changed, false);
});

test('wrong-schema / root-array output is a no-op', async () => {
  const { validateAuditedGoals } = await modPromise;
  const current = goals('救治小紫');
  assert.deepEqual(validateAuditedGoals([], current).finalGoals, [{ 标题: '救治小紫' }]);
  assert.equal(validateAuditedGoals([], current).changed, false);
  assert.deepEqual(validateAuditedGoals({ foo: 1 }, current).finalGoals, [{ 标题: '救治小紫' }]);
  assert.equal(validateAuditedGoals({ foo: 1 }, current).changed, false);
});

test('ignores out-of-scope fields in model output', async () => {
  const { validateAuditedGoals } = await modPromise;
  const res = validateAuditedGoals(
    {
      goals: [{ title: '救治小紫', status: 'active', evidence: '仍在温养', confidence: 0.9 }],
      recommended: [],
      世界: { 状态: { 剧本模组: 'HACKED' } },
      角色: { 背包: { 物品: 'HACKED' } },
    },
    goals('救治小紫')
  );
  assert.deepEqual(res.finalGoals, [{ 标题: '救治小紫' }]);
  assert.equal(res.changed, false);
});

test('rejects overlong / too-short new titles', async () => {
  const { validateAuditedGoals } = await modPromise;
  const res = validateAuditedGoals(
    {
      recommended: [
        { 标题: '短', evidence: 'x', confidence: 0.9 },
        { 标题: '这是一个非常非常非常非常非常非常非常非常非常长的目标标题超过四十字了绝对超过了你看嘛真的很长很长很长很长', evidence: 'x', confidence: 0.9 },
      ],
    },
    []
  );
  assert.deepEqual(res.finalGoals, []);
});

test('runProgressAudit writes validated goals via injected generate', async () => {
  const { runProgressAudit } = await modPromise;
  const saveData = { 系统: { 扩展: { 任务追踪: { 即兴目标: [] } } }, 角色: { 位置: { 描述: '荒废渔村' } } };

  const changes = await runProgressAudit({
    saveData,
    recentText: '程宗扬当机立断，决定护送谢艺前往草庐疗伤。',
    userAction: '前往草庐',
    generate: async () =>
      JSON.stringify({ recommended: [{ 标题: '护送谢艺前往草庐', evidence: '正文明确决定前往草庐', confidence: 0.9 }] }),
  });

  assert.equal(changes.length, 1);
  assert.deepEqual(saveData.系统.扩展.任务追踪.即兴目标, [{ 标题: '护送谢艺前往草庐' }]);
});

test('shouldRunAudit gates on existing goals or player intent', async () => {
  const { shouldRunAudit } = await modPromise;
  // 无目标、无意图 → 不跑
  assert.equal(shouldRunAudit('查看背包', []), false);
  assert.equal(shouldRunAudit('原地休息片刻', []), false);
  // 有目标 → 跑（可能需更新/移除）
  assert.equal(shouldRunAudit('查看背包', goals('救治小紫')), true);
  // 玩家意图词 → 跑（可能新增/放弃）
  assert.equal(shouldRunAudit('我决定北上长安', []), true);
  assert.equal(shouldRunAudit('先不追碧奴了', []), true);
});

test('runProgressAudit is best-effort: llm failure yields no changes', async () => {
  const { runProgressAudit } = await modPromise;
  const saveData = { 系统: { 扩展: { 任务追踪: { 即兴目标: [{ 标题: '救治小紫' }] } } } };

  const changes = await runProgressAudit({
    saveData,
    recentText: '...',
    userAction: '继续',
    generate: async () => {
      throw new Error('network down');
    },
  });

  assert.deepEqual(changes, []);
  assert.deepEqual(saveData.系统.扩展.任务追踪.即兴目标, [{ 标题: '救治小紫' }]);
});

test('#12 接地守卫:凭空/原著知识目标被拒(渔村案回放)', async () => {
  const { validateAuditedGoals } = await modPromise;
  const context = '程宗扬立在昭阳殿丹陛之下，百官朝贺，定陶王稚嫩的谢恩词已近尾声。玩家输入：静观登基大典。';
  const res = validateAuditedGoals(
    { recommended: [{ 标题: '带小紫与归海之心撤离荒废渔村', evidence: '小紫携归海之心受困荒废渔村，泊陵鱼氏追索', confidence: 0.95 }] },
    [],
    context
  );
  assert.deepEqual(res.finalGoals, [], '未命中上下文的目标应被拒');
  assert.ok(res.diagnostics.some((d) => d.includes('未命中本轮上下文')));
});

test('#12 接地守卫:转述式 evidence 含真实片段仍可通过', async () => {
  const { validateAuditedGoals } = await modPromise;
  const context = '程宗扬当机立断，决定护送谢艺前往草庐疗伤。';
  const res = validateAuditedGoals(
    { recommended: [{ 标题: '护送谢艺前往草庐疗伤', evidence: '正文明确决定护送谢艺前往草庐', confidence: 0.9 }] },
    [],
    context
  );
  assert.deepEqual(res.finalGoals, [{ 标题: '护送谢艺前往草庐疗伤' }]);
});
