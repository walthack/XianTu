import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadTs } from './loadTs.mjs';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('all three player entry forms converge on the same preflight before AI generation', async () => {
  const source = await read('../src/components/dashboard/MainGamePanel.vue');
  assert.match(source, /const judgementAction = composeJudgementAction\(inputText\.value, actionQueueText\)/);
  assert.match(source, /buildLocalJudgementPreflight\(judgementAction, saveData, getNarrativeTurn\(saveData\)\)/);
  assert.match(source, /const selectActionOption[\s\S]*inputText\.value = trimmed/);
  assert.match(source, /行动判定（尚未掷骰）/);
  assert.match(source, /确认并掷骰/);
  assert.match(source, /判定ID=\$\{result\.id\}/);
});

test('split and shared prompt routes forbid model rolls and require new risks to stop at the action gate', async () => {
  const [splitPrompt, textFormats, pipeline, coreModule, businessModule] = await Promise.all([
    read('../src/services/prompts/defaultPrompts.ts'),
    read('../src/utils/prompts/definitions/textFormats.ts'),
    read('../src/utils/AIBidirectionalSystem.ts'),
    loadTs('../src/utils/prompts/definitions/coreRules.ts'),
    loadTs('../src/utils/prompts/definitions/businessRules.ts'),
  ]);
  const coreRules = coreModule.NARRATIVE_PURITY_RULES;
  const businessRules = [
    businessModule.JUDGMENT_TRACEABILITY_RULES,
    businessModule.COMBAT_ALCHEMY_RISK_RULES,
  ].join('\n');
  assert.match(splitPrompt, /NARRATIVE_PURITY_RULES/);
  assert.match(splitPrompt, /COMBAT_ALCHEMY_RISK_RULES/);
  for (const source of [splitPrompt, businessRules, textFormats]) {
    assert.match(source, /本地判定单一权威/);
    assert.match(source, /新生风险|叙事中新生风险/);
    assert.match(source, /禁止.*骰点/);
  }
  assert.doesNotMatch(coreRules, /系统判定〖〗/);
  assert.match(coreRules, /判定由本地引擎独占/);
  assert.match(businessRules, /判定风险演绎边界/);
  assert.doesNotMatch(businessRules, /越阶判定:每差一级判定-20|炼丹炼器难度:凡20/);
  assert.match(pipeline, /stripLegacyJudgementMarkers\(textContent\)/);
  assert.match(pipeline, /stripLegacyJudgementMarkers\([\s\S]*response\.mid_term_memory/);
  assert.match(pipeline, /本回合无本地判定回执/);
});

test('legacy stored markers are explicitly downgraded instead of rendered as authoritative cards', async () => {
  const source = await read('../src/components/common/FormattedText.vue');
  assert.match(source, /旧叙事描述，不计入系统/);
  assert.match(source, /旧叙事判定仅作迁移说明/);
});
