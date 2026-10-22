// 诗薇莫补卡进入受版本控制的补卡源，重新生成总表不会丢。
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const sup=JSON.parse(readFileSync(new URL('../mod-kit/character-registry-supplements.json',import.meta.url),'utf8'));
const reg=JSON.parse(readFileSync(new URL('../src/modules/scenarioMods/builtins/character-registry.json',import.meta.url),'utf8'));
const script=readFileSync(new URL('../scripts/build-character-registry.mjs',import.meta.url),'utf8');
test('补卡源含诗薇莫，总表里同 id 同内容，生成脚本读补卡源', () => {
  const c=sup.characters.find(x=>x.id==='lcq.character.nanhuang_shiweimo');assert.equal(c.canonicalName,'诗薇莫');
  assert.deepEqual(reg.characters.find(x=>x.id===c.id),c);
  assert.equal(reg.characters.some(x=>x.id==='lcq.character.nanhuang_ayan'),false);
  assert.match(script,/character-registry-supplements\.json/);
});
test('a1e9ba66 直接追加的阿伶/红苗族长与武二郎摘要进补卡源：总表同 id 同内容，覆盖只动指定字段', () => {
  for(const id of ['lcq.character.nanhuang_aling','lcq.character.nanhuang_hongmiao_chief'])assert.deepEqual(reg.characters.find(x=>x.id===id),sup.characters.find(x=>x.id===id));
  assert.deepEqual(reg.characters.slice(-sup.characters.length).map(x=>x.id),sup.characters.map(x=>x.id));
  const o=sup.overrides.find(x=>x.id==='liuchao.character.wu_er_lang');assert.ok(o);
  const w=reg.characters.find(x=>x.id===o.id);for(const[k,v]of Object.entries(o.staticProfile))assert.deepEqual(w.staticProfile[k],v,k);
  assert.match(script,/sup\.overrides/);
});
