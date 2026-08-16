import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

// 主轴 20 节点的事件落点：每条都要有 status；ready 必须落到真实 stage+event；
// ready 节点按 axisSeq 单调不减。口径同 tests/secondaryLineNodes.test.mjs。

test('每条主轴节点都有 status；ready 落 stage+event，new 给建议挂载关与建议 id', async () => {
  const { MAIN_QUEST_NODES } = await loadTs('../src/modules/scenarioMods/mainQuestAxis.ts');
  assert.ok(MAIN_QUEST_NODES?.length >= 1, '主轴节点表为空');
  for (const n of MAIN_QUEST_NODES) {
    assert.ok(['ready', 'new', 'pending'].includes(n.status), `主轴节点状态非法：${n.status}（${n.text}）`);
    assert.ok(n.text?.length >= 4, `主轴有空节点文案`);
    if (n.status === 'ready') {
      assert.ok(n.stageId && n.eventId, `ready 节点必须落到 stage+event：${n.text}`);
    }
    if (n.status === 'pending') {
      // 正典压根没有的，只标待扩，不许给建议 id——否则等于把设计伪装成待补的既有内容。
      assert.ok(!n.eventId, `主轴「${n.text}」标了 pending 却挂了 event id`);
    }
    if (n.status === 'new') {
      // 不锁具体条数——链路会随重写增减。锁的是规则：new 必须给出建议挂载关与建议 id。
      assert.ok(n.stageId, `主轴「${n.text}」标了 new 却没给建议挂载关`);
      assert.ok(n.eventId, `主轴「${n.text}」标了 new 却没给建议 event id`);
    }
  }
});

test('ready 节点指向的 stage 与 event 真实存在', async () => {
  const fs = await import('node:fs');
  const { MAIN_QUEST_NODES } = await loadTs('../src/modules/scenarioMods/mainQuestAxis.ts');
  const dir = 'src/modules/scenarioMods/builtins/data/';
  const stageEvents = new Map();
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(dir + f, 'utf8'));
    if (!j.scenario?.worldSimulation) continue;
    stageEvents.set(j.manifest.id, new Set((j.scenario.events || []).map(e => e.id)));
  }
  const missing = [];
  for (const n of MAIN_QUEST_NODES.filter(x => x.status === 'ready')) {
    const evs = stageEvents.get(n.stageId);
    if (!evs) { missing.push(`关卡不存在 ${n.stageId}（${n.text}）`); continue; }
    if (!evs.has(n.eventId)) missing.push(`${n.stageId} 里没有 ${n.eventId}（${n.text}）`);
  }
  assert.deepEqual(missing, [], '有 ready 节点指向不存在的 stage/event，主轴认领永远对不上');
});

test('ready 节点按全书时间线序排列，不让玩家往回跑', async () => {
  const fs = await import('node:fs');
  const { MAIN_QUEST_NODES } = await loadTs('../src/modules/scenarioMods/mainQuestAxis.ts');
  // 坐标用 event 自带的 `axisSeq`（全书统一时间线序），不用关序。
  // 只校 ready→ready 这种两端都有真实 seq 的相邻对。new 节点没有真实 event，
  // 拿所在关的起始 seq 估位会造出假回退。
  const dir = 'src/modules/scenarioMods/builtins/data/';
  const seqOf = new Map();
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(dir + f, 'utf8'));
    if (!j.scenario?.worldSimulation) continue;
    for (const e of j.scenario.events || []) {
      if (typeof e.axisSeq === 'number') seqOf.set(e.id, e.axisSeq);
    }
  }
  const back = [];
  let prev = null;
  MAIN_QUEST_NODES.forEach((n, i) => {
    const seq = n.status === 'ready' ? seqOf.get(n.eventId) : undefined;
    if (typeof seq !== 'number') { if (n.status !== 'ready') prev = null; return; }
    if (prev && seq < prev.seq) {
      back.push(`#${prev.i}「${prev.text}」seq ${prev.seq} → #${i + 1}「${n.text}」seq ${seq}`);
    }
    prev = { i: i + 1, seq, text: n.text };
  });
  assert.deepEqual(back, [], '有主轴节点排在比它更早的剧情之后，玩家照着待办走会被要求往回跑');
});
