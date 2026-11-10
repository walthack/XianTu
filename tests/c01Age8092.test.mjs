import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';

globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
const R = await loadTs('../src/modules/scenarioMods/relationships.ts');
const L = await loadTs('../src/modules/scenarioMods/loadRepairs.ts');
const C = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
const W = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
const F = await loadTs('../src/modules/scenarioMods/fixedEndingNarratives.ts');
const N = await loadTs('../src/services/narrativeSummary.ts');
const D = await loadTs('../src/services/narrativeDetailStore.ts');
const A = await loadTs('../src/utils/lifespanCalculator.ts');
const V = await loadTs('../src/utils/commandValidator.ts');
const { assertEntitySaveFormat } = await loadTs('../src/modules/scenarioMods/entitySaveFormat.ts');
const { validateSaveDataV3 } = await loadTs('../src/utils/saveValidationV3.ts');
const { buildNarrativePromptState } = await loadTs('../src/utils/narrativePromptState.ts');
const bundle = JSON.parse(readFileSync(new URL('./fixtures/checkpoints/c01-before-wuyuan-220.json', import.meta.url)));
const fresh = () => structuredClone(bundle.saves[0].存档数据);
const rt = s => s.世界.状态.剧本模组;
const YUE = 'lcq.character.yue_shuang';
const LE = 'liuchao.character.le_mingzhu';
const RECEIPT = 'author:timeline:qingyu.insert.grassland_four_years:y4';
const npcAge = (s, id) => A.calculateAgeFromBirthdate(s.社交.关系[id].出生日期, s.元数据.时间);
const life = s => s.角色.属性.寿命.当前;
const arrive = s => {
  const selection = W.getWuyuanOpenWorldSelections(s).find(x => x.identityId === 'lcq.route.wuyuan.arrive_market');
  assert.ok(selection, '夹具必须走官方进城路线');
  assert.equal(W.settleWuyuanOpenWorldSelection(s, selection).settled, true);
  R.enforceScenarioNpcAdulthood(s);
  // characterStore.syncFromGameState / saveToStorage 共用的年龄同步函数。
  A.updateLifespanFromGameTime(s);
  return selection;
};

test('8092 导入夹具：220 年、s02_01–03 已完成且王哲陨落，未走进城路线；主角 20、月霜 18', () => {
  const s = fresh();
  assert.equal(bundle.type, 'saves');
  assertEntitySaveFormat(s, 'c01-8092-fixture');
  const validation = validateSaveDataV3(s);
  assert.equal(validation.isValid, true, JSON.stringify(validation.errors));
  assert.equal(s.元数据.时间.年, 220);
  assert.equal(rt(s).modId, 'lcq.stage_02');
  for (const id of ['lcq.event.s02_01', 'lcq.event.s02_02', 'lcq.event.s02_03']) assert.ok(rt(s).completedEventIds.includes(id));
  assert.equal(rt(s).openWorldSlice?.travelReceipts?.some(x => x.routeId === 'lcq.route.wuyuan.arrive_market') || false, false);
  assert.equal(s.系统.扩展.actionTime.receipts[RECEIPT], undefined);
  assert.equal(npcAge(s, YUE), 18);
  assert.equal(A.ageForSaveCard(s), 20);
  assert.equal(life(s), 20);
});

test('8092 官方进城结算：220→224、月霜18→22、主角20→24；flush 带副本先过场后抵达；读两次不重复跳年', async () => {
  const s = fresh();
  const oldAge = A.ageForSaveCard(s);
  const selection = arrive(s);
  assert.equal(s.元数据.时间.年, 224);
  assert.equal(npcAge(s, YUE), 22);
  assert.equal(s.社交.关系[YUE].首见年, 220);
  assert.equal(A.ageForSaveCard(s), oldAge + 4);
  assert.equal(life(s), A.ageForSaveCard(s));
  const arrival = W.composeWuyuanOpenWorldNarrative(s, selection);
  assert.match(arrival, /抵达五原露天市集/);
  D.setNarrativeDetailBackend(D.createMemoryDetailBackend());
  const entry = D.narrativeEntryWithDetail('c01-8092', 0, N.summaryEntry('【仙道224年1月1日 10:45】', ''), arrival);
  s.系统.历史.叙事.push(entry);
  s.社交.记忆.短期记忆.push(entry.content);
  const interlude = F.flushTimeSkipInterlude(s);
  assert.match(interlude, /焦土还在身后冒烟/);
  assert.match(interlude, /流浪了四年/);
  const detail = await D.getDetail('c01-8092', entry.detailId);
  assert.equal(detail, arrival, '全文副本本身保留原始旅行结算');
  assert.equal(N.reviewTextOf(entry, detail), `${interlude}\n\n${arrival}`);
  assert.equal(N.reviewTextOf(entry), interlude, '无副本只显示本地过场，不留无概要标记');
  assert.equal(s.社交.记忆.短期记忆.at(-1), interlude);
  assert.equal(F.flushTimeSkipInterlude(s), '', '过场只接一次');
  const reload = JSON.parse(JSON.stringify(s));
  for (let n = 0; n < 2; n++) {
    L.applyLoadRepairs(reload);
    assert.equal(reload.元数据.时间.年, 224);
    assert.equal(npcAge(reload, YUE), 22);
    assert.equal(life(reload), oldAge + 4);
    assert.equal(Object.keys(reload.系统.扩展.actionTime.receipts).filter(id => id.endsWith('grassland_four_years:y4')).length, 1);
    assert.equal(N.reviewTextOf(reload.系统.历史.叙事.at(-1), detail), `${interlude}\n\n${arrival}`);
  }
  D.setNarrativeDetailBackend(null);
});

test('提前出场的总表人物：220年首见18，224年22；旧年龄／旧生日被覆盖，私密门同算式', () => {
  const s = fresh();
  s.社交.关系[LE] = { 名字: '乐明珠', 角色ID: LE, 年龄: 99, 出生日期: { 年: 210, 月: 9, 日: 9 }, 好感度: 100 };
  R.reconcileRegistryBirthdates(s);
  assert.equal(npcAge(s, LE), 18);
  assert.equal(s.社交.关系[LE].首见年, 220);
  arrive(s);
  assert.equal(npcAge(s, LE), 22);
  assert.equal(s.社交.关系[LE].出生日期.年, 202);
  assert.equal(C.gateAgeNow(LE, 224, undefined, 220), 22);
  const before = structuredClone(s.社交.关系[LE]);
  L.applyLoadRepairs(s);
  assert.deepEqual(s.社交.关系[LE], before);
});

test('私密状态投影用首见年与总表重算；不读被污染的年龄／出生日期', async () => {
  const s = { 元数据: { 时间: { 年: 220 } }, 角色: {}, 世界: { 状态: {} }, 社交: { 关系: {
    [LE]: { 名字: '乐明珠', 首见年: 220, 年龄: 3, 好感度: 100, 出生日期: { 年: 217 }, 私密信息: { 性取向: '测试' } },
  } } };
  const { PROMPT_LAYERS } = await loadTsPromise;
  const projected = buildNarrativePromptState(s, PROMPT_LAYERS.intimateInputPatterns[0]);
  assert.ok(projected.社交.关系[LE].私密信息);
});
const loadTsPromise = loadTs('../src/modules/scenarioMods/promptLayers.ts');

test('旧历200档：先迁移首见年再现场跳到204，月霜18→22；已有出生年不是权威', () => {
  const s = fresh();
  s.元数据.时间.年 = 200;
  s.角色.身份.出生日期.年 = 180;
  for (const npc of Object.values(s.社交.关系)) delete npc.首见年;
  s.社交.关系[YUE].出生日期.年 = 190;
  L.applyLoadRepairs(s);
  assert.equal(s.社交.关系[YUE].首见年, 200);
  assert.equal(npcAge(s, YUE), 18);
  arrive(s);
  assert.equal(s.元数据.时间.年, 204);
  assert.equal(npcAge(s, YUE), 22);
  assert.equal(life(s), 24);
  L.applyLoadRepairs(s);
  assert.equal(npcAge(s, YUE), 22);
});

test('已被钉死的204旧档：从本局带日期出现记录恢复200首见，按总表重算182生日，连读幂等', () => {
  const s = fresh();
  arrive(s);
  s.元数据.时间.年 = 204;
  const npc = s.社交.关系[YUE];
  delete npc.首见年;
  npc.出生日期.年 = 186;
  npc.年龄 = 18;
  npc.记忆 = [{ time: '【仙道200年1月1日 08:30】', subjectId: YUE, source: { kind: 'observed' }, content: '在战场上初遇。' }, { time: '【仙道203年1月1日 08:30】', subjectId: YUE, source: { kind: 'observed' }, content: '后来再见。' }];
  for (let n = 0; n < 2; n++) {
    L.applyLoadRepairs(s);
    assert.equal(npc.首见年, 200);
    assert.equal(npc.出生日期.年, 182);
    assert.equal(npcAge(s, YUE), 22);
  }
});

test('首见迁移：取带游戏时间的本人事件／历史中最早一年；忽略别人的记录、现实保存时间与未来日期', () => {
  const s = fresh();
  const npc = s.社交.关系[YUE];
  delete npc.首见年;
  npc.记忆 = ['出生于原著旧时代，不是本局日期'];
  s.元数据.创建时间 = '1990-01-01T00:00:00Z';
  s.系统.历史.叙事.push({ time: '【仙道201年1月1日 08:00】', source: { kind: 'observed' }, content: '月霜走近。' }, { time: '【仙道190年1月1日 08:00】', content: '另一个人。' });
  s.社交.事件.事件记录.push({ 发生时间: { 年: 200, 月: 1, 日: 1 }, 相关人物: [YUE] }, { 时间: { 年: 230 }, characterId: YUE });
  L.applyLoadRepairs(s);
  assert.equal(npc.首见年, 200);
  assert.equal(npc.出生日期.年, 182);
  npc.记忆.push('【仙道180年1月1日 08:00】晚到的记录不重写已落账首见年');
  L.applyLoadRepairs(s);
  assert.equal(npc.首见年, 200);
});

test('无首见证据的旧档：用读档当前年封底，不从钉死生日倒推；224旧档连读仍22／202', () => {
  const s = fresh();
  arrive(s);
  const npc = s.社交.关系[YUE];
  delete npc.首见年;
  npc.出生日期.年 = 206;
  npc.记忆 = [];
  for (let n = 0; n < 2; n++) {
    L.applyLoadRepairs(s);
    assert.equal(npc.首见年, 224);
    assert.equal(npc.出生日期.年, 202);
    assert.equal(npcAge(s, YUE), 22);
  }
});

test('读档补拨：首见迁移必须在静默+4之前，否则提前出场人物会少4岁', () => {
  const s = fresh();
  rt(s).openWorldSlice = { sliceId: 'lcq.open_world.wuyuan_v1', travelReceipts: [{ routeId: 'lcq.route.wuyuan.arrive_market' }] };
  s.社交.关系[LE] = { 名字: '乐明珠', 出生日期: { 年: 202, 月: 1, 日: 1 } };
  L.applyLoadRepairs(s);
  assert.equal(s.元数据.时间.年, 224);
  assert.equal(s.社交.关系[LE].首见年, 220);
  assert.equal(npcAge(s, LE), 22);
});

test('寿命当前值是缓存：同面板算年龄，保留上限；缺生日沿用既有成年兜底', () => {
  const s = fresh();
  s.元数据.时间.年 = 224;
  s.角色.属性.寿命.当前 = 18;
  const max = s.角色.属性.寿命.上限;
  assert.equal(A.updateLifespanFromGameTime(s), 24);
  assert.equal(life(s), A.calculateAgeFromBirthdate(s.角色.身份.出生日期, s.元数据.时间));
  assert.equal(s.角色.属性.寿命.上限, max);
  delete s.角色.身份.出生日期;
  assert.equal(A.updateLifespanFromGameTime(s), 18);
  assert.equal(life(s), 18);
});

test('存档卡片：槽内日期现算22而非旧缓存18；缺生日才退回缓存，兼容槽内游戏时间', () => {
  const s = fresh();
  s.元数据.时间.年 = 224;
  s.角色.身份.出生日期.年 = 202;
  s.角色.属性.寿命.当前 = 18;
  const before = JSON.stringify(s);
  assert.equal(A.ageForSaveCard(s), 22);
  assert.equal(JSON.stringify(s), before, '卡片渲染不修改存档');
  s.游戏时间 = s.元数据.时间;
  delete s.元数据.时间;
  assert.equal(A.ageForSaveCard(s), 22);
  delete s.角色.身份.出生日期;
  assert.equal(A.ageForSaveCard(s), 18);
});

test('AI不能set/add/delete寿命当前值或替换寿命容器；上限仍可写，首见年受保护', () => {
  for (const action of ['set', 'add', 'delete']) {
    assert.equal(V.validateCommand({ action, key: '角色.属性.寿命.当前', value: 9 }, 0).valid, false);
    assert.equal(V.validateCommand({ action, key: '角色.属性.寿命', value: { 当前: 9, 上限: 80 } }, 0).valid, false);
  }
  assert.equal(V.validateCommand({ action: 'add', key: '角色.属性.寿命.上限', value: -1 }, 0).valid, true);
  assert.equal(V.validateCommand({ action: 'set', key: `社交.关系.["${YUE}"].首见年`, value: 224 }, 0).valid, false);
});

test('随机／稀有遇敌共用append：全文前后段完整有序；无副本不留无概要标记且不重复', () => {
  const s = fresh();
  const marker = N.summaryEntry('【仙道220年1月1日 08:00】', '');
  const entry = { content: marker };
  s.系统.历史.叙事 = [entry];
  s.社交.记忆.短期记忆 = [marker];
  F.appendToLatestNarrative(s, '随机遇敌正文');
  F.appendToLatestNarrative(s, '稀有遇敌正文');
  F.prependToLatestNarrative(s, '过场一');
  F.prependToLatestNarrative(s, '过场二');
  assert.equal(N.reviewTextOf(entry, '旅行全文'), '过场二\n\n过场一\n\n旅行全文\n\n随机遇敌正文\n\n稀有遇敌正文');
  assert.equal(N.reviewTextOf(entry), '过场二\n\n过场一\n\n随机遇敌正文\n\n稀有遇敌正文');
  assert.equal(s.社交.记忆.短期记忆[0], entry.content);
  assert.deepEqual(entry.localInserts.after, ['随机遇敌正文', '稀有遇敌正文']);
});


test('旧正文带本地追加段再迁移全文副本：有副本不重复，无副本仍有本地定稿', async () => {
  const { migrateNarrativeDetailOnLoad } = await loadTs('../src/utils/dataRepair.ts');
  const s = fresh();
  s.系统.历史.叙事 = [{ type: 'gm', content: '旧基础全文', time: '', actionOptions: [] }];
  s.社交.记忆.短期记忆 = [];
  s.社交.记忆.隐式中期记忆 = [];
  s.社交.记忆.中期记忆 = [];
  s.社交.记忆.长期记忆 = [];
  F.prependToLatestNarrative(s, '旧本地前段');
  F.appendToLatestNarrative(s, '旧本地后段');
  D.setNarrativeDetailBackend(D.createMemoryDetailBackend());
  await migrateNarrativeDetailOnLoad(s, 'c01-legacy');
  const entry = s.系统.历史.叙事[0];
  const detail = await D.getDetail('c01-legacy', entry.detailId);
  assert.equal(detail, '旧基础全文');
  assert.equal(N.reviewTextOf(entry, detail), '旧本地前段\n\n旧基础全文\n\n旧本地后段');
  assert.equal(N.reviewTextOf(entry), '旧本地前段\n\n旧本地后段');
  await migrateNarrativeDetailOnLoad(s, 'c01-legacy');
  assert.equal(N.reviewTextOf(entry, detail), '旧本地前段\n\n旧基础全文\n\n旧本地后段');
  D.setNarrativeDetailBackend(null);
});

test('新建后不中途读档跨过序幕：已启用现算缓存，首次读档不把正常200生日误减成196', async () => {
  const { freshPrologueCheckpoint } = await import('../scripts/generate-prologue-checkpoint.mjs');
  const I = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const P = await loadTs('../src/modules/contentPacks/index.ts');
  const { save } = await freshPrologueCheckpoint({ beforeWuyuan: true });
  assert.equal(save.系统.扩展.c01ProtagonistBirth, undefined, '全程尚未经过读档出生年迁移');
  assert.equal(A.lifespanCacheEnabled(save), true, '新建入口必须登记缓存版本');
  arrive(save);
  rt(save).nextStageReadyId = rt(save).nextStageId;
  const mods = ['lcq.stage_03', 'lcq.stage_03b_snake_flower_bridge'].map(id => P.applyContentPackOverlays(JSON.parse(readFileSync(new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`, import.meta.url)))));
  const result = I.transitionToNextScenarioStage(save, mods);
  assert.equal(result.ok, true, result.reason);
  const s = result.saveData;
  assert.notEqual(rt(s).modId, 'lcq.stage_02');
  A.updateLifespanFromGameTime(s);
  assert.equal(s.元数据.时间.年, 224);
  assert.equal(s.角色.身份.出生日期.年, 200);
  assert.equal(life(s), 24);
  for (let n = 0; n < 2; n++) {
    L.applyLoadRepairs(s);
    assert.equal(s.角色.身份.出生日期.年, 200);
    assert.equal(life(s), 24);
  }
});

test('未登记版本的旧档：提前调用年龄同步不覆盖旧缓存，读档按指纹A（开局年＋已拨年数−开局年龄）识别挪年再启用缓存', () => {
  // 指纹A：开局预设 20 → 开局年 220，已拨 4 年 → 只有出生 204 是切关挪年特征；202／206 都不是，不修。
  for (const [oldBirth, repaired] of [[202, 202], [204, 200], [206, 206]]) {
    const s = fresh();
    arrive(s);
    rt(s).modId = 'lcq.stage_03';
    delete s.系统.扩展[A.LIFESPAN_CACHE_VERSION_KEY];
    delete s.系统.扩展.c01ProtagonistBirth;
    s.角色.身份.出生日期.年 = oldBirth;
    s.角色.属性.寿命.当前 = 18;
    assert.equal(A.updateLifespanFromGameTime(s), 224 - oldBirth);
    assert.equal(life(s), 18, '旧缓存必须保留给旧档识别');
    assert.equal(A.lifespanCacheEnabled(s), false);
    L.applyLoadRepairs(s);
    assert.equal(A.lifespanCacheEnabled(s), true);
    assert.equal(s.角色.身份.出生日期.年, repaired, `出生 ${oldBirth}`);
    assert.equal(life(s), 224 - repaired);
    assert.equal(s.系统.扩展.c01ProtagonistBirth?.to, repaired === oldBirth ? undefined : repaired, '只有真正修了才打标记');
    L.applyLoadRepairs(s);
    assert.equal(s.角色.身份.出生日期.年, repaired);
  }
});

/** 无缓存旧档：夹具拨过四年进城正式回执（shifted=4），按参数改出生年／寿命缓存／开局预设。 */
const legacyShifted = ({ birth, lifespan, modId = 'lcq.stage_02', openingAge, startYear }) => {
  const s = fresh();
  if (openingAge !== undefined) rt(s).opening.creationPreset.age = openingAge;
  if (startYear !== undefined) s.元数据.时间.年 = startYear;
  arrive(s);
  rt(s).modId = modId;
  delete s.系统.扩展[A.LIFESPAN_CACHE_VERSION_KEY];
  delete s.系统.扩展.c01ProtagonistBirth;
  s.角色.身份.出生日期.年 = birth;
  s.角色.属性.寿命.当前 = lifespan;
  return s;
};

test('指纹A：204/20@224 挪年档不论仍在序幕（stage_02，rt24-huamiao-loc 同态）还是已过序幕都修回 200、现算 24；再读不变', () => {
  for (const modId of ['lcq.stage_02', 'lcq.stage_03']) {
    const s = legacyShifted({ birth: 204, lifespan: 20, modId });
    assert.equal(s.元数据.时间.年, 224);
    L.applyLoadRepairs(s);
    assert.equal(s.角色.身份.出生日期.年, 200, modId);
    assert.equal(life(s), 24);
    assert.deepEqual(s.系统.扩展.c01ProtagonistBirth, { version: 1, from: 204, to: 200 });
    const once = structuredClone(s);
    L.applyLoadRepairs(s);
    assert.deepEqual(s.角色, once.角色, '再读不变');
    assert.deepEqual(s.系统.扩展.c01ProtagonistBirth, once.系统.扩展.c01ProtagonistBirth);
  }
});

test('指纹A：寿命已被写成现算年龄的 200/24@224 无缓存旧档不误修成 196，且不打修复标记', () => {
  const s = legacyShifted({ birth: 200, lifespan: 24, modId: 'lcq.stage_03' });
  L.applyLoadRepairs(s);
  assert.equal(s.角色.身份.出生日期.年, 200);
  assert.equal(life(s), 24);
  assert.equal(s.系统.扩展.c01ProtagonistBirth, undefined);
});

test('指纹A：官方 14 岁开局（开局 214、拨 4 年到 218、出生 200）寿命仍 14 或已对齐 18 都不修', () => {
  for (const lifespan of [14, 18]) {
    const s = legacyShifted({ birth: 200, lifespan, openingAge: 14, startYear: 214 });
    assert.equal(s.元数据.时间.年, 218);
    L.applyLoadRepairs(s);
    assert.equal(s.角色.身份.出生日期.年, 200, `寿命 ${lifespan}`);
    assert.equal(life(s), 18);
    assert.equal(s.系统.扩展.c01ProtagonistBirth, undefined);
  }
});

test('指纹A：档内缺开局预设年龄时退回内置 stage_01 包的预设年龄', () => {
  const s = legacyShifted({ birth: 204, lifespan: 20 });
  delete rt(s).opening.creationPreset.age;
  L.applyLoadRepairs(s);
  assert.equal(s.角色.身份.出生日期.年, 200);
});

test('AI保护反例：混合括号路径、祖先容器载荷均不能写寿命当前值或首见年', () => {
  const blocked = [
    ['系统.扩展', { c01LifespanCacheVersion: 1 }],
    ['系统', { 扩展: { c01ProtagonistBirth: { version: 1 } } }],
    ['角色.属性', { 寿命: { 当前: 9 } }],
    ['角色', { 属性: { 寿命: { 当前: 9 } } }],
    ['角色.属性.寿命["当前"]', 9],
    ["角色['属性']['寿命']['当前']", 9],
    ['角色["属性"].寿命.当前', 9],
    ['社交', { 关系: { [YUE]: { 首见年: 200 } } }],
    ['社交.关系', { [YUE]: { 首见年: 200 } }],
    [`社交.关系["${YUE}"]`, { 首见年: 200 }],
    [`社交["关系"]["${YUE}"]["首见年"]`, 200],
    ["社交.关系['X']['首见年']", 200],
  ];
  for (const [key, value] of blocked) for (const action of ['set', 'add', 'push', 'delete']) {
    assert.equal(V.validateCommand({ action, key, value }, 0).valid, false, `${action} ${key}`);
  }
  const allowed = { action: 'add', key: '角色["属性"].寿命["上限"]', value: -1 };
  assert.equal(V.validateCommand(allowed, 0).valid, true);
  assert.equal(allowed.key, '角色.属性.寿命.上限', '验证后的执行路径也统一化');
  assert.equal(V.validateCommand({ action: 'set', key: '角色.属性', value: { 寿命: { 上限: 80 } } }, 0).valid, true);
  // 仅测 validateCommand 的年龄护栏放行；完整管线会因剧情守卫的「名称」保护拒掉这条整体 set（原有行为）。
  assert.equal(V.validateCommand({ action: 'set', key: `社交.关系["${YUE}"]`, value: { 好感度: 10 } }, 0).valid, true);
});

test('首见证据反例：修行年数、非前缀／不完整日期、转述均不被登记成游戏首见年', () => {
  const cases = [
    { subjectId: YUE, source: { kind: 'observed' }, time: '【修行3年】', content: '月霜出现。' },
    { subjectId: YUE, source: { kind: 'observed' }, time: '【仙道3年】', content: '月霜出现。' },
    { subjectId: YUE, source: { kind: 'observed' }, time: '前文【仙道200年1月1日 08:00】', content: '月霜出现。' },
    { subjectId: YUE, source: { kind: 'observed' }, 游戏时间: { 年: 200 }, content: '不完整日期。' },
    { subjectId: YUE, source: { kind: 'reported' }, 游戏时间: { 年: 200, 月: 1, 日: 1 }, content: '转述月霜往事。' },
    { time: '【仙道200年1月1日 08:00】', content: '听说月霜早年曾来过。' },
    '【仙道200年1月1日 08:00】听说月霜早年曾来过。',
  ];
  for (const record of cases) {
    const s = fresh();
    const npc = s.社交.关系[YUE];
    delete npc.首见年;
    npc.记忆 = [record];
    L.backfillRelationshipFirstSeenYears(s);
    assert.equal(npc.首见年, 220, JSON.stringify(record));
  }
});

test('首见证据反例：妻子完整姓名不算达古；多人／同名别名不唯一时兜底', () => {
  const registry = JSON.parse(readFileSync(new URL('../src/modules/scenarioMods/builtins/character-registry.json', import.meta.url))).characters;
  const dagu = registry.find(person => person.canonicalName === '达古');
  const wife = registry.find(person => person.canonicalName === '达古的孪生妻子');
  assert.ok(dagu && wife);
  assert.deepEqual(C.registryPersonIdsInText('达古的孪生妻子走近。'), [wife.id]);
  const s = fresh();
  s.社交.关系[dagu.id] = { 名字: dagu.canonicalName, 记忆: [] };
  s.系统.历史.叙事 = [{ time: '【仙道200年1月1日 08:00】', content: '达古的孪生妻子走近。', source: { kind: 'observed' } }];
  L.backfillRelationshipFirstSeenYears(s);
  assert.equal(s.社交.关系[dagu.id].首见年, 220);
  const npc = s.社交.关系[YUE];
  delete npc.首见年;
  npc.记忆 = [{ time: '【仙道200年1月1日 08:00】', content: '月霜与乐明珠走近。', source: { kind: 'observed' } }];
  L.backfillRelationshipFirstSeenYears(s);
  assert.equal(npc.首见年, 220);
  const names = new Map();
  for (const person of registry.filter(person => C.isRegistryPerson(person.id))) {
    for (const name of [person.canonicalName, ...(person.aliases || [])]) {
      const ids = names.get(name) || new Set(); ids.add(person.id); names.set(name, ids);
    }
  }
  const ambiguous = [...names].find(([name, ids]) => ids.size > 1 && C.registryPersonIdsInText(`${name}走近。`) === undefined);
  assert.ok(ambiguous, '用总表现有同名别名验证歧义处理');
  delete npc.首见年;
  npc.记忆 = [{ time: '【仙道200年1月1日 08:00】', content: `${ambiguous[0]}走近。`, source: { kind: 'observed' } }];
  L.backfillRelationshipFirstSeenYears(s);
  assert.equal(npc.首见年, 220);
});

test('规范前缀＋明确观察＋唯一完整姓名可回填；结构化ID／日期优先于正文提及', () => {
  const s = fresh();
  const npc = s.社交.关系[YUE];
  delete npc.首见年;
  npc.记忆 = [];
  s.系统.历史.叙事 = [{ time: '【仙道201年1月1日 08:00】', content: '月霜走近。', source: { kind: 'observed' } }];
  L.backfillRelationshipFirstSeenYears(s);
  assert.equal(npc.首见年, 201);
  delete npc.首见年;
  s.社交.事件.事件记录 = [{ subjectId: YUE, 游戏时间: { 年: 200, 月: 1, 日: 1 }, content: '说到达古的孪生妻子。', source: { kind: 'observed' } }];
  L.backfillRelationshipFirstSeenYears(s);
  assert.equal(npc.首见年, 200);
});

test('首次旁门进城完全没有切片：水合后拨钟一次，副本回看先过场后到达', async () => {
  const s = fresh();
  const selection = W.getWuyuanOpenWorldSelections(s).find(x => x.identityId === 'lcq.route.wuyuan.arrive_market');
  delete rt(s).openWorldSlice;
  delete rt(s).openWorldSliceLastWorldTurn;
  s.角色.位置 = { locationId: 'liuchao.location.wuyuan', 描述: '中立边陲·五原' };
  assert.equal(s.系统.扩展.actionTime.receipts[RECEIPT], undefined);
  assert.ok(rt(s).completedEventIds.includes('lcq.event.s02_03'));
  assert.ok(W.ensureWuyuanOpenWorldSlice(s));
  assert.equal(s.元数据.时间.年, 224);
  const arrival = W.composeWuyuanOpenWorldNarrative(s, selection);
  assert.match(arrival, /抵达五原露天市集/);
  D.setNarrativeDetailBackend(D.createMemoryDetailBackend());
  const entry = D.narrativeEntryWithDetail('c01-side-entry', 0, N.summaryEntry('【仙道224年1月1日 10:45】', ''), arrival);
  s.系统.历史.叙事.push(entry);
  const interlude = F.flushTimeSkipInterlude(s);
  assert.match(interlude, /流浪了四年/);
  const detail = await D.getDetail('c01-side-entry', entry.detailId);
  assert.equal(N.reviewTextOf(entry, detail), `${interlude}\n\n${arrival}`);
  W.ensureWuyuanOpenWorldSlice(s);
  assert.equal(s.元数据.时间.年, 224);
  assert.equal(Object.keys(s.系统.扩展.actionTime.receipts).filter(id => id.endsWith('grassland_four_years:y4')).length, 1);
  assert.equal(F.flushTimeSkipInterlude(s), '');
  D.setNarrativeDetailBackend(null);
});

test('旧正文自身与本地追加段同头同尾：只剥一层，缺失元数据保留原文', async () => {
  const { migrateNarrativeDetailOnLoad } = await loadTs('../src/utils/dataRepair.ts');
  const body = '相同前段\n\n基础正文\n\n相同后段';
  const s = fresh();
  s.系统.历史.叙事 = [{ type: 'gm', content: body, time: '', actionOptions: [] }, { type: 'gm', content: body, time: '', actionOptions: [] }];
  s.社交.记忆 = { 短期记忆: [], 隐式中期记忆: [], 中期记忆: [], 长期记忆: [] };
  F.prependToLatestNarrative(s, '相同前段');
  F.appendToLatestNarrative(s, '相同后段');
  D.setNarrativeDetailBackend(D.createMemoryDetailBackend());
  await migrateNarrativeDetailOnLoad(s, 'c01-same-boundary');
  for (const entry of s.系统.历史.叙事) assert.equal(await D.getDetail('c01-same-boundary', entry.detailId), body);
  const entry = s.系统.历史.叙事[1];
  assert.equal(N.reviewTextOf(entry, body), `相同前段\n\n${body}\n\n相同后段`);
  D.setNarrativeDetailBackend(null);
});

const PIPE = await loadTs('../src/utils/modelCommandPipeline.ts');
const REPAIR = await loadTs('../src/utils/repairCommandPipeline.ts');
const DUAN = 'lcq.character.duan_qiang';
const ENGINE_AGE = /寿命当前值／首见年/;
const guardedSave = () => {
  const s = fresh();
  R.enforceScenarioNpcAdulthood(s);
  s.社交.关系.临时路人 = { 名字: '临时路人', 好感度: 0 };
  return s;
};
const runOne = async (s, cmd) => PIPE.validateModelCommandPipeline([structuredClone(cmd)], s);

test('完整管线：祖先容器删除／置空／非对象替换不能抹掉寿命缓存、首见年；合法合并与数值写入照常', async () => {
  const s = guardedSave();
  assert.ok(Number.isInteger(s.社交.关系[DUAN].首见年), '夹具：总表人物已登记首见年');
  assert.equal(s.系统.扩展.c01LifespanCacheVersion, 1);
  const blocked = [
    { action: 'set', key: '角色.属性', value: { 寿命: null } },
    { action: 'delete', key: '角色.属性' },
    { action: 'delete', key: '角色["属性"]' },
    { action: 'set', key: '角色.属性.寿命', value: 5 },
    { action: 'set', key: '角色.属性', value: { 寿命: [] } },
    { action: 'set', key: '角色.属性', value: { 寿命: '二十' } },
    { action: 'delete', key: `社交.关系["${DUAN}"]` },
    { action: 'delete', key: `社交.关系['${DUAN}']` },
    { action: 'set', key: `社交.关系["${DUAN}"]`, value: { 首见年: null } },
    { action: 'set', key: `社交.关系["${DUAN}"]`, value: 5 },
  ];
  for (const cmd of blocked) {
    const result = await runOne(s, cmd);
    assert.equal(result.validCommands.length, 0, `${cmd.action} ${cmd.key} 应被拒`);
    assert.match(result.rejectedCommands.flatMap(r => r.errors).join('；'), ENGINE_AGE, `${cmd.action} ${cmd.key} 由年龄字段护栏拒绝`);
  }
  // 迁移版本容器：管线里时间护栏先拒；年龄护栏同样独立拦截，不依赖前者。
  for (const cmd of [{ action: 'delete', key: '系统.扩展' }, { action: 'set', key: '系统.扩展', value: {} }, { action: 'set', key: '系统.扩展', value: { c01LifespanCacheVersion: null } }]) {
    assert.equal((await runOne(s, cmd)).validCommands.length, 0, `${cmd.action} ${cmd.key}`);
    assert.match(V.validateCommand(structuredClone(cmd), 0, s).errors.join('；'), ENGINE_AGE);
  }
  const allowed = [
    { action: 'set', key: '角色.属性', value: { 寿命: { 上限: 80 } } },
    { action: 'add', key: '角色.属性.寿命.上限', value: -1 },
    { action: 'add', key: `社交.关系["${YUE}"].好感度`, value: 2 },
    { action: 'add', key: '角色.属性.气血.上限', value: 5 },
    { action: 'delete', key: '社交.关系.临时路人' }, // 无首见年的临时人物仍可删
  ];
  for (const cmd of allowed) {
    const result = await runOne(s, cmd);
    assert.equal(result.validCommands.length, 1, `${cmd.action} ${cmd.key}: ${JSON.stringify(result.rejectedCommands)}`);
  }
});

test('完整管线：名字键／正典别名键按执行器同一解析换成人物ID后判首见年，不能整条抹掉；合法写入照常', async () => {
  const s = guardedSave();
  const NING = 'liuchao.character.ning_yu';
  const ZHUO = 'liuchao.character.zhuo_yunjun';
  const canonIds = rt(s).canon.characters.map(c => c.id);
  assert.ok(!canonIds.includes(DUAN), '夹具：段强不在当前关卡正典名单');
  for (const id of [DUAN, NING, ZHUO]) assert.ok(Number.isInteger(s.社交.关系[id].首见年), `夹具：${id} 已登记首见年`);
  const blocked = [
    { action: 'delete', key: '社交.关系.段强' }, // 总表人物、不在关卡正典
    { action: 'delete', key: '社交.关系.凝奴' }, // 正典别名 → 凝羽
    { action: 'delete', key: '社交.关系.卓奴' }, // 正典别名 → 卓云君
    { action: 'set', key: '社交.关系.段强', value: { 首见年: null } },
  ];
  for (const cmd of blocked) {
    const result = await runOne(s, cmd);
    assert.equal(result.validCommands.length, 0, `${cmd.action} ${cmd.key} 应被拒`);
    assert.match(result.rejectedCommands.flatMap(r => r.errors).join('；'), ENGINE_AGE, `${cmd.action} ${cmd.key} 由年龄字段护栏拒绝`);
  }
  // 正典名字键：完整管线先由剧情守卫「正典人物不可删除」拒（原有行为）；年龄护栏单独也拦。
  const byName = { action: 'delete', key: '社交.关系.凝羽' };
  assert.equal((await runOne(s, byName)).validCommands.length, 0);
  assert.match(V.validateCommand(structuredClone(byName), 0, s).errors.join('；'), ENGINE_AGE);
  for (const cmd of [
    { action: 'add', key: '社交.关系.段强.好感度', value: 2 },
    { action: 'add', key: '社交.关系.凝奴.好感度', value: 1 },
  ]) {
    const result = await runOne(s, cmd);
    assert.equal(result.validCommands.length, 1, `${cmd.action} ${cmd.key}: ${JSON.stringify(result.rejectedCommands)}`);
  }
});

test('完整管线：点／括号路径等价——称号、NPC出生日期、寿命当前值、首见年、时间各写法同判，合法字段同路径执行', async () => {
  const s = guardedSave();
  const groups = [
    ['角色.身份.称号', '角色["身份"].称号', "角色['身份']['称号']", '角色["身份"]["称号"]'],
    [`社交.关系["${DUAN}"].出生日期`, `社交["关系"]["${DUAN}"]["出生日期"]`, `社交.关系['${DUAN}'].出生日期`],
    ['角色.属性.寿命.当前', '角色["属性"]["寿命"]["当前"]', "角色.属性['寿命'].当前"],
    [`社交.关系["${DUAN}"].首见年`, `社交["关系"]['${DUAN}']["首见年"]`],
    ['元数据.时间.年', '元数据["时间"].年'],
  ];
  for (const keys of groups) {
    const verdicts = [];
    for (const key of keys) {
      const value = key.includes('称号') ? '自封' : key.endsWith('出生日期') || key.endsWith('出生日期"]') ? { 年: 200, 月: 1, 日: 1 } : 200;
      const result = await runOne(s, { action: 'set', key, value });
      assert.equal(result.validCommands.length, 0, `${key} 应被拒`);
      verdicts.push(result.rejectedCommands[0].errors[0].replace(/^指令\d+: /, ''));
    }
    assert.equal(new Set(verdicts).size, 1, `同一字段各写法同一拒绝理由：${verdicts.join(' | ')}`);
  }
  for (const keys of [
    ['角色.属性.寿命.上限', '角色["属性"].寿命["上限"]'],
    [`社交.关系["${YUE}"].好感度`, `社交['关系']["${YUE}"]['好感度']`],
  ]) {
    const executed = [];
    for (const key of keys) {
      const result = await runOne(s, { action: 'add', key, value: 1 });
      assert.equal(result.validCommands.length, 1, key);
      executed.push(result.validCommands[0].key);
    }
    assert.equal(new Set(executed).size, 1, `执行路径一致：${executed.join(' | ')}`);
  }
});

test('存档修复通路：括号路径同样先规范化再过剧情护栏，不能改称号', async () => {
  const s = guardedSave();
  const before = structuredClone(s.角色.身份);
  const errors = await REPAIR.executeValidatedRepairCommands(s, { 模式: '单机', 角色: { 名字: '测试' }, 存档列表: {} }, [
    { action: 'set', key: '角色["身份"].称号', value: '自封' },
    { action: 'set', key: "角色['身份']['称号']", value: '自封' },
  ]);
  assert.equal(errors.length, 2, errors.join('；'));
  assert.deepEqual(s.角色.身份, before);
});

test('存档修复通路：执行器整体替换，祖先容器整体 set 不能抹掉寿命缓存；叶子写入照常', async () => {
  const s = guardedSave();
  const current = s.角色.属性.寿命.当前;
  assert.ok(Number.isFinite(current), '夹具：寿命.当前已登记');
  const profile = { 模式: '单机', 角色: { 名字: '测试' }, 存档列表: {} };
  const blocked = await REPAIR.executeValidatedRepairCommands(s, profile, [
    { action: 'set', key: '角色.属性', value: {} },
    { action: 'set', key: '角色.属性', value: { 寿命: { 上限: 80 } } },
  ]);
  assert.equal(blocked.length, 2, blocked.join('；'));
  for (const e of blocked) assert.match(e, ENGINE_AGE);
  assert.equal(s.角色.属性.寿命.当前, current);
  assert.ok(s.角色.属性.气血, '其他属性未被替换');

  const allowed = await REPAIR.executeValidatedRepairCommands(s, profile, [
    { action: 'set', key: '角色.属性.寿命.上限', value: 120 },
    { action: 'set', key: '角色.属性.气血.当前', value: 5 },
  ]);
  assert.deepEqual(allowed, []);
  assert.equal(s.角色.属性.寿命.上限, 120);
  assert.equal(s.角色.属性.气血.当前, 5);
  assert.equal(s.角色.属性.寿命.当前, current);
});
