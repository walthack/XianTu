import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const S03B = 'lcq.stage_03b_snake_flower_bridge';
const stage = async id => JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`, import.meta.url), 'utf8'));
const rt = save => save.世界.状态.剧本模组;

async function opened(id) {
  const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
  const { buildStrictScenarioInitialization, applyStrictScenarioInitializationToSave } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  return advanceScenarioRuntime(applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), buildStrictScenarioInitialization(await stage(id)))).saveData;
}

/** 走到 bridge_06（强制路过巨藤落到花苗寨之后）。 */
async function toBridge06(save) {
  const { getCurrentStoryEventActions, getCurrentStoryExplorationActions, recordStoryEventStructuredAction, advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  for (let n = 0; n < 80; n++) {
    const focus = (await loadTs('../src/modules/scenarioMods/runtime.ts')).getScenarioFocusEvent(rt(save));
    if (focus?.id === 'lcq.event.s03b_snake_flower_bridge_06') return save;
    const actions = getCurrentStoryEventActions(save);
    const action = getCurrentStoryExplorationActions(save).find(item => item.eventId === 'lcq.event.zhu88_heimohai_chat' || rt(save).events.find(event => event.id === item.eventId)?.questLineBeatId)
      || actions.find(item => !item.judgement && !item.actionId.startsWith('travel:') && !item.actionId.startsWith('idle:')
        && rt(save).events.find(event => event.id === item.eventId)?.playerCompletionContract?.actions.some(entry => entry.id === item.actionId))
      || actions.find(item => item.actionId.startsWith('travel:'));
    assert.ok(action, `stalled at ${focus?.id}: ${JSON.stringify(actions.map(a => a.actionId))}`);
    rt(save).worldTurn++;
    assert.equal(recordStoryEventStructuredAction(save, action).attempted, true);
    save = advanceScenarioRuntime(save).saveData;
  }
  throw new Error('did not reach bridge_06');
}

test('内容：bridge_05/06 场景地点以母地点为准（子地点括注）', async () => {
  const mod = await stage(S03B);
  const e5 = mod.scenario.events.find(e => e.id === 'lcq.event.s03b_snake_flower_bridge_05');
  const e6 = mod.scenario.events.find(e => e.id === 'lcq.event.s03b_snake_flower_bridge_06');
  assert.equal(e5.objective, '攀爬万古巨藤，脱困上行');
  assert.equal(e5.playerCompletionContract.actions[0].sceneLocation, '万古巨藤（半空石壁）');
  assert.equal(e6.playerCompletionContract.actions[0].sceneLocation, '花苗寨（巨藤崖顶）');
});

test('被叙事覆盖后能纠正回花苗寨：描述写崖顶后 refresh 改偏 locationId，advance 以行旅账重投影', async () => {
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { refreshSaveEntityReferences } = await loadTs('../src/modules/scenarioMods/entitySaveRefs.ts');
  let save = await toBridge06(await opened(S03B));
  assert.equal(rt(save).travelLedger.state.currentZoneId, 'nh.huamiao');
  assert.equal(save.角色.位置.locationId, 'lcq.location.huamiao_village');
  assert.equal(save.角色.位置.描述, '南荒·花苗寨');

  // 复现调查结论：叙事把描述写成巨藤子地点细节 → refresh 按描述把 locationId 推回 giant_vine
  save.角色.位置.描述 = '南荒·万古巨藤·崖顶旧猎道岩肩窄缝';
  refreshSaveEntityReferences(save);
  assert.equal(save.角色.位置.locationId, 'lcq.location.giant_vine');
  assert.equal(rt(save).travelLedger.state.currentZoneId, 'nh.huamiao', 'zone 仍是花苗寨');

  save = advanceScenarioRuntime(save).saveData;
  assert.equal(rt(save).travelLedger.state.currentZoneId, 'nh.huamiao');
  assert.equal(save.角色.位置.locationId, 'lcq.location.huamiao_village');
  assert.equal(save.角色.位置.描述, '南荒·花苗寨');
});
