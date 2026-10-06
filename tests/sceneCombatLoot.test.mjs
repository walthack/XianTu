import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadTs} from './loadTs.mjs';
const {resolveScenarioContent}=await loadTs('../src/modules/scenarioMods/entityCatalog.ts');
const mod=await loadTs('../src/modules/sceneModule/index.ts'),registry=await loadTs('../src/modules/sceneModule/contracts/registry.ts');
const loot=await loadTs('../src/modules/sceneModule/host/loot.ts'),ext=await loadTs('../src/modules/sceneModule/host/ext.ts');
const wb=await loadTs('../src/modules/sceneModule/host/writeback.ts');
const drops=await loadTs('../src/modules/scenarioMods/locationLoot.ts');
const equip=await loadTs('../src/utils/equipmentBonusApplier.ts');
const factors=await loadTs('../src/modules/sceneModule/host/factors.ts');
async function fixture(){
 const d=resolveScenarioContent(JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_05b.json',import.meta.url),'utf8')));
 return {角色:{身份:{先天六司:{气运:5},后天六司:{根骨:3}},属性:{气血:{当前:100,上限:100}},位置:{地点ID:'liuchao.location.gui_wang_gong',描述:'南荒·鬼王宫'},背包:{物品:{}},效果:[]},系统:{扩展:{},历史:{叙事:[]}},世界:{状态:{剧本模组:{canon:{items:d.content.items,locations:d.canon.locations},flags:{},worldTurn:1}}}};
}
const rt=s=>s.世界.状态.剧本模组;
test('F10 rewards settle once, but palace search independently grants each reward item once',async()=>{
 const c=registry.sceneContractById('combat.f10.ghost_king_clash');
 for(const itemId of [loot.BROKEN_AXE,loot.NICHE_CRYSTAL]){
  const save=await fixture(),state=mod.beginScene(c).state;state.status='decided';state.outcome={kind:'win',reason:'fixture'};
  const closed=mod.closeScene(c,state,{factors:0});wb.applyWriteBack(save,c,closed.state,closed.writeBack);wb.applyWriteBack(save,c,closed.state,closed.writeBack);
  assert.equal(save.角色.背包.物品[itemId].数量,1);assert.equal(rt(save).inventoryTransferReceipts.length,2);
  const table={version:1,rules:{maxSearches:3,commonSlots:[],rareChance:1,largeCurrencyChance:0,maxCopperPerSearch:80},locations:{'liuchao.location.gui_wang_gong':{name:'宫内',status:'ready',entries:[{id:'prize',itemId,category:'rare',once:true,quantity:[1,1]}]}}};
  assert.equal(drops.settleLocationLoot(save,table).receipt.drops[0].itemId,itemId);assert.equal(save.角色.背包.物品[itemId].数量,2);
  delete save.角色.背包.物品[itemId];rt(save).worldTurn++;assert.equal(drops.settleLocationLoot(save,table).receipt.drops.length,0,'search itself still does not refresh after consumption');
 }
});
test('broken axe adds reversible HP/root, only smash action bonus, dodge penalty and two-handed exclusion',async()=>{
 const save=await fixture(),c=registry.sceneContractById('combat.f10.ghost_king_clash'),s=mod.beginScene(c).state;s.status='decided';s.outcome={kind:'win',reason:'fixture'};
 const closed=mod.closeScene(c,s,{factors:0});wb.applyWriteBack(save,c,closed.state,closed.writeBack);
 const before=factors.sceneContext(save,c,'我砸开障碍');save.角色.背包.物品[loot.BROKEN_AXE].已装备=true;
 assert.equal(equip.applyEquipmentBonus(save,loot.BROKEN_AXE),true);assert.equal(save.角色.属性.气血.上限,115);assert.equal(save.角色.身份.后天六司.根骨,5);
 const smash=factors.sceneContext(save,c,'我砸开障碍'),other=factors.sceneContext(save,c,'我观察');
 assert.equal(smash.factors-other.factors,1);assert.ok(smash.breakdown.defense.some(f=>f.value===-1&&f.label==='双手兵器闪避'));
 save.角色.背包.物品.dual={物品ID:'dual',名称:'双刀',数量:1,已装备:false};assert.equal(loot.twoHandConflict(save,'dual'),true);
 save.角色.背包.物品[loot.BROKEN_AXE].已装备=false;save.角色.背包.物品.dual.已装备=true;assert.equal(loot.twoHandConflict(save,loot.BROKEN_AXE),true);
 equip.removeEquipmentBonus(save,loot.BROKEN_AXE);assert.equal(save.角色.属性.气血.上限,100);assert.equal(save.角色.身份.后天六司.根骨,3);
});
test('palace crystal choice persists without rolling; defense applies on exactly the next player defense',async()=>{
 let save=await fixture();const c=registry.sceneContractById('combat.f10.ghost_king_clash');
 save.角色.背包.物品[loot.NICHE_CRYSTAL]={物品ID:loot.NICHE_CRYSTAL,数量:1};
 const a=ext.newActive({contractId:c.meta.id,eventId:c.meta.hook.eventId,actionId:c.meta.hook.actionId,playerLine:'',state:mod.beginScene(c,{forced:{defense:Array(10).fill(20)}}).state,narrativeIndex:0});ext.writeExt(save,{...ext.readExt(save),active:a});
 const before=structuredClone(a.state.cursors);await loot.useNicheCrystal(save,'defense',{persist:async s=>{save=s;}});
 assert.equal(save.角色.背包.物品[loot.NICHE_CRYSTAL],undefined);assert.deepEqual(ext.activeScene(save).state.cursors,before);
 const enemy=await loadTs('../src/modules/sceneModule/enemy.ts');const state=ext.activeScene(save).state;state.beat=2;state.present.dan_chen=true;
 const first=enemy.resolveEnemyPhase(c,state,{factors:0,playerDefense:0});assert.ok(first.rolls.some(r=>r.target==='pc'&&r.defenseBonus===2));assert.equal(state.itemEffects.defenseBonus,undefined);
 const second=enemy.resolveEnemyPhase(c,state,{factors:0,playerDefense:0});assert.ok(second.rolls.filter(r=>r.target==='pc').every(r=>r.defenseBonus===0));
});
test('crystal downgrades only one external injury; no internal downgrade or use outside palace',async()=>{
 const statuses=await loadTs('../src/modules/sceneModule/statuses.ts'),c=registry.sceneContractById('combat.f10.ghost_king_clash'),s=mod.beginScene(c).state;s.itemEffects={woundGuard:true};
 statuses.applyStatus(s,c,{},'pc',{status:'wound.internal'},{cause:'combat',sourceId:'test'});assert.equal(s.itemEffects.woundGuard,true);
 statuses.applyStatus(s,c,{},'pc',{status:'wound.external.heavy'},{cause:'combat',sourceId:'test'});assert.equal(s.statuses.pc.find(x=>x.id==='wound.external')?.id,'wound.external');assert.equal(s.itemEffects.woundGuard,undefined);
 statuses.applyStatus(s,c,{},'pc',{status:'wound.external'},{cause:'combat',sourceId:'test'});assert.ok(s.statuses.pc.some(x=>x.id==='wound.external.heavy'));
 const save=await fixture();save.角色.背包.物品[loot.NICHE_CRYSTAL]={数量:1};save.角色.位置.地点ID='liuchao.location.wuyuan';save.角色.位置.描述='中州·五原';
 ext.writeExt(save,{...ext.readExt(save),active:ext.newActive({contractId:c.meta.id,eventId:c.meta.hook.eventId,actionId:c.meta.hook.actionId,playerLine:'',state:s,narrativeIndex:0})});
 assert.equal(loot.canUseNicheCrystal(save),false);await assert.rejects(loot.useNicheCrystal(save,'wound',{persist:async()=>{throw Error('must not persist');}}),/宫内/);assert.equal(save.角色.背包.物品[loot.NICHE_CRYSTAL].数量,1);
});
