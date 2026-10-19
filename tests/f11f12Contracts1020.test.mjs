// 2026-10-20 用户定：F11 鬼王宫突围、F12 祭台尸鬼做成真战斗（原著第99、102章），中间 s05b_07 / s05b_08a 写完整过渡。
import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './loadTs.mjs';
const {SCENE_CONTRACTS}=await loadTs('../src/modules/sceneModule/contracts/registry.ts');
const by=id=>SCENE_CONTRACTS.find(c=>c.meta.id===id);
test('F11：挂在 s05b_06；阁罗只能被制住；输了不结束；小紫劫走乐明珠在两个分支都写明', ()=>{
 const c=by('combat.f11.ghost_palace_breakout');assert.ok(c);assert.equal(c.meta.hook.eventId,'lcq.event.s05b_06_breakout_and_reunion');
 assert.equal(c.parties.find(p=>p.id==='geluo').tracks[0].ending.finalState,'被制住');assert.equal(c.defeat.outcome.type,'continue');
 for(const b of ['win','lose'])assert.match(c.closing[b].text,/小紫.*乐明珠/);
 assert.equal(c.parties.find(p=>p.id==='le_mingzhu').role,'assist');
});
test('F12：挂在 s05b_08b；丹宸之死与黑影在两个分支都发生；削发只在胜利收束；朱诺不可消灭', ()=>{
 const c=by('combat.f12.altar_corpses');assert.ok(c);assert.equal(c.meta.hook.eventId,'lcq.event.s05b_08b_altar_corpse_fight_and_danchen');
 for(const b of ['win','lose']){assert.match(c.closing[b].text,/主人/);assert.match(c.closing[b].text,/黑影/);}
 assert.match(c.closing.win.text,/头发/);assert.doesNotMatch(c.closing.lose.text,/头发/);
 assert.ok(c.closing.win.afterState.some(a=>a.id==='zhunuo_not_destroyed'));assert.equal(c.defeat.outcome.type,'continue');
});
