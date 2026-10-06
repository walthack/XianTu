import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadTs } from './loadTs.mjs';
const runtime = await loadTs('../src/modules/scenarioMods/runtime.ts');
const { resolveScenarioCharacters, isXieyiSkillHidden } = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
const { buildStrictScenarioInitialization, applyStrictScenarioInitializationToSave } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
const { ensureEncounteredScenarioCharacter } = await loadTs('../src/modules/scenarioMods/relationships.ts');
const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
const stage = async s => JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/lcq.stage_${s}.json`, import.meta.url),'utf8'));
test('approved opening and titles expose the current scene without future outcomes or design notes',async()=>{
 for (const short of ['03b_snake_flower_bridge','04','04b_lingfei_baiyi_crisis']) {
  const d=await stage(short);
  assert.doesNotMatch(d.scenario.opening.text,/玩家可|改变.*命运|黑魔海秘讯|鬼王峒陷阱|凝羽受伤|击杀九名/);
  let s=applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(),buildStrictScenarioInitialization(d));
  s.世界.状态.剧本模组.stageEntryPresentation={toStageId:d.manifest.id,text:d.scenario.opening.text};
  assert.equal(runtime.getStageEntryPresentation(s).text,d.scenario.opening.text);
 }
 const d=await stage('04');assert.equal(d.scenario.chapters[0].title,'山涧浓雾');assert.doesNotMatch(d.world.background,/密谋刺杀/);
 const openingPlan=d.scenario.events.find(e=>e.id==='lcq.event.s04_01');
 assert.doesNotMatch(JSON.stringify([openingPlan.description,openingPlan.axisBeat,openingPlan.playerCompletionContract.actions[0].actionText]),/刺杀鬼巫王|刺王密谋/);
});
test('source contract revision keeps a prepared old save and its attempt history, but rejects unrelated mechanical drift',async()=>{
 const d=await stage('02');const latest=d.scenario.events.find(e=>e.id==='lcq.event.wuerlang_joins');const old=structuredClone(latest);
 old.playerCompletionContract.actions[0].actionText='我让武二郎把先前条件说清，承认他此前只求解开镣铐，并未真正答应随队南行。';
 old.playerCompletionContract.actions[1].actionText='武二郎因满城围捕走投无路返回后，我重新谈定报酬，当面取得他加入南荒队伍的明确承诺。';
 old.playerCompletionContract.actions[1].outcomeText.success='武二郎已被迫答应加入南荒队伍；事件完成真值由本地引擎落账。';
 const state={contractHash:'e6c7f972',attemptCount:1,preparations:['wuerlang_no_prior_promise_confirmed'],attempts:[{actionId:'confirm_wuerlang_no_prior_promise',outcome:'success',worldTurn:30}],readyAtTurn:31};
 const rt={events:[old],eventActionStates:{[old.id]:structuredClone(state)}};
 assert.equal(runtime.migrateBatch6TextContracts(rt,[latest]),1);
 assert.deepEqual({...rt.eventActionStates[old.id],contractHash:state.contractHash},state);
 assert.equal(rt.eventActionStates[old.id].contractHash,'59e75a25');
 assert.equal(rt.events[0].playerCompletionContract.actions[1].actionText,latest.playerCompletionContract.actions[1].actionText);
 const changed=structuredClone(latest);changed.playerCompletionContract.actions[1].kind='prepare';
 const before=structuredClone(rt);assert.equal(runtime.migrateBatch6TextContracts(rt,[changed]),0);assert.deepEqual(rt,before);
});
test('public phase cards survive registry resolution, retain protected true realm, and keep internal notes off the player memory',async()=>{
 for(const short of ['03b_snake_flower_bridge','04','04b_lingfei_baiyi_crisis']) {
  const d=await stage(short);const chars=structuredClone(d.canon.characters);resolveScenarioCharacters(chars,d.manifest.id);
  for(const name of ['凝羽','苏荔','阿夕']) {
   const c=chars.find(c=>c.name===name);assert.doesNotMatch(c.profile.personality.join(' '),/外冷内媚|淫媚|小孩子气|富有情欲|顺从/);
   assert.equal(c.role,d.canon.characters.find(c=>c.name===name).role);
  }
  const x=chars.find(c=>c.name==='谢艺');assert.equal(x.realm,'通幽');assert.doesNotMatch(x.profile.appearance,/墨镜|折扇/);
  const s=runtime.advanceScenarioRuntime(applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(),buildStrictScenarioInitialization(d))).saveData;
  ensureEncounteredScenarioCharacter(s,{characters:s.世界.状态.剧本模组.canon.characters,opening:d.scenario.opening},'liuchao.character.xie_yi');
  assert.equal(s.社交.关系.谢艺.境界.名称,'未知');
  assert.doesNotMatch(buildScenarioStoryPrompt(s,'谢艺'),/谢艺（[^）]*通幽/);
  if(short==='04b_lingfei_baiyi_crisis') {
   s.世界.状态.剧本模组.completedEventIds.push('lcq.event.s04b_lingfei_baiyi_crisis_13');
   s.世界.状态.剧本模组.flags['event.s04b_lingfei_baiyi_crisis_13.done']=true;
   const revealed=runtime.advanceScenarioRuntime(s).saveData;
   assert.equal(revealed.社交.关系.谢艺.境界.名称,'通幽');
  }
  for(const npc of Object.values(s.社交.关系))assert.ok((npc.记忆||[]).every(n=>!String(n).startsWith('【内部约束·不入正文】')));
 }
 assert.equal(isXieyiSkillHidden({modId:'lcq.stage_04b_lingfei_baiyi_crisis'}),true);
 assert.equal(isXieyiSkillHidden({modId:'lcq.stage_04b_lingfei_baiyi_crisis',completedEventIds:['lcq.event.s04b_lingfei_baiyi_crisis_13']}),false);
 const registry=JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/character-registry.json',import.meta.url),'utf8'));
 assert.equal(registry.characters.find(c=>c.canonicalName==='小紫').staticProfile.race,'碧鲮族');
});
