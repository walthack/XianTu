import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadTs } from './loadTs.mjs';
import { freshPrologueCheckpoint } from '../scripts/generate-prologue-checkpoint.mjs';
const T = await loadTs('../src/modules/scenarioMods/actionTime.ts');
const C = await loadTs('../src/utils/time.ts');
const F = await loadTs('../src/modules/scenarioMods/fixedEndingNarratives.ts');
const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const WY = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
const completePastry = save => WY.settleWuyuanOpenWorldSelection(save, WY.getWuyuanOpenWorldSelections(save).find(a => a.kind === 'problem_action'));
const E = await loadTs('../src/modules/scenarioMods/randomEncounter.ts');
const W = await loadTs('../src/modules/scenarioMods/whiteTailLeopard.ts');
const N = await loadTs('../src/modules/sceneModule/numbers.ts');
const rt = s => s.世界.状态.剧本模组;
const base = () => ({元数据:{时间:{年:224,月:2,日:11,小时:17,分钟:16}},角色:{属性:{气血:{当前:44,上限:150}},位置:{}},系统:{扩展:{}},世界:{状态:{剧本模组:{worldTurn:7}}}});
const dn = ['我继续压棍追击猛兽右眼','我横棍硬格右前爪，硬架住这头猛兽的扑击','我压住棍身，等猛兽失衡后猛击咽喉','我趁猛兽横转前探，循喉前空隙继续追击并补棍'];
test('旧耗时标记没有本拍时钟变化证据时不吞掉 DN 发送；同发送重放幂等', () => {
  for (const kind of ['author','travel','missing']) {
    const s=base();
    if(kind==='author')rt(s).authorTimeConsumedAtTurn=7;
    if(kind==='travel')rt(s).travelLedger={timeConsumedAtTurn:7,lastCard:{receiptId:'old-route'}};
    const before=C.gameTimeMinutes(s.元数据.时间);
    dn.forEach((userAction,i)=>{const opts={userAction,timeActionId:`DN${i+1}`}, prior=structuredClone(s.元数据.时间);T.settleActionTime(s,{},opts,null,false,false,prior);const once=structuredClone(s.元数据.时间);T.settleActionTime(s,{},opts,null,false,false,prior);assert.deepEqual(s.元数据.时间,once);});
    assert.equal(C.gameTimeMinutes(s.元数据.时间)-before,4*T.actionTimeConfig().minutes.moment);
  }
});
test('模型回血写入拦截，伤害与已经本地结算的治疗保留',async()=>{
 const {rejectModelHealthIncrease}=await loadTs('../src/utils/modelCommandPipeline.ts');
 for(const after of [89,150]){const s=base();s.角色.属性.气血.当前=after;assert.equal(rejectModelHealthIncrease(s,{当前:44,上限:150}),true);assert.equal(s.角色.属性.气血.当前,44);}
 const s=base();s.角色.属性.气血.当前=20;assert.equal(rejectModelHealthIncrease(s,{当前:44,上限:150}),false);assert.equal(s.角色.属性.气血.当前,20);
 s.角色.属性.气血.当前=89;assert.equal(rejectModelHealthIncrease(s,{当前:89,上限:150}),false);
});
// C01（#188 放行改写）：草原四年改挂在进五原城路线（时间线插入事件），s02_04 不再是跳年点。
test('从当前新游戏连续正式合同推进到 s02_04：进五原城路线时 220→224，过渡只发一次；完成 s02_04 不再跳',async()=>{
 const {save,trace}=await freshPrologueCheckpoint();assert.ok(trace.some(t=>t.event==='lcq.event.s01_06'));assert.ok(trace.some(t=>t.local==='lcq.route.wuyuan.arrive_market'));assert.equal(R.getScenarioFocusEvent(rt(save)).id,'lcq.event.s02_04');
 assert.equal(save.元数据.时间.年,224);assert.match(F.flushTimeSkipInterlude(save),/流浪了四年/);assert.equal(F.flushTimeSkipInterlude(save),'');
 const action=R.getCurrentStoryEventActions(save).find(a=>a.eventId==='lcq.event.s02_04');assert.ok(action);
 const result=completePastry(save);assert.equal(result.canonEventCompleted,true,JSON.stringify(result));assert.equal(save.元数据.时间.年,224);assert.equal(F.flushTimeSkipInterlude(save),'');
 R.recordStoryEventStructuredAction(save,action);assert.equal(save.元数据.时间.年,224);
});
test('旧 s02_04 合同缺跳年字段：成功时不改合同、不二次跳；旧档已在 s01_06 跳过的同样不跳不接',async()=>{
 const {save}=await freshPrologueCheckpoint();F.flushTimeSkipInterlude(save);const event=rt(save).events.find(e=>e.id==='lcq.event.s02_04');event.playerCompletionContract.actions.forEach(a=>delete a.timeAdvance);
 const before=structuredClone(event);
 const old=structuredClone(save);const legacy=old.系统.扩展.actionTime.receipts['author:timeline:qingyu.insert.grassland_four_years:y4'];
 old.系统.扩展.actionTime.receipts={'author:lcq.event.s01_06::advance_declared_objective':legacy};
 assert.equal(completePastry(save).canonEventCompleted,true);assert.equal(save.元数据.时间.年,224);assert.deepEqual(event,before);assert.equal(F.flushTimeSkipInterlude(save),'');
 completePastry(old);assert.equal(old.元数据.时间.年,224);assert.equal(F.flushTimeSkipInterlude(old),'');
});
test('打字闭关弹窗确认一日自动恢复发送；取消不发送；结算一天幂等',()=>{
 const source=readFileSync('src/components/dashboard/MainGamePanel.vue','utf8');
 const select=source.slice(source.indexOf('const selectAction ='),source.indexOf('// 移除中期记忆'));
 // 执行组件真实处理器（仅去 TS 注解），以 refs 和发送桩替代 Vue UI。
 const ctx={selectedAction:{value:{name:'我闭关修炼',type:'cultivation',timeRequired:true}},showActionModal:{value:false},selectedTime:{value:1},customTime:{value:1},selectedOption:{value:''},inputText:{value:''},selectedCultivationTime:{value:null},inputRef:{value:null},randomUUID:()=> 'training-test',abortInFlightNaturalIntent(){},nextTick:f=>f(),sent:0,sendMessage(){ctx.sent++;}};
 vm.createContext(ctx);vm.runInContext(select.replace('action: ActionItem','action')+'\nresumeAfterCultivationSelection=true;confirmAction();',ctx);
 assert.equal(ctx.sent,1);assert.equal(ctx.inputText.value,'我闭关修炼（1天）');assert.equal(ctx.selectedCultivationTime.value.selection.days,1);
 vm.runInContext('resumeAfterCultivationSelection=true;cancelAction();confirmAction();',ctx);assert.equal(ctx.sent,1);
 const s=base(),start=C.gameTimeMinutes(s.元数据.时间),opts={timeActionId:'turn',cultivationSelections:[ctx.selectedCultivationTime.value.selection]};T.settleActionTime(s,{},opts,null,false,false);T.settleActionTime(s,{},opts,null,false,false);assert.equal(C.gameTimeMinutes(s.元数据.时间)-start,1440);
});
test('报名字：NPC 对玩家报名字、请求对方介绍、自我介绍授权不误拦；擅自报名字仍拒绝',async()=>{
 const {unauthorizedPlayerActions:check}=await loadTs('../src/modules/scenarioMods/playerAgencyGuard.ts');
 for(const text of ['掌柜向你报上姓名。','你面前的掌柜报出自己的名字。','你站稳脚步，他报上了名字。','你让对方报上姓名。'])assert.deepEqual(check(text,'我观察四周。'),[],text);
 assert.deepEqual(check('你报出自己的名字。','我自我介绍。'),[]);
 assert.deepEqual(check('你报出自己的名字。','我不要自我介绍。'),['报名字']);
 assert.deepEqual(check('你报出自己的名字。','我闭关修炼。'),['报名字']);
 assert.deepEqual(check('你报出自己的名字。','我叫掌柜过来。'),['报名字']);
 assert.deepEqual(check('你报出自己的名字。','我叫程宗扬。'),[]);
});
test('cp03 修复包与新检查点均可由正式导入解包器识别，损坏对象拒绝',async()=>{
 const {unwrapDadBundle}=await loadTs('../src/utils/dadBundle.ts');
 const {validateSaveDataV3}=await loadTs('../src/utils/saveValidationV3.ts');
 const {assertEntitySaveFormat}=await loadTs('../src/modules/scenarioMods/entitySaveFormat.ts');
 for(const p of ['tests/fixtures/playtest-5e8f/cp03-dragon-corpse.json','tests/fixtures/checkpoints/current-prologue-before-s02_04.json']) {const u=unwrapDadBundle(JSON.parse(readFileSync(p,'utf8')));assert.equal(u.type,'saves');assert.equal(u.payload.saves[0].存档数据.元数据.版本号,3);assert.ok(u.payload.saves[0].存档名);assert.deepEqual(validateSaveDataV3(u.payload.saves[0].存档数据).errors,[]);assert.doesNotThrow(()=>assertEntitySaveFormat(u.payload.saves[0].存档数据));}
 assert.equal(unwrapDadBundle({元数据:{版本号:3}}).type,null);
});
test('测试概率开关默认关，localStorage 热开关及 URL 优先；正式概率不变',()=>{
 const original=structuredClone(N.GAME_NUMBERS.encounter),flag=N.GAME_NUMBERS.e2eSmoke.nanhuangEncounters.flag;
 const storage=globalThis.localStorage,location=globalThis.location;
 try{globalThis.localStorage={getItem:()=>null};globalThis.location={search:''};assert.equal(E.nanhuangTestRates(),undefined);assert.equal(N.GAME_NUMBERS.encounter.tiers.guarded.chance,0.08);assert.equal(W.leopardConfig().chance,0.03);
 globalThis.localStorage={getItem:k=>k===flag?'on':null};assert.equal(E.nanhuangTestRates().encounterChance,1);assert.equal(E.nanhuangTestRates().leopardChance,1);
 globalThis.location={search:`?${flag}=off`};assert.equal(E.nanhuangTestRates(),undefined);
 globalThis.localStorage={getItem:()=>null};globalThis.location={search:`?${flag}=on`};assert.equal(E.nanhuangTestRates().leopardChance,1);
 assert.deepEqual(N.GAME_NUMBERS.encounter,original);
 }finally{globalThis.localStorage=storage;globalThis.location=location;}
});
test('热开关接入真实遭遇 tick 与白尾豹 tick；仍遵守村寨门禁',async()=>{
 const init=await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
 const {createMinimalSaveDataV3}=await loadTs('../src/utils/dataRepair.ts');
 const stage=JSON.parse(readFileSync('src/modules/scenarioMods/builtins/data/lcq.stage_05b.json','utf8'));
 const fresh=()=>R.advanceScenarioRuntime(init.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(),init.buildStrictScenarioInitialization(stage))).saveData;
 const flag=N.GAME_NUMBERS.e2eSmoke.nanhuangEncounters.flag,prior=globalThis.location;
 try{
  globalThis.location={search:`?${flag}=on`};
  const s=fresh();s.角色.位置={locationId:'lcq.location.giant_vine',描述:'南荒·万古巨藤'};
  assert.equal(E.encounterGate(s),null);
  for(let i=0;i<4;i++){E.tickRandomEncounter(s,{narrated:true});rt(s).worldTurn++;}
  const receipt=rt(s).encounter.receipts.at(-1);assert.equal(receipt.chance,1);assert.equal(receipt.hit,true);assert.ok(E.pendingRandomBattle(s));
  const leopard=fresh();leopard.角色.位置={locationId:'lcq.location.giant_vine',描述:'南荒·万古巨藤'};leopard.角色.属性.气血={当前:44,上限:150};
  assert.ok(W.tickWhiteTailLeopard(leopard).text);assert.equal(rt(leopard).whiteTailLeopard.sightings.length,1);assert.equal(leopard.角色.属性.气血.当前,44+Math.round(150*W.leopardConfig().staminaRestoreRatio));
  const village=fresh();village.角色.位置={locationId:'lcq.location.huamiao_village',描述:'南荒·花苗寨'};assert.equal(E.encounterGate(village),'village');assert.equal(W.tickWhiteTailLeopard(village).text,'');
 }finally{globalThis.location=prior;}
});
test('本拍作者跳年或行旅确已推进日历时，不叠加普通回合耗时',()=>{
 for(const author of [true,false]){
  const s=base(),before=structuredClone(s.元数据.时间);
  if(author)rt(s).authorTimeConsumedAtTurn=7;else rt(s).travelLedger={timeConsumedAtTurn:7,lastCard:{receiptId:'new-route'}};
  T.settleTime(s,'local',1440,author?'author':'travel');const after=structuredClone(s.元数据.时间);
  T.settleActionTime(s,{action_time:{tier:'半日'}},{timeActionId:'local-turn'},null,false,false,before);
  assert.deepEqual(s.元数据.时间,after);
 }
});
test('白尾豹本地回复（+round(上限×比例)，44→89 的合法来源）不经模型命令链，不被回血守卫拦',async()=>{
 const {rejectModelHealthIncrease}=await loadTs('../src/utils/modelCommandPipeline.ts');
 const init=await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
 const {createMinimalSaveDataV3}=await loadTs('../src/utils/dataRepair.ts');
 const stage=JSON.parse(readFileSync('src/modules/scenarioMods/builtins/data/lcq.stage_05b.json','utf8'));
 const s=R.advanceScenarioRuntime(init.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(),init.buildStrictScenarioInitialization(stage))).saveData;
 s.角色.位置={locationId:'lcq.location.huamiao_village',描述:'南荒·花苗寨·密林'};s.角色.属性.气血={当前:44,上限:150};
 const cfg={...W.leopardConfig(),chance:1};const before=structuredClone(s.角色.属性.气血);
 assert.ok(W.tickWhiteTailLeopard(s,cfg).text);assert.equal(s.角色.属性.气血.当前,89);
 // 守卫只在单条模型命令前后比对；本地 tick 在命令链之外，不会被回滚。
 assert.equal(rejectModelHealthIncrease(s,s.角色.属性.气血),false);assert.equal(before.当前,44);
});
/** 同 report8091fbef ⑨：截 characterStore 函数体转译，只注入边界（存储/提示/UI），校验链用真实现。 */
async function storeFunction(name, endMarker, deps) {
 const ts=(await import('typescript')).default;const source=readFileSync('src/stores/characterStore.ts','utf8');
 const start=source.indexOf(`  const ${name} = async`),end=source.indexOf(endMarker,start);assert.ok(start>0&&end>start,name);
 const js=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 return new Function(...Object.keys(deps),`${js};return ${name};`)(...Object.values(deps));
}
test('cp03 龙神尸身与新序幕检查点：SavePanel 解包＋真实 importSave 收下、真实 loadGame 读得进',async()=>{
 const {unwrapDadBundle}=await loadTs('../src/utils/dadBundle.ts');
 const Ent=await loadTs('../src/modules/scenarioMods/entitySaveFormat.ts'),Fb=await loadTs('../src/utils/saveLoadFallback.ts'),M=await loadTs('../src/utils/saveMigration.ts'),V3=await loadTs('../src/utils/saveValidationV3.ts');
 const panel=readFileSync('src/components/dashboard/SavePanel.vue','utf8');assert.match(panel,/unwrapped\.type !== 'saves' \|\| !Array\.isArray\(unwrapped\.payload\?\.saves\)/);
 for(const p of ['tests/fixtures/playtest-5e8f/cp03-dragon-corpse.json','tests/fixtures/checkpoints/current-prologue-before-s02_04.json']){
  const u=unwrapDadBundle(JSON.parse(readFileSync(p,'utf8')));assert.equal(u.type,'saves',p);assert.ok(Array.isArray(u.payload?.saves),p);
  const stored=new Map(),toasts=[],noop=()=>{};const toast={error:m=>toasts.push(['error',m]),success:m=>toasts.push(['success',m]),info:noop,warning:noop};
  const storage={saveSaveData:async(c,k,d)=>stored.set(k,structuredClone(d))};
  const rootState={value:{角色列表:{c:{模式:'单机',角色:{名字:'程宗扬'},存档列表:{}}},当前激活存档:null}};
  const importSave=await storeFunction('importSave','\n  /**\n   * 清空所有存档',{assertEntitySaveFormat:Ent.assertEntitySaveFormat,rootState,toast,storage,isTavernEnv:()=>false,ensureSaveDataHasTavernNsfw:x=>x,isSaveDataV3:M.isSaveDataV3,migrateSaveDataToLatest:M.migrateSaveDataToLatest,validateSaveDataV3:V3.validateSaveDataV3,cloneDeep:structuredClone,debug:{log:noop,warn:noop,error:noop},commitMetadataToStorage:async()=>{}});
  const slot=await importSave('c',structuredClone(u.payload.saves[0]));assert.ok(stored.has(slot),p);delete rootState.value.角色列表.c.存档列表[slot].存档数据;
  let loaded=null;const ui={startLoading:noop,updateLoadingText:noop,stopLoading:noop,showDetailModal:noop,hideDetailModal:noop};
  const loadGame=await storeFunction('loadGame','\n  const saveActiveCharacterToStorage',{cloneDeep:structuredClone,debug:{log:noop,error:noop,warn:noop},toast,useUIStore:()=>ui,rootState,getOnlineSaveSlot:()=>null,isBackendConfigured:()=>false,
   assertEntitySaveFormat:Ent.assertEntitySaveFormat,rejectFutureSaveVersion:Fb.rejectFutureSaveVersion,detectLegacySaveData:M.detectLegacySaveData,validateLoadedSave:Fb.validateLoadedSave,loadSaveWithFallback:async(c,k)=>structuredClone(stored.get(k)),applyLoadRepairs:noop,migrateNarrativeDetailOnLoad:async()=>{},clearAllCharacterData:async()=>{},
   shouldReattachLandingPlaytestWorkingCopy:()=>false,packPlaytestWorkingSlot:()=>null,checkpointWorkingCopy:()=>null,useGameStateStore:()=>({loadFromSaveData:d=>{loaded=d;}}),useActionQueueStore:()=>({clearActions:noop}),isTavernEnv:()=>false,reseedActiveSceneAfterLoad:noop,
   storage,resetLastConversationIfForeign:async()=>{},commitMetadataToStorage:async()=>{}});
  assert.equal(await loadGame('c',slot),true,p+JSON.stringify(toasts));assert.ok(loaded?.世界?.状态?.剧本模组,p);
 }
});
test('报名字误拦扩展：第三方紧贴动词作施事、没/未/尚未否定、换主语分句不拦；玩家自己报仍拦',async()=>{
 const {unauthorizedPlayerActions:check}=await loadTs('../src/modules/scenarioMods/playerAgencyGuard.ts');
 for(const t of ['你记住了他报出的名字。','你听他报出名字，点了点头。','你听到他报上名号。','你没报上名字。','你还没来得及报上名字，他便转身走了。','你示意他报上名号。','你想起刚才那人报出的名字。','你并未说出自己的名字。','你点点头，那汉子报上了自己的姓名。','你尚未报出姓名。','你接过名帖，上面写着他报上的名字。'])assert.deepEqual(check(t,'我观察四周。'),[],t);
 assert.deepEqual(check('你暗暗记下孙疤脸报出的名号。','我观察四周。',['孙疤脸']),[]);
 for(const t of ['你报出自己的名字。','你拱手报上姓名：“在下程宗扬。”','你自报家门。','你说出了自己的名字。','你只好报出名字，他才放你进去。','你冲他拱手报上姓名。','你冲他拱手，报上姓名。'])assert.deepEqual(check(t,'我观察四周。'),['报名字'],t);
 // 其它动作不受报名字专用放宽影响
 assert.deepEqual(check('你夺过他的刀杀了那人。','我观察四周。'),['杀人']);
});
