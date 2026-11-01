import test from 'node:test';
import assert from 'node:assert/strict';
import {createJiti} from 'jiti';
import {fileURLToPath} from 'node:url';
import {createPinia,setActivePinia} from 'pinia';
const jiti=createJiti(import.meta.url,{interopDefault:true,alias:{'@':fileURLToPath(new URL('../src',import.meta.url)),'@/stores/characterStore':fileURLToPath(new URL('./stubs/characterStoreForAbortTest.ts',import.meta.url))}});
const load=p=>jiti.import(new URL(p,import.meta.url).pathname);
const values=new Map();
globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
globalThis.window=globalThis;globalThis.location={hostname:'localhost',search:'',href:'http://localhost/'};
const {AIBidirectionalSystem:A}=await load('../src/utils/AIBidirectionalSystem.ts');
const {createMinimalSaveDataV3}=await load('../src/utils/dataRepair.ts');
const {gameTimeMinutes}=await load('../src/utils/time.ts');
const response=commands=>({text:'你稳住棍身，继续追击猛兽。',mid_term_memory:'你继续追击猛兽。',tavern_commands:commands,action_options:[]});
test('真实结算链：DN1–DN4 各拍默认耗时，模型 HP set/add/整对象回血均拒绝，扣血保留',async()=>{
 setActivePinia(createPinia());
 let save=createMinimalSaveDataV3();save.角色.属性.气血={当前:44,上限:150};save.元数据.时间={年:224,月:2,日:11,小时:17,分钟:16};
 const start=gameTimeMinutes(save.元数据.时间);
 const commands=[{action:'set',key:'角色.属性.气血.当前',value:89},{action:'add',key:'角色.属性.气血.当前',value:45},{action:'set',key:'角色.属性.气血',value:{当前:89,上限:150}},{action:'add',key:'角色.属性.气血.当前',value:-4}];
 for(let i=0;i<commands.length;i++){
  const result=await A.processGmResponse(response([commands[i]]),save,false,undefined,{userAction:'我压棍追击猛兽右眼',timeActionId:`DN${i+1}`});
  save=result.saveData;assert.equal(save.角色.属性.气血.当前,i===3?40:44);assert.equal(gameTimeMinutes(save.元数据.时间)-start,(i+1)*15);
 }
});
test('真实命令链先扣再 set 原值不能绕过回血拦截；正文声称恢复也不写 HP',async()=>{
 setActivePinia(createPinia());const save=createMinimalSaveDataV3();save.角色.属性.气血={当前:44,上限:150};
 const r=response([{action:'add',key:'角色.属性.气血.当前',value:-4},{action:'set',key:'角色.属性.气血.当前',value:44}]);r.text='你感到气血完全恢复。';
 const result=await A.processGmResponse(r,save,false,undefined,{timeActionId:'health-sequence',userAction:'我继续追击'});assert.equal(result.saveData.角色.属性.气血.当前,40);
});
test('删除气血再重建不能绕过模型回血守卫',async()=>{
 setActivePinia(createPinia());const save=createMinimalSaveDataV3();save.角色.属性.气血={当前:44,上限:150};
 const result=await A.processGmResponse(response([{action:'delete',key:'角色.属性.气血'},{action:'set',key:'角色.属性.气血',value:{当前:89,上限:150}}]),save,false,undefined,{timeActionId:'health-delete',userAction:'我继续追击'});
 assert.deepEqual(result.saveData.角色.属性.气血,{当前:44,上限:150});
});
test('真实结算链：残缺旧 runtime 不推进 worldTurn 时，旧耗时标记仍不得冻结日历',async()=>{
 setActivePinia(createPinia());let save=createMinimalSaveDataV3();save.元数据.时间={年:224,月:2,日:11,小时:17,分钟:16};
 save.世界.状态.剧本模组={worldTurn:7,authorTimeConsumedAtTurn:7};
 const start=gameTimeMinutes(save.元数据.时间);
 for(let i=0;i<4;i++)save=(await A.processGmResponse(response([]),save,false,undefined,{timeActionId:`old-DN${i}`,userAction:'我继续压棍追击猛兽右眼'})).saveData;
 assert.equal(save.世界.状态.剧本模组.worldTurn,7);assert.equal(gameTimeMinutes(save.元数据.时间)-start,60);
});
test('真实结算链：旧场面挂着（activeScene 冻结 worldTurn）且耗时标记＝worldTurn，DN1–DN4 每拍仍走时',async()=>{
 setActivePinia(createPinia());let save=createMinimalSaveDataV3();save.元数据.时间={年:224,月:2,日:11,小时:17,分钟:16};
 save.世界.状态.剧本模组={worldTurn:7,authorTimeConsumedAtTurn:7};
 save.系统.扩展['场面模块']={version:1,active:{sceneId:'old-forest-beast',phase:'fighting',pending:null,choice:null,notice:'',last:null,closing:null},history:[],stall:{}};
 const start=gameTimeMinutes(save.元数据.时间);
 for(let i=0;i<4;i++)save=(await A.processGmResponse(response([]),save,false,undefined,{timeActionId:`scene-DN${i}`,userAction:'我继续压棍追击猛兽右眼'})).saveData;
 assert.equal(save.世界.状态.剧本模组.worldTurn,7);assert.equal(gameTimeMinutes(save.元数据.时间)-start,60);
});
test('模型回血被拒不算执行失败（不连带关掉本拍对账），同批其它命令照常落账',async()=>{
 setActivePinia(createPinia());const save=createMinimalSaveDataV3();save.角色.属性.气血={当前:44,上限:150};save.角色.属性.声望=3;
 const result=await A.processGmResponse(response([{action:'set',key:'角色.属性.气血.当前',value:89},{action:'add',key:'角色.属性.声望',value:2}]),save,false,undefined,{timeActionId:'health-no-error',userAction:'我继续追击'});
 assert.equal(result.saveData.角色.属性.气血.当前,44);assert.equal(result.saveData.角色.属性.声望,5);
 assert.ok(!(result.stateChanges?.changes||[]).some(c=>c.action==='execution_error'),JSON.stringify(result.stateChanges));
});
