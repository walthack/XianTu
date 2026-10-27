// 右栏「当前线」卡接线（用户 2026-10-27 09:26 定 Q1/Q2）：开关关时不算；开时取代主线指南针那一行，没有当前线退回原指南针句；
// 「别处还有事」默认收起；与「可投的门路」（ui.rightSidebar.showSecondaryLines）两块不并存；人物任务 characterBeats 不受影响。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
const compass = await loadTs('../src/modules/scenarioMods/lineCompass.ts');
const sidebar = await loadTs('../src/modules/scenarioMods/sidebarLineEntries.ts');
const saveOf = () => ({ 角色: { 属性: { 境界: { 名称: '坐照' } } }, 世界: { 状态: { 剧本模组: {
  modId: 'lcq.stage_02', events: [], completedEventIds: [], flags: {}, acquaintances: {},
  chronicle: [{ id: 'chronicle.lcq.stage_02.lcq.event.s02_01', type: 'event', stageId: 'lcq.stage_02', title: '', sequence: 1 }],
} } } });

test('右栏接线：开关关时不算；开时取代主线指南针那一行、没有当前线退回原指南针句；与「可投的门路」不并存；人物任务不读开关', () => {
  const vue = fs.readFileSync('src/components/dashboard/RightSidebar.vue', 'utf8');
  const block = vue.slice(vue.indexOf('const lineCompass = computed('), vue.indexOf('const characterBeats = computed('));
  assert.match(block, /^const lineCompass = computed\(\(\) => \{\n  if \(!showLineCompass\(\)\) return null;/);
  assert.match(block, /compassPointer: \(\) => questCompassPhrases\(view, rt, at\)\.join\(' · '\)/);
  assert.match(block, /const fallback = view \? String\(formatQuestCompass\(view, rt, at\) \|\| view\.objective \|\| view\.name/);
  const main = vue.slice(vue.indexOf('const questMain = computed('));
  assert.match(main, /const compassReplaced = showLineCompass\(\) && events\.length > 0;/);
  assert.match(main, /events: compassReplaced \? \[\] : events,/);
  assert.match(vue, /<div v-if="lineCompass" class="quest-main quest-line-card">/);
  assert.match(vue, /<div v-else-if="lineCompass\.fallback" class="quest-event">/);
  assert.match(vue, /const lineOthersOpen = ref\(false\);/, '「别处还有事」默认收起');
  const beats = vue.slice(vue.indexOf('const characterBeats = computed('), vue.indexOf('const questMain = computed('));
  assert.doesNotMatch(beats, /showLineCompass|lineCompass/);
  // 两块不并存：当前线卡开着时「可投的门路」为空
  numbers.applyGameNumbers({ ui: { rightSidebar: { showSecondaryLines: true, showLineCompass: true } } });
  try {
    assert.equal(sidebar.showSecondaryLines(), false);
    assert.equal(compass.showLineCompass(), true);
    assert.deepEqual(sidebar.sidebarAvailableLines(saveOf().世界.状态.剧本模组, saveOf(), undefined, undefined, () => ''), []);
  } finally {
    numbers.applyGameNumbers({ ui: { rightSidebar: { showSecondaryLines: false, showLineCompass: false } } });
  }
  assert.throws(() => numbers.applyGameNumbers({ ui: { rightSidebar: { showLineCompass: 1 } } }), err => err.code === 'LCQ-NUM-003');
});
