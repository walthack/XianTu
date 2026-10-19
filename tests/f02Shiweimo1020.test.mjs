// 2026-10-20 用户定：F02 对手改为蛇彝女子诗薇莫；可击倒、制住或说服；制服/化解后到天亮为救治窗口（数值读 story.shiweimo）。
import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './loadTs.mjs';
const {SCENE_CONTRACTS}=await loadTs('../src/modules/sceneModule/contracts/registry.ts');
const R=await loadTs('../src/modules/scenarioMods/shiweimoRescue.ts');
const {GAME_NUMBERS:GN}=await loadTs('../src/modules/sceneModule/numbers.ts');
test('F02 合同：对手是诗薇莫，有制住、说服两条收场，赢旗标记已遇', ()=>{
 const c=SCENE_CONTRACTS.find(x=>x.meta.id==='combat.f02.snake_assault'),p=c.parties.find(x=>x.id==='snake_man');
 assert.equal(p.ref,'lcq.enemy.sheyi_shiweimo');assert.deepEqual(p.tracks[0].ending.alternatives,['被制住','松口退开']);
 assert.equal(c.goals.find(g=>g.id==='subdue').finishAs,'被制住');assert.equal(c.goals.find(g=>g.id==='persuade').finishAs,'松口退开');
 assert.equal(c.closing.win.flags['lcq.f02.shiweimo_met'],true);
 assert.ok(!c.parties.some(x=>x.ref==='liuchao.character.ning_yu'),'凝羽仍不是参战方');
});
test('救治：珍品药可救，凡品无效，蛇丹禁用并降好感，窗口外与击倒不可救，好感按收场方式', ()=>{
 const W=GN.story.shiweimo.rescueWindowHours;
 assert.deepEqual(R.judgeRescue('松口退开',1,{kind:'item',itemId:'lcq.item.qiannian_renshen'}),{ok:true,reason:'saved',affinity:GN.story.shiweimo.affinityOnRescue['松口退开']});
 assert.equal(R.judgeRescue('被制住',1,{kind:'item',itemId:'lcq.item.tianshan_xuelian'}).affinity,GN.story.shiweimo.affinityOnRescue['被制住']);
 assert.equal(R.judgeRescue('被制住',1,{kind:'item',itemId:'lcq.item.liaoshang_yao'}).reason,'tier_too_low');
 const sd=R.judgeRescue('被制住',1,{kind:'item',itemId:'lcq.item.np013'});assert.equal(sd.reason,'forbidden');assert.equal(sd.affinity,GN.story.shiweimo.affinityOnShedanTruth);
 assert.equal(R.judgeRescue('被制住',W+1,{kind:'item',itemId:'lcq.item.qiannian_renshen'}).reason,'window_closed');
 assert.equal(R.judgeRescue('倒下',0,{kind:'item',itemId:'lcq.item.qiannian_renshen'}).reason,'dead');
 const S=GN.story.shiweimo;
 assert.equal(R.judgeRescue('被制住',1,{kind:'skill',skillLevel:S.skillThreshold-1,roll:20}).reason,'skill_too_low');
 assert.equal(R.judgeRescue('被制住',1,{kind:'skill',skillLevel:S.skillThreshold,roll:S.skillDifficulty}).ok,true);
 assert.equal(R.judgeRescue('被制住',1,{kind:'skill',skillLevel:S.skillThreshold,roll:20},S.skillTries).reason,'no_tries');
});
