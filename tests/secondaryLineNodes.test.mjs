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
      assert.ok(n.reviewSummary?.length >= 4, `${line.name} 有空节点文案`);
      if (n.status === 'ready') {
        assert.ok(n.stageId && n.eventId, `${line.name} 的 ready 节点必须落到 stage+event：${n.reviewSummary}`);
      }
      if (n.status === 'pending') {
        assert.ok(!n.eventId, `${line.name} 的待扩节点不该挂 event：${n.reviewSummary}`);
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
      if (!evs.has(n.eventId)) missing.push(`${line.name}: ${n.stageId} 里没有 ${n.eventId}（${n.reviewSummary}）`);
    }
  }
  assert.deepEqual(missing, [], '有 ready 节点指向不存在的 stage/event，玩家永远走不到');
});

test('ready 节点按全书时间线序排列，不让玩家往回跑', async () => {
  const fs = await import('node:fs');
  const { SECONDARY_LINES } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  // 坐标用 event 自带的 `axisSeq`（全书统一时间线序），**不用关序**（用户 2026-08-16）：
  // 关号是路由产物——8 个关被隔离静默跳过，"第 24 关"不是玩家看到的第 24 关；
  // 且一关几十拍，关内乱序全被这个粗筐吃掉。改用 axisSeq 后，
  // 原先按关号只看出 1 条线有问题，实际是 7 条线 12 处回退。
  const dir = 'src/modules/scenarioMods/builtins/data/';
  const seqOf = new Map();
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(dir + f, 'utf8'));
    if (!j.scenario?.worldSimulation) continue;
    for (const e of j.scenario.events || []) {
      if (typeof e.axisSeq === 'number') seqOf.set(e.id, e.axisSeq);
    }
  }
  // 只校 ready→ready 这种两端都有真实 seq 的相邻对。new 节点没有真实 event，
  // 拿所在关的起始 seq 估位会造出假回退（唐国顶点 1396 曾被估成 1321 而误报）。
  const back = [];
  for (const line of SECONDARY_LINES) {
    let prev = null;
    line.nodes.forEach((n, i) => {
      const seq = n.status === 'ready' ? seqOf.get(n.eventId) : undefined;
      if (typeof seq !== 'number') { if (n.status !== 'ready') prev = null; return; }
      if (prev && seq < prev.seq) {
        back.push(`${line.name}: #${prev.i}「${prev.summary}」seq ${prev.seq} → #${i + 1}「${n.reviewSummary}」seq ${seq}`);
      }
      prev = { i: i + 1, seq, summary: n.reviewSummary };
    });
  }
  assert.deepEqual(back, [], '有节点排在比它更早的剧情之后，玩家照着待办走会被要求往回跑');
});

test('待新增节点都给了建议挂载关与建议 id，不冒充可走', async () => {
  const { SECONDARY_LINES } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  // 不锁具体条数——链路会随重写增减（汉国补旧案链后就从 3 条变 5 条）。
  // 锁的是规则：凡标 new 的，必须给出建议挂载关与建议 id，否则等于一句空话。
  let total = 0;
  for (const line of SECONDARY_LINES) {
    for (const n of line.nodes.filter(x => x.status === 'new')) {
      total++;
      assert.ok(n.stageId, `${line.name}「${n.reviewSummary}」标了 new 却没给建议挂载关`);
      assert.ok(n.eventId, `${line.name}「${n.reviewSummary}」标了 new 却没给建议 event id`);
    }
  }
  // 原本断言「必须还有 new 节点」，用来提醒别把这条测试删掉。2026-08-17 二级线的 new 已全部写完，
  // 它如期报红——但该做的是记下状态、不是保留一个恒假的门槛。规则本身（new 必须给挂载关＋id）保留。
  // 主轴仍有 1 条 new（`enter_dong_recognize_biji`，挂隔离关 lcq.stage_05，等裁定），由主轴那份测试覆盖。
});

test('新增 event 的建议 id 不带关卡前缀', async () => {
  const { SECONDARY_LINES } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  const { MAIN_QUEST_NODES } = await loadTs('../src/modules/scenarioMods/mainQuestAxis.ts');
  // id 是键，不是索引（用户裁定 2026-08-17）。
  //
  // 关卡前缀（`s07_`／`s05b_`）把"这个 event 放在哪个文件里"写进了永久键，而那件事会变——
  // 今天就改挂过多次，`s03b_baihu_caravan_south` 因此整个作废。
  // 同理也不采用 `book.event.<线名>.<序号>`：**已有 6 条 event 被两条以上的链共用**
  // （`slay_dragon` 同时喂主轴／星月湖／昭南），归属写进 id 就得对其余的撒谎；
  // 而归属与顺序今天各变过 3 次以上。改名的代价已量过：925 处 `flags.event.<id>` 引用
  // ＋ 37 关 append-only-frozen 契约 ＋ 所有现存存档。
  //
  // 故新 id 只写「发生了什么事」——那件事不变。归属、分组、排序留在节点表与 axisSeq 里。
  // ⚠ 只约束**尚未落地的建议 id**：已存在的旧 id 是冻结契约，不改名。
  const nodes = [
    ...SECONDARY_LINES.flatMap(l => l.nodes.map(n => [l.name, n])),
    ...MAIN_QUEST_NODES.map(n => ['主轴', n]),
  ];
  const bad = [];
  for (const [line, n] of nodes) {
    if (n.status !== 'new' || !n.eventId) continue;
    if (/\.event\.s\d/.test(n.eventId)) bad.push(`${line}「${n.reviewSummary}」→ ${n.eventId}`);
  }
  assert.deepEqual(bad, [], '建议 id 带了关卡前缀——关卡只是文件落点，不该写进永久键');
});
