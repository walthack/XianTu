import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const modPromise = loadTs('../src/services/eventReconcileService.ts');

// 2026-11-02 用户拍板②：正文关键词共现不再是结算条件——高光证据词、谢艺／碧姬正文快路、模型读正文对账全部删除。
// 留下的只有只读的候选链排序（冻结文件 AIBidirectionalSystem 仍按原名调用这些出口）。

test('buildChainCandidates：排除已完成/已 done，按 axisSeq 排序，截断暴露上限', async () => {
  const { buildChainCandidates } = await modPromise;
  const mk = (id, seq, done = false) => ({
    id, name: id, axisSeq: seq, axisBeat: `beat-${id}`,
    completion: [{ path: `flags.event.${id}.done`, operator: 'eq', value: true }],
    _done: done,
  });
  const runtime = {
    events: [mk('b', 2), mk('a', 1), mk('c', 3), mk('z', 0)],
    completedEventIds: ['c'],
    flags: { 'event.z.done': true },
  };
  const out = buildChainCandidates(runtime);
  assert.deepEqual(out.map(c => c.id), ['a', 'b'], '排除 flag已true(z)/completed(c)，按 axisSeq 序');
  assert.equal(out[0].flagKey, 'event.a.done');
});

test('buildChainCandidates：玩家本地完成合同也是 LLM 对账不可跨越的权威边界', async () => {
  const { buildChainCandidates } = await modPromise;
  const mk = (id, seq, extra = {}) => ({
    id,
    name: id,
    axisSeq: seq,
    axisBeat: `beat-${id}`,
    completion: [{ path: `flags.event.${id}.done`, operator: 'eq', value: true }],
    ...extra,
  });
  const runtime = {
    events: [
      mk('legacy-before', 1),
      mk('engine-owned', 2, { playerCompletionContract: { kind: 'objective_action' } }),
      mk('legacy-after', 3),
    ],
    completedEventIds: [],
    flags: {},
  };
  assert.deepEqual(buildChainCandidates(runtime).map(item => item.id), ['legacy-before']);
});

test('event completionEvidence overrides the shorter Canon Rail fallback for mainline highlights', async () => {
  const { buildChainCandidates } = await modPromise;
  const runtime = {
    modId: 'lcq.stage_02',
    completedEventIds: [],
    flags: {},
    events: [{
      id: 'lcq.event.s02_02',
      name: '王哲九阳自爆',
      axisSeq: 20,
      axisBeat: '半预制高光',
      completionEvidence: ['左武第一军团', '王哲', '九阳', '日轮', '阿伽门侬', '焦土'],
      completion: [{ path: 'flags.event.s02_02.done', operator: 'eq', value: true }],
    }],
  };

  assert.deepEqual(buildChainCandidates(runtime)[0].completionEvidence,
    ['左武第一军团', '王哲', '九阳', '日轮', '阿伽门侬', '焦土']);
});

test('正文不再结算：证据词全部同现、人名＋死亡词同句、模型给出高置信结论，都不写任何 flag', async () => {
  const mod = await modPromise;
  const save = {
    世界: { 状态: { 剧本模组: {
      modId: 'lcq.stage_06',
      activeEventIds: ['event.highlight.demo'],
      completedEventIds: [],
      flags: {},
      events: [{
        id: 'event.highlight.demo', name: '高光', critical: false,
        completionEvidence: ['羊腿', '刀尖', '田荣'],
        completion: [{ path: 'flags.event.highlight.demo.done', operator: 'eq', value: true }],
      }],
    } } },
  };
  const text = '班超以羊腿和刀尖镇场，最后替田荣留了差事。谢艺战死。小紫亲手杀死碧姬。月霜的寒毒被真阳化解。';
  assert.deepEqual(mod.runDeterministicHighlightReconcile(save, text), []);
  assert.deepEqual(mod.runDeterministicXieyiReconcile(save, text), []);
  assert.deepEqual(mod.runDeterministicBijiReconcile(save, text), []);
  let called = 0;
  assert.deepEqual(await mod.runEventReconcile({ saveData: save, recentText: text, userAction: '', generate: async () => { called++; return '{"events":[{"id":"event.highlight.demo","verdict":"done","evidence":"羊腿","confidence":0.99}]}'; } }), []);
  assert.equal(called, 0, '不再请模型读正文对账');
  assert.deepEqual(save.世界.状态.剧本模组.flags, {});
  assert.equal(mod.shouldRunReconcile(99), false, '停滞不再触发对账');
  assert.equal(mod.evidenceLikely(text, [{ id: 'e', name: '高光', beat: '班超以羊腿和刀尖镇场', flagKey: 'event.e.done' }]), false, '正文命中也不触发');
});

test('源码里不再有正文共现结算：证据词全命中、命中锚点、正文人名＋结果词的判定都已删除', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/services/eventReconcileService.ts', import.meta.url), 'utf8');
  for (const gone of ['HIGHLIGHT_EVIDENCE_FALLBACK', 'hasCompletionEvidence', 'explicitOutcomeSentence', 'validateEventReconcile', 'applyReconcileFlags', 'aiService']) {
    assert.ok(!source.includes(gone), gone);
  }
});
