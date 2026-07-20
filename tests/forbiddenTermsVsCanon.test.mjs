import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadTs } from './loadTs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stagePath = path.join(root, 'src/modules/scenarioMods/builtins/data/lyg.dingtao_beijing.json');

function eventCore(stage, eventId) {
  const event = stage.scenario.events.find(item => item.id === eventId);
  assert.ok(event?.worldActor?.decisionCore, `missing decision core for ${eventId}`);
  return event.worldActor.decisionCore;
}

function guardPrompt(guard) {
  return `renderGuard.forbiddenTerms=${(guard.forbiddenTerms || []).join('|')}；`
    + `renderGuard.forbiddenAssociations=${JSON.stringify(guard.forbiddenAssociations || [])}；`
    + `renderGuard.rejectConcreteQuantities=${guard.rejectConcreteQuantities === true}；`
    + `renderGuard.allowUnverifiedQuantities=${guard.allowUnverifiedQuantities === true}。`;
}

test('adjudicated known names are allowed while their unrevealed propositions remain guarded', async () => {
  const stage = JSON.parse(fs.readFileSync(stagePath, 'utf8'));
  const { validateNarrativePerformance } = await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');
  const expectations = [
    ['lyg.event.s01_05', ['阮香凝', '吕冀']],
    ['lyg.event.s01_06', ['阮香凝', '吕冀']],
    ['lyg.event.s01_07', ['阮香凝', '黑魔海']],
  ];

  for (const [eventId, allowedNames] of expectations) {
    const guard = eventCore(stage, eventId).narrativeGuard;
    for (const name of allowedNames) {
      assert.equal(guard.forbiddenTerms.includes(name), false, `${eventId} must not blacklist ${name}`);
      assert.equal(
        validateNarrativePerformance(`${name}正在殿外等候消息。`, '继续', guardPrompt(guard)).valid,
        true,
        `${eventId} should allow an ordinary mention of ${name}`,
      );
    }
    assert.equal(
      validateNarrativePerformance('阮香凝就是黑魔海的凝玉姬。', '继续', guardPrompt(guard)).valid,
      false,
      `${eventId} must still block Ruan's unrevealed identity`,
    );
  }

  const s05Guard = eventCore(stage, 'lyg.event.s01_05').narrativeGuard;
  assert.equal(
    validateNarrativePerformance('吕冀理应为旧事接受问罪。', '继续', guardPrompt(s05Guard)).valid,
    true,
    'an opinion about accountability is not the protected future outcome',
  );
  assert.equal(
    validateNarrativePerformance('宫中已经决定赐死吕冀。', '继续', guardPrompt(s05Guard)).valid,
    false,
    'the unrevealed execution outcome remains protected',
  );
});

test('canon-name audit is advisory even when invoked with a legacy --fail argument', () => {
  const result = spawnSync(process.execPath, [
    path.join(root, 'scripts/audit-forbidden-terms-vs-canon.mjs'),
    '--fail',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('minimal player knowledge ledger survives initialization and is projected into the render boundary', async () => {
  const raw = JSON.parse(fs.readFileSync(stagePath, 'utf8'));
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const {
    applyStrictScenarioInitializationToSave,
    buildStrictScenarioInitialization,
  } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const mod = parseScenarioMod(raw);
  const initialized = applyStrictScenarioInitializationToSave({
    角色: { 位置: { 描述: '长秋宫外' } },
    世界: { 信息: {}, 状态: {} },
    系统: { 扩展: {} },
  }, buildStrictScenarioInitialization(mod, '2026-07-21T00:00:00.000Z'));
  const save = advanceScenarioRuntime(initialized).saveData;
  const runtime = save.世界.状态.剧本模组;

  assert.equal(runtime.playerKnowledge['knowledge.player.entity.ruan_xiang_ning'].status, 'confirmed');
  assert.equal(runtime.playerKnowledge['knowledge.player.entity.lv_ji'].sourceEventId, 'lyg.event.s01_04');
  assert.equal(runtime.playerKnowledge['knowledge.player.entity.hei_mo_hai'].disclosureScope, 'player');

  const prompt = buildScenarioStoryPrompt(save);
  assert.match(prompt, /玩家知识账本=.*阮香凝\.known\[confirmed\/player@0\]/);
  assert.match(prompt, /黑魔海\.known\[confirmed\/player@0\]/);
  assert.doesNotMatch(prompt, /renderGuard\.forbiddenTerms=[^；]*(?:阮香凝|吕冀|黑魔海)/);
  assert.match(prompt, /renderGuard\.forbiddenAssociations=.*阮香凝.*凝玉姬/);
});
