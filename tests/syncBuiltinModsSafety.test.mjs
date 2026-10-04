import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncBuiltinModData } from '../scripts/sync-builtin-mods.mjs';
async function fixture() {
 const root=await mkdtemp(join(tmpdir(),'xiantu-sync-preflight-')),generatedRoot=join(root,'generated'),outputDir=join(root,'builtins','data');
 await mkdir(join(generatedRoot,'qingyu','stages'),{recursive:true});await mkdir(outputDir,{recursive:true});
 await writeFile(join(outputDir,'existing.json'),'prior stage');await writeFile(join(outputDir,'..','manifest.json'),'prior manifest');
 const mod={manifest:{id:'lcq.fixture'},canon:{characters:[]},scenario:{}};
 await writeFile(join(generatedRoot,'qingyu','stages','fixture.json'),JSON.stringify(mod));
 return {root,generatedRoot,outputDir,mod,selectedBooks:['qingyu']};
}
test('late overlay drift does not delete any builtin or change its manifest', async () => {
 const f=await fixture();
 await writeFile(join(f.generatedRoot,'qingyu','stages','zz-drift.json'),JSON.stringify({...f.mod,manifest:{id:'lcq.bad'}}));
 const authorityCatalog={byStageId:new Map([['lcq.fixture',{version:1,stageId:'lcq.fixture',ops:[{op:'set',path:'canon.characters',from:[],to:[{id:'first-ready'}]}]}],['lcq.bad',{version:1,stageId:'lcq.bad',ops:[{op:'set',path:'canon.characters',from:[{id:'wrong'}],to:[{id:'target'}]}]}]]),stageIds:['lcq.fixture','lcq.bad']};
 await assert.rejects(syncBuiltinModData({...f,authorityCatalog}),/source drift/);
 assert.deepEqual(await readdir(f.outputDir),['existing.json']);assert.equal(await readFile(join(f.outputDir,'existing.json'),'utf8'),'prior stage');assert.equal(await readFile(join(f.outputDir,'..','manifest.json'),'utf8'),'prior manifest');
});
test('all preflight checks pass before replacing data and content-hashed manifest', async () => {
 const f=await fixture();const authorityCatalog={byStageId:new Map([['lcq.fixture',{version:1,stageId:'lcq.fixture',ops:[{op:'set',path:'canon.characters',from:[],to:[{id:'target'}]}]}]]),stageIds:['lcq.fixture']};
 const result=await syncBuiltinModData({...f,authorityCatalog});assert.deepEqual(result.ids,['lcq.fixture']);
 assert.deepEqual(await readdir(f.outputDir),['lcq.fixture.json']);assert.equal(JSON.parse(await readFile(join(f.outputDir,'lcq.fixture.json'),'utf8')).canon.characters[0].id,'target');
 assert.equal(JSON.parse(await readFile(join(f.outputDir,'..','manifest.json'),'utf8')).version,result.version);
});
