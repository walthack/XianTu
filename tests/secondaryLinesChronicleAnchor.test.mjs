// 锚读编年史（右栏线入口复用分析 2026-10-27 §3-1、Q10 总策划定）：锚事件在上一关完成，切关后线仍为已知。
// 旧实现读 rt.completedEventIds，切关时按新关重置，线只在锚事件所在那一关亮。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const init = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const opening = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
const pack = await loadTs('../src/modules/contentPacks/index.ts');
const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
const secondary = { ...await loadTs('../src/modules/scenarioMods/secondaryLines.ts'), ...await loadTs('../src/modules/scenarioMods/secondaryLineEntry.ts') };
const entries = await loadTs('../src/modules/scenarioMods/sidebarLineEntries.ts');

const read = async id => pack.applyContentPackOverlays(JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`, import.meta.url))));
const first = await read('lcq.stage_01'), s05 = await read('lcq.stage_05b'), s07 = await read('lcq.stage_07_qingyuan_jiankang');

// 黑魔海锚：云苍峰解读羊皮纸那一拍，在 04b 关
const ANCHOR_STAGE = 'lcq.stage_04b_lingfei_baiyi_crisis';
const ANCHOR = 'lcq.event.s04b_lingfei_baiyi_crisis_04';
const chronicleEntry = (stageId, eventId, sequence) => ({ id: `chronicle.${stageId}.${eventId}`, type: 'event', stageId, title: '', sequence });

// 已从 04b 切进 05b 的存档：锚只在编年史里，本关 completedEventIds 已按新关重置
function save05() {
  const save = init.applyStrictScenarioInitializationToSave(opening.createQingyuOpeningPlaytestSave(first), init.buildStrictScenarioInitialization(s05));
  const r = save.世界.状态.剧本模组;
  r.chronicle = [...(r.chronicle || []), chronicleEntry(ANCHOR_STAGE, ANCHOR, (r.chronicle || []).length + 1)];
  r.nextStageId = s07.manifest.id;
  r.nextStageReadyId = s07.manifest.id;
  return save;
}

const ids = lines => lines.map(l => l.id);

test('切关后锚只在编年史里：knownSecondaryLines 仍判已知，旧口径（本关 completedEventIds）判不到', () => {
  const save = save05();
  const r = save.世界.状态.剧本模组;
  assert.ok(!r.completedEventIds.includes(ANCHOR), '前提：本关 completedEventIds 不含上一关的锚');
  assert.ok(!ids(secondary.resolveAvailableLines(undefined, r.acquaintances, r.completedEventIds)).includes('heimohai'), '旧口径会丢线（缺陷复现）');
  assert.ok(ids(secondary.knownSecondaryLines(r)).includes('heimohai'));
});

test('再切一关（05b → 07）仍为已知；右栏「可投的门路」开关打开时也照样列出', () => {
  const out = init.transitionToNextScenarioStage(JSON.parse(JSON.stringify(save05())), [s07]);
  assert.equal(out.ok, true, out.reason);
  const r = out.saveData.世界.状态.剧本模组;
  assert.equal(r.modId, s07.manifest.id);
  assert.ok(!r.completedEventIds.includes(ANCHOR));
  assert.ok(ids(secondary.knownSecondaryLines(r)).includes('heimohai'));
  numbers.applyGameNumbers({ ui: { rightSidebar: { showSecondaryLines: true, showLineCompass: false } } });
  try {
    assert.ok(ids(entries.sidebarAvailableLines(r, out.saveData, undefined, undefined, () => '')).includes('heimohai'));
  } finally {
    numbers.applyGameNumbers({ ui: { rightSidebar: { showSecondaryLines: false, showLineCompass: true } } });
  }
});

test('本关刚完成、编年史尚未落账的同回合空档也算（orderedDoneEventIds 补本关完成）；没完成的仍不开', () => {
  const save = save05();
  const r = save.世界.状态.剧本模组;
  r.chronicle = r.chronicle.filter(e => !e.id.endsWith(ANCHOR));
  assert.ok(!ids(secondary.knownSecondaryLines(r)).includes('heimohai'));
  r.completedEventIds = [...r.completedEventIds, ANCHOR];
  assert.ok(ids(secondary.knownSecondaryLines(r)).includes('heimohai'));
});

test('右栏列表不再读 rt.completedEventIds', async () => {
  const src = await readFile(new URL('../src/modules/scenarioMods/sidebarLineEntries.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /completedEventIds/);
  assert.match(src, /knownSecondaryLines\(rt, locationId\)/);
});
