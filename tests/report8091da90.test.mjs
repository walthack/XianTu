// REPORT-8091-da90cb13 复测四项：
// P1-1 CP03 点名取「发青光的硬物」——那件是原著龙精（lyg.item.np091），已裁定不归玩家、不进搜刮池；点名取物机制：池里有的只给那一件，池里没有的回执写明没取到。
// P2-1 战斗叙事夹英文 defense——简报不再送英文键；场面描写过正文清洗。
// P2-2 地图入秦：口信拍章名不再落在「抵达长安灞桥」；抵达提示写明秦·咸阳；到咸阳有主线行动。
// P2-3 审核拦截（LCQ-NET-012）：主叙事回合不会本地兜底（判定在冻结的 AIBS 里），文案改成如实「没有推进」。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadTs } from './loadTs.mjs';
import { mod as scene, makeContract, begin } from './sceneModuleFixture.mjs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const json = p => JSON.parse(read(p));
const rt = s => s.世界.状态.剧本模组;
const L = await loadTs('../src/modules/scenarioMods/locationLoot.ts');
const { GAME_NUMBERS } = await loadTs('../src/modules/sceneModule/numbers.ts');
const cp03 = () => json('tests/fixtures/playtest-5e8f/cp03-dragon-corpse.json').saves[0].存档数据;

// 冻结 AIBS 的原链路搜刮两段按原样切出执行（与 report8091regress 同法），确认不改 AIBS 也能把原句带到搜刮结算。
const ai = read('src/utils/AIBidirectionalSystem.ts');
const ts = (await import('typescript')).default;
function block(from, to, args, tail = '') {
  const start = ai.indexOf(from); assert.ok(start > 0);
  return new Function(...args, ts.transpileModule(ai.slice(start, ai.indexOf(to, start)) + tail, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText);
}
const preLoot = block('      const lootLocal = ', '      const legacyNarrativePilotResponse', ['saveData', 'options', 'userMessage', 'cloneDeep', 'isLocationLootInput', 'settleLocationLoot'], '\nreturn lootLocalText;');
const commitLoot = block('    if ((response.moduleReceipt || response.localLoot)', '    const openWorldProgress', ['saveData', 'options', 'response', 'changes', 'isLocationLootInput', 'settleLocationLoot']);
function legacyLootTurn(s, input) {
  const options = { playerIntentText: input, judgementResolution: { status: 'resolved', outcome: 'failure', kind: 'explore' } };
  const before = structuredClone(s);
  const text = preLoot(s, options, input, structuredClone, L.isLocationLootInput, L.settleLocationLoot);
  assert.deepEqual(s, before, '预结算零副作用');
  assert.ok(text, `${input}：本地搜刮，不落到叙事模型`);
  commitLoot(s, options, { text, localLoot: true }, [], L.isLocationLootInput, L.settleLocationLoot);
  return text;
}

test('P1-1 发青光的硬物＝原著龙精：已裁定不归玩家、不进鬼王峒搜刮池', () => {
  const ch116 = read('src/modules/contentPacks/packs/qingyu/texts.json');
  assert.match(ch116, /带着碧青的光，带着龙脑里凝了十几年的东西/, '龙颅里发青光的是龙精');
  const item = json('mod-kit/entity-catalog/items.json').entries.find(e => e.id === 'lyg.item.np091');
  assert.equal(item.definition.name, '龙精');
  assert.match(read('mod-kit/source-documents/31-南荒全部固定战斗合同草案.md'), /龙精不归玩家（116·82）/);
  const table = json('mod-kit/location-loot.qingyu.json');
  for (const loc of ['liuchao.location.gui_wang_dong', 'liuchao.location.gui_wang_gong', 'liuchao.location.gui_wang_gong.jingshen_tai']) {
    assert.ok(table.locations[loc].entries.every(e => e.itemId !== 'lyg.item.np091'), `${loc} 不含龙精`);
  }
});

test('P1-1 CP03「取出发青光的硬物收进背包」：回显点名没取到这件，龙精不入包；照常搜刮且回执与背包一致、重放不双发', () => {
  const s = cp03();
  assert.equal(Object.keys(s.角色.背包.物品).length, 23);
  const input = '取出发青光的硬物收进背包';
  assert.deepEqual(L.namedLootTarget(input), { name: '发青光的硬物', withSearch: false });
  const before = structuredClone(s.角色.背包.物品);
  const text = legacyLootTurn(s, input);
  const receipt = rt(s).locationLoot.receipts.at(-1);
  assert.equal(receipt.missingName, '发青光的硬物');
  assert.ok(text.startsWith(GAME_NUMBERS.loot.texts.namedMissing.replace('{name}', '发青光的硬物')), text);
  assert.equal(s.角色.背包.物品['lyg.item.np091'], undefined, '龙精不入包');
  for (const d of receipt.drops.filter(d => d.itemId)) {
    assert.equal(s.角色.背包.物品[d.itemId].数量, (before[d.itemId]?.数量 || 0) + d.quantity);
    assert.ok(text.includes(d.name));
  }
  const once = structuredClone(s);
  assert.equal(legacyLootTurn(s, input), text, '同拍重放同一回执');
  assert.deepEqual(s, once);
});

test('P1-1 点名池里有的东西：只入这一件（背包 +1），回显写出它的名字；同句另有搜刮分句才再照常掷', () => {
  const s = cp03();
  const text = legacyLootTurn(s, '剥下龙鳞收进背包');
  const receipt = rt(s).locationLoot.receipts.at(-1);
  assert.deepEqual(receipt.drops.map(d => d.itemId), ['lcq.item.nh_dragon_scale']);
  assert.equal(receipt.missingName, undefined);
  assert.equal(Object.keys(s.角色.背包.物品).length, 24, '背包 23→24');
  assert.match(text, /龙鳞×\d/);
  // 同句带「搜查尸身」：点名的那件必在，其余照常搜刮。
  const t = cp03();
  legacyLootTurn(t, '我回到龙神尸身旁，搜查尸身，割下龙筋收进背包');
  const drops = rt(t).locationLoot.receipts.at(-1).drops.map(d => d.itemId);
  assert.ok(drops.includes('lcq.item.nh_dragon_sinew'), JSON.stringify(drops));
  assert.ok(drops.length > 1, '搜查尸身照常掷池');
});

test('P1-1 泛称不算点名；点名解析不改变搜刮句判定，原句只借给紧随的一次结算', () => {
  for (const t of ['取出那块硬物收进背包', '取出龙颅里那块硬物收进背包', '搜刮龙神的尸身']) assert.equal(L.namedLootTarget(t), undefined, t);
  assert.equal(L.namedLootTarget('撬下断角连同龙鳞收进背包').name, '断角连同龙鳞');
  // 判定后被结算读走，下一次不带原句的结算不再沿用。
  const s = cp03();
  assert.equal(L.isLocationLootInput('取出发青光的硬物收进背包'), true);
  assert.equal(L.settleLocationLoot(structuredClone(s)).receipt.missingName, '发青光的硬物');
  assert.equal(L.settleLocationLoot(structuredClone(s)).receipt.missingName, undefined);
  // 不是搜刮句时不留原句。
  assert.equal(L.isLocationLootInput('取出怀里的玉佩收进背包'), false);
  assert.equal(L.settleLocationLoot(structuredClone(s)).receipt.missingName, undefined);
});

test('P2-1 简报不把英文键送给描写模型：态势挂方写中文，可用要素只写中文动词', () => {
  const contract = makeContract();
  contract.elements[0].verbs[0].aliases = ['劈砍'];
  const { state } = begin(contract, {});
  state.tags.push({ id: 'pin', label: '牵制', on: 'opposed', expiresBeat: null, effect: { enemyDcBonus: 1 }, sourceId: 'assist:x' });
  state.tags.push({ id: 'cover', label: '受掩护', on: 'player_side', expiresBeat: null, effect: { defenseBonus: 1 }, sourceId: 'x' });
  const text = scene.buildSceneBrief(contract, state).text;
  assert.match(text, /牵制@敌方/);
  assert.match(text, /受掩护@我方/);
  assert.doesNotMatch(text, /@(?:opposed|player_side|scene)\b/);
  const usable = text.split('\n').find(line => line.startsWith('【可用】'));
  assert.ok(usable);
  assert.match(usable, /\[劈砍\]/);
  assert.doesNotMatch(usable, /slash|conceal|throw|assist/);
});

test('P2-1 正文清洗：中文里夹的 defense/attack 换回中文，attempted 照旧去掉，英文专名保留', async () => {
  const { sanitizeAITextForDisplay } = await loadTs('../src/utils/textSanitizer.ts');
  assert.equal(sanitizeAITextForDisplay('那一击最终被你的 defense 挡下。'), '那一击最终被你的防御挡下。');
  assert.equal(sanitizeAITextForDisplay('你的defence稳住了'), '你的防御稳住了');
  assert.equal(sanitizeAITextForDisplay('你催马 attempted，沿道路前行。'), '你催马，沿道路前行。');
  assert.equal(sanitizeAITextForDisplay('一旁刻着 GPS 字样。'), '一旁刻着 GPS 字样。');
  assert.equal(sanitizeAITextForDisplay('Defense 系统'), 'Defense 系统');
});

test('P2-1 场面描写模型写出「被你的 defense 挡下」：落进历史前已清洗', async () => {
  const { narrateBeat } = await loadTs('../src/modules/sceneModule/host/narrate.ts');
  const contract = makeContract();
  const { state } = begin(contract, { action: [12], defense: Array(20).fill(20) });
  const out = scene.confirmAction(contract, state, { goal: 'attack', magnitude: 1, scope: 'single', targets: ['foe_a'], levers: [] }, { factors: 6 });
  const narration = await narrateBeat(contract, out.state, out.result, '硬拼，正面强攻来敌', undefined, async () => '你稳住脚步，那一击最终被你的 defense 挡下。');
  assert.equal(narration.by, 'model', narration.problems.join('；'));
  assert.doesNotMatch(narration.text, /defense/i);
  assert.match(narration.text, /被你的防御挡下/);
});

test('P2-2 地图入秦：口信拍章名、抵达提示、位置与主线行动一致', async () => {
  const I = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const M = await loadTs('../src/modules/scenarioMods/travel/mapTravel.ts');
  const V = await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
  const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
  const { CONTENT_PACKS } = await loadTs('../src/modules/contentPacks/index.ts');
  const stage = id => json(`src/modules/scenarioMods/builtins/data/${id}.json`);
  const open = id => I.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), I.buildStrictScenarioInitialization(stage(id)));
  const advance = s => R.advanceScenarioRuntime(s).saveData;
  let s = advance(I.applyStrictScenarioInitializationToSave(open('lcq.stage_01'), I.buildStrictScenarioInitialization(stage('lyg.changgan_begins'))));
  rt(s).completedEventIds.push(...['nanhuang', 'jin', 'song'].map(id => CONTENT_PACKS.lineCompass.lines.find(l => l.lineId === id).closedWhen[0].path.slice(5)));
  s = advance(s);
  const entry = CONTENT_PACKS.mapEntries.find(e => e.id === 'qin');
  assert.ok(rt(s).activeEventIds.includes(entry.eventId), '唐关里已注入咸阳口信');
  // 出发前：口信拍挂在秦关序幕，不再挂在唐关「抵达长安灞桥」。
  assert.equal(V.storyChapterTitle(rt(s).modId, entry.eventId, '兜底'), '咸阳传闻');
  assert.equal(V.storyChapterTitle(rt(s).modId, 'lyg.event.tang_liuxianping_arrive', '兜底'), '留仙坪', '唐关自己的拍不受影响');
  const selection = M.selectMapTravel(s, entry.locationId);
  assert.equal(M.settleMapTravel(s, selection), true);
  // 抵达：提示、顶栏位置、世界背景、开场都指咸阳。
  assert.equal(s.角色.位置.描述, '秦·咸阳');
  assert.equal(M.mapTravelArrivalNotice(s), '已按地图路线抵达秦·咸阳。');
  assert.doesNotMatch(s.世界.信息.世界背景, /长安|太真/);
  const shown = R.getStageEntryPresentation(s);
  assert.match(shown.text, /咸阳/);
  assert.doesNotMatch(shown.text, /长安|太真/);
  // 行动建议：秦关首拍「在咸阳落脚」可点，事件地点就是咸阳，罗盘不再写「去咸阳」。
  const live = advance(structuredClone(s));
  const actions = R.getCurrentStoryEventActions(live);
  assert.deepEqual(actions.map(a => a.eventId), ['liuchao.event.qin_enter_xianyang']);
  const event = rt(live).events.find(e => e.id === 'liuchao.event.qin_enter_xianyang');
  assert.equal(event.locationId, s.角色.位置.locationId);
  assert.doesNotMatch(V.formatQuestCompass(event, rt(live), live.角色.位置.locationId), /去咸阳/);
  assert.equal(V.storyChapterTitle(rt(live).modId, event.id, '咸阳传闻'), '咸阳传闻');
});

test('P2-3 审核拦截文案与实际行为一致：主叙事回合说没推进，模块叙事才说本地叙事', async () => {
  const { toUserFacingAIError } = await loadTs('../src/services/apiErrorMessage.ts');
  const original = Object.assign(new Error('API错误 422: {"message":"new_sensitive(1026)"}'), { status: 422 });
  const legacy = toUserFacingAIError(original, { retries: 0 }).message;
  assert.match(legacy, /LCQ-NET-012/);
  assert.match(legacy, /没有推进/);
  assert.doesNotMatch(legacy, /本地叙事/);
  assert.match(toUserFacingAIError(original, { localFallback: true }).message, /本回合将使用本地叙事/);
  // 模块叙事（场面描写/模块回合）审核拦截后确实退回本地模板，那条路才带 localFallback。
  assert.match(read('src/services/gameModelModules.ts'), /toUserFacingAIError\(error, \{ localFallback: true \}\)/);
  // 主叙事回合：aiService 不带 localFallback；AIBS 的本地兜底只认可信本地合同 + 格式/截断类错误，不认审核拦截（冻结文件，未改）。
  assert.doesNotMatch(read('src/services/aiService.ts'), /localFallback/);
  const predicate = ai.slice(ai.indexOf('export function shouldSettleLocalContractAfterGenerationFailure'), ai.indexOf('/**', ai.indexOf('export function shouldSettleLocalContractAfterGenerationFailure')));
  assert.doesNotMatch(predicate, /isContentModerationError|LCQ-NET-012|内容审核/);
  const frozen = json('tests/frozen-baseline.json').files['src/utils/AIBidirectionalSystem.ts'];
  assert.equal(createHash('sha256').update(readFileSync(new URL('../src/utils/AIBidirectionalSystem.ts', import.meta.url))).digest('hex'), frozen, 'AIBS 未改');
});
