import {createJiti} from 'jiti';
import {fileURLToPath} from 'node:url';
import {createPinia,setActivePinia} from 'pinia';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadTs } from './loadTs.mjs';
const host=await loadTs('../src/modules/sceneModule/host/controller.ts');
const ext=await loadTs('../src/modules/sceneModule/host/ext.ts');
const mod=await loadTs('../src/modules/sceneModule/index.ts');
const registry=await loadTs('../src/modules/sceneModule/contracts/registry.ts');
const rt=await loadTs('../src/modules/scenarioMods/runtime.ts');
const trial=await loadTs('../src/dev/combatTrial/overlay.ts');
const init=await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const repair=await loadTs('../src/utils/dataRepair.ts');
const data=id=>readFile(new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`,import.meta.url),'utf8').then(JSON.parse);
const runtime=save=>save.世界.状态.剧本模组;
const F03='lcq.event.s04_02',F10='lcq.event.s05b_05b_ideology_duel_and_defeat';
function enable(){globalThis.location={search:'?sceneModule=on',hostname:'localhost',href:'http://localhost/?sceneModule=on'};}
async function f03(){return trial.createSceneCombatTrialSave(await data('lcq.stage_04'),{mode:'B'});}
async function f10(){
 const save=init.applyStrictScenarioInitializationToSave(repair.createMinimalSaveDataV3(),init.buildStrictScenarioInitialization(await data('lcq.stage_05b')));
 const r=runtime(save),index=r.events.findIndex(e=>e.id===F10);
 for(const event of r.events.slice(0,index)){r.completedEventIds.push(event.id);for(const cond of event.completion||[])if(cond.path.startsWith('flags.'))r.flags[cond.path.slice(6)]=cond.value;}
 r.activeEventIds=[F10];const e=r.events[index],loc=r.canon.locations.find(l=>l.id===e.locationId);
 save.角色.位置={描述:loc.name,x:loc.coordinates.x,y:loc.coordinates.y,地点ID:loc.id};
 return save;
}
function harness(save,extra={}){let current=save;return {get save(){return current;},deps:{persist:async s=>{current=structuredClone(s);},...extra}};}
function force(save,action=20,defense=20){const a=ext.activeScene(save);a.state.forced={action:Array(20).fill(action),defense:Array(100).fill(defense)};}

// 2026-10-20 用户定：战斗加「用药/运功疗伤」目标，用掉一拍；按档位解除伤势、回气血；点名的药按品级加回血并消耗。
const {GAME_NUMBERS:GN}=await loadTs('../src/modules/sceneModule/numbers.ts');
test('战中输入疗伤识别成疗伤目标（不再当成攻击），成功解除一级伤势、回血；点名的药消耗 1 份并按品级加回血', async()=>{
 enable();const h=harness(await f03());
 await host.submitSceneInput(h.save,'我守住队伍保护凝羽',h.deps);force(h.save);await host.confirmSceneAction(h.save,h.deps);
 const a=ext.activeScene(h.save);assert.ok(a,'场面进行中');
 const pc='pc';a.state.statuses[pc]=[{id:'wound.external',appliedBeat:1,expiresBeat:null,cause:'combat'}];
 h.save.角色.属性.气血={当前:30,上限:100};
 h.save.角色.背包.物品['lcq.item.liaoshang_yao']={名称:'疗伤药',数量:2,类型:'丹药'};
 const beat=a.state.beat;
 await host.submitSceneInput(h.save,'我服下疗伤药运功疗伤',h.deps);
 const p=ext.activeScene(h.save).pending;assert.ok(p,'有预览');assert.equal(p.plan.goal,GN.combat.heal.goalId);
 force(h.save,20,20);await host.confirmSceneAction(h.save,h.deps);
 const b=ext.activeScene(h.save);
 assert.ok(!(b?.state.statuses[pc]||[]).some(s=>s.id==='wound.external'),'外伤解除');
 assert.equal(h.save.角色.背包.物品['lcq.item.liaoshang_yao']?.数量,1,'药消耗 1 份');
 assert.ok(h.save.角色.属性.气血.当前>30,'回血');
 if(b)assert.equal(b.state.beat,beat+1,'用掉一拍');
});
test('开战前先调一次 beforeCombat（战外档），拿到的是开战前的存档', async()=>{
 enable();const h=harness(await f03());let got=null;h.deps.beforeCombat=async s=>{got=s;};
 await host.submitSceneInput(h.save,'我守住队伍保护凝羽',h.deps);
 assert.ok(got,'调用了战前存档');assert.ok(!ext.activeScene(got),'战外档里没有进行中的场面');
});
