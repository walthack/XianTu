// PR #1 驿馆路径（8091 复测 2d46aa61「嘱凝羽留下」后进不了驿馆）：纯离线，固定输入与 mock 语义返回，不调真实模型。
// b4：拦截提示原文本地认成启程；c1/c2：05b 会合目标只在 05b 显示；a：启程进 05b 落驿馆；b3：模型答 none 不启程；两个可重放检查点。
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {loadTs} from './loadTs.mjs';
import {walkMainline} from './baihuMainlineWalk.mjs';
const rt=await loadTs('../src/modules/scenarioMods/runtime.ts'),init=await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const cp=await loadTs('../src/modules/contentPacks/index.ts'),ec=await loadTs('../src/modules/scenarioMods/entityCatalog.ts'),cr=await loadTs('../src/modules/scenarioMods/characterResolver.ts');
const nir=await loadTs('../src/modules/scenarioMods/naturalIntentRouter.ts'),beatProgress=await loadTs('../src/modules/scenarioMods/beatProgress.ts');
const view=await loadTs('../src/modules/scenarioMods/questLineView.ts'),ql=await loadTs('../src/modules/scenarioMods/questLines.ts'),ctxmod=await loadTs('../src/modules/scenarioMods/questLineContext.ts');
const held=await loadTs('../src/modules/scenarioMods/stayRejoin.ts'),questLog=await loadTs('../src/modules/scenarioMods/questLog.ts'),itemView=await loadTs('../src/modules/scenarioMods/itemPresentation.ts');
const V=await loadTs('../src/utils/saveValidationV3.ts'),E=await loadTs('../src/modules/scenarioMods/entitySaveFormat.ts'),loadRepairs=await loadTs('../src/modules/scenarioMods/loadRepairs.ts');

const CRISIS='lcq.stage_04b_lingfei_baiyi_crisis',B05='lcq.stage_05b',INN='lcq.location.guiwang_inn',TUBE='lcq.item.crow_bamboo_tube',IDENTIFY='lcq.event.s04b_lingfei_baiyi_crisis_04';
const Y5='lcq.event.guiwangdong_coop_pact_ins_ningyu_enter',LETTER='lcq.event.blank_letter_and_dagu',REJOIN_BEAT='beat.ningyu.y5_rejoin',REJOIN_ACTION='act.ningyu.y5.rejoin';
const R=save=>save.世界.状态.剧本模组;
const mods=['lcq.stage_05','lcq.stage_05b'].map(id=>{const mod=ec.resolveScenarioContent(cp.applyContentPackOverlays(JSON.parse(fs.readFileSync(new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`,import.meta.url),'utf8'))));cr.resolveScenarioCharacters(mod.canon?.characters,mod.manifest.id);return mod;});
const rejoinShown=save=>view.questLineView(save).character.some(b=>b.beatId===REJOIN_BEAT);
const fixture=stem=>JSON.parse(fs.readFileSync(new URL(`./fixtures/checkpoints/${stem}.json`,import.meta.url),'utf8'));
const tubeState=id=>{const s=ec.catalogItem(TUBE).states.find(s=>s.id===id);return {name:s.name,description:s.description};};

// 逐拍记下：带 stageId 的人物拍被显示层过滤掉时，引擎此刻有没有可执行动作（显示层只该藏掉做不了的）。
function auditStageFilter(save,event,hidden){
 const r=R(save),ctx=ctxmod.questLineContext(save,event?.id),state=r.questLineState||{version:1,receipts:{}};
 const shown=new Set(view.questLineView(save).character.map(b=>b.beatId)),offered=rt.getCurrentStoryExplorationActions(save);
 for(const {beat} of ql.lineInsertionsAt(ql.QUEST_LINES.filter(l=>l.kind==='character'),event?.id,ctx,state))
  if(beat.stageId&&!shown.has(beat.id))hidden.push({beatId:beat.id,stage:r.modId,actions:offered.filter(a=>a.eventId===beat.eventId).length});
}
// 一遍只走主线；一遍在 Y5 选「留下」，04b 关末暂存，05b 拆信焦点时先会合（与 nanhuangApprovedChanges 同一走法）。
const plainHidden=[];await walkMainline((save,event)=>auditStageFilter(save,event,plainHidden));
const stayHidden=[],in04b=[];let ready;
await walkMainline((save,event)=>{
 const r=R(save);
 const y5=r.flags['branch.ningyu.enter_dong']===undefined&&rt.getCurrentStoryExplorationActions(save).find(a=>a.eventId===Y5&&a.actionId==='act.ningyu.y5.stay');
 if(y5){r.worldTurn++;assert.equal(rt.recordStoryEventStructuredAction(save,y5).completed,true);}
 if(r.modId===CRISIS&&r.flags['branch.ningyu.enter_dong']==='stay')in04b.push({event:event?.id??null,rejoin:rejoinShown(save)});
 if(r.modId===CRISIS&&r.nextStageReadyId&&!ready)ready=structuredClone(save);
 if(event?.id===LETTER&&r.flags['branch.ningyu.y5_rejoined']!==true){const a=rt.getCurrentStoryExplorationActions(save).find(a=>a.actionId===REJOIN_ACTION);if(a){r.worldTurn++;rt.recordStoryEventStructuredAction(save,a);}}
 auditStageFilter(save,event,stayHidden);
});
const readyStay=()=>{assert.ok(ready,'stay walk reached 04b stage_ready');return structuredClone(ready);};

test('b4: the hold hint the UI itself shows at 04b stage_ready is a local exact 启程, independent of the model',()=>{
 const save=readyStay(),offer=rt.getStageDepartureOffer(save);assert.ok(offer);
 const h=held.heldActions(save)[0];assert.ok(h,'letter opening is held');
 const hint=held.heldPrerequisiteObjective(h,save);
 assert.equal(hint,questLog.questConfig().departureObjective.replace('{place}',questLog.locationName(INN)),'hint is the existing departure template, no new wording');
 assert.notEqual(beatProgress.beatLineKey(hint),beatProgress.beatLineKey(offer.label));
 const hit=beatProgress.resolveBeatText(save,hint);
 assert.equal(hit?.via,'exact');assert.equal(hit?.action?.kind,'departure');assert.equal(hit.action.offer.nextStageId,offer.nextStageId);
 assert.equal(beatProgress.resolveBeatText(save,offer.label)?.action?.kind,'departure','the button label still departs');
});

test('b4 negative: only the exact displayed sentence counts — a fragment of it is not a departure (no fuzzy words)',()=>{
 const save=readyStay(),hint=held.heldPrerequisiteObjective(held.heldActions(save)[0],save),place=questLog.locationName(INN);
 assert.ok(hint.includes(place));
 assert.notEqual(beatProgress.resolveBeatText(save,place)?.action?.kind,'departure');
});

test('b3: same sentence, model answers none → free narrative turn, no departure',async()=>{
 const save=readyStay(),text=held.heldPrerequisiteObjective(held.heldActions(save)[0],save);
 const result=await nir.resolveNaturalIntent({saveData:save,mods,playerText:text,selected:null,resolveFromText:nir.resolveStoryEventActionFromText,
  generate:async()=>JSON.stringify({actionId:'none',certainty:'high',evidence:'',statusProposals:[]})});
 assert.equal(result.stageDeparture,undefined);
});

test('a: 启程 (the button handler transition) enters 05b, writes 到驿馆安顿, puts the player in the inn and activates the letter event',()=>{
 const t=init.transitionToNextScenarioStage(readyStay(),mods);assert.equal(t.ok,true,t.reason);
 const s=t.saveData,r=R(s);
 assert.equal(r.modId,B05);assert.equal(s.角色.位置.locationId,INN);
 assert.ok(JSON.stringify(r.travelLedger).includes('nh.r.stage.04b_05b'),'到驿馆安顿 forced route written');
 assert.ok(r.activeEventIds.includes(LETTER));
});

test('c1: 「这一拍谁有戏」 never lists the 05b inn rejoin while still in 04b after choosing stay',()=>{
 assert.ok(in04b.length>3,'the stay walk spent several beats in 04b');
 assert.deepEqual(in04b.filter(x=>x.rejoin),[]);
});

test('c2: after 启程 the rejoin is listed at the inn in 05b',()=>{
 const t=init.transitionToNextScenarioStage(readyStay(),mods);assert.equal(t.ok,true);
 assert.equal(rt.getScenarioFocusEvent(R(t.saveData))?.id,LETTER);assert.ok(rejoinShown(t.saveData));
});

test('c regression: the stage filter only ever hides beats the engine cannot act on, and never hides o2/y3/y5_enter/y6/other lines in their own stage',()=>{
 assert.deepEqual(plainHidden,[],'plain walk: nothing hidden');
 assert.ok(stayHidden.length>0);
 assert.deepEqual([...new Set(stayHidden.map(x=>`${x.beatId}@${x.stage}`))],[`${REJOIN_BEAT}@${CRISIS}`]);
 assert.ok(stayHidden.every(x=>x.actions===0),'hidden beats had no executable action');
});

test('checkpoint nanhuang-04b-before-letter-id: 04b before s04b_04, tube in the bag, presents as state one, importable',()=>{
 const bundle=fixture('nanhuang-04b-before-letter-id');assert.equal(bundle.type,'saves');
 const slot=bundle.saves[0];assert.deepEqual(Object.keys(slot),['存档名','保存时间','存档数据']);
 const save=structuredClone(slot.存档数据),r=R(save);
 E.assertEntitySaveFormat(save);assert.equal(r.entitySaveFormat,E.ENTITY_SAVE_FORMAT);assert.equal(V.validateSaveDataV3(save).isValid,true);
 assert.equal(r.modId,CRISIS);assert.equal(rt.getScenarioFocusEvent(r)?.id,IDENTIFY);assert.ok(!r.completedEventIds.includes(IDENTIFY));
 assert.ok(save.角色.背包.物品[TUBE]);
 loadRepairs.applyLoadRepairs(save);
 assert.deepEqual(itemView.resolveItemPresentation(save,TUBE),tubeState('sealed'));
});

test('checkpoint nanhuang-05b-inn-stay-before-rejoin: 05b at the inn, letter focus, stay not rejoined, letter held, state two, importable',()=>{
 const bundle=fixture('nanhuang-05b-inn-stay-before-rejoin');assert.equal(bundle.type,'saves');
 const slot=bundle.saves[0];assert.deepEqual(Object.keys(slot),['存档名','保存时间','存档数据']);
 const save=structuredClone(slot.存档数据),r=R(save);
 E.assertEntitySaveFormat(save);assert.equal(r.entitySaveFormat,E.ENTITY_SAVE_FORMAT);assert.equal(V.validateSaveDataV3(save).isValid,true);
 loadRepairs.applyLoadRepairs(save);
 assert.equal(R(save).modId,B05);assert.equal(save.角色.位置.locationId,INN);assert.equal(rt.getScenarioFocusEvent(R(save))?.id,LETTER);
 assert.equal(R(save).flags['branch.ningyu.enter_dong'],'stay');assert.notEqual(R(save).flags['branch.ningyu.y5_rejoined'],true);
 assert.ok(held.heldActions(save).length>0,'letter opening held until the rejoin');
 assert.ok(rejoinShown(save),'rejoin listed at the inn');
 assert.deepEqual(itemView.resolveItemPresentation(save,TUBE),tubeState('blank_letter'));
});
