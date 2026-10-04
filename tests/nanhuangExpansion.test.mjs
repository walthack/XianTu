import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadTs } from './loadTs.mjs';
const ids = ['lcq.stage_03b_snake_flower_bridge','lcq.stage_04','lcq.stage_04b_lingfei_baiyi_crisis','lcq.stage_05b','lcq.stage_07_qingyuan_jiankang'];
const stage = async id => JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`,import.meta.url),'utf8'));
const rt = s => s.世界.状态.剧本模组;
async function opened(id) {
  const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
  const { buildStrictScenarioInitialization, applyStrictScenarioInitializationToSave } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const mod=await stage(id);
  return advanceScenarioRuntime(applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(),buildStrictScenarioInitialization(mod))).saveData;
}
async function focus(save,id) {
  const { getCanonRailProfile }=await loadTs('../src/modules/scenarioMods/canonRail.ts');
  const { advanceScenarioRuntime }=await loadTs('../src/modules/scenarioMods/runtime.ts');
  for(const eventId of getCanonRailProfile(rt(save)).orderedEventIds) {
    if(eventId===id)break;
    const e=rt(save).events.find(e=>e.id===eventId);
    rt(save).flags[e.completion[0].path.slice(6)]=true;
    save=advanceScenarioRuntime(save).saveData;
  }
  assert.ok(rt(save).activeEventIds.includes(id));
  return save;
}
async function action(save,id) {
  const { recordStoryEventStructuredAction,getCurrentStoryEventActions,advanceScenarioRuntime }=await loadTs('../src/modules/scenarioMods/runtime.ts');
  // 到达≠完成：要的动作不在、只有罗盘移动时，先移动到场。
  const travel=getCurrentStoryEventActions(save).find(a=>a.actionId.startsWith('travel:'));
  if(travel&&travel.actionId!==id&&!id.startsWith('travel:')){assert.equal(recordStoryEventStructuredAction(save,travel).completed,false);}
  const selection=getCurrentStoryEventActions(save).find(a=>a.actionId===id);
  assert.ok(selection,`missing action ${id}`);
  rt(save).worldTurn++;
  const result=recordStoryEventStructuredAction(save,selection);
  assert.equal(result.attempted,true,result.reason);
  return advanceScenarioRuntime(save).saveData;
}
test('R boundaries, migrated events are unique, bound, and reachable',async()=>{
 const {getCanonRailProfile}=await loadTs('../src/modules/scenarioMods/canonRail.ts');
 const docs=await Promise.all(ids.map(stage));
 const map=new Map();for(const d of docs)for(const e of d.scenario.events){assert.ok(!map.has(e.id),`duplicate ${e.id}`);map.set(e.id,d.manifest.id);}
 const r4=getCanonRailProfile({modId:ids[2]}).orderedEventIds;
 const r5=getCanonRailProfile({modId:ids[3]}).orderedEventIds;
 assert.equal(r4.at(-1),'lcq.event.enter_dong_with_migu');
 assert.equal(r5[0],'lcq.event.blank_letter_and_dagu');
 assert.equal(r5.at(-1),'lcq.event.shanghou_cures_ice_gu');
 const first=r5.indexOf('lcq.event.s05b_09_temporary_pact_with_xiaozi'),last=r5.indexOf('lcq.event.shanghou_revealed');assert.equal(last-first-1,8);
 assert.ok(r4.indexOf('lcq.event.xiaozi_first_appears')<r4.indexOf('lcq.event.s04b_lingfei_baiyi_crisis_18'));
 for(const d of docs){const bound=new Set(d.scenario.chapters.flatMap(c=>c.eventIds));for(const id of getCanonRailProfile({modId:d.manifest.id}).orderedEventIds){assert.ok(d.scenario.events.some(e=>e.id===id),id);assert.ok(bound.has(id),id);}}
});
test('E05 only opens after warning step, refusal closes fatal choice, touch ends with fixed text',async()=>{
 const {getCurrentStoryEventActions,recordStoryEventStructuredAction}=await loadTs('../src/modules/scenarioMods/runtime.ts');
 const {detectBranchDecision}=await loadTs('../src/modules/scenarioMods/branchDecision.ts');
 const {fixedEndingNarrative,endingBridge,fixedBeatNarrative}=await loadTs('../src/modules/scenarioMods/fixedEndingNarratives.ts');
 let save=await focus(await opened(ids[3]),'lcq.event.shanghou_revealed');
 assert.equal(detectBranchDecision(getCurrentStoryEventActions(save)),null);
 assert.ok(!getCurrentStoryEventActions(save).some(a=>a.actionId==='touch_shanghou_relic'));
 save=await action(save,'follow_yeao_to_shanghou');
 assert.match(fixedBeatNarrative('lcq.event.shanghou_revealed','follow_yeao_to_shanghou'),/一百六十七/);
 const choices=getCurrentStoryEventActions(save);assert.equal(detectBranchDecision(choices).options.length,2);
 const fatal=choices.find(a=>a.actionId==='touch_shanghou_relic');const touched=structuredClone(save);
 assert.equal(recordStoryEventStructuredAction(touched,fatal).attempted,true);
 assert.equal(rt(touched).gameOver.endingId,'lcq.ending.death.shanghou_relic');
 assert.match(fixedEndingNarrative(rt(touched).gameOver),/空洞的眼窝/);assert.doesNotMatch(endingBridge('你已经烧成了灰。','lcq.ending.death.shanghou_relic'),/烧成/);
 save=await action(save,'refuse_shanghou_relic_test');assert.ok(!getCurrentStoryEventActions(save).some(a=>a.actionId==='touch_shanghou_relic'));
 assert.equal(recordStoryEventStructuredAction(save,fatal).reason,'action_unavailable');
 save=await action(save,'confirm_zhu_is_shanghou');assert.equal(rt(save).canon.characters.find(c=>c.id==='liuchao.character.shang_zhen_yu').name,'殇侯');
});
test('chapter121 cures once; chapter124 confirms without repeating treatment',async()=>{
 let save=await focus(await opened(ids[3]),'lcq.event.s05b_shanghou_reads_letter');
 save=await action(save,'hand_blank_letter_to_shanghou');
 assert.equal(rt(save).flags['event.s05b_shanghou_reads_letter.ice_gu_cured'],true);
 assert.notEqual(rt(save).flags['event.shanghou_cures_ice_gu.done'],true);
 const end=(await stage(ids[3])).scenario.events.find(e=>e.id==='lcq.event.shanghou_cures_ice_gu');assert.match(end.description,/不再重复施治/);
});
test('masked identity and death/longrest facts remain distinct',async()=>{
 const {syncNanhuangIdentityDisplay}=await loadTs('../src/modules/scenarioMods/characterResolver.ts');
 const runtime={modId:ids[1],canon:{characters:[{id:'liuchao.character.le_mingzhu',name:'乐明珠'},{id:'liuchao.character.shang_zhen_yu',name:'殇侯'}]},flags:{},completedEventIds:[]};
 syncNanhuangIdentityDisplay(runtime);assert.deepEqual(runtime.canon.characters.map(c=>c.name),['花苗新娘','朱八八']);assert.doesNotMatch(JSON.stringify(runtime.canon.characters),/鸩羽|毒宗/);
 runtime.completedEventIds=['lcq.event.s04_03'];syncNanhuangIdentityDisplay(runtime);assert.equal(runtime.canon.characters[0].name,'乐明珠');
 const {resolveScenarioEventNarrative}=await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
 const e=(await stage(ids[3])).scenario.events.find(e=>e.id==='lcq.event.s05b_ice_gu_detour');
 assert.doesNotMatch(resolveScenarioEventNarrative(e,{'event.s06_03.void':true}).description,/谢艺长休/);
 const alive=resolveScenarioEventNarrative(e,{'event.s06_03.void':true,'branch.lcq.if_xieyi_longrest.active':true});assert.match(alive.description,/整个二期不醒/);assert.doesNotMatch(alive.description,/祁远携骨灰/);
 const dead=resolveScenarioEventNarrative(e,{'event.s06_03.done':true});assert.match(dead.description,/祁远携骨灰/);
});
test('explicit phase terminal prevents crossing to next stage',async()=>{
 const {getStageDepartureOffer}=await loadTs('../src/modules/scenarioMods/runtime.ts');
 const {transitionToNextScenarioStage}=await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
 const {isNanhuangDemoFinished}=await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
 const save=await opened(ids[2]);save.系统.扩展.清羽记开局={kind:'qingyu-demo-v1',endModId:ids[2],endEventId:'lcq.event.enter_dong_with_migu'};
 rt(save).completedEventIds.push('lcq.event.enter_dong_with_migu');
 rt(save).nextStageId = ids[3]; rt(save).nextStageReadyId = ids[3];
 assert.equal(getStageDepartureOffer(save),null);
 assert.equal(isNanhuangDemoFinished(save),true);assert.equal(transitionToNextScenarioStage(save,[]).reason,'本期南荒试玩已结束');
});
test('04b and05b advance through actual action receipts without skipping new beats',async()=>{
 const {getCanonRailProfile}=await loadTs('../src/modules/scenarioMods/canonRail.ts');
 const {getCurrentStoryEventActions,advanceScenarioRuntime}=await loadTs('../src/modules/scenarioMods/runtime.ts');
 for(const id of [ids[2],ids[3]]){
  let save=await opened(id);const seen=new Set();
  for(let n=0;n<160&&!rt(save).nextStageReadyId;n++){
   const actions=getCurrentStoryEventActions(save);
   const candidate=actions.find(a=>!a.judgement&&rt(save).events.find(e=>e.id===a.eventId)?.playerCompletionContract?.actions.some(x=>x.id===a.actionId));
   // 到达≠完成：人不在本拍地点时先走罗盘移动，到场后下一轮才是合同动作。
   const travel=!candidate&&actions.find(a=>a.actionId.startsWith('travel:'));
   if(travel){save=await action(save,travel.actionId);continue;}
   assert.ok(candidate,`stalled in ${id}: ${JSON.stringify(actions.map(x=>x.actionId))}`);
   seen.add(candidate.eventId);save=await action(save,candidate.actionId);
  }
  assert.ok(rt(save).nextStageReadyId,`${id} must finish`);
  assert.deepEqual([...seen],getCanonRailProfile({modId:id}).orderedEventIds);
 }
});

test('phase-one scene packets carry current places, cast and visible appearance without future battle background', async () => {
  const { getCurrentStoryEventActions } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { compileLegacyNarratorPacket, readLocalMemoryCapsule } = await loadTs('../src/modules/scenarioMods/legacyNarratorPacket.ts');
  for (const suffix of ['01', '03', '05', '06', '07']) {
    const save = await focus(await opened(ids[0]), `lcq.event.s03b_snake_flower_bridge_${suffix}`);
    const selection = getCurrentStoryEventActions(save).find(a => a.eventId.endsWith(suffix));
    const capsule = readLocalMemoryCapsule(save, selection);
    assert.ok(capsule.presentNames.length, suffix);
    assert.ok(capsule.presentActors.some(a => a.appearance), suffix);
    assert.ok(capsule.presentActors.some(a => a.race), suffix);
    const packet = compileLegacyNarratorPacket(save, { selection, playerLine: selection.actionText, outcomeText: selection.outcomeText }, '', '').packet;
    assert.ok(packet.presentActors.length);
    assert.doesNotMatch(packet.location, /碧鲮/);
    if (suffix === '06') assert.ok(packet.present.includes('苏荔'));
  }
  for (const id of ids.slice(0, 3)) {
    const doc = await stage(id);
    if (id !== ids[1]) assert.doesNotMatch(doc.world.background, /鬼巫王|决战|龙神复苏|谢艺.*死/);
    const names = doc.canon.locations.map(l => l.name);
    for (const name of ['碧鲮族', '鬼王峒', '花苗寨']) assert.equal(names.filter(n => n === name).length, 1);
  }
  const save = await opened(ids[2]);
  assert.match(save.角色.位置.描述, /白夷/);
  const e = (await stage(ids[1])).scenario.events.find(e => e.id === 'lcq.event.s04_07');
  for (const name of ['樨夫人','白夷族长','易勇']) {
    const c = (await stage(ids[1])).canon.characters.find(c => c.name === name);
    assert.ok(e.relatedCharacterIds.includes(c.id), name);
  }
});

test('temporary debut exclusions do not persist; deaths do persist between stages; narrative rejects minors and dead actors', async () => {
  const { departedPresentNames, stampDepartedCast } = await loadTs('../src/modules/scenarioMods/presence.ts');
  const { validateModuleCastNarrative } = await loadTs('../src/modules/scenarioMods/modularTurn.ts');
  const runtime = { modId: ids[0], completedEventIds: ['lcq.event.s03b_yinzhu_xiongerpu'], flags: {} };
  stampDepartedCast(runtime);
  assert.ok(runtime.departedCast.includes('阿葭'));
  assert.ok(!runtime.departedCast.includes('苏荔'));
  runtime.modId = ids[2]; runtime.completedEventIds = [];
  assert.ok(departedPresentNames(runtime).includes('阿葭'));
  assert.ok(departedPresentNames(runtime).includes('叶媪'));
  assert.throws(() => validateModuleCastNarrative('你望见十五六岁的小紫。', []), /年龄/);
  assert.throws(() => validateModuleCastNarrative('段强走进伤员帐。', ['段强']), /在场/);
  assert.doesNotThrow(() => validateModuleCastNarrative('你想起已故的段强。眼前站着十八岁的成年商旅。', ['段强']));
  const paragraph = '你看见水镜里的人影从雾气里缓缓浮现。凝羽站在旁边紧盯镜面上的每一处变化。营火将周围人的影子拉得细长而摇曳。';
  assert.throws(() => validateModuleCastNarrative(paragraph, [], [paragraph]), /重复/);
});

test('retest contracts align button lines, rescue actor, departed cast and distinct map anchors', async () => {
  const { getCurrentStoryEventActions, advanceScenarioRuntime, recordStoryEventStructuredAction } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { fixedBeatNarrative } = await loadTs('../src/modules/scenarioMods/fixedEndingNarratives.ts');
  for (const [id, eid] of [[ids[0], 's03b_snake_flower_bridge_05'], [ids[2], 's04b_lingfei_baiyi_crisis_14']]) {
    let save = await focus(await opened(id), `lcq.event.${eid}`);
    const actions = getCurrentStoryEventActions(advanceScenarioRuntime(save).saveData);
    assert.ok(actions.some(a => a.eventId === `lcq.event.${eid}`), `${eid} needs a main-panel action`);
    const result = recordStoryEventStructuredAction(save, actions[0]);
    assert.equal(result.attempted, true);
  }
  const bride = await focus(await opened(ids[1]), 'lcq.event.s04_03');
  const brideAction = getCurrentStoryEventActions(bride)[0];
  assert.match(brideAction.label, /听清乐明珠为什么要假扮新娘/);
  assert.doesNotMatch(brideAction.label, /前往/);
  assert.equal(brideAction.playerLine, '我听清乐明珠为什么要假扮新娘');
  const wave = await focus(await opened(ids[2]), 'lcq.event.s04b_lingfei_baiyi_crisis_19');
  assert.doesNotMatch(getCurrentStoryEventActions(wave)[0].label, /前往/);
  const tiger = await focus(await opened(ids[2]), 'lcq.event.s04b_lingfei_baiyi_crisis_11');
  assert.ok(!getCurrentStoryEventActions(tiger)[0].label.includes('易虎'));
  const doc = await stage(ids[1]);
  const rescue = doc.scenario.events.find(e => e.id === 'lcq.event.s04_05');
  assert.ok(rescue.relatedCharacterIds.includes(doc.canon.characters.find(c => c.name === '易虎').id));
  assert.match(fixedBeatNarrative(rescue.id, 'respond_to_flash_flood'), /易虎先把易彪.*年轻军士/);
  const locations = doc.canon.locations.filter(l => ['南荒山涧', '鬼王峒', '鬼王峒宫殿', '白夷谷', '白夷族'].includes(l.name));
  assert.equal(new Set(locations.map(l => JSON.stringify(l.coordinates))).size, locations.length);
  const packet = await loadTs('../src/modules/scenarioMods/legacyNarratorPacket.ts');
  const start = await opened(ids[0]);
  const actor = packet.readLocalMemoryCapsule(start, getCurrentStoryEventActions(start)[0]).presentActors.find(a => a.name === '祁远');
  assert.equal(actor.race, '人族');
  const registry = JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/character-registry.json', import.meta.url), 'utf8'));
  assert.equal(registry.characters.find(c => c.canonicalName === '祁远').staticProfile.race, '人族');
  const { resolveScenarioCharacters } = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
  const old = { id: 'liuchao.character.qi_yuan', name: '祁远', profile: { race: '碧鲮族', origin: '碧鲮族/随从/向导' } };
  resolveScenarioCharacters([old], ids[0]);
  assert.equal(old.profile.race, '人族');
  assert.doesNotMatch(old.profile.origin, /碧鲮族/);
});

test('retest2 preserves Ningyu detox facts and natural Xiaozi appearance with distinct sea landmarks', async () => {
  const { fixedBeatNarrative } = await loadTs('../src/modules/scenarioMods/fixedEndingNarratives.ts');
  const doc = await stage(ids[1]);
  const event = doc.scenario.events.find(e => e.id === 'lcq.event.s04_06');
  for (const id of ['liuchao.character.ning_yu', 'liuchao.character.le_mingzhu']) assert.ok(event.relatedCharacterIds.includes(id));
  const text = fixedBeatNarrative(event.id, event.playerCompletionContract.actions[0].id);
  assert.match(text, /凝羽.*麻古毒瘾/);
  assert.match(text, /她/);
  assert.match(text, /乐明珠.*应下/);
  assert.doesNotMatch(text, /冰谷|冰蛊|他|已经痊愈/);
  const xiaozi = (await stage(ids[2])).canon.characters.find(c => c.id === 'liuchao.character.xiao_zi');
  assert.match(xiaozi.profile.appearance, /成年/);
  assert.doesNotMatch(xiaozi.profile.appearance, /没有角|不得|不添/);
  for (const id of [ids[0], ids[2]]) {
    const locations = (await stage(id)).canon.locations;
    const village = locations.find(l => l.id === 'liuchao.location.biyu_village');
    const temple = locations.find(l => l.id === 'liuchao.location.sea_temple');
    assert.notDeepEqual(temple.coordinates, village.coordinates);
    assert.deepEqual(temple.coordinates, { x: 1872, y: 8664 });
  }
});

test('Yeao village is a required stop and 05b opening rumours happen inside Guiwang Dong', async () => {
  const fourth = await stage(ids[1]);
  const event = fourth.scenario.events.find(e => e.id === 'lcq.event.s04_04');
  assert.equal(event.locationId, 'lcq.location.yeao_village');
  const village = fourth.canon.locations.find(l => l.id === event.locationId);
  assert.deepEqual(village.coordinates, { x: 1725, y: 8420 });
  const fifth = await stage(ids[3]);
  for (const id of ['lcq.event.s05b_01_binu_reveals_xiaozi', 'lcq.event.s05b_02_xiaozi_exposed']) {
    assert.equal(fifth.scenario.events.find(e => e.id === id).locationId, 'liuchao.location.guiwang_dong');
  }
});
