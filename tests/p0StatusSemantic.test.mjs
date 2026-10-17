import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './loadTs.mjs';
const semantic=await loadTs('../src/modules/sceneModule/host/freeTextStatusSemantic.ts');
const free=await loadTs('../src/modules/sceneModule/host/freeTextStatus.ts');
const {createMinimalSaveDataV3}=await loadTs('../src/utils/dataRepair.ts');
const {updateStatusEffects}=await loadTs('../src/utils/statusEffectManager.ts');
const {catalogStatus}=await loadTs('../src/modules/sceneModule/statuses.ts');
const input='我连灌了几碗烈酒，头重脚轻，站都站不稳。';
const proposal=(evidence,extra={})=>({statusId:'drunk',actor:'player',assertion:'current',source:'input',evidence,confidence:0.99,...extra});
const validate=(p,u=input,n='')=>semantic.validateFreeTextStatusProposals(JSON.stringify({proposals:p}),u,n);
test('V07 H2 semantic evidence mounts catalog status once and persists through JSON save/load until catalog expiry',()=>{
 const s=createMinimalSaveDataV3();s.世界.状态.剧本模组={modId:'test',events:[],opening:{playerCharacterId:'hero'}};
 const resolution=validate([proposal(input)]);assert.deepEqual(resolution,{state:'resolved',statusIds:['drunk']});
 assert.equal(free.mountFreeTextStatuses(s,structuredClone(s),'',input,resolution),true);
 free.mountFreeTextStatuses(s,structuredClone(s),'',input,resolution);
 const read=JSON.parse(JSON.stringify(s));assert.equal(read.角色.效果.filter(e=>e.状态名称==='醉酒').length,1);
 const duration=catalogStatus('drunk').afterScene.minutes;
 assert.equal(read.角色.效果[0].持续时间分钟,duration);
 assert.equal(read.世界.状态.剧本模组.sceneLedger.statusRecords.actors.hero[0].statusId,'drunk');
 const t=read.元数据.时间;const total=t.小时*60+t.分钟+duration;t.日+=Math.floor(total/1440);t.小时=Math.floor(total%1440/60);t.分钟=total%60;
 assert.deepEqual(updateStatusEffects(read).removedEffects,['醉酒']);
});
test('fixed N2 and semantic boundaries never mount; uncertainty preserves snapshot',()=>{
 for(const [u,p] of [
  ['我滴酒未沾，脑子清醒得很。',proposal('我滴酒未沾',{assertion:'denied'})],
  ['他站都站不稳。',proposal('他站都站不稳',{actor:'other'})],
  ['如果喝酒后站不稳怎么办？',proposal('如果喝酒后站不稳怎么办？',{assertion:'hypothetical'})],
 ])assert.deepEqual(validate([p],u).statusIds,[]);
 const unknown=validate([proposal(input,{actor:'unknown'})]);assert.equal(unknown.state,'clarify');
 const s=createMinimalSaveDataV3(),before=structuredClone(s);
 assert.equal(free.mountFreeTextStatuses(s,before,'你酩酊大醉。',input,unknown),false);assert.deepEqual(s,before);
});
test('catalog, evidence, source and duration authority cannot be overridden by model',()=>{
 for(const extra of [{statusId:'invented'},{evidence:'not in source'},{confidence:0.4},{minutes:999},{statusId:'dizzy'},{statusId:'unconscious'}])assert.equal(validate([proposal(input,extra)]).state,'clarify');
 assert.equal(validate([proposal(input),proposal(input,{assertion:'denied'})]).state,'clarify');
 assert.equal(semantic.validateFreeTextStatusProposals('garbage',input,'').state,'clarify');
});
test('configured caller owns model; request includes catalog meanings without failure-phrase keyword extension',async()=>{
 let request;
 const result=await semantic.recognizeFreeTextStatuses(input,'',async q=>{request=q;return JSON.stringify({proposals:[proposal(input)]});});
 assert.equal(result.statusIds[0],'drunk');assert.ok(JSON.parse(request.input).catalog.some(d=>d.id==='drunk'));
 assert.equal((await semantic.recognizeFreeTextStatuses(input,'',async()=>{throw Error('network');})).state,'clarify');
});

test('input-only semantic proposals preserve narrative-only injury authority without status-specific suppression',()=>{
 const s=createMinimalSaveDataV3();
 const empty=semantic.validateFreeTextStatusProposals('{"proposals":[]}',input,'','input');
 assert.equal(empty.evidenceScope,'input');
 free.mountFreeTextStatuses(s,structuredClone(s),'你左臂骨裂，伤口血流不止。',input,empty);
 assert.deepEqual(s.角色.效果.map(e=>e.状态名称).sort(),['流血','骨折']);
 const another=createMinimalSaveDataV3();
 const recognized=semantic.validateFreeTextStatusProposals(JSON.stringify({proposals:[proposal(input)]}),input,'','input');
 free.mountFreeTextStatuses(another,structuredClone(another),'你眼冒金星。',input,recognized);
 assert.deepEqual(another.角色.效果.map(e=>e.状态名称).sort(),['晕眩','醉酒']);
 const full=createMinimalSaveDataV3();free.mountFreeTextStatuses(full,structuredClone(full),'你左臂骨裂。',input,{state:'resolved',statusIds:[]});
 assert.deepEqual(full.角色.效果,[],'standalone full-scope proposal remains authoritative over all permitted free text statuses');
});


test('input-only semantics retain narrative input-status authority and its denial guard',()=>{
 const empty={state:'resolved',evidenceScope:'input',statusIds:[]};
 const s=createMinimalSaveDataV3();free.mountFreeTextStatuses(s,structuredClone(s),'你喝得酩酊大醉，脚下发飘。','我端起酒碗陪他们一碗接一碗地喝。',empty);
 assert.deepEqual(s.角色.效果.map(e=>e.状态名称),['醉酒']);
 const denied=createMinimalSaveDataV3();free.mountFreeTextStatuses(denied,structuredClone(denied),'你并未醉酒。',input,{...empty,statusIds:['drunk']});
 assert.deepEqual(denied.角色.效果,[]);
});
test('low-confidence other, denied and hypothetical proposals do not hold unrelated actions',()=>{
 for(const extra of [{actor:'other'},{assertion:'denied'},{assertion:'hypothetical'}]){
  const r=validate([proposal(input,{confidence:0.8,...extra})]);assert.equal(r.state,'resolved');assert.deepEqual(r.statusIds,[]);
 }
 assert.equal(validate([proposal(input,{confidence:0.8})]).state,'clarify');
});
test('other-actor proposals are ignored before catalog validation, player out-of-contract still clarifies',()=>{
 const drained='我吸干了昏迷的他的元气。';
 const other=validate([proposal('昏迷的他',{statusId:'unconscious',actor:'other'})],drained);
 assert.equal(other.state,'resolved');assert.ok(!other.statusIds.includes('unconscious'));
 const mixed=validate([proposal('昏迷的他',{statusId:'unconscious',actor:'other'}),proposal(input)]);
 assert.equal(mixed.state,'resolved');assert.deepEqual(mixed.statusIds,['drunk']);
 assert.equal(validate([proposal('昏迷的他',{statusId:'unconscious',actor:'player'})],drained).state,'clarify');
 assert.equal(validate([proposal(input,{actor:'other',minutes:999})]).state,'clarify');
});
