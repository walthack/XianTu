import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const ON = { getItem: key => (key === 'xiantu.legacyNarrativePilot.s01_01.v1' ? 'true' : null) };

const PROFILE = `# Legacy narrative-only 响应合同（实验）

- 只输出可直接展示的中文叙事正文，不要 JSON、Markdown、行动选项、记忆摘要、系统说明或数据命令。
- 正文目标 800–1000 字，硬上限 1000 字；用动作、感官与人物反应推进，不复述规则和玩家输入。
- 本回合行动与结果已经由本地结构化合同确定。只演出提示中明确给出的既定动作、反馈和当前公开事实；不得重新判定、掷骰或追加伤势、物品、能力、位置移动、人物死亡、关系终态及事件完成声明。
- 新生风险只能呈现到玩家需要再次选择的位置；不得替玩家继续行动。
- 必须保持第二人称，并让结尾自然交还玩家行动权。`;

async function openingPlan() {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const { createQingyuOpeningPlaytestSave } = await loadTs('../src/modules/scenarioMods/qingyuOpeningPlaytest.ts');
  const { getCurrentStoryEventActions } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { planLegacyNarrativePilot } = await loadTs('../src/modules/scenarioMods/legacyNarrativePilot.ts');
  const raw = await readFile(new URL('../src/modules/scenarioMods/builtins/data/lcq.stage_01.json', import.meta.url), 'utf8');
  const save = createQingyuOpeningPlaytestSave(parseScenarioMod(JSON.parse(raw)));
  const selection = getCurrentStoryEventActions(save).find(item => item.eventId === 'lcq.event.s01_01');
  const plan = planLegacyNarrativePilot({
    saveData: save,
    eventAction: selection,
    eventActionProvenance: 'selected',
    storage: ON,
  });
  assert.ok(plan);
  return { save, selection, plan };
}

test('s01_01 Render Packet stays at or under 6KB and carries local facts only', async () => {
  const { compileLegacyNarratorPacket, LEGACY_NARRATOR_PACKET_BUDGET_BYTES } = await loadTs(
    '../src/modules/scenarioMods/legacyNarratorPacket.ts',
  );
  const { save, plan } = await openingPlan();
  save.社交.记忆.短期记忆 = ['甲'.repeat(4000)];
  const storyPrompt = [
    'renderGuard.reservedFutureTerms=月霜|王哲传功|锦囊',
    'renderGuard.forbiddenTerms=神兵|飞升',
  ].join('\n');
  const compiled = compileLegacyNarratorPacket(save, plan, storyPrompt, PROFILE);
  assert.ok(compiled.promptBytes <= LEGACY_NARRATOR_PACKET_BUDGET_BYTES, compiled.promptBytes);
  assert.equal(compiled.packet.action, plan.playerLine);
  assert.equal(compiled.packet.settledOutcome, plan.outcomeText);
  assert.ok(compiled.packet.mustAppear.includes(plan.playerLine));
  assert.ok(compiled.packet.mustNotAppear.includes('月霜'));
  assert.ok(compiled.packet.mustNotAppear.includes('神兵'));
  assert.doesNotMatch(compiled.systemPrompt, /tavern_commands|assembleNarrativeOnlySystemPrompt|businessRules/);
  assert.match(compiled.systemPrompt, /不得输出 JSON、命令/);
  assert.ok(compiled.packet.recentNarrative.length <= 500);
});

test('empty capsule is valid for a cold first action', async () => {
  const { readLocalMemoryCapsule } = await loadTs('../src/modules/scenarioMods/legacyNarratorPacket.ts');
  const { save, selection } = await openingPlan();
  save.社交.记忆.短期记忆 = [];
  save.社交.记忆.长期记忆 = ['不该进胶囊的全量记忆'];
  const capsule = readLocalMemoryCapsule(save, selection);
  assert.equal(capsule.eventId, 'lcq.event.s01_01');
  assert.equal(capsule.recentNarrative, '');
  assert.equal(JSON.stringify(capsule).includes('不该进胶囊的全量记忆'), false);
});
