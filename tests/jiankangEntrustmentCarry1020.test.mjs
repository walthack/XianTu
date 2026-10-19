// 2026-10-20 建康线方案 A (1) 核查：切入 stage_07 时「托付已完成」旗标确被重置为 false，但萧遥逸上门照样开启——发现一不成立，未改切关逻辑。
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {loadTs} from './loadTs.mjs';
const init=await loadTs('../src/modules/scenarioMods/strictInitializer.ts');const opening=await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');const pack=await loadTs('../src/modules/contentPacks/index.ts');
const read=async id=>pack.applyContentPackOverlays(JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`,import.meta.url))));
const first=await read('lcq.stage_01'),s05=await read('lcq.stage_05b'),s07=await read('lcq.stage_07_qingyuan_jiankang');
const deep=(o,f)=>{if(!o||typeof o!=='object')return;if(f(o))return o;for(const v of Object.values(o)){const r=deep(v,f);if(r)return r;}};
const arrives=deep(s07,o=>o.id==='lcq.event.xiaoyaoyi_arrives'&&!Array.isArray(o)&&(o.conditions||o.trigger||o.title));
const initialFlags=deep(s07,o=>!Array.isArray(o)&&Object.prototype.hasOwnProperty.call(o,'event.xieyi_entrustment.done'));
function save05(){const save=init.applyStrictScenarioInitializationToSave(opening.createQingyuOpeningPlaytestSave(first),init.buildStrictScenarioInitialization(s05));const r=save.世界.状态.剧本模组;r.nextStageId=s07.manifest.id;r.nextStageReadyId=s07.manifest.id;return save;}
test('前提：萧遥逸上门以托付已完成为条件；stage_07 初始把它置 false', () => {
  assert.match(JSON.stringify(arrives.conditions||arrives.trigger||arrives), /event\.xieyi_entrustment\.done/);
  assert.equal(initialFlags['event.xieyi_entrustment.done'], false);
});
test('核查结论：正式切关进 stage_07 时托付 done 虽重置为 false，萧遥逸上门仍然开启（发现一不成立）', () => {
  for (const branch of ['dead','longrest']) {
    const save=save05(),f=save.世界.状态.剧本模组.flags;f['event.xieyi_entrustment.done']=true;
    if(branch==='dead')f['character.xie_yi.status']='dead';else f['branch.lcq.if_xieyi_longrest.active']=true;
    const out=init.transitionToNextScenarioStage(JSON.parse(JSON.stringify(save)),[s07]);assert.equal(out.ok,true,out.reason);
    const n=out.saveData.世界.状态.剧本模组;
    assert.equal(n.flags['event.xieyi_entrustment.done'],false,'按既有设计不预置');
    assert.ok(n.activeEventIds.includes('lcq.event.xiaoyaoyi_arrives'),branch);
  }
});
