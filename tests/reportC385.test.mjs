// 随机遇敌 第2张（encounter-2；用户 2026-10-28 13:48 第3条；总策划定）：开战、模板合同、输了就地重伤继续、战利品走搜刮池。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadTs } from './loadTs.mjs';

const host = await loadTs('../src/modules/sceneModule/host/controller.ts');
const ext = await loadTs('../src/modules/sceneModule/host/ext.ts');
const mod = await loadTs('../src/modules/sceneModule/index.ts');
const registry = await loadTs('../src/modules/sceneModule/contracts/registry.ts');
const RC = await loadTs('../src/modules/sceneModule/contracts/randomContract.ts');
const { snapshotLevels } = await loadTs('../src/modules/sceneModule/host/factors.ts');
const { enemyKindLevel } = await loadTs('../src/modules/scenarioMods/actorLevels.ts');
const N = await loadTs('../src/modules/sceneModule/numbers.ts');
const E = await loadTs('../src/modules/scenarioMods/randomEncounter.ts');
const { settleLocationLoot } = await loadTs('../src/modules/scenarioMods/locationLoot.ts');
const { logStore } = await loadTs('../src/modules/diagnostics/store.ts');
const { createMinimalSaveDataV3 } = await loadTs('../src/utils/dataRepair.ts');
const init = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
const trial = await loadTs('../src/dev/combatTrial/overlay.ts');

const rt = s => s.世界.状态.剧本模组;
const INN = 'lcq.location.guiwang_inn';
const WARRIOR = 'lcq.enemy.guiwang_warrior';
const stageJson = async id => JSON.parse(await readFile(new URL(`../src/modules/scenarioMods/builtins/data/${id}.json`, import.meta.url), 'utf8'));
function enable() { globalThis.location = { search: '?sceneModule=on', hostname: 'localhost', href: 'http://localhost/?sceneModule=on' }; }
let opened;
async function open05b() {
  if (!opened) {
    opened = advanceScenarioRuntime(init.applyStrictScenarioInitializationToSave(createMinimalSaveDataV3(), init.buildStrictScenarioInitialization(await stageJson('lcq.stage_05b')))).saveData;
    opened.元数据.创建时间 = '2026-10-28T06:00:00.000Z'; // 固定种子
  }
  return structuredClone(opened);
}
/** 用第1张单的引擎跑到 stage 'battle'（驿馆 hostile、几率 1、单条敌池）。 */
function toBattle(s, { enemyId = WARRIOR, level = 3, levelOffset, count = [2, 2] } = {}) {
  const c = structuredClone(N.GAME_NUMBERS.encounter);
  c.tiers.hostile = { chance: 1, cooldownTurns: 0 };
  c.regions.nanhuang.zones = [{ key: INN, tier: 'hostile' }];
  c.regions.nanhuang.pool = [{ enemyId, level, ...(levelOffset !== undefined ? { levelOffset } : {}), zones: [INN], weight: 1, count }];
  c.regions.nanhuang.skipDuringEventIds = [];
  E.tickRandomEncounter(s, { narrated: true, config: c });
  for (let i = 0; i < 3; i++) { rt(s).worldTurn++; E.tickRandomEncounter(s, { narrated: true, config: c }); }
  const p = E.pendingRandomBattle(s);
  assert.ok(p, 'pending battle');
  return p;
}
function harness(save) { let current = save; return { get save() { return current; }, deps: { persist: async s => { current = structuredClone(s); } } }; }
function force(save, action, defense) { const a = ext.activeScene(save); a.state.forced = { action: Array(200).fill(action), defense: Array(400).fill(defense) }; }
async function fight(h, action, defense) {
  await host.submitSceneInput(h.save, '我挥刀攻击对手', h.deps);
  assert.ok(ext.activeScene(h.save), 'random scene opened');
  force(h.save, action, defense);
  for (let n = 0; n < 40 && ext.activeScene(h.save); n++) {
    if (!ext.activeScene(h.save).pending) await host.submitSceneInput(h.save, '我挥刀攻击对手', h.deps);
    await host.confirmSceneAction(h.save, h.deps);
  }
  assert.equal(ext.activeScene(h.save), null, 'scene closed');
}
/** 随机战不得碰的剧情状态。身份账＝playerIdentities；personIdentities 是挂伤记账（injuries.actorKey）顺手缓存的人名表，不算身份账。 */
const storyState = s => structuredClone({
  flags: rt(s).flags, completed: rt(s).completedEventIds, active: rt(s).activeEventIds,
  worldFacts: rt(s).sceneLedger?.worldFacts || [], identities: rt(s).playerIdentities,
  transfers: rt(s).inventoryTransferReceipts, bag: s.角色.背包,
});

test('P1-1 真实随机战宿主：气血1被命中当拍判负，收场按配置恢复而非卡战',async()=>{ enable();const s=await open05b();toBattle(s,{count:[1,1]});s.角色.属性.气血={当前:1,上限:100};const h=harness(s);await host.submitSceneInput(h.save,'我挥刀攻击对手',h.deps);force(h.save,1,1);await host.confirmSceneAction(h.save,h.deps); assert.equal(ext.readExt(h.save).history.at(-1)?.outcome,'lose'); assert.equal(h.save.角色.属性.气血.当前,N.GAME_NUMBERS.combat.woundRules.hp.afterLossContinueHp);assert.equal(ext.activeScene(h.save),null);});

const R = await loadTs('../src/modules/scenarioMods/runtime.ts');
const AT = await loadTs('../src/modules/scenarioMods/actionTime.ts');
const LR = await loadTs('../src/modules/scenarioMods/loadRepairs.ts');
const M = await loadTs('../src/modules/scenarioMods/travel/mapTravel.ts');
const B = await loadTs('../src/modules/scenarioMods/branchDecision.ts');
const W = await loadTs('../src/modules/scenarioMods/wuyuanOpenWorldSlice.ts');
const P = await loadTs('../src/modules/scenarioMods/playerActionPresentation.ts');
const { CONTENT_PACKS } = await loadTs('../src/modules/contentPacks/index.ts');
const { gameTimeMinutes } = await loadTs('../src/utils/time.ts');
const read = async p => readFile(new URL('../'+p, import.meta.url),'utf8');
const fixture = async name => JSON.parse(await read(`tests/fixtures/checkpoints/current-${name}.json`)).saves[0].存档数据;
function advance(s,a) {
  assert.ok(R.recordStoryEventStructuredAction(s,a,{judgementResolution:{status:'resolved',outcome:'success',kind:'explore'}}).attempted,a.actionId);
  rt(s).worldTurn++; return R.advanceScenarioRuntime(s).saveData;
}

test('P1-2 唐国内移动：模型一日与数日均不绕过折天白名单，实际仅片刻且幂等',async()=>{
  let s=R.advanceScenarioRuntime(await fixture('tang-entry')).saveData,a;
  for(let i=0;i<12;i++){[a]=R.getCurrentStoryEventActions(s);if(a.actionId.startsWith('travel:'))break;s=advance(s,a);}
  assert.equal(a.actionId,'travel:liuchao.location.changan');
  for(const tier of ['一日','数日']){
    const save=structuredClone(s),before=gameTimeMinutes(save.元数据.时间);
    const eventAction={...a,travelFromLocationId:save.角色.位置.locationId};
    R.recordStoryEventStructuredAction(save,a);
    const options={eventAction,timeActionId:'tang:'+tier},response={action_time:{tier, ...(tier==='数日'?{days:3}:{})}};
    AT.settleActionTime(save,response,options,null,false,false);
    AT.settleActionTime(save,response,options,null,false,false);
    assert.equal(gameTimeMinutes(save.元数据.时间)-before,N.GAME_NUMBERS.story.actionTime.minutes.moment);
    assert.equal(save.角色.位置.locationId,'liuchao.location.changan');
  }
});

test('P1-3 秦入口短句落脚打听：新档、旧合同回填及补充语可完成，否定句不命中',async()=>{
  let s=await fixture('tang-entry'); delete s.系统.扩展.清羽记开局;
  rt(s).completedEventIds.push(...['nanhuang','jin','song'].map(id=>CONTENT_PACKS.lineCompass.lines.find(l=>l.lineId===id).closedWhen[0].path.slice(5)));
  s=R.advanceScenarioRuntime(s).saveData;
  assert.ok(M.settleMapTravel(s,M.selectMapTravel(s,'liuchao.location.xianyang')));
  s=R.advanceScenarioRuntime(s).saveData;
  const e=rt(s).events.find(e=>e.id==='liuchao.event.qin_enter_xianyang'),a=e.playerCompletionContract.actions[0];
  a.intentMatch={matchAny:[a.label,a.actionText]};
  LR.applyLoadRepairs(s);
  for(const text of ['落脚打听','我先落脚打听，问问见王的门路']){
    const save=structuredClone(s),selection=R.resolveStoryEventActionFromPlayerText(save,text);
    assert.equal(selection?.actionId,'settle_in_xianyang');
    assert.ok(rt(advance(save,selection)).completedEventIds.includes(e.id));
  }
  assert.equal(R.resolveStoryEventActionFromPlayerText(s,'不想落脚打听'),undefined);
});

test('P2-4 五原固定选项：建议可见，手打接赌/不赌与点击结算同一动作，含糊输入不代选',async()=>{
  let s=R.advanceScenarioRuntime(await fixture('prologue-before-s02_04')).saveData,decision;
  for(let i=0;i<25;i++){
    const actions=R.getCurrentStoryEventActions(s);decision=B.detectBranchDecision(actions);
    if(decision)break;
    if(rt(s).activeEventIds.includes('lcq.event.s02_04')){
      W.settleWuyuanOpenWorldSelection(s,W.getWuyuanOpenWorldSelections(s)[0]);rt(s).worldTurn++;s=R.advanceScenarioRuntime(s).saveData;
    }else s=advance(s,actions[0]);
  }
  assert.deepEqual(decision?.labels,['接赌','不赌']);
  for(const [i,label] of decision.labels.entries()){
    const action=B.resolveBranchDecisionInput(decision,label,a=>a.playerLine);
    assert.equal(action.actionId,decision.options[i].actionId);
    assert.deepEqual(advance(structuredClone(s),action),advance(structuredClone(s),decision.options[i]));
  }
  for(const text of ['不接赌','接赌还是不赌','随便聊聊']) assert.equal(B.resolveBranchDecisionInput(decision,text,a=>a.playerLine),undefined);
  const ui=await read('src/components/dashboard/MainGamePanel.vue');
  assert.match(ui,/branchDecision.value \? branchDecision.value.options.map/);
  assert.doesNotMatch(ui,/<div v-if="!branchDecision" class="input-wrapper"/);
  assert.match(ui,/selectedScenarioEngineAction.value = typed; inputText.value = engineOptionLine\(typed\)/);
});

test('P2-5 太泉旧档补齐火山口地点：前往实际落位，到场不会提前完成圣果争夺',async()=>{
  let s=await fixture('taiquan-entry');LR.applyLoadRepairs(s);s=R.advanceScenarioRuntime(s).saveData;
  let a;
  for(let i=0;i<20;i++){[a]=R.getCurrentStoryEventActions(s);assert.ok(a);if(a.actionId==='travel:lyl.location.taiquan_crater')break;s=advance(s,a);}
  assert.equal(a.actionId,'travel:lyl.location.taiquan_crater');
  s=advance(s,a);
  assert.equal(s.角色.位置.locationId,'lyl.location.taiquan_crater');
  assert.equal(s.角色.位置.描述,'太泉·火山口');
  assert.ok(!rt(s).completedEventIds.includes('lyl.event.taiquan_sacred_fruit_10'));
  assert.ok(R.getCurrentStoryEventActions(s).some(a=>a.eventId==='lyl.event.taiquan_sacred_fruit_10'&&!a.actionId.startsWith('travel:')));
});

test('P2-6 汉廷听清动作按作者展示为观察，转述攻击不再成为按钮标签',()=>{
  const shown=P.playerActionDisplayOverride('lyl.event.han_court_grain_blame','hear_court_grain_cutoff');
  assert.equal(shown.label,'观察 · 听清朝会上粮草被掐断');assert.match(shown.line,/王温舒攻击丞相/);
});

test('P2-7 长安当前位置禁止重复前往，地图权威及内置文本没有热闘',async()=>{
  const s=await fixture('tang-entry');s.角色.位置={locationId:'liuchao.location.changan',描述:'唐·长安'};
  assert.equal(M.mapTravelRestriction(s,'liuchao.location.changan'),'你已在此地。');
  assert.equal(M.selectMapTravel(s,'liuchao.location.changan'),undefined);
  assert.doesNotMatch(await read('mod-kit/entity-catalog/locations.json'),/热闘/);
  assert.doesNotMatch(await read('src/modules/scenarioMods/builtins/data/lyg.changgan_begins.json'),/热闘/);
});

test('P2-7 旧档读档修正长安错字：地图地点与剧本canon只改热闘一处，其它地点不动、重复读档幂等',async()=>{
  const old=JSON.parse(await read('tests/fixtures/playtest-08e0/f03-before.json')).payload.saves[0].存档数据;
  const changan=s=>[s.世界.信息.地点信息.find(l=>l.id==='liuchao.location.changan').描述,rt(s).canon.locations.find(l=>l.id==='liuchao.location.changan').description];
  assert.ok(changan(old).every(d=>d.includes('热闘')),'旧档确有错字');
  const expected=changan(old).map(d=>d.replaceAll('热闘','热闹')),others=structuredClone(old.世界.信息.地点信息.filter(l=>l.id!=='liuchao.location.changan'));
  LR.applyLoadRepairs(old);
  assert.deepEqual(changan(old),expected);
  assert.deepEqual(old.世界.信息.地点信息.filter(l=>l.id!=='liuchao.location.changan'),others);
  const once=structuredClone(old);LR.applyLoadRepairs(old);assert.deepEqual(changan(old),changan(once));
});

test('观察8 舞都到洛都为11游戏日：三月28日至四月9日按每月30日计算，没有多扣一天',async()=>{
  const s=await fixture('han-entry');s.元数据.时间={年:224,月:3,日:28,小时:14,分钟:43};
  const before=gameTimeMinutes(s.元数据.时间);
  const eventAction={source:'event_engine',eventId:'lyl.event.taiquan_afterfall_08_beat',actionId:'travel:lyl.location.luoyang',travelFromLocationId:'liuchao.location.wudu'};
  assert.equal(AT.questTravelMinutes(s,{eventAction}),11*1440);
  AT.settleActionTime(s,{action_time:{tier:'一日'}},{eventAction,timeActionId:'han-11'},null,false,false);
  assert.deepEqual(s.元数据.时间,{年:224,月:4,日:9,小时:14,分钟:43});assert.equal(gameTimeMinutes(s.元数据.时间)-before,11*1440);
});

test('P1-1 报告原句连续交手：每拍经宿主确认，有伤害后不会在1点保底',async()=>{
 enable();const s=await open05b();toBattle(s,{count:[1,1]});s.角色.属性.气血={当前:21,上限:100};const h=harness(s);
 for(let i=0;i<8;i++){
   await host.submitSceneInput(h.save,'沿山涧继续探查，与来敌交手',h.deps);
   const a=ext.activeScene(h.save);assert.ok(a?.pending,JSON.stringify({notice:a?.notice,phase:a?.phase}));
   force(h.save,1,1);await host.confirmSceneAction(h.save,h.deps);
   if(!ext.activeScene(h.save))break;
 }
 assert.equal(ext.activeScene(h.save),null);assert.equal(ext.readExt(h.save).history.at(-1)?.outcome,'lose');
});
