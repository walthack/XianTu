import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadTs} from './loadTs.mjs';
const root = new URL('../',import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path,root),'utf8'));
const stage = id => read(`src/modules/scenarioMods/builtins/data/lcq.stage_${id}.json`);
const registry = () => read('src/modules/scenarioMods/builtins/character-registry.json');
const card = async name => (await read('mod-kit/generated/deepseek-v4-flash/character-canon/character-cards-v3.json')).characters.find(c=>c.canonicalName===name);
const c = (mod,id) => mod.canon.characters.find(c=>c.id===id);

test('author conflict 1: approved original facts',async()=>{for(const s of ['03b_snake_flower_bridge','04','04b_lingfei_baiyi_crisis'])for(const id of ['lcq.character.nanhuang_xiaowei','lcq.character.nanhuang_shigang']) assert.equal(c(await stage(s),id).role,'白湖商馆护卫');});

test('author conflict 2: approved original facts',async()=>{assert.match(JSON.stringify(c(await stage('04b_lingfei_baiyi_crisis'),'lcq.character.nanhuang_heishe')),/阁罗的随从/);assert.doesNotMatch(JSON.stringify(c(await stage('04b_lingfei_baiyi_crisis'),'lcq.character.nanhuang_heishe')),/碧鲮族人/);});

test('author conflict 3: approved original facts',async()=>{assert.equal(c(await stage('04b_lingfei_baiyi_crisis'),'lcq.character.nanhuang_dagu').role,'鬼王峒巫师');});

test('author conflict 4: approved original facts',async()=>{const m=await stage('05b');assert.equal(c(m,'lcq.character.nanhuang_loumeng').role,'红苗族长之子');assert.equal(c(m,'liuchao.character.dan_chen').role,'红苗女子，娄蒙之妻');});

test('author conflict 5: approved original facts',async()=>{const r=(await registry()).characters.find(x=>x.canonicalName==='阁罗');assert.doesNotMatch(JSON.stringify([r.staticProfile.identitySummary,r.phaseIdentities]),/鬼王峒首领/);assert.match(r.staticProfile.identitySummary,/鬼巫王.*仆从/);});

test('author conflict 6: approved original facts',async()=>{const r=(await registry()).characters.find(x=>x.canonicalName==='乐明珠');assert.doesNotMatch(JSON.stringify(r.phaseIdentities),/太乙真宗/);assert.match(r.staticProfile.identitySummary,/光明观堂/);});

test('author conflict 7: approved original facts',async()=>{const m=await stage('05b'),x=c(m,'liuchao.character.dragon_god');assert.equal(x.gender,'无');assert.equal(x.entityType,'creature');const r=(await registry()).characters.find(x=>x.canonicalName==='龙神');assert.equal(r.entityType,'creature');assert.equal(r.gender,'无');const {resolveScenarioCharacters}=await loadTs('../src/modules/scenarioMods/characterResolver.ts');const legacy={...structuredClone(x),gender:'男'};delete legacy.entityType;resolveScenarioCharacters([legacy],m.manifest.id);assert.equal(legacy.entityType,'creature');assert.equal(legacy.gender,'无');const {readLocalMemoryCapsule}=await loadTs('../src/modules/scenarioMods/legacyNarratorPacket.ts');const rt={modId:'lcq.stage_05b',canon:{characters:[x]},events:[{id:'fixture',playerCompletionContract:{actions:[{id:'show',cast:{present:['龙神']}}]}}],completedEventIds:[]};const capsule=readLocalMemoryCapsule({世界:{状态:{剧本模组:rt}},角色:{身份:{名字:'程宗扬'}}},{eventId:'fixture',actionId:'show',actionText:'观察',outcomeText:'观察'});assert.equal(capsule.presentActors.find(a=>a.characterId===x.id)?.pronoun,'它');assert.equal(capsule.presentActors.find(a=>a.characterId===x.id)?.entityType,'creature');});

test('author conflict 8: approved original facts',async()=>{const r=(await registry()).characters.find(x=>x.canonicalName==='易虎');assert.doesNotMatch(JSON.stringify(r.phaseIdentities),/吞没他最后一口气/);assert.match(r.staticProfile.keyEvents.join(' '),/61章血虎出场.*63章易彪认出/);assert.equal((await stage('04b_lingfei_baiyi_crisis')).scenario.events.find(x=>x.id==='lcq.event.s04b_lingfei_baiyi_crisis_11').name,'认出血虎');});

test('author conflict 9: approved original facts',async()=>{const f=(await stage('05')).scenario.initialNpcPrivateKnowledge.find(x=>x.factId==='knowledge.npc.qingyu.biji_xingyuehu_identity');assert.match(f.evidence,/第65章段33、第76章段91/);assert.doesNotMatch(f.evidence,/ch82\/ch95/);});

test('author conflict 15: approved original facts',async()=>{const r=(await registry()).characters.find(x=>x.canonicalName==='鬼巫王');assert.match(r.staticProfile.keyEvents.join(' '),/120章.*徒弟/);const e=(await stage('05b')).scenario.events.find(x=>x.id==='lcq.event.shanghou_revealed');assert.match(e.description,/身份确认后.*徒弟/);});

test('author conflict 16: approved original facts',async()=>{const {resolveScenarioCharacters}=await loadTs('../src/modules/scenarioMods/characterResolver.ts');const m=await stage('03b_snake_flower_bridge');resolveScenarioCharacters(m.canon.characters,m.manifest.id);for(const id of ['liuchao.character.qin_hui','liuchao.character.wu_san_gui','lcq.character.np003','lcq.character.np004'])assert.doesNotMatch(c(m,id).description,/殇侯智囊|星月湖大营|直属营执事/);});

test('author conflict 17: approved original facts',async()=>{const f=(await stage('05')).scenario.initialNpcPrivateKnowledge.find(x=>x.factId==='knowledge.npc.qingyu.xiaozi_biji_mother');assert.ok(f.holderCharacterIds.includes('lcq.character.np006'));assert.ok(f.holderCharacterIds.includes('liuchao.character.xiao_zi'));assert.equal(f.unlockAfterEventId,'lcq.event.s05_13');});

test('author conflict 18: approved original facts',async()=>{for(const s of ['03b_snake_flower_bridge','04','04b_lingfei_baiyi_crisis','05b']){const m=await stage(s);assert.ok(m.canon.factions.some(x=>x.id==='liuchao.faction.bai_yi'));for(const name of ['鬼王峒','碧鲮族','熊耳铺'])assert.equal(m.canon.locations.filter(x=>x.name===name).length,1);assert.ok(m.canon.locations.some(x=>x.id==='liuchao.location.gui_wang_gong'));}});

test('author conflict 19: approved original facts',async()=>{const mods=await Promise.all(['03b_snake_flower_bridge','04','04b_lingfei_baiyi_crisis','05b'].map(stage));assert.equal(new Set(mods.flatMap(x=>x.canon.characters.map(c=>c.id))).size,40);});


test('23 supplement: Xieyi male pronouns agree in executable sources and decision evidence', async () => {
  const m = await stage('04b_lingfei_baiyi_crisis');
  const e = m.scenario.events.find(e => e.id === 'lcq.event.s04b_lingfei_baiyi_crisis_04');
  const o = e.worldActor.opportunities.find(o => o.id === 'opportunity.lcq.s04b_04.brief_biyu_first');
  assert.match(o.nextStep, /由他通报碧鲮/);
  assert.match(o.actionText, /先交给他/);
  assert.match(o.completionContract.steps[0].actions[0].actionText, /请他决定/);
  const xie = e.worldActor.decisionCore.actors.find(x => x.characterId === 'liuchao.character.xie_yi' || x.id === 'liuchao.character.xie_yi');
  assert.doesNotMatch(JSON.stringify(xie), /她/);
  assert.match(JSON.stringify(xie), /他提供碧鲮线索/);
  for (const path of ['scripts/add-secondary-line-opportunity-cards-south.mjs', 'mod-kit/canon-authority-overlays/lcq.stage_04b_lingfei_baiyi_crisis.json', 'mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_04b_lingfei_baiyi_crisis.json']) {
    const text = await readFile(new URL(path, root), 'utf8');
    assert.doesNotMatch(text, /由她通报碧鲮|先交给她，不走云家中立匣|请她决定如何通报碧鲮|本拍护的是她给过线索|axisBeat：她提供碧鲮线索/);
  }
  assert.match(JSON.stringify(m.scenario.worldSimulation), /追问阿夕的异常/);
  assert.doesNotMatch(JSON.stringify(m.scenario.worldSimulation), /堵住谢艺，追问她的异常/);
  const r = (await registry()).characters.find(x => x.canonicalName === '谢艺');
  assert.equal(r.gender, '男');
});

test('23 supplement: pronoun-only contract revision preserves progress without accepting other hashes', async () => {
  const m = await stage('04b_lingfei_baiyi_crisis');
  const e = m.scenario.events.find(e => e.id === 'lcq.event.s04b_lingfei_baiyi_crisis_04');
  const id = 'opportunity.lcq.s04b_04.brief_biyu_first';
  const { getTrackedStoryOpportunityActions } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const fixture = hash => ({世界:{状态:{剧本模组:{
    modId:m.manifest.id, flags:{}, chapters:[], events:[structuredClone(e)], activeEventIds:[e.id], completedEventIds:[],
    actorEngine:{trackedOpportunityId:id, opportunityStates:{[id]:{
      status:'tracked',completionStepIndex:1,completionContractHash:hash,completionChoices:{tell_xie:'tell_xie_about_parchment'}
    }}}
  }}}});
  const save = fixture('4270292f');
  const actions = getTrackedStoryOpportunityActions(save);
  assert.equal(actions[0].actionId,'skip_yun_neutral_box');
  assert.equal(actions[0].contractHash,'98654656');
  assert.equal(save.世界.状态.剧本模组.actorEngine.opportunityStates[id].completionChoices.tell_xie,'tell_xie_about_parchment');
  const unrelated = fixture('00000000');
  assert.equal(getTrackedStoryOpportunityActions(unrelated)[0].actionId,'tell_xie_about_parchment');
});
