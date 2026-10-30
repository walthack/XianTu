import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';
const P = await loadTs('../src/modules/scenarioMods/travel/mapTravel.ts');
const { CONTENT_PACKS } = await loadTs('../src/modules/contentPacks/index.ts');
const { gameTimeMinutes } = await loadTs('../src/utils/time.ts');
const config = JSON.parse(readFileSync(new URL('../mod-kit/numbers-runtime.json', import.meta.url))).crossCountryTravel;
const saveAt = id => ({元数据:{时间:{年:220,月:1,日:1,小时:0,分钟:0}},角色:{位置:{locationId:id}},系统:{扩展:{}},世界:{状态:{剧本模组:{worldTurn:1,completedEventIds:[]}}}});
for (const [from, row] of Object.entries(config.rawDays)) {
  for (const [to, raw] of Object.entries(row)) test(`矩阵双向 ${from}↔${to} ${raw}天`, () => {
    for (const [a,b] of [[from,to],[to,from]]) {
      if (!config.destinations[b]) { assert.deepEqual(P.mapRoutes(saveAt(config.capitals[a]),config.capitals[b]),[]); continue; }
      const route = P.mapRoutes(saveAt(config.capitals[a]),config.capitals[b])[0];
      assert.equal(route.id,`xc:${a}:${b}`);
      assert.equal(route.dayCost,Math.min(raw,60));
    }
  });
}
test('本国任意地点出发按国别计时，抵达后重复收据幂等且冲突拒绝', () => {
  for (const id of ['liuchao.location.jiankang','liuchao.location.linchuan']) {
    const s=saveAt(id), selection=P.selectMapTravel(s,config.capitals.宋), before=gameTimeMinutes(s.元数据.时间);
    assert.equal(selection.routeId,'xc:晋:宋');
    assert.equal(P.settleMapTravel(s,selection),true);
    assert.equal(gameTimeMinutes(s.元数据.时间)-before,52*1440);
    assert.equal(s.角色.位置.locationId,config.capitals.宋);
    const after=structuredClone(s);
    assert.equal(P.settleMapTravel(s,selection),true);
    assert.deepEqual(s,after);
    assert.equal(P.settleMapTravel(s,{...selection,toId:config.capitals.唐}),false);
    assert.deepEqual(s,after);
  }
});
test('五原出发到太泉101截断60，收据保留source', () => {
  const s=saveAt(config.capitals.中立边陲), choice=P.selectMapTravel(s,config.capitals.太泉), before=gameTimeMinutes(s.元数据.时间);
  assert.equal(choice.routeId,'xc:中立边陲:太泉');
  assert.equal(P.settleMapTravel(s,choice),true);
  assert.equal(gameTimeMinutes(s.元数据.时间)-before,60*1440);
  assert.equal(s.系统.扩展.actionTime.receipts['map:'+choice.actionId].source,`map:${choice.routeId}:${choice.fromId}:${choice.toId}`);
});
test('五原（中立边陲）是可点跨国落点：各国代表点出发可前往，按矩阵计天数（上限60）', () => {
  assert.deepEqual(config.destinations.中立边陲,[config.capitals.中立边陲]);
  for (const id of Object.values(config.capitals).filter(id=>id!==config.capitals.中立边陲)) {
    const s=saveAt(id),from=P.countryOf(id),choice=P.selectMapTravel(s,config.capitals.中立边陲),before=gameTimeMinutes(s.元数据.时间);
    assert.equal(P.mapTravelRestriction(s,config.capitals.中立边陲),undefined,id);
    assert.equal(choice.routeId,`xc:${from}:中立边陲`,id);
    const raw=config.rawDays[from]?.中立边陲??config.rawDays.中立边陲?.[from];
    assert.equal(P.settleMapTravel(s,choice),true,id);
    assert.equal(gameTimeMinutes(s.元数据.时间)-before,Math.min(raw,config.dayCap)*1440,id);
    assert.equal(s.角色.位置.locationId,config.capitals.中立边陲);
  }
});
test('从五原出发到建康按矩阵38日可走', () => {
  const s=saveAt(config.capitals.中立边陲),choice=P.selectMapTravel(s,config.capitals.晋),before=gameTimeMinutes(s.元数据.时间);
  assert.equal(choice.routeId,'xc:中立边陲:晋');
  assert.equal(P.settleMapTravel(s,choice),true);
  assert.equal(gameTimeMinutes(s.元数据.时间)-before,38*1440);
  assert.equal(s.角色.位置.locationId,config.capitals.晋);
});
test('江州为晋第二跨国落点：天数按江州坐标单独配置，临安→江州32日', () => {
  const jz='liuchao.location.jiangzhou', table=config.destinationRawDays[jz];
  assert.deepEqual(config.destinations.晋,[config.capitals.晋,jz]);
  assert.equal(table.晋,undefined,'晋国内到江州不走跨国规则');
  for (const [country,raw] of Object.entries(table)) {
    const s=saveAt(config.capitals[country]),choice=P.selectMapTravel(s,jz),before=gameTimeMinutes(s.元数据.时间);
    assert.equal(choice.routeId,`xc:${country}:晋`);assert.equal(choice.toId,jz);
    assert.equal(P.settleMapTravel(s,choice),true);
    assert.equal(gameTimeMinutes(s.元数据.时间)-before,Math.min(raw,config.dayCap)*1440,country);
    assert.equal(s.角色.位置.locationId,jz);
  }
  assert.equal(table.宋,32);assert.equal(table.秦,61);
});
test('江州出发来回对称：江州→临安32日且等于临安→江州；建康→临安仍按矩阵52日；建康↔江州国内不走跨国规则', () => {
  const jz='liuchao.location.jiangzhou', lin=config.capitals.宋;
  const go=P.mapRoutes(saveAt(jz),lin)[0], back=P.mapRoutes(saveAt(lin),jz)[0];
  assert.equal(go.id,'xc:晋:宋');assert.equal(go.dayCost,32);assert.equal(go.dayCost,back.dayCost);
  const s=saveAt(jz),choice=P.selectMapTravel(s,lin),before=gameTimeMinutes(s.元数据.时间);
  assert.equal(P.settleMapTravel(s,choice),true);
  assert.equal(gameTimeMinutes(s.元数据.时间)-before,32*1440);
  assert.equal(P.mapRoutes(saveAt(config.capitals.晋),lin)[0].dayCost,52);
  assert.deepEqual(P.mapRoutes(saveAt(config.capitals.晋),jz),[]);
  assert.deepEqual(P.mapRoutes(saveAt(jz),config.capitals.晋),[]);
});
test('江州↔每个国别落点天数相等（含五原中立边陲、秦截断60），且等于江州表值', () => {
  const jz='liuchao.location.jiangzhou', table=config.destinationRawDays[jz];
  const targets=Object.entries(config.destinations).filter(([c])=>c!=='晋').flatMap(([c,ids])=>ids.map(id=>[c,id]));
  assert.ok(targets.some(([,id])=>id===config.capitals.中立边陲));
  for (const [country,id] of targets) {
    const go=P.mapRoutes(saveAt(jz),id)[0], back=P.mapRoutes(saveAt(id),jz)[0];
    assert.equal(go.dayCost,back.dayCost,id);
    assert.equal(go.dayCost,Math.min(table[country],config.dayCap),id);
    assert.equal(go.id,`xc:晋:${country}`,id);
  }
  assert.equal(P.mapRoutes(saveAt(jz),config.capitals.秦)[0].dayCost,60);
  assert.equal(P.mapRoutes(saveAt(jz),config.capitals.中立边陲)[0].dayCost,59);
});
test('落点配置与总表国别一致', () => {
  for (const [country,ids] of Object.entries(config.destinations)) for (const id of ids) assert.equal(P.countryOf(id),country,id);
  for (const [id,row] of Object.entries(config.destinationRawDays)) {
    assert.ok(Object.values(config.destinations).flat().includes(id),id);
    assert.equal(row[P.countryOf(id)],undefined);
    for (const c of Object.keys(row)) assert.ok(config.capitals[c],c);
  }
});
for (const [from,to] of [
  [config.capitals.宋,'liuchao.location.linchuan'],
  [config.capitals.晋,'lcq.location.roman_camp'],
  ['lcq.location.roman_camp',config.capitals.晋],
  [config.capitals.晋,'liuchao.location.qingzhou'],
  ['unknown',config.capitals.晋], [config.capitals.晋,'unknown'],
]) test(`拒绝非法跨国 ${from}→${to}`, () => {
  const s=saveAt(from),before=structuredClone(s);
  assert.equal(P.selectMapTravel(s,to),undefined);
  assert.equal(P.settleMapTravel(s,{source:'map',actionId:'forged',fromId:from,toId:to,routeId:`xc:${P.countryOf(from)}:${P.countryOf(to)}`}),false);
  assert.deepEqual(s,before);
});
test('国内无国别回退，作者国内路线与解锁条件不变', () => {
  const s=saveAt(config.capitals.晋),target='liuchao.location.linchuan';
  assert.equal(P.selectMapTravel(s,target),undefined);
  CONTENT_PACKS.mapRoutes.push({id:'test.domestic',fromId:config.capitals.晋,toId:target,dayCost:2,unlockWhen:['open']});
  try {
    assert.equal(P.selectMapTravel(s,target),undefined);
    s.世界.状态.剧本模组.completedEventIds.push('open');
    const choice=P.selectMapTravel(s,target),before=gameTimeMinutes(s.元数据.时间);
    assert.equal(choice.routeId,'test.domestic');
    assert.equal(P.settleMapTravel(s,choice),true);
    assert.equal(gameTimeMinutes(s.元数据.时间)-before,2*1440);
  } finally { CONTENT_PACKS.mapRoutes.pop(); }
});
test('咸阳入口门槛不会被国别回退绕过', () => {
  const s=saveAt(config.capitals.晋),before=structuredClone(s);
  assert.equal(P.selectMapTravel(s,config.capitals.秦),undefined);
  assert.equal(P.settleMapTravel(s,{source:'map',actionId:'bypass',fromId:config.capitals.晋,toId:config.capitals.秦,routeId:'xc:晋:秦'}),false);
  assert.deepEqual(s,before);
});
test('过期起点、伪造routeId和模型source拒绝', () => {
  const s=saveAt(config.capitals.晋),choice=P.selectMapTravel(s,config.capitals.唐),before=structuredClone(s);
  for (const patch of [{fromId:config.capitals.宋},{routeId:'xc:宋:唐'},{source:'model'}]) assert.equal(P.settleMapTravel(s,{...choice,...patch}),false);
  assert.deepEqual(s,before);
});
test('晴州归宋：从晴州按宋→晋计52日，晴州本身不是跨国落点', () => {
  assert.equal(P.countryOf('liuchao.location.qingzhou'),'宋');
  const s=saveAt('liuchao.location.qingzhou'),choice=P.selectMapTravel(s,config.capitals.晋),before=gameTimeMinutes(s.元数据.时间);
  assert.equal(choice.routeId,'xc:宋:晋');
  assert.equal(P.settleMapTravel(s,choice),true);
  assert.equal(gameTimeMinutes(s.元数据.时间)-before,52*1440);
});

const { canonicalLocationId } = await loadTs('../src/modules/scenarioMods/travel/locationIds.ts');
const { namedEntity, resolveNamedEntityId } = await loadTs('../src/modules/scenarioMods/namedEntities.ts');
const catalog = JSON.parse(readFileSync(new URL('../mod-kit/entity-catalog/locations.json', import.meta.url)));
for (const [id,days] of [['liuchao.location.jiangzhou',32],['liuchao.location.xingyue_lake',52],['liuchao.location.jinming_zhai',52]]) test(`${id}归晋，到临安${days}日`, () => {
  assert.equal(P.countryOf(id),'晋');
  const save=saveAt(id), before=gameTimeMinutes(save.元数据.时间), choice=P.selectMapTravel(save,config.capitals.宋);
  assert.equal(choice.routeId,'xc:晋:宋');
  assert.equal(P.settleMapTravel(save,choice),true);
  assert.equal(gameTimeMinutes(save.元数据.时间)-before,days*1440);
  const entry=catalog.entries.find(e=>e.id===id);
  for(const d of [entry.definition,...Object.values(entry.stageVariants)])assert.equal(d.country,'晋');
});
test('白龙江口为南荒独立补给点，不是跨国落点',()=>{
  const id='lcq.location.bailongjiang_kou',d=namedEntity('location',id);
  assert.equal(d.country,'南荒');assert.equal(d.continentId,'liuchao.continent.nanhuang');
  assert.equal(d.type,'城池');assert.deepEqual(d.coordinates,{x:1960,y:7080});
  assert.ok(!Object.values(config.capitals).includes(id));
  assert.equal(P.selectMapTravel(saveAt(config.capitals.晋),id),undefined);
});
test('光明观堂合并光明观，九个旧阶段通过别名归宋',()=>{
  const old='liuchao.location.guangming',id='liuchao.location.guang_ming_guan';
  assert.equal(canonicalLocationId(old),id);assert.equal(resolveNamedEntityId('location',old),id);
  assert.equal(resolveNamedEntityId('location','光明观堂'),id);
  assert.equal(P.countryOf(old),'宋');assert.equal(P.countryOf(id),'宋');
  const entry=catalog.entries.find(e=>e.id===id);assert.equal(Object.keys(entry.stageVariants).length,10);
  for(const [stage,d] of Object.entries(entry.stageVariants)){
    assert.equal(d.id,id);assert.equal(d.country,'宋');assert.deepEqual(namedEntity('location',old,stage),d);
  }
});
test('帅帐及旧别名归中立边陲，函谷关汉，江州水香楼保留宋且无坐标',()=>{
  for(const id of ['lcq.location.shuai_zhang','lcq.location.command_tent'])assert.equal(P.countryOf(id),'中立边陲');
  assert.equal(P.countryOf('liuchao.location.hanguguan'),'汉');
  assert.equal(P.countryOf('lcq.location.shuixiang_lou'),'宋');assert.equal(namedEntity('location','lcq.location.shuixiang_lou').coordinates,undefined);
});
test('所有关之外也能获得跨国落点标记（含江州、含五原），按总表坐标且优先去重',()=>{
  const markers=P.withMapCapitalMarkers([]),points=Object.entries(config.destinations).flatMap(([c,ids])=>ids.map(id=>[c,id]));
  assert.equal(markers.length,points.length);
  assert.ok(markers.some(m=>m.id==='liuchao.location.jiangzhou'));
  assert.ok(markers.some(m=>m.id===config.capitals.中立边陲));
  for(const [country,id] of points){
    const marker=markers.find(m=>m.id===id);assert.ok(marker,id);
    assert.equal(marker.country,country);assert.deepEqual(marker.coordinates,namedEntity('location',id).coordinates);
  }
  const flower=markers.find(m=>m.id==='lcq.location.huamiao_village');
  assert.deepEqual(flower.coordinates,{x:1650,y:7470});
  const merged=P.withMapCapitalMarkers([{...flower,coordinates:{x:0,y:0}},{id:'camp',name:'花苗营地',coordinates:flower.coordinates}]);
  assert.equal(merged.filter(m=>m.id===flower.id).length,1);
  assert.ok(merged.indexOf(merged.find(m=>m.id===flower.id))<merged.findIndex(m=>m.id==='camp'));
  const save=saveAt(config.capitals.晋),choice=P.selectMapTravel(save,flower.id);
  assert.ok(choice);assert.equal(P.settleMapTravel(save,choice),true);assert.equal(save.角色.位置.locationId,flower.id);
});
test('builtins/overlays/packs中目标地点及旧id的显式国别与总表一致',async()=>{
  const {readdirSync}=await import('node:fs');
  const expected=new Map();
  for(const id of ['liuchao.location.jiangzhou','liuchao.location.xingyue_lake','liuchao.location.jinming_zhai','liuchao.location.guang_ming_guan','lcq.location.shuai_zhang','liuchao.location.hanguguan']){
    const e=catalog.entries.find(e=>e.id===id);
    for(const key of [e.id,...e.aliases])expected.set(key,e.definition.country);
    for(const d of [e.definition,...Object.values(e.stageVariants)])assert.equal(d.country,e.definition.country);
  }
  function inspect(o,file){if(!o||typeof o!=='object')return;if(expected.has(o.id)&&Object.hasOwn(o,'country'))assert.equal(o.country,expected.get(o.id),`${file}: ${o.id}`);for(const v of Object.values(o))inspect(v,file);}
  function scan(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=new URL(e.name,dir);if(e.isDirectory())scan(new URL(e.name+'/',dir));else if(e.name.endsWith('.json'))inspect(JSON.parse(readFileSync(p)),p.pathname);}}
  for(const dir of ['src/modules/scenarioMods/builtins/data/','mod-kit/canon-authority-overlays/','src/modules/contentPacks/packs/'])scan(new URL('../'+dir,import.meta.url));
});
