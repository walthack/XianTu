import test from 'node:test';
import assert from 'node:assert/strict';
import {makeContract,mod} from './sceneModuleFixture.mjs';
import {loadTs} from './loadTs.mjs';
const injuries=await loadTs('../src/modules/sceneModule/host/injuries.ts');
const writeback=await loadTs('../src/modules/sceneModule/host/writeback.ts');
const factors=await loadTs('../src/modules/sceneModule/host/factors.ts');
const info=await loadTs('../src/modules/sceneModule/host/information.ts');
const narrate=await loadTs('../src/modules/sceneModule/host/narrate.ts');
const registry=await loadTs('../src/modules/sceneModule/contracts/registry.ts');
const {createMinimalSaveDataV3}=await loadTs('../src/utils/dataRepair.ts');
function save(){const s=createMinimalSaveDataV3();s.世界.状态.剧本模组={modId:'lcq.stage_04',flags:{},canon:{characters:[],locations:[]},events:[],completedEventIds:[],activeEventIds:[]};return s;}
const rt=s=>s.世界.状态.剧本模组;
const row=(c,party,status='wound.external')=>{const def=mod.resolveStatusDef(status,c);return {party,ref:c.parties.find(p=>p.id===party).ref,status,label:def.label,minutes:def.afterScene.minutes,cause:def.cause,source:def.source};};
function guard(c,state){return mod.validateProposal(c,state,{goal:'guard',claim:{magnitude:1,scope:'single',targets:[]}},'我掩护同伴').plan;}
test('N4 catalog > contract > built-in; external catalog remains highest priority',()=>{
 const c=makeContract({statuses:[{...mod.STATUS_CATALOG[0],label:'wrong local'}]});
 assert.equal(mod.resolveStatusDef(mod.STATUS_CATALOG[0].id,c).label,mod.STATUS_CATALOG[0].label);
 assert.equal(mod.resolveStatusDef(mod.STATUS_CATALOG[0].id,c,{catalog:()=>({...mod.STATUS_CATALOG[0],label:'host'})}).label,'host');
 c.statuses=[{...mod.BUILTIN_STATUSES[0],label:'local temporary'}];assert.equal(mod.resolveStatusDef('wound.external',c).label,mod.catalogStatus('wound.external').label);
 assert.equal(mod.STATUS_CATALOG.length,new Set(mod.STATUS_CATALOG.map(s=>s.id)).size);
 for(const s of [...mod.STATUS_CATALOG,...mod.BUILTIN_STATUSES]) {assert.ok(s.source);assert.ok(s.effects.length);assert.ok(s.remove.length);}
 assert.ok(mod.catalogStatus('yin.sha_arm'),'W48 author id is now provided');
});
test('NPC injuries and groups have separate stable ids, remain JSON safe, and never create fake NPCs',()=>{
 const c=makeContract(),s=save();c.parties.find(p=>p.id==='foe_b').group={id:'test.group.guards',label:'无名护卫'};
 injuries.recordSceneInjuries(s,c,[row(c,'ally'),row(c,'foe_b')]);
 const store=rt(s).sceneLedger.statusRecords;
 assert.ok(store.actors['test.character.ally']);assert.ok(store.groups['test.group.guards']);assert.equal(store.actors['test.group.guards'],undefined);
 assert.equal(s.社交.关系['无名护卫'],undefined);assert.ok(rt(s).sceneLedger.groupInjuries['test.group.guards']);
 const loaded=JSON.parse(JSON.stringify(s)),next=mod.beginScene(c).state;injuries.restoreSceneInjuries(loaded,c,next);
 assert.equal(next.statuses.ally[0].id,'wound.external');assert.equal(mod.statusRollModifier(next,c,undefined,'ally','defense'),-1);
 assert.equal(next.statuses.foe_b[0].id,'wound.external');
});
test('repeated publication replaces old severity, keeps initial expiry, and leaves other sources intact',()=>{
 const c=makeContract(),s=save();injuries.recordSceneInjuries(s,c,[row(c,'ally')]);const first=rt(s).sceneLedger.statusRecords.actors['test.character.ally'][0].expiresAt;
 s.元数据.时间.分钟+=1;injuries.recordSceneInjuries(s,c,[row(c,'ally')]);assert.equal(rt(s).sceneLedger.statusRecords.actors['test.character.ally'][0].expiresAt,first);
 const second=structuredClone(c);second.meta.id='other.scene';injuries.recordSceneInjuries(s,second,[row(second,'ally','wound.internal')]);
 injuries.recordSceneInjuries(s,c,[row(c,'ally','wound.external.heavy')]);const rows=rt(s).sceneLedger.statusRecords.actors['test.character.ally'];assert.equal(rows.length,2);assert.ok(!rows.some(r=>r.statusId==='wound.external'));
});
test('expiry and authorized rest remove mechanics and derived prose; indefinite gear needs repair',()=>{
 const c=makeContract(),s=save();injuries.recordSceneInjuries(s,c,[row(c,'ally')]);s.元数据.时间.月+=1;
 const state=mod.beginScene(c).state;injuries.restoreSceneInjuries(s,c,state);assert.equal(state.statuses.ally.length,0);assert.equal(rt(s).sceneLedger.injuries['test.character.ally'],undefined);
 injuries.recordSceneInjuries(s,c,[row(c,'ally','wound.internal')]);assert.equal(injuries.removeSceneInjury(s,{actorId:'test.character.ally'},'wound.internal','rest'),true);
 injuries.recordSceneInjuries(s,c,[row(c,'ally','gear.blades_dulled')]);assert.equal(injuries.removeSceneInjury(s,{actorId:'test.character.ally'},'gear.blades_dulled','rest'),false);
 assert.equal(injuries.removeSceneInjury(s,{actorId:'test.character.ally'},'gear.blades_dulled','item','repair'),true);
});
test('legacy injury prose is preserved but not guessed into penalties or death',()=>{
 const c=makeContract(),s=save();rt(s).sceneLedger={injuries:{'test.character.ally':'历史重伤记录'},actors:{},names:{},receipts:[],worldFacts:[]};
 const state=mod.beginScene(c).state;injuries.restoreSceneInjuries(s,c,state);assert.equal(state.statuses.ally.length,0);
 injuries.recordSceneInjuries(s,c,[row(c,'ally')]);assert.match(rt(s).sceneLedger.injuries['test.character.ally'],/历史重伤记录/);
});
test('player structured statuses are not counted again in the host base factors',()=>{
 const c=makeContract(),s=save(),before=factors.baseFactors(s,c,'combat');
 injuries.recordSceneInjuries(s,c,[row(c,'pc')]);s.角色.效果.push({状态名称:'外伤',类型:'debuff',来源:c.meta.id,强度:1,状态描述:'判定-1',持续时间分钟:10080,生成时间:{...s.元数据.时间}});
 assert.deepEqual(factors.baseFactors(s,c,'combat'),before);
 const state=mod.beginScene(c).state;injuries.restoreSceneInjuries(s,c,state);assert.equal(mod.statusRollModifier(state,c,undefined,'pc','action'),-1);
});
test('condition-driven arrival can fire before a specific enemy action, cancel it, and survive reload once',()=>{
 const c=makeContract();c.clock={fixedEvents:[{id:'rescue',trigger:'beforeEnemyAction',enemyActionId:'strike_a',when:{kind:'partyPresent',party:'foe_a'},effects:[{depart:'foe_a'}],text:'援手截住攻击'}]};
 const opened=mod.beginScene(c,{forced:{action:[10],defense:[20]}});assert.equal(opened.state.firedEvents.length,0);
 const before=JSON.stringify(opened.state);mod.previewAction(c,opened.state,guard(c,opened.state),{factors:0});assert.equal(JSON.stringify(opened.state),before);
 const next=mod.confirmAction(c,opened.state,guard(c,opened.state),{factors:0,playerDefense:100});
 assert.ok(!next.result.enemy.some(r=>r.actionId==='strike_a'));assert.equal(next.result.events.filter(e=>e.id==='rescue').length,1);
 const loaded=JSON.parse(JSON.stringify(next.state));assert.equal(mod.fireConditionalEvents(c,loaded,undefined,'beforeEnemyAction','strike_a').length,0);
});
test('after-hit conditions run before the next enemy action and do not consume dice themselves',()=>{
 const c=makeContract();c.clock={fixedEvents:[{id:'reinforce',trigger:'afterEnemyAction',enemyActionId:'strike_a',when:{kind:'statusPresent',party:'pc',status:'wound.external'},effects:[{depart:'foe_b'}]}]};
 const state=mod.beginScene(c,{forced:{action:[10],defense:[1]}}).state;
 const next=mod.confirmAction(c,state,guard(c,state),{factors:0,playerDefense:-100});
 assert.equal(next.result.enemy.length,1);assert.equal(next.state.cursors.defense,1);assert.ok(next.state.firedEvents.includes('reinforce'));
});
test('chained conditional events reach a bounded fixed point without refiring',()=>{
 const c=makeContract();c.clock={fixedEvents:[{id:'second',when:{kind:'partyDeparted',party:'foe_a'},effects:[{depart:'foe_b'}]},{id:'first',when:{kind:'partyPresent',party:'foe_a'},effects:[{depart:'foe_a'}]}]};
 const state=mod.beginScene(c).state;assert.deepEqual(state.firedEvents,['first','second']);assert.equal(state.cursors.action,0);
});
test('invalid condition timing and duplicate event ids fail contract lint',()=>{
 const c=makeContract();c.clock={fixedEvents:[{id:'a',when:{kind:'partyPresent',party:'ally'},atBeat:1},{id:'a',trigger:'beforeEnemyAction',enemyActionId:'missing'}]};
 assert.ok(mod.lintContract(c).errors.length>=3);
});
test('continuity applies on loss but does not grant winning states or rewards',()=>{
 const c=makeContract();c.continuity={effects:[{depart:'boss'}],fixedCosts:[{id:'cost',target:'ally',statuses:[{status:'wound.internal'}]}],checks:[{id:'safe',ref:'test.foe.boss',requirement:'离场',check:{kind:'partyDeparted',party:'boss'}}]};
 const state=mod.beginScene(c).state;state.status='decided';state.outcome={kind:'lose',reason:'fixture'};
 const closed=mod.closeScene(c,state,{factors:0});assert.ok(closed.state.departed.includes('boss'));assert.equal(closed.state.tracks.foe_a.vit,0);assert.equal(closed.writeBack.rewards.length,0);assert.ok(closed.writeBack.persistent.some(r=>r.party==='ally' && r.status==='wound.internal'));assert.equal(closed.writeBack.violations.afterState.length,0);
 c.continuity.checks[0].check={kind:'partyPresent',party:'boss'};assert.deepEqual(mod.closeScene(c,state,{factors:0}).writeBack.violations.afterState,['safe']);
});
test('reward whitelist rejects invented objects before a scene starts',()=>{
 const c=makeContract();c.rewardPolicy={itemIds:[]};c.closing.win.rewards=[{itemId:'test.item.invented',quantity:1}];assert.match(mod.lintContract(c).errors.join('\n'),/未经授权/);
});
test('interrogation chapter and custody gates are code-owned, future text is absent from prompts',async()=>{
 const c=makeContract();c.interrogation={maxChapter:45,goalIds:['guard'],requires:{kind:'partyDeparted',party:'foe_a'},facts:[{id:'now',fromChapter:45,text:'只知道本场来人的出处'},{id:'future',fromChapter:103,text:'未来秘密测试',forbiddenBefore:'未来秘密测试'}]};
 const state=mod.beginScene(c).state;assert.deepEqual(mod.interrogationFacts(c,state,45),[]);state.departed.push('foe_a');
 assert.deepEqual(mod.interrogationFacts(c,state,999),['只知道本场来人的出处']);assert.deepEqual(mod.interrogationFacts(c,state,0),[]);
 const runtime={modId:'lcq.stage_04',events:[{id:'x',axisAnchor:'第45章'}],activeEventIds:['x']};
 const result=mod.confirmAction(c,state,guard(c,state),{factors:100,playerDefense:100}).result;
 const prompt=narrate.buildNarrationPrompt(c,state,result,'我盘问活口',runtime);assert.doesNotMatch(JSON.stringify(prompt),/未来秘密测试/);
 let calls=0;const answer=await narrate.narrateBeat(c,state,result,'我盘问活口',runtime,async()=>{calls++;return '未来秘密测试';});assert.equal(calls,0);assert.doesNotMatch(answer.text,/未来秘密测试/);
 assert.equal(mod.interrogationProblems(c,45,'未来秘密测试').length,1);
 assert.equal(info.wantsInterrogation(c,'我不审问'),false);
});
test('F03/F10 register shared continuity and reward rules without changing crystal independence',()=>{
 const f03=registry.sceneContractById('combat.f03.mist_war'),f10=registry.sceneContractById('combat.f10.ghost_king_duel');
 // Locate by registry list instead of relying on presentation labels.
 const a=registry.SCENE_CONTRACTS.find(c=>c.meta.id.includes('f03') && c.meta.hook.eventId==='lcq.event.s04_02');
 const b=registry.SCENE_CONTRACTS.find(c=>c.meta.id.includes('f10'));
 assert.ok(a.continuity.fixedCosts.some(c=>c.id==='ning_yu_internal'));assert.ok(a.interrogation);assert.ok(b.rewardPolicy.itemIds.includes('lcq.item.nh_niche_crystal'));
 assert.ok(!b.continuity?.flags || !Object.keys(b.continuity.flags).some(k=>/loot/.test(k)));
});

test('cross-scene inherited injuries keep their source/expiry; a new upgrade replaces stale records and effects',()=>{
 const a=makeContract(),b=makeContract(),s=save();b.meta.id='test.scene.second';
 let state=mod.beginScene(a).state;mod.applyStatus(state,a,undefined,'pc',{status:'wound.external'},{cause:'combat',sourceId:'hit'});
 mod.applyStatus(state,a,undefined,'ally',{status:'wound.external'},{cause:'combat',sourceId:'hit'});
 writeback.syncSceneStatuses(s,a,state);const expiry=rt(s).sceneLedger.statusRecords.actors['test.character.ally'][0].expiresAt;
 s.元数据.时间.分钟+=1;state=mod.beginScene(b).state;injuries.restoreSceneInjuries(s,b,state);writeback.syncSceneStatuses(s,b,state);
 let rows=rt(s).sceneLedger.statusRecords.actors['test.character.ally'];assert.equal(rows.length,1);assert.equal(rows[0].sourceScene,a.meta.id);assert.equal(rows[0].expiresAt,expiry);
 mod.applyStatus(state,b,undefined,'pc',{status:'wound.external'},{cause:'combat',sourceId:'hit'});mod.applyStatus(state,b,undefined,'ally',{status:'wound.external'},{cause:'combat',sourceId:'hit'});
 writeback.syncSceneStatuses(s,b,state);rows=rt(s).sceneLedger.statusRecords.actors['test.character.ally'];assert.equal(rows.length,1);assert.equal(rows[0].statusId,'wound.external.heavy');
 assert.ok(!s.角色.效果.some(e=>e.来源===a.meta.id));assert.equal(s.角色.效果.filter(e=>e.来源===b.meta.id).length,1);
});
test('N1/N2/N3 default values remain approved and fumble fallback warns with a next-beat disadvantage',()=>{
 const settings=mod.resolveSettings();assert.equal(settings.tiers.failure.spendOneShot,true);assert.equal(settings.tiers.failure.edge,2);
 const c=makeContract();delete c.fumble;c.enemyActions=[];
 const state=mod.beginScene(c,{forced:{action:[1]}}).state;
 const next=mod.confirmAction(c,state,guard(c,state),{factors:-100,playerDefense:100});
 assert.equal(next.result.fumble.entry,'module.default_fumble');assert.equal(next.state.statuses.pc[0].id,'off_balance');assert.equal(mod.statusMode(next.state,c,undefined,'pc','action').disadvantage,true);
 assert.match(mod.renderResultLines(c,next.result).join('\n'),/失衡|架势散乱/);assert.ok(!next.state.tags.some(t=>t.id==='edge'),'enemy +2 is confined to the settled beat');
});

test('dynamic unauthorized reward writeback is rejected before mutating the save',()=>{
 const c=makeContract();c.rewardPolicy={itemIds:[]};const state=mod.beginScene(c).state;state.status='decided';state.outcome={kind:'win',reason:'fixture'};
 const wb=mod.closeScene(c,state,{factors:0}).writeBack;wb.rewards.push({itemId:'test.item.invented',quantity:1});const s=save(),before=JSON.stringify(s);
 assert.throws(()=>writeback.applyWriteBack(s,c,state,wb),/未获合同授权/);assert.equal(JSON.stringify(s),before);
});
test('N1 failure spends one-shot levers while noExposure great success keeps them',()=>{
 for(const [face,factor,spent] of [[5,-100,1],[20,100,0]]) {
  const c=makeContract();c.enemyActions=[];const state=mod.beginScene(c,{forced:{action:[face]}}).state;
  const plan=mod.validateProposal(c,state,{goal:'attack',claim:{magnitude:1,scope:'single',targets:['foe_a']},levers:[{element:'bomb',verb:'throw',evidence:'火药罐'}]},'我投出火药罐').plan;
  const next=mod.confirmAction(c,state,plan,{factors:factor,playerDefense:100});assert.equal(next.state.leverUses.bomb || 0,spent);
 }
});

test('group display and recognition use the group label, not a character lookup or internal id',async()=>{
 const refs=await loadTs('../src/modules/sceneModule/host/refs.ts'),recognize=await loadTs('../src/modules/sceneModule/host/recognize.ts');
 const c=makeContract(),party=c.parties.find(p=>p.id==='foe_b');party.group={id:'lcq.group.test_guards',label:'护卫队'};party.ref=party.group.id;
 const state=mod.beginScene(c).state;
 assert.equal(mod.partyDisplay(c,'foe_b'),'护卫队');assert.equal(refs.partyName(c,{},'foe_b'),'护卫队');
 const prompt=recognize.buildRecognitionPrompt(c,state,'我掩护护卫队',{});assert.match(prompt.user,/护卫队/);assert.doesNotMatch(prompt.user,/lcq\.group\.test_guards/);
});

test('conditional interception ends the departed attacker group attack before later targets',()=>{
 const c=makeContract();c.enemyActions=[{...c.enemyActions[0],target:{each:'player_side'}}];
 c.clock={fixedEvents:[{id:'intercept',trigger:'afterEnemyAction',enemyActionId:'strike_a',when:{kind:'statusPresent',party:'pc',status:'wound.external'},effects:[{depart:'foe_a'}]}]};
 const state=mod.beginScene(c,{forced:{action:[10],defense:[1]}}).state;
 const next=mod.confirmAction(c,state,guard(c,state),{factors:0,playerDefense:-100});assert.equal(next.result.enemy.length,1);assert.equal(next.state.statuses.ally.length,0);
});

test('information questions use the interrogation gate while ordinary greeting/chat is unaffected',()=>{
 const c=makeContract();c.interrogation={maxChapter:45,goalIds:['guard'],facts:[]};
 for(const text of ['你们是谁派来的？','交代你们的来历','我盘问幕后主使'])assert.equal(info.wantsInterrogation(c,text),true);
 for(const text of ['同伴，你还好吗？','今天的雾很重','我不审问他','如果我逼问呢'])assert.equal(info.wantsInterrogation(c,text),false);
});

test('W48 F13 win references shared light yin.sha_arm; loss has no arm cost and no heart loot',()=>{
 const c=registry.sceneContractById('combat.f13.ghost_king_final');
 assert.deepEqual(mod.lintContract(c).errors,[]);
 const def=mod.catalogStatus('yin.sha_arm');assert.equal(def.afterScene.minutes,null);
 assert.ok(!def.effects.some(e=>e.kind==='downed'||e.kind==='lockLever'));
 assert.ok(!def.remove.some(r=>r.kind==='time'||r.kind==='rest'));
 assert.match(def.effects.map(e=>e.text||'').join(''),/化虎.*不算治愈/);
 const s=mod.beginScene(c).state;s.status='decided';s.outcome={kind:'win',reason:'fixture'};
 const closed=mod.closeScene(c,s,{factors:0});
 const arm=closed.writeBack.persistent.find(r=>r.status==='yin.sha_arm');
 assert.ok(arm);assert.equal(arm.ref,'liuchao.character.wu_er_lang');
 assert.equal(closed.state.statuses.wu_er_lang.find(r=>r.id==='yin.sha_arm').severity,1);
 assert.equal(mod.isDowned(closed.state,c,undefined,'wu_er_lang'),false);
 const data=save();writeback.applyWriteBack(data,c,closed.state,closed.writeBack);
 const records=rt(data).sceneLedger.statusRecords.actors['liuchao.character.wu_er_lang'];
 assert.ok(records.some(r=>r.statusId==='yin.sha_arm'));
 const loaded=JSON.parse(JSON.stringify(data)),next=mod.beginScene(c).state;
 injuries.restoreSceneInjuries(loaded,c,next);assert.ok(next.statuses.wu_er_lang.some(r=>r.id==='yin.sha_arm'));
 for(const outcome of ['lose','playerChoice']) {
  const lost=mod.beginScene(c).state;lost.status='decided';lost.outcome={kind:'lose',reason:'fixture',...(outcome==='playerChoice'?{choiceId:'abandon_well'}:{})};
  const wb=mod.closeScene(c,lost,{factors:0}).writeBack;
  assert.equal(wb.persistent.some(r=>r.status==='yin.sha_arm'),false);
  assert.deepEqual(wb.rewards,[]);
 }
 assert.deepEqual(c.rewardPolicy.itemIds,[]);
 assert.ok(c.narration.requiredFacts.some(f=>f.includes('W-49')));
 assert.ok(c.narration.requiredFacts.some(f=>f.includes('W-50')));
});
