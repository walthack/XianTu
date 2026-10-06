import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadTs } from './loadTs.mjs';
const { endingPresentation } = await loadTs('../src/modules/scenarioMods/endingPresentation.ts');
const { BATTLE_LOSS_ENDINGS } = await loadTs('../src/modules/scenarioMods/fixedEndingNarratives.ts');
const table = JSON.parse(await readFile(new URL('../mod-kit/ending-images.qingyu.json', import.meta.url), 'utf8'));
test('all eight endings declare image or explicit null; assigned JPEGs are real bundled assets', async () => {
  assert.deepEqual(Object.keys(table.images).sort(), Array.from({length:8}, (_,i)=>`E0${i+1}`));
  const assetModule = await readFile(new URL('../src/assets/endings/index.ts', import.meta.url), 'utf8');
  for (const image of Object.values(table.images)) {
    if (image === null) continue;
    assert.match(image, /^E0[1-8](?:-v\d+)?\.jpg$/);
    const bytes = await readFile(new URL(`../src/assets/endings/${image}`, import.meta.url));
    assert.equal(bytes.readUInt16BE(0), 0xffd8);
    assert.ok(bytes.length > 1000);
    assert.ok(assetModule.includes(`from './${image}'`), image);
  }
  for (const key of ['E05','E06','E08']) assert.equal(table.images[key], null);
});
test('shared paolao id chooses E01/E03 by event; E07 uses v7 or approved v6 and old saves need no migration', () => {
  assert.equal(endingPresentation({endingId:'lcq.ending.death.paolao',sourceEventId:'lcq.event.ningyu_enters_gamble'}).image, table.images.E01);
  assert.equal(endingPresentation({endingId:'lcq.ending.death.paolao',sourceEventId:'lcq.event.sudaji_south_pact'}).image, table.images.E03);
  assert.match(endingPresentation({endingId:'lcq.ending.death.dragon_well',sourceEventId:'lcq.event.ghost_king_swallowed'}).image, /-v[67]\.jpg$/);
  assert.deepEqual(endingPresentation(undefined), {image:null});
  assert.deepEqual(endingPresentation({endingId:'unknown',sourceEventId:'unknown'}), {image:null});
  assert.equal(BATTLE_LOSS_ENDINGS[1].presentation.image, table.images.E07);
  assert.equal(BATTLE_LOSS_ENDINGS[0].presentation.image, null);
});
