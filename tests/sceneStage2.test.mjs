import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadTs} from './loadTs.mjs';
const {resolveScenarioContent}=await loadTs('../src/modules/scenarioMods/entityCatalog.ts');
const core=await loadTs('../src/modules/sceneModule/index.ts');
const registry=await loadTs('../src/modules/sceneModule/contracts/registry.ts');
const host=await loadTs('../src/modules/sceneModule/host/controller.ts');
const ext=await loadTs('../src/modules/sceneModule/host/ext.ts');
const rt=await loadTs('../src/modules/scenarioMods/runtime.ts');
const init=await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const repair=await loadTs('../src/utils/dataRepair.ts');
const get=n=>registry.SCENE_CONTRACTS.find(c=>c.meta.id.startsWith(`combat.f${n}.`));
const ctx={factors:0,playerDefense:0};
const plan=(goal='attack',targets=[],magnitude=3)=>({goal,targets,magnitude,scope:'single',levers:[],cash:[],text:'我出手'});
function start(c,action=20,defense=20){return core.beginScene(c,{forced:{action:Array(30).fill(action),defense:Array(120).fill(defense)}}).state;}
async function fixture(n){
 const c=get(n),id=n==='01'?'lcq.stage_02':n==='02'?'lcq.stage_03b_snake_flower_bridge':'lcq.stage_04b_lingfei_baiyi_crisis';
 const mod=resolveScenarioContent(JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`,import.meta.url),'utf8')));
 const save=init.applyStrictScenarioInitializationToSave(repair.createMinimalSaveDataV3(),init.buildStrictScenarioInitialization(mod));
 const r=save.世界.状态.剧本模组,index=r.events.findIndex(e=>e.id===c.meta.hook.eventId);
 for(const e of r.events.slice(0,index)){r.completedEventIds.push(e.id);for(const cond of e.completion||[])if(cond.path.startsWith('flags.'))r.flags[cond.path.slice(6)]=cond.value;}
 r.worldTurn=Number(r.worldTurn)||0;r.activeEventIds=[c.meta.hook.eventId];const event=r.events[index],loc=r.canon.locations.find(l=>l.id===event.locationId);
 if(loc)save.角色.位置={描述:loc.name,地点ID:loc.id,x:loc.coordinates.x,y:loc.coordinates.y};
 if(n==='01'){
  const a=rt.getCurrentStoryEventActions(save).find(a=>a.actionId==='stabilize_wuerlang_on_route');
  assert.ok(a);r.worldTurn++;assert.equal(rt.recordStoryEventStructuredAction(save,a).attempted,true);
 }
 return save;
}

test('stage2 contracts are linted and contain only the simplified authored rules',()=>{
 for(const n of ['01','02','04','05']){
  const c=get(n);assert.deepEqual(core.lintContract(c).errors,[]);assert.deepEqual(core.lintContract(c).warnings,[]);
  assert.equal(c.defeat.outcome.endingId,'lcq.ending.fail.combat');
  for(const key of ['interrogation','continuity','conditionalEvents','fumble','elements'])assert.equal(c[key],undefined);
  for(const b of Object.values(c.closing))assert.equal(b.fixedCosts,undefined);
  assert.ok(!c.parties.some(p=>['liuchao.character.yi_biao','liuchao.character.wu_zhan_wei'].includes(p.ref)));
 }
 assert.equal(get('01').parties.filter(p=>p.side==='player_side').length,1);
 assert.equal(get('02').parties.filter(p=>p.side==='player_side').length,1);
 assert.deepEqual(get('04').parties.filter(p=>p.side==='player_side').map(p=>p.ref),['liuchao.character.cheng_zongyang','liuchao.character.le_mingzhu']);
});

test('F01 survives exactly three complete turns including the third enemy attack, then black veil intervenes',()=>{
 const c=get('01');let s=start(c);
 for(let i=0;i<3;i++){
  const before=s.cursors.action;core.previewAction(c,s,plan('defend',['pc']),ctx);assert.equal(s.cursors.action,before);
  const out=core.confirmAction(c,s,plan('defend',['pc']),ctx);s=out.state;
  assert.deepEqual(out.result.enemy.map(e=>e.party),['assassins','archers']);assert.equal(s.outcome?.kind,i===2?'win':undefined);
 }
 const close=core.closeScene(c,s,ctx);assert.match(close.writeBack.closingText,/黑纱女子出手/);
 assert.equal(close.state.cursors.action,3);assert.equal(close.state.tracks.assassins.vit,0,'survival must not force enemy extermination');
});

test('F01 being downed on the third turn takes precedence over its survival clock',()=>{
 const c=get('01');let s=start(c,10,20);
 for(let i=0;i<2;i++)s=core.confirmAction(c,s,plan('defend',['pc']),ctx).state;
 s.statuses.pc=[{id:'wound.external.heavy',appliedBeat:2,expiresBeat:null,cause:'combat'}];s.forced.defense=Array(120).fill(1);
 s=core.confirmAction(c,s,plan('defend',['pc']),ctx).state;
 assert.equal(s.outcome.kind,'lose');assert.equal(core.closeScene(c,s,ctx).writeBack.outcome.endingId,'lcq.ending.fail.combat');
});

test('F02 starts with a severely injured attacker and wins when he is downed',()=>{
 const c=get('02'),s=start(c);assert.equal(s.tracks.snake_man.vit,2);
 const out=core.confirmAction(c,s,plan('attack',['snake_man']),ctx);assert.equal(out.state.outcome.kind,'win');
});

test('F05 blood tiger can be subdued and surviving two complete turns wins',()=>{
 const c=get('05');let s=start(c);
 const tiger=core.confirmAction(c,s,plan('attack',['blood_tiger']),ctx);s=tiger.state;
 assert.equal(core.trackLabel(s,c,'blood_tiger','vit'),'被制住');assert.equal(s.outcome,undefined);
 let fresh=start(c);
 for(let beat=0;beat<2;beat++)fresh=core.confirmAction(c,fresh,plan('defend',['pc']),ctx).state;
 assert.equal(fresh.outcome.kind,'win');const closed=core.closeScene(c,fresh,ctx);
 assert.equal(closed.state.tracks.blood_tiger.vit,0,'winning must not require or fabricate another tiger attack');
});

for(const n of ['01','02','04','05'])test(`F${n} real host loss writes minimal game-over card and never settles the story action`,async()=>{
 globalThis.location={search:'?sceneModule=on',hostname:'localhost'};
 try{
  let save=await fixture(n);const c=get(n),deps={persist:async next=>{save=structuredClone(next);},askIntent:async()=>JSON.stringify({goal:'defend',claim:{magnitude:1,scope:'single',targets:['pc']},levers:[],inputClass:'action'})};
  assert.equal(host.sceneCandidate(save)?.contract.meta.id,c.meta.id);
  await host.submitSceneInput(save,'我挡住攻击',deps);
  const a=ext.activeScene(save);a.state.statuses.pc=[{id:'incapacitated',appliedBeat:1,expiresBeat:null,cause:'combat'}];a.state.forced={action:[10],defense:Array(20).fill(1)};
  await host.confirmSceneAction(save,deps);
  const r=save.世界.状态.剧本模组;assert.equal(r.gameOver.title,'游戏结束');assert.equal(r.gameOver.endingId,'lcq.ending.fail.combat');
  assert.equal(r.completedEventIds.includes(c.meta.hook.eventId),false);assert.equal(ext.activeScene(save),null);
  assert.equal(save.系统.历史.叙事.at(-1).content.trim(),'游戏结束');
  assert.ok(ext.readExt(save).history.at(-1).state.statuses.pc.some(s=>s.id==='incapacitated'),'terminal loss must not revive player');
 }finally{delete globalThis.location;}
});

for(const n of ['01','02','04','05'])test(`F${n} host confirms success once and resumes the existing chapter`,async()=>{
 globalThis.location={search:'?sceneModule=on',hostname:'localhost'};
 try{
  let save=await fixture(n);const c=get(n),deps={persist:async next=>{save=structuredClone(next);},askIntent:async()=>{
   const s=ext.activeScene(save).state,target=c.parties.find(p=>p.side==='opposed'&&p.id!=='blood_tiger'&&(s.tracks[p.id]?.vit||0)<p.tracks[0].scale.indexOf(p.tracks[0].ending.finalState))?.id;
   return JSON.stringify({goal:n==='01'?'defend':'attack',claim:{magnitude:3,scope:'single',targets:n==='01'?['pc']:[target]},levers:[],inputClass:'action'});
  }};
  await host.submitSceneInput(save,'我挡住攻击，寻找机会反击',deps);
  assert.equal(ext.activeScene(save).state.cursors.action,0);assert.equal(save.世界.状态.剧本模组.completedEventIds.includes(c.meta.hook.eventId),false);
  ext.activeScene(save).state.forced={action:Array(20).fill(20),defense:Array(100).fill(20)};
  for(let i=0;i<10&&ext.activeScene(save);i++){
   if(!ext.activeScene(save).pending)await host.submitSceneInput(save,'我继续攻击',deps);
   await host.confirmSceneAction(save,deps);
  }
  assert.equal(ext.activeScene(save),null);assert.equal(save.世界.状态.剧本模组.gameOver,undefined);
  assert.equal(save.世界.状态.剧本模组.completedEventIds.includes(c.meta.hook.eventId),true);
  assert.equal(ext.readExt(save).history.filter(row=>row.contractId===c.meta.id).length,1);
  if(n==='01')assert.equal(ext.readExt(save).history.at(-1).beats,3);
  if(n==='04'){
   const reward=c.closing.win.rewards[0],item=save.世界.状态.剧本模组.canon.items.find(i=>i.id===reward.itemId);
   assert.equal(item.storyItem,true);assert.equal(save.角色.背包.物品[reward.itemId].数量,1);
   assert.match(save.系统.历史.叙事.at(-1).content,new RegExp(item.name));
   const wb=await loadTs('../src/modules/sceneModule/host/writeback.ts'),ended=ext.readExt(save).history.at(-1);
   wb.applyWriteBack(save,c,ended.state,core.closeScene(c,{...ended.state,status:'decided'},ctx).writeBack);
   assert.equal(save.角色.背包.物品[reward.itemId].数量,1,'repeated writeback cannot duplicate the story reward');
  }
 }finally{delete globalThis.location;}
});

test('stage2 off switch preserves legacy action availability while an active scene remains owned',async()=>{
 globalThis.location={search:'?sceneModule=off'};
 try{const save=await fixture('02'),a=rt.getCurrentStoryEventActions(save)[0];assert.equal(host.sceneCandidate(save),undefined);assert.equal(rt.recordStoryEventStructuredAction(save,a).attempted,true);}
 finally{delete globalThis.location;}
});

test('F04 story reward is catalog-defined and excluded even from a mistakenly configured loot entry',async()=>{
 const loot=await loadTs('../src/modules/scenarioMods/locationLoot.ts');
 const travel=await loadTs('../src/modules/scenarioMods/travel/travelLedger.ts');
 const ids=await loadTs('../src/modules/scenarioMods/travel/locationIds.ts');
 const c=get('04'),save=await fixture('04'),r=save.世界.状态.剧本模组,reward=c.closing.win.rewards[0];
 const item=r.canon.items.find(i=>i.id===reward.itemId);assert.ok(item);assert.equal(item.storyItem,true);
 assert.equal(c.closing.lose.rewards.length,0);assert.equal(JSON.stringify(c).includes(item.name),false,'contract only references item ID');
 const locationId=ids.canonicalLocationId(travel.currentLocation(save,r.canon.locations).locationId);
 const table={version:1,rules:{maxSearches:3,commonSlots:[1,1],rareChance:1,largeCurrencyChance:1,maxCopperPerSearch:80},locations:{[locationId]:{name:'fixture',status:'ready',entries:[{id:'story-reward',itemId:item.id,category:'key',quantity:[1,1],chance:1}]}}};
 const result=loot.settleLocationLoot(save,table);assert.equal(result.status,'settled');assert.deepEqual(result.receipt.drops,[]);
 assert.equal(save.角色.背包.物品[item.id],undefined);
 assert.ok(!Object.values(loot.QINGYU_LOOT_TABLE.locations).some(loc=>loc.entries.some(e=>e.itemId===item.id)));
 const later=resolveScenarioContent(JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_05b.json',import.meta.url),'utf8')));
 assert.deepEqual(later.content.items.find(i=>i.id===item.id),item);
});

for(const n of ['01','02','04'])test(`F${n} explicit test dice plus yielding can reproduce a terminal loss`,async()=>{
 globalThis.location={search:'?sceneModule=on',hostname:'localhost'};
 try{
  let save=await fixture(n);const deps={persist:async next=>{save=structuredClone(next);},askIntent:async()=>JSON.stringify({goal:'attack',claim:{magnitude:3,scope:'all',targets:[]},levers:[],inputClass:'action'})};
  await host.submitSceneInput(save,'我张开双手不躲不挡',deps);
  assert.equal(ext.activeScene(save).pending.plan.goal,'yield_guard');
  await assert.rejects(host.setSceneTestDice(save,deps,1,false),/disabled/);
  await host.setSceneTestDice(save,deps,1,true);assert.equal(ext.activeScene(save).pending,null);
  for(let i=0;i<4&&ext.activeScene(save);i++){await host.submitSceneInput(save,'我张开双手不躲不挡',deps);assert.equal(ext.activeScene(save).pending.plan.goal,'yield_guard');await host.confirmSceneAction(save,deps);}
  assert.equal(save.世界.状态.剧本模组.gameOver.endingId,'lcq.ending.fail.combat');
 }finally{delete globalThis.location;}
});
test('irrelevant weather text cannot become an attack preview despite a wrong model claim',async()=>{
 globalThis.location={search:'?sceneModule=on',hostname:'localhost'};
 try{let save=await fixture('02');const deps={persist:async next=>{save=structuredClone(next);},askIntent:async()=>JSON.stringify({goal:'attack',claim:{magnitude:3,scope:'all',targets:['snake_man']},levers:[],inputClass:'action'})};await host.submitSceneInput(save,'我看看天色',deps);assert.equal(ext.activeScene(save).pending,null);assert.equal(ext.activeScene(save).state.cursors.action,0);}finally{delete globalThis.location;}
});
