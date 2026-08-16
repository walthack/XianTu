import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

// 八条二级线的骨架：搭齐、缺内容的标待扩、ready 节点必须落到真实 stage+event。

test('八条线都有节点骨架，且各自说明还缺什么', async () => {
  const { SECONDARY_LINES } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  for (const line of SECONDARY_LINES) {
    assert.ok(line.nodes?.length >= 3, `${line.name} 节点太少，骨架没搭起来`);
    const pending = line.nodes.filter(n => n.status === 'pending');
    if (pending.length) {
      assert.ok(line.pendingExpansion, `${line.name} 有待扩节点却没写 pendingExpansion，下一个人不知道缺什么`);
    }
    for (const n of line.nodes) {
      assert.ok(['ready', 'new', 'pending'].includes(n.status), `${line.name} 节点状态非法：${n.status}`);
      assert.ok(n.text?.length >= 4, `${line.name} 有空节点文案`);
      if (n.status === 'ready') {
        assert.ok(n.stageId && n.eventId, `${line.name} 的 ready 节点必须落到 stage+event：${n.text}`);
      }
      if (n.status === 'pending') {
        assert.ok(!n.eventId, `${line.name} 的待扩节点不该挂 event：${n.text}`);
      }
    }
  }
});

test('ready 节点指向的 stage 与 event 真实存在', async () => {
  const fs = await import('node:fs');
  const { SECONDARY_LINES } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  const dir = 'src/modules/scenarioMods/builtins/data/';
  const stageEvents = new Map();
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(dir + f, 'utf8'));
    if (!j.scenario?.worldSimulation) continue;
    stageEvents.set(j.manifest.id, new Set((j.scenario.events || []).map(e => e.id)));
  }
  const missing = [];
  for (const line of SECONDARY_LINES) {
    for (const n of line.nodes.filter(x => x.status === 'ready')) {
      const evs = stageEvents.get(n.stageId);
      if (!evs) { missing.push(`${line.name}: 关卡不存在 ${n.stageId}`); continue; }
      if (!evs.has(n.eventId)) missing.push(`${line.name}: ${n.stageId} 里没有 ${n.eventId}（${n.text}）`);
    }
  }
  assert.deepEqual(missing, [], '有 ready 节点指向不存在的 stage/event，玩家永远走不到');
});

test('待新增节点都给了建议挂载关与建议 id，不冒充可走', async () => {
  const { SECONDARY_LINES } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  // 不锁具体条数——链路会随重写增减（汉国补旧案链后就从 3 条变 5 条）。
  // 锁的是规则：凡标 new 的，必须给出建议挂载关与建议 id，否则等于一句空话。
  let total = 0;
  for (const line of SECONDARY_LINES) {
    for (const n of line.nodes.filter(x => x.status === 'new')) {
      total++;
      assert.ok(n.stageId, `${line.name}「${n.text}」标了 new 却没给建议挂载关`);
      assert.ok(n.eventId, `${line.name}「${n.text}」标了 new 却没给建议 event id`);
    }
  }
  assert.ok(total > 0, '若已无待新增节点，本断言需重写而不是删除');
});
