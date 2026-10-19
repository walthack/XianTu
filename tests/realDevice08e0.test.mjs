// 真机复测 08e0987da150 的六项问题：全部走实际游戏链路（宿主 submitSceneInput / confirmSceneAction、意图路由 → 签发判定 → 掷骰 → 结算），
// 存档用真机导出的「08e0-新档F01后」（tests/fixtures/playtest-08e0/f01-after.json）或新开局沿生产剧情动作推进出来的存档。
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadTs} from './loadTs.mjs';
import {advanceToScene,readSaveFixture} from './advanceToScene.mjs';
const host=await loadTs('../src/modules/sceneModule/host/controller.ts'),ext=await loadTs('../src/modules/sceneModule/host/ext.ts');
const registry=await loadTs('../src/modules/sceneModule/contracts/registry.ts');
const {sceneContext}=await loadTs('../src/modules/sceneModule/host/factors.ts');
const inj=await loadTs('../src/modules/sceneModule/host/injuries.ts');
const opening=await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts'),packs=await loadTs('../src/modules/contentPacks/index.ts');
const router=await loadTs('../src/modules/scenarioMods/naturalIntentRouter.ts'),turn=await loadTs('../src/modules/scenarioMods/freeAction/turn.ts');
const judgement=await loadTs('../src/utils/judgementEngine.ts'),actionGate=await loadTs('../src/utils/actionGate.ts');
const {GAME_NUMBERS}=await loadTs('../src/modules/sceneModule/numbers.ts');
globalThis.location={search:'?sceneModule=on',hostname:'localhost'};

const F01_SEED=142326708; // 真机「08e0-新档F01后」存档 history 里 F01 的 seed：第 2 拍两颗防御骰都是 1
async function f01Save(){
 const mod=packs.applyContentPackOverlays(JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_01.json',import.meta.url),'utf8')));
 return advanceToScene(opening.createQingyuOpeningPlaytestSave(mod,'2026-10-19T10:44:00.000Z',2),{eventId:'lcq.event.iron_bridge_ambush'});
}
function harness(save,goals){
 const h={save,asked:0};
 h.deps={persist:async s=>{h.save=structuredClone(s);},askIntent:async()=>{h.asked++;const st=ext.activeScene(h.save).state,c=registry.sceneContractById(st.contractId),g=typeof goals==='function'?goals(st):goals[st.beat-1]||'attack';const t=c.parties.find(p=>p.side==='opposed'&&st.present[p.id]!==false)?.id;return JSON.stringify({goal:g,claim:{magnitude:1,scope:'single',targets:g==='attack'?[t]:[]},levers:[],inputClass:'action'});}};
 return h;
}
async function playBeats(h,text,{seed,forced,beats=12}={}){
 await host.submitSceneInput(h.save,text,h.deps);
 const lines=[];
 if(seed!==undefined)ext.activeScene(h.save).state.seed=seed;
 if(forced)ext.activeScene(h.save).state.forced=forced;
 for(let n=0;n<beats&&ext.activeScene(h.save);n++){
  const a=ext.activeScene(h.save);
  if(!a.pending)await host.submitSceneInput(h.save,text,h.deps);
  const before=ext.activeScene(h.save);const preview={beat:before.state.beat,preview:before.pending?.preview,ctx:sceneContext(h.save,registry.sceneContractById(before.state.contractId),text)};
  const told=narrative(h.save);
  await host.confirmSceneAction(h.save,h.deps);
  const after=ext.activeScene(h.save),now=narrative(h.save);
  lines.push({...preview,lines:(after?.last?.lines||[now.startsWith(told)?now.slice(told.length):now]),statuses:structuredClone(after?.state.statuses||lastHistory(h.save).state.statuses),hp:h.save.角色.属性.气血.当前});
 }
 return lines;
}
const narrative=save=>(save.系统?.历史?.叙事||[]).map(row=>row.content||'').join('\n');
const effectNames=save=>(save.角色.效果||[]).map(e=>e.状态名称);
const lastHistory=save=>ext.readExt(save).history.at(-1);

test('1) 真机 F01 seed 复现：第 2 拍两颗防御骰都是自然 1——按四档规则是防御大失败＝敌方重击（回执标“重击”），但一拍只挂一次轻伤，不再一拍连挂两级',async()=>{
 const h=harness(await f01Save(),['defend','defend','attack']);
 await playBeats(h,'我稳住防守，护住要害撑过这一拍',{seed:F01_SEED});
 const st=lastHistory(h.save).state,beat2=st.audit.find(a=>a.beat===2);
 assert.equal(beat2.face,7,'行动骰与真机一致（骰面 7）');
 const rolls=lastHistory(h.save);assert.equal(rolls.outcome,'win');
 assert.equal(st.woundCritBeats.pc,2,'第 2 拍记一次重击');
 assert.equal(st.woundStreaks.pc,1,'同一拍两次重击只算一次，不升外伤（重）');
 assert.ok(!(st.statuses.pc||[]).some(s=>s.id==='wound.external.heavy'));
});

test('1) 回执：重击写明“（重击）”，普通打中只扣气血、不挂伤，一拍里同一人至多挂一次',async()=>{
 const h=harness(await f01Save(),['defend','defend','defend']);
 // 第 1 拍防御骰 10、11（普通打中/挡住）；第 2 拍 1、1（两次自然 1）；第 3 拍 20、20。
 const lines=await playBeats(h,'我稳住防守，护住要害撑过这一拍',{forced:{action:Array(10).fill(10),defense:[10,11,1,1,20,20,20,20]}});
 const b1=lines[0].lines.join('\n'),b2=lines[1].lines.join('\n');
 assert.doesNotMatch(b1,/挂「/,'普通打中不挂伤');
 assert.match(b2,/没挡住（重击），挂「外伤」/);
 assert.equal((b2.match(/挂「/g)||[]).length,1,'同拍第二次重击不再挂伤');
 assert.doesNotMatch(b2,/外伤（重）/);
});

test('1) 连续两拍都被重击才升外伤（重）；这一点战后不清（按规则只清轻伤）',async()=>{
 const h=harness(await f01Save(),['defend','defend','defend']);
 await playBeats(h,'我稳住防守，护住要害撑过这一拍',{forced:{action:Array(10).fill(10),defense:[1,20,1,20,20,20,20,20]}});
 const done=lastHistory(h.save);
 assert.equal(done.outcome,'win');
 assert.ok(done.state.statuses.pc.some(s=>s.id==='wound.external.heavy'),'第 1、2 拍连续重击 → 外伤（重）');
 assert.deepEqual(effectNames(h.save).filter(n=>/外伤/.test(n)),['外伤（重）'],'外伤（重）不在 afterWin.statuses 里，赢了也不自动清');
 assert.match(done.memoryNote,/留下的状态：.*外伤（重）/);
});

test('2) 赢后清轻伤：真机 seed 的 F01 只留轻伤 → 收尾战后休整清掉，存档效果与记忆摘要都不再带外伤',async()=>{
 assert.deepEqual(GAME_NUMBERS.combat.woundRules.afterWin.statuses,['wound.external','wound.burn'],'“轻伤”＝配置 afterWin.statuses 里列的状态（2026-10-19 灼伤改通用后也算轻伤）');
 const h=harness(await f01Save(),['defend','defend','attack']);
 await playBeats(h,'我稳住防守，护住要害撑过这一拍',{seed:F01_SEED});
 const done=lastHistory(h.save);
 assert.equal(done.outcome,'win');
 assert.deepEqual(effectNames(h.save).filter(n=>/外伤/.test(n)),[]);
 assert.doesNotMatch(done.memoryNote,/留下的状态/);
});

test('3) F02 加值 -20/-22 的来历：等级差 -4 ＋ 判定引擎的“重伤”（气血 ≤25% 恒 -15）＋ 外伤 -1 / 外伤（重）-3；每项只算一次，没有重复叠加',async()=>{
 let save=await advanceToScene(await readSaveFixture('./fixtures/playtest-08e0/f01-after.json'));
 inj.removePlayerInjuriesByRest(save);save.角色.属性.气血.当前=50; // 真机这一局进场时外伤已解、气血 50
 const h=harness(save,['attack','defend','attack','attack','defend','defend']);
 // 真机 combat.log 的骰面：行动 15、2、5、2；防御 10、11、3、9
 const lines=await playBeats(h,'我挥刀攻击最近的敌人',{forced:{action:[15,2,5,2,1,1,1,1],defense:[10,11,3,9,1,1,1,1]}});
 const injury=GAME_NUMBERS.judgement.injury;
 for(const row of lines){
  const labels=row.ctx.breakdown.action.map(f=>f.label);
  assert.equal(new Set(labels).size,labels.length,`第 ${row.beat} 拍：同一来源不重复`);
  const parts=row.preview?.modifierParts;if(!parts)continue;
  assert.equal(parts.levers+parts.novelty+parts.cash,0,`第 ${row.beat} 拍：没有杠杆/新意/标签加值混进来`);
 }
 const b4=lines.find(r=>r.beat===4),b5=lines.find(r=>r.beat===5);
 assert.ok(b4.ctx.breakdown.action.some(f=>f.label==='重伤'&&f.value===injury.penalty),'第 4 拍气血跌到 ≤25%，判定引擎的重伤罚进来了');
 assert.equal(b4.preview.modifierParts.factors-b4.ctx.factors,-4,'其余 -4 是等级差（levelGap），不是重复项');
 assert.ok(lines.slice(0,3).every(r=>!r.ctx.breakdown.action.some(f=>f.label==='重伤')),'气血高于 25% 时没有这项');
 const b3=lines.find(r=>r.beat===3);assert.doesNotMatch(b3.lines.join('\n'),/挂「/,'第 3 拍防御差 15（未过大失败线）只扣气血，不再挂伤');
});

test('4) F02 交涉说法：开战前、开战后都在模型识别之前给“不能交涉”，模型说攻击也不归到攻击/防守',async()=>{
 const save=await advanceToScene(await readSaveFixture('./fixtures/playtest-08e0/f01-after.json'));
 const text='我收起兵刃，与袭击者交涉，劝他住手说清缘由';
 const h=harness(save,()=> 'attack');
 await host.submitSceneInput(h.save,text,h.deps);
 // F02 是伏击（ambushAfterStall）：第一句话就开战，但这句交涉不出预览、不问模型，只给提示。
 const first=ext.activeScene(h.save);
 assert.equal(first?.pending??null,null,'没被归成攻击/防守预览');
 assert.equal(h.asked,0,'没问模型');
 assert.ok(JSON.stringify(h.save).includes(GAME_NUMBERS.combat.negotiation.notice));
 const asked=h.asked;
 await host.submitSceneInput(h.save,text,h.deps);
 const a=ext.activeScene(h.save);
 assert.equal(a.pending,null);assert.equal(a.notice,GAME_NUMBERS.combat.negotiation.notice);assert.equal(h.asked,asked,'开战后也在模型前拦住');
 assert.equal(host.NO_NEGOTIATION_NOTICE,GAME_NUMBERS.combat.negotiation.notice,'提示文字取自配置');
 // 真动手的话照常走攻击
 await host.submitSceneInput(h.save,'我挥刀砍向袭击者',h.deps);
 assert.equal(ext.activeScene(h.save).pending?.plan.goal,'attack');
});

function intentStub(reply){return async()=>JSON.stringify(reply);}
async function freeTurn(save,text,{reply={actionId:'none',certainty:'high',tickets:[]},roll}={}){
 const out=await freeTurnOn(save,text,{reply,roll});return {...out,save};
}
async function freeTurnOn(save,text,{reply,roll}){
 const intent=await router.resolveNaturalIntent({saveData:save,playerText:text,generate:intentStub(reply)});
 const tickets=intent.freeActionTickets||[];
 const issue=turn.issueFreeActionJudgement(save,tickets);
 if(!issue.issued)return {intent,tickets,issued:null};
 const resolution=judgement.resolvePendingJudgement(save,issue.issued.id,{currentTurn:actionGate.getNarrativeTurn(save),roll:()=>roll});
 const settlement=turn.settleFreeActionTurn(save,tickets,resolution);
 return {intent,tickets,issued:issue.issued,resolution,settlement,card:judgement.getJudgementState(save).recent.at(-1)};
}

test('5) 「08e0-新档F01后」读档后同地休息 4 次、调息 3 次：模型不给票时本地兜底出票，每次都出判定；成功那次解除外伤（重），判定卡回执写明',async()=>{
 const save=await readSaveFixture('./fixtures/playtest-08e0/f01-after.json');
 assert.ok(effectNames(save).includes('外伤（重）'));
 const rest='我在商队宿处躺下好好休息一整夜，养一养伤',meditate='我盘膝调息疗伤，运功化开外伤淤血';
 const rolls=[6,1,2,6,1,12,15];const runs=[];
 for(const [i,text] of [rest,rest,rest,rest,meditate,meditate,meditate].entries()){
  const r=await freeTurn(save,text,{roll:rolls[i]});runs.push(r);
  assert.ok(r.issued,`第 ${i+1} 次（${text.slice(0,6)}…）出了判定`);
  assert.equal(r.tickets[0].variant,'recover');
  assert.equal(r.resolution.roll,rolls[i]);
 }
 const ok=runs.findIndex(r=>['success','great_success','perfect'].includes(r.resolution.outcome));
 assert.ok(ok>=0,'有一次成功');
 assert.ok(runs.slice(0,ok).every(r=>effectNames(save)!==undefined));
 assert.ok(!effectNames(save).includes('外伤（重）'),'成功后外伤（重）解除');
 const card=runs[ok].card;
 const text=[...card.appliedEffects,...(card.settledEffects||[])].map(judgement.describeJudgementEffect).join('、');
 assert.match(text,/解除「外伤（重）」/,'判定卡“已写入”写明外伤已解除');
 assert.match(runs[ok].settlement.block,/外伤（重）已经解除/);
 assert.ok(judgement.verifyResolvedJudgementReceipt(save,runs[ok].resolution),'补记解伤不破坏叙事侧的回执校验');
});

test('5) 模型自己出了票就不重复补；问句、否定句、替别人疗伤不补本地票',async()=>{
 const save=await readSaveFixture('./fixtures/playtest-08e0/f01-after.json');
 const own=await router.resolveNaturalIntent({saveData:save,playerText:'我盘膝调息疗伤',generate:intentStub({actionId:'none',certainty:'high',tickets:[{actionClass:'solo',variant:'recover',targetId:null,degree:'light',performed:'yes',evidence:'调息疗伤',itemId:null}]})});
 assert.equal(own.freeActionTickets.length,1);assert.equal(own.freeActionTickets[0].degree,'light');
 for(const text of ['我要不要先休息一整夜？','我不休息，继续赶路','我替她疗伤','我替凝羽疗伤','我帮师姐调息']){
  const r=await router.resolveNaturalIntent({saveData:save,playerText:text,generate:intentStub({actionId:'none',certainty:'high',tickets:[]})});
  assert.ok(!(r.freeActionTickets||[]).some(t=>t.variant==='recover'),text);
 }
});

test('5) 读档后骰子：自由行动判定用 Math.random（不按存档播种）；同一判定 id 重复确认才返回同一结果（防重掷），新签发的判定每次重掷',async()=>{
 const save=await readSaveFixture('./fixtures/playtest-08e0/f01-after.json');
 const a=await freeTurn(structuredClone(save),'我在商队宿处躺下好好休息一整夜，养一养伤',{roll:6});
 const b=await freeTurn(structuredClone(save),'我在商队宿处躺下好好休息一整夜，养一养伤',{roll:13});
 assert.notEqual(a.issued.id,b.issued.id,'同一存档读两次、签发的判定 id 不同');
 assert.equal(a.resolution.roll,6);assert.equal(b.resolution.roll,13,'骰点由当次掷骰决定，不是读档重放');
 const replay=judgement.resolvePendingJudgement(a.save,a.issued.id,{currentTurn:1,roll:()=>20});
 assert.equal(replay.roll,6,'同一判定 id 再确认返回存好的结果（防重掷，有意设计）');
 const src=await readFile(new URL('../src/utils/diceRoller.ts',import.meta.url),'utf8');assert.match(src,/Math\.random\(\)/);
});
