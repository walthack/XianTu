import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadTs } from './loadTs.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const T=await loadTs('../src/modules/scenarioMods/actionTime.ts');
const C=await loadTs('../src/utils/time.ts');
const L=await loadTs('../src/modules/scenarioMods/travel/locationIds.ts');
const E=await loadTs('../src/modules/scenarioMods/randomEncounter.ts');
const D=await loadTs('../src/utils/saveSlotDisplay.ts');
const G=await loadTs('../src/utils/lastConversationGuard.ts');
const packs=(await loadTs('../src/modules/contentPacks/index.ts')).CONTENT_PACKS;
const locations=JSON.parse(read('mod-kit/entity-catalog/locations.json')).entries;
const base=()=>({元数据:{时间:{年:220,月:1,日:1,小时:17,分钟:16}},角色:{位置:{locationId:'lcq.location.huamiao_village',描述:'南荒·花苗寨·密林'}},系统:{扩展:{}},世界:{状态:{剧本模组:{modId:'lcq.stage_02'}}}});
test('N05 旧档无worldTurn且未写作者耗时标记，七个不同回合均按现有片刻配置扣时',()=>{
 const s=base(),start=C.gameTimeMinutes(s.元数据.时间);
 for(let i=0;i<7;i++)T.settleActionTime(s,{}, {timeActionId:'nh'+i},null,false,false);
 assert.equal(C.gameTimeMinutes(s.元数据.时间)-start,7*T.actionTimeConfig().minutes.moment);
 T.settleActionTime(s,{}, {timeActionId:'nh6'},null,false,false);
 assert.equal(C.gameTimeMinutes(s.元数据.时间)-start,7*T.actionTimeConfig().minutes.moment);
});
test('N05 旧路程卡无回合标记不能吞掉当前耗时；有效同拍标记仍免重复扣时',()=>{
 const s=base(),rt=s.世界.状态.剧本模组;rt.travelLedger={lastCard:{receiptId:'old'}};
 const start=C.gameTimeMinutes(s.元数据.时间);T.settleActionTime(s,{}, {timeActionId:'a'},null,false,false);
 assert.equal(C.gameTimeMinutes(s.元数据.时间)-start,T.actionTimeConfig().minutes.moment);
 rt.worldTurn=3;rt.authorTimeConsumedAtTurn=3;
 T.settleActionTime(s,{}, {timeActionId:'b'},null,false,false);
 assert.equal(C.gameTimeMinutes(s.元数据.时间)-start,T.actionTimeConfig().minutes.moment);
});
test('N04 跨国到花苗寨：2026-11-01 起按国别算进南荒；寨内不检，寨外密林检；南荒关同样适用',()=>{
 const s=base();assert.equal(E.encounterGate(s),null,'「南荒·花苗寨·密林」是寨外一带');
 s.角色.位置.描述='南荒·花苗寨';assert.equal(E.encounterGate(s),'village');
 s.世界.状态.剧本模组.modId='lcq.stage_04';assert.equal(E.encounterGate(s),'village');
 const cfg=E.encounterConfig();assert.ok(cfg.regions.nanhuang.zones.some(z=>z.key==='lcq.location.huamiao_village'&&z.subPlace));
 assert.ok(cfg.regions.nanhuang.pool.some(e=>e.enemyId==='lcq.enemy.wild_boar'));
 assert.equal(E.pendingRandomBattle(s),null);
});
test('N04/N05 冻结接缝（2026-11-01 解冻后）：搜刮在普通叙事回合也走本地回执入包，叙事文字不直接成为掉落或随机战',()=>{
 const ai=read('src/utils/AIBidirectionalSystem.ts');
 assert.match(ai,/if \(\(response\.moduleReceipt \|\| response\.localLoot\) && !response\.generationError && !options\?\.eventAction && isLocationLootInput/);
 assert.match(ai,/const lootPreviewSave = !options\?\.eventAction && isLocationLootInput/);
 const host=read('src/modules/sceneModule/host/controller.ts');assert.match(host,/const p = pendingRandomBattle\(save\)/);
});
test('G01/G02 草原与五原独立坐标；总表、变体、内置关一致，投影可保持',async()=>{
 const e=locations.find(e=>e.id==='lcq.location.grassland'),w=locations.find(e=>e.id==='liuchao.location.wuyuan');
 assert.deepEqual(e.definition.coordinates,{x:1200,y:4650});assert.notDeepEqual(e.definition.coordinates,w.definition.coordinates);
 const stage=JSON.parse(read('src/modules/scenarioMods/builtins/data/lcq.stage_01.json'));
 assert.deepEqual(stage.canon.locations.find(l=>l.id===e.id).coordinates,e.definition.coordinates);
 assert.deepEqual(e.stageVariants['lcq.stage_01'].coordinates,e.definition.coordinates);
 const {projectLocationCountries}=await import('../scripts/entity-catalog-projection.mjs');
 const old={manifest:{id:'lcq.stage_01'},canon:{locations:[{id:e.id,coordinates:w.definition.coordinates}]}};
 projectLocationCountries(old);assert.deepEqual(old.canon.locations[0].coordinates,e.definition.coordinates);
});
test('Q01 入秦首拍仍可指向方士，但已经在咸阳时显示当前焦点目标',async()=>{
 const {lineCompassView}=await loadTs('../src/modules/scenarioMods/lineCompass.ts');
 const line=structuredClone(packs.lineCompass.lines.find(l=>l.lineId==='qin'));
 const step=line.steps.find(s=>s.id==='qin_entry_xu_unmet');assert.equal(step.travelHint,true);
 const table={version:1,lines:[{lineId:'qin',nameKey:line.nameKey,knownWhen:[{path:'done.test.entered',operator:'eq',value:true}],steps:[step,{id:'arrival',eventId:'liuchao.event.qin_entry_arrive'}]}]};
 const save=base();save.世界.状态.剧本模组.modId='lyg.qin_xianyang';save.世界.状态.剧本模组.events=[{id:'test.entered'}];save.世界.状态.剧本模组.chronicle=[{type:'event',stageId:'lyg.qin_xianyang',id:'chronicle.lyg.qin_xianyang.test.entered'}];
 const view=id=>lineCompassView(save,{table,focusEventId:'liuchao.event.qin_entry_arrive',atLocationId:id,compassPointer:()=> '在咸阳落脚，打听见王的门路'});
 assert.equal(view('liuchao.location.xianyang').current.step,'在咸阳落脚，打听见王的门路');
 assert.equal(view('liuchao.location.jiangzhou').current.step,'去咸阳，找那个方士问问');
});
for(const name of ['江州','临安','筠州','留仙坪','荆溪村寨','舞阳侯府'])test('国别旧档展示：'+name,()=>{
 const e=locations.find(e=>e.definition.name===name);assert.ok(e,name);
 const position={描述:'中州·'+name,locationId:e.id};const before=structuredClone(position);
 assert.equal(L.locationDescriptionWithCountry(position),e.definition.country+'·'+name);
 assert.equal(L.locationDescriptionWithCountry({描述:'中州·'+name}),e.definition.country+'·'+name);
 assert.deepEqual(position,before);
 if(name==='江州')assert.equal(e.definition.country,'晋');if(name==='临安')assert.equal(e.definition.country,'宋');
});
test('国别未知不猜，已知地点保留子地点',()=>{
 assert.equal(L.locationDescriptionWithCountry({描述:'中州·未知地'}),'中州·未知地');
 assert.equal(L.locationDescriptionWithCountry({locationId:'liuchao.location.jiangzhou',描述:'中州·江州·渡口'}),'晋·江州·渡口');
});
test('DQ10 四年跳跃 2026-11-01 改挂 s02_04（五原为奴期间）：s01_06 不再跳，s02_04 首次成功 220→224，重复不再跳',async()=>{
 const {applyStepSceneLedger}=await loadTs('../src/modules/scenarioMods/fixedEndingNarratives.ts');
 assert.equal(packs.overlays.some(o=>o.stageId==='lcq.stage_01'&&o.events.some(e=>e.id==='lcq.event.s01_06')),false);
 const event=packs.overlays.find(o=>o.stageId==='lcq.stage_02').events.find(e=>e.id==='lcq.event.s02_04');
 const s=base(),rt=s.世界.状态.剧本模组;Object.assign(rt,{modId:'lcq.stage_02',events:[event],completedEventIds:[]});
 const action=event.playerCompletionContract.actions[0];assert.equal(action.timeAdvance.years,4);
 applyStepSceneLedger(s,rt,event.id,action.id);assert.equal(s.元数据.时间.年,224);
 applyStepSceneLedger(s,rt,event.id,action.id);assert.equal(s.元数据.时间.年,224);
});
test('P3 内部奖励预告不进入正文和角色卡，正常权限叙述保留',async()=>{
 const {stripInternalNarrativeControlLeaks:f}=await loadTs('../src/utils/textSanitizer.ts');
 assert.equal(f('你收好行囊。可能获得取得一次调用朱老头南荒私护的权限。\n林间风起。'),'你收好行囊。\n林间风起。');
 assert.equal(f('你已取得一次通行权限。'),'你已取得一次通行权限。');
 assert.doesNotMatch(read('src/components/dashboard/RightSidebar.vue'),/可能获得<\/span>\{\{ card.rewardPreview/);
});
test('T01 有文件的备份与回滚资格分离，跨档不冒充空槽也不能回滚',()=>{
 const original={存档名:'上次对话',角色名字:'程宗扬',保存时间:'2026-10-31T10:00:00Z',回滚来源槽位:'旧档',存档数据:{元数据:{更新时间:'2026-10-31T10:00:00Z'}}};
 const detached=G.detachedLastConversationSlot(original);
 assert.equal(D.isEmptySaveSlot(detached),false);assert.equal(D.saveSlotModifiedAt(detached),original.保存时间);
 assert.equal(G.lastConversationMatchesActive(detached,'新档'),false);assert.equal(G.lastConversationMatchesActive(detached,'旧档'),false);
 assert.equal(original.回滚来源槽位,'旧档');
 const restored=G.detachedLastConversationSlot({...G.clearedLastConversationSlot(original),存档数据:original.存档数据});
 assert.equal(D.isEmptySaveSlot(restored),false);assert.equal(D.saveSlotModifiedAt(restored),original.保存时间);
 assert.equal(G.lastConversationMatchesActive(restored,'旧档'),false);
});
test('T02 空时间点槽角色名显示尚未写入；有内容角色名正常',()=>{
 assert.equal(D.saveSlotCharacterName({存档名:'时间点存档',角色名字:'未知',保存时间:null}),'尚未写入');
 assert.equal(D.saveSlotCharacterName({角色名字:'程宗扬',保存时间:'x'}),'程宗扬');
});

test('T01 真正读档重置函数：读回旧磁盘备份只用于展示，不写删文件、不恢复跨档回滚',async()=>{
 const ts=(await import('typescript')).default;
 const src=read('src/stores/characterStore.ts'),start=src.indexOf('  const resetLastConversationIfForeign = async');
 const body=src.slice(start,src.indexOf('\n  const loadGame = async',start));
 const code=ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const calls=[],backup={元数据:{更新时间:'2026-10-31T11:00:00Z'},角色:{身份:{名字:'程宗扬'}}};
 const storage={loadSaveData:async(...args)=>{calls.push(['read',...args]);return structuredClone(backup);}};
 const run=new Function('LAST_CONVERSATION_SLOT','storage','shouldKeepLastConversationOnLoad','detachedLastConversationSlot','clearSnapshots','debug',code+';return resetLastConversationIfForeign;')('上次对话',storage,G.shouldKeepLastConversationOnLoad,G.detachedLastConversationSlot,(...args)=>calls.push(['snapshot',...args]),{warn(){}});
 const profile={存档列表:{上次对话:{存档名:'上次对话',保存时间:null,存档数据:null}}};
 await run(profile,'c','新档','新档');const slot=profile.存档列表.上次对话;
 assert.deepEqual(slot.存档数据,backup);assert.equal(D.isEmptySaveSlot(slot),false);
 assert.equal(D.saveSlotModifiedAt(slot),backup.元数据.更新时间);
 assert.equal(G.lastConversationMatchesActive(slot,'新档'),false);
 assert.deepEqual(calls,[['read','c','上次对话'],['snapshot','c','新档']]);
});
