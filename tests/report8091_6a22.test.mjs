import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import { createPinia, setActivePinia } from 'pinia';
import ts from 'typescript';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const json = p => JSON.parse(read(p));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: {
  '@': fileURLToPath(new URL('../src', import.meta.url)),
  './characterStore': fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts', import.meta.url)),
  '@/stores/characterStore': fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts', import.meta.url)),
} });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const load = p => jiti.import(new URL('../src/' + p, import.meta.url).pathname);
const L = await load('modules/scenarioMods/locationLoot.ts');
const R = await load('modules/scenarioMods/runtime.ts');
const M = await load('modules/scenarioMods/travel/mapTravel.ts');
const V = await load('modules/scenarioMods/eventNarrativeView.ts');
const E = await load('modules/scenarioMods/randomEncounter.ts');
const { GAME_NUMBERS: N } = await load('modules/sceneModule/numbers.ts');
const { CONTENT_PACKS } = await load('modules/contentPacks/index.ts');
const rt = s => s.世界.状态.剧本模组;
const fixture = name => json('tests/fixtures/' + name).saves[0].存档数据;
const cp03 = () => fixture('playtest-5e8f/cp03-dragon-corpse.json');
const ai = read('src/utils/AIBidirectionalSystem.ts');
const main = read('src/components/dashboard/MainGamePanel.vue');
function cut(source, from, to, args, tail = '') {
  const start = source.indexOf(from), end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, from);
  return new Function(...args, ts.transpileModule(source.slice(start, end) + tail, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText);
}
const pre = cut(ai, '      const lootLocal = ', '      const legacyNarrativePilotResponse', ['saveData','options','userMessage','cloneDeep','isLocationLootInput','settleLocationLoot'], '\nreturn lootLocalText;');
const commit = cut(ai, '    if ((response.moduleReceipt || response.localLoot)', '    const openWorldProgress', ['saveData','options','response','changes','isLocationLootInput','settleLocationLoot']);
function lootTurn(s, input) {
  const options = { playerIntentText: input, judgementResolution: { status: 'resolved', outcome: 'failure', kind: 'explore' } };
  const before = structuredClone(s);
  const text = pre(s, options, input, structuredClone, L.isLocationLootInput, L.settleLocationLoot);
  assert.deepEqual(s, before);
  assert.ok(text, '冻结原链路必须截到本地搜刮，不交给 AI 虚构入包');
  commit(s, options, { text, localLoot: true }, [], L.isLocationLootInput, L.settleLocationLoot);
  assert.equal(text, L.lootReceiptText(rt(s).locationLoot.receipts.at(-1)));
  return text;
}
test('P1-1 原链路 CP03 点名缺物：只拒绝、23件不变、次数不变、同拍重放不双发', () => {
  for (const input of ['取出发青光的硬物收进背包', '搜查尸身，取出发青光的硬物收进背包']) {
    const s = cp03(), before = structuredClone(s.角色.背包), searches = structuredClone(rt(s).locationLoot?.searches || {});
    const text = lootTurn(s, input);
    assert.equal(text, N.loot.texts.namedMissing.replace('{name}', '发青光的硬物'));
    assert.deepEqual(s.角色.背包, before);
    assert.deepEqual(rt(s).locationLoot.searches, searches);
    assert.deepEqual(rt(s).locationLoot.receipts.at(-1).drops, []);
    const once = structuredClone(s); assert.equal(lootTurn(s, input), text); assert.deepEqual(s, once);
  }
});
test('P1-2 原链路缺物下一拍从尸身取一枚龙牙：实际 +1、回执同名同量、无 AI 叙事入包', () => {
  const s = cp03(); lootTurn(s, '取出发青光的硬物收进背包'); rt(s).worldTurn++;
  const id = rt(s).canon.items.find(i => i.name === '龙牙').id;
  const n = s.角色.背包.物品[id]?.数量 || 0;
  const text = lootTurn(s, '从龙神尸身上取一枚龙牙收进背包');
  assert.equal(s.角色.背包.物品[id].数量, n + 1);
  assert.match(text, /龙牙×1/); assert.equal(rt(s).locationLoot.receipts.at(-1).drops.length, 1);
  assert.equal(rt(s).locationLoot.searches['liuchao.location.gui_wang_dong'], 1);
  for (const input of ['不要从龙神尸身上取一枚龙牙收进背包', '取出怀里的玉佩收进背包', '从背包里取一枚龙牙']) assert.equal(L.isLocationLootInput(input), false, input);
});
async function gameStore(s) {
  setActivePinia(createPinia());
  const { useGameStateStore } = await load('stores/gameStateStore.ts');
  const store = useGameStateStore(); store.loadFromSaveData(s); return store;
}
function engineOptions(store) {
  return cut(main, 'const scenarioEngineActionOptions = computed', '// 重要桥段推进卡片',
    ['computed','isAIProcessing','currentScene','gameStateStore','advanceScenarioRuntime','scenarioGameOver','getWuyuanOpenWorldSelections','getBaihuGambleRefusalSelections','getCurrentStoryEventActions','getCurrentStoryExplorationActions','getTrackedStoryOpportunityActions','storyActionPresentation'], '\nreturn scenarioEngineActionOptions.value;')(
      fn => ({ value: fn() }), {value:false}, {value:null}, store, R.advanceScenarioRuntime, {value:false}, ()=>[], ()=>[], R.getCurrentStoryEventActions, R.getCurrentStoryExplorationActions, R.getTrackedStoryOpportunityActions, V.storyActionPresentation);
}
function narrative(store, actions) {
  return cut(main, 'const currentNarrative = computed', '// 绘图相关逻辑', ['computed','gameStateStore','formatCurrentTime','getStageEntryPresentation','scenarioEngineActionOptions','engineOptionLine','stripActionOptionMetaWords','stripNarrativeMetaWords'], '\nreturn currentNarrative.value;')(
    fn => ({ value: fn() }), store, ()=>'time', R.getStageEntryPresentation, {value:actions}, a=>a.playerLine, x=>x, x=>x);
}
function qinReady() {
  let s = fixture('checkpoints/current-tang-entry.json');
  // 夹具是清羽试玩派生档，真实秦入口要求正式档且三线收束。仅为入口前置置备，抵达后不手工 advance。
  delete s.系统.扩展.清羽记开局;
  rt(s).completedEventIds.push(...['nanhuang','jin','song'].map(id => CONTENT_PACKS.lineCompass.lines.find(l=>l.lineId===id).closedWhen[0].path.slice(5)));
  return R.advanceScenarioRuntime(s).saveData;
}
test('P1-3 地图双击确认→真实 store load/save→MainGamePanel computed：秦首拍行动建议非空', async () => {
  const store = await gameStore(qinReady());
  const map = read('src/components/dashboard/GameMapPanel.vue');
  const fn = cut(map, 'const travelToSelectedLocation = async', 'const canvasRef', ['gameStateStore','mapTravelBusy','mapTravelUi','selectedLocation','mapTravelPreview','mapTravelNotice','mapTravelConfirmed','travelConfirmation','selectMapTravel','settleMapTravel','mapTravelArrivalNotice','stageDepartureArrived'], '\nreturn travelToSelectedLocation;');
  const confirm={value:null}, busy={value:false};
  const BP = await load('modules/scenarioMods/beatProgress.ts');
  const go = fn(store,busy,{isAIProcessing:false},{value:{id:'liuchao.location.xianyang'}},M.mapTravelPreview,{value:''},M.mapTravelConfirmed,confirm,M.selectMapTravel,M.settleMapTravel,M.mapTravelArrivalNotice,BP.stageDepartureArrived);
  await go(); assert.ok(confirm.value); await go();
  const saved=store.toSaveData(); assert.equal(saved.角色.位置.描述,'秦·咸阳');
  assert.deepEqual(R.getCurrentStoryEventActions(saved).map(a=>a.eventId),['liuchao.event.qin_enter_xianyang']);
  const actions=engineOptions(store); assert.ok(actions.some(a=>a.eventId==='liuchao.event.qin_enter_xianyang'));
  const shown=narrative(store,actions); assert.equal(shown.type,'stage_entry'); assert.ok(shown.actionOptions.length); assert.match(shown.actionOptions.join(''),/咸阳/);
});
test('P2-1 确认前预览使用咸阳配置文本，零副作用，不显示唐关长安背景', () => {
  const s=qinReady(), before=structuredClone(s), preview=M.mapTravelPreview(s,'liuchao.location.xianyang');
  assert.match(preview.description,/咸阳/); assert.doesNotMatch(preview.description,/长安|太真|杨玉环/); assert.deepEqual(s,before);
  assert.match(read('src/components/dashboard/GameMapPanel.vue'), /selectedTravelPreview\?\.description \|\| selectedLocation.description/);
});
test('P2-2 审核异常穿过冻结 catch 占位返回后，真实 UI 校验分支显示审核提示且不重试', async () => {
  const A=await load('services/apiErrorMessage.ts');
  const log=await load('modules/diagnostics/log.ts');
  const raw=Object.assign(new Error('API错误 422: new_sensitive(1026)'),{status:422});
  // 原 catch 尾部含 }，补上函数内部 try/catch 入口，避免重写冻结逻辑。
  const start=ai.indexOf("      console.error('[AI双向系统] AI生成失败:'");assert.ok(start>0);
  const body=ai.slice(start, ai.indexOf('    // 不能让',start));
  const run=new Function('error','logEvent','isAiRequestTimeout','PlayerAgencyViolationError','usesFixedScenarioInventory','hasTrustedLocalContract','shouldSettleLocalContractAfterGenerationFailure','summarizeError',ts.transpileModule('let gmResponse, generationFailed=false; const moduleOnly=false,saveData={},options={},actionOptionsEnabled=true; try { throw error; } catch(error) {\n'+body+'\nreturn gmResponse;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText);
  const captured=await A.captureAIResponseError(async()=>run(A.toUserFacingAIError(raw),()=>{},()=>false,class AgencyError extends Error{},()=>true,()=>false,()=>false,e=>({message:e.message})));
  assert.equal(captured.response.text,'（AI生成失败）');
  const notices=[];
  const validate=cut(main.slice(main.indexOf('const captured = await captureAIResponseError')), '        const validation = validateProcessedAIResponse(aiResponse);','          const saveForRetry =', ['aiResponse','validateProcessedAIResponse','captured','toast','console'], '\n}\nreturn aiResponse;');
  assert.equal(validate(captured.response,()=>({isValid:false,errors:[]}),captured,{warning:t=>notices.push(t)},{warn(){}}),undefined);
  assert.match(notices[0],/LCQ-NET-012/); assert.match(notices[0],/没有推进/); assert.doesNotMatch(notices[0],/格式/);
  const later=await A.captureAIResponseError(async()=>({text:'other failure'}));assert.equal(later.error,undefined);
  const a=log.logEvent({code:'LCQ-NET-014',echo:false,detail:{settledLocally:false}}), b=log.logEvent({code:'LCQ-NET-014',echo:false,detail:{settledLocally:true}});
  assert.match(a.msg,/未本地结算/);assert.match(b.msg,/已用本地安全正文结算/);
  assert.equal(log.logEvent({code:'LCQ-NET-016',echo:false}).code,'LCQ-NET-016');
  // AIBS 冻结不改：其 console.error 由 consolePatch→logConsole 按前缀认领为 NET-016，不再落 SYS-000。
  assert.equal(log.logConsole('error',['[AI双向系统] AI生成失败:','x',new Error('x')]).code,'LCQ-NET-016');
  assert.equal(log.logConsole('error',['随便一条']).code,'LCQ-SYS-000');
  const {CONSOLE_PREFIX_CODES}=await load('modules/diagnostics/codes.ts');
  assert.equal(CONSOLE_PREFIX_CODES['[AI双向系统] AI生成失败'],'LCQ-NET-016');
  assert.ok(ai.includes("console.error('[AI双向系统] AI生成失败:'"),'AIBS 未改');
});
test('P2-3 sessionStorage 开关+真实 UI 回合末路径：05b 模块寻兽不再永远停在预兆，四拍后可开战', async () => {
  const init=await load('modules/scenarioMods/strictInitializer.ts'), repair=await load('utils/dataRepair.ts');
  let s=R.advanceScenarioRuntime(init.applyStrictScenarioInitializationToSave(repair.createMinimalSaveDataV3(),init.buildStrictScenarioInitialization(json('src/modules/scenarioMods/builtins/data/lcq.stage_05b.json')))).saveData;
  s.角色.位置={locationId:'lcq.location.giant_vine',描述:'南荒·万古巨藤'};
  const previous=globalThis.sessionStorage; globalThis.sessionStorage={getItem:key=>key===N.e2eSmoke.nanhuangEncounters.flag?'on':null};
  try {
    assert.equal(E.encounterGate(s),null);assert.equal(E.nanhuangTestRates().encounterChance,1);
    const store=await gameStore(s);
    const tick=cut(main,'const tickEncounterAfterTurn = async','// 🔥 使用全局状态', ['gameStateStore','flushTimeSkipInterlude','tickEncounterAfterNarration','tickRareEncounters','persistJudgementSave','logError'], '\nreturn tickEncounterAfterTurn;')(store,()=>'',E.tickEncounterAfterNarration,()=>({changed:false}),async next=>store.loadFromSaveData(next),(_code,e)=>{throw e;});
    for(let i=0;i<4;i++) {
      s=store.toSaveData();rt(s).worldTurn++;
      s.系统.历史.叙事.push({type:'narrative',content:'我主动寻兽，循踪探查。',actionOptions:[]});
      s.社交.记忆.短期记忆.push('我主动寻兽，循踪探查。');store.loadFromSaveData(s);
      await tick({moduleReceipt:{path:'modular'}});
    }
    s=store.toSaveData();assert.ok(E.pendingRandomBattle(s));assert.equal(rt(s).encounter.receipts.at(-1).chance,1);
    assert.ok(s.系统.历史.叙事.some(n=>n.content.includes('新鲜的踪迹')));assert.match(s.系统.历史.叙事.at(-1).content,/尚未交手/);
    const once=structuredClone(s);E.tickEncounterAfterNarration(s,'modular');assert.deepEqual(s,once);
    assert.equal(E.encounterGate(cp03()),'no_zone','CP03 战后窗口已关，开关不越过剧情门禁');
    s.角色.位置={locationId:'lcq.location.huamiao_village',描述:'南荒·花苗寨'};assert.equal(E.encounterGate(s),'village');
  } finally {globalThis.sessionStorage=previous;}
});
test('P2-4 汉线实际建议与罗盘承接已在舞都；三份检查点读档与原链路 repair 后保留九阳层次状态（标题不显示，见 report8091_f76e ③）',async()=>{
  const repair=await load('utils/dataRepair.ts'), realm=await load('utils/realmUtils.ts');
  for(const line of ['han','tang','taiquan']) {
    const s=fixture(`checkpoints/current-${line}-entry.json`), store=await gameStore(s);
    const before=realm.formatRealmWithStage(store.attributes.境界);assert.equal(store.attributes.境界.九阳层次,'一阳');
    // processGmResponse 2621-2623 的原调用：修复后克隆，再 load。从修复起点验证字段不丢。
    const restored=repair.repairSaveData(store.toSaveData());store.loadFromSaveData(structuredClone(restored));
    assert.equal(store.attributes.境界.九阳层次,'一阳');assert.equal(realm.formatRealmWithStage(store.attributes.境界),before);
    if(line==='han') {
      const options=engineOptions(store);assert.ok(options.length);assert.doesNotMatch(options.map(a=>a.label).join(''),/赶往舞都|下首阳/);
      assert.match(options[0].label,/在舞都/);
      const state=rt(store.toSaveData()), event=state.events.find(e=>e.id==='lyl.event.han_shouyang_gaoyanei');
      assert.doesNotMatch(V.formatQuestCompass(event,state,s.角色.位置.locationId),/赶往舞都|下首阳/);
    }
  }
});
