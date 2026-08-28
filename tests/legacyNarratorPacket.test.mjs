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

const PERSONALITY = `[主角性格](可修改)\n默认:正常人(理性/谨慎/讲道理/有底线/不自负不卑微)\n用法:仅在叙事措辞/氛围/选项倾向体现`;

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

test('real s01_01 packet includes 段强, location, and no internal engine language', async () => {
  const {
    compileLegacyNarratorPacket,
    isLegacyPilotPromptWithinBudget,
    LEGACY_NARRATOR_PACKET_BUDGET_BYTES,
    LEGACY_NARRATOR_PROMPT_BUDGET_BYTES,
  } = await loadTs(
    '../src/modules/scenarioMods/legacyNarratorPacket.ts',
  );
  const { save, plan } = await openingPlan();
  const longProfile = `${PROFILE}\n用户管理的叙述者配置：${'甲'.repeat(900)}`;
  const storyPrompt = [
    'renderGuard.reservedFutureTerms=月霜|王哲传功|锦囊',
    'renderGuard.forbiddenTerms=神兵|飞升',
  ].join('\n');
  const compiled = compileLegacyNarratorPacket(save, plan, storyPrompt, longProfile, PERSONALITY);
  assert.ok(compiled.packet.present.includes('段强'), compiled.packet.present.join(','));
  assert.ok(compiled.packet.location, 'packet must carry current location');
  assert.match(compiled.packet.location, /草原|草地/);
  assert.ok(compiled.packet.currentObjective);
  assert.ok(compiled.packet.presentActors.some(actor => actor.name === '段强'));
  assert.ok(compiled.packet.presentActors.some(actor => actor.traits.length > 0 || actor.speechStyle));
  const blob = JSON.stringify(compiled.packet);
  assert.equal(blob.includes('事件完成真值'), false, blob);
  assert.equal(blob.includes('本地引擎落账'), false);
  assert.equal(blob.includes('该动作类型不产生'), false);
  assert.ok(compiled.packet.mustAppear.present.includes('段强'));
  assert.match(compiled.packet.mustAppear.location, /草原|草地/);
  assert.ok(compiled.packet.mustAppear.objective);
  const mustAppearBlob = JSON.stringify(compiled.packet.mustAppear);
  assert.equal(mustAppearBlob.includes('热衷幻想'), false, mustAppearBlob);
  assert.equal(mustAppearBlob.includes('缺乏现实感'), false, mustAppearBlob);
  assert.equal(mustAppearBlob.includes('易恐惧'), false, mustAppearBlob);
  assert.ok(compiled.packet.mustNotAppear.includes('月霜'));
  assert.ok(compiled.packet.mustNotAppear.includes('神兵'));
  assert.ok(compiled.packetBytes <= LEGACY_NARRATOR_PACKET_BUDGET_BYTES, compiled.packetBytes);
  assert.ok(compiled.promptBytes <= LEGACY_NARRATOR_PROMPT_BUDGET_BYTES, compiled.promptBytes);
  assert.equal(isLegacyPilotPromptWithinBudget(compiled), true);
  assert.ok(compiled.systemPrompt.includes('甲'.repeat(900)), 'user-managed narrator profile must not be sliced to 700 chars');
  assert.ok(compiled.systemPrompt.includes('主角性格'));
  assert.doesNotMatch(compiled.systemPrompt, /tavern_commands|assembleNarrativeOnlySystemPrompt|businessRules/);
});

test('default profile can enter the pilot; oversized profile is not truncated and falls back', async () => {
  const {
    compileLegacyNarratorPacket,
    isLegacyPilotPromptWithinBudget,
    LEGACY_NARRATOR_PROMPT_BUDGET_BYTES,
  } = await loadTs('../src/modules/scenarioMods/legacyNarratorPacket.ts');
  const { save, plan } = await openingPlan();
  const storyPrompt = 'renderGuard.forbiddenTerms=神兵\nrenderGuard.reservedFutureTerms=月霜';
  const defaults = compileLegacyNarratorPacket(save, plan, storyPrompt, PROFILE, PERSONALITY);
  assert.equal(isLegacyPilotPromptWithinBudget(defaults), true);
  assert.ok(defaults.promptBytes <= LEGACY_NARRATOR_PROMPT_BUDGET_BYTES, defaults.promptBytes);
  assert.ok(defaults.systemPrompt.includes('[主角性格]'));

  const hugeProfile = `${PROFILE}\n用户配置：${'甲'.repeat(8000)}`;
  const oversized = compileLegacyNarratorPacket(save, plan, storyPrompt, hugeProfile, PERSONALITY);
  assert.ok(oversized.systemPrompt.includes('甲'.repeat(8000)), 'oversized user profile must not be sliced');
  assert.ok(oversized.promptBytes > LEGACY_NARRATOR_PROMPT_BUDGET_BYTES, oversized.promptBytes);
  assert.equal(isLegacyPilotPromptWithinBudget(oversized), false);
});

test('managed Legacy rule overrides make the short pilot fail closed to full Legacy', async () => {
  const {
    findLegacyPilotManagedPromptOverrides,
    isLegacyPilotPromptWithinBudget,
    LEGACY_PILOT_SUBSTITUTED_PROMPT_KEYS,
  } = await loadTs('../src/modules/scenarioMods/legacyNarratorPacket.ts');
  const defaults = Object.fromEntries(LEGACY_PILOT_SUBSTITUTED_PROMPT_KEYS.map(key => [key, `${key}-default`]));
  const unchanged = { ...defaults };
  assert.deepEqual(findLegacyPilotManagedPromptOverrides(unchanged, defaults), []);
  assert.equal(isLegacyPilotPromptWithinBudget({
    promptBytes: 100,
    packetBytes: 100,
    managedPromptCompatible: true,
  }), true);

  const customized = { ...defaults, worldStandards: '玩家自定义世界规则' };
  assert.deepEqual(findLegacyPilotManagedPromptOverrides(customized, defaults), ['worldStandards']);
  assert.equal(isLegacyPilotPromptWithinBudget({
    promptBytes: 100,
    packetBytes: 100,
    managedPromptCompatible: false,
  }), false);

  const disabled = { ...defaults, eventSystemRules: '' };
  assert.deepEqual(findLegacyPilotManagedPromptOverrides(disabled, defaults), ['eventSystemRules']);
});

test('empty capsule is valid for a cold first action and still keeps 段强', async () => {
  const { readLocalMemoryCapsule } = await loadTs('../src/modules/scenarioMods/legacyNarratorPacket.ts');
  const { save, selection } = await openingPlan();
  save.社交.记忆.短期记忆 = [];
  save.社交.记忆.长期记忆 = ['不该进胶囊的全量记忆'];
  const capsule = readLocalMemoryCapsule(save, selection);
  assert.equal(capsule.eventId, 'lcq.event.s01_01');
  assert.equal(capsule.recentNarrative, '');
  assert.ok(capsule.presentNames.includes('段强'));
  assert.equal(JSON.stringify(capsule).includes('不该进胶囊的全量记忆'), false);
  assert.equal(JSON.stringify(capsule).includes('事件完成真值'), false);
});

test('acquaintance ledger is runtime.acquaintances, with actorEngine only as fallback', async () => {
  const { readLocalMemoryCapsule } = await loadTs('../src/modules/scenarioMods/legacyNarratorPacket.ts');
  const { save, selection } = await openingPlan();
  const runtime = save.世界.状态.剧本模组;
  runtime.actorEngine = { acquaintance: {} };
  const fromPrimary = readLocalMemoryCapsule(save, selection);
  assert.ok(fromPrimary.presentNames.includes('段强'));

  const saved = runtime.acquaintances;
  runtime.acquaintances = {};
  runtime.actorEngine.acquaintance = saved;
  const fromFallback = readLocalMemoryCapsule(save, selection);
  assert.ok(fromFallback.presentNames.includes('段强'));
});
