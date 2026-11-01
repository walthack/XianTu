// REPORT-8091-f76e07a7 复测修复回归：P1-1～P2-8 与稀有遇见通用化。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const json = p => JSON.parse(read(p));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: {
  '@': fileURLToPath(new URL('../src', import.meta.url)),
  './characterStore': fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts', import.meta.url)),
  '@/stores/characterStore': fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts', import.meta.url)),
} });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const load = p => jiti.import(new URL('../src/' + p, import.meta.url).pathname);
const R = await load('modules/scenarioMods/runtime.ts');
const M = await load('modules/scenarioMods/travel/mapTravel.ts');
const V = await load('modules/scenarioMods/eventNarrativeView.ts');
const NI = await load('modules/scenarioMods/naturalIntentRouter.ts');
const LR = await load('modules/scenarioMods/loadRepairs.ts');
const AT = await load('modules/scenarioMods/actionTime.ts');
const RD = await load('modules/scenarioMods/travel/routeDays.ts');
const W = await load('modules/scenarioMods/wuyuanOpenWorldSlice.ts');
const L = await load('modules/scenarioMods/locationLoot.ts');
const RE = await load('modules/scenarioMods/rareEncounters.ts');
const WL = await load('modules/scenarioMods/whiteTailLeopard.ts');
const realm = await load('utils/realmUtils.ts');
const { GAME_NUMBERS: N } = await load('modules/sceneModule/numbers.ts');
const { CONTENT_PACKS } = await load('modules/contentPacks/index.ts');
const rt = s => s.世界.状态.剧本模组;
const fixture = name => json('tests/fixtures/' + name).saves[0].存档数据;
const minutesOf = t => (((t.年 * 12 + t.月) * 30 + t.日) * 24 + t.小时) * 60 + t.分钟;
function withEnv({ search = '', session = {} }, fn) {
  const prevLoc = globalThis.location, prevSs = globalThis.sessionStorage, store = { ...session };
  globalThis.location = { search, hash: '' };
  globalThis.sessionStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  try { return fn(store); } finally { globalThis.location = prevLoc; globalThis.sessionStorage = prevSs; }
}

// ───────────── P1-1 秦线 ─────────────
function qinArrived() {
  let s = fixture('checkpoints/current-tang-entry.json');
  // 夹具是清羽试玩派生档；真实秦入口是正式档（自由输入不走意图模型）且三线收束。只置备入口前置。
  delete s.系统.扩展.清羽记开局;
  rt(s).completedEventIds.push(...['nanhuang', 'jin', 'song'].map(id => CONTENT_PACKS.lineCompass.lines.find(l => l.lineId === id).closedWhen[0].path.slice(5)));
  s = R.advanceScenarioRuntime(s).saveData;
  assert.ok(M.settleMapTravel(s, M.selectMapTravel(s, 'liuchao.location.xianyang')));
  return R.advanceScenarioRuntime(s).saveData;
}
test('P1-1 正式档到咸阳后照建议原文输入（含「行动 · 」前缀）即命中 settle_in_xianyang，入咸阳拍完成；旧档读档补短语', async () => {
  const s = qinArrived();
  const [action] = R.getCurrentStoryEventActions(s);
  assert.equal(action.eventId, 'liuchao.event.qin_enter_xianyang');
  for (const text of ['行动 · 在咸阳落脚，打听见王的门路', '在咸阳落脚，打听见王的门路', action.playerLine]) {
    const intent = await NI.resolveNaturalIntent({ saveData: s, playerText: text, selected: null, resolveFromText: R.resolveStoryEventActionFromPlayerText });
    assert.equal(intent.kind, 'alias', text); assert.equal(intent.selection.actionId, 'settle_in_xianyang', text);
  }
  const done = structuredClone(s);
  const sel = R.resolveStoryEventActionFromPlayerText(done, '在咸阳落脚，打听见王的门路');
  assert.equal(R.recordStoryEventStructuredAction(done, sel, { judgementResolution: { status: 'resolved', outcome: 'success', kind: 'explore' } }).completed, true);
  assert.ok(rt(R.advanceScenarioRuntime(done).saveData).completedEventIds.includes('liuchao.event.qin_enter_xianyang'));
  // 旧档：合同烘焙进档时还没有短语——读档补上，补后同样命中。
  const old = structuredClone(s);
  for (const e of rt(old).events) for (const a of e.playerCompletionContract?.actions || []) delete a.intentMatch;
  assert.equal(R.resolveStoryEventActionFromPlayerText(old, '在咸阳落脚，打听见王的门路'), undefined, '复现：旧档一句都不认');
  LR.applyLoadRepairs(old);
  assert.equal(R.resolveStoryEventActionFromPlayerText(R.advanceScenarioRuntime(old).saveData, '在咸阳落脚，打听见王的门路')?.actionId, 'settle_in_xianyang');
  // 秦关除口信拍（地图入口）外每个合同动作都带作者短语（按钮原文与玩家原句），否则正式档后面的拍同样卡住。
  const stage = CONTENT_PACKS.stages.find(x => x.manifest.id === 'lyg.qin_xianyang');
  for (const e of stage.scenario.events) for (const a of e.playerCompletionContract?.actions || []) {
    if (e.id === 'liuchao.event.qin_hook_fangshi_rumor') continue;
    assert.deepEqual(a.intentMatch?.matchAny?.slice(0, 2), [a.label, a.actionText], `${e.id}:${a.id}`);
  }
});

// ───────────── P1-2 汉线 ─────────────
test('P1-2 汉线舞都段：焦点拍都在汉境；07 不再自称前往洛都；08 才真正移动到洛都，按两地路程耗时（不是 15 分钟）', () => {
  const s0 = fixture('checkpoints/current-han-entry.json');
  const ev = (save, id) => rt(save).events.find(e => e.id === `lyl.event.taiquan_afterfall_${id}_beat`);
  // 旧档（f76e07a7 构建烘焙进档的 07 旧目标、08 无地点）：读档补修后与当前构建的档一致。
  const old = structuredClone(s0), OLD = '前往洛都查明风波', NEW = ev(s0, '07').objective;
  assert.equal(NEW, '在舞都打听平亭侯下狱的风波');
  ev(old, '07').objective = OLD;
  ev(old, '07').playerCompletionContract = JSON.parse(JSON.stringify(ev(old, '07').playerCompletionContract).replaceAll(NEW, OLD));
  delete ev(old, '08').locationId;
  LR.applyLoadRepairs(old);
  assert.deepEqual([ev(old, '07'), ev(old, '08')], [ev(s0, '07'), ev(s0, '08')]);
  let s = R.advanceScenarioRuntime(old).saveData;
  const seen = [];
  for (let i = 0; i < 12 && !seen.some(x => x.eventId === 'lyl.event.taiquan_afterfall_08_beat' && !x.travel); i++) {
    const r = rt(s), focus = R.getScenarioFocusEvent(r);
    const [a] = R.getCurrentStoryEventActions(s).map(x => V.storyActionPresentation(x, s));
    assert.ok(a, `第${i}拍有主线动作`);
    const place = s.角色.位置.locationId, travel = a.actionId.startsWith('travel:');
    seen.push({ eventId: a.eventId, label: a.label, place, travel });
    assert.equal(M.countryOf(place), '汉', `${focus.id} 时人在汉境`);
    if (focus.locationId) assert.equal(M.countryOf(focus.locationId), '汉', `${focus.id} 的地点在汉境`);
    assert.doesNotMatch(a.label, /前往洛都查明风波/);
    const before = structuredClone(s.元数据.时间);
    const res = R.recordStoryEventStructuredAction(s, a, { judgementResolution: { status: 'resolved', outcome: 'success', kind: 'explore' } });
    assert.equal(res.attempted, true, a.label);
    // 界面把出发地随动作带上（MainGamePanel），actionTime 按两地路程计时；模型给的「片刻」不再生效。
    AT.settleActionTime(s, { action_time: { tier: '片刻' } }, { eventAction: { ...a, ...(travel ? { travelFromLocationId: place } : {}) }, timeActionId: `t${i}` }, undefined, false, false, undefined);
    const spent = minutesOf(s.元数据.时间) - minutesOf(before);
    if (travel) {
      const days = RD.domesticTravelDays(place, a.actionId.slice('travel:'.length));
      assert.ok(days >= 1); assert.equal(spent, days * 1440, '路程按天计');
      assert.equal(s.角色.位置.locationId, 'lyl.location.luoyang'); assert.equal(s.角色.位置.描述, '汉·洛都');
    } else assert.equal(spent, N.story.actionTime.minutes.moment);
    r.worldTurn++; s = R.advanceScenarioRuntime(s).saveData;
  }
  const ids = seen.map(x => x.eventId);
  const at08 = seen.findIndex(x => x.eventId === 'lyl.event.taiquan_afterfall_08_beat');
  assert.ok(seen[at08].travel, '08 第一步是去洛都');
  for (const x of seen.slice(0, at08)) assert.equal(x.place, 'liuchao.location.wudu', `${x.eventId} 在舞都完成（原著 #150–#155 都在舞都）`);
  assert.ok(ids.indexOf('lyl.event.taiquan_afterfall_07_beat') < ids.indexOf('lyl.event.han_wudu_bingsi'));
  assert.match(read('src/components/dashboard/MainGamePanel.vue'), /startsWith\('travel:'\)\) \(options\.eventAction as Record<string, unknown>\)\.travelFromLocationId = gameStateStore\.location\?\.locationId;/);
});
test('P1-2 路程口径：同国坐标距离按 liPerDay 折天；同城、跨国、南荒行旅关、没带出发地都不改原耗时', () => {
  const c = N.crossCountryTravel;
  assert.equal(RD.domesticTravelDays('liuchao.location.wudu', 'lyl.location.luoyang'), Math.ceil(Math.hypot(6838 - 6114, 3577 - 3929) * c.domesticRepresentative.coordinateLi / c.liPerDay));
  assert.equal(RD.domesticTravelDays('liuchao.location.wudu', 'liuchao.location.wudu'), undefined);
  assert.equal(RD.domesticTravelDays('liuchao.location.wudu', 'liuchao.location.changan'), undefined, '跨国另有口径');
  const s = fixture('checkpoints/current-han-entry.json');
  const travel = { source: 'event_engine', eventId: 'lyl.event.taiquan_afterfall_08_beat', actionId: 'travel:lyl.location.luoyang' };
  assert.equal(AT.questTravelMinutes(s, { eventAction: travel }), undefined, '没带出发地');
  assert.ok(AT.questTravelMinutes(s, { eventAction: { ...travel, travelFromLocationId: 'liuchao.location.wudu' } }) >= 1440);
  rt(s).modId = 'lcq.stage_04b_lingfei_baiyi_crisis';
  assert.equal(AT.questTravelMinutes(s, { eventAction: { ...travel, travelFromLocationId: 'liuchao.location.wudu' } }), undefined, '南荒行旅关自有时钟');
  assert.ok(N.crossCountryTravel.domesticRepresentative && read('src/modules/sceneModule/numbersRegistry.ts').includes('crossCountryTravel.domesticRepresentative.coordinateLi'));
});

// 2026-11-02 总策划定：罗盘折天收窄——只用于剧情节点指定地点的长途移动（配置 story.actionTime.questRouteDays.eventIds），普通罗盘移动恢复原耗时。
test('罗盘折天收窄：唐线留仙坪→长安的普通罗盘移动恢复原耗时；汉 08 舞都→洛都仍按两地路程折天', () => {
  assert.deepEqual(N.story.actionTime.questRouteDays.eventIds, ['lyl.event.taiquan_afterfall_08_beat']);
  assert.ok(read('src/modules/sceneModule/numbersRegistry.ts').includes("path: 'story.actionTime.questRouteDays.eventIds'"));
  // 唐线：留仙坪几拍做完，罗盘给出「去长安」（lyg.event.s03_01）；两地同在唐境、路程算得出天数，但不在名单里，按原耗时（模型给的「片刻」）。
  let s = R.advanceScenarioRuntime(fixture('checkpoints/current-tang-entry.json')).saveData;
  let a;
  for (let i = 0; i < 12; i++) {
    [a] = R.getCurrentStoryEventActions(s);
    assert.ok(a, `第${i}拍有主线动作`);
    if (a.actionId.startsWith('travel:')) break;
    R.recordStoryEventStructuredAction(s, a, { judgementResolution: { status: 'resolved', outcome: 'success', kind: 'explore' } });
    rt(s).worldTurn++; s = R.advanceScenarioRuntime(s).saveData;
  }
  const from = s.角色.位置.locationId;
  assert.equal(from, 'lyg.location.liuxianping');
  assert.equal(a.actionId, 'travel:liuchao.location.changan');
  assert.ok(RD.domesticTravelDays(from, 'liuchao.location.changan') >= 1, '路程本可折天，确认是名单在挡');
  const eventAction = { ...a, travelFromLocationId: from };
  assert.equal(AT.questTravelMinutes(s, { eventAction }), undefined);
  const before = structuredClone(s.元数据.时间);
  assert.equal(R.recordStoryEventStructuredAction(s, a, { judgementResolution: { status: 'resolved', outcome: 'success', kind: 'explore' } }).attempted, true);
  AT.settleActionTime(s, { action_time: { tier: '片刻' } }, { eventAction, timeActionId: 'tang-travel' }, undefined, false, false, undefined);
  assert.equal(s.角色.位置.locationId, 'liuchao.location.changan');
  assert.equal(minutesOf(s.元数据.时间) - minutesOf(before), N.story.actionTime.minutes.moment, '恢复原耗时（片刻），不按路程折天');
  // 汉 08：舞都→洛都在名单里，仍按两地路程折天。
  const han = fixture('checkpoints/current-han-entry.json');
  const days = RD.domesticTravelDays('liuchao.location.wudu', 'lyl.location.luoyang');
  assert.ok(days >= 1);
  const han08 = { source: 'event_engine', eventId: 'lyl.event.taiquan_afterfall_08_beat', actionId: 'travel:lyl.location.luoyang', travelFromLocationId: 'liuchao.location.wudu' };
  assert.equal(AT.questTravelMinutes(han, { eventAction: han08 }), days * 1440);
  // 同一段路挂在别的节点上就不折天：名单按剧情节点，不按起讫地点。
  assert.equal(AT.questTravelMinutes(han, { eventAction: { ...han08, eventId: 'lyl.event.taiquan_afterfall_07_beat' } }), undefined);
});

test('汉 07 罗盘提示与新目标一致：在舞都打听平亭侯下狱的风波，不再写「去洛都看看」；内置关与 overlay 的 07 目标同句', () => {
  const hint = CONTENT_PACKS.texts['lineCompass.han.step.han_zhu_urge_luo_alt'];
  const step = CONTENT_PACKS.lineCompass.lines.find(l => l.lineId === 'han').steps.find(x => x.id === 'han_zhu_urge_luo_alt');
  assert.equal(step.eventId, 'lyl.event.taiquan_afterfall_07_beat');
  const builtin07 = json('src/modules/scenarioMods/builtins/data/lyl.taiquan_afterfall.json').scenario.events.find(e => e.id === 'lyl.event.taiquan_afterfall_07_beat');
  const overlay07 = json('mod-kit/canon-authority-overlays/lyl.taiquan_afterfall.json').ops
    .find(o => o.path === 'scenario.events[id=lyl.event.taiquan_afterfall_07_beat].objective');
  assert.equal(hint, builtin07.objective);
  assert.equal(hint, overlay07.to);
  assert.doesNotMatch(hint, /洛都/);
  assert.ok(!Object.values(CONTENT_PACKS.texts).includes('去洛都看看'));
  assert.ok([...hint].length <= N.story.lineCompass.hint.maxChars);
});

// ───────────── P2-3 标题「· 一阳」 ─────────────
test('P2-3 境界显示不带九阳层次：三线检查点顶栏、侧栏、角色详情、存档列表同一格式化入口；状态字段仍保留', () => {
  for (const line of ['han', 'tang', 'taiquan']) {
    const r = fixture(`checkpoints/current-${line}-entry.json`).角色.属性.境界;
    assert.equal(r.九阳层次, '一阳');
    assert.equal(realm.formatRealmWithStage(r), '内视·初期');
  }
  for (const f of ['src/components/dashboard/TopBar.vue', 'src/components/dashboard/RightSidebar.vue', 'src/components/dashboard/CharacterDetailsPanel.vue', 'src/components/character-creation/CharacterManagement.vue']) {
    assert.match(read(f), /formatRealmWithStage\(/, f); assert.doesNotMatch(read(f), /九阳层次/, f);
  }
});

// ───────────── P2-4 战斗倒下阈值 ─────────────
test('P2-4 随机遇敌里主角只在气血 ≤0 倒下：连续重击不再把主角升成「倒下」判负（复现 HP 21 判负），气血打到 0 当拍判负', async () => {
  const { instantiateRandomContract, randomContractId } = await load('modules/sceneModule/contracts/randomContract.ts');
  const scene = await load('modules/sceneModule/scene.ts');
  const wound = await load('modules/sceneModule/woundRules.ts');
  const wb = await load('modules/sceneModule/host/writeback.ts');
  const contract = instantiateRandomContract(randomContractId({ id: 't', enemyId: 'lcq.enemy.guiwang_warrior', count: 1, level: 3 }));
  const action = contract.enemyActions.find(a => a.party === 'foe_1');
  const crits = flag => {
    const prev = N.combat.woundRules.hp.randomPlayerDownedByHpOnly;
    N.combat.woundRules.hp.randomPlayerDownedByHpOnly = flag;
    try {
      const { state } = scene.beginScene(contract, { seed: 1 });
      for (let beat = 1; beat <= 4; beat++) { state.beat = beat; wound.applyWoundRule(state, contract, undefined, 'pc', action, 'great_success'); }
      return state;
    } finally { N.combat.woundRules.hp.randomPlayerDownedByHpOnly = prev; }
  };
  const old = crits(false);
  assert.ok(old.statuses.pc.some(x => x.id === 'incapacitated'), '复现：连续重击沿升级链升到「倒下」');
  assert.equal(scene.isLost(contract, old), true, '复现：气血还剩多少都判负（真机 HP 21）');
  assert.equal(N.combat.woundRules.hp.randomPlayerDownedByHpOnly, true);
  const now = crits(true);
  assert.deepEqual(now.statuses.pc.map(x => x.id), ['wound.external.heavy'], '停在外伤（重）');
  assert.equal(scene.isLost(contract, now), false);
  assert.ok(now.hpLoss.pc > 0, '重击照常扣气血');
  const save = { 角色: { 属性: { 气血: { 当前: 21, 上限: 100 } } } };
  now.hpLoss = { pc: 0.2 }; wb.applySceneHpLoss(save, contract, now);
  assert.equal(save.角色.属性.气血.当前, 1); assert.equal(scene.isLost(contract, now), false, '气血 1 不倒下，不保底也不提前判负');
  now.hpLoss = { pc: 0.1 }; wb.applySceneHpLoss(save, contract, now);
  assert.equal(save.角色.属性.气血.当前, 0); assert.equal(scene.settleDownedAfterHostSync(contract, now), true, '打到 0 当拍判负');
  // 敌方（非主角）照旧可被状态打倒。
  const { state: foe } = scene.beginScene(contract, { seed: 2 });
  const hit = { ...action, party: 'pc', id: 'pc_attack' };
  for (let beat = 1; beat <= 4; beat++) { foe.beat = beat; wound.applyWoundRule(foe, contract, undefined, 'foe_1', hit, 'great_success'); }
  assert.ok(foe.statuses.foe_1.some(x => x.id === 'incapacitated'));
  assert.ok(read('src/modules/sceneModule/numbersRegistry.ts').includes("'combat.woundRules.hp.randomPlayerDownedByHpOnly'"));
});

// ───────────── P2-5 路径记录中文 ─────────────
test('P2-5 认知与路径面板：唐线检查点全部条目不含英文原始键／英文维度', () => {
  const s = fixture('checkpoints/current-tang-entry.json'), r = rt(s);
  const facts = Object.values(r.playerKnowledge || {}), paths = Object.values(r.pathReceipts || {});
  assert.ok(facts.length && paths.length);
  for (const f of facts) for (const text of [V.ledgerKnowledgeClaim(r, f), V.ledgerKnowledgeSource(r, f)]) assert.doesNotMatch(text, /[A-Za-z]/, text);
  for (const p of paths) for (const text of [V.ledgerPathLabel(p), V.ledgerPathDimension(p.dimension)]) assert.doesNotMatch(text, /[A-Za-z]/, text);
  const runtime = { events: [{ id: 'lyg.event.s01_09', name: '入长安' }] };
  assert.equal(V.ledgerKnowledgeClaim(runtime, { subjectId: 'lyg.event.s01_09', predicate: 'occurred' }), '你已知晓入长安');
  assert.equal(V.ledgerKnowledgeClaim({}, { subjectId: 'lyg.event.s01_09', predicate: 'occurred' }), '已记录一条线索（原记录缺少名称）');
  assert.equal(V.ledgerPathDimension('method'), '做法'); assert.equal(V.ledgerPathDimension('weird_key'), '剧情分支');
  const panel = read('src/components/dashboard/components/EpistemicLedgerPanel.vue');
  assert.match(panel, /ledgerKnowledgeClaim\(props\.runtime, fact\)/); assert.match(panel, /ledgerPathDimension\(receipt\.dimension\)/);
  assert.doesNotMatch(panel, /旧记录/);
});

// ───────────── P2-6 地图标头 ─────────────
test('P2-6 地图标头：人在唐·留仙坪时写「唐·留仙坪」，不留长安／太真简介；回到长安才显示该简介；非剧本档原样', () => {
  const s = fixture('checkpoints/current-tang-entry.json'), info = s.世界.信息;
  assert.equal(info.世界名称, '六朝·唐国长安'); assert.match(info.世界背景, /太真/);
  assert.deepEqual(M.mapHeaderInfo(info, s.角色.位置, true), { name: '唐·留仙坪', background: '' });
  assert.deepEqual(M.mapHeaderInfo(info, { locationId: 'liuchao.location.changan', 描述: '唐·长安' }, true), { name: '唐·长安', background: info.世界背景 });
  assert.deepEqual(M.mapHeaderInfo(info, s.角色.位置, false), { name: info.世界名称, background: info.世界背景 });
  const panel = read('src/components/dashboard/GameMapPanel.vue');
  assert.match(panel, /mapHeaderInfo\(activeWorldInfo\.value, gameStateStore\.location, scenarioMapLocked\.value\)/);
});

// ───────────── P2-7 点名缺物不耗时 ─────────────
test('P2-7 点名要池里没有的物品被拒：游戏时间不推进；照常搜到东西的回合仍按耗时推进', () => {
  const s = fixture('playtest-5e8f/cp03-dragon-corpse.json'), before = structuredClone(s.元数据.时间);
  assert.equal(L.isLocationLootInput('取出发青光的硬物收进背包'), true);
  const loot = L.settleLocationLoot(s);
  assert.equal(loot.receipt.missingName, '发青光的硬物');
  assert.equal(AT.settleActionTime(s, { localLoot: true }, { timeActionId: 'loot-miss' }, undefined, false, false, before), null);
  assert.deepEqual(s.元数据.时间, before);
  rt(s).worldTurn++;
  assert.equal(L.isLocationLootInput('从龙神尸身上取一枚龙牙收进背包'), true);
  assert.equal(L.settleLocationLoot(s).receipt.drops.length, 1);
  assert.ok(AT.settleActionTime(s, { localLoot: true }, { timeActionId: 'loot-hit' }, undefined, false, false, before));
  assert.ok(minutesOf(s.元数据.时间) > minutesOf(before));
});

// ───────────── P2-8 五原 s02_04 ─────────────
test('P2-8 五原：s02_04 由点心铺的应对动作完成；点心铺首条建议是应对而不是「前往」，跟首条建议走两回合内进入 s02_05', () => {
  let s = R.advanceScenarioRuntime(fixture('checkpoints/current-prologue-before-s02_04.json')).saveData;
  assert.deepEqual(rt(s).activeEventIds, ['lcq.event.s02_04']);
  assert.match(s.角色.位置.描述, /点心铺/);
  const first = W.getWuyuanOpenWorldSelections(s);
  assert.equal(first[0].kind, 'problem_action', '首条是应对');
  assert.ok(first.some(x => x.kind === 'travel'), '前往仍在，只是排后');
  // 从市集起步也只差一步：市集首条是去点心铺。
  const market = structuredClone(s);
  W.settleWuyuanOpenWorldSelection(market, first.find(x => x.kind === 'travel'));
  assert.match(market.角色.位置.描述, /市集/);
  const marketFirst = W.getWuyuanOpenWorldSelections(market)[0];
  assert.equal(marketFirst.kind, 'travel'); assert.match(marketFirst.label, /点心铺/);
  for (let i = 0; i < 2 && !rt(s).completedEventIds.includes('lcq.event.s02_04'); i++) {
    assert.equal(W.settleWuyuanOpenWorldSelection(s, W.getWuyuanOpenWorldSelections(s)[0]).settled, true);
    rt(s).worldTurn++; s = R.advanceScenarioRuntime(s).saveData;
  }
  assert.ok(rt(s).completedEventIds.includes('lcq.event.s02_04'));
  assert.ok(rt(s).activeEventIds.includes('lcq.event.s02_05'));
});

// ───────────── 稀有遇见通用化 ─────────────
const tangSave = () => {
  const s = fixture('checkpoints/current-tang-entry.json');
  s.角色.属性.气血 = { 当前: 40, 上限: 100 };
  return s;
};
const tangEntry = () => ({ ...structuredClone(RE.rareEncounterEntry('nanhuang.white_tail_leopard')), id: 'tang.test_crane', region: 'tang',
  locations: [{ key: 'lyg.location.liuxianping' }], chance: 0, durationTurns: 2, stateKey: undefined, buffSource: undefined });
test('稀有遇见：配置表登记白尾豹一条（地区／几率／效果／回合数），numbers 体检与 registry 都登记；旧 leopardConfig 投影一致', () => {
  const cfg = N.encounter.rareEncounters;
  assert.equal(cfg.legacyLeopardEntryId, 'nanhuang.white_tail_leopard');
  const e = cfg.entries.find(x => x.id === 'nanhuang.white_tail_leopard');
  assert.equal(e.region, 'nanhuang'); assert.equal(e.chance, 0.03); assert.equal(e.durationTurns, 5);
  assert.deepEqual(e.effect, { staminaRestoreRatio: 0.3, buff: { statusId: 'buff.shanshen_blessing', name: '山神庇佑' } });
  assert.equal(N.encounter.easterEggs, undefined, '旧配置段已并入稀有遇见表');
  const old = WL.leopardConfig();
  assert.deepEqual({ chance: old.chance, ratio: old.staminaRestoreRatio, buff: old.buff }, { chance: 0.03, ratio: 0.3, buff: { statusId: 'buff.shanshen_blessing', name: '山神庇佑', durationTurns: 5 } });
  assert.equal(WL.BUFF_SOURCE, 'easterEgg:whiteTailLeopard', '旧存档来源标记不变');
  const reg = read('src/modules/sceneModule/numbersRegistry.ts');
  for (const path of ['encounter.rareEncounters', 'encounter.rareEncounters.entries', 'encounter.rareEncounters.legacyLeopardEntryId', 'e2eSmoke.rareEncounters.paramPrefix', 'e2eSmoke.rareEncounters.chanceMulParam']) assert.ok(reg.includes(`'${path}'`), path);
  assert.deepEqual(json('mod-kit/game-numbers.qingyu.json').encounter.rareEncounters, cfg, '合并视图已重新生成');
});
test('稀有遇见：别国加一条即可用——唐·留仙坪一条按参数覆盖触发，回复体力、挂增益、状态写 rareEncounters[id]，到期摘除', () => {
  const entry = tangEntry(), cfg = { ...N.encounter.rareEncounters, entries: [entry] };
  const s = tangSave(), turn = rt(s).worldTurn;
  withEnv({}, () => {
    assert.equal(RE.tickRareEncounters(s, undefined, cfg).text, '', '几率 0 不触发');
    rt(s).worldTurn++;
    const hit = RE.tickRareEncounters(s, { rare: { 'tang.test_crane': 1 } }, cfg);
    assert.ok(hit.text);
  });
  const state = rt(s).rareEncounters['tang.test_crane'];
  assert.equal(state.buffUntilTurn, turn + 1 + entry.durationTurns);
  assert.equal(s.角色.属性.气血.当前, 70);
  assert.ok(s.角色.效果.some(x => x.来源 === 'rareEncounter:tang.test_crane' && x.状态名称 === '山神庇佑'));
  assert.equal(rt(s).whiteTailLeopard, undefined, '不写白尾豹字段');
  rt(s).worldTurn = state.buffUntilTurn;
  assert.equal(RE.expireRareEncounters(s, cfg), true);
  assert.ok(!s.角色.效果.some(x => x.来源 === 'rareEncounter:tang.test_crane'));
});
test('稀有遇见几率：URL xiantu.test.rare.<id> 定值、xiantu.test.rareChanceMul 总倍率；函数参数优先；旧 leopardChance 只映射到白尾豹，rare.<id> 优先', () => {
  const p = N.e2eSmoke.rareEncounters, leo = RE.rareEncounterEntry('nanhuang.white_tail_leopard'), crane = tangEntry();
  const cfg = { ...N.encounter.rareEncounters, entries: [leo, { ...crane, chance: 0.1 }] };
  assert.equal(p.paramPrefix, 'xiantu.test.rare.'); assert.equal(p.chanceMulParam, 'xiantu.test.rareChanceMul');
  withEnv({ search: `?${p.paramPrefix}${leo.id}=1` }, store => {
    assert.equal(RE.rareEncounterChance(leo, undefined, cfg), 1);
    assert.equal(store[`${p.paramPrefix}${leo.id}`], '1', '写进会话，刷新后仍生效');
  });
  withEnv({ search: `?${p.chanceMulParam}=2` }, () => {
    assert.equal(RE.rareEncounterChance(leo, undefined, cfg), 0.06);
    assert.equal(RE.rareEncounterChance(cfg.entries[1], undefined, cfg), 0.2);
  });
  withEnv({ search: `?${p.chanceMulParam}=100` }, () => assert.equal(RE.rareEncounterChance(leo, undefined, cfg), 1, '夹 0..1'));
  withEnv({ search: `?${N.e2eSmoke.nanhuangEncounters.overrideParams.leopardChance}=0.5` }, () => {
    assert.equal(RE.rareEncounterChance(leo, undefined, cfg), 0.5, '旧参数映射到白尾豹');
    assert.equal(RE.rareEncounterChance(cfg.entries[1], undefined, cfg), 0.1, '不影响别条');
  });
  withEnv({ search: `?${p.paramPrefix}${leo.id}=0.2&${N.e2eSmoke.nanhuangEncounters.overrideParams.leopardChance}=0.9` }, () => assert.equal(RE.rareEncounterChance(leo, undefined, cfg), 0.2));
  withEnv({ search: `?${p.paramPrefix}${leo.id}=1` }, () => {
    assert.equal(RE.rareEncounterChance(leo, { rare: { [leo.id]: 0 } }, cfg), 0, '函数参数优先于 URL');
    assert.equal(RE.rareEncounterChance(leo, { leopardChance: 0.3, rareChanceMul: 2 }, cfg), 0.6);
  });
  withEnv({}, () => assert.equal(RE.rareEncounterChance(leo, undefined, cfg), leo.chance, '都不给原样'));
});
test('稀有遇见接线：回合收尾走 tickRareEncounters，场面每拍／收场走 expireRareEncounters；白尾豹旧接口仍在', () => {
  assert.match(read('src/components/dashboard/MainGamePanel.vue'), /const rare = tickRareEncounters\(s\);/);
  const controller = read('src/modules/sceneModule/host/controller.ts');
  assert.equal((controller.match(/expireRareEncounters\(/g) || []).length, 4);
  assert.doesNotMatch(controller, /expireWhiteTailLeopard/);
  for (const fn of ['tickWhiteTailLeopard', 'expireWhiteTailLeopard', 'leopardConfig', 'leopardCompanionLine']) assert.equal(typeof WL[fn], 'function', fn);
});
