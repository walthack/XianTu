import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mod,makeContract,begin,attack,CTX} from './sceneModuleFixture.mjs';
const {partyName}=await (await import('./loadTs.mjs')).loadTs('../src/modules/sceneModule/host/refs.ts');
const contract=JSON.parse(await readFile(new URL('../src/modules/sceneModule/contracts/f05.json',import.meta.url),'utf8'));
function verify(text, done=[], targets=['warrior_1']) {
 const {state}=begin(contract,{});
 for(const id of done)state.tracks[id].vit=3;
 const result={tier:'success',claims:targets.map(party=>({party,realized:0}))};
 return mod.checkNarration(contract,state,result,text,id=>[partyName(contract,null,id)]);
}
test('R02: one fallen combatant must not imply that all combatants sharing a terminal state fell',()=>{
 for(const text of ['鬼武士一倒下了，另外两人仍在抵抗。','鬼武士一应声倒下，巫师举杖迎战。'])assert.equal(verify(text,['warrior_1']).ok,true,text);
 assert.equal(verify('鬼武士二倒下了，巫师继续抵抗。',['warrior_1']).ok,false);
 assert.equal(verify('鬼武士一倒下了，巫师也倒下了。',['warrior_1']).ok,false);
 assert.equal(verify('鬼武士一倒下了，巫师也倒下了。',['warrior_1','shaman']).ok,true);
});
test('R02: negated, hypothetical, quoted and ambiguous terminal predicates do not reject',()=>{
 for(const text of ['鬼武士一没有倒下。','鬼武士一并未倒下。','鬼武士一不会倒下。','鬼武士一尚未倒下。','鬼武士一不是倒下了，而是在闪躲。','如果鬼武士一倒下了，巫师会逃走。','鬼武士一倒下了吗？','鬼武士一险些倒下。','他倒下了。','两人倒下了。','你问：“鬼武士一倒下了吗？”','你听见有人喊“鬼武士一倒下了”。','没人说鬼武士一倒下了。','你不知鬼武士一是否倒下了。'])assert.equal(verify(text,[],['warrior_1','shaman']).ok,true,text);
});
test('R02: pronouns are resolved only for a unique action target without a competing named subject',()=>{
 assert.equal(verify('他应声倒下。',[],['warrior_1']).ok,false);
 assert.equal(verify('他应声倒下。',['warrior_1'],['warrior_1']).ok,true);
 assert.equal(verify('巫师举杖，他倒下了。',[],['warrior_1','shaman']).ok,true);
 const c=makeContract(),out=mod.confirmAction(c,begin(c,{action:[4],defense:Array(8).fill(20)}).state,attack(['foe_a']),CTX);
 assert.equal(mod.checkNarration(c,out.state,out.result,'他应声出局').ok,false,'existing single-target contract assertion remains unchanged');
});
test('R02: host-resolved actor names match their own party, not another actor',()=>{
 const c=makeContract(),s=begin(c,{}).state,r={tier:'success',claims:[]};
 const names=id=>id==='foe_a'?['甲方']:id==='foe_b'?['乙方']:[];
 assert.equal(mod.checkNarration(c,s,r,'甲方应声出局。',names).ok,false);
 assert.equal(mod.checkNarration(c,s,r,'乙方没有出局。',names).ok,true);
 assert.equal(mod.checkNarration(c,s,r,'甲方看到乙方出局。',names).ok,true,'not a direct subject predicate');
});
