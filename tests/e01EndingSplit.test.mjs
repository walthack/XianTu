import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadTs} from './loadTs.mjs';
const ep=await loadTs('../src/modules/scenarioMods/endingPresentation.ts');
const fixed=await loadTs('../src/modules/scenarioMods/fixedEndingNarratives.ts');
const cat=await loadTs('../src/modules/scenarioMods/entityCatalog.ts');
test('E01 and E03 have distinct direct id narratives and image bindings',()=>{
 const e01={endingId:'lcq.ending.death.baihu_beheading',sourceEventId:'anything'};
 const e03={endingId:'lcq.ending.death.paolao',sourceEventId:'lcq.event.sudaji_south_pact'};
 assert.match(fixed.fixedEndingNarrative(e01),/产地不可信.*凝羽.*闷响/);
 assert.doesNotMatch(fixed.fixedEndingNarrative(e01),/炮烙|铜柱/);
 assert.match(fixed.fixedEndingNarrative(e03),/铜柱/);
 assert.equal(ep.endingPresentation(e01).image,null);
 assert.equal(ep.endingPresentation(e03).image,'E03.jpg');
});
test('legacy shared id aliases only the old E01 and clears obsolete image',()=>{
 const old={endingId:'lcq.ending.death.paolao',sourceEventId:'lcq.event.ningyu_enters_gamble',title:'炮烙',presentation:{image:'E01.jpg'}};
 assert.equal(ep.migrateLegacyE01Ending(old),true);
 assert.equal(old.endingId,'lcq.ending.death.baihu_beheading');assert.equal(old.title,'第六个');assert.equal(old.presentation.image,null);
 assert.equal(ep.migrateLegacyE01Ending(old),false);
 const e03={endingId:'lcq.ending.death.paolao',sourceEventId:'lcq.event.sudaji_south_pact'};
 assert.equal(ep.migrateLegacyE01Ending(e03),false);assert.equal(e03.endingId,'lcq.ending.death.paolao');
 assert.equal(fixed.fixedEndingNarrative({endingId:'lcq.ending.death.paolao',sourceEventId:'lcq.event.ningyu_enters_gamble'}),fixed.fixedEndingNarrative(old));
});
test('crossing nylon ownership remains; algae receipt grants a different catalog item',async()=>{
 assert.match(cat.catalogItem('lcq.item.np012').description,/穿越.*随身/);
 const lines=JSON.parse(await readFile(new URL('../mod-kit/quest-lines/lines.json',import.meta.url),'utf8'));
 const raw=JSON.stringify(lines);assert.match(raw,/lcq.item.biling_algae_sample/);assert.doesNotMatch(raw,/lcq.item.np012/);
 assert.equal(cat.catalogItem('lcq.item.biling_algae_sample').storyItem,true);
});
