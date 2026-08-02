import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { loadTs } from './loadTs.mjs';

const stage05Url = new URL('../mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_05.json', import.meta.url);
const stage06Url = new URL('../mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_06.json', import.meta.url);
const linAnUrl = new URL('../mod-kit/generated/deepseek-v4-flash/yunlong/stages/lyl.lin_an_black_sea.json', import.meta.url);
const registryUrl = new URL('../src/modules/scenarioMods/builtins/character-registry.json', import.meta.url);
const FACT_ID = 'knowledge.npc.qingyu.biji_xingyuehu_identity';
const CLAIM = '碧姬就是星月湖旧部称作“碧宛”的岳帅姬妾。';
const CUE = '谢艺寻找碧姬并非泛泛寻人';
const MOTHER_FACT_ID = 'knowledge.npc.qingyu.xiaozi_biji_mother';
const DAUGHTER_FACT_ID = 'knowledge.npc.qingyu.biji_xiaozi_daughter';
const MOTHER_CLAIM = '碧姬是小紫的生母。';
const DAUGHTER_CLAIM = '小紫是碧姬的亲生女儿。';
const RUMOR_FACT_ID = 'knowledge.npc.yunlong.gao_zhishang_yueshuai_paternity_rumor';
const RUMOR_CLAIM = '高智商曾在瞑寂梦话中说，生父被干爹称作“岳帅”；这只是梦话线索，不能据此确认血缘。';

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

  const unknownUnlock = structuredClone(raw);
  unknownUnlock.scenario.initialNpcPrivateKnowledge[1].unlockAfterEventId = 'lcq.event.not_there';
  assert.equal(validateScenarioMod(unknownUnlock).issues.some(issue =>
    issue.path.endsWith('unlockAfterEventId') && issue.code === 'missing_reference'
  ), true);
});

test('different holders stay dormant until the declared event and then receive distinct cues', async () => {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const {
    applyStrictScenarioInitializationToSave,
    buildStrictScenarioInitialization,
  } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');

  const mod = parseScenarioMod(JSON.parse(await readFile(stage05Url, 'utf8')));
  let save = applyStrictScenarioInitializationToSave(
    baseSave(),
    buildStrictScenarioInitialization(mod, '2026-08-01T00:00:00.000Z'),
  );
  let runtime = save.世界.状态.剧本模组;
  runtime.activeEventIds = [];
  runtime.opening.featuredCharacterIds = [];

  const lockedPrompt = buildScenarioStoryPrompt(save, '我分别观察小紫与碧姬。');
  assert.doesNotMatch(lockedPrompt, /早已积压的私人旧恨|认得小紫与自己的私人亲缘/);
  assert.doesNotMatch(lockedPrompt, new RegExp(`${MOTHER_CLAIM}|${DAUGHTER_CLAIM}`));

  runtime.completedEventIds.push('lcq.event.s05_13');
  runtime.worldTurn = 6;
  save = advanceScenarioRuntime(save).saveData;
  runtime = save.世界.状态.剧本模组;
  assert.equal(runtime.npcPrivateKnowledge[MOTHER_FACT_ID].unlockedAtTurn, 6);
  assert.equal(runtime.npcPrivateKnowledge[DAUGHTER_FACT_ID].unlockedAtTurn, 6);

  runtime.activeEventIds = [];
  runtime.opening.featuredCharacterIds = [];
  const xiaoziPrompt = buildScenarioStoryPrompt(save, '我只找小紫谈谈。');
  assert.match(xiaoziPrompt, /早已积压的私人旧恨/);
  assert.doesNotMatch(xiaoziPrompt, /认得小紫与自己的私人亲缘/);
  assert.doesNotMatch(xiaoziPrompt, new RegExp(MOTHER_CLAIM));

  const bijiPrompt = buildScenarioStoryPrompt(save, '我只找碧姬谈谈。');
  assert.match(bijiPrompt, /认得小紫与自己的私人亲缘/);
  assert.doesNotMatch(bijiPrompt, /早已积压的私人旧恨/);
  assert.doesNotMatch(bijiPrompt, new RegExp(DAUGHTER_CLAIM));
});

test('registry aliases close private-association guards even when facts only list canonical names', async () => {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const {
    applyStrictScenarioInitializationToSave,
    buildStrictScenarioInitialization,
  } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const { advanceScenarioRuntime } = await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const { validateNarrativePerformance } =
    await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');
  const { expandPrivateKnowledgeAssociations } =
    await loadTs('../src/modules/scenarioMods/privateKnowledgeGuard.ts');

  const mod = parseScenarioMod(JSON.parse(await readFile(stage05Url, 'utf8')));
  let save = applyStrictScenarioInitializationToSave(
    baseSave(),
    buildStrictScenarioInitialization(mod, '2026-08-01T00:00:00.000Z'),
  );
  let runtime = save.世界.状态.剧本模组;
  runtime.completedEventIds.push('lcq.event.s05_13');
  runtime.worldTurn = 6;
  save = advanceScenarioRuntime(save).saveData;
  runtime = save.世界.状态.剧本模组;

  for (const factId of [MOTHER_FACT_ID, DAUGHTER_FACT_ID]) {
    runtime.npcPrivateKnowledge[factId].forbiddenAssociations[0].subjects = ['小紫', '碧姬'];
    const [expanded] = expandPrivateKnowledgeAssociations(runtime.npcPrivateKnowledge[factId]);
    assert.deepEqual(
      new Set(expanded.subjects),
      new Set(['小紫', '紫妈妈', '紫丫头', '碧姬', '碧宛', '碧奴']),
      factId,
    );
  }

  runtime.activeEventIds = [];
  runtime.opening.featuredCharacterIds = [];
  const prompt = buildScenarioStoryPrompt(save, '我分别观察紫丫头与碧奴。');
  for (const narrative of [
    '紫丫头猛然醒悟，碧奴竟然是自己的母亲。',
    '紫妈妈已经确认碧宛就是自己的生母。',
  ]) {
    assert.equal(validateNarrativePerformance(narrative, '继续', prompt).valid, false, narrative);
  }
});

test('every registered alias and predicate pair is rejected through narrative and command channels', async () => {
  const { validateNarrativePerformance } =
    await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');
  const { guardScenarioModCommands } = await loadTs('../src/modules/scenarioMods/canonGuard.ts');
  const { expandPrivateKnowledgeAssociations } =
    await loadTs('../src/modules/scenarioMods/privateKnowledgeGuard.ts');
  const rawStages = await Promise.all([stage05Url, stage06Url, linAnUrl].map(async url =>
    JSON.parse(await readFile(url, 'utf8'))
  ));
  const registry = JSON.parse(await readFile(registryUrl, 'utf8'));
  const expectedNamesById = new Map(registry.characters.map(character => [
    character.id,
    [character.canonicalName, ...(character.aliases || [])],
  ]));

  const facts = new Map();
  for (const raw of rawStages) {
    for (const fact of raw.scenario.initialNpcPrivateKnowledge || []) {
      facts.set(fact.factId, {
        ...fact,
        learnedAtTurn: 0,
        sourceStageId: raw.manifest.id,
      });
    }
  }

  for (const fact of facts.values()) {
    const associations = expandPrivateKnowledgeAssociations(fact);
    const expectedRegistryNames = new Set([
      ...(expectedNamesById.get(fact.subjectId) || []),
      ...(expectedNamesById.get(fact.objectId) || []),
    ]);
    const prompt = `renderGuard.forbiddenAssociations=${JSON.stringify(associations)}；renderGuard.npcPrivateKnowledge=true。`;
    for (const association of associations) {
      const expectedSubjects = new Set([...association.subjects, ...expectedRegistryNames]);
      assert.deepEqual(new Set(association.subjects), expectedSubjects, `${fact.factId}: registry alias closure`);
      for (const subject of expectedSubjects) {
        for (const predicate of association.predicates) {
          const narrative = `${subject}已经确认${predicate}。`;
          assert.equal(
            validateNarrativePerformance(narrative, '继续', prompt).valid,
            false,
            `${fact.factId}: ${subject} × ${predicate}`,
          );
          const command = {
            action: 'set',
            key: `社交.关系.${subject}.当前内心想法`,
            value: narrative,
          };
          const commandSave = baseSave();
          commandSave.世界.状态.剧本模组 = {
            modId: 'test.private-knowledge-alias-matrix',
            mode: 'strict',
            npcPrivateKnowledge: { [fact.factId]: fact },
          };
          const guarded = guardScenarioModCommands(commandSave, [command]);
          assert.deepEqual(guarded.accepted, [], `${fact.factId}: command accepted ${subject} × ${predicate}`);
          assert.deepEqual(guarded.rejected.map(item => item.command), [command]);
        }
      }
    }
  }
});

test('rumor knowledge opens for its holder without being promoted to confirmed truth', async () => {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const {
    applyStrictScenarioInitializationToSave,
    buildStrictScenarioInitialization,
  } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const { buildScenarioStoryPrompt, createScenarioPromptState } =
    await loadTs('../src/modules/scenarioMods/storyContext.ts');
  const { validateNarrativePerformance } =
    await loadTs('../src/modules/scenarioMods/narrativePerformanceGuard.ts');
  const { guardScenarioModCommands } = await loadTs('../src/modules/scenarioMods/canonGuard.ts');

  const mod = parseScenarioMod(JSON.parse(await readFile(linAnUrl, 'utf8')));
  const save = applyStrictScenarioInitializationToSave(
    baseSave(),
    buildStrictScenarioInitialization(mod, '2026-08-01T00:00:00.000Z'),
  );
  const runtime = save.世界.状态.剧本模组;
  runtime.activeEventIds = [];
  runtime.opening.featuredCharacterIds = [];
  assert.equal(runtime.playerKnowledge['knowledge.player.yunlong.gao_zhishang_yueshuai_paternity_rumor'].status, 'rumor');
  assert.equal(runtime.npcPrivateKnowledge[RUMOR_FACT_ID].status, 'rumor');
  assert.doesNotMatch(JSON.stringify(createScenarioPromptState(save)), new RegExp(RUMOR_CLAIM));

  const rumorPrompt = buildScenarioStoryPrompt(save, '我请凝姨只复核有来源的梦话线索。');
  assert.match(rumorPrompt, new RegExp(RUMOR_CLAIM));
  assert.match(rumorPrompt, /玩家已确认该传闻存在·原子边界/);
  assert.match(rumorPrompt, /不得将其坐实为自己的确证/);
  assert.match(rumorPrompt, /即使玩家知道某条传闻存在，也不得把传闻升级为事实/);
  assert.equal(
    validateNarrativePerformance(
      `凝姨答道：“${RUMOR_CLAIM}除此之外，没有证据。”`,
      '我请凝姨只复核有来源的梦话线索。',
      rumorPrompt,
    ).valid,
    true,
  );
  assert.equal(
    validateNarrativePerformance(
      '凝姨断言：“高智商就是岳帅的亲生儿子。”',
      '我请凝姨只复核有来源的梦话线索。',
      rumorPrompt,
    ).valid,
    false,
    'a rumor must not be promoted to a confirmed blood relationship',
  );
  assert.equal(
    validateNarrativePerformance(
      `凝姨答道：“${RUMOR_CLAIM}所以高智商就是岳帅的亲生儿子。”`,
      '我请凝姨只复核有来源的梦话线索。',
      rumorPrompt,
    ).valid,
    false,
    'the authorized atomic rumor cannot shield a new confirmation appended after it',
  );
  assert.equal(
    validateNarrativePerformance(
      '高智商断言：“当朝太尉高俅就是我的亲爹。”',
      '我只问高智商本人：你知道自己的生父是谁吗？',
      rumorPrompt,
    ).valid,
    false,
    'the public foster-father layer must not be rewritten as biological paternity',
  );

  const nonHolderPrompt = buildScenarioStoryPrompt(save, '我去问高智商自己的身世。');
  assert.doesNotMatch(nonHolderPrompt, new RegExp(RUMOR_CLAIM));
  assert.doesNotMatch(nonHolderPrompt, /atomicPrivateClaims/);
  assert.match(nonHolderPrompt, /renderGuard\.npcPrivateKnowledge=true/);
  assert.equal(
    validateNarrativePerformance(
      '高智商说：“高俅就是我的亲爹。”',
      '我只问高智商本人：你知道自己的生父是谁吗？',
      nonHolderPrompt,
    ).valid,
    false,
  );
  const rumorRelation = {
    action: 'set',
    key: '社交.关系.高衙内.当前内心想法',
    value: '高公子已经确认自己的生父就是岳帅。',
  };
  const rumorGuard = guardScenarioModCommands(save, [rumorRelation]);
  assert.deepEqual(rumorGuard.accepted, []);
  assert.deepEqual(rumorGuard.rejected.map(item => item.command), [rumorRelation]);

  delete runtime.playerKnowledge['knowledge.player.yunlong.gao_zhishang_yueshuai_paternity_rumor'];
  const unrevealedPrompt = buildScenarioStoryPrompt(save, '我去找凝姨谈谈。');
  assert.match(unrevealedPrompt, /只把它当作待复核线索/);
  assert.doesNotMatch(unrevealedPrompt, new RegExp(RUMOR_CLAIM));
  assert.match(unrevealedPrompt, /renderGuard\.npcPrivateKnowledge=true/);
});

test('the witnessed mother-daughter confrontation deterministically reveals both directed facts', async () => {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const {
    applyStrictScenarioInitializationToSave,
    buildStrictScenarioInitialization,
  } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const { getCurrentStoryEventActions, recordStoryEventStructuredAction } =
    await loadTs('../src/modules/scenarioMods/runtime.ts');
  const { buildScenarioStoryPrompt } = await loadTs('../src/modules/scenarioMods/storyContext.ts');

  const mod = parseScenarioMod(JSON.parse(await readFile(stage06Url, 'utf8')));
  const save = applyStrictScenarioInitializationToSave(
    baseSave(),
    buildStrictScenarioInitialization(mod, '2026-08-01T00:00:00.000Z'),
  );
  const runtime = save.世界.状态.剧本模组;
  runtime.activeEventIds = ['lcq.event.s06_04'];
  const [follow] = getCurrentStoryEventActions(save);
  assert.equal(follow.actionId, 'follow_xiaozi_to_biji');
  assert.equal(recordStoryEventStructuredAction(save, follow).outcome, 'success');
  runtime.worldTurn = (runtime.worldTurn || 0) + 1;
  const [stay] = getCurrentStoryEventActions(save);
  assert.equal(stay.actionId, 'stay_through_xiaozi_decision');
  assert.equal(recordStoryEventStructuredAction(save, stay).outcome, 'success');

  assert.equal(runtime.playerKnowledge['knowledge.player.qingyu.xiaozi_biji_mother'].status, 'confirmed');
  assert.equal(runtime.playerKnowledge['knowledge.player.qingyu.biji_xiaozi_daughter'].status, 'confirmed');
  const revealedPrompt = buildScenarioStoryPrompt(save, '我请小紫与碧姬各自只复核有证据的母女事实。');
  assert.match(revealedPrompt, new RegExp(MOTHER_CLAIM));
  assert.match(revealedPrompt, new RegExp(DAUGHTER_CLAIM));
  assert.match(revealedPrompt, /renderGuard\.atomicPrivateClaims=/);
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
  runtime.npcPrivateKnowledge[MOTHER_FACT_ID].unlockedAtTurn = 5;
  runtime.npcPrivateKnowledge[DAUGHTER_FACT_ID].unlockedAtTurn = 5;
  runtime.nextStageId = nextMod.manifest.id;
  runtime.nextStageReadyId = nextMod.manifest.id;

  const transitioned = transitionToNextScenarioStage(save, [nextMod]);
  assert.equal(transitioned.ok, true, transitioned.reason);
  const ledger = transitioned.saveData.世界.状态.剧本模组.npcPrivateKnowledge;
  assert.deepEqual(Object.keys(ledger), [FACT_ID, MOTHER_FACT_ID, DAUGHTER_FACT_ID]);
  assert.equal(ledger[FACT_ID].learnedAtTurn, 4, 'the accumulated record wins over the target-stage seed');
  assert.equal(ledger[FACT_ID].sourceStageId, oldMod.manifest.id);
  assert.equal(ledger[MOTHER_FACT_ID].unlockedAtTurn, 5);
  assert.equal(ledger[DAUGHTER_FACT_ID].unlockedAtTurn, 5);
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

test('LLM commands cannot reverse-write private facts into ordinary relationships', async () => {
  const { parseScenarioMod } = await loadTs('../src/modules/scenarioMods/validator.ts');
  const {
    applyStrictScenarioInitializationToSave,
    buildStrictScenarioInitialization,
  } = await loadTs('../src/modules/scenarioMods/strictInitializer.ts');
  const { guardScenarioModCommands } = await loadTs('../src/modules/scenarioMods/canonGuard.ts');
  const mod = parseScenarioMod(JSON.parse(await readFile(stage06Url, 'utf8')));
  const save = applyStrictScenarioInitializationToSave(
    baseSave(),
    buildStrictScenarioInitialization(mod, '2026-08-01T00:00:00.000Z'),
  );
  const runtime = save.世界.状态.剧本模组;
  for (const factId of [MOTHER_FACT_ID, DAUGHTER_FACT_ID]) {
    runtime.npcPrivateKnowledge[factId].forbiddenAssociations[0].subjects = ['小紫', '碧姬'];
  }
  const commands = [
    {
      action: 'set',
      key: '社交.关系.碧姬.当前内心想法',
      value: '刚当面确认了与小紫的母女关系，但不愿多说细节。',
    },
    {
      action: 'set',
      key: '社交.关系.碧姬.当前内心想法',
      value: '神色平静，正在等玩家的下一个问题。',
    },
    {
      action: 'set',
      key: '社交.关系.碧奴',
      value: { 名字: '碧奴', 当前内心想法: '紫丫头是自己的亲生女儿。' },
    },
  ];

  const result = guardScenarioModCommands(save, commands);

  assert.deepEqual(result.accepted, [commands[1]]);
  assert.deepEqual(result.rejected.map(item => item.command), [commands[0], commands[2]]);
  assert.ok(result.rejected.every(item => /私有知情.*普通关系/.test(item.reason)));

  runtime.playerKnowledge = {
    'knowledge.player.qingyu.xiaozi_biji_mother': {
      factId: 'knowledge.player.qingyu.xiaozi_biji_mother',
      subjectId: 'liuchao.character.bi_ji',
      predicate: 'mother_of',
      objectId: 'liuchao.character.xiao_zi',
      status: 'confirmed',
      disclosureScope: 'player',
      learnedAtTurn: 4,
    },
    'knowledge.player.qingyu.biji_xiaozi_daughter': {
      factId: 'knowledge.player.qingyu.biji_xiaozi_daughter',
      subjectId: 'liuchao.character.xiao_zi',
      predicate: 'daughter_of',
      objectId: 'liuchao.character.bi_ji',
      status: 'confirmed',
      disclosureScope: 'player',
      learnedAtTurn: 4,
    },
  };
  const revealedResult = guardScenarioModCommands(save, [commands[0], commands[2]]);
  assert.deepEqual(revealedResult.accepted, [commands[0], commands[2]]);
  assert.deepEqual(revealedResult.rejected, []);
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
