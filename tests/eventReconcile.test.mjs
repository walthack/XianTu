import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const modPromise = loadTs('../src/services/eventReconcileService.ts');

// —— 复现存档11111/stage_06 死锁场景：严格顺序链 01~06，玩家杀了鬼巫王(01/02已发生)、
//    谢艺没死/殇侯没出现(03分岔/05未到) ——
function chain() {
  return [
    { id: 'e1', name: '鬼巫王被吞', beat: '鬼巫王与龙神合体失败被吞', flagKey: 'event.s06_01.done' },
    { id: 'e2', name: '龙神激战', beat: '商队与龙神激战', flagKey: 'event.s06_02.done' },
    { id: 'e3', name: '谢艺死亡', beat: '谢艺重创龙神后死亡', flagKey: 'event.s06_03.done' },
    { id: 'e4', name: '小紫弑母', beat: '小紫刺死碧姬', flagKey: 'event.s06_04.done' },
    { id: 'e5', name: '殇侯揭身份', beat: '殇侯揭示身份', flagKey: 'event.s06_05.done' },
  ];
}
const CTX = '鬼巫王已死，龙神也已陨落。血池决战落幕。谢艺拄着刀单臂撑在石壁上说话。';

test('连续前缀：done+void 按序接受，pending 处链停止', async () => {
  const { validateEventReconcile } = await modPromise;
  const raw = { events: [
    { id: 'e1', verdict: 'done', evidence: '鬼巫王已死', confidence: 0.95 },
    { id: 'e2', verdict: 'done', evidence: '血池决战落幕', confidence: 0.9 },
    { id: 'e3', verdict: 'void', evidence: '谢艺拄着刀单臂撑在石壁上', confidence: 0.9 },
    { id: 'e4', verdict: 'pending', evidence: '', confidence: 0 },
    { id: 'e5', verdict: 'done', evidence: '鬼巫王已死', confidence: 0.99 }, // 跳序：必须被拒
  ] };
  const { accepted } = validateEventReconcile(raw, chain(), CTX);
  assert.deepEqual(accepted.map(a => `${a.id}:${a.verdict}`), ['e1:done', 'e2:done', 'e3:void']);
});

test('跳序拦截：链中一个不过，后续即使高置信也全部拒绝', async () => {
  const { validateEventReconcile } = await modPromise;
  const raw = { events: [
    { id: 'e1', verdict: 'pending' },
    { id: 'e2', verdict: 'done', evidence: '血池决战落幕', confidence: 0.99 },
  ] };
  const { accepted } = validateEventReconcile(raw, chain(), CTX);
  assert.equal(accepted.length, 0);
});

test('证据接地：evidence 与记忆无 bigram 重叠 → 拒绝（模型编造）', async () => {
  const { validateEventReconcile } = await modPromise;
  const raw = { events: [
    { id: 'e1', verdict: 'done', evidence: '玩家亲手斩杀了魔尊统领', confidence: 0.99 },
  ] };
  const { accepted } = validateEventReconcile(raw, chain(), CTX);
  assert.equal(accepted.length, 0);
});

test('证据接地(bigram)：转述/带省略号但语义对的证据应接地（实测存档11111的真实失败点）', async () => {
  const { validateEventReconcile } = await modPromise;
  // 事件 beat="鬼巫王与龙神合体失败被吞"，记忆里是"鬼巫王已死，龙神也已陨落"——
  // 模型转述成带省略号的叙事措辞，逐字子串匹配会毙掉，bigram 重叠应放行
  const raw = { events: [
    { id: 'e1', verdict: 'done', evidence: '鬼巫王…龙神也已陨落', confidence: 0.95 },
  ] };
  const { accepted } = validateEventReconcile(raw, chain(), CTX);
  assert.deepEqual(accepted.map(a => a.id), ['e1']);
});


test('void 阈值高于 done：0.8 的 void 拒绝、0.8 的 done 接受', async () => {
  const { validateEventReconcile } = await modPromise;
  const asVoid = validateEventReconcile({ events: [
    { id: 'e1', verdict: 'void', evidence: '鬼巫王已死', confidence: 0.8 },
  ] }, chain(), CTX);
  assert.equal(asVoid.accepted.length, 0, 'void@0.8 应拒');
  const asDone = validateEventReconcile({ events: [
    { id: 'e1', verdict: 'done', evidence: '鬼巫王已死', confidence: 0.8 },
  ] }, chain(), CTX);
  assert.equal(asDone.accepted.length, 1, 'done@0.8 应收');
});

test('单次上限：一次最多落 MAX_FLAGS_PER_RUN 个', async () => {
  const { validateEventReconcile, MAX_FLAGS_PER_RUN } = await modPromise;
  const many = Array.from({ length: 8 }, (_, i) => ({
    id: `e${i + 1}`, name: `E${i + 1}`, beat: 'x', flagKey: `event.x${i + 1}.done`,
  }));
  const raw = { events: many.map(c => ({ id: c.id, verdict: 'done', evidence: '鬼巫王已死', confidence: 0.99 })) };
  const { accepted } = validateEventReconcile(raw, many, CTX);
  assert.equal(accepted.length, MAX_FLAGS_PER_RUN);
});

test('applyReconcileFlags：扁平+嵌套双写，void 记审计标记', async () => {
  const { applyReconcileFlags } = await modPromise;
  const flags = { 'event.s06_01.done': false, event: { s06_03: { done: false } } };
  applyReconcileFlags(flags, [
    { id: 'e1', flagKey: 'event.s06_01.done', verdict: 'done', evidence: 'x' },
    { id: 'e3', flagKey: 'event.s06_03.done', verdict: 'void', evidence: 'y' },
  ]);
  assert.equal(flags['event.s06_01.done'], true, '扁平键');
  assert.equal(flags.event.s06_03.done, true, '嵌套键(读取优先,必须同步)');
  assert.equal(flags['event.s06_03.void'], true, 'void 审计标记');
});

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

test('shouldRunReconcile：停滞≥阈值每轮都触发', async () => {
  const { shouldRunReconcile } = await modPromise;
  // 阈值 10：>=10 每轮都触发（落账使 stall 归零自然停）
  assert.equal(shouldRunReconcile(9), false);
  assert.equal(shouldRunReconcile(10), true);
  assert.equal(shouldRunReconcile(11), true);
  assert.equal(shouldRunReconcile(33), true);
  assert.equal(shouldRunReconcile(undefined), false);
});

test('runEventReconcile 端到端(注入generate)：落账后 flag 生效、返回变更日志', async () => {
  const { runEventReconcile } = await modPromise;
  const saveData = {
    世界: { 状态: { 剧本模组: {
      events: [
        { id: 'e1', name: '鬼巫王被吞', axisSeq: 1, axisBeat: '鬼巫王被吞', completion: [{ path: 'flags.event.s06_01.done', operator: 'eq', value: true }] },
        { id: 'e3', name: '谢艺死亡', axisSeq: 3, axisBeat: '谢艺死亡', completion: [{ path: 'flags.event.s06_03.done', operator: 'eq', value: true }] },
      ],
      completedEventIds: [],
      flags: { 'event.s06_01.done': false, 'event.s06_03.done': false },
    } } },
    社交: { 记忆: { 隐式中期记忆: ['击杀鬼巫王后与苏荔同行离开鬼王峒', '谢艺拄刀而立与程宗扬说话'] } },
  };
  const changes = await runEventReconcile({
    saveData, recentText: '', userAction: '',
    generate: async () => JSON.stringify({ events: [
      { id: 'e1', verdict: 'done', evidence: '击杀鬼巫王', confidence: 0.95 },
      { id: 'e3', verdict: 'void', evidence: '谢艺拄刀而立', confidence: 0.9 },
    ] }),
  });
  const flags = saveData.世界.状态.剧本模组.flags;
  assert.equal(flags['event.s06_01.done'], true);
  assert.equal(flags['event.s06_03.done'], true);
  assert.equal(flags['event.s06_03.void'], true);
  assert.equal(changes.length, 2);
});

test('evidenceLikely：正文命中事件名/beat 高重叠→触发；无关正文→不触发', async () => {
  const { evidenceLikely } = await modPromise;
  const cands = [
    { id: 'q1', name: '秦桧初登场', beat: '秦桧在建康登场，与程宗扬初次相见', flagKey: 'event.q1.done' },
    { id: 'q2', name: '秦桧归入麾下', beat: '秦桧决意投效', flagKey: 'event.q2.done' },
  ];
  assert.equal(evidenceLikely('厅中一名青衫文士拱手：「在下秦桧，见过程公子。」众人落座叙话，气氛渐热。', cands), true, '正文含事件名应触发');
  assert.equal(evidenceLikely('夜色沉沉，一行人在渡口清点货物，商队伙计来回搬运，无事发生。', cands), false, '无关正文不触发');
  assert.equal(evidenceLikely('短', cands), false, '过短正文不触发');
});
