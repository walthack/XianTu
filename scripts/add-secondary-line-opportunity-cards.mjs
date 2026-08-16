#!/usr/bin/env node

// 给汉／昭南／晋／宋 15 个缺卡节点挂机会卡（s01_05 已有两张真岔口，跳过）。
// 改 mod-kit 源；幂等。卡是岔口：选 A／选 B 权限不同；忽略不受罚。

import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generated = join(root, 'mod-kit/generated/deepseek-v4-flash');

const YUN = 'liuchao.character.yun_cang_feng';
const LV_JI = 'liuchao.character.lv_ji';
const DONG = 'liuchao.character.dong_zhuo';
const LV_ZHI = 'liuchao.character.lv_zhi';
const ZHAO = 'liuchao.character.zhao_feiyan';
const XIE = 'liuchao.character.xie_yi';
const ZHUO = 'liuchao.character.zhuo_yunjun';
const XIAO_YAO = 'liuchao.character.xiao_yao_yi';
const XIAO_ZI = 'liuchao.character.xiao_zi';
const FAC_YUN = 'liuchao.faction.yun_shi_shang_hui';
const FAC_HAN = 'liuchao.faction.han_guo_chao_ting';
const FAC_LV = 'lyl.faction.lyu_clan';
const FAC_LIANG = 'liuchao.faction.liangzhou_army';
const FAC_XY = 'liuchao.faction.xing_yue_hu';
const FAC_TAIYI = 'liuchao.faction.tai_yi_zhen_zong';
const FAC_BIYU = 'liuchao.faction.biyu';
const FAC_HEIMO = 'liuchao.faction.hei_mo_hai';
const FAC_SONG = 'lyg.faction.song_state';
const FAC_JIN = 'lyg.faction.jin_state';

const DONG_MIN = {
  id: DONG,
  name: '董卓',
  description: '凉州军首领。本关只坐实他率军抵津门、声称奉大将军令却拿不出虎符。',
  role: '军阀',
  gender: '男',
  realm: '练气',
  affiliations: [
    { factionId: FAC_LIANG, category: 'military', role: '首领' },
    { factionId: FAC_HAN, category: 'state', role: '边将' },
  ],
  profile: {
    attributes: { rootBone: 6, spirituality: 4, comprehension: 4, fortune: 5, charm: 4, temperament: 6 },
    personality: ['横暴', '刚愎自用', '有军事经验'],
    appearance: '肥胖，剑髯怒张，身穿铁甲。',
    origin: '凉州军阀',
  },
};

function evd(rank, extras) {
  return {
    'identity.rank': rank,
    ...extras,
  };
}

function person(id, factionId, office, rank, pers, mot, res, knowledge, agenda, allowed, evidenceRank, extraEvidence) {
  return {
    characterId: id,
    identity: { factionId, office, rank },
    personality: pers,
    motives: mot,
    resources: res,
    relationships: {},
    knowledge,
    agendas: [agenda],
    allowedActionIds: allowed,
    wake: { tier: 'local_critical' },
    evidence: evd(evidenceRank, extraEvidence),
  };
}

function bind(actionId, actorIds, label, reason, fact, signal, off, invent, costs, effects, utility, visibility = 'public') {
  return {
    actionId, actorIds, label, reason,
    knownFacts: [], knownFactIds: [fact],
    mustNotInvent: invent, visibleSignal: signal, offscreenAction: off,
    costs, effects, utility, visibility, durationTurns: 1,
  };
}

function card(p) {
  const out = {
    id: p.id,
    title: p.title,
    characterIds: p.characterIds,
    whyNow: p.whyNow,
    nextStep: p.nextStep,
    stakes: p.stakes,
    rewardPreview: p.rewardPreview,
    futureHint: p.futureHint,
    actionText: p.actionText,
    rewardKey: p.rewardKey,
    rewardLabel: p.rewardLabel,
    trigger: p.trigger,
    completionContract: {
      kind: 'player_action_sequence',
      settlement: 'immediate',
      expiry: p.expiry || 'persistent',
      steps: p.steps.map(s => ({
        id: s[0],
        label: s[1],
        actions: [{ id: s[2], label: s[3], actionText: s[4], timeCost: 1 }],
        matchAny: s[5],
        rejectIf: s[6],
      })),
    },
  };
  if (p.expiresAfterTurns) out.expiresAfterTurns = p.expiresAfterTurns;
  return out;
}

function coreOf(spec) {
  const limits = Object.fromEntries(spec.sit.map(k => [k, { min: 0, max: 100 }]));
  return {
    pressure: {
      id: spec.pressureId,
      scope: spec.scope || 'faction',
      summary: spec.summary,
      domains: spec.domains,
      geography: spec.geo,
      factionIds: spec.factions,
      intensity: spec.intensity || 2,
      canonPolicy: 'process_only',
    },
    decisionCore: {
      knowledgeFacts: spec.facts,
      situation: { whitelist: spec.sit, initialValues: spec.init, limits },
      canonPolicy: spec.policy,
      actors: spec.actors,
      actionBindings: spec.bindings,
      maxVisibleActions: 2,
      narrativeGuard: { forbiddenTerms: spec.forbiddenTerms, rejectConcreteQuantities: true, allowUnverifiedQuantities: true },
    },
    opportunities: spec.cards,
  };
}

const INSTALLS = [];

function add(install) {
  INSTALLS.push(install);
}

// ── 汉国 ──────────────────────────────────────────────
add({
  book: 'yunlong', stageFile: 'lyl.taiquan_afterfall.json', eventId: 'lyl.event.taiquan_afterfall_07_beat',
  present: [YUN], factions: [FAC_YUN, FAC_HAN],
  worldActor: coreOf({
    pressureId: 'world.lyl.afterfall_07.court_door',
    summary: '洛都因平亭侯下狱而门风加密，入朝的口子还没人认领。',
    domains: ['court', 'commerce'], geo: ['洛都'], factions: [FAC_YUN, FAC_HAN],
    facts: {
      'knowledge.lyl.afterfall_07.case': { text: '平亭侯因宁成上奏下诏狱，洛都权贵说法互相打架。', access: 'public', evidence: 'lyl.event.taiquan_afterfall_07_beat axisBeat。' },
    },
    sit: ['courtAccess', 'exposure'], init: { courtAccess: 22, exposure: 48 },
    policy: { invariant: ['平亭侯已经下诏狱'], forbiddenBefore: ['官身已经买成'], processFreedom: ['向谁打听入朝口子'] },
    forbiddenTerms: ['官身已经买成', '西邸已经批准'],
    actors: [person(YUN, FAC_YUN, '云氏当家人', 5, { caution: 4, honor: 3, ambition: 3 }, { stability: 4, control: 4 },
      { influence: 5, wealth: 5, intelligence: 4, troops: 1 }, ['knowledge.lyl.afterfall_07.case'],
      { id: 'agenda.lyl.afterfall_07.yun', goal: '保住云氏还能用的入朝口子', clock: 0, escalation: ['对价', '递名'] },
      ['gather_intelligence', 'trade_favor'], '人物卡：云苍峰为云氏当家人。', {
        'personality.caution': '人物卡：沉稳老练。', 'personality.honor': '人物卡：重情义。', 'personality.ambition': '人物卡：商界领袖。',
        'motives.stability': '本拍只摸口子。', 'motives.control': '人物卡：精明务实。',
        'resources.influence': '人物卡：云氏当家人。', 'resources.wealth': '人物卡：商会领袖。',
        'resources.intelligence': '人物卡：西邸渠道熟。', 'resources.troops': '本拍不调私兵。',
        'agendas.agenda.lyl.afterfall_07.yun.clock': '风波已起，口子未认领。',
      })],
    bindings: [
      bind('gather_intelligence', [YUN], '把西邸能问的门路分开登记', '门风加密，先分清能问与不能问',
        'knowledge.lyl.afterfall_07.case', '云苍峰把西邸传闻标成亲见、转述和尚未核实', '整理不具名的门路清单',
        ['官身已经买成', '具体银数'], { intelligence: 1 }, { courtAccess: 8 },
        { urgency: 8, factionGoal: 8, expectedBenefit: 7, situation: { courtAccess: -3 } }),
      bind('trade_favor', [YUN], '问清云氏愿不愿把外人名字递进西邸', '递名比问路更显眼',
        'knowledge.lyl.afterfall_07.case', '账房把问路和递名分成两份未签字草单', '留下可撤回的递名条件',
        ['已经递进西邸'], { influence: 1 }, { exposure: 6 }, { expectedBenefit: 3 }, 'rumor'),
    ],
    cards: [card({
      id: 'opportunity.lyl.afterfall_07.ask_yun_door', title: '向云苍峰摸西邸的口子', characterIds: [YUN],
      whyNow: '洛都因平亭侯下狱而门风加密，自己闯朝堂只会撞上互相打架的抄件。',
      nextStep: '只向云苍峰核验西邸近日能问的门路，先不把名字递进去。',
      stakes: '问路会被云家记上一笔；问得太深也可能卷进平亭侯案的风口。',
      rewardPreview: '取得一次调用云氏西邸门路核验的权限。',
      futureHint: '以后再有人问入朝怎么走，云苍峰会记得谁先把口子摸清楚。',
      actionText: '我追踪“向云苍峰摸西邸的口子”：只核验能问的门路与不能问的禁区，先不递名、不买官。',
      rewardKey: 'permission.lyl.yun.court_door_audit', rewardLabel: '云氏·西邸门路核验',
      trigger: { actorIds: [YUN], actionIds: ['gather_intelligence'] },
      steps: [
        ['list_doors', '核清近日能问的门路', 'list_west_residence_doors', '登记能问的门路',
          '我同云苍峰把西邸近日能问的门路与不能问的禁区分开登记，不先递名。',
          ['能问的门路', '不能问', '不先递名'], ['已经买官', '名字已经递进']],
        ['keep_name_off', '确认此次不递名', 'refuse_early_nomination', '把名字留在账外',
          '我明确只要门路清单，不要云家把我的名字写进西邸草单。',
          ['只要门路', '不要把我的名字'], ['把我的名字递进', '现在就买官']],
      ],
    })],
  }),
});

add({
  book: 'yunlong', stageFile: 'lyl.luoyang_cloud_secret.json', eventId: 'lyl.event.s05_01',
  present: [YUN], factions: [FAC_YUN, FAC_HAN],
  worldActor: coreOf({
    pressureId: 'world.lyl.s05_01.buy_office',
    summary: '西邸买官与首阳山铜矿已经摊开，官身挂谁的账还没说死。',
    domains: ['court', 'commerce'], geo: ['洛都', '西邸'], factions: [FAC_YUN, FAC_HAN],
    facts: { 'knowledge.lyl.s05_01.table': { text: '云苍峰与程宗扬正在商议用铜矿和西邸买二千石及郡县小吏。', access: 'public', evidence: 'lyl.event.s05_01 axisBeat。' } },
    sit: ['officeLeverage', 'yunLedgerBind'], init: { officeLeverage: 30, yunLedgerBind: 40 },
    policy: { invariant: ['买官与铜矿已经进入商议'], forbiddenBefore: ['二千石已经到手'], processFreedom: ['官身挂云家账还是自买'] },
    forbiddenTerms: ['官职已经批准', '二千石已经到手'],
    actors: [person(YUN, FAC_YUN, '云氏当家人', 5, { caution: 4, honor: 3, ambition: 4 }, { control: 5, stability: 3 },
      { influence: 5, wealth: 5, intelligence: 4, troops: 1 }, ['knowledge.lyl.s05_01.table'],
      { id: 'agenda.lyl.s05_01.yun', goal: '让买官不把云氏渠道赔进去', clock: 1, escalation: ['对价', '分账'] },
      ['trade_favor', 'audit_resources'], '人物卡：云苍峰为云氏当家人。', {
        'personality.caution': '人物卡：沉稳老练。', 'personality.honor': '本拍要分清谁的官身。', 'personality.ambition': '人物卡：商界领袖。',
        'motives.control': '挂账则渠道由云家调度。', 'motives.stability': '本拍避免一次买穿。',
        'resources.influence': '人物卡：云氏当家人。', 'resources.wealth': '本拍含铜矿与买官价单。',
        'resources.intelligence': '人物卡：西邸渠道熟。', 'resources.troops': '本拍不调私兵。',
        'agendas.agenda.lyl.s05_01.yun.clock': '价单已摊开，尚未落笔。',
      })],
    bindings: [
      bind('trade_favor', [YUN], '把官身与云家账册的绑定条件摊开', '挂账能换渠道，也会让官身被云家调度',
        'knowledge.lyl.s05_01.table', '矿册与买官价单分成云家背书和自买自担两叠', '写出两种分账草约',
        ['官职已经批准'], { influence: 1, wealth: 1 }, { yunLedgerBind: 10, officeLeverage: 6 },
        { urgency: 9, factionGoal: 9, expectedBenefit: 8, situation: { yunLedgerBind: -2 } }),
      bind('audit_resources', [YUN], '核清自买官身要单独准备的凭据', '不挂云家账也能走西邸',
        'knowledge.lyl.s05_01.table', '云苍峰只核对凭据，不按云氏印鉴', '列出自买凭据清单',
        ['已经买成', '云家已经背书'], { intelligence: 1 }, { officeLeverage: 5, yunLedgerBind: -4 },
        { expectedBenefit: 3 }, 'rumor'),
    ],
    cards: [
      card({
        id: 'opportunity.lyl.s05_01.buy_office_on_yun_ledger', title: '挂云家的账买官身', characterIds: [YUN],
        whyNow: '西邸价码已经摊开，挂云家账能换渠道，也会让这身官职记在云氏名下。',
        nextStep: '与云苍峰写明：官身由云家背书，日后调度权跟账走。',
        stakes: '云家会记住这笔人情；朝堂若追查买官，先查到的也是云氏账册。',
        rewardPreview: '取得一次调用云氏西邸背书买官的权限。',
        futureHint: '以后再走西邸，云苍峰会按这本账决定还要不要替你按印。',
        actionText: '我追踪“挂云家的账买官身”：写明官身由云家背书，并接受日后调度权跟账走。',
        rewardKey: 'permission.lyl.yun.office_endorsement', rewardLabel: '云氏·西邸背书买官',
        trigger: { actorIds: [YUN], actionIds: ['trade_favor'] },
        steps: [
          ['accept_endorsement', '接受云家背书', 'sign_yun_endorsement', '按云家背书条件',
            '我接受官身挂入云氏账册，并写明日后调度权跟账走。',
            ['挂入云氏账册', '调度权跟账走'], ['自己出钱买', '不要云家背书']],
          ['limit_grade', '限定先买哪一档', 'choose_endorsed_grade', '先定一档官身',
            '我同云苍峰先定一档要买的官身，不把二千石和郡县小吏一次买穿。',
            ['先定一档', '不把二千石和郡县'], ['一次买穿', '两档都买']],
        ],
      }),
      card({
        id: 'opportunity.lyl.s05_01.buy_office_in_own_name', title: '自己出钱买官，云家只经手', characterIds: [YUN],
        whyNow: '西邸也收自买，只是没有云家印鉴，官身不记在他们账上。',
        nextStep: '只要云苍峰核验凭据和价码，不让云氏按印。',
        stakes: '渠道会窄一层；出了差错也没有云家出面。',
        rewardPreview: '取得一次以自己名义走西邸、只借云家核验的权限。',
        futureHint: '以后有人问这身官职是谁的，云苍峰只会说他经手过核验。',
        actionText: '我追踪“自己出钱买官，云家只经手”：只要核验凭据，不让云氏按印、不把官身写入云家账。',
        rewardKey: 'permission.lyl.han.own_name_office', rewardLabel: '汉廷·自名西邸买官',
        trigger: { actorIds: [YUN], actionIds: ['trade_favor'] },
        steps: [
          ['keep_off_seal', '不让云氏按印', 'refuse_yun_seal', '拒绝云家印鉴',
            '我只要云苍峰核验西邸凭据，明确不让云氏印鉴按上官身文书。',
            ['核验西邸凭据', '不让云氏印鉴'], ['挂入云氏账册', '请云家背书']],
          ['own_risk', '自己承担买官后果', 'accept_own_name_risk', '自担西邸后果',
            '我写明官身以自己名义呈递，差错与追查都不记到云家账上。',
            ['以自己名义', '不记到云家账上'], ['云家出面', '挂云家的账']],
        ],
      }),
    ],
  }),
});

add({
  book: 'yunlong', stageFile: 'lyl.luoyang_cloud_secret.json', eventId: 'lyl.event.s05_03',
  present: [LV_JI, YUN], factions: [FAC_LV, FAC_YUN],
  worldActor: coreOf({
    pressureId: 'world.lyl.s05_03.encirclement', intensity: 3,
    summary: '吕氏把四营精锐调向山口镇，硬扛和抽身还没人认领。',
    domains: ['war', 'court'], geo: ['山口镇', '洛都'], factions: [FAC_LV, FAC_YUN],
    facts: { 'knowledge.lyl.s05_03.camps': { text: '吕氏兄弟调动卫尉、屯骑等四支汉军精锐及死士围杀山口镇。', access: 'public', evidence: 'lyl.event.s05_03 axisBeat。' } },
    sit: ['encirclementPressure', 'extractGap'], init: { encirclementPressure: 78, extractGap: 24 },
    policy: { invariant: ['四营已经改道'], forbiddenBefore: ['吕氏已经覆灭'], processFreedom: ['硬扛还是抽身'] },
    forbiddenTerms: ['吕冀已经阵亡', '四营已经撤回'],
    actors: [
      person(LV_JI, FAC_LV, '襄邑侯', 5, { aggression: 4, ambition: 4, caution: 2 }, { control: 5, legitimacy: 3 },
        { influence: 5, troops: 5, wealth: 3, intelligence: 3 }, ['knowledge.lyl.s05_03.camps'],
        { id: 'agenda.lyl.s05_03.lv_ji', goal: '用国器把人压死在包围里', clock: 1, escalation: ['合围', '收口'] },
        ['mobilize_forces', 'block_road'], '人物卡：吕冀为太后之弟、襄邑侯。', {
          'personality.aggression': '本拍调动四营围杀。', 'personality.ambition': '人物卡：未来大司马人选。',
          'personality.caution': '本拍仍用汉军旗号。', 'motives.control': '本拍用卫尉屯骑压场。',
          'motives.legitimacy': '人物卡：汉廷外戚。', 'resources.influence': '人物卡：吕氏核心。',
          'resources.troops': '本拍四营精锐在场。', 'resources.wealth': '本拍不靠买通自己人。',
          'resources.intelligence': '本拍掌握围杀部署。', 'agendas.agenda.lyl.s05_03.lv_ji.clock': '四营已经改道。',
        }),
      person(YUN, FAC_YUN, '云氏当家人', 5, { caution: 5, honor: 3, ambition: 3 }, { stability: 5, control: 3 },
        { influence: 4, wealth: 5, intelligence: 4, troops: 2 }, ['knowledge.lyl.s05_03.camps'],
        { id: 'agenda.lyl.s05_03.yun', goal: '留下一条可走的商路缝', clock: 1, escalation: ['找缝', '抽人'] },
        ['open_safe_route', 'prepare_fallback_route'], '人物卡：云苍峰为云氏当家人。', {
          'personality.caution': '国器合围时以抽身优先。', 'personality.honor': '本拍仍肯给同行留缝。',
          'personality.ambition': '人物卡：商界领袖。', 'motives.stability': '目标是人走得出来。',
          'motives.control': '商路缝由云家掌握。', 'resources.influence': '人物卡：云氏当家人。',
          'resources.wealth': '人物卡：商会领袖。', 'resources.intelligence': '人物卡：熟商路关卡。',
          'resources.troops': '本拍只有护卫。', 'agendas.agenda.lyl.s05_03.yun.clock': '抽身窗口还在。',
        }),
    ],
    bindings: [
      bind('mobilize_forces', [LV_JI], '收紧四营合围', '旗号已偏转，再不收口会留下活口',
        'knowledge.lyl.s05_03.camps', '山口镇外营旗同日内收', '继续压合围圈',
        ['四营已经撤回', '吕冀已经阵亡'], { troops: 1 }, { encirclementPressure: 10, extractGap: -6 },
        { urgency: 10, factionGoal: 10, expectedBenefit: 8, situation: { encirclementPressure: -4 }, escalation: 3 }),
      bind('block_road', [LV_JI], '封死山口镇外撤的官道', '官道一封，剩下的缝只剩商路',
        'knowledge.lyl.s05_03.camps', '官道卡口加木拒', '切断官道外撤',
        ['全镇屠尽'], { troops: 1 }, { extractGap: -8 }, { expectedBenefit: 4, escalation: 2 }),
      bind('open_safe_route', [YUN], '沿商路打开一条不碰官道的抽身缝', '官道已被国器盯住',
        'knowledge.lyl.s05_03.camps', '云氏货队改道，空车与伤员分开编列', '预留不经官卡的抽身缝',
        ['已经破营'], { wealth: 1, intelligence: 1 }, { extractGap: 12, encirclementPressure: -4 },
        { urgency: 9, factionGoal: 8, expectedBenefit: 8, situation: { extractGap: -3 } }),
      bind('prepare_fallback_route', [YUN], '给抽身缝再留一个备用出口', '单缝被堵就等于送回包围',
        'knowledge.lyl.s05_03.camps', '第二份货路暗号只交给带队的人', '准备备用抽身口',
        ['已经全员脱困'], { intelligence: 1 }, { extractGap: 6 }, { expectedBenefit: 2 }, 'hidden'),
    ],
    cards: [
      card({
        id: 'opportunity.lyl.s05_03.stand_the_encirclement', title: '在山口镇硬扛吕氏围杀', characterIds: [LV_JI],
        whyNow: '四营已经改道，若在这里顶住，吕冀会把你当成必须用国器才能压的人。',
        nextStep: '守住一处可核验的缺口，不主动去斩吕冀。',
        stakes: '硬扛会被记成公开对抗外戚；守不住也不会有人当你只是路过。',
        rewardPreview: '取得一次在汉军围场中被承认为对等对手的权限。',
        futureHint: '以后吕氏再调国器，会按你在山口镇有没有硬扛来估你。',
        actionText: '我追踪“在山口镇硬扛吕氏围杀”：守住一处可核验缺口，不买路、不求云家抽身。',
        rewardKey: 'permission.lyl.han.encirclement_stand', rewardLabel: '汉廷·山口镇硬扛记录',
        trigger: { actorIds: [LV_JI], actionIds: ['mobilize_forces'] }, expiry: 'standard', expiresAfterTurns: 4,
        steps: [
          ['hold_gap', '守住一处缺口', 'hold_verified_gap', '守住可核验缺口',
            '我在山口镇守住一处可核验的缺口，不主动去斩吕冀，也不买路。',
            ['守住一处', '可核验的缺口', '不买路'], ['买路', '求云家抽身', '已经斩了吕冀']],
          ['refuse_extract', '拒绝抽身', 'refuse_yun_extraction', '不走商路缝',
            '我明确不走云家商路缝，把人留在缺口上硬扛这一波合围。',
            ['不走云家', '硬扛这一波'], ['抽身', '沿商路走']],
        ],
      }),
      card({
        id: 'opportunity.lyl.s05_03.extract_with_yun', title: '借云家的缝抽出山口镇', characterIds: [YUN],
        whyNow: '官道已被四营盯住，云苍峰还能沿货路留一条缝。',
        nextStep: '走云家抽身缝，不在官道上与汉军对旗。',
        stakes: '这条缝记在云家账上；吕氏会把云氏看成把人弄走的那一方。',
        rewardPreview: '取得一次调用云氏围场抽身缝的权限。',
        futureHint: '以后再被官军卡死，云苍峰会记得你走没走过他留的缝。',
        actionText: '我追踪“借云家的缝抽出山口镇”：沿货路抽身，不在官道上与四营对旗。',
        rewardKey: 'permission.lyl.yun.encirclement_extract', rewardLabel: '云氏·围场抽身缝',
        trigger: { actorIds: [YUN], actionIds: ['open_safe_route'] }, expiry: 'standard', expiresAfterTurns: 4,
        steps: [
          ['take_gap', '沿货路进入抽身缝', 'enter_yun_cargo_gap', '进入货路缝',
            '我按云苍峰指定的货路编列进入抽身缝，不走已被盯住的官道。',
            ['货路', '抽身缝', '不走', '官道'], ['硬扛', '对旗', '去斩吕冀']],
          ['no_boast', '不把抽身缝说成破营', 'conceal_extract_as_rout', '不宣扬破营',
            '我离开时不把这条缝说成已经破了吕氏之围，只记下是云家留的路。',
            ['不把这条缝说成', '云家留的路'], ['已经破营', '四营已溃']],
        ],
      }),
    ],
  }),
});

export {
  INSTALLS, add, coreOf, person, bind, card, DONG_MIN, generated, root,
  YUN, LV_JI, DONG, LV_ZHI, ZHAO, XIE, ZHUO, XIAO_YAO, XIAO_ZI,
  FAC_YUN, FAC_HAN, FAC_LV, FAC_LIANG, FAC_XY, FAC_TAIYI, FAC_BIYU, FAC_HEIMO, FAC_SONG, FAC_JIN,
};
