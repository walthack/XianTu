import test from 'node:test';
import assert from 'node:assert/strict';
import {makeContract,mod} from './sceneModuleFixture.mjs';
import {loadTs} from './loadTs.mjs';
const free=await loadTs('../src/modules/sceneModule/host/freeTextStatus.ts');
const injuries=await loadTs('../src/modules/sceneModule/host/injuries.ts');
const writeback=await loadTs('../src/modules/sceneModule/host/writeback.ts');
const reconciler=await loadTs('../src/utils/narrativeStateReconciler.ts');
const {updateStatusEffects}=await loadTs('../src/utils/statusEffectManager.ts');
const {createMinimalSaveDataV3}=await loadTs('../src/utils/dataRepair.ts');

const HERO='test.character.hero';
function save(){const s=createMinimalSaveDataV3();s.世界.状态.剧本模组={modId:'lcq.stage_04',flags:{},canon:{characters:[],locations:[]},events:[],completedEventIds:[],activeEventIds:[],opening:{text:'',playerCharacterId:HERO}};return s;}
const rt=s=>s.世界.状态.剧本模组;
const def=id=>mod.catalogStatus(id);
const judge=(narrative,input='')=>free.adjudicateFreeTextStatuses(narrative,input);
const minutesLater=(s,m)=>{const t=s.元数据.时间,total=t.小时*60+t.分钟+m;t.日+=Math.floor(total/1440);t.小时=Math.floor(total%1440/60);t.分钟=total%60;};
const mount=(s,narrative,input='')=>reconciler.reconcilePlayerFreeTextStatuses({saveDataBefore:structuredClone(s),saveData:s,text:narrative,commands:[],userAction:input});

test('rerun4 #6: player input 「喝得酩酊大醉」 mounts 醉酒 by alias, even when the narrative does not repeat the word',()=>{
 assert.deepEqual(judge('你提起酒坛仰头便灌，山风吹得脸上发烫。','我坐在山涧边喝得酩酊大醉'),['drunk']);
 assert.deepEqual(judge('','喝得酩酊大醉'),['drunk']);
 assert.deepEqual(judge('你连饮三坛，已是酩酊。'),['drunk'],'subject carries over inside one sentence');
});

test('code adjudication: other people, negation, pretence and narrative denial never mount',()=>{
 assert.deepEqual(judge('','我把他灌得大醉'),[]);
 assert.deepEqual(judge('','我假装喝醉，眯眼看她'),[]);
 assert.deepEqual(judge('你只抿了两口，并未喝醉。','我喝得酩酊大醉'),[],'narrative denial vetoes the player claim');
 assert.deepEqual(judge('她喝得酩酊大醉，伏在桌上。'),[]);
 assert.deepEqual(judge('你看着他身上的刀伤。'),[]);
 assert.deepEqual(judge('你担心自己会头晕目眩。'),[]);
});

test('narrative-only statuses mount from the story text, not from the player claim',()=>{
 assert.deepEqual(judge('他一拳砸在你额角，你眼冒金星。'),['dizzy']);
 assert.deepEqual(judge('','我头晕目眩'),[],'dizzy is narrative-only');
 assert.deepEqual(judge('你左臂骨裂，伤口血流不止。').sort(),['bleeding','fracture']);
});

test('compliance marks: 被点穴 / 麻痹 / 昏迷 are never mountable from free text (mark only, no new mechanism)',()=>{
 for(const id of ['acupoint.sealed','paralyzed','unconscious']){assert.equal(def(id).freeText,undefined,id);assert.match(def(id).source,/不得用于把强迫情节做成可玩内容/);}
 assert.deepEqual(judge('你被点了穴道，浑身发麻，随即昏迷不醒。','我被点了穴道'),[]);
 for(const d of mod.STATUS_CATALOG.filter(d=>d.freeText))assert.equal(d.tier,'general',d.id);
});

test('mount writes 角色.效果 + ledger with catalog minutes; model pushes of mountable names are dropped',()=>{
 const s=save();
 s.角色.效果.push({状态名称:'阴阳调和',类型:'buff',生成时间:{...s.元数据.时间},持续时间分钟:120,状态描述:'x',来源:'本地判定'});
 const before=structuredClone(s);
 s.角色.效果.push({状态名称:'醉酒',类型:'debuff',生成时间:{...s.元数据.时间},持续时间分钟:99999,状态描述:'模型自挂',来源:'模型'});
 s.角色.效果.push({状态名称:'中毒',类型:'debuff',生成时间:{...s.元数据.时间},持续时间分钟:99999,状态描述:'模型自挂',来源:'模型'});
 const changes=reconciler.reconcilePlayerFreeTextStatuses({saveDataBefore:before,saveData:s,text:'你醉眼朦胧地靠在石壁上。',commands:[],userAction:'我喝得酩酊大醉'});
 assert.equal(changes.length,1);
 const names=s.角色.效果.map(e=>e.状态名称);
 assert.deepEqual(names,['阴阳调和','醉酒']);
 const drunk=s.角色.效果[1];
 assert.equal(drunk.持续时间分钟,def('drunk').afterScene.minutes);assert.equal(drunk.来源,'narrative:drunk');
 const rows=rt(s).sceneLedger.statusRecords.actors[HERO];
 assert.equal(rows.length,1);assert.equal(rows[0].statusId,'drunk');assert.equal(rows[0].expiresAt-rows[0].appliedAt,def('drunk').afterScene.minutes);
 // second hit refreshes instead of stacking
 minutesLater(s,60);mount(s,'','我又喝得大醉');
 assert.equal(s.角色.效果.filter(e=>e.状态名称==='醉酒').length,1);assert.equal(rt(s).sceneLedger.statusRecords.actors[HERO].length,1);
 assert.deepEqual(s.角色.效果[1].生成时间,s.元数据.时间);
 // no affirmation → nothing changes
 assert.deepEqual(mount(s,'你收起酒坛，继续赶路。','我起身赶路'),[]);
});

test('time removal off-scene: 醉酒 drops from 角色.效果 and ledger exactly at the catalog minutes',()=>{
 const s=save();mount(s,'','我喝得酩酊大醉');
 const m=def('drunk').afterScene.minutes;
 minutesLater(s,m-1);updateStatusEffects(s);assert.ok(s.角色.效果.some(e=>e.状态名称==='醉酒'));
 minutesLater(s,1);assert.deepEqual(updateStatusEffects(s).removedEffects,['醉酒']);
 assert.deepEqual(injuries.pruneSceneInjuries(s).actors[HERO],[]);
});

test('free-text status is restored into the next scene and counts in rolls',()=>{
 const s=save(),c=makeContract();mount(s,'','我喝得酩酊大醉');
 const state=mod.beginScene(c).state;injuries.restoreSceneInjuries(s,c,state);
 assert.ok(state.statuses.pc.some(x=>x.id==='drunk'));
 assert.equal(mod.statusRollModifier(state,c,undefined,'pc','action'),def('drunk').effects.find(e=>e.scope==='action').value);
});

test('time removal in-scene: 晕眩 expires after its durationBeats and leaves 角色.效果 at the next sync',()=>{
 const s=save(),c=makeContract();const state=mod.beginScene(c).state;
 mod.applyStatus(state,c,undefined,'pc',{status:'dizzy'},{cause:'combat',sourceId:'hit'});writeback.syncSceneStatuses(s,c,state);
 assert.ok(s.角色.效果.some(e=>e.状态名称==='晕眩'));
 const until=state.beat+def('dizzy').durationBeats;
 for(;state.beat<until;state.beat++)assert.deepEqual(mod.expireStatuses(state,c,undefined),[]);
 const gone=mod.expireStatuses(state,c,undefined);assert.deepEqual(gone.map(e=>[e.status,e.op]),[['dizzy','expire']]);
 writeback.syncSceneStatuses(s,c,state);
 assert.ok(!s.角色.效果.some(e=>e.状态名称==='晕眩'));assert.ok(!(rt(s).sceneLedger.statusRecords.actors[HERO] || []).length);
});

test('time removal after the scene: 晕眩 carried out of a scene ends after afterScene minutes',()=>{
 const s=save(),c=makeContract();const state=mod.beginScene(c).state;
 mod.applyStatus(state,c,undefined,'pc',{status:'dizzy'},{cause:'combat',sourceId:'hit'});writeback.syncSceneStatuses(s,c,state);
 const m=def('dizzy').afterScene.minutes;assert.equal(s.角色.效果.find(e=>e.状态名称==='晕眩').持续时间分钟,m);
 minutesLater(s,m-1);updateStatusEffects(s);assert.ok(s.角色.效果.some(e=>e.状态名称==='晕眩'));
 minutesLater(s,1);assert.deepEqual(updateStatusEffects(s).removedEffects,['晕眩']);
 assert.deepEqual(injuries.pruneSceneInjuries(s).actors[HERO],[]);
});

test('a short status carried into a new scene keeps its beat limit instead of lasting the whole scene',()=>{
 const s=save(),a=makeContract();let state=mod.beginScene(a).state;
 mod.applyStatus(state,a,undefined,'pc',{status:'dizzy'},{cause:'combat',sourceId:'hit'});writeback.syncSceneStatuses(s,a,state);
 const b=makeContract();b.meta.id='other_scene';state=mod.beginScene(b).state;injuries.restoreSceneInjuries(s,b,state);
 const row=state.statuses.pc.find(x=>x.id==='dizzy');assert.equal(row.expiresBeat,state.beat+def('dizzy').durationBeats);
 const wound=mod.beginScene(b).state;injuries.recordSceneInjuries(s,a,[{party:'pc',ref:HERO,status:'wound.external',label:'外伤',minutes:10080,cause:'combat'}]);
 injuries.restoreSceneInjuries(s,b,wound);assert.equal(wound.statuses.pc.find(x=>x.id==='wound.external').expiresBeat,null,'statuses without durationBeats stay scene-long');
});
