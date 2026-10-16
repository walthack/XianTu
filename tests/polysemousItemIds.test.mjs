import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditEntityCatalog,variantIdentityErrors} from '../scripts/validate-entity-catalog.mjs';
const J=p=>JSON.parse(readFileSync(new URL(`../${p}`,import.meta.url),'utf8'));
const items=J('mod-kit/entity-catalog/items.json'),byId=new Map(items.entries.map(e=>[e.id,e]));
const cfg=J('mod-kit/entity-catalog/validation.config.json');
const stage=id=>J(`src/modules/scenarioMods/builtins/data/${id}.json`);
const nameAt=(id,stageId)=>(byId.get(id).stageVariants[stageId]||byId.get(id).definition).name;

test('总表：变体只允许改描述/数值，不改名称与类型（暂缓项只能是配置里登记的那几条）',()=>{
 const left=[];
 for(const e of items.entries)for(const [st,v] of Object.entries(e.stageVariants))if(v.name!==e.definition.name||v.type!==e.definition.type)left.push(`${e.id}@${st}`);
 assert.deepEqual(left.sort(),cfg.variantIdentity.pendingRename.map(p=>`${p.id}@${p.stageId}`).sort());
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

test('所有关卡：每个非暂缓引用的关卡内含义与主定义一致（不再有多义 id）',()=>{
 const held=new Set(cfg.variantIdentity.pendingRename.map(p=>`${p.id}@${p.stageId}`));
 for(const st of Object.keys(J('mod-kit/entity-catalog/stage-access.json').stages))
  for(const r of stage(st).content.items)if(!held.has(`${r.id}@${st}`))assert.equal(nameAt(r.id,st),byId.get(r.id).definition.name,`${r.id}@${st}`);
});
