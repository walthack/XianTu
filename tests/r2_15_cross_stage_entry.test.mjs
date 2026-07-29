import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const fixtureUrl = new URL('./fixtures/scenario-mod/minimal.json', import.meta.url);
const mainPanelUrl = new URL('../src/components/dashboard/MainGamePanel.vue', import.meta.url);
const aiSystemUrl = new URL('../src/utils/AIBidirectionalSystem.ts', import.meta.url);

test('stage transition immediately replaces the old reading surface with the target opening', async () => {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const {
    applyStrictScenarioInitializationToSave,
    buildStrictScenarioInitialization,
    transitionToNextScenarioStage,
  } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const {
    acknowledgeStageEntryPresentation,
    getStageEntryPresentation,
  } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');

  const raw = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  raw.manifest.id = 'liuchao.stage.before';
  raw.manifest.name = '旧关·送别';
  raw.manifest.nextStageId = 'liuchao.stage.after';
  const oldMod = parseScenarioMod(raw);
  const nextRaw = structuredClone(raw);
  nextRaw.manifest.id = 'liuchao.stage.after';
  nextRaw.manifest.name = '新关·来路';
  nextRaw.manifest.prevStageId = oldMod.manifest.id;
  nextRaw.manifest.nextStageId = null;
  nextRaw.scenario.opening.text = '山路尽头传来急促马蹄声，同行者停步辨认来人。';
  const nextMod = parseScenarioMod(nextRaw);

  let save = applyStrictScenarioInitializationToSave(
    {
      角色: { 位置: { 描述: '旧地' } },
      社交: { 关系: {}, 记忆: { 短期记忆: ['【旧时】上一关最后的送别。'], 中期记忆: [], 长期记忆: [], 隐式中期记忆: [] } },
      世界: { 信息: {}, 状态: {} },
      系统: { 扩展: {}, 历史: { 叙事: [{ type: 'gm', content: '上一关最后的送别。', actionOptions: ['旧选项'] }] } },
    },
    buildStrictScenarioInitialization(oldMod, '2026-07-29T00:00:00.000Z'),
  );
  save.世界.状态.剧本模组.nextStageReadyId = nextMod.manifest.id;

  const result = transitionToNextScenarioStage(save, [nextMod]);
  assert.equal(result.ok, true, result.reason);
  const reloaded = JSON.parse(JSON.stringify(result.saveData));
  assert.deepEqual(getStageEntryPresentation(reloaded), {
    fromStageId: 'liuchao.stage.before',
    fromStageName: '旧关·送别',
    toStageId: 'liuchao.stage.after',
    toStageName: '新关·来路',
    enteredAtTurn: reloaded.世界.状态.剧本模组.worldTurn,
    text: nextRaw.scenario.opening.text,
  });
  assert.equal(reloaded.系统.历史.叙事.at(-1).content, '上一关最后的送别。', '切关展示不伪造叙事历史');
  assert.equal(reloaded.社交.记忆.短期记忆.at(-1), '【旧时】上一关最后的送别。', '切关展示不污染记忆');

  const prompt = buildScenarioStoryPrompt(reloaded);
  assert.match(prompt, /跨关落点·只演出不改真值/);
  assert.match(prompt, /山路尽头传来急促马蹄声/);
  assert.match(prompt, /不得复演上一关收束/);
  assert.doesNotMatch(prompt, /liuchao\.stage\.before|liuchao\.stage\.after/);

  assert.equal(acknowledgeStageEntryPresentation(reloaded, 'stale.stage'), false);
  assert.ok(getStageEntryPresentation(reloaded), '陈旧响应不得清除新关落点');
  assert.equal(acknowledgeStageEntryPresentation(reloaded, 'liuchao.stage.after'), true);
  assert.equal(getStageEntryPresentation(reloaded), null);
  assert.doesNotMatch(buildScenarioStoryPrompt(reloaded), /跨关落点·只演出不改真值/);
});

test('main pane prioritizes the stage entry and the first committed narrative consumes it', async () => {
  const [panelSource, aiSource] = await Promise.all([
    readFile(mainPanelUrl, 'utf8'),
    readFile(aiSystemUrl, 'utf8'),
  ]);

  assert.match(panelSource, /getStageEntryPresentation\(save\)/);
  assert.match(panelSource, /type:\s*'stage_entry'/);
  assert.match(panelSource, /actionOptions:\s*\[\]/);
  assert.match(panelSource, /旅途新章/);
  assert.match(aiSource, /stageEntryTargetBefore/);
  assert.match(aiSource, /acknowledgeStageEntryPresentation\(saveData,\s*stageEntryTargetBefore\)/);
});
