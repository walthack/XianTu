// 2026-10-20 F07 小津防御行：小津改挂角色卡 id（lcq.character.nanhuang_xiaojin），防御行按卡名渲染、能读等级；仍是参战者（原著小津挨烧）。
import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './loadTs.mjs';
const core=await loadTs('../src/modules/sceneModule/index.ts'),{SCENE_CONTRACTS}=await loadTs('../src/modules/sceneModule/contracts/registry.ts');
test('F07 小津挂卡 id、是参战者，火楼出手的防御行指向小津的卡', ()=>{
 const c=SCENE_CONTRACTS.find(x=>x.meta.id==='combat.f07.biling_village'),p=c.parties.find(x=>x.id==='xiaojin');
 assert.equal(p.ref,'lcq.character.nanhuang_xiaojin');assert.equal(core.partyRole(p),'combatant');
 const r=core.confirmAction(c,core.beginScene(c,{seed:1}).state,{goal:'seal',magnitude:1,scope:'single',targets:['exit'],levers:[]},{factors:0,playerDefense:0});
 assert.ok(r.result.enemy.some(e=>e.target==='xiaojin'&&e.targetRef==='lcq.character.nanhuang_xiaojin'));
});
