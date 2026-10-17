import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stage01Url = new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_01.json', import.meta.url);
const stage02Url = new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_02.json', import.meta.url);
const S02_01 = 'lcq.event.s02_01';
const TAKE_MANDATE = 'opportunity.lcq.s02_01.take_full_mandate';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

async function stage02Fixture() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const { createQingyuOpeningPlaytestSave } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const { transitionToNextScenarioStage } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const [raw01, raw02] = await Promise.all([readFile(stage01Url, 'utf8'), readFile(stage02Url, 'utf8')]);
  const stage01 = parseScenarioMod(JSON.parse(raw01));
  const stage02 = parseScenarioMod(JSON.parse(raw02));
  const stage01Save = createQingyuOpeningPlaytestSave(stage01);
  const source = cloneJson(stage01Save);
  source.世界.状态.剧本模组.nextStageReadyId = 'lcq.stage_02';
  const transitioned = transitionToNextScenarioStage(source, [stage02]);
  assert.equal(transitioned.ok, true, transitioned.reason);
  const save = transitioned.saveData;
  if (save.系统?.扩展?.清羽记开局?.kind !== 'qingyu-demo-v1') {
    save.系统 = save.系统 || {};
    save.系统.扩展 = save.系统.扩展 || {};
    save.系统.扩展.清羽记开局 = cloneJson(stage01Save.系统.扩展.清羽记开局);
  }
  assert.equal(save.世界.状态.剧本模组.modId, 'lcq.stage_02');
  assert.equal(save.系统.扩展.清羽记开局.kind, 'qingyu-demo-v1');
  return save;
}

function locateEvent(save, eventId, extra) {
  const rt = save.世界.状态.剧本模组;
  const chapter = (rt.chapters || []).find(item => (item.eventIds || []).includes(eventId));
  assert.ok(chapter, `chapter containing ${eventId} must exist in parsed stage_02`);
  rt.currentChapterId = chapter.id;
  rt.activeEventIds = [eventId];
  rt.completedEventIds = extra.completedEventIds;
  rt.flags = { ...(rt.flags || {}), ...extra.flags };
}

test('qingyu demo structured opportunityAction renders from local receipts and never invents loot', async () => {
  const { previewQingyuOpportunityNarrative } = await loadTs('../src/modules/scenarioMods/qingyuOpportunityNarrative.ts');
  const {
    getTrackedStoryOpportunityActions,
    recordStoryOpportunityStructuredAction,
    trackStoryOpportunity,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = await stage02Fixture();
  locateEvent(save, S02_01, {
    completedEventIds: [],
    flags: { 'event.s02_01.done': false, 'chapter.lcq.stage_02.started': true },
  });
  assert.equal(trackStoryOpportunity(save, TAKE_MANDATE).ok, true);
  const firstSelection = getTrackedStoryOpportunityActions(save)[0];
  const before = JSON.stringify(save);

  const firstText = previewQingyuOpportunityNarrative(save, firstSelection);
  assert.match(firstText, /锦囊已经到手/);
  assert.match(firstText, /接下来需要认下托付/);
  assert.doesNotMatch(firstText, /令牌|旧帕|缺口|过哨|获得|回执|落账|机制/);
  assert.equal(JSON.stringify(save), before, 'preview must not mutate the live save');

  const first = recordStoryOpportunityStructuredAction(save, firstSelection);
  assert.equal(first.progressed, true);
  assert.equal(save.角色.背包.物品['lcq.item.jin_nang'].数量, 1);
  save.世界.状态.剧本模组.worldTurn += 1;

  const secondSelection = getTrackedStoryOpportunityActions(save)[0];
  assert.match(secondSelection.label, /认下托付/);
  const secondText = previewQingyuOpportunityNarrative(save, secondSelection);
  assert.match(secondText, /眼前这一步已经做完/);
  assert.doesNotMatch(secondText, /令牌|旧帕|缺口|过哨|获得|已经到手/);
  assert.equal(save.角色.背包.物品['lcq.item.jin_nang'].数量, 1);
  assert.equal(save.世界.状态.剧本模组.inventoryTransferReceipts.length, 1);

  const stale = previewQingyuOpportunityNarrative(save, firstSelection);
  assert.match(stale, /已经过期/);
  assert.doesNotMatch(stale, /令牌|旧帕/);

  const unmarked = cloneJson(save);
  delete unmarked.系统.扩展.清羽记开局;
  assert.equal(previewQingyuOpportunityNarrative(unmarked, secondSelection), '');
});
