// REPORT-8091-05e63d31 二轮四项（2026-11-01）：
// ① CP03 龙神尸身搜刮不入包、战后搜尸——带行动判定的搜刮句被 AIBS 原链路排除，落到叙事模型；「撬下…收进背包」不认作搜刮。
// ② 白尾豹「山神庇佑」到期不摘——场面每拍推进 worldTurn 却不查到期，战中照样生效、收场也不摘。
// ③ 「服下朱箓蛇丹」被写成未入口——没有本地自服规则，自由行动背包事实块写「没有消耗任何物品」。
// ④ URL 开关 ?xiantu.test.nanhuangEncounters=on——只活在地址栏、只认 ? 查询，刷新／重进即丢且无回执。
// 每项都走真实代码：AIBS 原链路搜刮块与落账块按源码原样切出执行，场面宿主 submitSceneInput／confirmSceneAction 真打，票校验与背包事实块真跑。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { loadTs } from './loadTs.mjs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const json = p => JSON.parse(read(p));
const N = await loadTs('../src/modules/sceneModule/numbers.ts');
const E = await loadTs('../src/modules/scenarioMods/randomEncounter.ts');
const L = await loadTs('../src/modules/scenarioMods/locationLoot.ts');
const W = await loadTs('../src/modules/scenarioMods/whiteTailLeopard.ts');
const P = await loadTs('../src/utils/judgementPreflight.ts');
const host = await loadTs('../src/modules/sceneModule/host/controller.ts');
const ext = await loadTs('../src/modules/sceneModule/host/ext.ts');
const S = await loadTs('../src/modules/scenarioMods/freeAction/selfConsumable.ts');
const SI = await loadTs('../src/modules/scenarioMods/selfConsumableIntent.ts');
const T = await loadTs('../src/modules/scenarioMods/freeAction/ticket.ts');
const F = await loadTs('../src/modules/scenarioMods/freeAction/facts.ts');
const A = await loadTs('../src/modules/scenarioMods/freeAction/actorStatus.ts');
const { STATUS_CATALOG } = await loadTs('../src/modules/sceneModule/statuses.ts');
const { scenarioPlayerId } = await loadTs('../src/modules/scenarioMods/playerIdentity.ts');
const { namedEntity } = await loadTs('../src/modules/scenarioMods/namedEntities.ts');
const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
const init = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
const ts = (await import('typescript')).default;

const rt = s => s.世界.状态.剧本模组;
const ENC = N.GAME_NUMBERS.encounter, NH = ENC.regions.nanhuang;
const BUFF = W.leopardConfig().buff;
let opened;
async function open05b() {
  if (!opened) {
    const stage = JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_05b.json', import.meta.url), 'utf8'));
    opened = advanceScenarioRuntime(init.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), init.buildStrictScenarioInitialization(stage))).saveData;
    opened.元数据.创建时间 = '2026-11-01T01:00:00.000Z'; // 固定种子
  }
  return structuredClone(opened);
}
const moveTo = (s, key, sub) => { s.角色.位置 = { ...s.角色.位置, locationId: key, 描述: ['南荒', namedEntity('location', key)?.name || key, ...(sub ? [sub] : [])].join('·') }; };
function openWindows(s, ...windows) {
  const r = rt(s), until = new Set(windows.flatMap(w => w?.untilEventIds || []));
  r.completedEventIds = [...new Set([...(r.completedEventIds || []), ...windows.flatMap(w => w?.afterEventIds || [])])].filter(id => !until.has(id));
  if (r.travelLedger?.doneEventIds) r.travelLedger.doneEventIds = r.travelLedger.doneEventIds.filter(id => !until.has(id));
}
function forcedConfig(zone, entry) {
  const c = structuredClone(ENC);
  for (const t of Object.keys(c.tiers)) if (t !== 'safe') c.tiers[t] = { chance: 1, cooldownTurns: 0 };
  c.regions.nanhuang.zones = [zone]; c.regions.nanhuang.pool = [entry]; c.regions.nanhuang.skipDuringEventIds = [];
  return c;
}
const harness = save => { let current = save; return { get save() { return current; }, deps: { persist: async s => { current = structuredClone(s); } } }; };
const buffRows = s => Object.values(rt(s).sceneLedger?.statusRecords?.actors || {}).flat().filter(r => r.statusId === BUFF.statusId);
const buffOnRole = s => (s.角色.效果 || []).some(e => e.状态名称 === BUFF.name || e.来源 === W.BUFF_SOURCE);
const buffInScene = s => Object.values(ext.activeScene(s)?.state.statuses || {}).flat().some(x => x.id === BUFF.statusId);

/** 南荒随机战已到开战拍、身上挂着白尾豹增益（第 7 回合遇见 → buffUntilTurn=12）。 */
async function battleWithLeopardBuff() {
  globalThis.location = { search: '?sceneModule=on', hash: '', hostname: 'localhost', href: 'http://localhost/?sceneModule=on' };
  const s = await open05b(), zone = NH.zones[0], entry = NH.pool.find(e => e.zones.includes(zone.key));
  moveTo(s, 'lcq.location.giant_vine'); rt(s).worldTurn = 7;
  W.tickWhiteTailLeopard(s, { ...W.leopardConfig(), chance: 1 });
  assert.equal(rt(s).whiteTailLeopard.buffUntilTurn, 7 + BUFF.durationTurns);
  moveTo(s, zone.key, zone.subPlace ? '密林' : undefined); openWindows(s, zone.activeWhen, entry.activeWhen);
  const c = forcedConfig(zone, entry);
  rt(s).worldTurn = 8; E.tickRandomEncounter(s, { narrated: true, config: c });
  for (let i = 0; i < 3; i++) { rt(s).worldTurn++; E.tickRandomEncounter(s, { narrated: true, config: c }); }
  const pending = E.pendingRandomBattle(s); assert.ok(pending, '已到开战拍');
  return { s, zone, pending };
}
async function beat(h, dice) {
  if (!ext.activeScene(h.save)?.pending) await host.submitSceneInput(h.save, '我挥刀攻击对手', h.deps);
  if (dice) ext.activeScene(h.save).state.forced = dice;
  await host.confirmSceneAction(h.save, h.deps);
}

// —— AIBS 原链路：搜刮预结算与落账块按源码原样执行 ——
const ai = read('src/utils/AIBidirectionalSystem.ts');
const slice = (from, to) => { const i = ai.indexOf(from); assert.ok(i > 0, from); return ai.slice(i, ai.indexOf(to, i)); };
const compile = (body, args) => new Function(...args, ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText);
const preLoot = compile(slice('      const lootLocal = ', '      const legacyNarrativePilotResponse') + '\nreturn lootLocalText;',
  ['saveData', 'options', 'userMessage', 'cloneDeep', 'isLocationLootInput', 'settleLocationLoot']);
const commitLoot = compile(slice('    if ((response.moduleReceipt || response.localLoot)', '    const openWorldProgress'),
  ['saveData', 'options', 'response', 'changes', 'isLocationLootInput', 'settleLocationLoot']);
/** 一回合原链路：预结算出回执正文（返回空串＝落到叙事模型），再按回执落账。 */
function legacyLootTurn(save, input, options = {}) {
  const opts = { playerIntentText: input, ...options }, before = structuredClone(save);
  const text = preLoot(save, opts, input, structuredClone, L.isLocationLootInput, L.settleLocationLoot);
  assert.deepEqual(save, before, '预结算零副作用');
  if (!text) return '';
  commitLoot(save, opts, { text, localLoot: true }, [], L.isLocationLootInput, L.settleLocationLoot);
  return text;
}
const JUDGED = { judgementResolution: { id: 'judgement-explore', kind: 'explore' } };

test('① CP03 两句真机输入（带行动判定）：AIBS 原链路本地搜刮，回执物品真实入包、正文与回执一致；重放不双发', () => {
  assert.doesNotMatch(ai, /!options\?\.judgementResolution && isLocationLootInput/, '原链路搜刮不再以「无判定」为前提');
  const s = json('tests/fixtures/playtest-5e8f/cp03-dragon-corpse.json').saves[0].存档数据;
  assert.equal(Object.keys(s.角色.背包.物品).length, 23);
  for (const input of ['搜刮龙神的尸身', '撬下断角连同龙鳞收进背包']) {
    assert.ok(L.isLocationLootInput(input), input);
    const before = structuredClone(s.角色.背包.物品);
    const text = legacyLootTurn(s, input, JUDGED);
    assert.ok(text, `${input}：不落到叙事模型`);
    const receipt = rt(s).locationLoot.receipts.at(-1);
    assert.equal(receipt.turn, rt(s).worldTurn);
    const items = receipt.drops.filter(d => d.itemId);
    assert.ok(items.length, `${input}：本次有物品入账`);
    for (const d of items) {
      assert.equal(s.角色.背包.物品[d.itemId].数量, (before[d.itemId]?.数量 || 0) + d.quantity, d.name);
      assert.ok(text.includes(d.name), `正文写到 ${d.name}`);
    }
    const once = structuredClone(s);
    assert.equal(legacyLootTurn(s, input, JUDGED), text, '同一回合重放返回同一回执');
    assert.deepEqual(s, once, '重放不双发');
    rt(s).worldTurn++;
  }
  assert.ok(Object.keys(s.角色.背包.物品).length > 23, '背包件数增加（真机 23→23）');
});

test('① 搜刮句不弹无效探索判定卡；剥取类才算搜刮，收拾自己东西不算', () => {
  for (const t of ['搜查尸身', '搜刮龙神的尸身', '撬下断角连同龙鳞收进背包', '割下狼皮塞进行囊']) {
    assert.ok(L.isLocationLootInput(t), t);
    assert.equal(P.shouldSkipJudgementPreflight({ userMessage: t }), true, t);
  }
  assert.equal(P.buildLocalJudgementPreflight('搜查尸身', {}, 1)?.kind, 'explore', '关键词表本身不改');
  assert.equal(P.shouldSkipJudgementPreflight({ userMessage: '搜查暗门' }), false);
  assert.equal(P.shouldSkipJudgementPreflight({ userMessage: '搜查尸身', selectedSource: 'event_engine', selectedPlayerLine: '别的', }), false, '选中事件动作时照旧');
  for (const t of ['取下腰间的玉佩收进背包', '捡起短刀收进背包', '撬下断角', '我把龙鳞收进背包']) assert.equal(L.isLocationLootInput(t), false, t);
});

test('① 战后搜尸（打赢随机战）：输入不再开场面，「搜查尸身」带判定也按敌人掉落入包', async () => {
  const { s, zone, pending } = await battleWithLeopardBuff();
  const h = harness(s);
  for (let n = 0; n < 40 && (n === 0 || ext.activeScene(h.save)); n++) await beat(h, { action: Array(200).fill(20), defense: Array(400).fill(20) });
  assert.equal(ext.activeScene(h.save), null);
  assert.equal(ext.readExt(h.save).history.at(-1).outcome, 'win');
  moveTo(h.save, pending.locKey, zone.subPlace ? '密林' : undefined);
  assert.equal(await host.submitSceneInput(h.save, '搜查尸身', h.deps), false, '搜尸交故事回合，不开新场面');
  assert.equal(P.shouldSkipJudgementPreflight({ userMessage: '搜查尸身' }), true);
  const text = legacyLootTurn(h.save, '搜查尸身', JUDGED);
  const receipt = rt(h.save).locationLoot.receipts.at(-1);
  assert.equal(receipt.kind, 'spoils'); assert.ok(receipt.drops.length);
  for (const d of receipt.drops) { assert.ok(h.save.角色.背包.物品[d.itemId], d.name); assert.ok(text.includes(d.name)); }
});

test('② 山神庇佑：战中拍数推进到 buffUntilTurn 即摘（角色效果、状态账、场面状态），后续拍与收场后都不在', async () => {
  const { s } = await battleWithLeopardBuff();
  rt(s).worldTurn = 10;
  const h = harness(s);
  const dice = { action: Array(200).fill(2), defense: Array(400).fill(2) };
  await host.submitSceneInput(h.save, '我挥刀攻击对手', h.deps);
  assert.ok(buffInScene(h.save), '开场时增益进了场面状态（会影响掷骰）');
  await beat(h, dice);
  assert.equal(rt(h.save).worldTurn, 11); assert.ok(buffOnRole(h.save) && buffInScene(h.save), '11 拍仍在期内');
  await beat(h, dice);
  assert.equal(rt(h.save).worldTurn, 12);
  assert.equal(rt(h.save).whiteTailLeopard.buffUntilTurn, undefined);
  assert.ok(!buffOnRole(h.save)); assert.deepEqual(buffRows(h.save), []);
  if (ext.activeScene(h.save)) assert.ok(!buffInScene(h.save), '场面里也摘了');
  for (let n = 0; n < 40 && ext.activeScene(h.save); n++) { await beat(h, dice); assert.ok(!buffOnRole(h.save) && !buffInScene(h.save), `第 ${rt(h.save).worldTurn} 拍`); }
  assert.equal(ext.activeScene(h.save), null);
  assert.ok(!buffOnRole(h.save)); assert.deepEqual(buffRows(h.save), []);
});

test('② 山神庇佑：最后一拍未到期、收场推进那一回合到期的，也在收场时摘', async () => {
  const dice = { action: Array(200).fill(20), defense: Array(400).fill(20) };
  const probe = harness((await battleWithLeopardBuff()).s);
  for (let n = 0; n < 40 && (n === 0 || ext.activeScene(probe.save)); n++) await beat(probe, dice);
  const { s } = await battleWithLeopardBuff();
  const start = rt(s).worldTurn, endTurn = rt(probe.save).worldTurn;
  assert.ok(endTurn > start + 1, '打了不止一拍');
  rt(s).whiteTailLeopard.buffUntilTurn = endTurn; // 最后一拍后是 endTurn-1，收场推进到 endTurn
  const h = harness(s);
  for (let n = 0; n < 40 && (n === 0 || ext.activeScene(h.save)); n++) {
    if (ext.activeScene(h.save)) assert.ok(buffOnRole(h.save), '期内一直在');
    await beat(h, dice);
  }
  assert.equal(rt(h.save).worldTurn, endTurn);
  assert.ok(!buffOnRole(h.save)); assert.deepEqual(buffRows(h.save), []);
  assert.equal(rt(h.save).whiteTailLeopard.buffUntilTurn, undefined);
});

test('② 故事回合到期仍由回合收尾 tick 摘（未改动路径的回归）', async () => {
  const s = await open05b(); moveTo(s, 'lcq.location.giant_vine'); rt(s).worldTurn = 7;
  W.tickWhiteTailLeopard(s, { ...W.leopardConfig(), chance: 1 });
  rt(s).worldTurn = 11; W.tickWhiteTailLeopard(s, { ...W.leopardConfig(), chance: 0 }); assert.ok(buffOnRole(s));
  rt(s).worldTurn = 12; assert.equal(W.tickWhiteTailLeopard(s, { ...W.leopardConfig(), chance: 0 }).changed, true);
  assert.ok(!buffOnRole(s)); assert.deepEqual(buffRows(s), []);
});

async function withPill(n = 2) {
  const s = await open05b();
  s.角色.背包.物品['lcq.item.np013'] = { 物品ID: 'lcq.item.np013', 名称: '朱箓蛇丹', 数量: n, 类型: '丹药' };
  return s;
}
test('③ 「我取出朱箓蛇丹服下，运气疗伤」：本地扣一份、按配置（antidote）结算，不凭空回血；同回合重放不双扣', async () => {
  const poison = STATUS_CATALOG.find(d => d.remove?.some(r => r.kind === 'item' && r.ref === 'antidote'));
  assert.ok(poison);
  for (const poisoned of [false, true]) {
    const s = await withPill(), actor = scenarioPlayerId(s);
    if (poisoned) assert.ok(A.applyActorStatus(s, actor, poison.id, { sourceId: 'test' }).ok);
    const hp = s.角色.属性.气血.当前, input = '我取出朱箓蛇丹服下，运气疗伤';
    const r = S.settleSelfConsumable(s, input);
    assert.equal(r.itemId, 'lcq.item.np013'); assert.equal(r.count, 1);
    assert.equal(s.角色.背包.物品['lcq.item.np013'].数量, 1);
    assert.equal(s.角色.属性.气血.当前, hp, '物品没配回血就不回血');
    assert.match(r.facts[0], /服下了朱箓蛇丹/);
    if (poisoned) {
      assert.match(r.facts.join('；'), new RegExp(`解除了${poison.label}`));
      assert.ok(!Object.values(rt(s).sceneLedger.statusRecords.actors).flat().some(row => row.statusId === poison.id), '中毒已解');
    } else assert.match(r.facts.join('；'), /没有它能解除的状态/);
    const once = structuredClone(s);
    assert.deepEqual(S.settleSelfConsumable(s, input), r); assert.deepEqual(s, once, '同回合重放不双扣');
  }
});

test('③ UI 发送链：自服结算在自由行动之后、背包事实块之前；块里写明扣除，不再是「没有消耗任何物品」', async () => {
  const vue = read('src/components/dashboard/MainGamePanel.vue');
  const settle = vue.indexOf('settleFreeActionTurn(freeActionSave'), self = vue.indexOf('settleSelfConsumable(selfUseSave, typedText)'), inv = vue.indexOf('renderInventoryBlock(inventoryBefore');
  assert.ok(settle > 0 && self > settle && inv > self, '顺序：自由行动 → 自服 → 背包事实');
  assert.ok(vue.indexOf("await characterStore.saveToSlot('上次对话')") < self, '在「上次对话」备份之后（失败整份回退）');
  assert.match(vue, /freeActionBlock \+= renderSelfConsumableBlock\(selfUse\)/);
  // 同一顺序真跑：自由行动兜底票（疗伤）照出，自服落账后背包事实块显示扣除。
  const s = await withPill(), input = '我取出朱箓蛇丹服下，运气疗伤';
  assert.ok(T.localTargetlessTickets(input).some(t => t.actionClass === 'solo' && t.variant === 'recover'), '运气疗伤照旧出调息疗伤票');
  const before = F.inventoryCounts(s), r = S.settleSelfConsumable(s, input);
  const block = S.renderSelfConsumableBlock(r) + F.renderInventoryBlock(before, s);
  assert.match(block, /服下了朱箓蛇丹/); assert.match(block, /失去朱箓蛇丹×1/);
  assert.doesNotMatch(block, /没有让背包物品增减/);
  assert.match(S.renderSelfConsumableReceipt(r), /^已服用：/);
});

test('③ 意图模型把自服报成没对象的喂药票：丢票不出「未发生」；真喂给不在场的人仍按原规则拒', async () => {
  const s = await withPill(), input = '我取出朱箓蛇丹服下';
  const { freeActionConfig } = await loadTs('../src/modules/scenarioMods/freeAction/config.ts');
  const ticket = { actionClass: 'give', variant: 'feed_pill', targetId: null, degree: freeActionConfig().degrees[0], performed: 'yes', evidence: '朱箓蛇丹服下', itemId: 'lcq.item.np013' };
  const self = T.validateFreeActionTickets([ticket], input, s);
  assert.deepEqual(self.refusals, []); assert.deepEqual(self.tickets, []);
  assert.ok(self.discards.some(d => d.reason === 'self_use'));
  const other = T.validateFreeActionTickets([{ ...ticket, targetId: 'nobody', evidence: '朱箓蛇丹喂给' }], '把朱箓蛇丹喂给他', s);
  assert.equal(other.refusals.length, 1, '喂给别人不是自服');
});

test('③ 识别边界：否定、喂人、点名多件、未持有都不结算；「毫不犹豫地服下」算', async () => {
  const s = await withPill(1);
  for (const t of ['不要服下朱箓蛇丹', '我没服下朱箓蛇丹', '把朱箓蛇丹喂给乐明珠', '给乐明珠服下朱箓蛇丹', '服下回春丹']) assert.equal(SI.selfConsumableTarget(s, t), undefined, t);
  assert.equal(SI.selfConsumableTarget(s, '我毫不犹豫地服下朱箓蛇丹')?.itemId, 'lcq.item.np013');
  const r = S.settleSelfConsumable(s, '我毫不犹豫地服下朱箓蛇丹');
  assert.equal(s.角色.背包.物品['lcq.item.np013'], undefined, '末份扣完删行');
  rt(s).worldTurn++;
  assert.equal(S.settleSelfConsumable(s, '我毫不犹豫地服下朱箓蛇丹'), undefined, '已没有就不假结算');
  assert.ok(r);
});

test('③ 带 onUse 的消耗品：配置状态实际落账', async () => {
  const s = await open05b(), id = 'lyg.item.np071';
  const { itemEffectOf } = await loadTs('../src/modules/scenarioMods/freeAction/itemUse.ts');
  assert.ok(itemEffectOf(id).onUse.length, '样本物品带 onUse');
  s.角色.背包.物品[id] = { 物品ID: id, 名称: '六识禁绝丹', 数量: 1, 类型: '丹药' };
  const r = S.settleSelfConsumable(s, '服下六识禁绝丹');
  assert.match(r.facts.join('；'), /药效生效/);
  assert.equal(s.角色.背包.物品[id], undefined);
  const rows = Object.values(rt(s).sceneLedger.statusRecords.actors).flat();
  for (const use of itemEffectOf(id).onUse) assert.ok(rows.some(row => row.statusId === use.statusId), use.statusId);
});

function memoryStorage(init = {}) { const m = new Map(Object.entries(init)); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), map: m }; }
test('④ URL 开关：? 与 # 后都认；开过后本标签页刷新／重进首页仍开（sessionStorage），不写 localStorage；off 优先；存储异常不挡 URL', () => {
  const prior = { location: globalThis.location, ls: globalThis.localStorage, ss: globalThis.sessionStorage, info: console.info };
  const flag = N.GAME_NUMBERS.e2eSmoke.nanhuangEncounters.flag, infos = [];
  try {
    console.info = (...a) => infos.push(a.join(' '));
    const local = memoryStorage(), tab = memoryStorage();
    globalThis.localStorage = local; globalThis.sessionStorage = tab;
    globalThis.location = { search: '', hash: '' };
    assert.equal(E.nanhuangTestRates(), undefined, '默认关');
    globalThis.location = { search: `?${flag}=on`, hash: '' };
    assert.equal(E.nanhuangTestRates().encounterChance, 1);
    assert.equal(tab.getItem(flag), 'on'); assert.equal(local.getItem(flag), null, '不写 localStorage');
    globalThis.location = { search: '', hash: '' };
    assert.equal(E.nanhuangTestRates()?.encounterChance, 1, '刷新丢了参数仍开');
    assert.equal(infos.filter(x => x.includes('南荒测试开关')).length, 2, '来源变化各回执一次（url → sessionStorage）');
    E.nanhuangTestRates(); assert.equal(infos.filter(x => x.includes('南荒测试开关')).length, 2, '不刷屏');
    globalThis.location = { search: '', hash: `#/game?${flag}=off` };
    local.setItem(flag, 'on');
    assert.equal(E.nanhuangTestRates(), undefined, 'URL off 压过 localStorage on');
    globalThis.location = { search: '', hash: '' };
    assert.equal(E.nanhuangTestRates(), undefined, 'off 也留在本标签页');
    tab.removeItem(flag);
    assert.equal(E.nanhuangTestRates()?.encounterChance, 1, '只剩 localStorage on');
    globalThis.localStorage = { getItem() { throw Error('blocked'); } }; globalThis.sessionStorage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
    globalThis.location = { search: `?${flag}=on`, hash: '' };
    assert.equal(E.nanhuangTestRates().leopardChance, 1, '存储都不可用时 URL 照样生效');
    globalThis.location = { search: '', hash: `#/x?${flag}=ON` };
    assert.equal(E.nanhuangTestRates().encounterChance, 1, '大小写不敏感');
  } finally { Object.assign(globalThis, { location: prior.location, localStorage: prior.ls, sessionStorage: prior.ss }); console.info = prior.info; }
  assert.match(read('src/main.ts'), /randomEncounter'\)\.then\(m => m\.nanhuangTestRates\(\)\)/, '启动即读一次，参数在首个回合前就记下');
});
