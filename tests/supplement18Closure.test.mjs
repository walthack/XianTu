import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadTs} from './loadTs.mjs';
import {evaluateLocationGate,loadStageLocationData} from '../scripts/validate-location-ids.mjs';
const {entityRecognitionLabel}=await loadTs('../src/modules/scenarioMods/namedEntities.ts');
const {statusNamePattern}=await loadTs('../src/modules/sceneModule/statuses.ts');
const {getCanonRailProfile}=await loadTs('../src/modules/scenarioMods/canonRail.ts');
const {namingFor}=await loadTs('../src/modules/scenarioMods/ledger/naming.ts');
test('explicit short labels preserve rail evidence and unrevealed descriptor',()=>{
 const p=getCanonRailProfile({modId:'lcq.stage_02'});
 assert.ok(p.contracts.find(c=>c.eventId==='lcq.event.free_ajiman').completionEvidence.includes(entityRecognitionLabel('character','liuchao.character.a_jiman_bana','short')));
 assert.equal(entityRecognitionLabel('character','liuchao.character.a_jiman_bana','short'),'阿姬曼');
 assert.equal(entityRecognitionLabel('location','liuchao.location.wuyuan','short'),'五原');
 assert.equal(namingFor('liuchao.character.le_mingzhu',0).text,'花苗新娘');
 assert.throws(()=>entityRecognitionLabel('character','liuchao.character.a_jiman_bana','unknown'));
});
test('status recognizer uses registered labels without guessing unmapped terms',()=>{
 assert.match('倒下',new RegExp(`^(?:${statusNamePattern('incapacitated')})$`));
 assert.match('外伤（重）',new RegExp(`^(?:${statusNamePattern('wound.external.heavy')})$`));
 assert.equal(new RegExp(statusNamePattern('not.registered')).test('昏迷'),false);
 assert.equal(new RegExp(statusNamePattern('wound.external.heavy')).test('内伤'),false);
});
test('primary Qilifang coordinate is projected but conflict gate remains strict',async()=>{
 const stages=loadStageLocationData(),base=await evaluateLocationGate({stages});assert.equal(base.failures.length,0);
 const changed=structuredClone(stages);const loc=changed.find(s=>s.modId==='lyg.mijing_rumen').locations.find(l=>l.id==='liuchao.location.qilifang');
 assert.deepEqual(loc.coordinates,{x:6838,y:3577});loc.coordinates={x:6114,y:3929};
 const gate=await evaluateLocationGate({stages:changed});assert.ok(gate.failures.some(f=>f.key==='coordinate_conflict:lyl.location.qilifang'));
 const table=JSON.parse(readFileSync(new URL('../mod-kit/entity-catalog/locations.json',import.meta.url)));
 assert.deepEqual(table.entries.find(e=>e.id==='lyl.location.qilifang').coordinateHistory[0].coordinates,{x:6114,y:3929});
});
