import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditEntityCatalog,variantIdentityErrors} from '../scripts/validate-entity-catalog.mjs';
const J=p=>JSON.parse(readFileSync(new URL(`../${p}`,import.meta.url),'utf8'));
const items=J('mod-kit/entity-catalog/items.json'),byId=new Map(items.entries.map(e=>[e.id,e]));
const cfg=J('mod-kit/entity-catalog/validation.config.json');
const stage=id=>J(`src/modules/scenarioMods/builtins/data/${id}.json`);
const nameAt=(id,stageId)=>(byId.get(id).stageVariants[stageId]||byId.get(id).definition).name;

test('总表：没有任何变体改名称/类型/描述，pendingRename 已清空',()=>{
 const left=[];
 for(const e of items.entries)for(const [st,v] of Object.entries(e.stageVariants))if(v.name!==e.definition.name||v.type!==e.definition.type||v.description!==e.definition.description)left.push(`${e.id}@${st}`);
 assert.deepEqual(left,[]);
 assert.deepEqual(cfg.variantIdentity.pendingRename,[]);
 assert.deepEqual(auditEntityCatalog().errors,[]);
});

test('校验规则：改名/改类型的变体被拦下；暂缓登记项与只改描述的变体放行',()=>{
 const entry={id:'x.item.a',definition:{id:'x.item.a',name:'驱毒丸',type:'consumable',description:'a'}};
 const identity={severity:'error',forbid:['name','type'],pendingRename:[{id:'x.item.a',stageId:'x.held'}]};
 assert.match(variantIdentityErrors(entry,'x.s1',{...entry.definition,name:'手提箱'},identity)[0],/x\.item\.a@x\.s1.*name.*驱毒丸→手提箱/);
 assert.match(variantIdentityErrors(entry,'x.s1',{...entry.definition,type:'weapon'},identity)[0],/type/);
 assert.deepEqual(variantIdentityErrors(entry,'x.s1',{...entry.definition,description:'b'},identity),[]);
 assert.deepEqual(variantIdentityErrors(entry,'x.held',{...entry.definition,name:'手提箱'},identity),[]);
});

test('三个目标 id：带标签的原 id 只保留原含义，错位的引用改指各自本家',()=>{
 for(const [id,name] of [['lyg.item.np049','驱毒丸（改良版）'],['lyg.item.np071','六识禁绝丹'],['lyl.item.np053','假死药']]){
  assert.deepEqual(byId.get(id).stageVariants,{});assert.equal(byId.get(id).definition.name,name);
 }
 const cb=stage('lyg.changgan_begins'),ids=cb.content.items.map(r=>r.id);
 assert.ok(ids.includes('lyg.item.np107')&&ids.includes('lyg.item.np127'));
 assert.ok(!ids.includes('lyg.item.np049')&&!ids.includes('lyg.item.np071'));
 assert.equal(nameAt('lyg.item.np107','lyg.changgan_begins'),'手提箱');
 assert.equal(nameAt('lyg.item.np127','lyg.changgan_begins'),'空心针');
 const held=cb.canon.characters.find(c=>c.itemIds?.includes('lyg.item.np127'));assert.ok(held,'义姁持有空心针');
 assert.ok(cb.rules.contentAccess.some(e=>e.contentId==='lyg.item.np107'),'手提箱的独占规则跟着改指');
 assert.ok(!cb.rules.contentAccess.some(e=>e.contentId==='lyg.item.np049'));
 const lc=stage('lyl.luoyang_coup'),lcIds=lc.content.items.map(r=>r.id);
 assert.ok(!lcIds.includes('lyl.item.np053'));
 assert.equal(nameAt('lyl.item.np050','lyl.luoyang_coup'),'求子仙符（假）');
 assert.equal(nameAt('lyl.item.np047','lyl.luoyang_coup'),'奴隶烙印');
});

test('luoyang_coup 连锁：每个引用在本关解析出的名称 = 总表主定义名，关卡里没有重复 id',()=>{
 const lc=stage('lyl.luoyang_coup'),ids=lc.content.items.map(r=>r.id);
 assert.equal(new Set(ids).size,ids.length);
 for(const id of ids)assert.equal(nameAt(id,'lyl.luoyang_coup'),byId.get(id).definition.name,id);
 const player=lc.canon.characters.find(c=>c.itemIds?.includes('lyl.item.np050'));
 assert.ok(player&&!player.itemIds.includes('lyl.item.np053'),'开局持有者拿的是求子仙符（假）而不是假死药');
});

test('无本家的名称新建语义 slug（同名同义共用一个），不再用 npNNN',()=>{
 for(const id of ['lyg.item.silver_dragon_scale_armor','lyg.item.broken_jade_pendant','lyg.item.wumu_manual_swapped','lyg.item.economy_sneakers','lyl.item.iron_rail','lyl.item.imperial_seal','lyl.item.tiger_tally']){
  const e=byId.get(id);assert.ok(e,id);assert.deepEqual(e.stageVariants,{});assert.ok(e.migratedFrom.length>=1);
 }
 assert.equal(byId.get('lyg.item.silver_dragon_scale_armor').migratedFrom.length,2);
});

test('所有关卡：每个引用在本关解析出的名称+描述都与总表主定义逐字一致，且没有重复 id',()=>{
 for(const st of Object.keys(J('mod-kit/entity-catalog/stage-access.json').stages)){
  const ids=stage(st).content.items.map(r=>r.id);assert.equal(new Set(ids).size,ids.length,st);
  for(const id of ids){
   const e=byId.get(id),at=e.stageVariants[st]||e.definition;
   assert.equal(at.name,e.definition.name,`${id}@${st}`);assert.equal(at.description,e.definition.description,`${id}@${st}`);
  }
 }
});

const ledger=J('docs/handoffs/2026-10-16/polysemy-review-rows.json');
test('复核台账（112 行）：变体原文的名称+描述与最终 id 的主定义逐字一致，关卡引用的是最终 id；不再有暂缓/待裁定',()=>{
 assert.equal(ledger.length,112);
 for(const r of ledger){
  const where=`${r.oldId}@${r.stage}`;
  assert.ok(['keep','split'].includes(r.verdict),`${where}: ${r.verdict}`);
  const def=byId.get(r.finalId)?.definition;assert.ok(def,`${where} → ${r.finalId}`);
  assert.equal(def.name,r.name,where);assert.equal(def.description,r.description,where);
  assert.ok(stage(r.stage).content.items.some(x=>x.id===r.finalId),`${where}: 关卡没有引用 ${r.finalId}`);
 }
 assert.equal(ledger.filter(r=>r.verdict==='split').length,10);
});

const SPLIT={ // 新拆出的独立 id → [名称, 引用它的关卡, 这些关卡里不再引用的旧 id]
 'lyg.item.six_sense_seal_pill':['六识禁绝丹',{'lyg.changgan_begins':'lyg.item.np068','lyg.dingtao_beijing':'lyg.item.np016','lyg.mijing_rumen':'lyg.item.np025'}],
 'lcq.item.zhulu_snake_pill':['朱箓蛇丹',{'lcq.stage_04':'lcq.item.np007'}],
 'lyg.item.green_dragon_blade_huaxiong':['青龙偃月刀',{'lyg.dingtao_beijing':'liuchao.item.green_dragon_sword'}],
 'lcq.item.backpack_plain':['背包',{'lcq.stage_02':'lcq.item.backpack'}],
 'lyl.item.coral_dagger_from_xiao_yaoyi':['珊瑚匕首',{'lyl.jiangzhou_retreat':'liuchao.item.coral_dagger'}],
 'lyl.item.coral_dagger_carried':['珊瑚匕首',{'lyl.lin_an_black_sea':'liuchao.item.coral_dagger','lyl.taiquan_expedition':'liuchao.item.coral_dagger'}],
 'lyl.item.coral_dagger_cuts_vine':['珊瑚匕首',{'lyl.taiquan_core_conflict':'lyl.item.coral_dagger'}],
};
test('复核后拆出的独立 id：不带 effectTags/onUse、没有变体，各关卡引用新 id 而不是原 id，持有者跟着改指',()=>{
 const ids=[...Object.keys(SPLIT),'lyg.item.silver_dragon_scale_armor','lyg.item.broken_jade_pendant','lyg.item.wumu_manual_swapped','lyg.item.economy_sneakers','lyl.item.iron_rail','lyl.item.imperial_seal','lyl.item.tiger_tally'];
 for(const id of ids){const e=byId.get(id);assert.ok(e,id);assert.equal(e.definition.effectTags,undefined,id);assert.equal(e.definition.onUse,undefined,id);assert.deepEqual(e.stageVariants,{},id);assert.ok(e.migratedFrom.length>=1,id);}
 for(const [id,[name,stages]] of Object.entries(SPLIT)){
  assert.equal(byId.get(id).definition.name,name);
  for(const [st,oldId] of Object.entries(stages)){
   const mod=stage(st);assert.ok(mod.content.items.some(r=>r.id===id),`${st} 应引用 ${id}`);
   assert.ok(!mod.content.items.some(r=>r.id===oldId),`${st} 不应再引用 ${oldId}`);
   assert.ok(mod.canon.characters.some(c=>c.itemIds?.includes(id)),`${st}: 应有人物持有 ${id}`);
   assert.ok(!mod.canon.characters.some(c=>c.itemIds?.includes(oldId)),`${st}: 不应再有人物持有 ${oldId}`);
   assert.ok(!(mod.rules?.contentAccess||[]).some(e=>e.contentId===oldId),`${st}: contentAccess 不应再指向 ${oldId}`);
  }
 }
 assert.ok(stage('lcq.stage_01').content.items.some(r=>r.id==='lcq.item.backpack'),'带背包内容的主定义关卡不受影响');
 assert.deepEqual(stage('lyg.changgan_begins').canon.characters.filter(c=>c.itemIds?.includes('lyg.item.six_sense_seal_pill')).map(c=>c.name).sort(),['义姁','黎锦香']);
});

test('原 id 的带标签本家不被扩大：带标签的药只存在于原有条目',()=>{
 const tags=items.entries.filter(e=>e.definition.effectTags!==undefined||e.definition.onUse!==undefined).map(e=>e.id);
 for(const id of ['lyg.item.six_sense_seal_pill','lcq.item.zhulu_snake_pill'])assert.ok(!tags.includes(id),id);
 for(const id of ['lyg.item.np071','lcq.item.np013','lcq.item.np016'])assert.ok(tags.includes(id),`${id} 仍带原标签`);
 assert.deepEqual(auditEntityCatalog().errors,[]);
});
