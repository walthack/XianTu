import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

async function subject() {
  return loadTs('../src/modules/scenarioMods/openWorldSlice.ts');
}

function definition() {
  return {
    id: 'slice.demo',
    initialZoneId: 'zone.square',
    zones: [
      { id: 'zone.square', name: '集市', aliases: ['市集'] },
      { id: 'zone.shop', name: '点心铺', aliases: ['糕饼铺'] },
      { id: 'zone.yard', name: '后院', aliases: ['院子'] },
      { id: 'zone.hidden', name: '水牢', aliases: ['地牢'] },
    ],
    routes: [
      { id: 'route.square.shop', fromZoneId: 'zone.square', toZoneId: 'zone.shop', label: '穿过人群走街面', turnCost: 2 },
      { id: 'route.square.yard', fromZoneId: 'zone.square', toZoneId: 'zone.yard', label: '绕小巷', turnCost: 1, requirementKey: 'knows_alley' },
      { id: 'route.shop.square', fromZoneId: 'zone.shop', toZoneId: 'zone.square', label: '原路返回', turnCost: 2 },
      { id: 'route.shop.hidden', fromZoneId: 'zone.shop', toZoneId: 'zone.hidden', label: '被押往地下', turnCost: 1 },
    ],
    notices: [{
      id: 'notice.alley', source: '旧货摊边的手写木牌', reliability: 'rumor',
      text: '有人说点心铺后巷可以绕开最拥挤的街面。', atZoneId: 'zone.square',
      unlockZoneIds: ['zone.yard'], unlockRouteIds: ['route.square.yard'],
    }],
    actors: [{ id: 'actor.legal', name: '合法角色', initialZoneId: 'zone.shop', desire: '护住自己的生意', initialStatus: '观望' }],
    problems: [{
      id: 'problem.pressure', atZoneId: 'zone.shop', title: '铺内纠缠', objective: '在不知对方底细时应付逼近的人',
      initialState: 'confronted', actionIds: ['action.talk', 'action.resist'],
    }],
    actions: [
      {
        id: 'action.talk', problemId: 'problem.pressure', label: '拖住话头', actionText: '你先用话头拖住对方并观察退路',
        aliases: ['拖住话头', '先交涉'], rejectIf: ['不交涉'], availableInStates: ['confronted'], outcome: 'partial',
        nextProblemState: 'watched', settledFacts: ['对方没有立刻动手', '你看清了后门方向'], costs: ['暴露外地口音'],
        consequences: [
          { id: 'short', delayTurns: 4, actorId: 'actor.legal', cause: '你用话头拖延并暴露了外地口音', effect: '铺中人开始留意你的来历', apply: { actorStatus: '暗中留意' } },
          { id: 'long', delayTurns: 12, actorId: 'actor.legal', cause: '你先前没有当街动手', effect: '有人愿意留下一个继续周旋的机会', apply: { actorStatus: '愿意再谈', problemId: 'problem.pressure', problemState: 'new_opening' } },
        ],
      },
      {
        id: 'action.resist', problemId: 'problem.pressure', label: '抢先脱身', actionText: '你抢先撞开桌案寻找退路',
        aliases: ['抢先脱身', '撞开桌案'], rejectIf: ['不动手'], availableInStates: ['confronted'], outcome: 'failure-forward',
        nextProblemState: 'captured_but_alert', settledFacts: ['退路被更多人封住', '你记住了押送方向'], costs: ['受伤'],
      },
    ],
  };
}

async function state(overrides = {}) {
  const { hydrateOpenWorldSliceRuntime } = await subject();
  return hydrateOpenWorldSliceRuntime({
    knownZoneIds: ['zone.square', 'zone.shop', 'zone.hidden'],
    knownRouteIds: ['route.square.shop', 'route.shop.square', 'route.shop.hidden'],
    ...overrides,
  }, definition());
}

test('travel matcher only selects one known adjacent destination and returns stable identity', async () => {
  const { matchOpenWorldTravelInput } = await subject();
  const runtime = await state();
  assert.deepEqual(matchOpenWorldTravelInput(runtime, definition(), '我穿过人群去点心铺看看'), {
    status: 'matched', value: { routeId: 'route.square.shop', destinationZoneId: 'zone.shop' },
  });
  assert.equal(matchOpenWorldTravelInput(runtime, definition(), '我去水牢').status, 'none');
  assert.equal(matchOpenWorldTravelInput(runtime, definition(), '我去未知客栈').status, 'none');
});

test('negation wins and multiple reachable destinations fail closed', async () => {
  const { matchOpenWorldTravelInput } = await subject();
  const runtime = await state({
    knownZoneIds: ['zone.square', 'zone.shop', 'zone.yard'],
    knownRouteIds: ['route.square.shop', 'route.square.yard'], requirements: ['knows_alley'],
  });
  assert.equal(matchOpenWorldTravelInput(runtime, definition(), '我暂时不去点心铺').status, 'negated');
  assert.equal(matchOpenWorldTravelInput(runtime, definition(), '先去点心铺，也可能绕后院').status, 'ambiguous');
});

test('travel settlement revalidates route, requirement, adjacency, idempotency and receipt identity', async () => {
  const { settleOpenWorldTravel } = await subject();
  const runtime = await state();
  assert.equal(settleOpenWorldTravel(runtime, definition(), 'route.square.yard', 'travel:blocked').reason, 'not_known');
  const first = settleOpenWorldTravel(runtime, definition(), 'route.square.shop', 'travel:1');
  assert.equal(first.status, 'settled');
  assert.equal(runtime.currentZoneId, 'zone.shop');
  assert.equal(runtime.elapsedTurns, 2);
  assert.equal(settleOpenWorldTravel(runtime, definition(), 'route.square.shop', 'travel:1').status, 'idempotent');
  assert.equal(runtime.elapsedTurns, 2);
  assert.equal(settleOpenWorldTravel(runtime, definition(), 'route.shop.square', 'travel:1').reason, 'receipt_conflict');
  assert.match(runtime.chronicle[0].text, /^因为.+，所以.+$/);
});

test('known required route remains unavailable until requirement exists', async () => {
  const { settleOpenWorldTravel } = await subject();
  const runtime = await state({ knownZoneIds: ['zone.square', 'zone.yard'], knownRouteIds: ['route.square.yard'] });
  assert.equal(settleOpenWorldTravel(runtime, definition(), 'route.square.yard', 'travel:req').reason, 'requirement_missing');
  runtime.requirements.push('knows_alley');
  assert.equal(settleOpenWorldTravel(runtime, definition(), 'route.square.yard', 'travel:req2').status, 'settled');
});

test('authored notice preserves source and rumor status while unlocking only declared routes', async () => {
  const { presentOpenWorldNotice, readOpenWorldNotice } = await subject();
  const runtime = await state({ knownZoneIds: ['zone.square', 'zone.shop'], knownRouteIds: ['route.square.shop'] });
  assert.match(presentOpenWorldNotice(definition().notices[0]), /来源：旧货摊边的手写木牌｜可信度：传闻/);
  assert.equal(readOpenWorldNotice(runtime, definition(), 'notice.alley', 'notice:1').status, 'settled');
  assert.ok(runtime.knownZoneIds.includes('zone.yard'));
  assert.ok(runtime.knownRouteIds.includes('route.square.yard'));
  assert.equal(readOpenWorldNotice(runtime, definition(), 'notice.alley', 'notice:1').status, 'idempotent');
});

test('natural and structured problem actions converge on one settlement gate', async () => {
  const { matchOpenWorldProblemAction, settleOpenWorldProblemAction } = await subject();
  const naturalState = await state({ currentZoneId: 'zone.shop' });
  const matched = matchOpenWorldProblemAction(naturalState, definition(), 'problem.pressure', '我先交涉，拖住话头');
  assert.deepEqual(matched, { status: 'matched', value: { actionId: 'action.talk' } });
  const natural = settleOpenWorldProblemAction(naturalState, definition(), matched.value.actionId, 'action:natural');
  const buttonState = await state({ currentZoneId: 'zone.shop' });
  const button = settleOpenWorldProblemAction(buttonState, definition(), 'action.talk', 'action:button');
  assert.deepEqual(natural.receipt.settledFacts, button.receipt.settledFacts);
  assert.equal(naturalState.problemStates['problem.pressure'], 'watched');
  assert.equal(matchOpenWorldProblemAction(await state({ currentZoneId: 'zone.shop' }), definition(), 'problem.pressure', '我不交涉，只想拖住话头').status, 'negated');
});

test('failure-forward produces a new playable state and makes the same action unavailable', async () => {
  const { settleOpenWorldProblemAction } = await subject();
  const runtime = await state({ currentZoneId: 'zone.shop' });
  const result = settleOpenWorldProblemAction(runtime, definition(), 'action.resist', 'action:resist');
  assert.equal(result.receipt.outcome, 'failure-forward');
  assert.equal(runtime.problemStates['problem.pressure'], 'captured_but_alert');
  assert.equal(settleOpenWorldProblemAction(runtime, definition(), 'action.resist', 'action:again').reason, 'action_unavailable');
});

test('3-5 and 10-20 turn consequences settle once and change only declared actors', async () => {
  const { settleOpenWorldProblemAction, advanceOpenWorldTurns } = await subject();
  const runtime = await state({ currentZoneId: 'zone.shop' });
  settleOpenWorldProblemAction(runtime, definition(), 'action.talk', 'action:talk');
  advanceOpenWorldTurns(runtime, definition(), 3);
  assert.equal(runtime.actorStates['actor.legal'].status, '观望');
  advanceOpenWorldTurns(runtime, definition(), 1);
  assert.equal(runtime.actorStates['actor.legal'].status, '暗中留意');
  assert.equal(runtime.consequenceReceipts.length, 1);
  advanceOpenWorldTurns(runtime, definition(), 8);
  assert.equal(runtime.actorStates['actor.legal'].status, '愿意再谈');
  assert.equal(runtime.problemStates['problem.pressure'], 'new_opening');
  assert.equal(runtime.consequenceReceipts.length, 2);
  advanceOpenWorldTurns(runtime, definition(), 20);
  assert.equal(runtime.consequenceReceipts.length, 2);
  assert.ok(runtime.chronicle.every(entry => /^因为.+，所以.+$/.test(entry.text)));
});

test('unknown actor consequences are not scheduled and old saves hydrate without losing receipts', async () => {
  const { hydrateOpenWorldSliceRuntime, settleOpenWorldProblemAction } = await subject();
  const altered = definition();
  altered.actions[0].consequences.push({
    id: 'invented', delayTurns: 3, actorId: 'actor.invented', cause: '虚构', effect: '不应发生', apply: { actorStatus: '越界' },
  });
  const runtime = hydrateOpenWorldSliceRuntime({
    currentZoneId: 'zone.shop', elapsedTurns: 7,
    travelReceipts: [{ receiptId: 'kept', routeId: 'route.square.shop', fromZoneId: 'zone.square', toZoneId: 'zone.shop', departedAtTurn: 5, arrivedAtTurn: 7, turnCost: 2 }],
  }, altered);
  assert.equal(runtime.travelReceipts[0].receiptId, 'kept');
  assert.equal(runtime.actorStates['actor.legal'].actorId, 'actor.legal');
  settleOpenWorldProblemAction(runtime, altered, 'action.talk', 'action:unknown-actor');
  assert.equal(runtime.pendingConsequences.some(item => item.actorId === 'actor.invented'), false);
});

test('old travel receipts hydrate a player mode and compound zones are not standable current', async () => {
  const { hydrateOpenWorldSliceRuntime, zoneIsStandable } = await subject();
  const nested = definition();
  nested.zones.push(
    { id: 'zone.town', name: '城镇', kind: 'settlement', standable: false },
    { id: 'zone.compound', name: '商馆', kind: 'compound', parentZoneId: 'zone.town', standable: false },
  );
  nested.zones.find(zone => zone.id === 'zone.square').parentZoneId = 'zone.town';
  nested.zones.find(zone => zone.id === 'zone.square').worldLocationId = 'world.city';
  nested.initialZoneId = 'zone.town';
  const runtime = hydrateOpenWorldSliceRuntime({
    currentZoneId: 'zone.compound',
    travelReceipts: [{
      receiptId: 'kept', routeId: 'route.square.shop', fromZoneId: 'zone.square', toZoneId: 'zone.shop',
      departedAtTurn: 5, arrivedAtTurn: 7, turnCost: 2,
    }],
  }, nested);
  assert.equal(runtime.currentZoneId, 'zone.square');
  assert.equal(runtime.travelReceipts[0].mode, 'player');
  assert.equal(zoneIsStandable(nested.zones.find(zone => zone.id === 'zone.compound')), false);
});

test('forced travel ignores known-route gates, records cause, and rejects off-graph jumps', async () => {
  const { settleOpenWorldForcedTravel, settleOpenWorldForcedTravelChain, backfillOrSettleForcedTravel } = await subject();
  const runtime = await state();
  assert.equal(settleOpenWorldForcedTravel(runtime, definition(), 'route.shop.hidden', 'event.capture').reason, 'not_adjacent');
  const first = settleOpenWorldForcedTravel(runtime, definition(), 'route.square.shop', 'event.capture');
  assert.equal(first.status, 'settled');
  assert.equal(first.receipt.mode, 'forced');
  assert.equal(first.receipt.causeEventId, 'event.capture');
  assert.equal(runtime.currentZoneId, 'zone.shop');
  assert.equal(settleOpenWorldForcedTravel(runtime, definition(), 'route.square.shop', 'event.capture').status, 'idempotent');
  const hidden = await state({ currentZoneId: 'zone.shop', knownZoneIds: ['zone.shop'], knownRouteIds: [] });
  const dragged = settleOpenWorldForcedTravel(hidden, definition(), 'route.shop.hidden', 'event.drag');
  assert.equal(dragged.status, 'settled');
  assert.equal(hidden.currentZoneId, 'zone.hidden');
  assert.ok(hidden.knownZoneIds.includes('zone.hidden'));
  const chainState = await state();
  const chain = settleOpenWorldForcedTravelChain(chainState, definition(), ['route.square.shop', 'route.shop.hidden'], 'event.chain');
  assert.equal(chain.status, 'settled');
  assert.equal(chainState.currentZoneId, 'zone.hidden');
  assert.equal(settleOpenWorldForcedTravelChain(chainState, definition(), ['route.square.shop', 'route.shop.hidden'], 'event.chain').status, 'idempotent');
  const alreadyThere = await state({ currentZoneId: 'zone.hidden' });
  const filled = backfillOrSettleForcedTravel(alreadyThere, definition(), 'route.shop.hidden', 'event.old');
  assert.equal(filled.status, 'settled');
  assert.equal(alreadyThere.currentZoneId, 'zone.hidden');
  assert.equal(filled.receipt.turnCost, 0);
});

test('player-readable view exposes location, legal next steps, stable presence and no internal IDs in prose', async () => {
  const { getOpenWorldSliceView } = await subject();
  const runtime = await state();
  const view = getOpenWorldSliceView(runtime, definition());
  assert.equal(view.currentLocation, '集市');
  assert.deepEqual(view.destinations.map(item => item.destination), ['点心铺']);
  assert.equal(view.notices.length, 1);
  assert.equal(view.problems.length, 0);
  const shopView = getOpenWorldSliceView(await state({ currentZoneId: 'zone.shop' }), definition());
  assert.equal(shopView.problems[0].actions.length, 2);
  assert.equal(JSON.stringify(view).includes('event.s02'), false);
});
