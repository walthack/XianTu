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
