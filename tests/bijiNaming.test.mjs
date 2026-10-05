import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadTs} from './loadTs.mjs';
const {syncNanhuangIdentityDisplay,xiaoziDisclosure}=await loadTs('../src/modules/scenarioMods/characterResolver.ts');
const {migrateBatch6TextContracts}=await loadTs('../src/modules/scenarioMods/runtime.ts');
const stage=async id=>JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`,import.meta.url)));
const nonDialogue=s=>s.replace(/[“「][^”」]*[”」]/g,'');
test('maternal card retains Geluo derogatory dialogue but narrates and records Biji',async()=>{
 const mod=await stage('lcq.stage_04b_lingfei_baiyi_crisis');
 const e=mod.scenario.events.find(e=>e.id==='lcq.event.weapon_deal_with_geluo');
 const a=e.playerCompletionContract.actions.at(-1);
 assert.match(a.fallbackText,/称她“碧奴的女儿”/);
 assert.doesNotMatch(nonDialogue(a.fallbackText),/碧奴/);
 assert.match(a.fixedFacts.at(-1),/母亲是碧姬/);
 assert.deepEqual(a.ledgerEffects.worldFacts,['小紫母系已演出：碧姬的女儿']);
});
test('old maternal receipt maps to canonical name with no new disclosure',()=>{
 const c={id:'liuchao.character.xiao_zi',profile:{notes:[]}};
 const rt={modId:'lcq.stage_04b_lingfei_baiyi_crisis',canon:{characters:[c]},sceneLedger:{worldFacts:[]}};
 syncNanhuangIdentityDisplay(rt);assert.equal(xiaoziDisclosure(rt).mother,false);assert.doesNotMatch(c.profile.notes.join(''),/碧姬/);
 rt.sceneLedger.worldFacts=['小紫母系已演出：碧奴的女儿'];
 syncNanhuangIdentityDisplay(rt);
 assert.equal(xiaoziDisclosure(rt).mother,true);assert.deepEqual(rt.sceneLedger.worldFacts,['小紫母系已演出：碧姬的女儿']);
 assert.match(c.profile.notes.join(''),/小紫是碧奴的女儿/);assert.doesNotMatch(c.profile.notes.join(''),/碧姬/);
 syncNanhuangIdentityDisplay(rt);assert.equal(rt.sceneLedger.worldFacts.length,1);
});
test('summon objectives and buttons use Biji; exact text migration retains old action progress',async()=>{
 const mod=await stage('lcq.stage_05b'),latest=mod.scenario.events.find(e=>e.id==='lcq.event.geluo_summons_biji');
 assert.doesNotMatch([latest.name,latest.description,latest.axisBeat,latest.objective,JSON.stringify(latest.playerCompletionContract)].join(''),/碧奴/);
 const old=structuredClone(latest),a=old.playerCompletionContract.actions[0];
 a.label='看阁罗召来被称作碧奴的人';a.actionText='我看着阁罗把峒里称作碧奴的人召到面前，先记下这个称呼。';
 a.outcomeText.success='阁罗已召来被称作碧奴的人；最终完成真值由本地引擎落账。';
 const state={contractHash:'e0119be2',readyAtTurn:22,preparations:['kept']};
 const r={events:[old],eventActionStates:{[old.id]:state}};
 assert.equal(migrateBatch6TextContracts(r,[latest]),1);assert.equal(state.contractHash,'f0f6dac7');
 assert.equal(state.readyAtTurn,22);assert.deepEqual(state.preparations,['kept']);assert.deepEqual(old.playerCompletionContract,latest.playerCompletionContract);
});
test('registry narrative uses canonical names while retaining alias and usage rule',async()=>{
 const registry=JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/character-registry.json',import.meta.url)));
 const c=registry.characters.find(c=>c.canonicalName==='碧姬');assert.ok(c.aliases.includes('碧奴'));
 assert.match(c.embedText,/阁罗召碧姬献舞/);assert.doesNotMatch(JSON.stringify(registry),/碧奴勾引|观看碧奴舞蹈|与程宗扬、碧奴、谢艺|奸淫碧奴|阁罗召碧奴献舞/);
});
