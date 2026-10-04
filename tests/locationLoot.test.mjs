import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './loadTs.mjs';
const { settleLocationLoot, QINGYU_LOOT_TABLE, isLocationLootInput } = await loadTs('../src/modules/scenarioMods/locationLoot.ts');
const { settleScenarioInventoryTransfers } = await loadTs('../src/modules/scenarioMods/inventoryTransactions.ts');
function save() { return { 元数据: { 创建时间: '2026-10-04' }, 角色: { 身份: { 名字: '程宗扬' }, 位置: { 描述: '中州·五原' }, 背包: { 物品: {}, 货币: {} } }, 世界: { 状态: { 剧本模组: { modId: 'lcq.stage_02', worldTurn: 1, completedEventIds: [], canon: { locations: [{id:'liuchao.location.wuyuan',name:'五原',region:'中州'}], items: ['key','food','rare','rare2'].map(id => ({id:'item.'+id,name:id,type:'other',grade:'凡品'})) } } } } }; }
const rt = s => s.世界.状态.剧本模组;
function table(entries=[], rules={}) { return {version:1, rules:{ maxSearches:3,commonSlots:[.65,.25],rareChance:.03,largeCurrencyChance:.02,maxCopperPerSearch:80,...rules },locations:{'liuchao.location.wuyuan':{name:'五原',status:'ready',entries}}}; }
const key={id:'key',itemId:'item.key',category:'key',quantity:[1,1]};
test('approved defaults and canonical pending tables consume no attempt or seed', () => {
 const s=save();assert.deepEqual(QINGYU_LOOT_TABLE.rules,{maxSearches:3,commonSlots:[.65,.25],rareChance:.03,largeCurrencyChance:.02,maxCopperPerSearch:80});
 assert.equal(Object.values(QINGYU_LOOT_TABLE.locations).filter(l=>l.status==='ready').length,15);
 assert.ok(Object.values(QINGYU_LOOT_TABLE.locations).filter(l=>l.status==='pending').every(l=>l.entries.length===0));
 assert.equal(settleLocationLoot(s).status,'pending');assert.equal(rt(s).locationLoot,undefined);
 assert.equal(isLocationLootInput('我搜刮这里'),true);assert.equal(isLocationLootInput('我搜查蛇彝长屋'),false);
});
test('seeded clone replay is stable; one turn cannot reroll and the fourth search is refused', () => {
 const a=save(), b=structuredClone(a), t=table([{id:'food',itemId:'item.food',category:'common',quantity:[1,4]}]);
 assert.deepEqual(settleLocationLoot(a,t).receipt,settleLocationLoot(b,t).receipt);
 assert.equal(settleLocationLoot(a,t).status,'replay');assert.equal(rt(a).locationLoot.searches['liuchao.location.wuyuan'],1);
 rt(a).worldTurn++;settleLocationLoot(a,t);rt(a).worldTurn++;settleLocationLoot(a,t);rt(a).worldTurn++;
 assert.equal(settleLocationLoot(a,t).status,'exhausted');assert.equal(rt(a).locationLoot.receipts.length,3);
});
test('critical item is once globally and shares authorization with existing contract transfers', () => {
 const s=save(),t=table([key]);settleLocationLoot(s,t);rt(s).worldTurn++;assert.equal(settleLocationLoot(s,t).receipt.drops.length,0);
 assert.equal(s.角色.背包.物品['item.key'].数量,1);
 assert.equal(settleScenarioInventoryTransfers(s,rt(s),{inventoryTransfers:[{transferId:'contract.key',itemId:'item.key',quantity:1}]},{eventId:'event',actionId:'take',outcome:'success'}).length,0);
 const prior=save();settleScenarioInventoryTransfers(prior,rt(prior),{inventoryTransfers:[{transferId:'contract.key',itemId:'item.key',quantity:1}]},{eventId:'event',actionId:'take',outcome:'success'});
 assert.equal(settleLocationLoot(prior,t).receipt.drops.length,0);
});
test('rare and large slots each yield at most one; ordinary currency is capped in copper equivalents', () => {
 const s=save(),t=table([{id:'cash',category:'currency',currency:'铜铢',quantity:[70,70]},{id:'large',category:'currency',currency:'铜铢',large:true,quantity:[500,500]},...['rare','rare2'].map(id=>({id,itemId:'item.'+id,category:'rare',quantity:[1,1]}))],{commonSlots:[1,1],rareChance:1,largeCurrencyChance:1});
 const receipt=settleLocationLoot(s,t).receipt;
 assert.equal(receipt.drops.filter(d=>d.itemId?.startsWith('item.rare')).length,1);
 assert.equal(receipt.drops.filter(d=>d.entryId==='large').length,1);
 assert.equal(s.角色.背包.货币.铜铢.数量,80);
});
test('prerequisites, unregistered off-list items and malformed quantities cannot grant', () => {
 const s=save();assert.equal(settleLocationLoot(s,table([{...key,afterEventIds:['not.done']},{id:'fake',itemId:'not.registered',category:'rare',quantity:[1,1]}])).receipt.drops.length,0);
 const bad=save();assert.throws(()=>settleLocationLoot(bad,table([{...key,quantity:[2,1]}])));assert.deepEqual(bad.角色.背包.物品,{});assert.equal(rt(bad).locationLoot,undefined);
});

test('historical travel completions authorize loot after current-stage progress clears; old archives remain safe', () => {
 const t=table([{...key,afterEventIds:['past.event']}]), s=save();
 rt(s).travelLedger={doneEventIds:['past.event']};
 assert.equal(rt(s).completedEventIds.length,0);
 assert.equal(settleLocationLoot(s,t).receipt.drops[0].itemId,'item.key');
 const old=save();assert.equal(settleLocationLoot(old,t).receipt.drops.length,0);
});
test('ready empty deep well gives no-find receipt and consumes three searches, never pending', () => {
 const s=save(), id='liuchao.location.gui_wang_gong.jingshen_tai';
 s.角色.位置.描述='南荒·深井祭台';rt(s).canon.locations=[{id,name:'深井祭台',region:'南荒'}];
 for(let i=0;i<3;i++) { rt(s).worldTurn++;const r=settleLocationLoot(s);assert.equal(r.status,'settled');assert.match(r.text,/没有找到/);assert.equal(r.receipt.drops.length,0); }
 rt(s).worldTurn++;assert.equal(settleLocationLoot(s).status,'exhausted');
});
