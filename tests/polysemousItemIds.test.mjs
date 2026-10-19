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
 assert.ok(!ids.includes('lyg.item.np049'));
 assert.ok(ids.includes('lyg.item.np071'),'np071 现在只代表六识禁绝丹（黎锦香/义姁持有的那颗并回本家，2026-10-16 17:20）');
 assert.equal(nameAt('lyg.item.np071','lyg.changgan_begins'),'六识禁绝丹');
 assert.equal(nameAt('lyg.item.np107','lyg.changgan_begins'),'手提箱');
 assert.equal(nameAt('lyg.item.np127','lyg.changgan_begins'),'空心针');
 const held=cb.canon.characters.find(c=>c.itemIds?.includes('lyg.item.np127'));assert.ok(held,'义姁持有空心针');
 assert.ok(cb.rules.contentAccess.some(e=>e.contentId==='lyg.item.np107'),'手提箱的独占规则跟着改指');
 assert.ok(!cb.rules.contentAccess.some(e=>e.contentId==='lyg.item.np049'));
 const lc=stage('lyl.luoyang_coup'),lcIds=lc.content.items.map(r=>r.id);
 assert.ok(lcIds.includes('lyl.item.np053')&&!lcIds.includes('lyl.item.np056'),'本关的假死药原为 np056，文字相同并入 np053（第四轮）');
 assert.equal(nameAt('lyl.item.np053','lyl.luoyang_coup'),'假死药');
 assert.equal(nameAt('lyl.item.np050','lyl.luoyang_coup'),'求子仙符（假）');
 assert.equal(nameAt('lyl.item.np047','lyl.luoyang_coup'),'奴隶烙印');
});

test('luoyang_coup 连锁：每个引用在本关解析出的名称 = 总表主定义名，关卡里没有重复 id',()=>{
 const lc=stage('lyl.luoyang_coup'),ids=lc.content.items.map(r=>r.id);
 assert.equal(new Set(ids).size,ids.length);
 for(const id of ids)assert.equal(nameAt(id,'lyl.luoyang_coup'),byId.get(id).definition.name,id);
 const player=lc.canon.characters.find(c=>c.itemIds?.includes('lyl.item.np050'));
 assert.ok(player&&player.itemIds.includes('lyl.item.np053')&&!player.itemIds.includes('lyl.item.np056'),'开局持有者同时拿求子仙符（假）np050 和假死药 np053（原 np056，第四轮并入）');
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
  assert.equal(def.name,r.name,where);assert.equal(def.description,r.unifiedDescription??r.description,where); // 珊瑚匕首/青龙偃月刀由用户统一描述（unifiedDescription）
  assert.ok(stage(r.stage).content.items.some(x=>x.id===r.finalId),`${where}: 关卡没有引用 ${r.finalId}`);
 }
 assert.equal(ledger.filter(r=>r.verdict==='split').length,10);
});

const SPLIT={ // 保持独立的新拆 id → [名称, 引用它的关卡, 这些关卡里不再引用的旧 id]；其余 6 个新拆 id 已在 2026-10-16 17:20 并回本家（见下方「第三轮」）
 'lcq.item.backpack_plain':['背包',{'lcq.stage_02':'lcq.item.backpack'}],
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
 assert.deepEqual(stage('lyg.changgan_begins').canon.characters.filter(c=>c.itemIds?.includes('lyg.item.np071')).map(c=>c.name).sort(),['义姁','黎锦香']);
});

test('并回带标签本家后，带标签的条目没有新增：原 5 件（假死药 np056 并入 np053）＋ 2026-10-19 麻古（#177）与新增五件药',()=>{
 const tags=items.entries.filter(e=>e.definition.effectTags!==undefined||e.definition.onUse!==undefined).map(e=>e.id).sort();
 assert.deepEqual(tags,['lcq.item.jinchuang_yao','lcq.item.jiuzhuan_huanhun_dan','lcq.item.liaoshang_yao','lcq.item.np006','lcq.item.np013','lcq.item.qiannian_renshen','lcq.item.tianshan_xuelian','lyg.item.np049','lyg.item.np071','lyg.item.np092','lyl.item.np053']);
 assert.deepEqual(byId.get('lyg.item.np071').definition.effectTags,['sedative']);assert.deepEqual(byId.get('lcq.item.np013').definition.effectTags,['antidote']);
 assert.deepEqual(auditEntityCatalog().errors,[]);
});

// ───── 第三轮（2026-10-16 17:20）：文字相同才合并；龙珠清掉 ─────
const MERGED={ // 已删除的 id → 并入的 id
 'lyg.item.six_sense_seal_pill':'lyg.item.np071','lcq.item.zhulu_snake_pill':'lcq.item.np013','lcq.item.np016':'lcq.item.np013',
 'lcq.item.np001':'lcq.item.zipper','lcq.item.np005':'lcq.item.np006','lyg.item.np016':'lyg.item.np017',
 'lyg.item.green_dragon_blade_huaxiong':'liuchao.item.green_dragon_sword',
 'lyg.item.np066':'liuchao.item.coral_dagger','lyl.item.coral_dagger':'liuchao.item.coral_dagger','lyl.item.np027':'liuchao.item.coral_dagger',
 'lyl.item.coral_dagger_from_xiao_yaoyi':'liuchao.item.coral_dagger','lyl.item.coral_dagger_carried':'liuchao.item.coral_dagger','lyl.item.coral_dagger_cuts_vine':'liuchao.item.coral_dagger',
 // 第四轮（用户裁定）：点名四组之外 31 组名称+描述逐字相同的 id 对
 'lcq.item.np002':'lcq.item.zipper','lcq.item.np004':'lcq.item.np003',
 'lyg.item.np001':'lyg.item.np002','lyg.item.np006':'lyg.item.np007','lyg.item.np012':'lyg.item.np013','lyg.item.np024':'lyg.item.np025','lyg.item.np030':'lyg.item.np031','lyg.item.np035':'lyg.item.np038','lyg.item.np040':'lyg.item.np043','lyg.item.np055':'lyg.item.np076','lyg.item.np056':'lyg.item.np077','lyg.item.np058':'lyg.item.np079','lyg.item.np061':'lyg.item.np083','lyg.item.np062':'lyg.item.np084',
 'lyl.item.np002':'lyl.item.np048','lyl.item.np030':'lyl.item.np048','lyl.item.np026':'lyl.item.np025','lyl.item.np040':'lyl.item.np037','lyl.item.np042':'lyl.item.np039','lyl.item.np049':'lyl.item.np046','lyl.item.np056':'lyl.item.np053','lyl.item.np083':'lyl.item.np068','lyl.item.np084':'lyl.item.np069','lyl.item.np085':'lyl.item.np070','lyl.item.np074':'lyl.item.np086','lyl.item.np090':'lyl.item.np075','lyl.item.np093':'lyl.item.np078','lyl.item.np079':'lyl.item.np101','lyl.item.np095':'lyl.item.np080','lyl.item.np081':'lyl.item.np096','lyl.item.np082':'lyl.item.np097','lyl.item.np099':'lyl.item.np094',
};
test('第三轮：被并走的 id 和龙珠不再出现在总表、关卡引用、人物持有、独占规则里',()=>{
 const gone=[...Object.keys(MERGED),'lyg.item.dragon_pearl'];
 for(const id of gone)assert.ok(!byId.has(id),`${id} 应已从总表删除`);
 const access=J('mod-kit/entity-catalog/stage-access.json');
 for(const st of Object.keys(access.stages)){
  const mod=stage(st),text=JSON.stringify([mod.content,mod.canon.characters.map(c=>c.itemIds),mod.rules?.contentAccess]);
  for(const id of gone)assert.ok(!text.includes(`"${id}"`),`${st} 仍有 ${id}`);
 }
 for(const [from,to] of Object.entries(MERGED))assert.ok(Object.values(access.stages).some(a=>a.items.some(r=>r.id===to)),`${to} 至少被一关引用`);
 assert.ok(!items.entries.some(e=>e.deprecated||e.deprecatedNote),'总表里没有弃用占位');
});

test('第三轮：同文字多 id 并回一个——拉链/麻古/朱箓蛇丹/武穆秘籍各组只剩一个 id，且各组原有关卡都引用它',()=>{
 const accessIds=st=>stage(st).content.items.map(r=>r.id);
 for(const [id,name] of [['lcq.item.zipper','拉链'],['lcq.item.np006','麻古'],['lcq.item.np013','朱箓蛇丹'],['lyg.item.np017','武穆秘籍'],['lyg.item.np071','六识禁绝丹']])assert.equal(byId.get(id).definition.name,name,id);
 assert.deepEqual(['lcq.stage_02','lcq.stage_04'].filter(st=>accessIds(st).includes('lcq.item.zipper')),['lcq.stage_02','lcq.stage_04']);
 assert.ok(accessIds('lcq.stage_04').includes('lcq.item.np013')&&accessIds('lcq.stage_03b_snake_flower_bridge').includes('lcq.item.np013'));
 assert.ok(accessIds('lyg.changgan_begins').includes('lyg.item.np017'),'changgan_begins 的武穆秘籍并到 np017');
 for(const st of ['lyg.changgan_begins','lyg.dingtao_beijing','lyg.mijing_rumen'])assert.ok(accessIds(st).includes('lyg.item.np071'),`${st} 的六识禁绝丹并回 np071`);
 assert.deepEqual(byId.get('lyg.item.np071').definition.onUse.map(x=>x.statusId),['sense.impaired','mind.confused'],'沿用 np071 原有标签，不新增');
});

test('第三轮：青龙偃月刀两个 id（普通版/珊瑚铁强化版），珊瑚匕首统一为一个通用条目',()=>{
 const sword=byId.get('liuchao.item.green_dragon_sword').definition,strong=byId.get('liuchao.item.qinglong_saber').definition;
 assert.equal(sword.name,'青龙偃月刀');assert.equal(sword.description,'云丹琉的家传兵器');
 assert.equal(strong.name,'青龙偃月刀');assert.equal(strong.description,'云丹琉使用的长刀，由珊瑚铁强化过。');
 assert.deepEqual(items.entries.filter(e=>e.definition.name==='青龙偃月刀').map(e=>e.id).sort(),['liuchao.item.green_dragon_sword','liuchao.item.qinglong_saber']);
 assert.ok(stage('lyg.dingtao_beijing').content.items.some(r=>r.id==='liuchao.item.green_dragon_sword'),'华雄那条并入普通版');
 assert.deepEqual(items.entries.filter(e=>e.definition.name==='珊瑚匕首').map(e=>e.id),['liuchao.item.coral_dagger']);
 assert.equal(byId.get('liuchao.item.coral_dagger').definition.description,'锋利异常的珊瑚铁匕首，能斩断赤阳藤等坚韧物体');
 const dagger=byId.get('liuchao.item.coral_dagger').definition;
 assert.equal(dagger.grade,'中品','珊瑚匕首品阶改回原 lyg.item.np066 那一档');
 assert.deepEqual(dagger.attributeBonus,{气血上限:30,后天六司:{根骨:4}});
 assert.ok(!dagger.skillIds?.length&&dagger.techniqueId===undefined,'被并走变体的功法/技能链接不挂回通用条目');
 for(const st of ['lcq.stage_04b_lingfei_baiyi_crisis','lyg.buddhist_conspiracy','lyl.taiquan_core_conflict','lyl.jiangzhou_retreat','lyl.luoyang_coup'])assert.ok(stage(st).content.items.some(r=>r.id==='liuchao.item.coral_dagger'),st);
});

test('第四轮：总表里不再有名称+描述逐字相同的两个 id；拉链与假死药的合并目标/标签与引用一致',()=>{
 const seen=new Map();
 for(const e of items.entries){const k=`${e.definition.name}\u0001${e.definition.description}`;assert.ok(!seen.has(k),`${seen.get(k)} 与 ${e.id} 名称+描述逐字相同，应已合并`);seen.set(k,e.id);}
 assert.ok(stage('lcq.stage_01').content.items.some(r=>r.id==='lcq.item.zipper'),'lcq.stage_01 的拉链改指运行时 ZIPPER_ITEM_ID');
 assert.ok(!stage('lcq.stage_01').canon.characters.some(c=>c.itemIds?.includes('lcq.item.np002')));
 assert.deepEqual(byId.get('lyl.item.np053').definition.effectTags,['sedative']);
 assert.deepEqual(byId.get('lyl.item.np053').definition.onUse,[{statusId:'unconscious'}]);
 assert.ok(Object.values(J('mod-kit/entity-catalog/stage-access.json').stages).some(a=>a.items.some(r=>r.id==='lyl.item.np053')),'假死药 np053 仍被关卡引用');
});
