import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import axios from 'axios';
import { loadTs } from './loadTs.mjs';

if (!globalThis.localStorage || typeof globalThis.localStorage.getItem !== 'function') {
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

async function stage02Save() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const { buildStrictScenarioInitialization, applyStrictScenarioInitializationToSave } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const stage = parseScenarioMod(JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_02.json', import.meta.url), 'utf8')));
  const save = applyStrictScenarioInitializationToSave({
    元数据: { 时间: { 年: 1000, 月: 1, 日: 1, 小时: 8, 分钟: 0 } },
    角色: { 位置: { 描述: '帅帐' }, 背包: { 物品: {} } },
    世界: { 信息: {}, 状态: {} }, 社交: { 关系: {} }, 系统: { 扩展: {} },
  }, buildStrictScenarioInitialization(stage));
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  return advanceScenarioRuntime(save).saveData;
}

test('stream deadline aborts a silent request and a stalled body; cancellation stays distinct', async () => {
  const { withAiRequestDeadline, AiRequestTimeoutError } = await loadTs('../src/services/aiRequestDeadline.ts');
  let signal;
  await assert.rejects(withAiRequestDeadline(async s => {
    signal = s;
    return new Promise(() => {});
  }, { firstByteMs: 15, totalMs: 150 }), e => e instanceof AiRequestTimeoutError && e.phase === 'first_byte');
  assert.equal(signal.aborted, true);
  await assert.rejects(withAiRequestDeadline(async (s, firstByte) => {
    signal = s;
    firstByte();
    return new Promise(() => {});
  }, { firstByteMs: 10, totalMs: 30 }), e => e instanceof AiRequestTimeoutError && e.phase === 'total');
  assert.equal(signal.aborted, true);
  const controller = new AbortController();
  controller.abort();
  let started = false;
  await assert.rejects(withAiRequestDeadline(async () => { started = true; }, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(started, false);
  assert.equal(await withAiRequestDeadline(async (_, firstByte) => { firstByte(); return 'ok'; }), 'ok');
});

test('axios timeout survives service error mapping and is never automatically retried', async () => {
  const { aiService } = await loadTs('../src/services/aiService.ts');
  const { isAiRequestTimeout } = await loadTs('../src/services/aiRequestDeadline.ts');
  const { isNonRetryableAiError } = await loadTs('../src/services/aiResponseTermination.ts');
  const post = axios.post;
  let calls = 0;
  axios.post = async () => {
    calls += 1;
    throw new axios.AxiosError('timeout of 120000ms exceeded', 'ECONNABORTED', { timeout: 120000 });
  };
  try {
    await assert.rejects(aiService.generateWithAPIConfig({ user_input: 'test', should_stream: false, requestMaxRetries: 3, usageType: 'main' }, {
      provider: 'openai', url: 'https://fixture.example/v1', apiKey: 'fixture', model: 'fixture', maxTokens: 8192,
    }), e => isAiRequestTimeout(e) && isNonRetryableAiError(e) && e.message.includes('120秒'));
    assert.equal(calls, 1);
  } finally { axios.post = post; }
});

test('main Wang Zhe action grants fixed pouch once and shares opportunity transfer receipt', async () => {
  const { getCurrentStoryEventActions, recordStoryEventStructuredAction } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const save = await stage02Save();
  const action = getCurrentStoryEventActions(save).find(a => a.eventId === 'lcq.event.s02_01');
  assert.ok(action);
  assert.match(action.playerLine, /接过锦囊/);
  const result = recordStoryEventStructuredAction(save, action);
  assert.equal(result.completed, true);
  assert.equal(save.角色.背包.物品['lcq.item.jin_nang'].数量, 1);
  assert.equal(save.世界.状态.剧本模组.inventoryTransferReceipts[0].transferId, 'lcq.event.s02_01.inventory.jin_nang');
  recordStoryEventStructuredAction(save, action);
  assert.equal(save.角色.背包.物品['lcq.item.jin_nang'].数量, 1);
  const held = await stage02Save();
  held.角色.背包.物品['lcq.item.jin_nang'] = { 名称: '锦囊', 数量: 1 };
  held.世界.状态.剧本模组.inventoryTransferReceipts = [{ transferId: 'lcq.event.s02_01.inventory.jin_nang' }];
  recordStoryEventStructuredAction(held, getCurrentStoryEventActions(held).find(a => a.eventId === action.eventId));
  assert.equal(held.角色.背包.物品['lcq.item.jin_nang'].数量, 1);
});

test('known starter zipper aliases converge across chapters without replenishing or merging unrelated items', async () => {
  const { mergeFixedScenarioStarterInventory: merge, ZIPPER_ITEM_ID } = await loadTs('../src/modules/scenarioMods/fixedInventoryContracts.ts');
  const zipper = { 名称: '拉链', 数量: 1 };
  let bag = merge({}, { 'lcq.item.np002': zipper });
  bag = merge(bag, { 'lcq.item.np001': zipper });
  assert.deepEqual(Object.keys(bag), [ZIPPER_ITEM_ID]);
  assert.equal(bag[ZIPPER_ITEM_ID].数量, 1);
  bag[ZIPPER_ITEM_ID].数量 = 0;
  assert.equal(merge(bag, { 'lcq.item.np001': zipper })[ZIPPER_ITEM_ID].数量, 0);
  const legacy = merge({ 'lcq.item.np001': zipper, 'lcq.item.np002': zipper, 'other.zipper': zipper }, {});
  assert.equal(legacy[ZIPPER_ITEM_ID].数量, 1);
  assert.ok(legacy['other.zipper']);
  assert.ok(merge({}, { 'lcq.item.np001': { 名称: '其他物件', 数量: 1 } })['lcq.item.np001']);
});

test('model cannot mint catalog or off-list inventory, rewrite quantity, or bypass via parent paths', async () => {
  const { guardScenarioModCommands } = await loadTs('../src/modules/scenarioMods/canonGuard.ts');
  const save = await stage02Save();
  const before = structuredClone(save.角色.背包);
  const commands = [
    { action: 'set', key: '角色.背包.物品.item_star_sword', value: { 名称: '星河剑', 数量: 1 } },
    { action: 'set', key: '角色.背包.物品.lcq.item.jin_nang', value: { 名称: '锦囊', 数量: 1 } },
    { action: 'add', key: '角色.背包.物品.lcq.item.zipper.数量', value: 1 },
    { action: 'set', key: '角色.背包', value: { 物品: { fake: { 名称: '星河剑' } } } },
    { action: 'set', key: '角色', value: {} },
    { action: 'delete', key: '角色.背包.物品' },
  ];
  const guarded = guardScenarioModCommands(save, commands);
  assert.equal(guarded.accepted.length, 0);
  assert.equal(guarded.rejected.length, commands.length);
  assert.ok(guarded.rejected.every(r => r.reason.includes('道具合同')));
  assert.deepEqual(save.角色.背包, before);
});

test('item prose never creates inventory and unreceipted grants are detected', async () => {
  const {
    unsupportedInventoryGainNames,
    inspectPublishedItemReferences,
    buildItemReferenceContext,
    currentSceneItemAllowlist,
    formatItemReferenceProtocolHint,
  } = await loadTs('../src/modules/scenarioMods/fixedInventoryContracts.ts');
  assert.deepEqual(unsupportedInventoryGainNames('你接过锦囊。', ['锦囊']), []);
  assert.deepEqual(unsupportedInventoryGainNames('你接过锦囊。', []), ['锦囊']);
  assert.deepEqual(unsupportedInventoryGainNames('你获得了星河剑。', []), ['星河剑']);
  assert.deepEqual(unsupportedInventoryGainNames('你得到一个回答。桌上放着茶杯。', []), []);
  const save = await stage02Save();
  const context = buildItemReferenceContext(save, [], []);
  assert.ok(context.catalog.some(item => item.id === 'lcq.item.jin_nang'));
  const scene = inspectPublishedItemReferences('案上仍放着锦囊，你没有伸手去接。', [], context);
  assert.deepEqual(scene.unauthorizedClaims, []);
  assert.ok(scene.sceneMentions.includes('lcq.item.jin_nang'));
  const claim = inspectPublishedItemReferences('你接过锦囊。', [], context);
  assert.ok(claim.unauthorizedClaims.includes('锦囊'));
  const unknown = inspectPublishedItemReferences('你看了看四周。', [{ action: 'set', key: '角色.背包.物品.lcq.item.star_sword', value: { 物品ID: 'lcq.item.star_sword' } }], context);
  assert.ok(unknown.unknownIds.includes('lcq.item.star_sword'));
  const refs = inspectPublishedItemReferences('你点了点头。', [], context, [{ id: 'lcq.item.star_sword', purpose: 'claim' }]);
  assert.ok(refs.unknownIds.includes('lcq.item.star_sword') || refs.unauthorizedClaims.includes('lcq.item.star_sword'));
  const sceneRef = inspectPublishedItemReferences('案上放着锦囊。', [], context, [{ id: 'lcq.item.jin_nang', purpose: 'scene' }]);
  assert.ok(sceneRef.sceneMentions.includes('lcq.item.jin_nang'));
  assert.deepEqual(sceneRef.unauthorizedClaims, []);

  const allow = currentSceneItemAllowlist({
    catalog: [{ id: 'lcq.item.jin_nang', name: '锦囊' }],
    ownedIds: ['playtest.item.owned_only'],
    authorizedGrantIds: ['lcq.item.grant_only'],
    authorizedGrantNames: [],
  });
  assert.equal(allow.has('lcq.item.jin_nang'), true);
  assert.equal(allow.has('playtest.item.owned_only'), true);
  assert.equal(allow.has('lcq.item.grant_only'), true);
  assert.equal(allow.has('lcq.item.star_sword'), false);
  const ownedOnly = inspectPublishedItemReferences('你摸了摸旧物。', [], {
    catalog: [{ id: 'lcq.item.jin_nang', name: '锦囊' }],
    ownedIds: ['playtest.item.owned_only'],
    authorizedGrantIds: ['lcq.item.grant_only'],
    authorizedGrantNames: [],
  }, [{ id: 'playtest.item.owned_only', purpose: 'owned' }]);
  assert.deepEqual(ownedOnly.unknownIds, []);
  assert.deepEqual(ownedOnly.unauthorizedClaims, []);
  const hint = formatItemReferenceProtocolHint(context);
  assert.match(hint, /item_references/);
  assert.match(hint, /当前场景允许集/);
  assert.match(hint, /不是正文字数上限/);

  const { ownedInventoryItemIds } = await loadTs('../src/modules/scenarioMods/fixedInventoryContracts.ts');
  const zeroSave = structuredClone(save);
  zeroSave.角色.背包.物品['lcq.item.zipper'] = { 名称: '拉链', 数量: 0, 物品ID: 'lcq.item.zipper' };
  assert.equal(ownedInventoryItemIds(zeroSave).includes('lcq.item.zipper'), false);
  const zeroContext = buildItemReferenceContext(zeroSave, [], []);
  const zeroOwned = inspectPublishedItemReferences('你摸了摸旧物。', [], zeroContext, [{ id: 'lcq.item.zipper', purpose: 'owned' }]);
  assert.ok(zeroOwned.unauthorizedClaims.includes('lcq.item.zipper'));
});

test('agency guard rejects Run4 consequences while allowing observation and explicit requested actions', async () => {
  const { unauthorizedPlayerActions: check } = await loadTs('../src/modules/scenarioMods/playerAgencyGuard.ts');
  assert.deepEqual(check('你抽出短刀，捅死了孙疤脸。', '我判断她要带我去哪。'), ['杀人']);
  assert.deepEqual(check('你替月霜解甲，然后喂她药。', '我应对眼前危局。'), ['解甲脱衣', '喂药']);
  assert.deepEqual(check('你报出自己的名字。', '我听他说完。'), ['报名字']);
  assert.deepEqual(check('你捅死了孙疤脸。', '我不要杀死他。'), ['杀人']);
  assert.deepEqual(check('你捅死了孙疤脸。', '我捅死孙疤脸。'), []);
  assert.deepEqual(check('你看见守卫杀死了敌人。', '我观察局势。'), []);
  assert.deepEqual(check('她说：“你可以签下契书。”你没有签下契书。', '我先问清条件。'), []);
});
