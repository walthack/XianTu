import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadTs } from './loadTs.mjs';
const { disclosedNovelChapter, approvedChapterGates, isDisclosureFactAllowed, sanitizeXieyiDisclosure, stripNarrativeUnintroducedCharacters } = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
const { validateNanhuangCanonNarrative } = await loadTs('../src/modules/scenarioMods/narrativeBoundaries.ts');
const at = chapter => ({ modId: 'lcq.stage_04b_lingfei_baiyi_crisis', events: [{id:'current',axisAnchor:`第${chapter}章`}], activeEventIds:['current'], completedEventIds:[] });
test('approved chronology uses novel anchor, not axis seq or later optional event', () => {
 const r=at(72);r.events[0].axisSeq=121;r.events.push({id:'future',axisAnchor:'第124章'});r.activeEventIds.push('future');
 assert.equal(disclosedNovelChapter(r),72);assert.equal(disclosedNovelChapter({events:r.events}),0);
 assert.deepEqual([approvedChapterGates.poisonSectName,approvedChapterGates.suliRegicide,approvedChapterGates.xieyiSearch,approvedChapterGates.generalPosthumousDaughter,approvedChapterGates.shangName,approvedChapterGates.shangTitle],[121,49,65,72,44,66]);
});
test('general chapter72 daughter story is not chapter105 Xiaozi father confirmation', () => {
 const text='岳帅有一名遗腹女。';
 assert.equal(isDisclosureFactAllowed(text,at(71)),false);assert.equal(isDisclosureFactAllowed(text,at(72)),true);
 assert.doesNotThrow(()=>validateNanhuangCanonNarrative(text,at(72).modId,'碧鲮村',[],at(72)));
 assert.throws(()=>validateNanhuangCanonNarrative('小紫是岳帅的女儿。',at(72).modId,'碧鲮村',[],at(72)),/父系|身世/);
 const r=at(105);r.completedEventIds.push('lcq.event.s05b_09_temporary_pact_with_xiaozi');assert.equal(isDisclosureFactAllowed('小紫是岳帅的遗腹女。',r),true);
});
test('private search starts65 while specific offspring remains hidden and false duty is never restored',()=>{
 const notes=['寻访碧宛的下落','岳帅有一名遗腹女','小紫是岳帅的女儿','奉岳帅之命护佑其遗孀'];
 const run=chapter=>{const r=at(chapter);r.canon={characters:[{id:'liuchao.character.xie_yi',profile:{notes:[...notes]}}]};sanitizeXieyiDisclosure(r);return r.canon.characters[0].profile.notes;};
 assert.deepEqual(run(64),[]);assert.deepEqual(run(65),[notes[0]]);assert.deepEqual(run(72),notes.slice(0,2));assert.deepEqual(run(76),notes.slice(0,2));
});
test('chapter44 named historical mention survives; does not grant present-actor permission',()=>{
 assert.equal(isDisclosureFactAllowed('殇振羽安排了向导。',at(43)),false);
 assert.equal(isDisclosureFactAllowed('殇振羽安排了向导。',at(44)),true);
 assert.equal(isDisclosureFactAllowed('云苍峰提起殇侯。',at(65)),false);
 assert.equal(isDisclosureFactAllowed('云苍峰提起殇侯。',at(66)),true);
 const text='云苍峰低声说，向导是请殇振羽安排的。';
 assert.notEqual(stripNarrativeUnintroducedCharacters(text,['云苍峰'],'',at(43)).text,text);
 assert.equal(stripNarrativeUnintroducedCharacters(text,['云苍峰'],'',at(44)).text,text);
 assert.notEqual(stripNarrativeUnintroducedCharacters('殇振羽走进营地。',['云苍峰'],'',at(44)).text,'殇振羽走进营地。');
});
test('poison sect name opens121 but cannot be confused with Xiaozi father gate105',()=>{
 const r=at(105);r.completedEventIds.push('lcq.event.s05b_09_temporary_pact_with_xiaozi');
 assert.equal(isDisclosureFactAllowed('信里提到毒宗。',r),false);
 assert.equal(isDisclosureFactAllowed('信里提到毒宗。',at(121)),true);
});
test('source card, generated projection and builtin all use chapter49 regicide gate',async()=>{
 for(const path of ['mod-kit/generated/deepseek-v4-flash/character-canon/character-cards-v3.json','src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json']){
  const s=await readFile(new URL('../'+path,import.meta.url),'utf8');assert.doesNotMatch(s,/刺杀鬼巫王的意图要到第59章/);assert.match(s,/刺杀鬼巫王的意图在第49章/);
 }
});
