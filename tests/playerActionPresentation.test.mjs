import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

test('scoped player lines are first-person, distinct, and do not leak author notes or compass', async () => {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const { overlayQingyuStage02Opening } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const { createQingyuOpeningPlaytestSave } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const { getCurrentStoryEventActions, advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const presentation = await loadTs('../src/modules/scenarioMods/playerActionPresentation.ts');
  const stage01 = parseScenarioMod(JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_01.json', import.meta.url), 'utf8')));
  let save = createQingyuOpeningPlaytestSave(stage01);
  save = advanceScenarioRuntime(save).saveData;
  const opening = getCurrentStoryEventActions(save).find(item => item.eventId === 'lcq.event.s01_01');
  assert.ok(opening);
  assert.equal(opening.playerLine.replace(/。$/, ''), '我稳住自己并弄清身在何处');
  assert.match(opening.playerLine, /^我稳住自己并弄清身在何处/);
  assert.equal(opening.actionText.startsWith('我按当前主线目标行动'), true);
  assert.equal(presentation.playerLineLeaksAuthorNotes(opening.playerLine), false);

  const stage02 = overlayQingyuStage02Opening(parseScenarioMod(JSON.parse(await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_02.json', import.meta.url), 'utf8'))));
  const fee = stage02.scenario.events.find(item => item.id === 'lcq.event.charge_sudaji_fee');
  const hashBefore = JSON.stringify(fee.playerCompletionContract);
  const named = presentation.lookupScopedPlayerLine('lcq.event.charge_sudaji_fee', 'name_sixty_zhu_before_help');
  const locked = presentation.lookupScopedPlayerLine('lcq.event.charge_sudaji_fee', 'lock_fee_then_remove_device');
  assert.notEqual(named, locked);
  assert.equal(presentation.playerLineLeaksAuthorNotes(named), false);
  assert.equal(presentation.playerLineLeaksAuthorNotes(locked), false);
  assert.equal(locked.includes('不把这拍写成'), false);
  assert.equal(JSON.stringify(fee.playerCompletionContract), hashBefore);

  assert.match(presentation.lookupScopedPlayerLine('lcq.event.gamble_bond_signed', 'sign_the_bond'), /签下/);
  assert.equal(presentation.lookupScopedPlayerLine('lcq.event.gamble_bond_signed', 'sign_the_bond').includes('做出回应'), false);
  assert.equal(presentation.lookupScopedPlayerLine('lcq.event.sudaji_south_pact', 'refuse_term_take_paolao').includes('炮烙'), false);
  assert.equal(presentation.lookupScopedPlayerLine('lcq.event.s02_02', 'witness_wang_zhe_nine_suns').includes('见证'), false);
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../src/modules/scenarioMods/playerActionPresentation.ts', import.meta.url), 'utf8'));
  assert.equal(/我\$\{trimmed/.test(source), false);
});
