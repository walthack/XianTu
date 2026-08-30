import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const fixtureUrl = new URL('./fixtures/scenario-mod/minimal.json', import.meta.url);
const stage02Url = new URL('../mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_02.json', import.meta.url);

function inventorySave() {
  return {
    角色: { 背包: { 物品: {} } },
    世界: { 状态: { 剧本模组: {
      worldTurn: 7,
      canon: {
        items: [{
          id: 'item.demo.token',
          name: '太乙通行令',
          description: '太乙真宗发出的通行信物。',
          type: 'other',
          grade: '玄品',
        }],
      },
      inventoryTransferReceipts: [],
    } } },
  };
}

function opportunityInventorySave(opportunityId) {
  const transfer = {
    inventoryTransfers: [{
      transferId: 'lcq.event.s02_01.inventory.jin_nang',
      itemId: 'lcq.item.jin_nang',
      quantity: 1,
    }],
  };
  const makeOpportunity = (id, firstStepId, firstActionId) => ({
    id,
    title: id,
    characterIds: [],
    whyNow: '此刻交付。',
    nextStep: '接下实物。',
    stakes: '物件归属就此落定。',
    rewardPreview: '取得实物。',
    futureHint: '回执会被保留。',
    actionText: '追踪交付。',
    rewardKey: `${id}.reward`,
    rewardLabel: '锦囊交付',
    completionContract: {
      kind: 'player_action_sequence',
      settlement: 'immediate',
      expiry: 'persistent',
      steps: [{
        id: firstStepId,
        label: '接下锦囊',
        outcomeEffects: transfer,
        actions: [{ id: firstActionId, label: '接下锦囊', actionText: '我收下锦囊实物。', timeCost: 1 }],
        matchAny: ['收下锦囊'],
        rejectIf: ['不接锦囊'],
      }, {
        id: 'decide_mandate',
        label: '说明是否认下差事',
        actions: [{ id: 'state_mandate', label: '说明态度', actionText: '我说明自己是否认下差事。', timeCost: 1 }],
        matchAny: ['说明差事'],
      }],
    },
  });
  const opportunities = [
    makeOpportunity('opportunity.lcq.s02_01.take_full_mandate', 'take_bag', 'accept_silk_bag'),
    makeOpportunity('opportunity.lcq.s02_01.keep_object_only', 'hold_bag', 'hold_silk_object'),
  ];
  return {
    角色: { 背包: { 物品: {} } },
    世界: { 状态: { 剧本模组: {
      modId: 'lcq.stage_02',
      worldTurn: 7,
      currentChapterId: 'chapter.demo',
      chapters: [{ id: 'chapter.demo', eventIds: ['lcq.event.s02_01'] }],
      events: [{
        id: 'lcq.event.s02_01',
        name: '王哲托付锦囊',
        description: '王哲把锦囊交到玩家手中。',
        critical: true,
        completion: [{ path: 'flags.event.s02_01.done', operator: 'eq', value: true }],
        worldActor: {
          pressure: { id: 'pressure.demo', scope: 'local', summary: '帅帐内的托付', intensity: 1, canonPolicy: 'process_only' },
          agendas: [],
          opportunities,
        },
      }],
      completedChapterIds: [],
      activeEventIds: ['lcq.event.s02_01'],
      completedEventIds: [],
      flags: { 'event.s02_01.done': false },
      canon: {
        items: [{
          id: 'lcq.item.jin_nang',
          name: '锦囊',
          description: '王哲亲手托付的锦囊。',
          type: 'other',
          grade: '凡品',
        }],
      },
      inventoryTransferReceipts: [],
      actorEngine: {
        anchorEventId: 'lcq.event.s02_01',
        surfacedAgendaIds: [],
        trackedOpportunityId: opportunityId,
        opportunityStates: {
          [opportunityId]: { status: 'tracked', completionStepIndex: 0, completionChoices: {} },
        },
        receipts: [],
        entitlements: [],
      },
    } } },
  };
}

test('local inventory transfer settles from catalog exactly once across retries', async () => {
  const { settleScenarioInventoryTransfers } = await loadTs('../src/modules/scenarioMods/inventoryTransactions.ts');
  const save = inventorySave();
  const runtime = save.世界.状态.剧本模组;
  const effects = {
    inventoryTransfers: [{
      transferId: 'event.demo.inventory.taiyi_pass',
      itemId: 'item.demo.token',
      quantity: 1,
    }],
  };
  const source = { eventId: 'event.demo', actionId: 'accept_token', outcome: 'success' };

  const first = settleScenarioInventoryTransfers(save, runtime, effects, source);
  const repeated = settleScenarioInventoryTransfers(save, runtime, effects, source);

  assert.equal(first.length, 1);
  assert.deepEqual(repeated, []);
  assert.deepEqual(save.角色.背包.物品['item.demo.token'], {
    物品ID: 'item.demo.token',
    名称: '太乙通行令',
    类型: '其他',
    品质: { quality: '玄', grade: 4 },
    数量: 1,
    描述: '太乙真宗发出的通行信物。',
    已装备: false,
  });
  assert.deepEqual(runtime.inventoryTransferReceipts, [{
    transferId: 'event.demo.inventory.taiyi_pass',
    itemId: 'item.demo.token',
    itemName: '太乙通行令',
    quantity: 1,
    sourceEventId: 'event.demo',
    actionId: 'accept_token',
    outcome: 'success',
    settledAtTurn: 7,
  }]);
});

test('separate transfer ids stack the same catalog item without replacing its identity', async () => {
  const { settleScenarioInventoryTransfers } = await loadTs('../src/modules/scenarioMods/inventoryTransactions.ts');
  const save = inventorySave();
  const runtime = save.世界.状态.剧本模组;
  const source = { eventId: 'event.demo', actionId: 'collect_tokens', outcome: 'success' };

  settleScenarioInventoryTransfers(save, runtime, {
    inventoryTransfers: [{ transferId: 'event.demo.inventory.first', itemId: 'item.demo.token', quantity: 1 }],
  }, source);
  const second = settleScenarioInventoryTransfers(save, runtime, {
    inventoryTransfers: [{ transferId: 'event.demo.inventory.second', itemId: 'item.demo.token', quantity: 2 }],
  }, source);

  assert.equal(save.角色.背包.物品['item.demo.token'].数量, 3);
  assert.equal(second[0].oldValue.数量, 1);
  assert.equal(second[0].newValue.数量, 3);
  assert.equal(runtime.inventoryTransferReceipts.length, 2);
});

test('event action inventory effects use the same local settlement and cannot repeat', async () => {
  const { getCurrentStoryEventActions, recordStoryEventStructuredAction } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = inventorySave();
  Object.assign(save.世界.状态.剧本模组, {
    modId: 'demo.stage',
    currentChapterId: 'demo.chapter',
    chapters: [{ id: 'demo.chapter', eventIds: ['event.demo'] }],
    events: [{
      id: 'event.demo',
      name: '领取通行令',
      description: '守门修士核验身份后交付通行令。',
      objective: '向守门修士说明来意',
      critical: true,
      completion: [{ path: 'flags.event.demo.done', operator: 'eq', value: true }],
      playerCompletionContract: {
        kind: 'objective_action',
        settleOn: ['success'],
        actions: [{
          id: 'accept_token',
          label: '接过太乙通行令',
          actionText: '我向守门修士说明来意，接过太乙通行令。',
          timeCost: 1,
          outcomeText: { success: '身份核验无误，你接过太乙通行令。', partial: '尚待核验。', failure: '核验未过。' },
          outcomeEffects: {
            success: {
              inventoryTransfers: [{
                transferId: 'event.demo.inventory.taiyi_pass',
                itemId: 'item.demo.token',
                quantity: 1,
              }],
            },
          },
        }],
      },
    }],
    completedChapterIds: [],
    activeEventIds: ['event.demo'],
    completedEventIds: [],
    flags: { 'event.demo.done': false },
  });

  const selection = getCurrentStoryEventActions(save)[0];
  const first = recordStoryEventStructuredAction(save, selection);
  const repeated = recordStoryEventStructuredAction(save, selection);

  assert.equal(first.completed, true);
  assert.equal(first.inventorySettlements.length, 1);
  assert.equal(save.角色.背包.物品['item.demo.token'].数量, 1);
  assert.equal(repeated.reason, 'already_completed');
  assert.equal(save.世界.状态.剧本模组.inventoryTransferReceipts.length, 1);
});

test('validator rejects unknown, malformed, or duplicate inventory transfers', async () => {
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const raw = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  const event = raw.scenario.events[0];
  event.playerCompletionContract = {
    kind: 'objective_action',
    settleOn: ['success'],
    actions: [{
      id: 'accept_token',
      label: '接过信物',
      actionText: '我接过信物。',
      timeCost: 1,
      outcomeText: { success: '接过信物。', partial: '尚未交付。', failure: '交付失败。' },
      outcomeEffects: {
        success: {
          inventoryTransfers: [
            { transferId: `${event.id}.inventory.token`, itemId: 'item.missing', quantity: 0 },
            { transferId: `${event.id}.inventory.token`, itemId: raw.content.items[0].id, quantity: 1 },
          ],
        },
      },
    }],
  };

  const result = validateScenarioMod(raw);
  assert.ok(result.issues.some(issue => issue.path.endsWith('.itemId') && issue.code === 'unknown_reference'));
  assert.ok(result.issues.some(issue => issue.path.endsWith('.quantity') && issue.code === 'invalid_range'));
  assert.ok(result.issues.some(issue => issue.path.endsWith('.transferId') && issue.code === 'duplicate_id'));
});

test('inventory transfer receipts survive a deterministic stage transition', async () => {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const {
    applyStrictScenarioInitializationToSave,
    buildStrictScenarioInitialization,
    transitionToNextScenarioStage,
  } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const currentRaw = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  const nextRaw = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  currentRaw.manifest.nextStageId = 'demo.next';
  currentRaw.manifest.nextStageName = '下一关';
  nextRaw.manifest.id = 'demo.next';
  nextRaw.manifest.name = '下一关';
  nextRaw.manifest.nextStageId = null;
  nextRaw.manifest.nextStageName = null;
  const current = parseScenarioMod(currentRaw);
  const next = parseScenarioMod(nextRaw);
  const save = applyStrictScenarioInitializationToSave({
    角色: { 位置: { 描述: '旧地点' } },
    世界: { 信息: {}, 状态: {} },
    系统: { 扩展: {} },
  }, buildStrictScenarioInitialization(current));
  const runtime = save.世界.状态.剧本模组;
  runtime.nextStageReadyId = 'demo.next';
  runtime.inventoryTransferReceipts = [{
    transferId: 'event.demo.inventory.taiyi_pass',
    itemId: 'item.demo.token',
    itemName: '太乙通行令',
    quantity: 1,
    sourceEventId: 'event.demo',
    actionId: 'accept_token',
    outcome: 'success',
    settledAtTurn: 7,
  }];

  const transitioned = transitionToNextScenarioStage(save, [next]);

  assert.equal(transitioned.ok, true, transitioned.reason);
  assert.deepEqual(
    transitioned.saveData.世界.状态.剧本模组.inventoryTransferReceipts,
    runtime.inventoryTransferReceipts,
  );
});

test('both Wang Zhe receipt routes grant the same physical silk bag exactly once', async () => {
  const { getTrackedStoryOpportunityActions, recordStoryOpportunityStructuredAction } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  for (const opportunityId of [
    'opportunity.lcq.s02_01.take_full_mandate',
    'opportunity.lcq.s02_01.keep_object_only',
  ]) {
    const save = opportunityInventorySave(opportunityId);
    const [selection] = getTrackedStoryOpportunityActions(save);
    const first = recordStoryOpportunityStructuredAction(save, selection);
    const repeated = recordStoryOpportunityStructuredAction(save, selection);

    assert.equal(first.progressed, true);
    assert.equal(first.inventorySettlements?.length, 1);
    assert.equal(save.角色.背包.物品['lcq.item.jin_nang'].数量, 1);
    assert.equal(save.世界.状态.剧本模组.inventoryTransferReceipts.length, 1);
    assert.equal(repeated.inventorySettlements, undefined);
    assert.equal(save.角色.背包.物品['lcq.item.jin_nang'].数量, 1);
  }
});

test('repeat 收下锦囊 after jin_nang receipt stays local and does not invent loot or a second grant', async () => {
  const {
    recordStoryOpportunityPlayerAction,
    getTrackedStoryOpportunityActions,
    previewRepeatSilkPouchClaimNarrative,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = opportunityInventorySave('opportunity.lcq.s02_01.take_full_mandate');
  const mandate = save.世界.状态.剧本模组.events[0].worldActor.opportunities
    .find(item => item.id === 'opportunity.lcq.s02_01.take_full_mandate');
  mandate.completionContract.steps[1].id = 'own_charge';
  mandate.completionContract.steps[1].actions[0].label = '认下托付';
  mandate.completionContract.steps[1].actions[0].actionText =
    '我承认清理门户与传授九阳是我接下来要办的差事，不改口说只是代为保管。';

  assert.equal(previewRepeatSilkPouchClaimNarrative(save, { playerActionText: '我当面收下锦囊' }), '');

  const first = recordStoryOpportunityPlayerAction(save, '我当面收下锦囊。');
  assert.equal(first.progressed, true);
  assert.equal(first.inventorySettlements?.length, 1);
  assert.equal(save.角色.背包.物品['lcq.item.jin_nang'].数量, 1);
  assert.equal(save.世界.状态.剧本模组.inventoryTransferReceipts.length, 1);

  save.世界.状态.剧本模组.worldTurn += 1;
  const text = previewRepeatSilkPouchClaimNarrative(save, { playerActionText: '我当面收下锦囊' });
  assert.equal(text, '锦囊已经收妥，接下来需要认下托付。');
  assert.doesNotMatch(text, /令牌|缺口|过哨|西边|路线|获得/);
  assert.equal((text.match(/获得/g) || []).length, 0);

  const repeated = recordStoryOpportunityPlayerAction(save, '我当面收下锦囊');
  assert.equal(repeated.progressed, false);
  assert.equal(save.角色.背包.物品['lcq.item.jin_nang'].数量, 1);
  assert.equal(save.世界.状态.剧本模组.inventoryTransferReceipts.length, 1);
  assert.deepEqual(Object.keys(save.角色.背包.物品), ['lcq.item.jin_nang']);

  const next = getTrackedStoryOpportunityActions(save);
  assert.equal(next.length, 1);
  assert.match(next[0].label, /推进·2\/2/);
  assert.match(next[0].label, /认下托付/);

  assert.equal(previewRepeatSilkPouchClaimNarrative(save, {
    playerActionText: '我承认清理门户与传授九阳是我接下来要办的差事，不改口说只是代为保管。',
  }), '');
  assert.equal(previewRepeatSilkPouchClaimNarrative(save, {
    opportunityAction: {
      source: 'opportunity_engine',
      opportunityId: next[0].opportunityId,
      stepId: 'own_charge',
      actionId: next[0].actionId,
      label: next[0].label,
      actionText: next[0].actionText,
      timeCost: 1,
      contractHash: next[0].contractHash,
    },
  }), '');
  assert.equal(previewRepeatSilkPouchClaimNarrative(save, {
    opportunityAction: {
      source: 'opportunity_engine',
      opportunityId: first.opportunityId,
      stepId: 'take_bag',
      actionId: 'accept_silk_bag',
      label: '【推进·1/2】收下锦囊',
      actionText: '我当面从王哲案上收下锦囊，不让它再留在帐内无人认领。',
      timeCost: 1,
      contractHash: next[0].contractHash,
    },
  }), '锦囊已经收妥，接下来需要认下托付。');
});

test('repeat silk-pouch claim is wired before 154KB Legacy', async () => {
  const system = await readFile(new URL('../src/utils/AIBidirectionalSystem.ts', import.meta.url), 'utf8');
  const start = system.indexOf('if (!legacyNarrativePilotResponse)');
  const slice = system.slice(start, system.indexOf('const v3 = isSaveDataV3'));
  assert.match(slice, /previewRepeatSilkPouchClaimNarrative/);
  assert.match(slice, /noteTurnPath\('local_contract'\)/);
  assert.match(slice, /if \(!localContractText\)/);
});

test('after the silk opportunity is gone, claiming 收下锦囊 does not invent possession', async () => {
  const { clarifyUnobtainedSilkPouchNarrative } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = opportunityInventorySave('opportunity.lcq.s02_01.take_full_mandate');
  save.世界.状态.剧本模组.completedEventIds = ['lcq.event.s02_01'];
  save.世界.状态.剧本模组.activeEventIds = ['lcq.event.s02_03'];
  save.世界.状态.剧本模组.flags['event.s02_01.done'] = true;
  save.世界.状态.剧本模组.actorEngine = { trackedOpportunityId: undefined, opportunityStates: {} };
  const clarified = clarifyUnobtainedSilkPouchNarrative(save, '你从王哲案上收下锦囊，收入背包。');
  assert.match(clarified, /锦囊仍未到手/);
  assert.equal(save.角色.背包.物品['lcq.item.jin_nang'], undefined);
  const keep = clarifyUnobtainedSilkPouchNarrative(save, '你听他把三件事说完，锦囊还在案上。');
  assert.match(keep, /还在案上/);
});

test('opportunity free text grants only on the physical receipt step, never on refusal or later mandate text', async () => {
  const { recordStoryOpportunityPlayerAction } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = opportunityInventorySave('opportunity.lcq.s02_01.take_full_mandate');

  const refused = recordStoryOpportunityPlayerAction(save, '我不接锦囊，只听他说完。');
  assert.equal(refused.progressed, false);
  assert.equal(save.角色.背包.物品['lcq.item.jin_nang'], undefined);

  const received = recordStoryOpportunityPlayerAction(save, '我当面收下锦囊。');
  assert.equal(received.progressed, true);
  assert.equal(received.inventorySettlements?.length, 1);
  assert.equal(save.角色.背包.物品['lcq.item.jin_nang'].数量, 1);

  save.世界.状态.剧本模组.worldTurn += 1;
  const mandate = recordStoryOpportunityPlayerAction(save, '我说明差事，但不再领取任何物件。');
  assert.equal(mandate.progressed, true);
  assert.equal(mandate.inventorySettlements, undefined);
  assert.equal(save.角色.背包.物品['lcq.item.jin_nang'].数量, 1);
});

test('stage02 validator accepts identical mutually-exclusive transfer alias and rejects conflicting reuse', async () => {
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const raw = JSON.parse(await readFile(stage02Url, 'utf8'));
  const valid = validateScenarioMod(raw);
  assert.ok(!valid.issues.some(issue => issue.path.includes('jin_nang') && issue.code === 'duplicate_id'), JSON.stringify(valid.issues));

  const event = raw.scenario.events.find(item => item.id === 'lcq.event.s02_01');
  const second = event.worldActor.opportunities
    .find(item => item.id === 'opportunity.lcq.s02_01.keep_object_only')
    .completionContract.steps[0].outcomeEffects.inventoryTransfers[0];
  second.quantity = 2;
  const conflicting = validateScenarioMod(raw);
  assert.ok(conflicting.issues.some(issue => issue.path.endsWith('.transferId') && issue.code === 'duplicate_id'));
});

test('generic event completion for hearing Wang Zhe does not contain a silk-bag grant', async () => {
  const raw = JSON.parse(await readFile(stage02Url, 'utf8'));
  const event = raw.scenario.events.find(item => item.id === 'lcq.event.s02_01');
  const transfers = event.playerCompletionContract.actions
    .flatMap(action => Object.values(action.outcomeEffects || {}))
    .flatMap(effects => effects.inventoryTransfers || []);
  assert.deepEqual(transfers, []);
});
