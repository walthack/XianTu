import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

function loadEvents() {
  const out = new Map();
  const dir = 'src/modules/scenarioMods/builtins/data';
  for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.json'))) {
    const document = JSON.parse(fs.readFileSync(`${dir}/${file}`, 'utf8'));
    for (const event of document.scenario?.events || []) out.set(event.id, event);
  }
  return out;
}

test('三级任务的结果摘要与玩家目标是两个独立字段', async () => {
  const { MAIN_QUEST_NODES } = await loadTs('../src/modules/scenarioMods/mainQuestAxis.ts');
  const { SECONDARY_LINES } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  const { CHARACTER_QUESTS, CHARACTER_HIGHLIGHTS } = await loadTs('../src/modules/scenarioMods/characterQuests.ts');

  const records = [
    ...MAIN_QUEST_NODES,
    ...SECONDARY_LINES.flatMap(line => line.nodes),
    ...CHARACTER_QUESTS.flatMap(quest => quest.beats),
    ...CHARACTER_HIGHLIGHTS,
  ];
  assert.ok(records.length > 500, '应覆盖三级任务与人物高光的全量制作摘要');
  for (const record of records) {
    assert.equal(typeof record.reviewSummary, 'string');
    assert.ok(record.reviewSummary.trim(), '制作摘要不得为空');
    assert.equal(Object.hasOwn(record, 'text'), false, '旧 text 容易被误当玩家目标，必须完成字段隔离');
  }
});

test('所有真实可走节点都由本地 event 提供固定 objective', async () => {
  const events = loadEvents();
  const { MAIN_QUEST_NODES } = await loadTs('../src/modules/scenarioMods/mainQuestAxis.ts');
  const { SECONDARY_LINES } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');
  const { CHARACTER_QUESTS } = await loadTs('../src/modules/scenarioMods/characterQuests.ts');

  const refs = [
    ...MAIN_QUEST_NODES.filter(node => node.status === 'ready').map(node => node.eventId),
    ...SECONDARY_LINES.flatMap(line => line.nodes.filter(node => node.status === 'ready').map(node => node.eventId)),
    ...CHARACTER_QUESTS.flatMap(quest => quest.beats
      .filter(beat => beat.status !== 'new')
      .flatMap(beat => beat.eventIds)),
  ];
  for (const eventId of refs) {
    const event = events.get(eventId);
    assert.ok(event, `真实任务节点引用了不存在的 event：${eventId}`);
    assert.ok(String(event.objective || '').trim(), `event 缺固定 objective：${eventId}`);
  }
});

test('当前节点解析只接受已落地 event，不把 pending/new 暴露成可执行目标', async () => {
  const { resolveCurrentMainQuestNode } = await loadTs('../src/modules/scenarioMods/mainQuestAxis.ts');
  const { secondaryLinesAtEvent } = await loadTs('../src/modules/scenarioMods/secondaryLines.ts');

  assert.equal(
    resolveCurrentMainQuestNode('lcq.stage_01', undefined, 'lcq.event.s01_03')?.eventId,
    'lcq.event.s01_03',
  );
  assert.equal(resolveCurrentMainQuestNode('lyl.taiquan_afterfall', undefined, undefined), undefined);
  assert.ok(secondaryLinesAtEvent('lcq.event.s02_01').some(line => line.id === 'taiyi'));
  assert.deepEqual(secondaryLinesAtEvent('not.real'), []);
});

test('玩家消费面不再读取三级表的 reviewSummary', () => {
  const sidebar = fs.readFileSync('src/components/dashboard/RightSidebar.vue', 'utf8');
  const prompt = fs.readFileSync('src/modules/scenarioMods/storyContext.ts', 'utf8');
  for (const source of [sidebar, prompt]) {
    assert.doesNotMatch(source, /node\.reviewSummary|beat\.reviewSummary/);
    assert.doesNotMatch(source, /node\.text|beat\.text/);
  }
  assert.match(sidebar, /visibleQuestObjective\(rt, event\)/);
  assert.match(sidebar, /resolveScenarioEventNarrative\(event, rt\.flags/);
  assert.match(prompt, /当前主轴目标：\$\{currentWorldObjective\}/);
});

test('复审通过的坏目标由固定表现层覆盖，不改 event 合同', async () => {
  const {
    FIXED_QUEST_OBJECTIVE_OVERRIDES,
    resolveFixedQuestObjective,
  } = await loadTs('../src/modules/scenarioMods/fixedQuestObjectives.ts');
  assert.equal(Object.keys(FIXED_QUEST_OBJECTIVE_OVERRIDES).length, 52);
  assert.equal(
    resolveFixedQuestObjective({
      id: 'lcq.event.s03_12',
      objective: '在不预写灭村真相的前提下进入蛇彝村并安置商队',
    }),
    '进入这座无灯火的蛇彝村，先安置商队',
  );
  assert.equal(
    resolveFixedQuestObjective({ id: 'event.safe', objective: '询问守门人发生了什么' }),
    '询问守门人发生了什么',
  );
});

test('事件叙事视图使用固定目标覆盖，分歧与显式 variant 仍有更高优先级', async () => {
  const { resolveScenarioEventNarrative } = await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
  const base = {
    id: 'lcq.event.s03_12',
    name: '抵达寂静的蛇彝村',
    description: '商队抵达无灯火的村寨。',
    objective: '在不预写灭村真相的前提下进入蛇彝村并安置商队',
    conditions: [],
    effects: [],
  };
  assert.equal(
    resolveScenarioEventNarrative(base, {}, []).objective,
    '进入这座无灯火的蛇彝村，先安置商队',
  );

  const variant = {
    ...base,
    narrativeVariants: [{
      when: [{ path: 'flags.branch.open', operator: 'eq', value: true }],
      objective: '处理分支已经造成的新局面',
    }],
  };
  assert.equal(
    resolveScenarioEventNarrative(variant, { branch: { open: true } }, []).objective,
    '处理分支已经造成的新局面',
  );
});

test('二级线玩家栏不暴露制作进度', () => {
  const sidebar = fs.readFileSync('src/components/dashboard/RightSidebar.vue', 'utf8');
  assert.doesNotMatch(sidebar, /line\.ready|line\.total|line\.pending/);
  assert.doesNotMatch(sidebar, /余待扩/);
});
