import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const st=await loadTs('../src/modules/sceneModule/statuses.ts');
const registry=await loadTs('../src/modules/sceneModule/contracts/registry.ts');
const nums=await loadTs('../src/modules/sceneModule/numbers.ts');
const reconciler=await loadTs('../src/utils/narrativeStateReconciler.ts');
const catalog=st.STATUS_CATALOG;
const def=id=>catalog.find(d=>d.id===id);
const full=id=>new RegExp(`^(?:${st.statusNamePattern(id)})$`);
const GENERIC=['wound.severe','weak.body','wound.soul','unconscious','poisoned','dying'];
const WUXIA=['wound.external','bleeding','fracture','dizzy','drunk','acupoint.sealed','paralyzed','qi.disordered'];
const TASK4=['wound.exhaustion','wound.blood_loss','wound.fright'];
const COMPLY='不得用于把强迫情节做成可玩内容';

test('catalog carries the 6 generic + 2 cold-poison + 8 wuxia statuses; optional ones are not added',()=>{
 for(const id of [...GENERIC,...WUXIA])assert.equal(def(id)?.tier,'general',id);
 for(const id of ['poison.cold','poison.cold.suppressed'])assert.equal(def(id)?.tier,'book',id);
 for(const id of ['qi.deviation','bound'])assert.equal(def(id),undefined,id);
});

test('task 4: 毒伤 merges into poisoned; 失血/真气透支/惊惧 become general with the same ids',()=>{
 assert.equal(def('wound.poison'),undefined);
 assert.match('毒伤',full('poisoned'));
 for(const id of TASK4){
  assert.equal(def(id).tier,'general',id);
  assert.ok(!(def(id).remove || []).some(r=>r.kind==='story'),id);
 }
 assert.equal(def('wound.blood_loss').upgradesTo,'dying');
 for(const name of ['失血','真气透支','惊惧'])assert.ok(TASK4.some(id=>full(id).test(name)),name);
});

test('general statuses never resolve through a story flag, and the shared status.treated flag is gone',()=>{
 for(const d of catalog){
  for(const rule of d.remove || [])assert.notEqual(rule.flag,'status.treated',d.id);
  if(d.tier==='general')for(const rule of d.remove || [])assert.ok(['time','rest','item'].includes(rule.kind),`${d.id}:${rule.kind}`);
 }
});

test('acupoint.sealed is not downed: disadvantage on both, action −2, 2 beats in scene',()=>{
 const d=def('acupoint.sealed');
 assert.ok(!d.effects.some(e=>e.kind==='downed'));
 assert.deepEqual(d.effects.filter(e=>e.kind==='disadvantage').map(e=>e.scope).sort(),['action','defense']);
 assert.ok(d.effects.some(e=>e.kind==='rollModifier' && e.scope==='action' && e.value===-2));
 assert.equal(d.durationBeats,2);
 const contract=registry.sceneContractById('combat.f01.iron_bridge'),state={beat:1,statuses:{}};
 st.applyStatus(state,contract,undefined,'pc',{status:'acupoint.sealed'},{cause:'combat',sourceId:'t'});
 assert.equal(st.isDowned(state,contract,undefined,'pc'),false);
 assert.equal(st.statusRollModifier(state,contract,undefined,'pc','action'),-2);
 state.beat=3;assert.equal(st.expireStatuses(state,contract,undefined).length,1);
});

test('upgrade links point at defined statuses; dead links to undecided ids are removed',()=>{
 for(const d of catalog)if(d.upgradesTo)assert.ok(def(d.upgradesTo) || st.BUILTIN_STATUSES.some(b=>b.id===d.upgradesTo),`${d.id} → ${d.upgradesTo}`);
 assert.equal(def('bleeding').upgradesTo,'wound.blood_loss');
 assert.equal(def('qi.disordered').upgradesTo,undefined);
 assert.equal(def('drunk').upgradesTo,'unconscious');
});

test('every label/alias maps to exactly one id',()=>{
 const owner=new Map();
 for(const d of [...catalog,...st.BUILTIN_STATUSES.filter(b=>!def(b.id))])for(const name of [d.label,...(d.aliases || [])]){
  assert.ok(!owner.has(name) || owner.get(name)===d.id,`${name}: ${owner.get(name)} / ${d.id}`);owner.set(name,d.id);
 }
});

test('aliases: 砍伤 joins the external-wound chain, 迷药 joins 昏迷',()=>{
 assert.match('砍伤',full('wound.external'));
 assert.equal(def('wound.external').upgradesTo,'wound.external.heavy');
 assert.match('被迷倒',full('unconscious'));assert.match('迷药发作',full('unconscious'));
 assert.doesNotMatch('醉意',full('drunk'));
});

test('compliance mark on 被点穴 / 昏迷(迷药) / 麻痹 only marks, adds no mechanism',()=>{
 for(const id of ['acupoint.sealed','unconscious','paralyzed'])assert.ok(def(id).source.includes(COMPLY),id);
});

test('recognition order: wound.soul before weak.body, dying before wound.severe',()=>{
 const run=text=>{
  const save={社交:{关系:{路人甲:{名字:'路人甲',当前状态:''}}}};
  reconciler.reconcilePartyNpcStateFromNarrative({saveDataBefore:structuredClone(save),saveData:save,text,commands:[]});
  return save.社交.关系.路人甲.当前状态;
 };
 assert.equal(run('路人甲神魂虚弱，靠在树下。'),'神魂虚弱，正在静养');
 assert.equal(run('路人甲体力不支，坐倒在地。'),'身体虚弱，正在休息');
 assert.equal(run('路人甲重伤垂危，命悬一线。'),'濒死，需立即救治');
 assert.equal(run('路人甲伤势沉重，被抬了下去。'),'身受重伤，需静养');
 assert.equal(run('路人甲被迷倒，不省人事。'),'昏迷未醒');
});

test('applyTuning: whitelisted numbers apply and pass lint',()=>{
 const before=registry.sceneContractById('combat.f10.ghost_king_clash');
 const r=registry.applyTuning({'combat.f10.ghost_king_clash':{
  goals:{subdue_alive:{baseDifficulty:7}},
  enemyActions:{bone_claw:{dc:8,schedule:{fromBeat:4,onBeats:[4,5]}}},
  parties:{hu_sha:{resistance:-2,tracks:{vit:{ceiling:2}}}},
  clock:{beats:3},
 }});
 assert.deepEqual(r,{ok:true,errors:[],contracts:['combat.f10.ghost_king_clash']});
 const c=registry.sceneContractById('combat.f10.ghost_king_clash');
 assert.notEqual(c,before);
 assert.equal(c.goals.find(g=>g.id==='subdue_alive').baseDifficulty,7);
 const claw=c.enemyActions.find(a=>a.id==='bone_claw');
 assert.equal(claw.attack.dc,8);assert.deepEqual(claw.schedule,{fromBeat:4,onBeats:[4,5]});
 assert.equal(c.parties.find(p=>p.id==='hu_sha').resistance,-2);
 // The previous contract object (an in-progress scene) keeps its values.
 assert.equal(before.enemyActions.find(a=>a.id==='bone_claw').attack.dc,15);
});

test('applyTuning rejects the whole file on any non-whitelisted path, bad value, unknown id or lint error',()=>{
 const snapshot=()=>JSON.stringify(registry.SCENE_CONTRACTS);
 const cases=[
  {'combat.f01.iron_bridge':{enemyActions:{assassins_attack:{dc:7,label:'改名'}}}},
  {'combat.f01.iron_bridge':{enemyActions:{assassins_attack:{dc:'7'}}}},
  {'combat.f01.iron_bridge':{goals:{no_such_goal:{baseDifficulty:5}}}},
  {'combat.f01.iron_bridge':{objective:{}}},
  {'combat.no_such':{clock:{beats:2}}},
  {'combat.f01.iron_bridge':{clock:{beats:0}}},
  {'combat.f02.snake_assault':{parties:{snake_man:{tracks:{vit:{ceiling:4}}}}}},
  {'combat.f02.snake_assault':{goals:{attack:{baseDifficulty:5}}},'combat.f01.iron_bridge':{enemyActions:{assassins_attack:{onHit:{statuses:[]}}}}},
  [],
 ];
 for(const tuning of cases){
  const before=snapshot(),r=registry.applyTuning(tuning);
  assert.equal(r.ok,false,JSON.stringify(tuning));assert.ok(r.errors.length);
  assert.equal(snapshot(),before,JSON.stringify(tuning));
 }
 assert.match(registry.applyTuning({'combat.f01.iron_bridge':{clock:{beats:0}}}).errors.join('\n'),/lint/);
});

test('builtin fallback statuses read their numbers from JSON, unchanged values',()=>{
 const b=id=>st.BUILTIN_STATUSES.find(d=>d.id===id);
 assert.equal(st.BUILTIN_STATUSES.length,6);
 assert.equal(b('wound.external.heavy').afterScene.minutes,30*24*60);
 assert.equal(b('wound.internal').effects[0].value,-2);
 assert.equal(b('off_balance').durationBeats,1);
});

test('applyTuning numbers/statuses: goes through applyGameNumbers and the status catalog',()=>{
 const numbers=structuredClone(nums.GAME_NUMBERS),fracture=structuredClone(def('fracture')),dizzy=structuredClone(def('dizzy'));
 try{
  const r=registry.applyTuning({numbers:{levels:{gapOne:5},combat:{baselineDc:12}},statuses:{fracture:{action:-3,timeMinutes:20000,afterSceneMinutes:20000},dizzy:{durationBeats:1}}});
  assert.deepEqual(r,{ok:true,errors:[],contracts:[]});
  assert.equal(nums.GAME_NUMBERS.levels.gapOne,5);assert.equal(nums.GAME_NUMBERS.combat.baselineDc,12);
  const contract=registry.sceneContractById('combat.f01.iron_bridge'),state={beat:1,statuses:{}};
  st.applyStatus(state,contract,undefined,'pc',{status:'fracture'},{cause:'combat',sourceId:'t'});
  assert.equal(st.statusRollModifier(state,contract,undefined,'pc','action'),-3);
  assert.equal(def('fracture').remove.find(r=>r.kind==='time').minutes,20000);
  assert.equal(def('dizzy').durationBeats,1);
 }finally{
  nums.applyGameNumbers(numbers);
  catalog[catalog.findIndex(d=>d.id==='fracture')]=fracture;catalog[catalog.findIndex(d=>d.id==='dizzy')]=dizzy;
 }
});

test('applyTuning numbers/statuses: any bad entry rejects the whole file and rolls numbers back',()=>{
 const snap=()=>JSON.stringify([nums.GAME_NUMBERS,catalog,st.BUILTIN_STATUSES,registry.SCENE_CONTRACTS]);
 const cases=[
  {numbers:{levels:{gapOne:'4'}}},
  {numbers:{levels:{noSuch:1}}},
  {numbers:{levels:{gapOne:5}},statuses:{fracture:{label:'改名'}}},
  {numbers:{levels:{gapOne:5}},'combat.f01.iron_bridge':{clock:{beats:0}}},
  {statuses:{no_such:{action:-1}}},
  {statuses:{fracture:{action:-1.5}}},
  {statuses:{bleeding:{defense:-1}}},
  {statuses:{fracture:{durationBeats:2}}},
  {statuses:{dying:{afterSceneMinutes:60}}},
  {statuses:{dizzy:{durationBeats:0}}},
  {statuses:[]},
 ];
 for(const tuning of cases){
  const before=snap(),r=registry.applyTuning(tuning);
  assert.equal(r.ok,false,JSON.stringify(tuning));assert.ok(r.errors.length,JSON.stringify(tuning));
  assert.equal(snap(),before,JSON.stringify(tuning));
 }
});
