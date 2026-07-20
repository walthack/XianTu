import { readFile, writeFile } from 'node:fs/promises';

const stagePath = new URL('../mod-kit/generated/deepseek-v4-flash/yange/stages/lyg.dingtao_beijing.json', import.meta.url);
const stage = JSON.parse(await readFile(stagePath, 'utf8'));

const events = new Map(stage.scenario.events.map(event => [event.id, event]));
const coreOf = eventId => {
  const core = events.get(eventId)?.worldActor?.decisionCore;
  if (!core) throw new Error(`Missing decision core: ${eventId}`);
  return core;
};
const actorOf = (core, actorId) => {
  const actor = core.actors.find(item => item.characterId === actorId);
  if (!actor) throw new Error(`Missing actor: ${actorId}`);
  return actor;
};
const bindingOf = (core, actionId, actorId) => {
  const binding = core.actionBindings.find(item =>
    item.actionId === actionId && (!item.actorIds?.length || item.actorIds.includes(actorId)));
  if (!binding) throw new Error(`Missing binding: ${actorId}/${actionId}`);
  return binding;
};

function installKnowledgeCatalog(core, prefix) {
  if (core.knowledgeFacts && Object.keys(core.knowledgeFacts).length) {
    return new Map(Object.entries(core.knowledgeFacts).map(([id, fact]) => [fact.text, id]));
  }
  const texts = [...new Set([
    ...core.actors.flatMap(actor => actor.knowledge),
    ...core.actionBindings.flatMap(binding => binding.knownFacts),
  ])];
  const idByText = new Map(texts.map((text, index) => [
    text,
    `knowledge.${prefix}.${String(index + 1).padStart(2, '0')}`,
  ]));
  core.knowledgeFacts = Object.fromEntries(texts.map(text => [
    idByText.get(text),
    {
      text,
      access: /尚未|秘密|暗中|无法久持|伤势/.test(text) ? 'restricted' : 'public',
      evidence: `R2-10D：沿用 ${prefix} 既有 worldActor knownFacts，不新增原著事实。`,
    },
  ]));
  for (const actor of core.actors) actor.knowledge = actor.knowledge.map(text => idByText.get(text));
  for (const binding of core.actionBindings) {
    binding.knownFactIds = binding.knownFacts.map(text => idByText.get(text));
    binding.requiresKnowledge = [...binding.knownFactIds];
    binding.knownFacts = [];
  }
  return idByText;
}

function addFact(core, id, text, access, evidence) {
  core.knowledgeFacts[id] = { text, access, evidence };
}

function addRelationship(actor, targetId, dimensions, evidence) {
  actor.relationships[targetId] = dimensions;
  for (const dimension of Object.keys(dimensions)) {
    actor.evidence[`relationships.${targetId}.${dimension}`] = evidence;
  }
}

const DONG = 'liuchao.character.dong_zhuo';
const JIA = 'liuchao.character.jia_wenhe';
const HUO = 'liuchao.character.huo_zi_meng';
const LV = 'liuchao.character.lv_zhi';
const GUO = 'liuchao.character.guo_jie';
const JIAN = 'liuchao.character.jian_yu_ji';
const RUAN = 'liuchao.character.ruan_xiang_ning';
const CHENG = 'liuchao.character.cheng_zongyang';
const FALLBACK_FACT = 'knowledge.lyg.jia_fallback_prepared';

// 早期本地草稿曾使用错误 slug；脚本保持幂等并主动清掉该无效引用。
for (const eventId of ['lyg.event.s01_05', 'lyg.event.s01_06', 'lyg.event.s01_07', 'lyg.event.s01_08']) {
  for (const actor of coreOf(eventId).actors) {
    delete actor.relationships['liuchao.character.cheng_zong_yang'];
    for (const key of Object.keys(actor.evidence)) {
      if (key.includes('liuchao.character.cheng_zong_yang')) delete actor.evidence[key];
    }
  }
}

{
  const core = coreOf('lyg.event.s01_05');
  installKnowledgeCatalog(core, 'lyg.s01_05');
  addFact(
    core,
    FALLBACK_FACT,
    '贾文和已经备好凉州旧部的退场次序',
    'restricted',
    '裁定 #95：董卓生死节点须由贾文和收束凉州旧部，不得回京争权。',
  );
  addRelationship(actorOf(core, DONG), JIA, { trust: 52, obligation: 35 }, '董卓倚重贾文和筹划拥立与凉州军退路。');
  addRelationship(actorOf(core, JIA), DONG, { trust: 46, obligation: 58 }, '贾文和为董卓谋划并承担凉州旧部收束责任。');
  addRelationship(actorOf(core, HUO), LV, { trust: 42, obligation: 30 }, '霍子孟接受吕雉支持定陶王的判断，但仍坚持朝廷程序。');
  addRelationship(actorOf(core, LV), HUO, { trust: 38, obligation: 24 }, '吕雉需要霍子孟为定陶王登基提供程序背书。');

  const fallback = bindingOf(core, 'prepare_fallback_route', JIA);
  fallback.utility.relationships = [{ targetCharacterId: DONG, dimension: 'obligation', weight: 4 }];
  fallback.stateEffects = {
    relationships: [{ actorId: DONG, targetCharacterId: JIA, deltas: { trust: 6 } }],
    knowledge: [{ add: [FALLBACK_FACT] }],
  };
  bindingOf(core, 'secure_palace_access', DONG).stateEffects = {
    relationships: [{ actorId: JIA, targetCharacterId: DONG, deltas: { trust: -4, obligation: 3 } }],
  };
  bindingOf(core, 'negotiate_court_procedure', HUO).stateEffects = {
    relationships: [{ actorId: LV, targetCharacterId: HUO, deltas: { trust: 5 } }],
  };
  bindingOf(core, 'test_loyalty', LV).utility.relationships = [
    { targetCharacterId: HUO, dimension: 'trust', weight: -5 },
  ];
}

{
  const core = coreOf('lyg.event.s01_06');
  installKnowledgeCatalog(core, 'lyg.s01_06');
  const routeFact = 'knowledge.lyg.s01_06.safe_route_prepared';
  const patternFact = 'knowledge.lyg.s01_06.guard_pattern_observed';
  addFact(core, routeFact, '郭解已经布置一条不经过正门的疏散路线', 'restricted', '由郭解本事件内的护持行动确定性产生。');
  addFact(core, patternFact, '剑玉姬已经摸清郭解护持定陶王的换防规律', 'secret', '由剑玉姬本事件内的破坏行动确定性产生。');
  addRelationship(actorOf(core, GUO), JIAN, { hostility: 72, respect: 28 }, '郭解明确面对阻断拥立与危及定陶王的敌对高手。');
  addRelationship(actorOf(core, JIAN), GUO, { hostility: 68, respect: 36 }, '剑玉姬将郭解视为当前行动的主要阻碍。');

  const protect = bindingOf(core, 'protect_principal', GUO);
  protect.utility.relationships = [{ targetCharacterId: JIAN, dimension: 'hostility', weight: 4 }];
  protect.stateEffects = {
    knowledge: [{ add: [routeFact] }],
    relationships: [{ actorId: JIAN, targetCharacterId: GUO, deltas: { respect: 5, hostility: 3 } }],
  };
  const escort = bindingOf(core, 'escort_witness', GUO);
  escort.requiresKnowledge = [...new Set([...escort.requiresKnowledge, routeFact])];
  escort.knownFactIds = [...new Set([...escort.knownFactIds, routeFact])];
  escort.utility.relationships = [{ targetCharacterId: JIAN, dimension: 'hostility', weight: 2 }];

  const sabotage = bindingOf(core, 'sabotage_agenda', JIAN);
  sabotage.utility.relationships = [{ targetCharacterId: GUO, dimension: 'hostility', weight: 4 }];
  sabotage.stateEffects = {
    knowledge: [{ add: [patternFact] }],
    relationships: [{ actorId: GUO, targetCharacterId: JIAN, deltas: { hostility: 4, respect: 2 } }],
  };
  const block = bindingOf(core, 'block_road', JIAN);
  block.requiresKnowledge = [...new Set([...block.requiresKnowledge, patternFact])];
  block.knownFactIds = block.knownFactIds.filter(factId => factId !== patternFact);
}

{
  const core = coreOf('lyg.event.s01_07');
  installKnowledgeCatalog(core, 'lyg.s01_07');
  addFact(
    core,
    FALLBACK_FACT,
    '贾文和已经备好凉州旧部的退场次序',
    'restricted',
    '继承 s01_05 行动结果；裁定 #95 要求贾文和收束凉州旧部。',
  );
  addRelationship(actorOf(core, DONG), JIA, { trust: 52, obligation: 35 }, '董卓倚重贾文和安排凉州旧部退场。');
  addRelationship(actorOf(core, JIA), DONG, { trust: 46, obligation: 58 }, '贾文和承担董卓身后凉州旧部的收束责任。');

  const withdraw = bindingOf(core, 'withdraw_force', JIA);
  withdraw.requiresKnowledge = [...new Set([...withdraw.requiresKnowledge, FALLBACK_FACT])];
  withdraw.knownFactIds = [...new Set([...withdraw.knownFactIds, FALLBACK_FACT])];
  withdraw.relationshipRequirements = [{ targetCharacterId: DONG, dimension: 'obligation', min: 45 }];
  withdraw.utility.relationships = [{ targetCharacterId: DONG, dimension: 'obligation', weight: 6 }];
  withdraw.stateEffects = {
    relationships: [
      { targetCharacterId: DONG, deltas: { obligation: -12, trust: 5 } },
      { actorId: DONG, targetCharacterId: JIA, deltas: { trust: 8 } },
    ],
  };
  bindingOf(core, 'public_declaration', DONG).stateEffects = {
    relationships: [{ actorId: JIA, targetCharacterId: DONG, deltas: { obligation: 6, trust: 4 } }],
  };
}

{
  const core = coreOf('lyg.event.s01_08');
  const ids = installKnowledgeCatalog(core, 'lyg.s01_08');
  const verifiedFact = 'knowledge.lyg.s01_08.source_verified';
  addFact(core, verifiedFact, '阮香凝已经核实盛姬线索的来源链，但尚未向无关人物披露', 'restricted', '由本事件内 verify_rumor 行动确定性产生。');
  addRelationship(actorOf(core, RUAN), CHENG, { trust: 44, caution: 62 }, '阮香凝愿意向程宗扬递出有限线索，但仍控制黑魔海机密的知情范围。');

  const verify = bindingOf(core, 'verify_rumor', RUAN);
  verify.utility.relationships = [{ targetCharacterId: CHENG, dimension: 'trust', weight: 4 }];
  verify.stateEffects = {
    knowledge: [{ add: [verifiedFact] }],
    relationships: [{ targetCharacterId: CHENG, deltas: { trust: 5, caution: -3 } }],
    resources: { intelligence: 1 },
  };
  const gather = bindingOf(core, 'gather_intelligence', RUAN);
  gather.requiresKnowledge = [...new Set([...gather.requiresKnowledge, verifiedFact])];
  gather.knownFactIds = [verifiedFact];
  gather.utility.relationships = [{ targetCharacterId: CHENG, dimension: 'trust', weight: 5 }];
  const conceal = bindingOf(core, 'conceal_evidence', RUAN);
  conceal.utility.relationships = [{ targetCharacterId: CHENG, dimension: 'caution', weight: 5 }];
  conceal.stateEffects = {
    relationships: [{ targetCharacterId: CHENG, deltas: { caution: 4, trust: -2 } }],
  };

  const secretText = '盛姬与黑魔海御姬奴有关';
  const secretId = ids.get(secretText);
  core.knowledgeFacts[secretId].access = 'secret';
}

await writeFile(stagePath, `${JSON.stringify(stage, null, 2)}\n`);
console.log('R2-10D attitude/knowledge/effects feedback installed for lyg.event.s01_05–08');
