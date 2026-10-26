// 身份账 T4（身份账设计稿 2026-10-25 §4.3 / §7 / §8 T4；用户 2026-10-25 23:24 批）：runtime.ts 的 resolveConditionValue
// 开头委托 ledgerConditions.resolveLedgerPath，activation / conditions / completion 也能读账本，用于锁节点（剧情策划 E/G 类）。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const { advanceScenarioRuntime, evaluateScenarioCondition } = await loadTs('../src/modules/scenarioMods/runtime.ts');
const { parseScenarioMod, validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
const { applyStrictScenarioInitializationToSave, buildStrictScenarioInitialization } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const { analyzeScenarioMod } = await loadTs('../src/modules/scenarioMods/analyzer.ts');

const EVENT = 'event.firstmeeting';
const SECRET = 'fact.jiankang.secret';
const KNOWS = { path: `knows.player.${SECRET}`, operator: 'eq', value: true };

async function rawMod() {
  return JSON.parse(await readFile(new URL('./fixtures/scenario-mod/minimal.json', import.meta.url), 'utf8'));
}

async function buildSave(conditions) {
  const raw = await rawMod();
  raw.scenario.events[0].conditions = conditions;
  return applyStrictScenarioInitializationToSave(
    { 角色: { 位置: { 描述: '旧地点' } }, 世界: { 信息: {}, 状态: {} }, 系统: { 扩展: {} } },
    buildStrictScenarioInitialization(parseScenarioMod(raw), '2026-06-22T00:00:00.000Z'),
  );
}

const rt = save => save.世界.状态.剧本模组;
const advance = save => advanceScenarioRuntime(save).saveData;

test('在队/知情不满足时节点不激活（锁节点）', async () => {
  // 知情：只认 status=confirmed 的命题；不满足时节点锁住，满足后下一拍激活
  let save = advance(await buildSave([KNOWS]));
  assert.equal(rt(save).activeEventIds.includes(EVENT), false, '未知情不激活');
  rt(save).playerKnowledge = { k1: { factId: SECRET, status: 'suspected' } };
  save = advance(save);
  assert.equal(rt(save).activeEventIds.includes(EVENT), false, '只是怀疑不算知情');
  rt(save).playerKnowledge.k1.status = 'confirmed';
  save = advance(save);
  assert.equal(rt(save).activeEventIds.includes(EVENT), true, '知情后解锁');

  // 在队：party.* 留位（数据源待定，§11 Q4），首版恒不命中，节点一直锁住；校验器也拦住不让内容先用
  const party = { path: 'party.character.wangzhe', operator: 'eq', value: true };
  const raw = await rawMod();
  raw.scenario.events[0].conditions = [party];
  assert.ok(validateScenarioMod(raw).issues.some(issue => issue.code === 'reserved_path'));
  let locked = advance(await buildSave([{ path: 'flags.chapter.started', operator: 'eq', value: true }]));
  const event = rt(locked).events.find(item => item.id === EVENT);
  event.conditions = [party];
  rt(locked).flags['chapter.started'] = true;
  rt(locked).playerKnowledge = { k1: { factId: SECRET, status: 'confirmed' } };
  locked = advance(locked);
  assert.equal(rt(locked).activeEventIds.includes(EVENT), false, 'party.* 留位不命中');

  // 其余账本路径同样经 resolveConditionValue 求值（completion / activation 用的同一入口）
  const runtime = rt(locked);
  runtime.playerIdentities = { 'liuchao.identity.song.baochao_zhushi': { status: 'active', acquiredAtEventId: EVENT, history: [] } };
  runtime.flags['line.song.outcome'] = 'resolved';
  runtime.acquaintances = { 'character.wangzhe': { kind: 'encountered' } };
  const check = condition => evaluateScenarioCondition(condition, locked, runtime);
  assert.equal(check({ path: 'identity.liuchao.identity.song.baochao_zhushi', operator: 'eq', value: true }), true);
  assert.equal(check({ path: 'identity.liuchao.identity.song.baochao_zhushi.from', operator: 'eq', value: EVENT }), true);
  assert.equal(check({ path: 'identity.liuchao.identity.han.none', operator: 'exists' }), false);
  assert.equal(check({ path: 'line.song.outcome', operator: 'eq', value: 'resolved' }), true);
  assert.equal(check({ path: 'line.jin.outcome', operator: 'exists' }), false);
  assert.equal(check({ path: 'acq.character.wangzhe', operator: 'eq', value: 'encountered' }), true);
  assert.equal(check({ path: `done.${EVENT}`, operator: 'eq', value: false }), true);
  // 道具来路（补充设计稿 2026-10-26 §2.4，T6）：只看回执
  assert.equal(check({ path: 'item.item.thunderblade', operator: 'eq', value: true }), false);
  runtime.inventoryTransferReceipts = [{ transferId: 't.blade', itemId: 'item.thunderblade', itemName: '雷刀', quantity: 1, sourceEventId: EVENT, actionId: 'take', outcome: 'success', settledAtTurn: 1 }];
  assert.equal(check({ path: 'item.item.thunderblade', operator: 'eq', value: true }), true);
  assert.equal(check({ path: 'item.item.thunderblade.from', operator: 'eq', value: EVENT }), true);
  // 非账本路径行为不变
  assert.equal(check({ path: 'flags.chapter.started', operator: 'eq', value: true }), true);
});

test('analyzer 不把账本条件章节报为不可达', () => {
  const mod = {
    scenario: {
      initialFlags: { 'ch1.done': false },
      events: [],
      chapters: [
        { id: 'ch.1', completion: [{ path: 'flags.ch1.done', operator: 'eq', value: true }] },
        // 纯账本激活：开局值静态不可知，当动态条件，算可达
        { id: 'ch.identity', activation: [{ path: 'identity.liuchao.identity.song.baochao_zhushi', operator: 'eq', value: true }], completion: [{ path: 'flags.ch1.done', operator: 'eq', value: true }] },
        { id: 'ch.knows', activation: [{ path: `knows.player.${SECRET}`, operator: 'eq', value: true }], completion: [{ path: 'flags.ch1.done', operator: 'eq', value: true }] },
        { id: 'ch.item', activation: [{ path: 'item.item.thunderblade.from', operator: 'exists' }], completion: [{ path: 'flags.ch1.done', operator: 'eq', value: true }] },
        // 账本条件夹 flags 条件：flags 部分照旧由前一章的 completion 连上
        { id: 'ch.after', activation: [{ path: 'flags.ch1.done', operator: 'eq', value: true }, { path: `done.${EVENT}`, operator: 'eq', value: true }] },
      ],
    },
  };
  const result = analyzeScenarioMod(mod);
  const codes = result.issues.map(issue => issue.code);
  assert.equal(codes.includes('unreachable_chapter'), false, JSON.stringify(result.issues));
  assert.equal(codes.includes('no_initial_chapter'), false);
  assert.equal(codes.includes('chapter_cycle'), false, '账本条件不拿来连章，两个纯账本激活章不成环');
  assert.equal(result.valid, true, JSON.stringify(result.issues));

  // 只有账本激活的唯一章节也算有开局章
  const only = { scenario: { initialFlags: {}, events: [], chapters: [{ id: 'ch.only', activation: [{ path: 'line.song.outcome', operator: 'exists' }] }] } };
  assert.equal(analyzeScenarioMod(only).issues.some(issue => issue.code === 'no_initial_chapter'), false);
});

test('item 不满足时节点不激活，得过后激活', async () => {
  const blade = { path: 'item.item.thunderblade', operator: 'eq', value: true };
  const raw = await rawMod();
  raw.scenario.events[0].conditions = [blade];
  assert.deepEqual(validateScenarioMod(raw).issues, []);
  let save = advance(await buildSave([blade]));
  assert.equal(rt(save).activeEventIds.includes(EVENT), false, '没得过不激活');
  // 背包现存但没回执：读取不看背包，仍不激活（旧档靠读档回填补回执）
  save.角色.背包 = { 物品: { 'item.thunderblade': { 物品ID: 'item.thunderblade', 数量: 1 } } };
  save = advance(save);
  assert.equal(rt(save).activeEventIds.includes(EVENT), false);
  rt(save).inventoryTransferReceipts = [{ transferId: 't.blade', itemId: 'item.thunderblade', itemName: '雷刀', quantity: 1, sourceEventId: 'loot:x', actionId: 'loot', outcome: 'success', settledAtTurn: 1 }];
  save = advance(save);
  assert.equal(rt(save).activeEventIds.includes(EVENT), true, '有回执后激活');
});
