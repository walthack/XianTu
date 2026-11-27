// 支线钥匙 PR-A（用户 2026-11-28 批）：物 item.<id>.held、属性 attr.<key>、好感 favor.<characterId>[.tier] 三类读存档的账本路径；
// 变体求值（eventNarrativeView）传存档；runtime.ts 的 resolveConditionValue 经 resolveLedgerPath 读到数字自己比较；右栏线卡单步钥匙提示。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const ledger = await loadTs('../src/modules/scenarioMods/ledgerConditions.ts');
const narrative = await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
const { advanceScenarioRuntime, evaluateScenarioCondition } = await loadTs('../src/modules/scenarioMods/runtime.ts');
const { parseScenarioMod, validateScenarioMod, validateLineCompassTable } = await loadTs('../src/modules/scenarioMods/validator.ts');
const { applyStrictScenarioInitializationToSave, buildStrictScenarioInitialization } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const compass = await loadTs('../src/modules/scenarioMods/lineCompass.ts');
const log = await loadTs('../src/modules/diagnostics/log.ts');
const store = await loadTs('../src/modules/diagnostics/store.ts');
const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');

const { evaluateLedgerCondition, parseLedgerPath, resolveLedgerPath, ledgerOperatorsOf, affinityTierIds } = ledger;
const ITEM = 'lcq.item.crow_bamboo_tube';
const NPC = 'character.wangzhe';
const RT = { flags: {}, chronicle: [], completedEventIds: [] };
const c = (path, operator, value) => (value === undefined ? { path, operator } : { path, operator, value });

/** 主角存档：六司分先天／后天；境界；背包；社交.关系 按 角色ID 找记录。 */
const saveOf = ({ innate = { 魅力: 6, 心性: 5, 悟性: 7, 根骨: 4 }, acquired = { 魅力: 2 }, realm = { 名称: '坐照', 阶段: '初期' }, items = {}, relations = {} } = {}) => ({
  角色: { 身份: { 先天六司: innate, 后天六司: acquired }, 属性: { 境界: realm }, 背包: { 物品: items } },
  社交: { 关系: relations },
});

test('parse：item.<id>.held 只认末段；attr 只许五个 key；favor.<id> 与 favor.<id>.tier；operator 表', () => {
  assert.deepEqual(parseLedgerPath(`item.${ITEM}.held`), { kind: 'item', id: ITEM, field: 'held' });
  assert.deepEqual(parseLedgerPath(`item.${ITEM}.from`), { kind: 'item', id: ITEM, field: 'from' });
  assert.deepEqual(parseLedgerPath(`item.${ITEM}`), { kind: 'item', id: ITEM, field: 'active' });
  // itemId 中段含 held 不当子读取；末段不是 held 时原样当 itemId
  assert.deepEqual(parseLedgerPath('item.lcq.item.held_box'), { kind: 'item', id: 'lcq.item.held_box', field: 'active' });
  assert.deepEqual(parseLedgerPath('item.lcq.held.box.held'), { kind: 'item', id: 'lcq.held.box', field: 'held' });
  for (const key of ['charm', 'temperament', 'comprehension', 'root_bone', 'realm']) assert.deepEqual(parseLedgerPath(`attr.${key}`), { kind: 'attr', id: key });
  for (const key of ['spirituality', 'fortune', 'charm.x', '']) assert.equal(parseLedgerPath(`attr.${key}`).invalid, true, key);
  assert.deepEqual(parseLedgerPath(`favor.${NPC}`), { kind: 'favor', id: NPC });
  assert.deepEqual(parseLedgerPath(`favor.${NPC}.tier`), { kind: 'favor', id: NPC, field: 'tier' });
  assert.deepEqual([...ledgerOperatorsOf(parseLedgerPath(`item.${ITEM}.held`))], ['eq', 'neq']);
  assert.deepEqual([...ledgerOperatorsOf(parseLedgerPath(`item.${ITEM}.from`))], ['eq', 'neq', 'exists'], '.from 不变');
  assert.deepEqual([...ledgerOperatorsOf(parseLedgerPath('attr.charm'))], ['eq', 'neq', 'gt', 'gte', 'lt', 'lte']);
  assert.deepEqual([...ledgerOperatorsOf(parseLedgerPath(`favor.${NPC}.tier`))], ['eq', 'neq', 'gt', 'gte', 'lt', 'lte']);
});

test('实体索引里没有末段为 held / from 的 itemId（item.<id>.held / .from 的末段约定成立）', async () => {
  const idx = JSON.parse(await readFile(new URL('../mod-kit/entity-catalog/items.json', import.meta.url), 'utf8'));
  const ids = (Array.isArray(idx) ? idx : idx.entries || idx.items).map(e => e.id);
  assert.ok(ids.length > 100);
  assert.deepEqual(ids.filter(id => /\.(held|from)$/.test(id)), []);
});

test('item.<id>.held：背包数量 > 0 为真；0／没有为假；没传存档、占位存档没有 角色 时任何 operator 都不成立；item.<id> 得没得过不变', () => {
  const held = c(`item.${ITEM}.held`, 'eq', true);
  const notHeld = c(`item.${ITEM}.held`, 'neq', true);
  assert.equal(evaluateLedgerCondition(held, RT, saveOf({ items: { [ITEM]: { 名称: '竹筒', 数量: 1 } } })), true);
  assert.equal(evaluateLedgerCondition(notHeld, RT, saveOf({ items: { [ITEM]: { 名称: '竹筒', 数量: 1 } } })), false);
  assert.equal(evaluateLedgerCondition(held, RT, saveOf({ items: { [ITEM]: { 名称: '竹筒', 数量: 0 } } })), false, '数量 0 不算持有');
  assert.equal(evaluateLedgerCondition(notHeld, RT, saveOf()), true, '有存档、没这件：neq 成立');
  assert.equal(resolveLedgerPath(`item.${ITEM}.held`, RT, saveOf()).value, false);
  for (const save of [undefined, {}, { 世界: {} }]) {
    assert.equal(resolveLedgerPath(`item.${ITEM}.held`, RT, save).value, undefined);
    assert.equal(evaluateLedgerCondition(held, RT, save), false);
    assert.equal(evaluateLedgerCondition(notHeld, RT, save), false, '读不到＝不成立，neq 也不成立');
  }
  assert.equal(evaluateLedgerCondition(c(`item.${ITEM}.held`, 'exists'), RT, saveOf({ items: { [ITEM]: { 数量: 1 } } })), false, 'exists 不支持');
  // 背包里有但没有回执：item.<id>（得过）只看回执，仍为 false
  assert.equal(evaluateLedgerCondition(c(`item.${ITEM}`, 'eq', true), RT, saveOf({ items: { [ITEM]: { 数量: 1 } } })), false);
  const rtWithReceipt = { ...RT, inventoryTransferReceipts: [{ itemId: ITEM, sourceEventId: 'lcq.event.s02_01', transferId: 't' }] };
  assert.equal(evaluateLedgerCondition(c(`item.${ITEM}`, 'eq', true), rtWithReceipt), true);
  assert.equal(evaluateLedgerCondition(held, rtWithReceipt, saveOf()), false, '得过但现在不在包里');
});

test('attr.<key>：先天六司＋后天六司同名项；realm＝levelOf(境界)；数字比较边界；读不出为 undefined', () => {
  const save = saveOf();
  assert.equal(resolveLedgerPath('attr.charm', RT, save).value, 8);
  assert.equal(resolveLedgerPath('attr.temperament', RT, save).value, 5, '后天缺项按 0');
  assert.equal(resolveLedgerPath('attr.comprehension', RT, save).value, 7);
  assert.equal(resolveLedgerPath('attr.root_bone', RT, save).value, 4);
  assert.equal(resolveLedgerPath('attr.realm', RT, save).value, 5, '坐照＝5（同 lineUnlock）');
  const at = (op, value) => evaluateLedgerCondition(c('attr.charm', op, value), RT, save);
  assert.deepEqual([at('gte', 8), at('gt', 8), at('gt', 7), at('lte', 8), at('lt', 8), at('lt', 9), at('eq', 8), at('neq', 8)], [true, false, true, true, false, true, true, false]);
  assert.equal(at('gte', '8'), false, '比较值不是数字不成立');
  assert.equal(evaluateLedgerCondition(c('attr.charm', 'exists'), RT, save), false);
  // 读不出：没存档、占位存档、先天缺项、境界名不认识
  assert.equal(evaluateLedgerCondition(c('attr.charm', 'gte', 0), RT), false);
  assert.equal(evaluateLedgerCondition(c('attr.charm', 'neq', 99), RT, {}), false);
  assert.equal(resolveLedgerPath('attr.charm', RT, saveOf({ innate: {} })).value, undefined);
  assert.equal(resolveLedgerPath('attr.realm', RT, saveOf({ realm: { 名称: '不存在的境界' } })).value, undefined);
  assert.equal(evaluateLedgerCondition(c('attr.realm', 'lt', 99), RT, saveOf({ realm: null })), false);
  // 不许的 key：parse 为 invalid，求值不命中
  assert.equal(evaluateLedgerCondition(c('attr.spirituality', 'gte', 0), RT, save), false);
});

test('favor.<id>：读 社交.关系 里 角色ID 对上的唯一记录的好感度；.tier 按好感档；档位先后比较；没记录或没存档不成立', () => {
  const order = affinityTierIds();
  const tiers = numbers.GAME_NUMBERS.affinity.tiers;
  assert.deepEqual(order, Object.keys(tiers).sort((a, b) => tiers[a][0] - tiers[b][0]));
  assert.deepEqual([order[0], order.at(-1)], ['nemesis', 'sworn']);
  const save = saveOf({ relations: { 王哲: { 角色ID: NPC, 名字: '王哲', 好感度: 45 } } });
  assert.equal(resolveLedgerPath(`favor.${NPC}`, RT, save).value, 45);
  assert.equal(resolveLedgerPath(`favor.${NPC}.tier`, RT, save).value, 'trusted');
  const f = (op, value) => evaluateLedgerCondition(c(`favor.${NPC}`, op, value), RT, save);
  assert.deepEqual([f('gte', 45), f('gt', 45), f('lt', 46), f('eq', 45)], [true, false, true, true]);
  const t = (op, value) => evaluateLedgerCondition(c(`favor.${NPC}.tier`, op, value), RT, save);
  assert.deepEqual([t('eq', 'trusted'), t('neq', 'trusted'), t('gte', 'trusted'), t('gt', 'trusted'), t('gte', 'acquainted'), t('lt', 'close'), t('lte', 'stranger')], [true, false, true, false, true, true, false]);
  assert.equal(t('gte', 'friend'), false, '非法档 id 不成立');
  assert.equal(t('gte', 40), false, '档位比较值必须是档 id');
  // 档位边界：39 → acquainted，40 → trusted
  const tierAt = value => resolveLedgerPath(`favor.${NPC}.tier`, RT, saveOf({ relations: { x: { 角色ID: NPC, 好感度: value } } })).value;
  assert.deepEqual([tierAt(39), tierAt(40), tierAt(-100), tierAt(100)], ['acquainted', 'trusted', 'nemesis', 'sworn']);
  // 没记录、好感度不是数、没存档
  assert.equal(resolveLedgerPath(`favor.${NPC}`, RT, saveOf()).value, undefined);
  assert.equal(evaluateLedgerCondition(c(`favor.${NPC}`, 'neq', 0), RT, saveOf()), false, '没记录不当 0');
  assert.equal(resolveLedgerPath(`favor.${NPC}`, RT, saveOf({ relations: { x: { 角色ID: NPC, 好感度: '很好' } } })).value, undefined);
  assert.equal(evaluateLedgerCondition(c(`favor.${NPC}`, 'gte', 0), RT), false);
  assert.equal(evaluateLedgerCondition(c(`favor.${NPC}.tier`, 'eq', 'trusted'), RT, {}), false);
});

test('变体：传存档时命中 attr / favor / held 条件，不传时不命中', () => {
  const event = {
    id: 'event.firstmeeting', name: '初会', description: '原文', objective: '原目标',
    narrativeVariants: [
      { when: [c('attr.charm', 'gte', 8)], name: '魅力版' },
    ],
  };
  const save = saveOf({ relations: { 王哲: { 角色ID: NPC, 好感度: 65 } }, items: { [ITEM]: { 数量: 2 } } });
  assert.equal(narrative.resolveScenarioEventNarrative(event, {}, [], RT, save).name, '魅力版');
  assert.equal(narrative.resolveScenarioEventNarrative(event, {}, [], RT).name, '初会', '不传存档不命中');
  const favorEvent = { ...event, narrativeVariants: [{ when: [c(`favor.${NPC}.tier`, 'gte', 'close')], name: '亲近版', replacesCanonRail: true }] };
  assert.equal(narrative.resolveScenarioEventNarrative(favorEvent, {}, [], RT, save).name, '亲近版');
  assert.equal(narrative.resolveScenarioEventNarrative(favorEvent, {}, [], RT).name, '初会');
  assert.equal(narrative.narrativeVariantReplacesCanonRail(favorEvent, {}, [], RT, save), true);
  assert.equal(narrative.narrativeVariantReplacesCanonRail(favorEvent, {}, [], RT), false);
  const heldEvent = { ...event, narrativeVariants: [{ when: [c(`item.${ITEM}.held`, 'eq', true)], name: '带着竹筒' }] };
  assert.equal(narrative.resolveScenarioEventNarrative(heldEvent, {}, [], RT, save).name, '带着竹筒');
  assert.equal(narrative.resolveScenarioEventNarrative(heldEvent, {}, [], RT).name, '初会');
});

test('runtime.ts：evaluateScenarioCondition 经 resolveLedgerPath 读到数字并比较；activation 条件按属性锁节点', async () => {
  const save = saveOf({ relations: { 王哲: { 角色ID: NPC, 好感度: 45 } }, items: { [ITEM]: { 数量: 1 } } });
  const ev = cond => evaluateScenarioCondition(cond, save, RT);
  assert.deepEqual([ev(c('attr.charm', 'gte', 8)), ev(c('attr.charm', 'gt', 8)), ev(c('attr.realm', 'gte', 5)), ev(c('attr.realm', 'lt', 5))], [true, false, true, false]);
  assert.deepEqual([ev(c(`favor.${NPC}`, 'gte', 40)), ev(c(`favor.${NPC}`, 'lt', 40)), ev(c(`favor.${NPC}.tier`, 'eq', 'trusted'))], [true, false, true]);
  assert.equal(ev(c(`item.${ITEM}.held`, 'eq', true)), true);
  assert.equal(evaluateScenarioCondition(c('attr.charm', 'gte', 0), {}, RT), false, '占位存档读不到');

  // 真走一遍 advanceScenarioRuntime：节点 conditions 写 attr.charm ≥ 8，魅力 7 不激活，补到 8 激活
  const raw = JSON.parse(await readFile(new URL('./fixtures/scenario-mod/minimal.json', import.meta.url), 'utf8'));
  raw.scenario.events[0].conditions = [c('attr.charm', 'gte', 8)];
  assert.deepEqual(validateScenarioMod(raw).issues, [], 'attr 数字比较在事件 conditions 里合法');
  let s = applyStrictScenarioInitializationToSave(
    { 角色: { 位置: { 描述: '旧地点' }, 身份: { 先天六司: { 魅力: 7 }, 后天六司: {} } }, 世界: { 信息: {}, 状态: {} }, 系统: { 扩展: {} } },
    buildStrictScenarioInitialization(parseScenarioMod(raw), '2026-06-22T00:00:00.000Z'),
  );
  const rtOf = x => x.世界.状态.剧本模组;
  s = advanceScenarioRuntime(s).saveData;
  assert.equal(rtOf(s).activeEventIds.includes('event.firstmeeting'), false, '魅力 7 不激活');
  s.角色.身份.后天六司.魅力 = 1;
  s = advanceScenarioRuntime(s).saveData;
  assert.equal(rtOf(s).activeEventIds.includes('event.firstmeeting'), true, '先天 7＋后天 1＝8 激活');
});

test('validator：新路径在变体／conditions／completion 可用；拒绝非法 attr key、非法档值、非法 operator；档位比较只在变体；unlock.* 仍不进变体', async () => {
  const fixture = async () => JSON.parse(await readFile(new URL('./fixtures/scenario-mod/minimal.json', import.meta.url), 'utf8'));
  const ok = await fixture();
  ok.scenario.events[0].conditions = [c('attr.realm', 'gte', 3), c(`favor.${NPC}`, 'lt', 20), c(`favor.${NPC}.tier`, 'eq', 'trusted'), c(`item.${ITEM}.held`, 'eq', true)];
  ok.scenario.events[0].completion = [c('attr.charm', 'gt', 5)];
  ok.scenario.events[0].narrativeVariants = [{ when: [c(`favor.${NPC}.tier`, 'gte', 'close'), c('attr.temperament', 'lte', 3), c(`item.${ITEM}.held`, 'neq', true)], name: '变体' }];
  assert.deepEqual(validateScenarioMod(ok).issues, []);

  const bad = await fixture();
  bad.scenario.events[0].narrativeVariants = [{ when: [
    c('attr.spirituality', 'gte', 1),
    c('attr.fortune', 'eq', 1),
    c(`favor.${NPC}.tier`, 'eq', 'friend'),
    c(`favor.${NPC}.tier`, 'gte', 40),
    c('attr.charm', 'exists'),
    c(`item.${ITEM}.held`, 'gte', true),
    c('attr.charm', 'gte', '8'),
    c(`favor.${NPC}`, 'eq', 'trusted'),
    c(`item.${ITEM}.held`, 'eq', 1),
    c('favor.character.nobody_here', 'gte', 1),
    c('unlock.taiquan', 'eq', true),
  ], name: '坏' }];
  bad.scenario.events[0].conditions = [c(`favor.${NPC}.tier`, 'gte', 'close')];
  const issues = validateScenarioMod(bad).issues;
  const codeAt = i => issues.filter(x => x.path.startsWith(`scenario.events[0].narrativeVariants[0].when[${i}]`)).map(x => x.code);
  assert.deepEqual(codeAt(0), ['invalid_path'], '灵性不开');
  assert.deepEqual(codeAt(1), ['invalid_path'], '气运不开');
  assert.deepEqual(codeAt(2), ['invalid_value'], '非法档 id');
  assert.deepEqual(codeAt(3), ['invalid_value'], '档位比较值须是档 id');
  assert.deepEqual(codeAt(4), ['invalid_enum'], 'attr 不支持 exists');
  assert.deepEqual(codeAt(5), ['invalid_enum'], 'held 只有 eq/neq');
  assert.deepEqual(codeAt(6), ['invalid_value'], 'attr 比较值须是数字');
  assert.deepEqual(codeAt(7), ['invalid_value'], 'favor 数值比较值须是数字');
  assert.deepEqual(codeAt(8), ['invalid_value'], 'held 比较值须是布尔');
  assert.deepEqual(codeAt(9), ['missing_reference'], 'favor 人物须存在');
  assert.deepEqual(codeAt(10), ['ledger_unlock_site'], 'unlock.* 仍不进变体');
  assert.deepEqual(issues.filter(x => x.path.startsWith('scenario.events[0].conditions')).map(x => x.code), ['ledger_rank_variant_only'], '好感档先后比较只在变体（runtime 只比数字）');
});

// ── 右栏线卡单步钥匙 ──
const S02 = 'lcq.stage_02', S07 = 'lcq.stage_07_qingyuan_jiankang';
const JIN_ANCHOR = 'lcq.event.palace_haunting_rumor', XIAOZI = 'lcq.event.s07_03_xiaozi_appears';
const chronicleEntry = (stageId, eventId, sequence) => ({ id: `chronicle.${stageId}.${eventId}`, type: 'event', stageId, title: '', sequence });
const compassSave = (extra = {}) => ({
  ...saveOf(extra),
  世界: { 状态: { 剧本模组: { modId: S07, events: [], completedEventIds: [], flags: {}, acquaintances: {}, chronicle: [chronicleEntry(S02, 'lcq.event.s02_01', 1), chronicleEntry(S07, JIN_ANCHOR, 2)] } } },
});
// 线卡表的人物引用查名册（不是某个 mod 的本地人物）
const WANGZHE = 'lcq.character.wang_zhe';
const KEYS = [
  { id: 'charm', labelKey: 'k.charm', when: [c('attr.charm', 'gte', 8)] },
  { id: 'tube', labelKey: 'k.tube', when: [c(`item.${ITEM}.held`, 'eq', true)] },
  { id: 'friend', labelKey: 'k.friend', when: [{ anyOf: [c(`favor.${WANGZHE}.tier`, 'gte', 'close'), c('attr.realm', 'gte', 9)] }] },
];
const keyTable = keys => ({ version: 1, lines: [{ lineId: 'jin', nameKey: 'n.jin', anchorLine: 'jin', steps: [{ id: 'a', hintKey: 'k.a', keys }] }] });
const keyTexts = { 'n.jin': '晋', 'k.a': '去建康看看', 'k.charm': '魅力够高', 'k.tube': '那只竹筒', 'k.friend': '王哲信得过你' };
const cardOf = (save, table, texts = keyTexts) => compass.lineCompassView(save, { focusEventId: XIAOZI, compassPointer: () => '去建康 · 见某人', table, texts }).current;
const quiet = fn => { const saved = { warn: console.warn, error: console.error, info: console.info }; console.warn = console.error = console.info = () => {}; try { return fn(); } finally { Object.assign(console, saved); } };

test('线卡钥匙：当前步有 keys 时逐把给 label 与 held（传存档求值，可含 anyOf）；没有 keys 为空数组', () => {
  const card = cardOf(compassSave({ items: { [ITEM]: { 数量: 1 } } }), keyTable(KEYS));
  assert.equal(card.step, '去建康看看');
  assert.deepEqual(card.keys, [
    { id: 'charm', label: '魅力够高', held: true },
    { id: 'tube', label: '那只竹筒', held: true },
    { id: 'friend', label: '王哲信得过你', held: false },
  ]);
  const closer = cardOf(compassSave({ relations: { 王哲: { 角色ID: WANGZHE, 好感度: 70 } }, acquired: {} }), keyTable(KEYS));
  assert.deepEqual(closer.keys.map(k => [k.id, k.held]), [['charm', false], ['tube', false], ['friend', true]]);
  assert.deepEqual(cardOf(compassSave(), keyTable(undefined)).keys, []);
});

test('线卡钥匙：缺文案键记 LCQ-PCK-005，这一把不出，其余照出', () => {
  log.resetLogState();
  const texts = { ...keyTexts };
  delete texts['k.tube'];
  const card = quiet(() => cardOf(compassSave(), keyTable(KEYS), texts));
  assert.deepEqual(card.keys.map(k => k.id), ['charm', 'friend']);
  const hits = store.logStore.recent(500).filter(e => e.code === 'LCQ-PCK-005' && e.detail?.source === 'lineCompass');
  assert.deepEqual(hits.map(h => h.detail.textKey), ['k.tube']);
  log.resetLogState();
});

test('validateLineCompassTable：keys 的 id 步内唯一、labelKey 在 texts、when 非空且只许账本路径；新路径在表里可用', () => {
  const codes = keys => validateLineCompassTable(keyTable(keys), keyTexts).map(i => `${i.code}@${i.path.replace('lineCompass.lines[0].steps[0].', '')}`);
  assert.deepEqual(codes(KEYS), []);
  assert.deepEqual(codes([KEYS[0], { ...KEYS[1], id: 'charm' }]), ['duplicate_id@keys[1].id']);
  assert.deepEqual(codes([{ ...KEYS[0], labelKey: 'k.none' }]), ['missing_text@keys[0].labelKey']);
  assert.deepEqual(codes([{ ...KEYS[0], when: [] }]), ['invalid_type@keys[0].when']);
  assert.deepEqual(codes([{ ...KEYS[0], when: [c('flags.x', 'eq', true)] }]), ['ledger_only@keys[0].when[0].path']);
  assert.deepEqual(codes([{ ...KEYS[0], when: [c('attr.fortune', 'gte', 1)] }]), ['invalid_path@keys[0].when[0].path']);
  assert.deepEqual(codes([{ ...KEYS[0], note: 'x' }]), ['unknown_field@keys[0].note']);
  assert.deepEqual(codes('x'), ['invalid_type@keys']);
});

test('右栏：当前线卡下一步句子下列钥匙行，有的打 ✓、没有的归「还差」灰显；框架字读 texts', async () => {
  const vue = await readFile(new URL('../src/components/dashboard/RightSidebar.vue', import.meta.url), 'utf8');
  const card = vue.slice(vue.indexOf('<div v-if="lineCompass" class="quest-line-card">'), vue.indexOf('<template v-if="lineCompass.others.length">'));
  assert.ok(card.indexOf('lineCompass.current.step') < card.indexOf('lineCompass.current.keys.length'), '钥匙行在下一步句子下面');
  assert.match(card, /✓\{\{ key\.label \}\}/);
  assert.match(card, /class="quest-locked">\{\{ lineKeysText\('missing'\) \}\}/);
  assert.doesNotMatch(card, /可用：|还差：/, '框架字不写死在组件里');
  const packs = await loadTs('../src/modules/contentPacks/index.ts');
  assert.equal(packs.CONTENT_PACKS.texts['lineCompass.keys.held'], '可用：');
  assert.equal(packs.CONTENT_PACKS.texts['lineCompass.keys.missing'], '还差：');
});
