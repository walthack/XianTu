import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './loadTs.mjs';
const {settledStepScene}=await loadTs('../src/modules/scenarioMods/settledStepScene.ts');
const card={id:'listen',fixedFacts:['Only after approved action'],fallbackText:'approved'};
const runtime={events:[{id:'event',playerCompletionContract:{actions:[card]}}]};
test('focus, missing selection and unattempted actions never disclose authored material',()=>{
 const before=JSON.stringify(runtime);
 assert.equal(settledStepScene(runtime,undefined,false),undefined);
 assert.equal(settledStepScene(runtime,{eventId:'event',actionId:'listen'},false),undefined);
 assert.equal(settledStepScene(runtime,undefined,true),undefined);
 assert.equal(settledStepScene(runtime,{eventId:'event',actionId:'unknown'},true),undefined);
 assert.equal(JSON.stringify(runtime),before);
});
test('a locally attempted explicit action exposes only that step',()=>{
 assert.deepEqual(settledStepScene(runtime,{eventId:'event',actionId:'listen'},true),card);
});
