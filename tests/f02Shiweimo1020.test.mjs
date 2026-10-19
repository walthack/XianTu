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
const turn=await loadTs('../src/modules/scenarioMods/freeAction/turn.ts');
const mkSave=()=>({元数据:{时间:{年:1,月:3,日:5,小时:22,分钟:0}},角色:{背包:{物品:{'lcq.item.qiannian_renshen':{名称:'千年人参',数量:1},'lcq.item.liaoshang_yao':{名称:'疗伤药',数量:1}}}},社交:{关系:{}},系统:{扩展:{}},世界:{状态:{剧本模组:{canon:{characters:[]}}}}});
const tk=(itemId)=>({actionClass:'give',variant:'feed',targetId:R.SHIWEIMO_ID,degree:'normal',performed:'yes',evidence:'喂她',itemId});
test('接线：F02 制住后登记诗薇莫；战后用凡品无效但消耗，珍品救活收侍从、好感按收场；天亮后再救判死', ()=>{
 const s=mkSave();R.recordShiweimoEnding(s,'被制住');
 const rel=()=>Object.values(s.社交.关系).find(p=>p.角色ID===R.SHIWEIMO_ID);assert.ok(rel(),'已登记关系');
 let out=turn.settleFreeActionTurn(s,[tk('lcq.item.liaoshang_yao')],undefined);assert.match(out.block,/解不了咒/);assert.ok(!s.角色.背包.物品['lcq.item.liaoshang_yao']);
 out=turn.settleFreeActionTurn(s,[tk('lcq.item.qiannian_renshen')],undefined);assert.match(out.block,/侍从/);
 assert.equal(R.shiweimoRecord(s).status,'saved');assert.equal(rel().好感度,GN.story.shiweimo.affinityOnRescue['被制住']);assert.equal(rel().人物关系,'侍从');
 const s2=mkSave();R.recordShiweimoEnding(s2,'松口退开');s2.元数据.时间.日=6;s2.元数据.时间.小时=12;
 out=turn.settleFreeActionTurn(s2,[tk('lcq.item.qiannian_renshen')],undefined);assert.match(out.block,/天已亮/);assert.equal(R.shiweimoRecord(s2).status,'dead');
 const s3=mkSave();R.recordShiweimoEnding(s3,'倒下');assert.ok(!Object.keys(s3.社交.关系).length,'击倒不登记');
});
