import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mod,makeContract} from './sceneModuleFixture.mjs';
import {loadTs} from './loadTs.mjs';
const numbers=await loadTs('../src/modules/sceneModule/numbers.ts');
const host=await loadTs('../src/modules/sceneModule/host/factors.ts');
const opening=await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
const stage=JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_01.json',import.meta.url)));
const f06=JSON.parse(await readFile(new URL('../src/modules/contentPacks/packs/qingyu/f06.json',import.meta.url)));
function preview(c,g,levels,ctx={factors:1,factorProfiles:{social:2}}){const s=mod.beginScene(c,{seed:1}).state;s.levels=levels;return mod.evaluatePlan(c,s,{goal:g,magnitude:1,scope:'single',targets:['merfolk'],levers:[]},ctx);}
test('F06 parley uses configured social factors across unknown/equal/extreme levels; combat keeps gap',()=>{
 for(const levels of [{pc:1,merfolk:9},{pc:9,merfolk:1},{pc:2,merfolk:2},{}])assert.equal(preview(f06,'parley',levels).modifierParts.factors,2);
 const attack=f06.goals.find(g=>g.type==='push').id;
 assert.equal(preview(f06,attack,{pc:1,merfolk:9}).modifierParts.factors,1-numbers.GAME_NUMBERS.levels.gapMany);
});
test('holdout intimidate/deceive profiles and guards rely on data rather than ids',()=>{
 const c=makeContract(); c.goals.push({id:'holdout.bluff',type:'support',baseDifficulty:7,modifierProfile:'social'});
 const s=mod.beginScene(c,{seed:1}).state;s.levels={pc:1,foe_a:8};
 const ctx={factors:1,factorProfiles:{social:2}};
 const ev=goal=>mod.evaluatePlan(c,s,{goal,magnitude:1,scope:'single',targets:[],levers:[]},ctx);
 assert.equal(ev('holdout.bluff').modifierParts.factors,2);
 assert.equal(ev('guard').modifierParts.factors,1-numbers.GAME_NUMBERS.levels.gapMany);
 assert.throws(()=>mod.evaluatePlan(c,s,{goal:'holdout.bluff',magnitude:1,scope:'single',targets:[],levers:[]},{factors:10}),/缺少目标属性/);
 c.goals.at(-1).modifierProfile='typo'; assert.ok(mod.lintContract(c).errors.some(e=>e.includes('modifierProfile')));
});
test('host reads live social weights rather than combat stats or realm phase',()=>{
 const save=opening.createQingyuOpeningPlaytestSave(stage);
 save.角色.身份.先天六司={魅力:9,悟性:7,心性:5,根骨:1,灵性:1,气运:5};save.角色.身份.后天六司={};
 const c=structuredClone(f06),ctx=host.sceneContext(save,c,'我解释商队来意');
 const factors=host.baseFactors(save,c,'social','我解释商队来意');
 assert.equal(factors.find(f=>f.label==='六司').value,numbers.boundedStat(9*.5+7*.3+5*.2));
 assert.equal(ctx.factorProfiles.social,factors.reduce((n,f)=>n+f.value,0));
});
