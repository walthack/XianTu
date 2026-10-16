// 真实路径验收：不摆存档、不把玩家放在“该在的地点”，而是让引擎只按主线逐拍推进，
// 看每个停靠点在玩家实际所在的地方到底有没有选项。（旧夹具把人直接放在事件正典地点，O2/Y3 的地点错位因此一直没暴露。）
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {loadTs} from './loadTs.mjs';
import {walkMainline} from './baihuMainlineWalk.mjs';
import {projectQuestLineEvents} from '../scripts/content-pack-quest-lines.mjs';
const rt=await loadTs('../src/modules/scenarioMods/runtime.ts'),q=await loadTs('../src/modules/scenarioMods/questLines.ts'),nir=await loadTs('../src/modules/scenarioMods/naturalIntentRouter.ts'),
 route=await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
const catalog=JSON.parse(fs.readFileSync(new URL('../src/modules/contentPacks/generated/catalog.json',import.meta.url),'utf8'));
const beats=catalog.questLines.flatMap(l=>l.beats);
const EXTRA='lcq.event.s04_03_ins_le_mingzhu_pan_secret'; // 已有的 L2 保密拍（在 lines.json，不在内容包）

// 一次推进，记下每个可选拍第一次出现时的位置、主线焦点和选项，并留一份存档副本供分叉。
const offered=new Map(),visited=[];let receiptsAtEnd;
const walk=await walkMainline((save,event,n)=>{
 {const at=save.角色.位置.locationId;if(visited.at(-1)!==at)visited.push(at);}
 const acts=rt.getCurrentStoryExplorationActions(save).filter(a=>/_ins_/.test(a.eventId));
 for(const eventId of new Set(acts.map(a=>a.eventId)))if(!offered.has(eventId))offered.set(eventId,{n,focus:event?.id,at:save.角色.位置.locationId,actions:acts.filter(a=>a.eventId===eventId).map(a=>a.actionId),save:structuredClone(save)});
});
receiptsAtEnd=walk.save.世界.状态.剧本模组.questLineState?.receipts||{};
const fork=eventId=>{const o=offered.get(eventId);assert.ok(o,`${eventId} never offered`);return structuredClone(o.save);};
const flags=save=>save.世界.状态.剧本模组.flags;
const wuyuanSlice=await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');

test('the walk is the real mainline: it crosses every stage and ends at the playtest boundary',()=>{
 assert.equal(walk.end?.kind,'transition');
 assert.match(walk.end.reason,/本期南荒试玩已结束/);
});

test('every pack beat shows options (>0) when the player only follows the mainline, at the place the player actually is',()=>{
 for(const b of beats){
  const o=offered.get(b.eventId);
  assert.ok(o,`${b.id} (${b.eventId}) never offered on the mainline walk`);
  assert.ok(o.actions.length>0,b.id);
  for(const a of b.steps.filter(s=>!s.variantOf&&!s.visibleWhen))assert.ok(o.actions.includes(a.actionId)||o.actions.some(x=>x.startsWith(a.actionId)),`${b.id} missing ${a.actionId}`);
 }
 assert.ok(offered.get(EXTRA));
});

test('O2 and Y3 are offered where the mainline event is played (the travel node), not at the stage anchor location',()=>{
 const o2=offered.get('lcq.event.ningyu_regicide_offer_ins_ningyu_reply'),y3=offered.get('lcq.event.rainforest_black_shoal_ins_ningyu_fire');
 assert.equal(o2.at,'nh.caravan_camp');assert.equal(y3.at,'nh.black_shoal');
 const by=id=>beats.find(b=>b.eventId===id);
 assert.equal(by('lcq.event.ningyu_regicide_offer_ins_ningyu_reply').sceneLocationId,'nh.caravan_camp');
 assert.equal(by('lcq.event.rainforest_black_shoal_ins_ningyu_fire').sceneLocationId,'nh.black_shoal');
 // 阶段锚点地点仍是正典地点（阶段校验要求事件地点在本关正典里）。
 assert.equal(by('lcq.event.ningyu_regicide_offer_ins_ningyu_reply').locationId,'liuchao.location.wuyuan');
});

test('every location the beat requires is the place the beat plays at (same class of mistake cannot come back)',()=>{
 const at=c=>!c?[]:c.atLocation?[c.atLocation]:[...(c.all||[]),...(c.any||[])].flatMap(at);
 for(const b of beats)for(const l of at(b.requires))assert.equal(l,b.sceneLocationId||b.locationId,b.id);
});

test('a location condition that does not match the declared place fails the build',()=>{
 const stage={scenario:{events:[]},canon:{characters:[{id:'c'}],locations:[{id:'liuchao.location.wuyuan',name:'五原'}]}};
 const text=Object.fromEntries(['n','o','b','l','i','x'].map(k=>[k,k+k]));
 const beat=requires=>({id:'ln',nameId:'n',beats:[{id:'b1',eventId:'e1',stageId:'s',locationId:'liuchao.location.wuyuan',sceneLocationId:'nh.caravan_camp',presentActorIds:['c'],canonChapter:1,briefId:'b',objectiveId:'o',requires,steps:[{actionId:'a',kind:'attempt',labelId:'l',intentId:'i',outcomeId:'x',replyMode:'fixed'}]}]});
 const run=(requires,names={'nh.caravan_camp':'商队宿处'})=>projectQuestLineEvents({lines:[beat(requires)],stages:new Map([['s',stage]]),texts:text,intentMatches:{},guardCovers:()=>false,routeLocationNames:names});
 assert.throws(()=>run({all:[{atLocation:'liuchao.location.wuyuan'}]}),/requires atLocation liuchao\.location\.wuyuan but the beat plays at nh\.caravan_camp/);
 const ok=run({all:[{atLocation:'nh.caravan_camp'}]}).get('s')[0];
 assert.equal(ok.locationId,'liuchao.location.wuyuan');assert.equal(ok.playerCompletionContract.actions[0].sceneLocation,'商队宿处');
 assert.throws(()=>run({all:[{atLocation:'nh.caravan_camp'}]},{}),/has no name/);
});

test('"at a place" includes the settlement a zone belongs to; a route node is only itself',()=>{
 const ctx=(locationId,locationIds)=>({completedEventIds:[],presentActorIds:[],knownFactIds:[],chapterOrder:{},currentChapterOrder:1,affinity:{},flags:{},locationId,locationIds});
 assert.equal(q.lineConditionMet({atLocation:'liuchao.location.wuyuan'},ctx('lcq.zone.wuyuan.pastry_shop',['lcq.zone.wuyuan.pastry_shop','liuchao.location.wuyuan'])),true);
 assert.equal(q.lineConditionMet({atLocation:'liuchao.location.wuyuan'},ctx('nh.caravan_camp',['nh.caravan_camp'])),false);
 assert.equal(q.lineConditionMet({atLocation:'nh.caravan_camp'},ctx('nh.caravan_camp')),true);
});

test('O1 is offered while the player stands in a Wuyuan zone (the fee event is played in the pastry shop)',()=>{
 const o1=offered.get('lcq.event.charge_sudaji_fee_ins_baihu_price');
 assert.match(o1.at,/wuyuan/); // 真机路径（含 ensureWuyuanOpenWorldSlice）里玩家的 locationId 是五原本身，区内点心铺属于它assert.equal(o1.actions.length,3);
});

test('after the host event is done the departure waits for the optional beat, then the route continues (O2, Y3)',()=>{
 for(const [id,host,before,after,reply] of [
  ['lcq.event.ningyu_regicide_offer_ins_ningyu_reply','lcq.event.ningyu_regicide_offer','nh.caravan_camp','nh.zixi','act.ningyu.o2.refuse'],
  ['lcq.event.rainforest_black_shoal_ins_ningyu_fire','lcq.event.rainforest_black_shoal','nh.black_shoal','lcq.location.sheyi_village','act.ningyu.y3.nothing']]){
  const save=fork(id),r=save.世界.状态.剧本模组;
  assert.ok(r.completedEventIds.includes(host),'window opens after the host event is done');
  assert.equal(save.角色.位置.locationId,before);
  const a=rt.getCurrentStoryExplorationActions(save).find(a=>a.actionId===reply);assert.ok(a,reply);
  r.worldTurn++;const res=rt.recordStoryEventStructuredAction(save,a);
  assert.equal(res.completed,true);
  assert.equal(save.角色.位置.locationId,before,'answering must not move the player back to the stage anchor');
  assert.match(save.角色.位置.描述,/南荒途中/);
  const next=rt.advanceScenarioRuntime(save).saveData;
  assert.equal(next.角色.位置.locationId,after,'the held route leaves once the beat is answered');
 }
});

test('unanswered, the held departure still leaves when the window closes (the beat is never required)',()=>{
 const i=visited.indexOf('nh.caravan_camp');
 assert.ok(i>=0);
 assert.deepEqual(visited.slice(i,i+4).filter(x=>x.startsWith('nh.')||x.includes('sheyi')),['nh.caravan_camp','nh.zixi','nh.black_shoal','lcq.location.sheyi_village']);
 assert.equal(offered.get('lcq.event.ningyu_regicide_offer_ins_ningyu_reply').focus,'lcq.event.zixi_taiyi_intercept');
});

test('following the mainline alone never settles an optional beat or writes a stance',()=>{
 assert.deepEqual(receiptsAtEnd,{});
});

test('following the mainline alone never earns the title upgrade: no active score, so L6 stays on the old address even with maxed affinity',()=>{
 // the whole walk: no lmz choice state was ever written (an unanswered L2 window may only fall back to `none`), and the upgrade state is absent
 const fl=flags(walk.save);
 assert.equal(fl['branch.lmz.title_upgraded'],undefined);
 for(const [k,v] of Object.entries(fl))if(k.startsWith('branch.lmz.'))assert.equal(v,'none',k);
 // at the real L4 reunion the engine reached: even max affinity and every L4 choice leave the address unchanged
 for(const action of ['act.lmz.l4.laugh','act.lmz.l4.scold','act.lmz.l4.run']){
  const save=fork('lcq.event.s05b_06_breakout_and_reunion_ins_lmz_reunion');
  const rel=save.社交.关系['liuchao.character.le_mingzhu']||={角色ID:'liuchao.character.le_mingzhu',名字:'乐明珠',好感度:0};rel.好感度=100;
  const a=rt.getCurrentStoryExplorationActions(save).find(x=>x.actionId===action);assert.ok(a,action);
  save.世界.状态.剧本模组.worldTurn++;assert.equal(rt.recordStoryEventStructuredAction(save,a).completed,true);
  assert.equal(flags(save)['branch.lmz.reunion']!==undefined,true);assert.equal(flags(save)['branch.lmz.title_upgraded'],undefined,action);
 }
});

test('route beats read as part of the road: the optional chips share the route description of their host event',()=>{
 assert.equal(route.storyRouteLocation('lcq.event.ningyu_regicide_offer_ins_ningyu_reply'),'南荒途中·商队宿处');
 assert.equal(route.storyRouteLocation('lcq.event.rainforest_black_shoal_ins_ningyu_fire'),'南荒途中·雨林黑石滩');
 assert.equal(route.storyRouteLocation('lcq.event.charge_sudaji_fee_ins_baihu_price'),undefined);
});

test('windows that depend on a finished host event stay open long enough to be seen (Y3, Y5, L3, L5)',()=>{
 assert.equal(offered.get('lcq.event.rainforest_black_shoal_ins_ningyu_fire').focus,'lcq.event.silent_sheyi_village');
 assert.equal(offered.get('lcq.event.guiwangdong_coop_pact_ins_ningyu_enter').focus,'lcq.event.enter_dong_with_migu');
 assert.equal(offered.get('lcq.event.pull_harpoon_lemingzhu_ins_lmz_harpoon').focus,'lcq.event.pull_harpoon_lemingzhu');
 assert.equal(offered.get('lcq.event.s05b_10_slave_revolt_and_phoenix_change_ins_lmz_redlight').focus,'lcq.event.ghost_king_swallowed');
});

// ---------------------------------------------------------------- 自由文本
test('free text settles a non-character optional stop from the pack intentMatch, without the intent model (O1)',async()=>{
 const save=fork('lcq.event.charge_sudaji_fee_ins_baihu_price');
 let modelCalls=0;
 const run=text=>nir.resolveNaturalIntent({saveData:save,playerText:text,selected:null,resolveFromText:rt.resolveStoryEventActionFromPlayerText,generate:async()=>{modelCalls++;throw new Error('model must not be needed');}});
 const hit=await run('先问清楚，她要我做什么');
 assert.equal(hit.kind,'alias');assert.equal(hit.selection.actionId,'act.baihu.o1.probing');assert.equal(hit.usedModel,false);
 assert.equal((await run('要我做什么')).selection.actionId,'act.baihu.o1.probing');
 assert.equal((await run('我低头应下')).selection.actionId,'act.baihu.o1.deferential');
 // 结算与点按钮同一条路径。
 const r=save.世界.状态.剧本模组;r.worldTurn++;
 const res=rt.recordStoryEventStructuredAction(save,hit.selection);
 assert.equal(res.completed,true);assert.equal(flags(save)['branch.baihu.first_bargain'],'probing');assert.ok(r.pathReceipts['rcpt.baihu.o1.probing']);
 assert.equal(modelCalls,0);
});

test('free text does not settle on questions, hypotheticals, reported speech, or a line that names two options',async()=>{
 const save=fork('lcq.event.charge_sudaji_fee_ins_baihu_price');
 for(const text of ['要不要先问清楚？','如果先问清楚会怎样','她说先问清楚','先问清楚吗','先问清楚，再低头应下','价钱随她，先问清楚']){
  assert.equal(nir.resolveOptionalLineAlias(save,text),undefined,text);
 }
 assert.equal(nir.resolveOptionalLineAlias(save,'今天天气不错'),undefined);
});

test('free text never settles a character-line stop without the host model\'s affinity assessment (L2)',async()=>{
 const save=fork(EXTRA);
 const text='这事我保密，见到潘师姐也绝口不提';
 assert.equal(nir.resolveOptionalLineAlias(save,text),undefined);
 const cands=nir.listNaturalIntentCandidates(save);
 const pick=cands.find(c=>c.actionId==='act.lmz.promise_silence');assert.ok(pick?.intentMatch?.matchAny?.includes('绝口不提'));assert.ok(pick.affinityAssessment);
 const model=(delta)=>async()=>JSON.stringify({actionId:pick.actionId,source:pick.source,eventId:pick.eventId,contractHash:pick.contractHash,evidence:'保密',certainty:'high',...(delta===undefined?{}:{affinityDelta:delta}),statusProposals:[]});
 const run=generate=>nir.resolveNaturalIntent({saveData:save,playerText:text,selected:null,resolveFromText:rt.resolveStoryEventActionFromPlayerText,generate});
 // 模型没给好感评估：不结算，照常演出。
 const noDelta=await run(model(undefined));
 assert.equal(noDelta.kind,'free');assert.equal(noDelta.reason,'missing_affinity_assessment');
 const matched=await run(model(2));
 assert.equal(matched.kind,'matched');assert.equal(matched.selection.actionId,'act.lmz.promise_silence');assert.equal(matched.selection.lineAffinityDelta,2);
 // 界面随后用最新存档再核一次：选项必须仍能被唯一认出。
 assert.ok(nir.verifyFreshSelection(save,{actionId:matched.selection.actionId,source:matched.selection.source,eventId:matched.selection.eventId,contractHash:matched.selection.contractHash}));
 const r=save.世界.状态.剧本模组;r.worldTurn++;
 assert.equal(rt.recordStoryEventStructuredAction(save,matched.selection).completed,true);
 assert.equal(flags(save)['branch.lmz.pan_secret'],'promised');
});

test('real pipeline: the post-advance wuyuan hook must not pull a held player to the next mainline node (r2 O2/Y3 regression)',()=>{
 for(const [id,at] of [['lcq.event.ningyu_regicide_offer_ins_ningyu_reply','nh.caravan_camp'],['lcq.event.rainforest_black_shoal_ins_ningyu_fire','nh.black_shoal']]){
  const save=fork(id);
  assert.equal(save.角色.位置.locationId,at);
  wuyuanSlice.ensureWuyuanOpenWorldSlice(save);
  assert.equal(save.角色.位置.locationId,at,id);
  assert.ok(rt.getCurrentStoryExplorationActions(save).some(a=>a.eventId===id),id);
 }
});

// 打包产物：默认看 dev/combat-trial/dist（若它在 catalog 生成之后构建）；也可用 XIANTU_BUNDLE_PATH 指向另一个输出目录里的 combat-trial.js
// （例：webpack-cli --config webpack.combat-trial.config.js --output-path /tmp/x，不覆盖 dist）。内嵌的目录必须与磁盘上的 catalog.json 一致，真机跑的是它。
const BUNDLE=process.env.XIANTU_BUNDLE_PATH?new URL('file://'+process.env.XIANTU_BUNDLE_PATH):new URL('../dev/combat-trial/dist/combat-trial.js',import.meta.url);
test('the built bundle (if built after the catalog) embeds the same quest-line catalog, projected events, scene contracts and the held-route guard',{skip:!fs.existsSync(BUNDLE)},(t)=>{
 const cat=new URL('../src/modules/contentPacks/generated/catalog.json',import.meta.url);
 if(fs.statSync(BUNDLE).mtimeMs<fs.statSync(cat).mtimeMs)return t.skip('bundle is older than the generated catalog (rebuild needed to check)');
 const text=fs.readFileSync(BUNDLE,'utf8'),m=text.match(/catalog_namespaceObject = \/\*#__PURE__\*\/JSON\.parse\('((?:[^'\\]|\\.)*)'\);/);
 assert.ok(m,'catalog not found in bundle');
 const embedded=JSON.parse(JSON.parse(`"${m[1].replace(/"/g,'\\"').replace(/\\'/g,"'")}"`));
 assert.deepEqual(embedded.questLines,catalog.questLines);
 assert.deepEqual(embedded.contracts,catalog.contracts);
 for(const b of beats)assert.ok(text.includes(`"questLineBeatId":"${b.id}"`),`${b.id} projected event missing in bundle`);
 // the code that decides where the player stands is the code under test, not an older copy
 assert.ok(/const held = \(ledger\?\.deferredDepartureEventIds \|\| \[\]\)/.test(text),'held-route guard missing from bundle');
});

test('the L6 active score is exported in the save (questLineState.activeScores): per-term detail, own plus at L4, threshold and verdict',()=>{
 const TITLE='branch.lmz.title_upgraded',settle=(eventId,actionId,setup)=>{
  const save=fork(eventId);setup?.(save);
  const a=rt.getCurrentStoryExplorationActions(save).find(x=>x.actionId===actionId||x.actionId.startsWith(actionId+'.v_'));assert.ok(a,actionId); // echo 变体（.v_<值>）与基础动作同一步
  save.世界.状态.剧本模组.worldTurn++;assert.equal(rt.recordStoryEventStructuredAction(save,a).completed,true);
  return save.世界.状态.剧本模组;
 };
 // after L1 only: the running score shows the L1 term, no own plus yet, not passed
 const l1=settle('lcq.event.s04b_lingfei_baiyi_crisis_02_ins_lmz_crow','act.lmz.l1.shield').questLineState.activeScores[TITLE];
 assert.deepEqual(l1.terms.find(t=>t.stateId==='branch.lmz.first_rescue'),{stateId:'branch.lmz.first_rescue',value:'shielded',score:3});
 assert.equal(l1.plus,0);assert.equal(l1.total,3);assert.equal(l1.passed,false);
 // at L4 with L1/L2/L3 already chosen: total = terms + the laugh plus; needed comes from config, verdict agrees with the written state
 const num=JSON.parse(fs.readFileSync(new URL('../mod-kit/game-numbers.qingyu.json',import.meta.url),'utf8')).lineBonds.lemingzhu;
 const r4=settle('lcq.event.s05b_06_breakout_and_reunion_ins_lmz_reunion','act.lmz.l4.laugh',save=>Object.assign(flags(save),{'branch.lmz.first_rescue':'shielded','branch.lmz.pan_secret':'promised','branch.lmz.shared_mushroom':true,'branch.lmz.harpoon':'pulled'}));
 const s4=r4.questLineState.activeScores[TITLE];
 assert.equal(s4.plus,num.activeScore.l4Laugh);
 assert.equal(s4.total,num.activeScore.l1Shield+num.activeScore.l2Promise+num.activeScore.l2Share+num.activeScore.l3Pull+num.activeScore.l4Laugh);
 assert.equal(s4.needed,num.titleUpgradeActiveScore);assert.equal(s4.passed,s4.total>=s4.needed);
 assert.equal(r4.flags[TITLE]===true,s4.passed,'the exported verdict matches the state actually written');
 // a failing combination is recorded too, with the state left unset
 const bad=settle('lcq.event.s05b_06_breakout_and_reunion_ins_lmz_reunion','act.lmz.l4.scold');
 assert.equal(bad.questLineState.activeScores[TITLE].passed,false);assert.equal(bad.flags[TITLE],undefined);
});
