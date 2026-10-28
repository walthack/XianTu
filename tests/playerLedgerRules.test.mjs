// 玩家账本规则表交叉校验 T1（身份账设计稿 2026-10-25 §6）：身份/事件/国家线 id、保留末段、授撤冲突；T5 唯一道具组（补充设计稿 2026-10-26 §2.6）；T7 在队规则（同稿 §3.6）；T8 进度期限与刻度（同稿 §4.7）；T9 身份 secret（同稿 §5.1）；T10 期限 onDue.endingId（同稿 §10-T10）。规则均为测试夹具。
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const modPromise = loadTs('../src/modules/scenarioMods/playerLedgerRules.ts');

const EVENT = 'lcq.event.charge_sudaji_fee';
const EVENT_2 = 'lcq.event.free_ajiman';
const ZHUSHI = { id: 'liuchao.identity.song.baochao_zhushi', name: '宝钞铺主事', kind: 'merchant', lineId: 'song', rank: 2 };
const FENHAO = { id: 'liuchao.identity.jin.baochao_fenhao', name: '宝钞分号', kind: 'merchant', lineId: 'jin' };
const rules = (patch = {}) => ({ version: 1, identityGrants: [], identityRevokes: [], lineOutcomes: [], ...patch });

test('仓库秦线收束规则与只读身份定义通过校验', async () => {
  const { playerLedgerRules, playerIdentityDefs, validatePlayerLedgerRules } = await modPromise;
  assert.deepEqual(playerLedgerRules(), { ...playerLedgerRules(), identityGrants: [], identityRevokes: [], lineOutcomes: [{ eventId: 'liuchao.event.qin_close_default', lineId: 'qin', outcome: 'unresolved' }], itemGroups: [], partyJoins: [], partyLeaves: [], partyOpenings: [] });
  assert.deepEqual(playerIdentityDefs().map(d => d.id), ['liuchao.identity.han.marquis_wuyang', 'liuchao.identity.jin.panjiang_shaozhu']);
  assert.deepEqual(validatePlayerLedgerRules(playerLedgerRules()), []);
  // 六条判档线都能被实体索引认出且可写收束档
  const table = rules({ lineOutcomes: ['nanhuang', 'jin', 'song', 'han', 'tang', 'qin'].map(lineId => ({ eventId: EVENT, lineId, outcome: 'resolved' })) });
  assert.deepEqual(validatePlayerLedgerRules(table), []);
});

test('太泉不判档：收束规则的 lineId 须在 story.lineOutcome.judgedLines', async () => {
  const { validatePlayerLedgerRules } = await modPromise;
  const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
  assert.equal(numbers.GAME_NUMBERS.story.lineOutcome.judgedLines.includes('taiquan'), false);
  const table = rules({ lineOutcomes: [{ eventId: EVENT, lineId: 'taiquan', outcome: 'resolved' }] });
  // 太泉是已知国家线（实体索引 kind=line），报的是非判档而不是未知
  assert.deepEqual(validatePlayerLedgerRules(table, { identities: [] }), [`收束规则 ${EVENT} → taiquan：lineId 不在 story.lineOutcome.judgedLines（非判档线不写收束档）：taiquan`]);
  // 判档线集合走配置：引用集合换成含太泉即通过，去掉宋即报错
  assert.deepEqual(validatePlayerLedgerRules(table, { identities: [], judgedLines: ['taiquan'] }), []);
  const song = rules({ lineOutcomes: [{ eventId: EVENT, lineId: 'song', outcome: 'resolved' }] });
  assert.ok(validatePlayerLedgerRules(song, { identities: [], judgedLines: ['jin'] }).some(e => /非判档线不写收束档）：song/.test(e)));
  // 未知线只报未知，不重复报非判档
  const chu = validatePlayerLedgerRules(rules({ lineOutcomes: [{ eventId: EVENT, lineId: 'chu', outcome: 'resolved' }] }), { identities: [] });
  assert.deepEqual(chu, [`收束规则 ${EVENT} → chu：lineId 未知：chu`]);
});

test('未知 identityId/eventId/lineId 报错', async () => {
  const { validatePlayerLedgerRules } = await modPromise;
  const refs = { identities: [ZHUSHI, FENHAO] };
  assert.deepEqual(validatePlayerLedgerRules(rules({
    identityGrants: [{ eventId: EVENT, identityId: ZHUSHI.id }, { eventId: EVENT_2, identityId: ZHUSHI.id, whenHeld: 'redirect', redirectIdentityId: FENHAO.id }],
    identityRevokes: [{ eventId: EVENT_2, identityId: FENHAO.id }],
    lineOutcomes: [{ eventId: EVENT, lineId: 'nanhuang', outcome: 'unresolved' }],
  }), refs), []);
  const errors = validatePlayerLedgerRules(rules({
    identityGrants: [
      { eventId: EVENT, identityId: 'liuchao.identity.song.nobody' },
      { eventId: 'lcq.event.no_such_event', identityId: ZHUSHI.id },
      { eventId: EVENT, identityId: ZHUSHI.id, whenHeld: 'redirect' },
      { eventId: EVENT_2, identityId: ZHUSHI.id, whenHeld: 'redirect', redirectIdentityId: 'liuchao.identity.jin.nobody' },
    ],
    identityRevokes: [{ eventId: EVENT, identityId: 'liuchao.identity.han.nobody' }],
    lineOutcomes: [{ eventId: EVENT, lineId: 'chu', outcome: 'resolved' }],
  }), { identities: [ZHUSHI, FENHAO, { ...FENHAO, id: 'liuchao.identity.yue.x', lineId: 'yue', kind: 'pirate' }] });
  const has = (re) => assert.ok(errors.some(e => re.test(e)), `缺少报错 ${re}：${errors.join(' | ')}`);
  has(/identityId 未知：liuchao\.identity\.song\.nobody/);
  has(/eventId 未知：lcq\.event\.no_such_event/);
  has(/whenHeld=redirect 须带 redirectIdentityId/);
  has(/redirectIdentityId 未知：liuchao\.identity\.jin\.nobody/);
  has(/identityId 未知：liuchao\.identity\.han\.nobody/);
  has(/lineId 未知：chu/);
  has(/liuchao\.identity\.yue\.x 的 lineId 未知：yue/);
  has(/liuchao\.identity\.yue\.x 的 kind 不在 story\.identity\.kinds：pirate/);
});

test('身份 id 末段为 from/status 报错', async () => {
  const { validatePlayerLedgerRules } = await modPromise;
  for (const tail of ['from', 'status']) {
    const errors = validatePlayerLedgerRules(rules(), { identities: [{ ...ZHUSHI, id: `liuchao.identity.song.${tail}` }] });
    assert.ok(errors.some(e => e.includes(`末段不能是`) && e.includes(`liuchao.identity.song.${tail}`)), errors.join(' | '));
  }
  assert.deepEqual(validatePlayerLedgerRules(rules(), { identities: [{ ...ZHUSHI, id: 'liuchao.identity.song.from_south' }] }), []);
});

test('身份定义 secret 只能填 true（补充设计稿 2026-10-26 §5.1）', async () => {
  const { validatePlayerLedgerRules } = await modPromise;
  assert.deepEqual(validatePlayerLedgerRules(rules(), { identities: [{ ...ZHUSHI, secret: true }] }), []);
  for (const secret of [false, 'yes', 1]) {
    assert.deepEqual(validatePlayerLedgerRules(rules(), { identities: [{ ...ZHUSHI, secret }] }), [`身份 ${ZHUSHI.id} 的 secret 只能填 true（不填＝公开）`], String(secret));
  }
});

test('同事件同身份既授又撤报错', async () => {
  const { validatePlayerLedgerRules } = await modPromise;
  const errors = validatePlayerLedgerRules(rules({
    identityGrants: [{ eventId: EVENT, identityId: ZHUSHI.id }],
    identityRevokes: [{ eventId: EVENT, identityId: ZHUSHI.id }],
  }), { identities: [ZHUSHI] });
  assert.ok(errors.some(e => /既授予又撤销/.test(e)), errors.join(' | '));
});

const YY_LYG = 'lyg.item.np044';
const YY_LYL = 'lyl.item.np036';
const PEARL_LYG = 'lyg.item.np111';
const PEARL_LIUCHAO = 'liuchao.item.parrot_fish_eye';
const TRADE_ITEM = 'lcq.item.ajiman_bond';

test('道具组：合法组通过；缺键按 [] 处理', async () => {
  const { validatePlayerLedgerRules } = await modPromise;
  const { itemGroups, ...noKey } = rules();
  assert.equal(itemGroups, undefined);
  assert.deepEqual(validatePlayerLedgerRules(noKey, { identities: [] }), []);
  assert.deepEqual(validatePlayerLedgerRules(rules({ itemGroups: [
    { id: 'liuchao.itemgroup.yinyang_fish', itemIds: [YY_LYG, YY_LYL] },
    { id: 'liuchao.itemgroup.parrot_fish_eye', itemIds: [PEARL_LYG], whenHeld: 'redirect', redirectItemId: PEARL_LIUCHAO },
  ] }), { identities: [] }), []);
  assert.deepEqual(validatePlayerLedgerRules(rules({ itemGroups: {} }), { identities: [] }), ['规则表 itemGroups 须为数组']);
});

test('道具组：未知 itemId、一物两组、redirect 物品入组、组内物品出现在 story.trades.grantItemId 都报错', async () => {
  const { validatePlayerLedgerRules } = await modPromise;
  const numbers = await loadTs('../src/modules/sceneModule/numbers.ts');
  assert.ok(numbers.GAME_NUMBERS.story.trades.some(t => t.grantItemId === TRADE_ITEM), '夹具前提：阿姬曼身契走 story.trades 直写背包');
  const errors = validatePlayerLedgerRules(rules({ itemGroups: [
    { id: 'liuchao.itemgroup.yinyang_fish', itemIds: [YY_LYG, 'lyg.item.no_such_item'] },
    { id: 'liuchao.itemgroup.yinyang_again', itemIds: [YY_LYL, YY_LYG] },
    { id: 'liuchao.itemgroup.parrot', itemIds: [PEARL_LYG], whenHeld: 'redirect', redirectItemId: YY_LYL },
    { id: 'liuchao.itemgroup.bond', itemIds: [TRADE_ITEM] },
  ] }), { identities: [] });
  const has = (re) => assert.ok(errors.some(e => re.test(e)), `缺少报错 ${re}：${errors.join(' | ')}`);
  has(/道具组 liuchao\.itemgroup\.yinyang_fish：itemId 未知（实体索引 kind=item）：lyg\.item\.no_such_item/);
  has(/道具组 liuchao\.itemgroup\.yinyang_again：itemId lyg\.item\.np044 已属道具组 liuchao\.itemgroup\.yinyang_fish（一物只属一组）/);
  has(/道具组 liuchao\.itemgroup\.parrot：redirectItemId lyl\.item\.np036 属于道具组 liuchao\.itemgroup\.yinyang_again（改发物品不得入组/);
  has(/道具组 liuchao\.itemgroup\.bond：itemId lcq\.item\.ajiman_bond 出现在 story\.trades 的 grantItemId/);
  assert.equal(errors.length, 4, errors.join(' | '));
  // story.trades 集合可由引用集合替换
  assert.deepEqual(validatePlayerLedgerRules(rules({ itemGroups: [{ id: 'liuchao.itemgroup.bond', itemIds: [TRADE_ITEM] }] }), { identities: [], tradeGrantItemIds: [] }), []);
});

test('道具组：id 格式、末段 from、重复 id、whenHeld 取值与 redirectItemId 搭配报错', async () => {
  const { validatePlayerLedgerRules } = await modPromise;
  const errors = validatePlayerLedgerRules(rules({ itemGroups: [
    { id: 'lyg.itemgroup.wrong_prefix', itemIds: [YY_LYG] },
    { id: 'liuchao.itemgroup.from', itemIds: [YY_LYL] },
    { id: 'liuchao.itemgroup.dup', itemIds: [PEARL_LYG], whenHeld: 'redirect' },
    { id: 'liuchao.itemgroup.dup', itemIds: [PEARL_LIUCHAO], whenHeld: 'reinforce' },
    { id: 'liuchao.itemgroup.empty', itemIds: [] },
    { id: 'liuchao.itemgroup.stray', itemIds: ['lyg.item.chi_tu_horse'], redirectItemId: 'lcq.item.backpack' },
    { id: 'liuchao.itemgroup.bad_redirect', itemIds: ['lcq.item.backpack_plain'], whenHeld: 'redirect', redirectItemId: 'lyg.item.no_such_item' },
  ] }), { identities: [] });
  const has = (re) => assert.ok(errors.some(e => re.test(e)), `缺少报错 ${re}：${errors.join(' | ')}`);
  has(/道具组 lyg\.itemgroup\.wrong_prefix：id 须为 liuchao\.itemgroup\.<名>/);
  has(/道具组 liuchao\.itemgroup\.from：id 末段不能是 from/);
  has(/道具组 id 重复：liuchao\.itemgroup\.dup/);
  has(/liuchao\.itemgroup\.dup：whenHeld=redirect 须带 redirectItemId/);
  has(/liuchao\.itemgroup\.dup：whenHeld 须为 skip\/redirect/);
  has(/liuchao\.itemgroup\.empty：itemIds 须为非空数组/);
  has(/liuchao\.itemgroup\.stray：redirectItemId 只用于 whenHeld=redirect/);
  has(/liuchao\.itemgroup\.bad_redirect：redirectItemId 未知（实体索引 kind=item）：lyg\.item\.no_such_item/);
  // 末段含 from 但不等于 from 的照常通过
  assert.deepEqual(validatePlayerLedgerRules(rules({ itemGroups: [{ id: 'liuchao.itemgroup.from_south', itemIds: [YY_LYG] }] }), { identities: [] }), []);
});

test('在队规则：合法规则通过；缺键按 [] 处理；非数组报错', async () => {
  const { validatePlayerLedgerRules } = await modPromise;
  const RCPT = 'rcpt.baihu.o1.deferential';
  assert.deepEqual(validatePlayerLedgerRules(rules(), { identities: [] }), []);
  assert.deepEqual(validatePlayerLedgerRules(rules({
    partyOpenings: [{ stageId: 'lcq.stage_01', characterIds: ['liuchao.character.ning_yu'] }],
    partyLeaves: [{ eventId: EVENT, characterId: 'liuchao.character.ning_yu', whenReceiptId: RCPT }],
    partyJoins: [{ eventId: EVENT_2, characterId: 'liuchao.character.ning_yu' }, { eventId: EVENT, characterId: 'liuchao.character.ning_yu' }],
  }), { identities: [] }), [], '同事件同人物入离各一条、whenReceiptId 不同时允许');
  for (const key of ['partyJoins', 'partyLeaves', 'partyOpenings']) {
    assert.deepEqual(validatePlayerLedgerRules(rules({ [key]: {} }), { identities: [] }), [`规则表 ${key} 须为数组`]);
  }
});

test('在队规则：未知 eventId/characterId/whenReceiptId/stageId、主角入规则、开局关重复、同事件同人物既入又离都报错', async () => {
  const { validatePlayerLedgerRules, PROTAGONIST_CHARACTER_IDS } = await modPromise;
  const NING_YU = 'liuchao.character.ning_yu';
  const HERO = PROTAGONIST_CHARACTER_IDS[0];
  const errors = validatePlayerLedgerRules(rules({
    partyJoins: [
      { eventId: 'lcq.event.no_such_event', characterId: NING_YU },
      { eventId: EVENT, characterId: 'liuchao.character.no_such_person' },
      { eventId: EVENT, characterId: HERO },
      { eventId: EVENT_2, characterId: NING_YU },
    ],
    partyLeaves: [
      { eventId: EVENT_2, characterId: NING_YU },
      { eventId: EVENT, characterId: NING_YU, whenReceiptId: 'rcpt.no_such_receipt' },
    ],
    partyOpenings: [
      { stageId: 'lcq.stage_99', characterIds: [NING_YU] },
      { stageId: 'lcq.stage_01', characterIds: [HERO] },
      { stageId: 'lcq.stage_01', characterIds: [NING_YU] },
    ],
  }), { identities: [] });
  const has = (re) => assert.ok(errors.some(e => re.test(e)), `缺少报错 ${re}：${errors.join(' | ')}`);
  has(/入队规则 lcq\.event\.no_such_event → liuchao\.character\.ning_yu：eventId 未知/);
  has(/入队规则 .* → liuchao\.character\.no_such_person：characterId 未知（实体索引 kind=character）/);
  has(/入队规则 .* → liuchao\.character\.cheng_zongyang：主角不能写进在队规则/);
  has(/离队规则 lcq\.event\.free_ajiman → liuchao\.character\.ning_yu：同一事件同一人物不能既入队又离队/);
  has(/离队规则 .*：whenReceiptId 未知（实体索引 kind=receipt）：rcpt\.no_such_receipt/);
  has(/开局在队 lcq\.stage_99：stageId 未知/);
  has(/开局在队 lcq\.stage_01：主角不能写进在队规则/);
  has(/开局在队 lcq\.stage_01：同一关只能有一份开局名单/);
  assert.equal(errors.length, 8, errors.join(' | '));
});

test('进度期限：合法规则通过；缺键按 [] 处理；非数组报错；limits 键须正好是期限 id 集合', async () => {
  const { validatePlayerLedgerRules, playerLedgerRules } = await modPromise;
  const BINGU = 'liuchao.deadline.bingu';
  const deadline = { id: BINGU, name: '冰蛊', startEventIds: [EVENT], clearEventIds: [EVENT_2], excludeLineIds: ['taiquan'], promptCue: { urgent: '寒意', due: '冰封' } };
  const limits = { [BINGU]: { due: 3, urgentAt: 2 } };
  assert.deepEqual(validatePlayerLedgerRules(rules({ progressTicks: [{ eventId: EVENT_2, lineId: 'jin' }], progressDeadlines: [deadline] }), { identities: [], deadlineLimits: limits }), []);
  assert.deepEqual(validatePlayerLedgerRules(rules(), { identities: [] }), [], '缺键按 []，仓库 limits 首版 {}');
  assert.deepEqual(playerLedgerRules().progressDeadlines, []);
  for (const key of ['progressTicks', 'progressDeadlines']) {
    assert.deepEqual(validatePlayerLedgerRules(rules({ [key]: {} }), { identities: [] }), [`规则表 ${key} 须为数组`]);
  }
  assert.deepEqual(validatePlayerLedgerRules(rules({ progressDeadlines: [deadline] }), { identities: [], deadlineLimits: {} }), [`期限 ${BINGU}：story.progressDeadline.limits 缺此键`]);
  assert.deepEqual(validatePlayerLedgerRules(rules(), { identities: [], deadlineLimits: limits }), [`story.progressDeadline.limits.${BINGU} 不是规则表里的期限 id`]);
});

test('进度期限：未知 eventId、非国家线、同一事件两个刻度、id 格式与末段 state、起点为空或与解除相交、promptCue 形状都报错', async () => {
  const { validatePlayerLedgerRules } = await modPromise;
  const ids = ['liuchao.deadline.a', 'liuchao.deadline.state', 'bad.deadline', 'liuchao.deadline.a', 'liuchao.deadline.empty'];
  const errors = validatePlayerLedgerRules(rules({
    progressTicks: [
      { eventId: 'lcq.event.no_such_event', lineId: 'jin' },
      { eventId: EVENT, lineId: 'liang' },
      { eventId: EVENT_2, lineId: 'song' },
      { eventId: EVENT_2, lineId: 'han' },
    ],
    progressDeadlines: [
      { id: ids[0], name: '甲', startEventIds: [EVENT], clearEventIds: [EVENT, 'lcq.event.no_such_clear'], excludeLineIds: ['liang'], promptCue: { soon: 'x' } },
      { id: ids[1], name: '乙', startEventIds: ['lcq.event.no_such_start'], clearEventIds: [] },
      { id: ids[2], name: '', startEventIds: [EVENT], clearEventIds: 'x' },
      { id: ids[3], name: '丁', startEventIds: [EVENT], clearEventIds: [], promptCue: { due: 1 } },
      { id: ids[4], name: '戊', startEventIds: [], clearEventIds: [] },
    ],
  }), { identities: [], deadlineLimits: Object.fromEntries(ids.map(id => [id, { due: 1, urgentAt: 0 }])) });
  const has = (re) => assert.ok(errors.some(e => re.test(e)), `缺少报错 ${re}：${errors.join(' | ')}`);
  has(/刻度 lcq\.event\.no_such_event：eventId 未知/);
  has(/刻度 lcq\.event\.charge_sudaji_fee：lineId 不在 7 条国家线：liang/);
  has(/刻度 lcq\.event\.free_ajiman：同一事件最多算一个刻度/);
  has(/期限 liuchao\.deadline\.a：clearEventIds eventId 未知：lcq\.event\.no_such_clear/);
  has(/期限 liuchao\.deadline\.a：起点与解除不能是同一事件：lcq\.event\.charge_sudaji_fee/);
  has(/期限 liuchao\.deadline\.a：excludeLineIds lineId 不在 7 条国家线：liang/);
  has(/期限 liuchao\.deadline\.a：promptCue 只能有 urgent \/ due：soon/);
  has(/期限 liuchao\.deadline\.state：id 末段不能是 state/);
  has(/期限 liuchao\.deadline\.state：startEventIds eventId 未知：lcq\.event\.no_such_start/);
  has(/期限 bad\.deadline：id 须为 liuchao\.deadline\.<名>/);
  has(/期限 bad\.deadline：缺展示名/);
  has(/期限 bad\.deadline：clearEventIds 须为数组/);
  has(/期限 id 重复：liuchao\.deadline\.a/);
  has(/期限 liuchao\.deadline\.a：promptCue\.due 须为字串/);
  has(/期限 liuchao\.deadline\.empty：startEventIds 不能为空/);
  assert.equal(errors.length, 15, errors.join(' | '));
});

test('进度期限 onDue：endingId 须在 endings.json（冰蛊坏结局可用），形状不对报错', async () => {
  const { validatePlayerLedgerRules, endingDefinition } = await modPromise;
  const BINGU = 'liuchao.deadline.bingu';
  const ICE_GU = 'lcq.ending.death.ajiman_bond';
  const deadline = (onDue) => ({ id: BINGU, name: '冰蛊', startEventIds: [EVENT], clearEventIds: [EVENT_2], onDue });
  const check = (onDue, refs = {}) => validatePlayerLedgerRules(rules({ progressDeadlines: [deadline(onDue)] }), { identities: [], deadlineLimits: { [BINGU]: { due: 3, urgentAt: 2 } }, ...refs });
  assert.equal(endingDefinition(ICE_GU)?.title, '冰蛊', '仓库 endings.json 里有冰蛊坏结局');
  assert.equal(endingDefinition('lcq.ending.no_such'), undefined);
  assert.deepEqual(check({ endingId: ICE_GU }), []);
  assert.deepEqual(check(undefined), [], 'onDue 可选');
  assert.deepEqual(check({ endingId: 'lcq.ending.no_such' }), [`期限 ${BINGU}：onDue.endingId 不在 entity-catalog/endings.json：lcq.ending.no_such`]);
  assert.deepEqual(check({ endingId: ICE_GU }, { endingIds: ['test.ending'] }), [`期限 ${BINGU}：onDue.endingId 不在 entity-catalog/endings.json：${ICE_GU}`], '夹具可替换结局集合');
  assert.deepEqual(check({ endingId: 'test.ending' }, { endingIds: ['test.ending'] }), []);
  assert.deepEqual(check({ endingId: ICE_GU, title: '冰蛊' }), [`期限 ${BINGU}：onDue 只能有 endingId：title`]);
  assert.deepEqual(check({}), [`期限 ${BINGU}：onDue.endingId 不在 entity-catalog/endings.json：undefined`]);
  assert.deepEqual(check(ICE_GU), [`期限 ${BINGU}：onDue 须为对象`]);
  assert.deepEqual(check([ICE_GU]), [`期限 ${BINGU}：onDue 须为对象`]);
});
