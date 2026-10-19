// 真机复测 08e0987da150 追加四项（F06 卡死、同伴挂伤、F03 难度、F03 收场后轻伤）：全部走宿主链路
// submitSceneInput → confirmSceneAction → closeHost，存档用真机导出的「08e0-F03前」「08e0-F06中-第18拍」。
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './loadTs.mjs';
import {readSaveFixture} from './advanceToScene.mjs';
import {referencePlan} from '../scripts/combat-reference-plan.mjs';
globalThis.location={search:'?sceneModule=on',hostname:'localhost'};
const host=await loadTs('../src/modules/sceneModule/host/controller.ts'),ext=await loadTs('../src/modules/sceneModule/host/ext.ts');
const registry=await loadTs('../src/modules/sceneModule/contracts/registry.ts'),core=await loadTs('../src/modules/sceneModule/index.ts');
const {sceneContext,snapshotLevels}=await loadTs('../src/modules/sceneModule/host/factors.ts');
import {mod,makeContract,CTX,attack,begin} from './sceneModuleFixture.mjs';
const store=await loadTs('../src/modules/diagnostics/store.ts');
const {GAME_NUMBERS}=await loadTs('../src/modules/sceneModule/numbers.ts');
const F03='./fixtures/playtest-08e0/f03-before.json',F06='./fixtures/playtest-08e0/f06-mid-beat18.json';

function harness(save,plan){
 const h={save,asked:0,plan};
 h.deps={persist:async s=>{h.save=structuredClone(s);},askIntent:async()=>{h.asked++;return JSON.stringify({...h.plan,inputClass:'action'});}};
 return h;
}
const active=h=>ext.activeScene(h.save);
async function beat(h,text){
 if(!active(h).pending)await host.submitSceneInput(h.save,text,h.deps);
 const preview=active(h).pending.preview;
 await host.confirmSceneAction(h.save,h.deps);
 const a=active(h);
 if(a?.state.status==='decided')await host.submitSceneInput(h.save,'继续',h.deps);
 return {preview,lines:a?.last?.lines||[],state:a?.state};
}
const sav020=()=>store.logStore.recent(5000).filter(e=>e.code==='LCQ-SAV-020');

test('7) F06 真机第 18 拍：原来的 -12 全是级差（程宗扬 2 级 vs 等级表里推断的鲛人 4 级）；鲛人改按敌人种类预设（当章主角 +1＝3 级）后，旧档进行中的场面下一拍自动重定级，级差变 -4', async()=>{
 const h=harness(await readSaveFixture(F06),{goal:'repel',claim:{magnitude:1,scope:'single',targets:['merfolk']},levers:[]});
 const a=active(h);assert.deepEqual(a.state.levels,{pc:2,merfolk:4,le:4},'旧档里缓存的是旧总表的级数');
 a.state.forced={action:Array(40).fill(10),defense:Array(80).fill(8)};a.state.cursors={action:0,defense:0};
 const hp=h.save.角色.属性.气血.当前;
 for(let i=0;i<3;i++){
  const r=await beat(h,'我挥刀制服鲛人');
  assert.equal(r.state.levels.merfolk,3);assert.equal(r.state.levels.pc,2);assert.equal(r.state.levelFacts.merfolk.confidence,'preset');
  assert.equal(r.preview.modifier,-GAME_NUMBERS.levels.gapOne);
  assert.deepEqual(r.preview.modifierParts,{factors:-GAME_NUMBERS.levels.gapOne,levers:0,novelty:0,cash:0,status:0,assist:0},'受保护的乐明珠不出助战效果');
  assert.ok(r.preview.odds.success+r.preview.odds.great_success>0,'不再是 0%');
  assert.equal(r.state.statuses.pc.filter(s=>s.id==='wound.drowning').length,1,'呛水伤仍只有一层，没有升级链（败局路径待拍板）');
  assert.equal(r.state.hpLoss?.pc,undefined,'onCrush 取代通用挂伤：连扣血也跳过（待拍板）');
 }
 assert.equal(h.save.角色.属性.气血.当前,hp);
});

test('7) 拍数门禁：F06 真机存档继续打，超过 combat.beatLimit.max 记 LCQ-SAV-020（error），每多一拍记一次；只记录，不改判', async()=>{
 const max=GAME_NUMBERS.combat.beatLimit.max;assert.ok(Number.isInteger(max)&&max>=1);
 const h=harness(await readSaveFixture(F06),{goal:'repel',claim:{magnitude:1,scope:'single',targets:['merfolk']},levers:[]});
 const a=active(h);a.state.forced={action:Array(60).fill(10),defense:Array(120).fill(8)};a.state.cursors={action:0,defense:0};
 const before=sav020().length;let played=a.state.beat-1;
 while(played<=max+1){await beat(h,'我挥刀制服鲛人');played=active(h).state.beat-1;}
 const logs=sav020().slice(before);
 assert.equal(logs.length,played-max,'超过上限的每一拍各记一次');
 assert.equal(logs[0].level,'error');assert.equal(logs[0].detail.contractId,'combat.f06.merfolk');assert.deepEqual(logs.map(e=>e.detail.beat).sort((x,y)=>x-y)[0],max+1);
 assert.equal(active(h).state.status,'engaged','到上限后怎么判尚待拍板：现在只记录');
});

test('7) 模拟和真机为什么对不上：同一拍局面，参考打法用两个要素（加值、新意、优势），真机原话没提要素只剩级差', async()=>{
 const save=await readSaveFixture(F06),a=ext.activeScene(save),c=registry.sceneContractById(a.contractId),ctx=sceneContext(save,c,'');
 snapshotLevels(save,c,a.state);assert.equal(a.state.levels.merfolk,3);
 const ref=referencePlan(c,a.state,ctx);assert.equal(ref.levers.length,2);
 const withLevers=core.evaluatePlan(c,a.state,ref,ctx),plain=core.evaluatePlan(c,a.state,{...ref,levers:[]},ctx);
 assert.ok(withLevers.modifier>plain.modifier,`参考打法 ${withLevers.modifier} / 原话 ${plain.modifier}`);
 assert.equal(plain.modifier,-GAME_NUMBERS.levels.gapOne);
 assert.ok(withLevers.odds.success+withLevers.odds.great_success>plain.odds.success+plain.odds.great_success);
});

test('8) F03 真机开局：受保护 / 不参战的同行者（凝羽、花苗新娘、阿夕）不出防御行，不吃级差、不挂伤', async()=>{
 const h=harness(await readSaveFixture(F03),{goal:'survive',claim:{magnitude:1,scope:'single',targets:[]},levers:[]});
 // 每拍防御骰顺序：铁斧、绕后、扑阿夕、最后一名武士——压主角的两下挡住（主角撑得过三拍），扑向后方的两下没拦住（威胁进度会到顶）。
 const a=active(h);a.state.forced={action:Array(12).fill(12),defense:Array.from({length:10},()=>[20,1,1,20]).flat()};a.state.cursors={action:0,defense:0};a.pending=null;
 for(let i=0;i<3;i++){
  const r=await beat(h,'我在武士手下撑住');
  const enemy=active(h)?.last?.result?.enemy;assert.ok(Array.isArray(enemy));const rows=enemy.map(e=>e.target);
  for(const id of ['ning_yu','bride','a_xi']){
   assert.ok(!rows.includes(id),id);
   // 不被敌人直接挂伤；威胁进度到顶时合同剧本（rear_breached）才让新娘/阿夕受创，那是剧情事件不是战斗挂伤。
   assert.deepEqual((r.state.statuses[id]||[]).filter(s=>s.cause==='combat').map(s=>s.id),[],id);
  }
  // 护人戏改成威胁进度后，出手标签里会出现阿夕的名字（“武士扑向阿夕一侧”），但防御行的被打者始终是主角。
  assert.ok(!r.lines.some(l=>/→(阿夕|花苗新娘|凝羽)：防御/.test(l)||/(阿夕|花苗新娘|凝羽)[^→]*挂「/.test(l.replace(/^.*→[^：]+：/,''))),r.lines.join('\n'));
 }
});

test('8) 同伴与玩家同一套挂伤规则：普通打中只扣气血、不挂伤；重击才挂，相邻两拍重击升外伤（重）', ()=>{
 const c=makeContract({enemyActions:[{id:'sweep',party:'boss',label:'横扫',target:{each:'player_side'},attack:{dc:10},onHit:{statuses:[]},woundRule:'default'}]});
 let s=begin(c,{action:[4,4,4],defense:[8,8, 1,1, 1,1]}).state;
 const step=()=>{const o=mod.confirmAction(c,s,attack(['boss']),CTX);s=o.state;return o;};
 step();
 assert.deepEqual([s.statuses.pc||[],s.statuses.ally||[]].map(l=>l.filter(x=>x.id.startsWith('wound.')).map(x=>x.id)),[[],[]],'普通打中：谁都不挂');
 step();
 for(const id of ['pc','ally'])assert.deepEqual((s.statuses[id]||[]).filter(x=>x.id.startsWith('wound.')).map(x=>x.id),['wound.external'],id);
 step();
 for(const id of ['pc','ally'])assert.ok((s.statuses[id]||[]).some(x=>x.id==='wound.external.heavy'),id);
});

test('8) 全部合同：普通打中直接挂通用伤（外伤/内伤/外伤（重））只剩剧情指定的 F10（按拍出手的定点伤）', async()=>{
 const general=new Set(['wound.external','wound.external.heavy','wound.internal']),left=[];
 for(const c of registry.SCENE_CONTRACTS)for(const act of c.enemyActions||[])for(const s of act.onHit?.statuses||[])if(general.has(s.status))left.push(`${c.meta.id}/${act.id}`);
 assert.deepEqual(left,['combat.f10.ghost_king_clash/bone_claw']);
});

test('9) F03 真机预览「攻击武士」难度 17 加值 -4：17＝基础 10＋幅度 2 的加价 4（模型报“击退”＝幅度 2，头目轨道还剩 3 步，可兑现 2 步，不触发封顶）＋头目抗性 3；-4＝级差（2 级 vs 3 级）', async()=>{
 const save=await readSaveFixture(F03),a=ext.activeScene(save);
 assert.deepEqual(a.pending.plan.magnitude,2);
 assert.deepEqual(a.pending.preview.difficultyParts,{base:10,premium:4,pressure:0,resistance:3});
 assert.equal(a.pending.preview.modifier,-4);assert.equal(a.pending.preview.odds.success,0);
 // 封顶：同一个头目只剩 1 步时，模型报幅度 3 也只收 1 步的加价（0）。
 const h=harness(structuredClone(save),{goal:'attack',claim:{magnitude:3,scope:'single',targets:['foe_engaged']},levers:[]});
 active(h).state.tracks.foe_engaged.vit=2;active(h).pending=null;
 await host.submitSceneInput(h.save,'我一刀斩杀那个头目',h.deps);
 assert.equal(h.asked,1);
 assert.equal(active(h).pending.preview.difficultyParts.premium,0);
 assert.equal(active(h).pending.preview.difficulty,13);
});

test('10) F03 真机拖满拍数／倒下都按“输”收场（战斗只有赢和输；scene.f03.escaped 照旧），不是赢：战后清轻伤只对赢生效（配置 afterWin），外伤留着', async()=>{
 const h=harness(await readSaveFixture(F03),{goal:'survive',claim:{magnitude:1,scope:'single',targets:[]},levers:[]});
 const a=active(h);a.pending=null;
 a.state.statuses.pc=[{id:'wound.external',appliedBeat:1,expiresBeat:null,cause:'combat',sourceId:'fumble:pc_wound'}]; // 真机第 12 拍大失败挂上的外伤
 a.state.forced={action:Array(20).fill(12),defense:Array(60).fill(19)};a.state.cursors={action:0,defense:0};
 for(let i=0;i<20&&active(h);i++)await beat(h,'我在武士手下撑住');
 const last=ext.readExt(h.save).history.at(-1);
 assert.equal(last.outcome,'lose');
 assert.deepEqual(GAME_NUMBERS.combat.woundRules.afterWin.clearLight,true);
 assert.ok((h.save.角色.效果||[]).some(e=>/^外伤/.test(e.状态名称||'')),'输了不清伤');
});
