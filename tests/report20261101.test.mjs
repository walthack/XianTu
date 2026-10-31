// 2026-11-01 五项：① AIBS 普通叙事回合搜刮入包、JSON 外叙事不丢（小范围解冻）② 草原从地图去掉 ③ 序幕四年改挂 s02_04 并接过渡叙述
// ④ 南荒随机遇敌敌池（含花苗寨一带与密林、村寨不检、F04/F06/F12 门闩、一打一同伴只给 buff、搜尸走敌人掉落、稀有物全局一次）⑤ 白尾豹彩蛋。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadTs } from './loadTs.mjs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const json = p => JSON.parse(read(p));
const N = await loadTs('../src/modules/sceneModule/numbers.ts');
const E = await loadTs('../src/modules/scenarioMods/randomEncounter.ts');
const L = await loadTs('../src/modules/scenarioMods/locationLoot.ts');
const J = await loadTs('../src/utils/jsonExtract.ts');
const M = await loadTs('../src/modules/scenarioMods/travel/mapTravel.ts');
const F = await loadTs('../src/modules/scenarioMods/fixedEndingNarratives.ts');
const W = await loadTs('../src/modules/scenarioMods/whiteTailLeopard.ts');
const RC = await loadTs('../src/modules/sceneModule/contracts/randomContract.ts');
const host = await loadTs('../src/modules/sceneModule/host/controller.ts');
const ext = await loadTs('../src/modules/sceneModule/host/ext.ts');
const assist = await loadTs('../src/modules/sceneModule/assist.ts');
const { CONTENT_PACKS } = await loadTs('../src/modules/contentPacks/index.ts');
const { namedEntity } = await loadTs('../src/modules/scenarioMods/namedEntities.ts');
const { catalogItem } = await loadTs('../src/modules/scenarioMods/entityCatalog.ts');
const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
const init = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');

const rt = s => s.世界.状态.剧本模组;
const ENC = N.GAME_NUMBERS.encounter;
const NH = ENC.regions.nanhuang;
const stageJson = async id => JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`, import.meta.url), 'utf8'));
let opened;
async function open05b() {
  if (!opened) {
    opened = advanceScenarioRuntime(init.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), init.buildStrictScenarioInitialization(await stageJson('lcq.stage_05b')))).saveData;
    opened.元数据.创建时间 = '2026-11-01T01:00:00.000Z'; // 固定种子
  }
  return structuredClone(opened);
}
const placeName = id => namedEntity('location', id)?.name || id;
function moveTo(s, key, sub) {
  s.角色.位置 = { ...s.角色.位置, locationId: key, 描述: ['南荒', placeName(key), ...(sub ? [sub] : [])].join('·') };
}
/** 打开区与敌人的剧情窗口：after 记完成，until 从完成表与行旅账里拿掉。 */
function openWindows(s, ...windows) {
  const r = rt(s), until = new Set(windows.flatMap(w => w?.untilEventIds || []));
  r.completedEventIds = [...new Set([...(r.completedEventIds || []), ...windows.flatMap(w => w?.afterEventIds || [])])].filter(id => !until.has(id));
  if (r.travelLedger?.doneEventIds) r.travelLedger.doneEventIds = r.travelLedger.doneEventIds.filter(id => !until.has(id));
}
function forced(zones, pool) {
  const c = structuredClone(ENC);
  for (const t of Object.keys(c.tiers)) if (t !== 'safe') c.tiers[t] = { chance: 1, cooldownTurns: 0 };
  c.regions.nanhuang.zones = zones; c.regions.nanhuang.pool = pool; c.regions.nanhuang.skipDuringEventIds = [];
  return c;
}
const tick = (s, c) => E.tickRandomEncounter(s, { narrated: true, config: c });
const next = (s, c) => { rt(s).worldTurn++; return tick(s, c); };
function toBattle(s, c) { tick(s, c); for (let i = 0; i < 3; i++) next(s, c); return E.pendingRandomBattle(s); }
function enable() { globalThis.location = { search: '?sceneModule=on', hostname: 'localhost', href: 'http://localhost/?sceneModule=on' }; }
function harness(save) { let current = save; return { get save() { return current; }, deps: { persist: async s => { current = structuredClone(s); } } }; }
async function fight(h) {
  await host.submitSceneInput(h.save, '我挥刀攻击对手', h.deps);
  assert.ok(ext.activeScene(h.save), '进入战斗界面（场面已开）');
  const a = ext.activeScene(h.save); a.state.forced = { action: Array(200).fill(20), defense: Array(400).fill(20) };
  for (let n = 0; n < 40 && ext.activeScene(h.save); n++) {
    if (!ext.activeScene(h.save).pending) await host.submitSceneInput(h.save, '我挥刀攻击对手', h.deps);
    await host.confirmSceneAction(h.save, h.deps);
  }
  assert.equal(ext.activeScene(h.save), null, '场面收束');
}
const companionEvent = (s, ids) => { const r = rt(s); r.events.push({ id: 'test.companions', relatedCharacterIds: ids }); r.activeEventIds = [...(r.activeEventIds || []), 'test.companions']; };

// ───────────── ① AIBS ─────────────
test('①a 冻结文件只改两处并已重新上锁：runtime.ts 不动，AIBS 哈希与基线一致', () => {
  const base = json('tests/frozen-baseline.json');
  for (const f of ['src/utils/AIBidirectionalSystem.ts', 'src/modules/scenarioMods/runtime.ts'])
    assert.equal(createHash('sha256').update(readFileSync(new URL('../' + f, import.meta.url))).digest('hex'), base.files[f], f);
  assert.equal(base.files['src/modules/scenarioMods/runtime.ts'], 'dc8f55186f7d4f73b89adb1efbebd6609988de51ac798bbaba3f221ff3aba67a');
});

test('①a 普通叙事回合搜刮：先本地预结算出回执正文（不请求模型），落账按回执入包；清单未配置照旧交模型', () => {
  const ai = read('src/utils/AIBidirectionalSystem.ts');
  assert.match(ai, /const lootPreviewSave = !options\?\.eventAction && isLocationLootInput/);
  assert.match(ai, /const lootLocalText = lootLocal && lootLocal\.status !== 'pending' \? lootLocal\.text : '';/);
  assert.match(ai, /const legacyNarrativePilotResponse = lootLocalText \? null : await this\.tryLegacyNarrativePilot\(/);
  assert.match(ai, /const localContractText = lootLocalText \|\| repeatSilkPouchText/);
  assert.match(ai, /\.\.\.\(lootLocalText \? \{ localLoot: true \} : \{\}\)/);
  assert.match(ai, /if \(\(response\.moduleReceipt \|\| response\.localLoot\) && !response\.generationError && !options\?\.eventAction && isLocationLootInput/);
});

test('①a 预结算与落账同种子同结果：回执正文列的就是入包的东西；回刷与稀有只给一次照现有规则', async () => {
  const s = await open05b();
  assert.equal(L.isLocationLootInput('搜刮一下'), true);
  const preview = L.settleLocationLoot(structuredClone(s));
  assert.equal(preview.status, 'settled');
  const real = L.settleLocationLoot(s);
  assert.deepEqual(real.receipt.drops, preview.receipt.drops);
  assert.equal(real.text, preview.text);
  for (const d of real.receipt.drops.filter(d => d.itemId)) assert.ok(Number(s.角色.背包.物品[d.itemId]?.数量) >= d.quantity, d.itemId);
  assert.deepEqual(N.GAME_NUMBERS.loot.respawn.categories.sort(), ['common', 'smallCurrency'].sort(), '回刷只出普通物与小钱');
});

test('①b 解析器：JSON 里没给正文时保住 JSON 外的叙事（闭关、打字跨国偶发「AI响应为空」）', async () => {
  const outside = '你盘膝坐定，一夜调息，气息渐稳。';
  assert.equal(J.narrativeOutsideJson(`${outside}\n\`\`\`json\n{"tavern_commands":[{"action":"set","key":"a","value":1}]}\n\`\`\``), outside);
  assert.equal(J.narrativeOutsideJson(`${outside}\n{"action_options":["继续"]}\n船行三日。`), `${outside}\n\n船行三日。`);
  assert.equal(J.narrativeOutsideJson('{"text":"x"}'), '');
  assert.equal(J.narrativeOutsideJson('<thinking>想</thinking>{"a":1}'), '');
  // 真跑 AIBS 的 parseAIResponse 方法体（截取转译，只注入边界）。
  const ts = (await import('typescript')).default;
  const src = read('src/utils/AIBidirectionalSystem.ts');
  const method = src.slice(src.indexOf('  private parseAIResponse('), src.indexOf('\n}\n\nexport const AIBidirectionalSystem')).replace('private parseAIResponse', 'parseAIResponse');
  const helper = src.slice(src.indexOf('function itemReferencesFromObject('), src.indexOf('/** 仅模型截断/格式失败可用本地合同收口'));
  const code = ts.transpileModule(`${helper}\nclass H { sanitizeActionOptionsForDisplay(o: any) { return o; }\n${method}\n}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const H = new Function('stripModelThinking', 'parseJsonSmart', 'narrativeOutsideJson', `${code};return H;`)(J.stripModelThinking, J.parseJsonSmart, J.narrativeOutsideJson);
  const log = console.log; console.log = () => {};
  try {
    const h = new H();
    const r = h.parseAIResponse(`${outside}\n\`\`\`json\n{"tavern_commands":[{"action":"set","key":"角色.位置.描述","value":"晋·江州"}],"action_options":["进城"]}\n\`\`\``);
    assert.equal(r.text, outside);
    assert.equal(r.tavern_commands.length, 1);
    assert.equal(h.parseAIResponse('{"text":"JSON 里的正文","tavern_commands":[]}').text, 'JSON 里的正文', 'JSON 有正文时仍以 JSON 为准');
    assert.equal(h.parseAIResponse('前面一句。{"text":"正文"}').text, '正文');
  } finally { console.log = log; }
  assert.match(src, /if \(!parsed\.text\.trim\(\)\) parsed\.text = narrativeOutsideJson\(rawText\);/);
});

// ───────────── ② 草原 ─────────────
test('② 草原不显示、不能点；地点数据保留', () => {
  assert.deepEqual(N.GAME_NUMBERS.ui.worldMap.hiddenLocationIds, ['lcq.location.grassland']);
  assert.equal(M.isMapHiddenLocation('lcq.location.grassland'), true);
  assert.equal(M.isMapHiddenLocation('liuchao.location.wuyuan'), false);
  assert.deepEqual(M.withoutMapHiddenLocations([{ id: 'lcq.location.grassland' }, { id: 'liuchao.location.wuyuan' }]).map(p => p.id), ['liuchao.location.wuyuan']);
  assert.equal(M.mapTravelRestriction({ 角色: { 位置: { locationId: 'liuchao.location.wuyuan' } } }, 'lcq.location.grassland'), '此地不在地图上。');
  assert.equal(M.selectMapTravel({ 角色: { 位置: { locationId: 'liuchao.location.wuyuan' } } }, 'lcq.location.grassland'), undefined);
  const panel = read('src/components/dashboard/GameMapPanel.vue');
  assert.match(panel, /const locations = withoutMapHiddenLocations\(scenarioMapLocked\.value/);
  assert.match(panel, /if \(isMapHiddenLocation\(\(locationData\.location \|\| locationData\)\?\.id\)\) return;/);
  assert.ok(json('mod-kit/entity-catalog/locations.json').entries.some(e => e.id === 'lcq.location.grassland'));
  assert.ok(json('src/modules/scenarioMods/builtins/data/lcq.stage_01.json').canon.locations.some(l => l.id === 'lcq.location.grassland'));
});

// ───────────── ③ 序幕四年 ─────────────
test('③ 跳年挂在 s02_04 之后；跳年当回合正文后接过渡叙述，只接一次；旧档已在 s01_06 跳过不再跳也不接', async () => {
  const event = CONTENT_PACKS.overlays.find(o => o.stageId === 'lcq.stage_02').events.find(e => e.id === 'lcq.event.s02_04');
  const action = event.playerCompletionContract.actions[0];
  assert.deepEqual({ ...action.timeAdvance }, { kind: 'calendarYears', years: N.GAME_NUMBERS.story.actionTime.prologueYears, supersedes: ['lcq.event.s01_06::advance_declared_objective'], interludeTextKey: 'qingyu.prologue.fourYears' });
  assert.equal(N.GAME_NUMBERS.story.actionTime.prologueYears, 4);
  const builtin = (await stageJson('lcq.stage_02')).scenario.events.find(e => e.id === 'lcq.event.s02_04');
  const { timeAdvance, ...rest } = action;
  assert.deepEqual({ ...event, playerCompletionContract: { ...event.playerCompletionContract, actions: [rest] } }, builtin, '除 timeAdvance 外与内置 s02_04 逐字相同');
  const s01 = (await stageJson('lcq.stage_01')).scenario.events.find(e => e.id === 'lcq.event.s01_06');
  assert.equal(s01.playerCompletionContract.actions.some(a => a.timeAdvance), false);
  const text = CONTENT_PACKS.texts['qingyu.prologue.fourYears'];
  assert.match(text, /^肩上的奴印结了痂/); assert.match(text, /数到第四个冬天，就不再数了。/); assert.match(text, /推进石屋底下的地牢。$/);
  assert.doesNotMatch(text, /【|】|lcq:/);
  const s = { 元数据: { 时间: { 年: 220, 月: 3, 日: 1, 小时: 9, 分钟: 0 } }, 系统: { 扩展: {}, 历史: { 叙事: [{ type: 'gm', content: '【220年】你被烙上奴印。' }] } }, 社交: { 记忆: { 短期记忆: ['【220年】你被烙上奴印。'] } }, 世界: { 状态: { 剧本模组: { modId: 'lcq.stage_02', events: [event], completedEventIds: [] } } } };
  F.applyStepSceneLedger(s, rt(s), event.id, action.id);
  assert.equal(s.元数据.时间.年, 224);
  assert.equal(F.flushTimeSkipInterlude(s), text);
  assert.equal(s.系统.历史.叙事[0].content, `【220年】你被烙上奴印。\n\n${text}`);
  assert.equal(s.社交.记忆.短期记忆[0], `【220年】你被烙上奴印。\n\n${text}`);
  assert.equal(F.flushTimeSkipInterlude(s), '');
  assert.match(read('src/components/dashboard/MainGamePanel.vue'), /const interlude = flushTimeSkipInterlude\(s\);/);
});

// ───────────── ④ 南荒敌池 ─────────────
test('④ 配置：只收无名杂兵、精英不进池、一打一；新敌人与毒蝠翼膜已建档；初值都注明', () => {
  assert.equal(ENC.maxCount, 1);
  assert.deepEqual(E.validateEncounterConfig(ENC), []);
  for (const e of NH.pool) {
    assert.equal(namedEntity('enemy', e.enemyId)?.unnamed, true, e.enemyId);
    assert.notEqual(e.variant, 'elite', e.enemyId);
    assert.deepEqual(e.count, [1, 1], e.enemyId);
  }
  assert.equal(NH.pool.length, 10);
  for (const id of ['lcq.enemy.yin_spider', 'lcq.enemy.ghostface_wasp', 'lcq.enemy.venom_bat', 'lcq.enemy.swamp_crocodile', 'lcq.enemy.wild_boar', 'lcq.enemy.nh_venom_snake'])
    assert.ok(json('mod-kit/entity-catalog/index.json').entries.some(r => r.kind === 'enemy' && r.id === id), id);
  assert.equal(catalogItem('lcq.item.nh_venom_bat_wing')?.name, '毒蝠翼膜');
  assert.match(ENC.drops['lcq.enemy.ghostface_wasp'] && namedEntity('enemy', 'lcq.enemy.ghostface_wasp').description, /一群算一个敌人/);
  for (const [id, d] of Object.entries(ENC.drops)) if (id !== 'note') for (const item of [...d.common, ...d.rareOnce]) assert.ok(catalogItem(item), item);
  assert.ok(!Object.entries(ENC.drops).some(([k, d]) => k !== 'note' && JSON.stringify(d).includes('crow_bamboo_tube')), 'F04 关键物竹筒不进随机掉落');
  assert.match(ENC.drops.note, /初值/);
  for (const e of NH.pool.filter(e => !['lcq.enemy.guiwang_warrior', 'lcq.enemy.merfolk'].includes(e.enemyId))) assert.match(e.source, /初值/, e.enemyId);
  for (const z of NH.zones.slice(6)) assert.match(z.source, /初值/, z.key);
});

test('④ 村寨里不检遇敌；花苗寨一带（子地点林野山溪藤寨外）和密林检；按国别跨关也算南荒', async () => {
  const s = await open05b();
  for (const id of NH.noCheckLocationIds) { moveTo(s, id); assert.equal(E.encounterGate(s), 'village', id); }
  moveTo(s, 'lcq.location.huamiao_village', '密林'); assert.equal(E.encounterGate(s), null);
  moveTo(s, 'lcq.location.huamiao_village', '苏荔竹楼'); assert.equal(E.encounterGate(s), 'village');
  moveTo(s, 'lcq.location.giant_vine'); assert.equal(E.encounterGate(s), null);
  rt(s).modId = 'lcq.stage_02'; assert.equal(E.encounterGate(s), null, '五原关跨国落到南荒地点也检');
  moveTo(s, 'liuchao.location.wuyuan'); assert.equal(E.encounterGate(s), 'no_region');
  // 人进了寨子：未开战的待定撤掉。
  const t = await open05b(), c = forced(NH.zones, NH.pool);
  moveTo(t, 'lcq.location.giant_vine'); tick(t, c); assert.equal(rt(t).encounter.pending.stage, 'foreshadow');
  moveTo(t, 'lcq.location.huamiao_village'); next(t, c); assert.equal(rt(t).encounter.pending, null);
});

test('④ 鸦人/鲛人/尸鬼分别等 F04/F06/F12 触发后才进池', async () => {
  const gates = { 'lcq.enemy.crow_man': 'lcq.event.s04b_lingfei_baiyi_crisis_03', 'lcq.enemy.merfolk': 'lcq.event.haishen_hall_merfolk', 'lcq.enemy.altar_corpse': 'lcq.event.s05b_08b_altar_corpse_fight_and_danchen' };
  const hooks = { 'lcq.enemy.crow_man': 'src/modules/sceneModule/contracts/f04.json', 'lcq.enemy.merfolk': 'src/modules/contentPacks/packs/qingyu/f06.json', 'lcq.enemy.altar_corpse': 'src/modules/contentPacks/packs/qingyu/f12.json' };
  for (const [enemyId, eventId] of Object.entries(gates)) {
    assert.equal(json(hooks[enemyId]).meta.hook.eventId, eventId, enemyId);
    const entry = NH.pool.find(e => e.enemyId === enemyId);
    assert.ok(entry.activeWhen.afterEventIds.includes(eventId), enemyId);
    const key = entry.zones[0], zone = NH.zones.find(z => z.key === key);
    for (const done of [false, true]) {
      const s = await open05b(); moveTo(s, key);
      openWindows(s, zone.activeWhen, { ...entry.activeWhen, afterEventIds: [] });
      const r = rt(s); r.completedEventIds = r.completedEventIds.filter(id => id !== eventId);
      if (r.travelLedger?.doneEventIds) r.travelLedger.doneEventIds = r.travelLedger.doneEventIds.filter(id => id !== eventId);
      if (done) r.completedEventIds.push(eventId);
      const c = forced([zone], [entry]);
      tick(s, c); next(s, c); next(s, c);
      const hits = (r.encounter?.receipts || []).filter(x => x.enemyId === enemyId);
      if (done) assert.equal(hits.length, 1, `${enemyId} 触发后进池`);
      else assert.equal(hits.length, 0, `${enemyId} 未触发不进池`);
    }
  }
});

test('④ 遍历：南荒每个危险区 × 每种可遇敌人，触发遇敌 → 进入战斗界面 → 结算；赢后搜尸走敌人掉落、不占搜刮次数', async () => {
  enable();
  let fights = 0;
  for (const zone of NH.zones) {
    for (const entry of NH.pool.filter(e => e.zones.includes(zone.key))) {
      const s = await open05b();
      moveTo(s, zone.key, zone.subPlace ? '密林' : undefined);
      openWindows(s, zone.activeWhen, entry.activeWhen);
      const c = forced([zone], [entry]);
      const p = toBattle(s, c);
      assert.ok(p, `${zone.key} ${entry.enemyId} 待开战`);
      assert.equal(p.enemyId, entry.enemyId); assert.equal(p.count, 1);
      assert.equal(host.hostNeeded(s), true);
      const candidate = host.sceneCandidate(s);
      assert.ok(RC.isRandomContract(candidate.contract), `${zone.key} ${entry.enemyId} 随机合同`);
      assert.equal(candidate.contract.parties.filter(x => x.side === 'opposed').length, 1, '一打一');
      const searches = structuredClone(rt(s).locationLoot?.searches || {});
      const h = harness(s);
      await fight(h);
      const after = h.save;
      assert.equal(ext.readExt(after).history.at(-1).outcome, 'win', `${zone.key} ${entry.enemyId}`);
      assert.equal(rt(after).encounter.receipts.find(r => r.id === p.id).outcome, 'win');
      const token = rt(after).locationLoot.spoils?.[p.locKey];
      assert.equal(token?.enemyId, entry.enemyId, `${zone.key} ${entry.enemyId} 战后搜尸凭据 ${JSON.stringify(rt(after).locationLoot)} 现处 ${E.encounterLocKey(after)}`);
      // 测试为开窗口直接记完成的剧情事件，收场推进时行旅账可能把人挪到下一站；搜尸身要在原地。
      if (E.encounterLocKey(after) !== p.locKey) moveTo(after, p.locKey, zone.subPlace ? '密林' : undefined);
      rt(after).worldTurn++;
      const loot = L.settleLocationLoot(after);
      assert.equal(loot.status, 'settled', `${zone.key} ${entry.enemyId} 搜尸`);
      assert.equal(loot.receipt.kind, 'spoils');
      const table = ENC.drops[entry.enemyId];
      assert.ok(loot.receipt.drops.length >= 1);
      for (const d of loot.receipt.drops) assert.ok([...table.common, ...table.rareOnce].includes(d.itemId), d.itemId);
      for (const d of loot.receipt.drops) assert.ok(after.角色.背包.物品[d.itemId], `${d.itemId} 入包`);
      assert.deepEqual(rt(after).locationLoot.searches || {}, searches, '不占搜刮次数');
      fights++;
    }
  }
  assert.ok(fights >= 20, `遍历了 ${fights} 场`);
});

test('④ 同一稀有物：敌人掉落与地点搜刮合起来全局只给一次（两个方向）', async () => {
  const HORN = 'lcq.item.nh_ghost_horn_shard', SHAN = 'liuchao.location.shan_jian';
  const withHorn = s => { const r = rt(s); if (!r.canon.items.some(i => i.id === HORN)) r.canon.items.push({ ...catalogItem(HORN), id: HORN }); };
  const onlyRare = { ...L.QINGYU_LOOT_TABLE, rules: { ...L.QINGYU_LOOT_TABLE.rules, commonSlots: [] , largeCurrencyChance: 0 },
    locations: { [SHAN]: { ...L.QINGYU_LOOT_TABLE.locations[SHAN], rareChance: 1 } } };
  const drops = ENC.drops['lcq.enemy.guiwang_warrior'], keep = drops.rareChance;
  drops.rareChance = 1;
  try {
    // 先掉落后搜刮。
    const a = await open05b(); moveTo(a, SHAN); openWindows(a, { afterEventIds: ['lcq.event.s04_02'] }); withHorn(a);
    assert.equal(L.grantLootSpoils(a, { locationId: SHAN, sourceId: 'encounter:t1', enemyId: 'lcq.enemy.guiwang_warrior' }), true);
    const spoils = L.settleLocationLoot(a);
    assert.ok(spoils.receipt.drops.some(d => d.itemId === HORN), '掉落给了鬼角残片');
    rt(a).worldTurn++;
    const search = L.settleLocationLoot(a, onlyRare);
    assert.equal(search.receipt.kind, 'search');
    assert.ok(!search.receipt.drops.some(d => d.itemId === HORN), '搜刮不再给');
    // 先搜刮后掉落。
    const b = await open05b(); moveTo(b, SHAN); openWindows(b, { afterEventIds: ['lcq.event.s04_02'] }); withHorn(b);
    const first = L.settleLocationLoot(b, onlyRare);
    assert.ok(first.receipt.drops.some(d => d.itemId === HORN), '搜刮给了鬼角残片');
    rt(b).worldTurn++;
    L.grantLootSpoils(b, { locationId: SHAN, sourceId: 'encounter:t2', enemyId: 'lcq.enemy.guiwang_warrior' });
    const later = L.settleLocationLoot(b);
    assert.equal(later.receipt.kind, 'spoils');
    assert.ok(!later.receipt.drops.some(d => d.itemId === HORN), '掉落不再给');
    assert.equal(b.角色.背包.物品[HORN].数量, 1);
  } finally { drops.rareChance = keep; }
});

test('④ 同伴不下场、只给 buff：遇敌时在场的助战同伴作为助战者入场，敌人不点名他们', async () => {
  const s = await open05b(); moveTo(s, 'lcq.location.giant_vine');
  companionEvent(s, ['liuchao.character.su_li', 'liuchao.character.a_xi', 'lcq.character.nanhuang_shiweimo']);
  const entry = NH.pool.find(e => e.enemyId === 'lcq.enemy.wild_boar');
  const p = toBattle(s, forced([NH.zones.find(z => z.key === 'lcq.location.giant_vine')], [entry]));
  const byActor = N.GAME_NUMBERS.assist.byActor;
  assert.ok(p.companions.includes('liuchao.character.su_li') && p.companions.includes('liuchao.character.a_xi'));
  assert.ok(!p.companions.includes('lcq.character.nanhuang_shiweimo'), '只取 assist 配置里有的同伴');
  assert.ok(p.companions.every(id => id in byActor));
  const c = host.sceneCandidate(s).contract;
  const allies = c.parties.filter(x => x.side === 'player_side' && !x.player);
  assert.deepEqual(allies.map(a => a.ref), p.companions);
  assert.ok(allies.every(a => assist.partyRole(a) === 'assist'));
  assert.ok(c.enemyActions.every(a => a.target === 'player'));
  assert.equal(c.parties.filter(x => x.side === 'opposed').length, 1);
  const state = (await loadTs('../src/modules/sceneModule/index.ts')).beginScene(c).state;
  assert.ok(assist.activeAssists(c, state).length >= 1, '助战 buff 生效');
  assert.equal(RC.instantiateRandomContract(RC.randomContractId({ id: 'x', enemyId: 'lcq.enemy.wild_boar', count: 1, level: 2 })).parties.length, 2, '没有同伴时不变');
});

// ───────────── ⑤ 白尾豹 ─────────────
test('⑤ 白尾豹：配置齐全；密林里触发不攻击、回复体力（气血）、挂「山神庇佑」若干回合后摘除；寨内不触发', async () => {
  const cfg = W.leopardConfig();
  assert.equal(cfg.hostile, false);
  assert.ok(cfg.chance > 0 && cfg.chance < 0.1, '小概率');
  assert.deepEqual(cfg.locations.map(l => l.key), ['lcq.location.huamiao_village', 'lcq.location.giant_vine', 'liuchao.location.shan_jian', 'lcq.location.turtle_road_ruins']);
  assert.equal(cfg.buff.name, '山神庇佑');
  const def = CONTENT_PACKS.statuses.find(d => d.id === cfg.buff.statusId);
  assert.equal(def.label, '山神庇佑'); assert.equal(def.kind, 'buff');
  assert.match(cfg.note, /初值/); assert.match(def.source, /初值/);
  const always = { ...cfg, chance: 1 };
  const village = await open05b(); moveTo(village, 'lcq.location.huamiao_village');
  assert.equal(W.tickWhiteTailLeopard(village, always).text, '');
  const s = await open05b(); moveTo(s, 'lcq.location.giant_vine');
  s.角色.属性.气血 = { 当前: 10, 上限: 100 };
  s.系统.历史.叙事.push({ type: 'gm', content: '林子越走越密。' });
  const before = structuredClone(rt(s).encounter);
  const r = W.tickWhiteTailLeopard(s, always);
  assert.equal(r.text, CONTENT_PACKS.texts[cfg.textKey]);
  assert.equal(s.角色.属性.气血.当前, 10 + Math.round(100 * cfg.staminaRestoreRatio));
  assert.deepEqual(rt(s).encounter, before, '不攻击：不建遇敌、不开战');
  assert.equal(ext.activeScene(s), null);
  assert.ok(s.角色.效果.some(e => e.状态名称 === '山神庇佑'));
  assert.match(s.系统.历史.叙事.at(-1).content, /林子越走越密。\n\n密林深处忽然静了下来/);
  const turn = rt(s).worldTurn;
  for (let i = 1; i < cfg.buff.durationTurns; i++) { rt(s).worldTurn = turn + i; W.tickWhiteTailLeopard(s, always); assert.ok(s.角色.效果.some(e => e.状态名称 === '山神庇佑'), `第 ${i} 回合仍在`); }
  rt(s).worldTurn = turn + cfg.buff.durationTurns; W.tickWhiteTailLeopard(s, { ...always, chance: 0 });
  assert.ok(!s.角色.效果.some(e => e.状态名称 === '山神庇佑'), '到期摘除');
  const rows = Object.values(rt(s).sceneLedger.statusRecords.actors).flat();
  assert.ok(!rows.some(row => row.sourceScene === W.BUFF_SOURCE));
  assert.equal(rt(s).flags['scene.status.buff.shanshen_blessing.expired'], true, '到期写上目录登记的解除旗标');
  rt(s).worldTurn++; W.tickWhiteTailLeopard(s, always);
  assert.ok(s.角色.效果.some(e => e.状态名称 === '山神庇佑'), '再次遇见重新挂上');
  assert.equal(rt(s).flags['scene.status.buff.shanshen_blessing.expired'], undefined);
  assert.match(read('src/components/dashboard/MainGamePanel.vue'), /const leopard = tickWhiteTailLeopard\(s\);/);
});

test('⑤ 南荒本地同伴开口：苏荔 → 阿夕 → 诗薇莫，一人一句；无本地同伴只用描写；台词在内容配置', async () => {
  const cfg = { ...W.leopardConfig(), chance: 1 };
  assert.deepEqual(cfg.companionLines.map(l => l.characterId), ['liuchao.character.su_li', 'liuchao.character.a_xi', 'lcq.character.nanhuang_shiweimo']);
  for (const l of cfg.companionLines) assert.equal(typeof CONTENT_PACKS.texts[l.textKey], 'string', l.textKey);
  const cases = [[['liuchao.character.a_xi', 'liuchao.character.su_li'], 'su_li'], [['lcq.character.nanhuang_shiweimo', 'liuchao.character.a_xi'], 'a_xi'], [['lcq.character.nanhuang_shiweimo'], 'shiweimo'], [['liuchao.character.le_mingzhu'], null]];
  for (const [ids, who] of cases) {
    const s = await open05b(); moveTo(s, 'liuchao.location.shan_jian'); companionEvent(s, ids);
    const r = W.tickWhiteTailLeopard(s, cfg);
    const expected = [CONTENT_PACKS.texts[cfg.textKey], who && CONTENT_PACKS.texts[`nanhuang.leopard.line.${who}`]].filter(Boolean).join('\n\n');
    assert.equal(r.text, expected, ids.join(','));
  }
});

test('⑤ 山神庇佑带进随机战：场面里主角身上有这条增益（rollModifier 生效）', async () => {
  enable();
  const s = await open05b(); moveTo(s, 'lcq.location.giant_vine');
  W.tickWhiteTailLeopard(s, { ...W.leopardConfig(), chance: 1 });
  const entry = NH.pool.find(e => e.enemyId === 'lcq.enemy.nh_venom_snake');
  toBattle(s, forced([NH.zones.find(z => z.key === 'lcq.location.giant_vine')], [entry]));
  const h = harness(s);
  await host.submitSceneInput(h.save, '我挥刀攻击对手', h.deps);
  const a = ext.activeScene(h.save);
  assert.ok(a.state.statuses.pc?.some(x => x.id === 'buff.shanshen_blessing'));
  const { statusRollModifierParts } = await loadTs('../src/modules/sceneModule/statuses.ts');
  const { sceneContractById } = await loadTs('../src/modules/sceneModule/contracts/registry.ts');
  const c = sceneContractById(a.contractId), def = CONTENT_PACKS.statuses.find(d => d.id === 'buff.shanshen_blessing');
  for (const scope of ['action', 'defense']) {
    const want = def.effects.filter(e => e.kind === 'rollModifier' && e.scope === scope).reduce((n, e) => n + e.value, 0);
    assert.deepEqual(statusRollModifierParts(a.state, c, undefined, 'pc', scope).filter(x => x.label === '山神庇佑'), [{ label: '山神庇佑', value: want }], scope);
  }
});
