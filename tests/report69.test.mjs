import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { loadTs } from './loadTs.mjs';
const read = p => readFileSync(new URL('../'+p,import.meta.url),'utf8');
const U = await loadTs('../src/utils/uuid.ts');
const P = await loadTs('../src/modules/scenarioMods/travel/mapTravel.ts');
const T = await loadTs('../src/modules/scenarioMods/actionTime.ts');
const clock = await loadTs('../src/utils/time.ts');
const F = await loadTs('../src/utils/saveLoadFallback.ts');
const E = await loadTs('../src/modules/scenarioMods/entitySaveFormat.ts');
const config = JSON.parse(read('mod-kit/numbers-runtime.json')).crossCountryTravel;
const locations = JSON.parse(read('mod-kit/entity-catalog/locations.json'));
const saveAt=id=>({元数据:{版本号:3,时间:{年:220,月:1,日:1,小时:0,分钟:0}},角色:{位置:{locationId:id}},系统:{扩展:{}},世界:{状态:{剧本模组:{worldTurn:1,completedEventIds:[]}}}});
for(const mode of ['native','getRandomValues','Math.random'])test(`1 UUID ${mode}生成唯一v4，地图select不抛`,()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto'), original=globalThis.crypto;
 const crypto=mode==='native'?original:mode==='getRandomValues'?{getRandomValues:original.getRandomValues.bind(original)}:undefined;
 try {Object.defineProperty(globalThis,'crypto',{configurable:true,value:crypto}); const ids=Array.from({length:1000},()=>U.randomUUID());assert.equal(new Set(ids).size,1000);for(const id of ids)assert.match(id,/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);assert.ok(P.selectMapTravel(saveAt(config.capitals.晋),config.capitals.宋));}
 finally {Object.defineProperty(globalThis,'crypto',descriptor);}
});
test('4 草原→五原国内代表点按坐标80里每日且至少1日结算',()=>{
 const s=saveAt('lcq.location.grassland'),from=locations.entries.find(e=>e.id==='lcq.location.grassland').definition.coordinates,to=locations.entries.find(e=>e.id===config.capitals.中立边陲).definition.coordinates;
 const route=P.mapRoutes(s,config.capitals.中立边陲)[0],expected=Math.max(config.domesticRepresentative.minDays,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)*config.domesticRepresentative.coordinateLi/config.liPerDay));
 assert.equal(route.dayCost,expected);const before=clock.gameTimeMinutes(s.元数据.时间);assert.equal(P.settleMapTravel(s,P.selectMapTravel(s,route.toId)),true);assert.equal(clock.gameTimeMinutes(s.元数据.时间)-before,expected*1440);assert.deepEqual(P.mapRoutes(s,route.toId),[]);
});
test('5 地图预览纯函数显示32日；取消/首次/过期确认不可提交',()=>{
 const s=saveAt(config.capitals.宋),before=structuredClone(s),p=P.mapTravelPreview(s,'liuchao.location.jiangzhou');assert.equal(p.label,'约32日路程');assert.deepEqual(s,before);assert.equal(P.mapTravelConfirmed(p,null),false);assert.equal(P.mapTravelConfirmed(p,p.key),true);assert.equal(P.mapTravelConfirmed(P.mapTravelPreview(s,config.capitals.唐),p.key),false);assert.equal(P.mapTravelConfirmed(undefined,p.key),false);
 const vue=read('src/components/dashboard/GameMapPanel.vue');assert.ok(vue.indexOf('if (!mapTravelConfirmed')<vue.indexOf('settleMapTravel(save, selection)'));assert.match(vue,/@click="travelConfirmation = null"/);
});
test('6 打字跨国展示系统提示，否定/国内不提示',()=>{
 const s=saveAt(config.capitals.晋);assert.equal(P.mapPreparationNotice(s,'我想收拾行装，动身前往宋国临安。'),'跨国出行请打开世界地图选择目的地');assert.equal(P.mapPreparationNotice(s,'不去宋国'),undefined);assert.equal(P.mapPreparationNotice(s,'去建康'),undefined);assert.match(read('src/components/dashboard/MainGamePanel.vue'),/v-if="crossCountryNotice" role="status"/);
});
test('7 功法倍率正负号与零值',async()=>{const {formatCultivationSpeedBonus:f}=await loadTs('../src/utils/cultivationSpeedCalculator.ts');assert.equal(f(.56),'-44%');assert.equal(f(1.44),'+44%');assert.equal(f(1),'+0%');assert.equal(f(.999999),'+0%');});
test('3 江州/晴州总表及全部阶段变体字段一致',()=>{
 for(const [id,country]of [['liuchao.location.jiangzhou','晋'],['liuchao.location.qingzhou','宋']]){const e=locations.entries.find(e=>e.id===id);for(const v of [e.definition,...Object.values(e.stageVariants||{})]){assert.equal(v.country,country);if(v.region)assert.equal(v.region,country+'国');assert.doesNotMatch(v.description||'',/宋国边境重要城市/);}}
});
// Execute the real loadGame function with boundary spies, without importing browser/API configuration stores.
function loadHarness(data, overrides={}) {
 const source=read('src/stores/characterStore.ts');const start=source.indexOf('  const loadGame = async');const end=source.indexOf('\n  const saveActiveCharacterToStorage',start);const raw=source.slice(start,end);const js=ts.transpileModule(raw,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 const calls=[];const noop=()=>{};const slot={存档数据:data};const ui={startLoading:noop,updateLoadingText:noop,stopLoading:noop,showDetailModal:({props})=>props.onConfirm(),hideDetailModal:noop};
 const deps={cloneDeep:structuredClone,debug:{log:noop,error:noop,warn:noop},toast:{error:noop,info:noop,success:noop},useUIStore:()=>ui,rootState:{value:{角色列表:{c:{模式:'单机',存档列表:{a:slot}}},当前激活存档:{角色ID:'previous',存档槽位:'old'}}},getOnlineSaveSlot:()=>null,assertEntitySaveFormat:E.assertEntitySaveFormat,rejectFutureSaveVersion:F.rejectFutureSaveVersion,detectLegacySaveData:()=>({needsMigration:false}),validateLoadedSave:async()=>({status:'ok',data}),loadSaveWithFallback:async()=>{throw Error('parse');},applyLoadRepairs:noop,clearAllCharacterData:async()=>{},shouldReattachLandingPlaytestWorkingCopy:()=>false,packPlaytestWorkingSlot:()=>null,checkpointWorkingCopy:()=>null,useGameStateStore:()=>({loadFromSaveData:()=>{throw Error('late rejection');}}),isTavernEnv:()=>false,reseedActiveSceneAfterLoad:noop,storage:{saveSaveData:()=>calls.push('write'),deleteSaveData:()=>calls.push('delete')},resetLastConversationIfForeign:()=>calls.push('reset'),commitMetadataToStorage:()=>calls.push('metadata'),...overrides};
 return {run:new Function(...Object.keys(deps),js+';return loadGame;')(...Object.values(deps)),calls,deps};
}
for(const [label,data,extra] of [
 ['旧实体档',{世界:{状态:{剧本模组:{modId:'lcq.stage_01'}}}},{}],
 ['未来版本',{元数据:{版本号:999}},{}],
 ['解析失败',null,{}],
 ['验证拒绝',{}, {validateLoadedSave:async()=>({status:'rejected'})}],
 ['末端loadFromSaveData拒绝',{},{}],
])test(`P0 ${label}不删除、不写存档、不更改激活槽`,async()=>{const h=loadHarness(data,extra);assert.equal(await h.run('c','a'),false);assert.deepEqual(h.calls,[]);assert.equal(h.deps.rootState.value.当前激活存档.角色ID,'previous');});
test('P0 滚动候选旧实体格式拒绝且不读取备用覆盖它',async()=>{let reads=0;assert.equal((await F.validateLoadedSave('c','a',{世界:{状态:{剧本模组:{modId:'lcq.stage_01'}}}},{readBackup:async()=>{reads++;return {};}})).status,'rejected');assert.equal(reads,0);});
test('2 冻结解析器复现：完整正文+仅指令JSON得到空text；独立天数结算7日正确',async()=>{
 const source=read('src/utils/AIBidirectionalSystem.ts'),start=source.indexOf('  private parseAIResponse('),end=source.indexOf('\n}\n\nexport const AIBidirectionalSystem',start);
 const extractStart=source.indexOf('  private extractNarrativeText('),extractEnd=source.indexOf('\n  }',extractStart)+4;
 const js=ts.transpileModule('class Parser {'+source.slice(extractStart,extractEnd)+source.slice(start,end)+'}',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const json=await loadTs('../src/utils/jsonExtract.ts');
 // Inject only parsing helpers; this test never calls a model.
 const Parser=new Function('stripModelThinking','parseJsonSmart','itemReferencesFromObject',js+';return Parser;')(s=>s,json.parseJsonSmart,()=>[]), parser=new Parser();parser.sanitizeActionOptionsForDisplay=x=>x;
 const sample='第七日，你缓缓收功，呼吸已深浅有别。\n```json\n{"action_time":{"tier":"数日","days":7},"tavern_commands":[],"action_options":[]}\n```';
 assert.equal(parser.parseAIResponse(sample).text,'');assert.equal(parser.extractNarrativeText(sample),'','分步正文提取同样丢弃JSON外叙事');
 const proper=parser.parseAIResponse(JSON.stringify({text:'第七日，你缓缓收功。',action_time:{tier:'数日',days:7}}));assert.ok(proper.text);
 const s=saveAt(config.capitals.晋),before=clock.gameTimeMinutes(s.元数据.时间);T.settleActionTime(s,proper,{timeActionId:'turn',cultivationSelections:[{kind:'cultivation',days:7,actionId:'seven'}]},null,false,false);assert.equal(clock.gameTimeMinutes(s.元数据.时间)-before,7*1440);
});
test('8 见段强是相关人物罗盘，并非完成条件；同国模型位置回写可复现',async()=>{
 const {buildStrictScenarioInitialization}=await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
 const {questCompassPhrases}=await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
 const {guardScenarioModCommands}=await loadTs('../src/modules/scenarioMods/canonGuard.ts');
 const stage=JSON.parse(read('src/modules/scenarioMods/builtins/data/lcq.stage_01.json'));
 const init=buildStrictScenarioInitialization(stage),rt=init.runtimeState,event=rt.events.find(e=>e.id==='lcq.event.s01_01');
 assert.ok(questCompassPhrases(event,rt,'lcq.location.grassland').includes('见段强'));
 assert.ok(event.playerCompletionContract);assert.notDeepEqual(event.completion,[{path:'narrative.见段强',operator:'eq',value:true}]);
 const s=saveAt(config.capitals.中立边陲);s.世界.状态.剧本模组=rt;
 const result=guardScenarioModCommands(s,[{action:'set',key:'角色.位置',value:{locationId:'lcq.location.grassland',描述:'中州·草原'}}]);
 assert.equal(P.countryOf('lcq.location.grassland'),P.countryOf(config.capitals.中立边陲));
 // Current guard intentionally accepts same-country moves. Keep evidence rather than blocking all local movement.
 assert.equal(result.accepted.length,1);
});
test('3 晴州country贯穿初始化与旧存档地图标准化',async()=>{
 const {buildStrictScenarioInitialization}=await loadTs('../src/modules/scenarioMods/strictInitializer.ts');const {normalizeLocationsData}=await loadTs('../src/utils/coordinateConverter.ts');
 const init=buildStrictScenarioInitialization(JSON.parse(read('src/modules/scenarioMods/builtins/data/lcq.stage_01.json')));
 const place=init.worldInfo.地点信息.find(l=>l.id==='liuchao.location.qingzhou');assert.equal(place.country,'宋');const old={...place};delete old.country;assert.equal(normalizeLocationsData([old])[0].country,'宋');
});
for(const [label,data,validate] of [
 ['旧实体格式',{世界:{状态:{剧本模组:{modId:'lcq.stage_01'}}}},async()=>({status:'ok'})],
 ['版本不符',{元数据:{版本号:999}},async()=>({status:'ok'})],
 ['结构拒绝',{},async()=>({status:'rejected'})],
 ['末端载入异常',{},async()=>({status:'ok',data:{}})],
])test(`P0 回滚${label}不写入、不删除`,async()=>{
 const source=read('src/stores/characterStore.ts'),start=source.indexOf('  const rollbackToLastConversation = async'),end=source.indexOf('\n\n  /**',start),raw=source.slice(start,end);
 const js=ts.transpileModule(raw,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,calls=[],noop=()=>{};
 const activeSlot={存档数据:{safe:true}},profile={模式:'单机',存档列表:{a:activeSlot,'上次对话':{存档数据:data}}};
 const deps={activeCharacterProfile:{value:profile},rootState:{value:{当前激活存档:{角色ID:'c',存档槽位:'a'}}},lastConversationMatchesActive:()=>true,assertEntitySaveFormat:E.assertEntitySaveFormat,rejectFutureSaveVersion:F.rejectFutureSaveVersion,validateLoadedSave:validate,useGameStateStore:()=>({loadFromSaveData:()=>{throw Error('late');}}),reseedActiveSceneAfterLoad:noop,storage:{saveSaveData:()=>calls.push('write'),deleteSaveData:()=>calls.push('delete')},commitMetadataToStorage:()=>calls.push('metadata')};
 const rollback=new Function(...Object.keys(deps),js+';return rollbackToLastConversation;')(...Object.values(deps));await assert.rejects(rollback());assert.deepEqual(calls,[]);assert.deepEqual(activeSlot.存档数据,{safe:true});
});
test('P0 检查点复测工作槽失败也不得写入',async()=>{const h=loadHarness({}, {checkpointWorkingCopy:()=>({})});assert.equal(await h.run('c','a'),false);assert.deepEqual(h.calls,[]);});
test('P0 迁移后验证失败不写备份或原槽',async()=>{const h=loadHarness({}, {detectLegacySaveData:()=>({needsMigration:true}),SaveMigrationModal:{},migrateSaveDataToLatest:()=>({migrated:{},report:{}}),validateSaveDataV3:()=>({isValid:false,errors:['broken'],warnings:[]})});assert.equal(await h.run('c','a'),false);assert.deepEqual(h.calls,[]);});
