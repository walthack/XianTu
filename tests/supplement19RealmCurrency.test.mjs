import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {loadTs} from './loadTs.mjs';
const realm=await loadTs('../src/utils/realmUtils.ts');
const levels=await loadTs('../src/modules/scenarioMods/levelProgression.ts');
const nums=await loadTs('../src/modules/sceneModule/numbers.ts');
const currency=await loadTs('../src/utils/currencySystem.ts');
const core=await loadTs('../src/modules/sceneModule/index.ts');
const registry=await loadTs('../src/modules/sceneModule/contracts/registry.ts');
const presence=await loadTs('../src/modules/scenarioMods/presence.ts');
const mod=async id=>JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`,import.meta.url),'utf8'));
function save(level=2,canon=2){return {角色:{属性:{境界:levels.realmAt(level)}},系统:{难度设置:{...levels.DIFFICULTY_PRESETS.标准}},世界:{状态:{剧本模组:{canon:{characters:[{id:'liuchao.character.cheng_zongyang',level:canon}]}}}}};}
test('canonical level names and full phase labels; old cultivation names are never inferred',()=>{
 assert.equal(realm.LEVELS.length,10);assert.equal(realm.levelOf('化神'),null);
 for(const l of realm.LEVELS)assert.equal(realm.levelOf(l.name),l.level);
 assert.equal(realm.formatRealmWithStage({名称:'通幽',阶段:'中期'}),'通幽·中期');
 assert.deepEqual(['初期','中期','后期'].map(阶段=>realm.stageBonus({阶段})),[0,1,2]);
 for(const [own,other,want]of [[3,2,4],[2,3,-4],[4,2,12],[1,4,-12],[3,3,0]])assert.equal(realm.levelModifier(own,other),want);
});
test('numeric configuration is validated before mutation; H1 API updates existing readers',()=>{
 const previous=structuredClone(nums.GAME_NUMBERS);
 try{nums.applyGameNumbers({levels:{gapOne:5},currency:{'liuchao.currency.jin_zhu':2200}});assert.equal(realm.levelModifier(2,1),5);assert.equal(currency.DEFAULT_CURRENCIES.金铢.价值度,2200);
 const now=structuredClone(nums.GAME_NUMBERS);assert.throws(()=>nums.applyGameNumbers({levels:{gapOne:'bad'}}));assert.deepEqual(nums.GAME_NUMBERS,now);
 }finally{nums.applyGameNumbers(previous);}
});
test('default difficulty belongs to each save; auto raise never lowers and strict never auto raises',()=>{
 const a=save(1,3),b=save(4,3);levels.initializeLevel(a);levels.initializeLevel(b);assert.equal(realm.levelOf(a.角色.属性.境界),3);assert.equal(realm.levelOf(b.角色.属性.境界),4);
 const strict=save(1,3);strict.系统.难度设置={...levels.DIFFICULTY_PRESETS.严苛};levels.initializeLevel(strict);assert.equal(realm.levelOf(strict.角色.属性.境界),1);levels.applyStoryLevel(strict,3);assert.equal(realm.levelOf(strict.角色.属性.境界),2);
});
test('training advances phases; only explicit full-phase breakthrough raises a level within cap',()=>{
 const s=save(1,2),r=s.角色.属性.境界;r.当前进度=r.下一级所需-10;
 let next=levels.trainingRealm(s,'我练功','success');assert.equal(next.阶段,'中期');assert.equal(next.当前进度,0);
 s.角色.属性.境界={...next,阶段:'后期',当前进度:next.下一级所需};next=levels.trainingRealm(s,'我冲关','success');assert.equal(realm.levelOf(next),2);assert.equal(next.阶段,'初期');
 s.角色.属性.境界={...levels.realmAt(2),阶段:'后期',当前进度:300};assert.equal(levels.trainingRealm(s,'我冲关','success'),null);
 s.系统.难度设置.trainingCap='none';assert.equal(realm.levelOf(levels.trainingRealm(s,'我冲关','success')),3);
 assert.equal(levels.trainingRealm(s,'我冲关','failure').当前进度,nums.GAME_NUMBERS.training.progressPerLevel*nums.GAME_NUMBERS.training.failureRetention);
 assert.equal(levels.trainingRealm(s,'我闲聊','success'),null);
});
test('currency authority has no stone assets and one gold equals 20 silver or 2000 copper',()=>{
 const b={货币:{金铢:{数量:10,价值度:1}},灵石:{下品:500}};currency.normalizeBackpackCurrencies(b);assert.equal(b.灵石,undefined);
 assert.equal(b.货币.金铢.数量,10);assert.equal(b.货币.金铢.价值度,2000);
 assert.equal(currency.DEFAULT_CURRENCIES.金铢.价值度/currency.DEFAULT_CURRENCIES.银铢.价值度,20);
 assert.deepEqual(Object.keys(currency.DEFAULT_CURRENCIES).sort(),['铜铢','银铢','金铢'].sort());
});
test('F13 loss beats simultaneous full hold; no loss and full hold wins',()=>{
 const c=registry.sceneContractById('combat.f13.ghost_king_final');let s=core.beginScene(c,{seed:12}).state;
 s.tracks.well_front.hold=3;s.tracks.well_front.breach=3;assert.equal(core.isLost(c,s),true);assert.equal(core.isWon(c,s),false);
 s.tracks.well_front.breach=0;assert.equal(core.isWon(c,s),true);
 s.statuses.pc=[{id:'incapacitated',appliedBeat:1,expiresBeat:null,cause:'combat'}];assert.equal(core.isWon(c,s),false);
});
test('stage05 keeps all frozen events and dependencies, marking only Qingyu historical duplicates',async()=>{
 const d=await mod('lcq.stage_05');assert.equal(d.scenario.events.length,17);
 const pairs={s05_01:'haishen_hall_merfolk',s05_02:'pull_harpoon_lemingzhu',s05_08:'ruins_ghost_warriors',s05_05:'wuerlang_slays_dagu',s05_09:'yiyang_repels_yinsha'};
 for(const [old,current]of Object.entries(pairs))assert.equal(d.scenario.events.find(e=>e.id==='lcq.event.'+old).supersededBy.eventId,'lcq.event.'+current);
 const lyl=await mod('lyl.luoyang_cloud_secret');assert.ok(!lyl.scenario.events.some(e=>e.supersededBy));
});
test('six minimal cards record original identities and times; stone guard cannot stay after chapter73',async()=>{
 const d=await mod('lcq.stage_04b_lingfei_baiyi_crisis'),chars=d.canon.characters;
 const stone=chars.find(c=>c.id==='lcq.character.nanhuang_shigang');assert.equal(stone.presenceWindow.lastPresentChapter,73);assert.match(stone.description,/白湖商馆/);
 const snake=chars.find(c=>c.id==='lcq.character.nanhuang_shekui');assert.match(snake.description,/阁罗.*随从/);assert.doesNotMatch(snake.description,/巫师/);
 const rt={modId:d.manifest.id,canon:{characters:chars},events:[{id:'lcq.event.test',axisAnchor:'第74章'}],activeEventIds:['lcq.event.test'],flags:{}};
 assert.ok(presence.departedPresentNames(rt).includes('石刚'));
 const black=chars.find(c=>c.id==='lcq.character.nanhuang_heishe');assert.ok(!JSON.stringify(black).includes('小紫杀'));
});
