import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stage05Url = new URL('../mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_05.json', import.meta.url);
const stage06Url = new URL('../mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_06.json', import.meta.url);
const FACT_ID = 'knowledge.npc.qingyu.biji_xingyuehu_identity';
const CLAIM = '碧姬就是星月湖旧部称作“碧宛”的岳帅姬妾。';
const CUE = '谢艺寻找碧姬并非泛泛寻人';

const baseSave = () => ({
  角色: { 身份: { 名字: '程宗扬' }, 位置: { 描述: '南荒·海神殿' }, 属性: { 声望: 0 } },
  社交: { 关系: {}, 记忆: { 短期记忆: [], 中期记忆: [], 长期记忆: [], 隐式中期记忆: [] } },
  世界: { 信息: {}, 状态: {} },
  系统: { 扩展: {}, 历史: { 叙事: [] } },
});

test('validator accepts the explicit private fact and rejects unknown or player holders', async () => {
  const { validateScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const raw = JSON.parse(await readFile(stage05Url, 'utf8'));
  assert.equal(validateScenarioMod(raw).valid, true);

  const unknown = structuredClone(raw);
  unknown.scenario.initialNpcPrivateKnowledge[0].holderCharacterIds = ['liuchao.character.not_there'];
  assert.equal(validateScenarioMod(unknown).issues.some(issue =>
    issue.path.includes('holderCharacterIds') && issue.code === 'missing_reference'
  ), true);

  const playerHeld = structuredClone(raw);
  playerHeld.scenario.initialNpcPrivateKnowledge[0].holderCharacterIds = [raw.scenario.opening.playerCharacterId];
  assert.equal(validateScenarioMod(playerHeld).issues.some(issue => issue.code === 'invalid_holder'), true);
});

test('private truth is stripped from generic state and only its holder gets a safe cue', async () => {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const {
    applyStrictScenarioInitializationToSave,
    buildStrictScenarioInitialization,
  } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const { buildScenarioStoryPrompt, createScenarioPromptState } =
    await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const { getCurrentStoryEventActions, recordStoryEventStructuredAction } =
    await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { validateNarrativePerformance } =
    await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');
  const { decideNarrativePerformanceAttempt } =
    await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');

  const mod = parseScenarioMod(JSON.parse(await readFile(stage05Url, 'utf8')));
  const save = applyStrictScenarioInitializationToSave(
    baseSave(),
    buildStrictScenarioInitialization(mod, '2026-07-31T00:00:00.000Z'),
  );
  const runtime = save.世界.状态.剧本模组;
  assert.equal(runtime.npcPrivateKnowledge[FACT_ID].claim, CLAIM);
  const promptStateText = JSON.stringify(createScenarioPromptState(save));
  assert.doesNotMatch(promptStateText, /npcPrivateKnowledge|岳帅姬妾|碧宛/);

  const holderPrompt = buildScenarioStoryPrompt(save, '我去找谢艺谈谈。');
  assert.match(holderPrompt, new RegExp(CUE));
  assert.doesNotMatch(holderPrompt, new RegExp(CLAIM));
  assert.match(holderPrompt, /renderGuard\.npcPrivateKnowledge=true/);
  assert.equal(
    validateNarrativePerformance('碧姬果然就是西施，是岳帅姬妾。', '继续', holderPrompt).valid,
    false,
    'an unresolved private association must not be stated as fact',
  );
  assert.equal(
    validateNarrativePerformance('碧姬莫非就是西施？', '继续', holderPrompt).valid,
    true,
    'a player-facing hypothesis remains legal when the rule explicitly allows it',
  );

  const unrelatedPrompt = buildScenarioStoryPrompt(save, '我去找云苍峰谈谈。');
  assert.doesNotMatch(unrelatedPrompt, new RegExp(CUE), 'non-holders receive no private behavior cue');
  assert.doesNotMatch(unrelatedPrompt, new RegExp(CLAIM));

  runtime.activeEventIds = ['lcq.event.s05_13'];
  const [probe] = getCurrentStoryEventActions(save);
  assert.equal(probe.actionId, 'probe_geluo_control_limits');
  assert.equal(recordStoryEventStructuredAction(save, probe).outcome, 'success');
  runtime.worldTurn = (runtime.worldTurn || 0) + 1;
  const [identify] = getCurrentStoryEventActions(save);
  assert.equal(identify.actionId, 'identify_biji_in_person');
  assert.equal(recordStoryEventStructuredAction(save, identify).outcome, 'success');
  assert.equal(
    runtime.playerKnowledge['knowledge.player.qingyu.biji_xingyuehu_identity'].sourceEventId,
    'lcq.event.s05_13',
    'only the deterministic identification action unlocks the matching player fact',
  );
  const revealedPrompt = buildScenarioStoryPrompt(save, '我与谢艺复核碧姬的旧事。');
  assert.match(revealedPrompt, new RegExp(CLAIM));
  assert.match(revealedPrompt, /角色私有知情·玩家已确认·原子事实/);
  assert.match(revealedPrompt, /此 claim 就是该条私有知识的全部已证内容/);
  assert.match(revealedPrompt, /不得补写其成因、时长、地点、经历、来源、相处细节、第三方传闻或其他关系/);
  assert.match(revealedPrompt, /renderGuard\.atomicPrivateClaims=/);
  assert.doesNotMatch(revealedPrompt, /renderGuard\.npcPrivateKnowledge=true/);

  const auditInput = '我请谢艺复核，只说他有证据确定知道的事实。';
  assert.equal(
    validateNarrativePerformance(
      `谢艺答道：“${CLAIM}除此之外，我不知道，也没有证据。”`,
      auditInput,
      revealedPrompt,
    ).valid,
    true,
    'an exact claim plus an explicit uncertainty boundary is allowed',
  );
  assert.equal(
    validateNarrativePerformance(
      `谢艺答道：“${CLAIM}我亲眼见过她穿湖蓝色长裙站在岳帅身后。”`,
      auditInput,
      revealedPrompt,
    ).valid,
    false,
    'an asserted memory outside the atomic claim is rejected',
  );
  assert.equal(
    validateNarrativePerformance(
      '谢艺答道：“碧姬就是碧宛，是岳帅姬妾。其他没有证据。”',
      auditInput,
      revealedPrompt,
    ).valid,
    false,
    'audit mode requires the canonical claim rather than an uncontrolled paraphrase',
  );
  const finalAtomicFallback = decideNarrativePerformanceAttempt(
    `谢艺答道：“${CLAIM}我亲眼见过她穿湖蓝色长裙站在岳帅身后。”`,
    auditInput,
    revealedPrompt,
    2,
    2,
  );
  assert.equal(finalAtomicFallback.shouldRetry, false);
  assert.match(finalAtomicFallback.narrative, new RegExp(CLAIM));
  assert.doesNotMatch(finalAtomicFallback.narrative, /亲眼|湖蓝色|站在岳帅身后/);
  assert.match(finalAtomicFallback.narrative, /其余背景没有证据，无法确认/);

  assert.doesNotMatch(
    unrelatedPrompt,
    /原子事实|全部已证内容|atomicPrivateClaims/,
    'the disclosure boundary is holder-scoped just like the private claim',
  );
});

test('the private ledger survives JSON reload and stage transition without duplication', async () => {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const {
    applyStrictScenarioInitializationToSave,
    buildStrictScenarioInitialization,
    transitionToNextScenarioStage,
  } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const oldMod = parseScenarioMod(JSON.parse(await readFile(stage05Url, 'utf8')));
  const nextMod = parseScenarioMod(JSON.parse(await readFile(stage06Url, 'utf8')));
  nextMod.manifest.id = 'demo.private.stage06';
  let save = applyStrictScenarioInitializationToSave(
    baseSave(),
    buildStrictScenarioInitialization(oldMod, '2026-07-31T00:00:00.000Z'),
  );
  save = JSON.parse(JSON.stringify(save));
  const runtime = save.世界.状态.剧本模组;
  runtime.npcPrivateKnowledge[FACT_ID].learnedAtTurn = 4;
  runtime.nextStageId = nextMod.manifest.id;
  runtime.nextStageReadyId = nextMod.manifest.id;

  const transitioned = transitionToNextScenarioStage(save, [nextMod]);
  assert.equal(transitioned.ok, true, transitioned.reason);
  const ledger = transitioned.saveData.世界.状态.剧本模组.npcPrivateKnowledge;
  assert.deepEqual(Object.keys(ledger), [FACT_ID]);
  assert.equal(ledger[FACT_ID].learnedAtTurn, 4, 'the accumulated record wins over the target-stage seed');
  assert.equal(ledger[FACT_ID].sourceStageId, oldMod.manifest.id);
});

test('LLM commands cannot write the private knowledge ledger', async () => {
  const { validateCommand } = await loadTs('../src/utils/commandValidator.ts');
  const result = validateCommand({
    action: 'set',
    key: `世界.状态.剧本模组.npcPrivateKnowledge.${FACT_ID}`,
    value: { claim: '伪造知情' },
  }, 0);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /禁止|不可|保护|操作/);
});

test('narrative guard enforces every independently compiled association block', async () => {
  const { validateNarrativePerformance } =
    await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');
  const prompt = [
    'renderGuard.forbiddenAssociations=[{"subjects":["甲"],"predicates":["密令"]}]；renderGuard.first=true。',
    'renderGuard.forbiddenAssociations=[{"subjects":["乙"],"predicates":["真身"]}]；renderGuard.second=true。',
  ].join('\n');
  assert.equal(validateNarrativePerformance('甲已经拿到密令。', '继续', prompt).valid, false);
  assert.equal(validateNarrativePerformance('乙的真身已经证实。', '继续', prompt).valid, false);
});
