// 支线引擎上下文读编年史（右栏线入口复用分析 2026-10-27 §3-1／§7-1 遗留项）：上一关完成的事件切关后仍算已完成。
// 旧实现读 rt.completedEventIds，切关时按新关重置，eventDone 条件在下一关就判不到。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const init = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const opening = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
const pack = await loadTs('../src/modules/contentPacks/index.ts');
const ctxmod = await loadTs('../src/modules/scenarioMods/questLineContext.ts');
const q = await loadTs('../src/modules/scenarioMods/questLines.ts');

const read = async id => pack.applyContentPackOverlays(JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`, import.meta.url))));
const first = await read('lcq.stage_01'), s05 = await read('lcq.stage_05b'), s07 = await read('lcq.stage_07_qingyuan_jiankang');

// 白虎线 eventDone 用到的 04b 事件
const PREV_STAGE = 'lcq.stage_04b_lingfei_baiyi_crisis';
const PREV = 'lcq.event.s04b_lingfei_baiyi_crisis_07';
const chronicleEntry = (stageId, eventId, sequence) => ({ id: `chronicle.${stageId}.${eventId}`, type: 'event', stageId, title: '', sequence });

function save05() {
  const save = init.applyStrictScenarioInitializationToSave(opening.createQingyuOpeningPlaytestSave(first), init.buildStrictScenarioInitialization(s05));
  const r = save.世界.状态.剧本模组;
  r.chronicle = [...(r.chronicle || []), chronicleEntry(PREV_STAGE, PREV, (r.chronicle || []).length + 1)];
  r.nextStageId = s07.manifest.id;
  r.nextStageReadyId = s07.manifest.id;
  return save;
}

test('切关后上一关事件只在编年史里：questLineContext 仍算已完成，eventDone 条件成立', () => {
  const save = save05();
  const r = save.世界.状态.剧本模组;
  assert.ok(!r.completedEventIds.includes(PREV), '前提：本关 completedEventIds 不含上一关事件');
  const ctx = ctxmod.questLineContext(save);
  assert.ok(ctx.completedEventIds.includes(PREV));
  assert.equal(q.lineConditionMet({ eventDone: PREV }, ctx), true);
  assert.equal(new Set(ctx.completedEventIds).size, ctx.completedEventIds.length, '不重复');
});

test('再切一关（05b → 07）仍算已完成；没完成的事件仍不算', () => {
  const out = init.transitionToNextScenarioStage(JSON.parse(JSON.stringify(save05())), [s07]);
  assert.equal(out.ok, true, out.reason);
  const r = out.saveData.世界.状态.剧本模组;
  assert.equal(r.modId, s07.manifest.id);
  assert.ok(!r.completedEventIds.includes(PREV));
  const ctx = ctxmod.questLineContext(out.saveData);
  assert.equal(q.lineConditionMet({ eventDone: PREV }, ctx), true);
  assert.equal(q.lineConditionMet({ eventDone: 'lcq.event.s04b_lingfei_baiyi_crisis_08' }, ctx), false);
});
