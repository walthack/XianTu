// fee4 B4：气血打到保底值即算倒下（F14 等 partyDowned 判负，不靠拍数兜底）；F12/F03 普通命中只扣气血，重击才挂外伤。
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {loadTs} from './loadTs.mjs';
const wb=await loadTs('../src/modules/sceneModule/host/writeback.ts');const st=await loadTs('../src/modules/sceneModule/statuses.ts');
const N=JSON.parse(readFileSync(new URL('../mod-kit/numbers-combat.json',import.meta.url),'utf8')).combat.woundRules;
const contract={meta:{id:'combat.f14.dragon_god'},parties:[{id:'pc',player:true,side:'ally'},{id:'foe',side:'foe'}],statusDefs:[]};
const mk=(cur,max,loss)=>({save:{角色:{属性:{气血:{当前:cur,上限:max}}},世界:{状态:{剧本模组:{}}}},state:{statuses:{},hpLoss:{pc:loss}}});
test('配置：战斗伤害不保底，打到 combatDownedAt(0) 即倒下，全局（F03 等也算）；keepHp 仍在（只给状态掉血）', () => { assert.equal(N.hp.combatDownedAt,0); assert.equal(N.hp.downedAtKeep,undefined); assert.equal(typeof N.hp.keepHp,'number');
  const other={...contract,meta:{id:'combat.f03.mountain_stream_fog'}},o=mk(10,100,0.5);wb.applySceneHpLoss(o.save,other,o.state);assert.equal(o.state.hpDowned?.pc,true); });
test('模拟器按同一规则扣气血', () => { const src=readFileSync(new URL('../scripts/combat-simulation.mjs',import.meta.url),'utf8'); assert.match(src,/hpDowned/); assert.match(src,/combatDownedAt/); assert.doesNotMatch(src,/Math\.max\(HP_CFG\.keepHp/); });
test('战斗伤害把气血打到 0 → 记倒下（不再停在 keepHp）；没到 0 不记', () => {
  const a=mk(10,100,0.5);wb.applySceneHpLoss(a.save,contract,a.state);
  assert.equal(a.save.角色.属性.气血.当前,0);assert.equal(a.state.hpDowned?.pc,true);
  assert.equal(st.isDowned(a.state,contract,undefined,'pc'),true);
  const b=mk(100,100,0.1);wb.applySceneHpLoss(b.save,contract,b.state);
  assert.equal(b.state.hpDowned?.pc,undefined);assert.equal(st.isDowned(b.state,contract,undefined,'pc'),false);
  const c=mk(N.hp.keepHp,100,0.1);wb.applySceneHpLoss(c.save,contract,c.state);assert.equal(c.save.角色.属性.气血.当前,0);assert.equal(c.state.hpDowned?.pc,true,'1 点气血再挨打即到 0 倒下');
  const d=mk(20,100,0.1);wb.applySceneHpLoss(d.save,contract,d.state);assert.equal(d.save.角色.属性.气血.当前,10);assert.equal(d.state.hpDowned?.pc,undefined,'剩 10 不算倒下（以前保底规则下也不算）');
});
test('F12（f10 合同）敌方普通动作改走 default 伤势规则（部位保留）；F03 pressing 普通命中不挂伤', () => {
  const f10=JSON.parse(readFileSync(new URL('../src/modules/sceneModule/contracts/f10.json',import.meta.url),'utf8'));
  for(const id of ['dan_chen_bite','ghost_feather_sword','axe_from_behind']){const a=f10.enemyActions.find(x=>x.id===id);
    assert.equal(a.woundRule,'default',id);assert.deepEqual(a.onHit.statuses,[],id);assert.ok(a.woundParams?.bodyPart,id);}
  for(const p of ['default','pressing']){assert.equal(N.profiles[p].tiers.success.chance,0,p);assert.ok(N.profiles[p].tiers.success.hpLossRatio>0,p);assert.equal(N.profiles[p].tiers.great_success.status,'wound.external',p);}
});
