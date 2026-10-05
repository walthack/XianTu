import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';
const identity = await loadTs('../src/modules/scenarioMods/ledger/affinityIdentity.ts');
const guard = await loadTs('../src/modules/scenarioMods/ledger/guardFramework.ts');
const memory = await loadTs('../src/modules/scenarioMods/modularTurn.ts');
const runtime = await loadTs('../src/modules/scenarioMods/runtime.ts');
const initializer = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
const id = 'liuchao.character.le_mingzhu';
test('unique legacy names backfill once without changing affinity; renamed actors read by id',()=>{
 const save={社交:{关系:{花苗新娘:{名字:'花苗新娘',好感度:40},朱八八:{名字:'朱八八',好感度:10}}}};
 identity.backfillRelationshipIds(save,[]);const snapshot=structuredClone(save);
 identity.backfillRelationshipIds(save,[]);assert.deepEqual(save,snapshot);
 assert.equal(identity.affinityOf(save,id),40);
 assert.equal(identity.affinityOf(save,'liuchao.character.shang_zhen_yu'),10);
 assert.equal(identity.relationshipOf(save,id).key,id);
});
test('ambiguous or unknown legacy entries log instead of merging or guessing',()=>{
 const save={社交:{关系:{同行者:{名字:'同行者',好感度:53},不知名:{好感度:7}}}}, logs=[];
 identity.backfillRelationshipIds(save,[{id:'a',name:'同行者'},{id:'b',name:'同行者'}],(...args)=>logs.push(args));
 assert.equal(logs.length,2);assert.equal(save.社交.关系.同行者.身份待核,true);
 assert.equal(save.社交.关系.同行者.好感度,53);assert.equal(identity.affinityOf(save,'a'),0);
});
test('duplicate same-id legacy profiles remain unresolved and do not silently merge',()=>{
 const save={社交:{关系:{甲:{角色ID:id,好感度:30},乙:{角色ID:id,好感度:50}}}};
 assert.equal(identity.relationshipOf(save,id),undefined);assert.equal(save.社交.关系.甲.好感度,30);
});
test('actual stage04 event affinity settles against legacy identity after name disclosure, only once',()=>{
 const mod=JSON.parse(readFileSync(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_04.json',import.meta.url)));
 const save=initializer.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(),initializer.buildStrictScenarioInitialization(mod));
 const r=save.世界.状态.剧本模组, npc=identity.relationshipOf(save,id).profile;
 const before=npc.好感度;const event=r.events.find(e=>e.id==='lcq.event.s04_03');assert.ok(event.relatedCharacterIds.includes(id));
 r.canon.characters.find(c=>c.id===id).name='乐明珠';r.affinityGrantedEventIds=[];r.completedEventIds=[event.id];
 const result=runtime.advanceScenarioRuntime(save).saveData;
 assert.ok(identity.affinityOf(result,id)>before);
 const after=identity.affinityOf(result,id);runtime.advanceScenarioRuntime(result);assert.equal(identity.affinityOf(result,id),after);
});
test('shadow, enforce, off and total switch have distinct behavior; soft never rejects',()=>{
 const rule={id:'fixture',severity:'hard',mode:'shadow',inspect:()=>[{quote:'事实冲突',context:'narration'}]};
 const logs=[];assert.equal(guard.evaluateGuardRules('事实冲突',[rule],{},x=>logs.push(x))[0].rejected,false);
 assert.equal(guard.evaluateGuardRules('事实冲突',[{...rule,mode:'enforce'}],{},()=>{})[0].rejected,true);
 assert.equal(guard.evaluateGuardRules('事实冲突',[{...rule,severity:'soft',mode:'enforce'}],{},()=>{})[0].rejected,false);
 assert.deepEqual(guard.evaluateGuardRules('事实冲突',[{...rule,mode:'off'}],{},()=>{}),[]);
 assert.deepEqual(guard.evaluateGuardRules('事实冲突',[rule],{enabled:false},()=>{}),[]);
 assert.equal(JSON.parse(logs[0]).kind,'ledger_guard');
});
const save={世界:{状态:{剧本模组:{modId:'lcq.stage_04b_lingfei_baiyi_crisis',completedEventIds:[]}}},社交:{记忆:{短期记忆:[]}}};
test('closed father gate filters poisoned #156 in history, candidates, and accepted excerpts',()=>{
 const text='谢艺谈起制造技术。岳帅有位遗腹女。夜风吹过帐角。';
 const s=structuredClone(save);s.社交.记忆.短期记忆=[text];
 assert.deepEqual(memory.recentModuleMemory(s),['谢艺谈起制造技术。夜风吹过帐角。']);
 assert.ok(memory.ledgerMemoryCandidates(text,s).every(x=>!x.text.includes('遗腹女')));
 assert.throws(()=>memory.validateLedgerMemorySide(JSON.stringify({evidence:['岳帅有位遗腹女。']}),text,s));
 assert.equal(memory.validateLedgerMemorySide(JSON.stringify({evidence:['夜风吹过帐角。']}),text,s),'夜风吹过帐角。');
});
test('shadow-hit clauses are withheld from memory, while original sentence ids stay stable',()=>{
 const text='谢艺谈起制造技术。\n\n谢艺，她说话。\n\n夜风吹过帐角。';
 const findings=guard.genderShadowFindings(text,[{name:'谢艺',gender:'男'}]);
 const candidates=memory.ledgerMemoryCandidates(text,save,findings);
 assert.deepEqual(candidates.map(x=>x.id),[0,2]);
 assert.equal(memory.validateLedgerMemorySide(JSON.stringify({sentenceIds:[2]}),text,save,findings),'夜风吹过帐角。');
 assert.throws(()=>memory.validateLedgerMemorySide(JSON.stringify({sentenceIds:[1]}),text,save,findings));
});
test('opened father gate does not erase legitimately revealed history',()=>{
 const s=structuredClone(save);s.世界.状态.剧本模组.completedEventIds=['lcq.event.s05b_09_temporary_pact_with_xiaozi'];
 assert.equal(guard.filterLedgerMemory('岳帅有位遗腹女。',s),'岳帅有位遗腹女。');
});
test('r11 corpus has source provenance and does not claim unreviewed bodies as clean',()=>{
 const corpus=JSON.parse(readFileSync(new URL('./fixtures/entity-ledger/r11-replay.json',import.meta.url)));
 assert.equal(corpus.rows.length,110);assert.equal(corpus.rows.filter(x=>x.review.expected==='clean').length,14);
 for(const row of corpus.rows) assert.ok(row.source.startsWith('r11/logs/bodies.log #'));
 assert.equal(corpus.rows.find(x=>x.id==='r11-156').review.expected,'conflict');
});

test('custom mod ids win over registry name matches, without touching values',()=>{
 const save={社交:{关系:{小紫:{名字:'小紫',好感度:40}}}};
 identity.backfillRelationshipIds(save,[{id:'custom.xiaozi',name:'小紫'}]);
 assert.equal(identity.affinityOf(save,'custom.xiaozi'),40);
});

test('actual Shanghou reveal keeps the same Zhu88 affinity record and grants once',()=>{
 const mod=JSON.parse(readFileSync(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_05b.json',import.meta.url)));
 const save=initializer.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(),initializer.buildStrictScenarioInitialization(mod));
 const r=save.世界.状态.剧本模组, shang='liuchao.character.shang_zhen_yu';
 save.社交.关系.朱八八={名字:'朱八八',角色ID:shang,好感度:10,与玩家关系:'相识',记忆:[]};
 r.canon.characters.find(c=>c.id===shang).name='殇侯';
 r.affinityGrantedEventIds=[];r.completedEventIds=['lcq.event.shanghou_revealed'];
 const out=runtime.advanceScenarioRuntime(save).saveData;
 assert.equal(identity.affinityOf(out,shang),18);
 assert.equal(identity.affinityOf(runtime.advanceScenarioRuntime(out).saveData,shang),18);
 assert.equal(Object.values(out.社交.关系).filter(x=>x.角色ID===shang).length,1);
});
test('stage transition carries old affinity without duplicate profiles under a new display name',()=>{
 const load=name=>JSON.parse(readFileSync(new URL('../src/modules/scenarioMods/builtins/data/'+name+'.json',import.meta.url)));
 const save=initializer.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(),initializer.buildStrictScenarioInitialization(load('lcq.stage_04')));
 identity.relationshipOf(save,id).profile.好感度=57;
 const r=save.世界.状态.剧本模组;r.nextStageId='lcq.stage_04b_lingfei_baiyi_crisis';r.nextStageReadyId=r.nextStageId;
 const next=initializer.transitionToNextScenarioStage(save,[load(r.nextStageId)]);
 assert.equal(next.ok,true);assert.equal(identity.affinityOf(next.saveData,id),57);
 assert.equal(Object.values(next.saveData.社交.关系).filter(x=>x.角色ID===id).length,1);
});
test('named-pronoun shadow does not treat quoted third parties or plural pronouns as facts',()=>{
 for(const text of ['谢艺说：“她说话很快。”','谢艺，他们说话很快。'])
  assert.deepEqual(guard.genderShadowFindings(text,[{name:'谢艺',gender:'男'}]),[]);
 assert.equal(guard.genderShadowFindings('谢艺， 她说话。',[{name:'谢艺',gender:'男'}]).length,1);
});

test('JSON saves use ids only; homonyms keep separate affinity, memory, and ID paths',async()=>{
 const {get,set}=(await import('lodash')).default;
 const save={社交:{关系:{'npc.a':{角色ID:'npc.a',名字:'同名',好感度:21,记忆:['甲']},'npc.b':{角色ID:'npc.b',名字:'同名',好感度:77,记忆:['乙']}}}};
 identity.backfillRelationshipIds(save,[],()=>{});
 assert.equal(identity.resolveRelationshipId(save,'同名'),undefined);
 assert.equal(identity.normalizeNpcRecordPath('社交.关系.同名.好感度',save),null);
 const key=identity.npcRecordPath('npc.b','好感度');set(save,key,78);
 assert.equal(get(save,key),78);assert.equal(identity.affinityOf(save,'npc.a'),21);
 assert.deepEqual(JSON.parse(JSON.stringify(save)).社交.关系,{
  'npc.a':{角色ID:'npc.a',名字:'同名',好感度:21,记忆:['甲'],原关系键:'npc.a'},
  'npc.b':{角色ID:'npc.b',名字:'同名',好感度:78,记忆:['乙'],原关系键:'npc.b'}});
});
test('unknown old records and departed local identities survive JSON reload idempotently',()=>{
 const save={社交:{关系:{陌生旅人:{名字:'陌生旅人',好感度:9,记忆:['旧事']}}}};
 identity.backfillRelationshipIds(save,[],()=>{});const first=JSON.stringify(save);
 const loaded=JSON.parse(first);identity.backfillRelationshipIds(loaded,[],()=>{});
 assert.equal(JSON.stringify(loaded),first);assert.equal(Object.keys(loaded.社交.关系).length,1);
 const rt={departedCast:['未登记演员'],sceneLedger:{actors:{未登记演员:{status:'dead'}}}};
 identity.migrateRuntimePersonRecords(rt);const id=rt.departedCast[0];
 const reload=JSON.parse(JSON.stringify(rt));identity.migrateRuntimePersonRecords(reload);
 assert.equal(reload.departedCast[0],id);assert.equal(identity.runtimeEntityName(reload,id),'未登记演员');
 assert.deepEqual(Object.keys(reload.sceneLedger.actors),[id]);
});
test('Zhu88→Shanghou JSON reload and ID memory edits keep the same single record',async()=>{
 const {get,set}=(await import('lodash')).default;const shang='liuchao.character.shang_zhen_yu';
 const save={社交:{关系:{朱八八:{名字:'朱八八',好感度:46,记忆:['尚未揭示']}}}};
 identity.backfillRelationshipIds(save);const loaded=JSON.parse(JSON.stringify(save));
 loaded.社交.关系[shang].名字='殇侯';identity.backfillRelationshipIds(loaded);
 assert.equal(identity.resolveRelationshipId(loaded,'朱八八'),shang);
 assert.equal(identity.resolveRelationshipId(loaded,'殇侯'),shang);
 set(loaded,identity.npcRecordPath(shang,'记忆'),['亲口说明']);
 assert.deepEqual(get(loaded,identity.npcRecordPath(shang,'记忆')),['亲口说明']);
 assert.equal(identity.affinityOf(loaded,shang),46);assert.deepEqual(Object.keys(loaded.社交.关系),[shang]);
});
test('ID paths participate in the same per-turn affinity budget',async()=>{
 const {createAffinityCommandGate}=await loadTs('../src/modules/scenarioMods/affinityLadder.ts');
 const gate=createAffinityCommandGate();const key=identity.npcRecordPath(id,'好感度');
 const first=gate({action:'add',key,value:10});assert.equal(first.command.value,10);
 const second=gate({action:'add',key,value:10});assert.equal(second.command.value,5);
 assert.equal(gate({action:'add',key,value:1}).command,null);
 assert.equal(gate({action:'add',key:identity.npcRecordPath('npc.other','好感度'),value:10}).command.value,10);
});
test('display receipts use ID addresses and the current label, including deleted profiles',async()=>{
 const save={社交:{关系:{朱八八:{名字:'朱八八',好感度:10}}}};identity.backfillRelationshipIds(save);
 const id='liuchao.character.shang_zhen_yu';const before=JSON.parse(JSON.stringify(save));
 save.社交.关系[id].名字='殇侯';
 const changes=[{key:identity.npcRecordPath(id,'好感度'),action:'add',oldValue:10,newValue:18}];
 identity.annotatePersonChanges(changes,save,before);assert.equal(changes[0].targetName,'殇侯');assert.equal(changes[0].characterId,id);
 const {formatStateChanges}=await loadTs('../src/utils/stateChangeFormatter.ts');
 const display=formatStateChanges({changes,timestamp:'2026-10-04'});
 assert.match(JSON.stringify(display),/殇侯/);assert.doesNotMatch(JSON.stringify(display),/liuchao\.character/);
 const deleted=[{key:identity.npcRecordPath(id),action:'delete'}];delete save.社交.关系[id];
 identity.annotatePersonChanges(deleted,save,before);assert.equal(deleted[0].targetName,'朱八八');
});
