// fee4 B4：气血打到保底值即算倒下（F14 等 partyDowned 判负，不靠拍数兜底）；F12/F03 普通命中只扣气血，重击才挂外伤。
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {loadTs} from './loadTs.mjs';
const wb=await loadTs('../src/modules/sceneModule/host/writeback.ts');const st=await loadTs('../src/modules/sceneModule/statuses.ts');
const N=JSON.parse(readFileSync(new URL('../mod-kit/numbers-combat.json',import.meta.url),'utf8')).combat.woundRules;
const contract={meta:{id:'combat.f14.dragon_god'},parties:[{id:'pc',player:true,side:'ally'},{id:'foe',side:'foe'}],statusDefs:[]};
const mk=(cur,max,loss)=>({save:{角色:{属性:{气血:{当前:cur,上限:max}}},世界:{状态:{剧本模组:{}}}},state:{statuses:{},hpLoss:{pc:loss}}});
test('配置：F14 打开气血保底即倒下；其余合同（F03 待重做）不受影响', () => { assert.ok(N.hp.downedAtKeepContracts.includes('combat.f14.dragon_god')); assert.equal(typeof N.hp.keepHp,'number');
  const other={...contract,meta:{id:'combat.f03.mountain_stream_fog'}},o=mk(10,100,0.5);wb.applySceneHpLoss(o.save,other,o.state);assert.equal(o.state.hpDowned,undefined); });
test('气血被打到保底值 → 记倒下；没到保底不记', () => {
  const a=mk(10,100,0.5);wb.applySceneHpLoss(a.save,contract,a.state);
  assert.equal(a.save.角色.属性.气血.当前,N.hp.keepHp);assert.equal(a.state.hpDowned?.pc,true);
  assert.equal(st.isDowned(a.state,contract,undefined,'pc'),true);
  const b=mk(100,100,0.1);wb.applySceneHpLoss(b.save,contract,b.state);
  assert.equal(b.state.hpDowned?.pc,undefined);assert.equal(st.isDowned(b.state,contract,undefined,'pc'),false);
  const c=mk(N.hp.keepHp,100,0.1);wb.applySceneHpLoss(c.save,contract,c.state);assert.equal(c.state.hpDowned?.pc,true,'已在保底再挨打也算倒下');
});
test('F12（f10 合同）敌方普通动作改走 default 伤势规则（部位保留）；F03 pressing 普通命中不挂伤', () => {
  const f10=JSON.parse(readFileSync(new URL('../src/modules/sceneModule/contracts/f10.json',import.meta.url),'utf8'));
  for(const id of ['dan_chen_bite','ghost_feather_sword','axe_from_behind']){const a=f10.enemyActions.find(x=>x.id===id);
    assert.equal(a.woundRule,'default',id);assert.deepEqual(a.onHit.statuses,[],id);assert.ok(a.woundParams?.bodyPart,id);}
  for(const p of ['default','pressing']){assert.equal(N.profiles[p].tiers.success.chance,0,p);assert.ok(N.profiles[p].tiers.success.hpLossRatio>0,p);assert.equal(N.profiles[p].tiers.great_success.status,'wound.external',p);}
});
