import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {loadTs} from './loadTs.mjs';
import {resolveNumbers,expandEchoes,projectQuestLineEvents} from '../scripts/content-pack-quest-lines.mjs';
const init=await loadTs('../src/modules/scenarioMods/strictInitializer.ts'),repair=await loadTs('../src/utils/dataRepair.ts'),rt=await loadTs('../src/modules/scenarioMods/runtime.ts'),q=await loadTs('../src/modules/scenarioMods/questLines.ts'),ctxmod=await loadTs('../src/modules/scenarioMods/questLineContext.ts'),packs=await loadTs('../src/modules/contentPacks/index.ts'),rail=await loadTs('../src/modules/scenarioMods/canonRail.ts'),guard=await loadTs('../src/modules/scenarioMods/farewellReplyGuard.ts');
const read=p=>JSON.parse(fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8'));
const numbers=read('mod-kit/game-numbers.qingyu.json'),index=read('mod-kit/entity-catalog/index.json'),catalog=read('src/modules/contentPacks/generated/catalog.json');
const ids=new Set(index.entries.map(e=>`${e.kind}:${e.id}`));
const NY='liuchao.character.ning_yu',LMZ='liuchao.character.le_mingzhu';
const PACK_LINES=['line.side.baihu','line.char.ning_yu','line.char.le_mingzhu.bond'];
const beats=catalog.questLines.flatMap(l=>l.beats);
const stageMod=id=>packs.applyContentPackOverlays(JSON.parse(fs.readFileSync(new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`,import.meta.url))));
const E=s=>'lcq.event.'+s;
function fixture(beatId,{completed=[],active=[],affinity={}}={}){
 const b=q.QUEST_LINES.flatMap(l=>l.beats).find(b=>b.id===beatId);assert.ok(b,beatId);
 const mod=stageMod(b.stageId),save=init.applyStrictScenarioInitializationToSave(repair.createMinimalSaveDataV3(),init.buildStrictScenarioInitialization(mod)),r=save.世界.状态.剧本模组;
 r.currentChapterId=rail.getCanonRailProfile(r)?.chapterId??r.chapters[0].id;r.completedEventIds=completed.map(E);r.activeEventIds=active.map(E);r.affinityGrantedEventIds=[...r.completedEventIds];r.worldTurn=10;
 const loc=r.canon.locations.find(l=>l.id===b.locationId);save.角色.位置={描述:loc.name,地点ID:loc.id,x:loc.coordinates?.x??0,y:loc.coordinates?.y??0};
 if(b.sceneLocationId)save.角色.位置.locationId=b.sceneLocationId; // 路上的拍：玩家实际在行旅节点，不在正典地点（真实路径见 baihuLinesRealPath.test.mjs）
 for(const [id,v] of Object.entries(affinity)){const c=r.canon.characters.find(c=>c.id===id);save.社交.关系[id]||={角色ID:id,名字:c?.name||id,好感度:v};save.社交.关系[id].好感度=v;}
 return {save,r,b};
}
const offered=f=>rt.getCurrentStoryExplorationActions(f.save).filter(a=>a.eventId===f.b.eventId);
function act(f,id){const a=rt.getCurrentStoryExplorationActions(f.save).find(a=>a.actionId===id);assert.ok(a,`${id} not offered`);f.r.worldTurn++;return rt.recordStoryEventStructuredAction(f.save,a);}
const aff=(f,id)=>f.save.社交.关系[id].好感度;
const eventOf=f=>f.r.events.find(e=>e.id===f.b.eventId);
const action=(f,id)=>eventOf(f).playerCompletionContract.actions.find(a=>a.id===id);

// ---------------------------------------------------------------- pack integrity
test('every pack beat is projected as an optional event and every new id is in the id table',()=>{
 assert.deepEqual(catalog.questLines.map(l=>l.id),PACK_LINES);
 assert.equal(beats.length,15);
 for(const b of beats){
  const stage=stageMod(b.stageId),e=stage.scenario.events.find(e=>e.id===b.eventId);
  assert.ok(e,b.eventId);assert.equal(e.critical,false);assert.equal(e.questLineBeatId,b.id);
  assert.deepEqual(e.playerCompletionContract.actions.map(a=>a.id),b.steps.map(s=>s.actionId));
  assert.ok(ids.has(`event:${b.eventId}`),b.eventId);
  for(const a of b.steps)assert.ok(ids.has(`action:${b.eventId}:${a.actionId}`),a.actionId);
  for(const e of [...b.onComplete,...Object.values(b.byAction).flat(),...(b.onExpire||[])]){
   if(e.kind==='setState')assert.ok(ids.has(`state:${e.stateId}`),e.stateId);
   if(e.kind==='setReceipt')assert.ok(ids.has(`receipt:${e.receiptId}`),e.receiptId);
   if(e.kind==='affinityGrant')assert.ok(ids.has(`affinityWeight:${e.weightId}`),e.weightId);
   if(e.kind==='memoryTicket')assert.ok(ids.has(`memoryTemplate:${e.episodeTemplateId}`),e.episodeTemplateId);
   if(e.kind==='reveal')assert.ok(ids.has(`fact:${e.factId}`),e.factId);
  }
 }
 for(const l of catalog.questLines)assert.ok(ids.has(`line:${l.id}`));
 assert.ok(ids.has('status:addiction')&&ids.has('status:addiction.maigu'));
});
test('states that later stages read all use a prefix the stage transition carries over',()=>{
 const states=new Set(beats.flatMap(b=>[...b.onComplete,...Object.values(b.byAction).flat(),...(b.onExpire||[])]).filter(e=>e.kind==='setState').map(e=>e.stateId));
 assert.ok(states.size>=15);
 for(const s of states)assert.match(s,/^branch\./,s);
 const src=fs.readFileSync(new URL('../src/modules/scenarioMods/strictInitializer.ts',import.meta.url),'utf8');
 assert.match(src,/key\.startsWith\('branch\.'\)/);
});
test('affinity weights and salience come from the numbers file, not from the line data',()=>{
 const w=catalog.questLineResources.affinityWeights;
 assert.equal(w['aff.w.ningyu.care_warm'],numbers.lineBonds.ningyu.careWarm);
 assert.equal(w['aff.w.ningyu.farewell_word'],numbers.lineBonds.ningyu.farewellWord);
 assert.equal(w['aff.w.lmz.tease_penalty'],numbers.lineBonds.lemingzhu.teasePenalty);
 assert.equal(w['aff.w.bonus_active'],numbers.lineBonds.bonusPerActiveAction);
 assert.equal(catalog.questLineResources.salience['sal.notable'],numbers.lineBonds.salience.notable);
 assert.equal(q.LINE_RESOURCES.affinityWeights['aff.w.lmz.tease_penalty'],-3);
 for(const file of ['lines-baihu','lines-ningyu','lines-lemingzhu','lines-resources'])assert.doesNotMatch(fs.readFileSync(new URL(`../src/modules/contentPacks/packs/qingyu/${file}.json`,import.meta.url),'utf8'),/"(?:aff\.w[^"]*|sal\.notable)":\s*-?\d/,file);
});

// ---------------------------------------------------------------- compiler pieces
test('$num substitution fails closed on unknown or non-scalar paths',()=>{
 assert.equal(resolveNumbers({a:{$num:'lineBonds.bonusPerActiveAction'}},numbers).a,1);
 assert.throws(()=>resolveNumbers({$num:'lineBonds.nope'},numbers),/unknown number/);
 assert.throws(()=>resolveNumbers({$num:'lineBonds'},numbers),/unknown number/);
 assert.throws(()=>resolveNumbers({$num:'lineBonds.salience.notable',x:1},numbers),/stand alone/);
});
test('echo expansion keeps one visible variant per state value and carries receipts and effects',()=>{
 const line={id:'t',beats:[{id:'b',eventId:'e',steps:[{actionId:'a',kind:'attempt',outcomeId:'o'}],completedBy:{eventActionReceipt:{eventId:'e',actionId:'a'}},byAction:{a:[{kind:'setState',stateId:'branch.x',value:1}]},echo:{reads:'branch.r',variants:{hot:{previousId:'p'},cold:{outcomeIds:{a:'o2'}}}}}]};
 const [b]=expandEchoes(line).beats;
 assert.deepEqual(b.steps.map(s=>s.actionId),['a','a.v_hot','a.v_cold']);
 assert.deepEqual(b.steps[0].visibleWhen.map(c=>[c.operator,c.value]),[['neq','hot'],['neq','cold']]);
 assert.deepEqual(b.steps[1].visibleWhen,[{path:'flags.branch.r',operator:'eq',value:'hot'}]);
 assert.equal(b.steps[1].previousId,'p');assert.equal(b.steps[2].outcomeId,'o2');assert.equal(b.steps[1].variantOf,'a');
 assert.deepEqual(b.completedBy.anyOf.map(r=>r.eventActionReceipt.actionId),['a','a.v_hot','a.v_cold']);
 assert.deepEqual(b.byAction['a.v_cold'],b.byAction.a);
 assert.throws(()=>expandEchoes({beats:[{id:'b',steps:[{actionId:'a'}],completedBy:{},echo:{reads:'x',variants:{'Bad Value':{}}}}]}),/echo value/);
});
test('replyMode=model is refused where no narrative guard exists, and emits forbidden terms where one does',()=>{
 const stage={scenario:{events:[]},canon:{characters:[{id:'c'}],locations:[{id:'l',name:'某地'}]}};
 const text=Object.fromEntries(['n','o','b','l','i','x'].map(k=>[k,k+k]));
 const mk=mode=>({id:'ln',nameId:'n',beats:[{id:'b1',eventId:'e1',stageId:'s',locationId:'l',presentActorIds:['c'],canonChapter:1,briefId:'b',objectiveId:'o',steps:[{actionId:'a',kind:'attempt',labelId:'l',intentId:'i',outcomeId:'x',replyMode:mode,forbidden:['爱']}]}]});
 const run=(mode,covers)=>projectQuestLineEvents({lines:[mk(mode)],stages:new Map([['s',stage]]),texts:text,intentMatches:{},guardCovers:()=>covers});
 assert.throws(()=>run('model',false),/needs the step narrative guard/);
 const model=run('model',true).get('s')[0].playerCompletionContract.actions[0];assert.deepEqual(model.forbidden,['爱']);assert.equal(model.forceFixed,undefined);assert.equal(model.fallbackText,'xx');
 const fixed=run('fixed',false).get('s')[0].playerCompletionContract.actions[0];assert.equal(fixed.forceFixed,true);assert.equal(fixed.forbidden,undefined);
 assert.throws(()=>projectQuestLineEvents({lines:[{...mk('fixed'),beats:[{...mk('fixed').beats[0],presentActorIds:['ghost']}]}],stages:new Map([['s',stage]]),texts:text,intentMatches:{},guardCovers:()=>false}),/not in s canon/);
});

// ---------------------------------------------------------------- 白湖商馆
test('O1 opens only while the fee event is the anchor; advancing alone never writes the stance',()=>{
 const f=fixture('beat.baihu.o1_price',{completed:['gamble_bond_signed'],active:['charge_sudaji_fee']});
 assert.deepEqual(offered(f).map(a=>a.actionId),['act.baihu.o1.priced','act.baihu.o1.probing','act.baihu.o1.deferential']);
 const advanced=rt.advanceScenarioRuntime(f.save).saveData;
 assert.equal(advanced.世界.状态.剧本模组.flags['branch.baihu.first_bargain'],undefined);
 assert.equal(advanced.世界.状态.剧本模组.questLineState.receipts[f.b.id],undefined);
 const g=fixture('beat.baihu.o1_price',{completed:['gamble_bond_signed','charge_sudaji_fee'],active:[]});
 ctxmod.expireQuestLineWindows(g.save);assert.equal(offered(g).length,0);assert.ok(g.r.questLineState.expired[g.b.id]!==undefined);
 const res=act(f,'act.baihu.o1.probing');
 assert.equal(res.completed,true);assert.equal(f.r.flags['branch.baihu.first_bargain'],'probing');assert.ok(f.r.pathReceipts['rcpt.baihu.o1.probing']);
 assert.equal(offered(f).length,0);
});
test('O2 records the regicide stance for both lines and moves her affinity by the configured weight',()=>{
 const f=fixture('beat.ningyu.o2_regicide',{completed:['ningyu_regicide_offer'],affinity:{[NY]:30}});
 assert.equal(offered(f).length,3);
 act(f,'act.ningyu.o2.ask_why');
 assert.equal(f.r.flags['branch.baihu.regicide_stance'],'deferred');assert.equal(f.r.flags['branch.ningyu.regicide_reply'],'asked_why');
 assert.equal(aff(f,NY),30+numbers.lineBonds.ningyu.regicideAskWhy);
 assert.match(f.save.社交.关系[NY].记忆.at(-1),/只问她为什么/);
 const g=fixture('beat.ningyu.o2_regicide',{completed:['ningyu_regicide_offer'],affinity:{[NY]:30}});
 act(g,'act.ningyu.o2.refuse');assert.equal(g.r.flags['branch.baihu.regicide_stance'],'no');assert.equal(aff(g,NY),30+numbers.lineBonds.ningyu.regicideRefuse);
});
test('O3 stance then O5: a lie told at the mirror is the card the courier choice is shown with',()=>{
 const f=fixture('beat.baihu.o3_report',{completed:['s04b_lingfei_baiyi_crisis_06'],active:['s04b_lingfei_baiyi_crisis_07']});
 assert.equal(offered(f).length,3);act(f,'act.baihu.o3.lie');assert.equal(f.r.flags['branch.baihu.report'],'lie');
 const plain=fixture('beat.baihu.o5_deadline',{active:['s05b_ice_gu_detour']});
 assert.deepEqual(offered(plain).map(a=>a.actionId),['act.baihu.o5.courier','act.baihu.o5.silent','act.baihu.o5.sample']);
 assert.doesNotMatch(offered(plain)[0].actionText+action(plain,'act.baihu.o5.courier').previousBeat,/祁远在一旁提醒/);
 const lied=fixture('beat.baihu.o5_deadline',{active:['s05b_ice_gu_detour']});lied.r.flags['branch.baihu.report']='lie';
 assert.deepEqual(offered(lied).map(a=>a.actionId),['act.baihu.o5.courier.v_lie','act.baihu.o5.silent.v_lie','act.baihu.o5.sample.v_lie']);
 assert.match(action(lied,'act.baihu.o5.courier.v_lie').previousBeat,/祁远在一旁提醒/);
 assert.match(action(lied,'act.baihu.o5.courier.v_lie').sceneObjective,/承上：.*祁远/);
 const res=act(lied,'act.baihu.o5.sample.v_lie');assert.equal(res.completed,true);assert.equal(lied.r.flags['branch.baihu.return_message'],'letter');
 assert.equal(lied.r.pathReceipts['rcpt.baihu.o5.sample'].sourceEventId,lied.b.eventId);
});

// ---------------------------------------------------------------- 凝羽
test('Y3 care is remembered, scored by config, and echoed into the Y5 card',()=>{
 const f=fixture('beat.ningyu.y3_fire',{completed:['rainforest_black_shoal'],affinity:{[NY]:30}});
 act(f,'act.ningyu.y3.private');assert.equal(f.r.flags['branch.ningyu.care'],'warm');assert.equal(aff(f,NY),30+numbers.lineBonds.ningyu.careWarm);
 const g=fixture('beat.ningyu.y5_enter',{completed:['guiwangdong_coop_pact'],affinity:{[NY]:30}});
 assert.deepEqual(offered(g).map(a=>a.actionId),['act.ningyu.y5.bring','act.ningyu.y5.stay','act.ningyu.y5.ask']);
 g.r.flags['branch.ningyu.care']='warm';
 assert.deepEqual(offered(g).map(a=>a.actionId),['act.ningyu.y5.bring.v_warm','act.ningyu.y5.stay.v_warm','act.ningyu.y5.ask.v_warm']);
 assert.match(action(g,'act.ningyu.y5.stay.v_warm').previousBeat,/干衣服/);
 act(g,'act.ningyu.y5.stay.v_warm');assert.equal(g.r.flags['branch.ningyu.enter_dong'],'stay');assert.equal(aff(g,NY),30+numbers.lineBonds.ningyu.enterStay);
});
const doorFixture=(extra={})=>fixture('beat.ningyu.y6_door',{completed:['s05b_yeao_palm_ningyu_stays'],affinity:{[NY]:40},...extra});
const doorBonus=['beat.ningyu.y6.knock','beat.ningyu.y6.call','beat.ningyu.y6.recall'];
test('AC-NY-01: only pressing next never reaches the farewell step; the window settles as silent with no gain',()=>{
 const f=doorFixture();
 const before=aff(f,NY);
 const advanced=rt.advanceScenarioRuntime(f.save).saveData,r=advanced.世界.状态.剧本模组;
 assert.equal(r.flags['branch.ningyu.farewell'],undefined);assert.equal(r.questLineState.receipts[f.b.id],undefined);assert.equal(advanced.社交.关系[NY].好感度,before);
 f.r.completedEventIds.push(E('shanghou_cures_ice_gu'));
 const closed=rt.advanceScenarioRuntime(f.save).saveData,cr=closed.世界.状态.剧本模组;
 assert.equal(cr.flags['branch.ningyu.farewell'],'silent');assert.ok(cr.questLineState.expired[f.b.id]!==undefined);assert.equal(cr.questLineState.receipts[f.b.id],undefined);
 assert.equal(closed.社交.关系[NY].好感度,before);
 const again=rt.advanceScenarioRuntime(closed).saveData.世界.状态.剧本模组;assert.equal(again.flags['branch.ningyu.farewell'],'silent');
});
test('AC-NY-02: active knock, call and recall each add the configured bonus, then the farewell is scored once',()=>{
 const f=doorFixture();f.r.flags['branch.ningyu.care']='warm';
 for(const id of doorBonus){const g={...f,b:q.QUEST_LINES.flatMap(l=>l.beats).find(b=>b.id===id)};assert.equal(offered(g).length,1,id);}
 const bonus=numbers.lineBonds.bonusPerActiveAction;
 for(const [id,flag] of [['ningyu.y6.knock','door_knocked'],['ningyu.y6.call','door_called'],['ningyu.y6.recall','door_recalled']]){
  const g={...f,b:q.QUEST_LINES.flatMap(l=>l.beats).find(b=>b.id==='beat.'+id)};const before=aff(f,NY);act(g,'act.'+id);
  assert.equal(aff(f,NY),before+bonus);assert.equal(f.r.flags['branch.ningyu.'+flag],true);
 }
 const before=aff(f,NY);
 assert.deepEqual(offered(f).map(a=>a.actionId),['act.ningyu.y6.word.v_warm','act.ningyu.y6.token.v_warm']);
 const res=act(f,'act.ningyu.y6.word.v_warm');
 assert.equal(res.completed,true);assert.equal(f.r.flags['branch.ningyu.farewell'],'word');
 assert.equal(aff(f,NY),before+numbers.lineBonds.ningyu.farewellWord);
 assert.equal(f.r.questLineState.receipts[f.b.id].outcome,'success');
 ctxmod.expireQuestLineWindows(f.save);assert.equal(f.r.flags['branch.ningyu.farewell'],'word');
});
test('AC-NY-03: only the required step, everything else automatic, still settles with no bonus',()=>{
 const f=doorFixture();const before=aff(f,NY);
 assert.deepEqual(offered(f).map(a=>a.actionId),['act.ningyu.y6.word','act.ningyu.y6.token']);
 act(f,'act.ningyu.y6.token');
 assert.equal(f.r.flags['branch.ningyu.farewell'],'token');assert.equal(aff(f,NY),before+numbers.lineBonds.ningyu.farewellToken);
 for(const k of ['door_knocked','door_called','door_recalled'])assert.equal(f.r.flags['branch.ningyu.'+k],undefined);
});
test('the door answer is a fixed backup chosen by care, never a confession, and reply mode is fixed until the guard is wired',()=>{
 const f=doorFixture();
 const text=care=>{f.r.flags['branch.ningyu.care']=care;return offered(f).map(a=>action(f,a.actionId));};
 const none=text('none')[0],plain=text('plain')[0],warm=text('warm')[0];
 assert.match(none.fallbackText,/门里没有声音，门也没有开/);
 assert.ok(plain.fallbackText.includes(guard.FAREWELL_FALLBACKS.plain));
 assert.ok(warm.fallbackText.includes(guard.FAREWELL_FALLBACKS.warm));
 for(const a of [none,plain,warm]){assert.equal(a.forceFixed,true);assert.equal(a.forbidden,undefined);assert.equal(guard.farewellKeywordHit(a.fallbackText),null);assert.deepEqual(a.outcomeText,{success:a.fallbackText,partial:a.fallbackText,failure:a.fallbackText});}
 assert.equal(numbers.lineBonds.ningyu.replyMode,'fixed');
});
test('farewell guard: keyword hit, equivalent-expression review, review failure and clean pass',async()=>{
 const confessions=['我爱你','我喜欢你','我心里只有你','舍不得你走','我等你回来','我想你','我愿跟你走','我想丢下一切与你同行','我离不开你','她是爱你的'];
 for(const c of confessions){const r=await guard.checkFarewellReply({text:c,care:'warm',review:async()=>'{"admitsFeelings":false}'});assert.equal(r.ok,false,c);assert.equal(r.reason,'keyword');assert.equal(r.text,guard.FAREWELL_FALLBACKS.warm);}
 const equivalent=await guard.checkFarewellReply({text:'此生非你不可。',care:'plain',review:async()=>'{"admitsFeelings":true}'});
 assert.deepEqual([equivalent.ok,equivalent.reason,equivalent.text],[false,'review',guard.FAREWELL_FALLBACKS.plain]);
 for(const bad of [async()=>{throw Error('down');},async()=>'not json',async()=>'{}']){const r=await guard.checkFarewellReply({text:'走吧。',review:bad});assert.equal(r.ok,false);assert.equal(r.text,guard.FAREWELL_FALLBACKS.none);}
 const clean=await guard.checkFarewellReply({text:'「走吧。」',care:'plain',review:async()=>'```json\n{"admitsFeelings": false}\n```'});
 assert.deepEqual(clean,{ok:true,text:'「走吧。」'});
 assert.ok(guard.buildFarewellReviewPrompt('x').system.includes('admitsFeelings'));
});

// ---------------------------------------------------------------- 乐明珠
const lmzFixture=(id,o={})=>fixture(id,{affinity:{[LMZ]:40},...o});
test('L1 scores the moment she runs out; L4 shows the card echo only after the promise',()=>{
 const f=lmzFixture('beat.lmz.l1_crow',{completed:['s04b_lingfei_baiyi_crisis_01'],active:['s04b_lingfei_baiyi_crisis_02']});
 assert.equal(offered(f).length,3);act(f,'act.lmz.l1.shield');
 assert.equal(f.r.flags['branch.lmz.first_rescue'],'shielded');assert.equal(aff(f,LMZ),40+numbers.lineBonds.lemingzhu.crowShield);
 const g=lmzFixture('beat.lmz.l4_reunion',{active:['s05b_06_breakout_and_reunion']});
 assert.deepEqual(offered(g).map(a=>a.actionId),['act.lmz.l4.laugh','act.lmz.l4.scold','act.lmz.l4.run']);
 g.r.flags['branch.lmz.pan_secret']='promised';
 assert.deepEqual(offered(g).map(a=>a.actionId),['act.lmz.l4.laugh.v_promised','act.lmz.l4.scold.v_promised','act.lmz.l4.run.v_promised']);
 assert.match(action(g,'act.lmz.l4.run.v_promised').previousBeat,/保守过秘密/);
 act(g,'act.lmz.l4.scold.v_promised');assert.equal(g.r.flags['branch.lmz.reunion'],'scolded');assert.equal(aff(g,LMZ),40+numbers.lineBonds.lemingzhu.reunionScold);
});
test('L5 is witness-only: one action, a confirmed player fact, no affinity change',()=>{
 const f=lmzFixture('beat.lmz.l5_redlight',{completed:['s05b_10_slave_revolt_and_phoenix_change']});
 assert.deepEqual(offered(f).map(a=>a.actionId),['act.lmz.l5.witness']);
 act(f,'act.lmz.l5.witness');
 assert.equal(f.r.playerKnowledge['fact.lmz.phoenix_change'].status,'confirmed');assert.equal(f.r.flags['branch.lmz.phoenix_change'],'seen');assert.equal(aff(f,LMZ),40);
});
test('the existing 「别跟潘师姐说」 beat now records its answer, takes its penalty from config, and defaults to none',()=>{
 const base={completed:['s04_03'],active:['s04_04'].slice(0,0)};
 const mk=()=>lmzFixture('beat.le_mingzhu.s04_03.pan_secret',base);
 const a=mk();act(a,'act.lmz.promise_silence');assert.equal(a.r.flags['branch.lmz.pan_secret'],'promised');assert.equal(aff(a,LMZ),43);
 const b=mk();act(b,'act.lmz.tease_with_pan');assert.equal(b.r.flags['branch.lmz.pan_secret'],'teased');assert.equal(aff(b,LMZ),40+numbers.lineBonds.lemingzhu.teasePenalty);
 const c=mk();act(c,'act.lmz.hard_truth');assert.equal(c.r.flags['branch.lmz.pan_secret'],'hard_truth');
 const d=mk();rt.advanceScenarioRuntime(d.save);assert.equal(d.r.flags['branch.lmz.pan_secret'],undefined);
 const next=d.r.events.find(e=>e.id===E('s04_04')),at=d.r.canon.locations.find(l=>l.id===next.locationId);
 d.r.activeEventIds=[next.id];d.save.角色.位置={描述:at.name,地点ID:at.id,x:at.coordinates?.x??0,y:at.coordinates?.y??0};
 ctxmod.expireQuestLineWindows(d.save);
 assert.equal(d.r.flags['branch.lmz.pan_secret'],'none');assert.equal(aff(d,LMZ),40);assert.equal(d.r.questLineState.receipts[d.b.id],undefined);
 // the next stage (chapter floor 56) closes it even though s04_04 never exists there; an answered window is never overwritten
 const ctx={completedEventIds:[],presentActorIds:[],knownFactIds:[],chapterOrder:{},currentChapterOrder:55,affinity:{},flags:{}};
 assert.equal(q.lineConditionMet(d.b.closeWhen,ctx),false);assert.equal(q.lineConditionMet(d.b.closeWhen,{...ctx,currentChapterOrder:56}),true);
 const g=mk();act(g,'act.lmz.promise_silence');g.r.activeEventIds=[next.id];g.save.角色.位置=d.save.角色.位置;ctxmod.expireQuestLineWindows(g.save);assert.equal(g.r.flags['branch.lmz.pan_secret'],'promised');
});
test('sharing the mushroom is an independent bonus that never replaces the answer',()=>{
 const f=lmzFixture('beat.lmz.l2.share',{completed:['s04_03']});
 const before=aff(f,LMZ);act(f,'act.lmz.l2.share');
 assert.equal(aff(f,LMZ),before+numbers.lineBonds.lemingzhu.shareMushroom);assert.equal(f.r.flags['branch.lmz.pan_secret'],undefined);
 const pan=q.QUEST_LINES.flatMap(l=>l.beats).find(b=>b.id==='beat.le_mingzhu.s04_03.pan_secret');assert.equal(f.r.questLineState.receipts[pan.id],undefined);
});

test('L3 harpoon is an optional bonus stop beside the critical event: two ways to help, config-driven bonus, next-step never triggers it',()=>{
 const mk=(extra={})=>lmzFixture('beat.lmz.l3_harpoon',{active:['pull_harpoon_lemingzhu'],...extra});
 const f=mk();
 assert.equal(eventOf(f).critical,false);assert.deepEqual(f.b.role,['choice']);
 assert.deepEqual(offered(f).map(a=>a.actionId),['act.lmz.l3.pull','act.lmz.l3.bandage']);
 const before=aff(f,LMZ);act(f,'act.lmz.l3.pull');
 assert.equal(f.r.flags['branch.lmz.harpoon'],'pulled');assert.equal(aff(f,LMZ),before+numbers.lineBonds.lemingzhu.harpoonPull);
 assert.ok(f.r.questLineState.receipts[f.b.id]);
 const g=mk();act(g,'act.lmz.l3.bandage');
 assert.equal(g.r.flags['branch.lmz.harpoon'],'bandaged');assert.equal(aff(g,LMZ),40+numbers.lineBonds.lemingzhu.harpoonBandage);
 // echo: the L1 rescue state changes only the card's 承上, never the options or the bonus
 const h=mk();h.r.flags['branch.lmz.first_rescue']='shielded';
 assert.deepEqual(offered(h).map(a=>a.actionId),['act.lmz.l3.pull.v_shielded','act.lmz.l3.bandage.v_shielded']);
 assert.match(action(h,'act.lmz.l3.pull.v_shielded').previousBeat||action(h,'act.lmz.l3.pull.v_shielded').sceneObjective,/先护在她身前/);
 act(h,'act.lmz.l3.pull.v_shielded');assert.equal(aff(h,LMZ),40+numbers.lineBonds.lemingzhu.harpoonPull);
 // pressing 「下一步」 never does the optional help: no state, no affinity, no receipt
 const n=mk();rt.advanceScenarioRuntime(n.save);
 assert.equal(n.r.flags['branch.lmz.harpoon'],undefined);assert.equal(aff(n,LMZ),40);assert.equal(n.r.questLineState?.receipts?.[n.b.id],undefined);
 // the authored main-line event and its contract hash are untouched by the bonus
 const main=stageMod('lcq.stage_04b_lingfei_baiyi_crisis').scenario.events.find(e=>e.id===E('pull_harpoon_lemingzhu'));
 assert.equal(main.critical,true);assert.deepEqual(main.playerCompletionContract.actions.map(a=>a.id),['pull_harpoon_from_mingzhu','stabilize_mingzhu_after_harpoon']);
});

// ---------------------------------------------------------------- L6 称呼（乐明珠对主角的叫法 = npcAddress 渠道）
// 改口由 L4 重逢按“主动得分”写 branch.lmz.title_upgraded（只看玩家在乐明珠线各停靠点的选择，不看总好感）；账本档用 requiresState 读它；冻结文件里的守卫也读账本。
const naming=await loadTs('../src/modules/scenarioMods/ledger/naming.ts'),named=await loadTs('../src/modules/scenarioMods/namedEntities.ts');
const TITLE='branch.lmz.title_upgraded',OLD='大笨蛋／大笨牛',NEW='大笨瓜',UNION='大笨蛋／大笨牛／大笨瓜';
const lmzTiers=()=>read('mod-kit/entity-ledger/overrides.json').entities.find(e=>e.id===LMZ).naming.npcAddress;
const upgraded=f=>f.r.flags[TITLE]===true;
// 主动得分：L1/L2/L2加分/L3 的选择记在 branch.lmz.* 状态里，L4 按配置的分值求和（再加 L4 自己这一选）。
const SC=numbers.lineBonds.lemingzhu.activeScore,LINE=numbers.lineBonds.lemingzhu.titleUpgradeActiveScore;
const TERMS=[['branch.lmz.first_rescue',{rushed:SC.l1Rush,waited:SC.l1Wait,shielded:SC.l1Shield}],['branch.lmz.pan_secret',{promised:SC.l2Promise,hard_truth:SC.l2HardTruth,teased:SC.l2Tease}],['branch.lmz.shared_mushroom',{true:SC.l2Share}],['branch.lmz.harpoon',{pulled:SC.l3Pull,bandaged:SC.l3Bandage}]];
const OWN={laugh:SC.l4Laugh,scold:SC.l4Scold,run:SC.l4Run};
// 每个停靠点各自的选法（只记状态值）。不做 = 没有这个状态。
const STOPS={l1:['branch.lmz.first_rescue',['rushed','waited','shielded']],l2:['branch.lmz.pan_secret',['promised','hard_truth','teased']],share:['branch.lmz.shared_mushroom',[true]],l3:['branch.lmz.harpoon',['pulled','bandaged']]};
const scoreOf=(flags,own)=>TERMS.reduce((n,[id,t])=>n+(t[String(flags[id])]??0),own);
// 真玩：每个停靠点在自己的存档里做一遍，取回写下的 branch.lmz.* 状态，再带到 L4 重逢存档。
const PLAY={
 l1:['beat.lmz.l1_crow',{completed:['s04b_lingfei_baiyi_crisis_01'],active:['s04b_lingfei_baiyi_crisis_02']},{rushed:'act.lmz.l1.rush',waited:'act.lmz.l1.wait',shielded:'act.lmz.l1.shield'}],
 l2:['beat.le_mingzhu.s04_03.pan_secret',{completed:['s04_03']},{promised:'act.lmz.promise_silence',hard_truth:'act.lmz.hard_truth',teased:'act.lmz.tease_with_pan'}],
 share:['beat.lmz.l2.share',{completed:['s04_03']},{true:'act.lmz.l2.share'}],
 l3:['beat.lmz.l3_harpoon',{active:['pull_harpoon_lemingzhu']},{pulled:'act.lmz.l3.pull',bandaged:'act.lmz.l3.bandage'}],
};
function playStops(choices){
 const flags={};
 for(const [stop,value] of Object.entries(choices)){const [beat,o,actions]=PLAY[stop];const f=lmzFixture(beat,o);act(f,actions[value]);Object.assign(flags,Object.fromEntries(Object.entries(f.r.flags).filter(([k])=>k.startsWith('branch.lmz.'))));}
 return flags;
}
function reunion(flags,choice,{affinity=40}={}){
 const g=lmzFixture('beat.lmz.l4_reunion',{active:['s05b_06_breakout_and_reunion'],affinity:{[LMZ]:affinity}});Object.assign(g.r.flags,flags);
 act(g,`act.lmz.l4.${choice}${flags['branch.lmz.pan_secret']==='promised'?'.v_promised':''}`);return g;
}
test('L6 ledger: the 47th-chapter tier is split old/new, the new tier is state-gated, thresholds live in the numbers file only',()=>{
 const tiers=lmzTiers();
 assert.deepEqual(tiers.map(t=>[t.fromChapter,t.text,t.requiresState]),[[47,OLD,undefined],[99,NEW,TITLE],[111,UNION,undefined],[111,NEW,TITLE]]);
 // no affinity number or affinity key anywhere in the ledger
 assert.ok(!JSON.stringify(read('mod-kit/entity-ledger/overrides.json')).includes('minAffinityKey'));
 // the gate state is written only by the L4 reunion actions (3 actions + their 3 `promised` variants), each conditional on the configured active-score line, never on affinity
 assert.equal(numbers.lineBonds.lemingzhu.titleUpgradeThreshold,undefined);assert.ok(!JSON.stringify(beats).includes('titleUpgradeThreshold'));
 const l4=beats.find(b=>b.id==='beat.lmz.l4_reunion');
 const writers=beats.flatMap(b=>[...b.onComplete,...Object.values(b.byAction).flat(),...(b.onExpire||[])]).filter(e=>e.kind==='setState'&&e.stateId===TITLE);
 assert.equal(writers.length,6);assert.equal(Object.keys(l4.byAction).length,6);
 for(const [action,effects] of Object.entries(l4.byAction)){
  const w=effects.filter(e=>e.stateId===TITLE);assert.equal(w.length,1,action);
  const own=OWN[action.split('.')[3]];
  assert.deepEqual(w[0],{kind:'setState',stateId:TITLE,value:true,when:{stateScoreAtLeast:{terms:TERMS.map(([stateId,scores])=>({stateId,scores})),plus:own,value:LINE}}},action);
  assert.ok(!JSON.stringify(w[0].when).includes('affinity'));
 }
 // every score term reads a state some stop really writes (known to the id table)
 for(const [id] of TERMS)assert.ok(ids.has(`state:${id}`),id);
});
test('L6 active score line: sits where "enough" begins — no two stops reach it, three well-chosen stops do, one stop alone never; the line is above anything the mainline alone yields (0)',()=>{
 const best={l1:SC.l1Shield,l2:SC.l2Promise,share:SC.l2Share,l3:SC.l3Bandage,l4:SC.l4Laugh};
 const sorted=Object.values(best).sort((a,b)=>b-a);
 assert.ok(sorted[0]+sorted[1]<LINE,'two best stops must not be enough');assert.ok(sorted[0]+sorted[1]+sorted[2]>=LINE,'three best stops are enough');
 assert.ok(sorted.reduce((a,b)=>a+b,0)>=LINE);assert.ok(LINE>0);
 // every score table entry is an integer, and the three stops with a non-choice (wait / hard_truth) score zero, not a penalty
 for(const v of Object.values(SC))assert.ok(Number.isInteger(v));assert.equal(SC.l1Wait,0);assert.equal(SC.l2HardTruth,0);
});
test('L6 before/after the switch: old pet names until the state is written, 大笨瓜 afterwards; chapter gate and other channels unaffected',()=>{
 const at=(chapter,flags,channel='npcAddress')=>naming.namingFor(LMZ,chapter,channel,{flags}).text;
 // before: no state, wrong value, or no context at all
 for(const flags of [undefined,{},{[TITLE]:false},{[TITLE]:'upgraded'}]){
  for(const chapter of [47,98,99,100,110])assert.equal(at(chapter,flags),OLD,`${chapter} ${JSON.stringify(flags)}`);
  assert.equal(at(111,flags),UNION);assert.equal(at(125,flags),UNION);
 }
 assert.equal(naming.namingFor(LMZ,100,'npcAddress').text,OLD);
 // after: the state is true; still not before the chapter of the L4 reunion
 const on={[TITLE]:true};
 assert.equal(at(98,on),OLD);for(const chapter of [99,100,110,111,125])assert.equal(at(chapter,on),NEW,String(chapter));
 // flag never changes the other channels
 for(const channel of ['panel','narration','protagonistAddress','protagonistThought','selfReportedName'])assert.equal(at(123,on,channel),at(123,undefined,channel));
 assert.equal(at(123,on,'protagonistAddress'),'乐姑娘');
});
test('L6 mainline alone never changes the address: no stop played = score 0, whatever the affinity is',()=>{
 for(const affinity of [0,40,100,500])for(const choice of ['laugh','scold','run']){
  const g=reunion({},choice,{affinity});
  assert.equal(g.r.flags[TITLE],undefined,`${choice} @${affinity}`);
  assert.equal(g.r.flags['branch.lmz.reunion'],{laugh:'laughed',scold:'scolded',run:'fled'}[choice]); // the choice itself is still recorded
 }
 // pressing 「下一步」 at the reunion never writes it either
 const n=lmzFixture('beat.lmz.l4_reunion',{active:['s05b_06_breakout_and_reunion'],affinity:{[LMZ]:500}});rt.advanceScenarioRuntime(n.save);assert.equal(n.r.flags[TITLE],undefined);
 // a stop that was never answered counts 0 (pan_secret falls back to `none` when its window closes)
 assert.equal(reunion({'branch.lmz.pan_secret':'none'},'laugh').r.flags[TITLE],undefined);
});
test('L6 active play changes the address: enough active points upgrade it at L4, with any affinity; the L4 choice itself counts',()=>{
 // best path through every stop
 const best=playStops({l1:'shielded',l2:'promised',share:true,l3:'bandaged'});
 assert.deepEqual(Object.keys(best).sort(),['branch.lmz.first_rescue','branch.lmz.harpoon','branch.lmz.pan_secret','branch.lmz.shared_mushroom']);
 for(const affinity of [0,40,100])for(const choice of ['laugh','run'])assert.equal(upgraded(reunion(best,choice,{affinity})),true,`${choice} @${affinity}`);
 // four ordinary choices (rush, share, pull) reach the line only with a kind L4 choice: run tips it over, scolding her does not
 const ordinary=playStops({l1:'rushed',share:true,l3:'pulled'});
 assert.equal(scoreOf(ordinary,SC.l4Run)>=LINE,true);assert.equal(scoreOf(ordinary,SC.l4Scold)>=LINE,false);
 assert.equal(upgraded(reunion(ordinary,'run')),true);assert.equal(upgraded(reunion(ordinary,'scold')),false);
 // two good stops plus a kind L4 choice are enough; scolding her at L4 is judged by the same sum; one stop is not
 assert.equal(upgraded(reunion(playStops({l1:'shielded',l3:'bandaged'}),'laugh')),true);
 assert.equal(upgraded(reunion(playStops({l1:'shielded',l3:'bandaged'}),'scold')),scoreOf({'branch.lmz.first_rescue':'shielded','branch.lmz.harpoon':'bandaged'},SC.l4Scold)>=LINE);
 assert.equal(upgraded(reunion(playStops({l1:'shielded'}),'laugh')),false);
 // active but unkind choices cost points: teasing her about the secret takes back what the other stops earned
 const teased=playStops({l1:'shielded',l2:'teased',share:true,l3:'bandaged'});
 assert.equal(scoreOf(teased,SC.l4Run)>=LINE,upgraded(reunion(teased,'run')));
});
test('L6 the written condition is the plain sum: every combination of stop choices × L4 choice, both sides of the line',()=>{
 const when=beats.find(b=>b.id==='beat.lmz.l4_reunion').byAction['act.lmz.l4.laugh'].find(e=>e.stateId===TITLE).when;
 const ctx=flags=>({completedEventIds:[],presentActorIds:[],knownFactIds:[],chapterOrder:{},currentChapterOrder:99,affinity:{[LMZ]:0},flags});
 const options=Object.values(STOPS).map(([id,values])=>[[id,undefined],...values.map(v=>[id,v])]);
 let hit=0,miss=0,combos=0;
 const walk=(i,flags)=>{
  if(i===options.length){for(const [name,own] of Object.entries(OWN)){combos++;const w=JSON.parse(JSON.stringify(when));w.stateScoreAtLeast.plus=own;const got=q.lineConditionMet(w,ctx(flags)),want=scoreOf(flags,own)>=LINE;assert.equal(got,want,JSON.stringify({flags,name}));got?hit++:miss++;}return;}
  for(const [id,v] of options[i])walk(i+1,v===undefined?flags:{...flags,[id]:v});
 };
 walk(0,{});
 assert.equal(combos,4*4*2*3*3);assert.ok(hit>0&&miss>0);
 // affinity is not read at all
 assert.equal(q.lineConditionMet(when,{...ctx({}),affinity:{[LMZ]:1e6}}),false);
 // unlisted values, other types and prototype keys count 0
 for(const v of ['constructor','toString','none','',0,null,false])assert.equal(q.lineConditionMet({stateScoreAtLeast:{terms:[{stateId:'x',scores:{a:5}}],value:1}},ctx({x:v})),false);
 assert.equal(q.lineConditionMet({stateScoreAtLeast:{terms:[{stateId:'x',scores:{a:5}}],value:5}},ctx({x:'a'})),true);
 assert.equal(q.lineConditionMet({stateScoreAtLeast:{terms:[{stateId:'x',scores:{a:5}}],plus:-1,value:5}},ctx({x:'a'})),false);
});
test('L6 reaches the narrator through the live capsule: 称呼.对主角 flips with the state, 主角对他 stays the protagonist-side ledger',async()=>{
 const {readLocalMemoryCapsule}=await loadTs('../src/modules/scenarioMods/legacyNarratorPacket.ts');
 const call=f=>readLocalMemoryCapsule(f.save,{eventId:f.b.eventId,actionId:'x',label:'x',actionText:'x',outcomeText:'x',playerLine:'x'}).presentActors.find(a=>a.characterId===LMZ).称呼;
 // play the real thing: a mainline-only player with huge affinity vs an active player with none, same L4 choice (run); then ask the narrator packet
 const mk=(flags,affinity)=>{const g=lmzFixture('beat.lmz.l4_reunion',{active:['s05b_06_breakout_and_reunion'],affinity:{[LMZ]:affinity}});Object.assign(g.r.flags,flags);return g;};
 const lowF=mk({},500),highF=mk(playStops({l1:'shielded',share:true,l3:'bandaged'}),0);
 assert.equal(call(lowF).对主角,OLD);assert.equal(call(highF).对主角,OLD);
 act(lowF,'act.lmz.l4.run');act(highF,'act.lmz.l4.run');
 assert.equal(call(lowF).对主角,OLD);assert.equal(call(highF).对主角,NEW);
 assert.equal(call(highF).主角对他,call(lowF).主角对他);
 // an old-bond save past the ghost king still gets the full ledger vocabulary
 const late=lmzFixture('beat.lmz.l4_reunion',{completed:['ghost_king_swallowed','s05b_yeao_palm_ningyu_stays']});late.r.flags[TITLE]=undefined;assert.equal(call(late).对主角,UNION);
});
test('L6 guard (frozen file 858/895 now read the ledger): withheld words follow chapter and state, nothing is hard-coded',()=>{
 const mk=(completed,flags={})=>{const f=lmzFixture('beat.lmz.l4_reunion',{completed});Object.assign(f.r.flags,flags);return f.r;};
 const pat=named.entityNamePattern('character',LMZ),said='乐明珠红着脸喊了一声：大笨瓜！',oldWord='乐明珠红着脸喊了一声：大笨蛋！';
 // before the switch (also before the ghost king): 大笨瓜 is withheld, the baseline pet names are not
 const before=mk(['s05b_06_breakout_and_reunion']);
 assert.deepEqual(naming.npcAddressWithheld(LMZ,before),[NEW]);
 assert.equal(naming.withheldAddressUsed(LMZ,before,said,pat),NEW);
 assert.equal(naming.withheldAddressUsed(LMZ,before,oldWord,pat),undefined);
 // far from her name, or in another sentence: not hers
 assert.equal(naming.withheldAddressUsed(LMZ,before,'乐明珠点了点头。'+'……'.repeat(30)+'小紫说：大笨瓜！',pat),undefined);
 assert.equal(naming.withheldAddressUsed(LMZ,before,'乐明珠没有说话。小紫笑道：大笨瓜！',pat),undefined);
 // after the switch: allowed, and the other pet names are not newly banned
 const after=mk(['s05b_06_breakout_and_reunion'],{[TITLE]:true});
 assert.deepEqual(naming.npcAddressWithheld(LMZ,after),[]);assert.equal(naming.withheldAddressUsed(LMZ,after,said,pat),undefined);assert.equal(naming.withheldAddressUsed(LMZ,after,oldWord,pat),undefined);
 // past the ghost king the vocabulary opens for everyone (what the old completed-event check did)
 const late=mk(['ghost_king_swallowed']);assert.deepEqual(naming.npcAddressWithheld(LMZ,late),[]);assert.equal(naming.withheldAddressUsed(LMZ,late,said,pat),undefined);
 // earlier in the book the same word stays withheld (baseline words are never withheld)
 const early=lmzFixture('beat.lmz.l4_reunion',{}).r;early.completedEventIds=[];early.activeEventIds=[];early.modId='lcq.stage_03b_snake_flower_bridge';
 assert.deepEqual(naming.npcAddressWithheld(LMZ,early),[NEW]);
 // an unknown character or a character with a single tier withholds nothing
 assert.deepEqual(naming.npcAddressWithheld('liuchao.character.nobody',before),[]);
 // the frozen file keeps no hard-coded pet name and wires both checks through the ledger helpers
 const src=fs.readFileSync(new URL('../src/utils/AIBidirectionalSystem.ts',import.meta.url),'utf8');
 assert.ok(!src.includes('大笨'));
 assert.match(src,/npcAddressWithheld\('liuchao\.character\.le_mingzhu', narrativeRuntime\)/);
 assert.match(src,/withheldAddressUsed\('liuchao\.character\.le_mingzhu', narrativeRuntime, text, /);
});
test('quest-line effects: `when` is validated, evaluated against the receipt-time context, and refused on onExpire',()=>{
 const texts={...read('mod-kit/quest-lines/resources.json').texts,...catalog.texts},matches={...read('mod-kit/quest-lines/resources.json').intentMatches,...catalog.questLineResources.intentMatches};
 const parse=lines=>q.parseQuestLines({version:1,lines},id=>texts[id],matches);
 const fresh=()=>JSON.parse(JSON.stringify(catalog.questLines));
 assert.doesNotThrow(()=>parse(fresh()));
 const bad=fresh();bad.find(l=>l.id==='line.char.le_mingzhu.bond').beats.find(b=>b.id==='beat.lmz.l4_reunion').byAction['act.lmz.l4.laugh'].at(-1).when={nope:1};
 assert.throws(()=>parse(bad),/unsupported condition|invalid condition/);
 const expire=fresh();const hb=expire.find(l=>l.id==='line.char.le_mingzhu.bond').beats.find(b=>b.id==='beat.lmz.l2_pan_secret'||b.onExpire)||expire.flatMap(l=>l.beats).find(b=>b.onExpire);
 hb.onExpire[0].when={affinityAtLeast:{actorId:LMZ,value:1}};assert.throws(()=>parse(expire),/unconditional setState/);
});

// ---------------------------------------------------------------- 状态
test('addiction is a generic status with a preset source; nothing in the content ever clears the preset',()=>{
 const defs=Object.fromEntries(catalog.statuses.map(s=>[s.id,s]));
 assert.equal(defs.addiction.tier,'general');assert.equal(defs['addiction.maigu'].label,'麻古成瘾');
 for(const s of Object.values(defs)){assert.ok(s.source&&s.effects.length&&s.remove.length);}
 const flags=defs['addiction.maigu'].remove.map(r=>r.flag);
 const written=JSON.stringify([catalog.questLines,catalog.contracts]);
 for(const flag of flags)assert.ok(!written.includes(flag),flag);
 assert.ok(!written.includes('"statusId":"addiction'));
});
