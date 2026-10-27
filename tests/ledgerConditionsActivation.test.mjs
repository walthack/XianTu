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

  // 在队：party.* 显式在队账（补充设计稿 2026-10-26 §3，T7 撤掉留位）；仓库规则表首版为空，恒不在队，节点锁住
  const party = { path: 'party.character.wangzhe', operator: 'eq', value: true };
  const raw = await rawMod();
  raw.scenario.events[0].conditions = [party];
  assert.equal(validateScenarioMod(raw).issues.some(issue => issue.code === 'reserved_path'), false, '不再报留位');
  let locked = advance(await buildSave([{ path: 'flags.chapter.started', operator: 'eq', value: true }]));
  const event = rt(locked).events.find(item => item.id === EVENT);
  event.conditions = [party];
  rt(locked).flags['chapter.started'] = true;
  rt(locked).playerKnowledge = { k1: { factId: SECRET, status: 'confirmed' } };
  locked = advance(locked);
  assert.equal(rt(locked).activeEventIds.includes(EVENT), false, '规则表为空时 party.* 不命中');

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

test('party 不满足时节点不激活，在队后激活', async () => {
  const { setPlayerLedgerRulesForTest } = await loadTs('../src/modules/scenarioMods/playerLedgerRules.ts');
  const NING_YU = 'liuchao.character.ning_yu';
  const party = { path: `party.${NING_YU}`, operator: 'eq', value: true };
  let save = advance(await buildSave([party]));
  const runtime = rt(save);
  assert.equal(runtime.activeEventIds.includes(EVENT), false, '规则表为空：不在队，锁节点');
  // 夹具：本关开局在队名单含凝羽（规则只在测试里）
  setPlayerLedgerRulesForTest({ version: 1, identityGrants: [], identityRevokes: [], lineOutcomes: [], partyOpenings: [{ stageId: runtime.modId, characterIds: [NING_YU] }] });
  try {
    const check = condition => evaluateScenarioCondition(condition, save, rt(save));
    assert.equal(check(party), true);
    assert.equal(check({ ...party, operator: 'neq' }), false);
    rt(save).departedCast = [NING_YU];
    assert.equal(check(party), false, 'departedCast 内不在队');
    rt(save).departedCast = [];
    save = advance(save);
    assert.equal(rt(save).activeEventIds.includes(EVENT), true, '在队后解锁');
  } finally {
    setPlayerLedgerRulesForTest(undefined);
  }
});

// 进度期限 T8（身份账补充设计稿 2026-10-26 §4.5）：deadline.<id> eq due 才激活；每回合 syncPlayerLedgers 顺带锁存终态。
test('deadline eq due 才激活，到期后锁存进 flags', async () => {
  const { setPlayerLedgerRulesForTest } = await loadTs('../src/modules/scenarioMods/playerLedgerRules.ts');
  const { GAME_NUMBERS } = await loadTs('../src/modules/sceneModule/numbers.ts');
  const ID = 'liuchao.deadline.test_activation';
  const [START, TICK_A, TICK_B] = ['lcq.event.baihu_shangguan_escape', 'lcq.event.biling_bay_stance', 'lcq.event.blacksea_vault_split'];
  const due = { path: `deadline.${ID}`, operator: 'eq', value: 'due' };
  // 夹具：起点＋两个刻度，due=2（规则与数值只在测试里；validator 也要求期限 id 在规则表里）
  setPlayerLedgerRulesForTest({ version: 1, identityGrants: [], identityRevokes: [], lineOutcomes: [],
    progressTicks: [{ eventId: TICK_A, lineId: 'jin' }, { eventId: TICK_B, lineId: 'song' }],
    progressDeadlines: [{ id: ID, name: '测试期限', startEventIds: [START], clearEventIds: [] }] });
  GAME_NUMBERS.story.progressDeadline.limits[ID] = { due: 2, urgentAt: 1 };
  try {
    let save = advance(await buildSave([due]));
    assert.equal(rt(save).activeEventIds.includes(EVENT), false, '未起算：锁节点');
    const stage = rt(save).modId;
    const done = eventId => (rt(save).chronicle ||= []).push({ id: `chronicle.${stage}.${eventId}`, type: 'event', stageId: stage, title: '', sequence: rt(save).chronicle.length + 100 });
    const check = condition => evaluateScenarioCondition(condition, save, rt(save));
    done(START); done(TICK_A);
    save = advance(save);
    assert.equal(check({ path: `deadline.${ID}`, operator: 'eq', value: 'urgent' }), true);
    assert.equal(rt(save).activeEventIds.includes(EVENT), false, 'urgent 不激活');
    assert.equal(rt(save).flags[`deadline.${ID}.state`], undefined, 'urgent 不落存档');
    done(TICK_B);
    save = advance(save);
    assert.equal(rt(save).flags[`deadline.${ID}.state`], 'due', '每回合同步锁存终态');
    assert.equal(rt(save).activeEventIds.includes(EVENT), true, '到期后激活');
  } finally {
    setPlayerLedgerRulesForTest(undefined);
    delete GAME_NUMBERS.story.progressDeadline.limits[ID];
  }
});

// 整线解锁 T5（太泉解锁设计稿 2026-10-27 §4 / §10-5；方案 A：用户 2026-10-27 08:17 批 runtime.ts 1 行传 saveData）：
// unlock.taiquan 读存档境界＋收束档＋期限；门在「选下一章／选事件」时求值，条件满足的同一次 advance 里激活。
const UNLOCK = { path: 'unlock.taiquan', operator: 'eq', value: true };
const realmOf = (save, name) => { save.角色.属性 = { ...(save.角色.属性 || {}), 境界: { 名称: name, 阶段: '初期' } }; };

test('unlock.taiquan 门：事件 conditions 不满足不激活，境界够了同一次 advance 激活；没境界按未达', async () => {
  const quiet = console.warn; console.warn = () => {};
  try {
    let save = await buildSave([UNLOCK]);
    rt(save).flags['line.song.outcome'] = 'resolved';
    save = advance(save);
    assert.equal(rt(save).activeEventIds.includes(EVENT), false, '存档没有境界：按未达锁住');
    realmOf(save, '入微');
    save = advance(save);
    assert.equal(rt(save).activeEventIds.includes(EVENT), false, '入微不够');
    assert.equal(evaluateScenarioCondition(UNLOCK, save, rt(save)), false);
    assert.equal(evaluateScenarioCondition({ ...UNLOCK, value: false }, save, rt(save)), true);
    realmOf(save, '坐照');
    save = advance(save);
    assert.equal(rt(save).activeEventIds.includes(EVENT), true, '坐照＋已收束一条：同一次 advance 激活');
  } finally { console.warn = quiet; }
});

test('unlock.taiquan 门挂在章节 activation：门关着上一章完成后停住，门开的同一次 advance 里开章', async () => {
  const raw = await rawMod();
  const started = { path: 'flags.chapter.started', operator: 'eq', value: true };
  raw.scenario.chapters = [
    { ...raw.scenario.chapters[0], completion: [started] },
    { id: 'chapter.gated', title: '苍澜', summary: '进太泉。', activation: [started, UNLOCK], eventIds: [] },
  ];
  assert.deepEqual(validateScenarioMod(raw).issues, []);
  const build = () => applyStrictScenarioInitializationToSave(
    { 角色: { 位置: { 描述: '旧地点' }, 属性: { 境界: { 名称: '入微', 阶段: '后期' } } }, 世界: { 信息: {}, 状态: {} }, 系统: { 扩展: {} } },
    buildStrictScenarioInitialization(parseScenarioMod(raw), '2026-06-22T00:00:00.000Z'),
  );
  let save = build();
  rt(save).flags['line.song.outcome'] = 'resolved';
  rt(save).flags['chapter.started'] = true;
  save = advance(save);
  assert.ok(rt(save).completedChapterIds.includes('chapter.arrival'));
  assert.equal(rt(save).currentChapterId, null, '门关着：上一章完成后不开下一章');
  realmOf(save, '坐照');
  save = advance(save);
  assert.equal(rt(save).currentChapterId, 'chapter.gated', '练到坐照后下一次 advance 开章');
  // 门本来就开：上一章完成的同一次 advance 里直接开章
  let open = build();
  realmOf(open, '坐照');
  rt(open).flags['line.song.outcome'] = 'resolved';
  rt(open).flags['chapter.started'] = true;
  open = advance(open);
  assert.equal(rt(open).currentChapterId, 'chapter.gated');
});

test('validator：unlock.* 只许 eq/neq、只许已配置的线、只许 conditions/activation，completion 与变体 when 拒收', async () => {
  const codes = (raw) => validateScenarioMod(raw).issues.map(issue => [issue.code, issue.path]);
  const ok = await rawMod();
  ok.scenario.events[0].conditions = [UNLOCK];
  ok.scenario.chapters[0].activation = [UNLOCK];
  assert.deepEqual(codes(ok), []);

  const bad = await rawMod();
  bad.scenario.events[0].conditions = [{ path: 'unlock.jin', operator: 'eq', value: true }, { ...UNLOCK, operator: 'gte' }, { ...UNLOCK, operator: 'exists' }, { ...UNLOCK, value: 'yes' }];
  bad.scenario.events[0].completion = [UNLOCK];
  bad.scenario.chapters[0].completion = [UNLOCK];
  // 变体求值拿不到存档，unlock.* 永远读成 undefined，eq 与 neq 都写不成
  bad.scenario.events[0].narrativeVariants = [{ when: [{ ...UNLOCK, operator: 'neq' }], name: '未解锁' }, { when: [UNLOCK], name: '已解锁' }];
  const at = 'scenario.events[0]';
  assert.deepEqual(codes(bad), [
    ['invalid_enum', `${at}.conditions[1].operator`],
    ['invalid_enum', `${at}.conditions[2].operator`],
    ['invalid_value', `${at}.conditions[3].value`],
    ['ledger_unlock_site', `${at}.completion[0].path`],
    ['ledger_unlock_site', `${at}.narrativeVariants[0].when[0].path`],
    ['ledger_unlock_site', `${at}.narrativeVariants[1].when[0].path`],
    ['ledger_unlock_site', 'scenario.chapters[0].completion[0].path'],
    ['missing_reference', `${at}.conditions[0].path`],
  ]);
});
