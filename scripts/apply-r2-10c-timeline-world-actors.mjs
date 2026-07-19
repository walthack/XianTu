import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const stagePath = resolve('mod-kit/generated/deepseek-v4-flash/yange/stages/lyg.dingtao_beijing.json');

function evidence(prefix, actor) {
  const result = {};
  result['identity.rank'] = prefix;
  for (const group of ['personality', 'motives', 'resources']) {
    for (const key of Object.keys(actor[group])) result[`${group}.${key}`] = prefix;
  }
  for (const [targetId, relation] of Object.entries(actor.relationships || {})) {
    for (const key of Object.keys(relation)) result[`relationships.${targetId}.${key}`] = prefix;
  }
  for (const agenda of actor.agendas) result[`agendas.${agenda.id}.clock`] = prefix;
  return result;
}

function actor(config) {
  const value = {
    characterId: config.characterId,
    identity: config.identity,
    personality: config.personality,
    motives: config.motives,
    resources: config.resources,
    relationships: config.relationships || {},
    knowledge: config.knowledge,
    agendas: config.agendas,
    allowedActionIds: config.allowedActionIds,
  };
  value.evidence = evidence(config.evidence, value);
  return value;
}

function binding(config) {
  return {
    actionId: config.actionId,
    actorIds: config.actorIds,
    label: config.label,
    reason: config.reason,
    knownFacts: config.knownFacts,
    mustNotInvent: config.mustNotInvent,
    visibleSignal: config.visibleSignal,
    offscreenAction: config.offscreenAction,
    ...(config.requirements ? { requirements: config.requirements } : {}),
    ...(config.costs ? { costs: config.costs } : {}),
    ...(config.effects ? { effects: config.effects } : {}),
    ...(config.utility ? { utility: config.utility } : {}),
    ...(config.canonTags ? { canonTags: config.canonTags } : {}),
    visibility: config.visibility,
    durationTurns: config.durationTurns,
  };
}

const stage = JSON.parse(await readFile(stagePath, 'utf8'));
const byId = new Map(stage.scenario.events.map(event => [event.id, event]));
const requireEvent = id => {
  const event = byId.get(id);
  if (!event) throw new Error(`Missing event ${id}`);
  return event;
};

const guojie = requireEvent('lyg.event.s01_06');
guojie.timeline = {
  kind: 'canon_anchor',
  notBeforeTurns: 1,
  deadlineTurns: 6,
  reveal: { publicAfterTurns: 1, playerKnowledge: 'public_report' },
};
guojie.offscreenResolution = {
  id: 'offscreen.r2_10.lyg_event_s01_06',
  afterStallTurns: 99,
  flagKey: 'world.r2_10.lyg_event_s01_06.occurred',
  resolvedEventIds: ['lyg.event.s01_06'],
  worldDelta: '郭解护持新君时遭剑玉姬重创，伤势最终夺去性命；消息稍后才由宫中传出，玩家未被伪记为亲历。',
  evidence: '裁定 #95 与 yange.3.1：默认正典为郭解伤重身亡；只有显式生还 IF 可替代，时间合同只结算默认线。',
};
guojie.worldActor = {
  pressure: {
    id: 'world.lyg.s01_06.assassination_window',
    scope: 'local',
    summary: '新帝立足未稳，剑玉姬正在逼近；郭解必须在刺杀压力下护住定陶王。',
    domains: ['security', 'court', 'assassination'],
    geography: ['洛都', '宫城'],
    factionIds: ['liuchao.faction.wu_zong', 'liuchao.faction.han_guo_chao_ting'],
    intensity: 3,
    canonPolicy: 'process_only',
  },
  decisionCore: {
    situation: {
      whitelist: ['royalSafety', 'assailantPressure'],
      initialValues: { royalSafety: 48, assailantPressure: 72 },
      limits: {
        royalSafety: { min: 0, max: 100 },
        assailantPressure: { min: 0, max: 100 },
      },
    },
    canonPolicy: {
      invariant: ['默认正典中郭解为护持定陶王而重伤身亡'],
      forbiddenBefore: ['event.dong_zhuo_death', 'secret.ruan_xiangning_identity'],
      processFreedom: ['定陶王撤离路线', '游侠耳目的接应方式', '玩家是否亲历护送与承担后果'],
    },
    actors: [
      actor({
        characterId: 'liuchao.character.guo_jie',
        identity: { factionId: 'liuchao.faction.x6d397ffc7e', office: '布衣大侠、新君护持者', rank: 5 },
        personality: { aggression: 3, caution: 2, honor: 5, ambition: 1 },
        motives: { control: 2, legitimacy: 4, stability: 5 },
        resources: { influence: 4, wealth: 1, troops: 2, intelligence: 4 },
        knowledge: ['定陶王刚完成登基', '宫城仍有敌对高手活动', '游侠耳目可用于疏散与传讯'],
        agendas: [{
          id: 'agenda.lyg.s01_06.guo_jie',
          goal: '不惜自身代价护住定陶王并留下可继续运作的护持网络',
          clock: 1,
          escalation: ['确认威胁', '护送新君', '把护持责任交给可信之人'],
        }],
        allowedActionIds: ['protect_principal', 'escort_witness', 'open_safe_route'],
        evidence: 'yange.3.1 与裁定 #95：郭解以布衣大侠身份保护定陶王，游侠网络可承接护持但不能夺位。',
      }),
      actor({
        characterId: 'liuchao.character.jian_yu_ji',
        identity: { factionId: 'liuchao.faction.wu_zong', office: '巫宗仙姬、刺杀行动主导者', rank: 5 },
        personality: { aggression: 4, caution: 4, honor: 1, ambition: 5 },
        motives: { control: 5, legitimacy: 1, stability: 1 },
        resources: { influence: 4, wealth: 4, troops: 2, intelligence: 5 },
        knowledge: ['郭解正在护持定陶王', '宫城秩序仍在重组', '公开交战会暴露行动目的'],
        agendas: [{
          id: 'agenda.lyg.s01_06.jian_yu_ji',
          goal: '突破护持力量并完成对郭解的致命打击',
          clock: 2,
          escalation: ['隐匿接近', '切断护送路线', '亲自出剑'],
        }],
        allowedActionIds: ['sabotage_agenda', 'conceal_evidence', 'block_road'],
        evidence: 'yange.3.1：剑玉姬亲自出剑重创郭解；人物卡支持其谨慎、控制与隐蔽行动取向。',
      }),
    ],
    actionBindings: [
      binding({
        actionId: 'protect_principal', actorIds: ['liuchao.character.guo_jie'],
        label: '贴身护住定陶王', reason: '把新君安全置于自身退路之前',
        knownFacts: ['定陶王刚完成登基', '宫城仍有敌对高手活动'],
        mustNotInvent: ['郭解已经死亡', '董卓之死', '刺客的未公开身份计划'],
        visibleSignal: '郭解亲自换到定陶王身侧，令随从先清出退路',
        offscreenAction: '以自身阻住致命一击并推动新君撤离',
        costs: { influence: 1, troops: 1 }, effects: { royalSafety: 7, assailantPressure: 1 },
        utility: { urgency: 4, factionGoal: 3, situation: { royalSafety: -5, assailantPressure: 4 }, escalation: 3 },
        visibility: 'public', durationTurns: 2,
      }),
      binding({
        actionId: 'escort_witness', actorIds: ['liuchao.character.guo_jie'],
        label: '调游侠耳目护送新君', reason: '让护持网络在本人失去行动力后仍能运转',
        knownFacts: ['游侠耳目可用于疏散与传讯'],
        mustNotInvent: ['未入档的游侠姓名', '具体人数'],
        visibleSignal: '数处不起眼的宫门同时有人换岗，护送路线开始收束',
        offscreenAction: '把新君交给分段接应的游侠耳目',
        costs: { influence: 1, intelligence: 1 }, effects: { royalSafety: 5, assailantPressure: -1 },
        utility: { factionGoal: 2, situation: { royalSafety: -4 }, escalation: 2 },
        visibility: 'rumor', durationTurns: 2,
      }),
      binding({
        actionId: 'open_safe_route', actorIds: ['liuchao.character.guo_jie'],
        label: '打开不经正门的撤离次序', reason: '减少新君与刺杀者正面接触的机会',
        knownFacts: ['宫城秩序仍在重组'],
        mustNotInvent: ['秘密暗道', '具体宫防数字'],
        visibleSignal: '郭解令近侍撤去一处仪仗，先让新君移往内殿',
        offscreenAction: '利用已知宫道调整撤离次序',
        costs: { intelligence: 1 }, effects: { royalSafety: 4, assailantPressure: -2 },
        visibility: 'public', durationTurns: 1,
      }),
      binding({
        actionId: 'sabotage_agenda', actorIds: ['liuchao.character.jian_yu_ji'],
        label: '切断郭解的护送部署', reason: '先破坏接应次序，再寻找一击窗口',
        knownFacts: ['郭解正在护持定陶王', '宫城秩序仍在重组'],
        mustNotInvent: ['阮香凝身份', '黑魔海后续计划', '具体伏兵人数'],
        visibleSignal: '原本相接的两路宫人忽然断了消息，护送次序出现缺口',
        offscreenAction: '令郭解不得不亲自补上护送缺口',
        costs: { intelligence: 1 }, effects: { royalSafety: -4, assailantPressure: 6 },
        utility: { urgency: 3, expectedBenefit: 3, situation: { royalSafety: 4, assailantPressure: -2 }, escalation: 3 },
        visibility: 'rumor', durationTurns: 2,
      }),
      binding({
        actionId: 'conceal_evidence', actorIds: ['liuchao.character.jian_yu_ji'],
        label: '隐去接近宫城的痕迹', reason: '避免护持者提前确定威胁来自何处',
        knownFacts: ['公开交战会暴露行动目的'],
        mustNotInvent: ['伪造的宫廷内应姓名', '未发生的毒杀'],
        visibleSignal: '几处问讯所得彼此矛盾，来人身份始终拼不完整',
        offscreenAction: '继续隐匿行踪并等待护送队形变化',
        costs: { intelligence: 1 }, effects: { assailantPressure: 3 },
        utility: { failureRisk: -2, situation: { assailantPressure: -2 }, escalation: 1 },
        visibility: 'hidden', durationTurns: 2,
      }),
      binding({
        actionId: 'block_road', actorIds: ['liuchao.character.jian_yu_ji'],
        label: '逼停一条护送路线', reason: '迫使郭解暴露本人和新君的位置',
        knownFacts: ['郭解正在护持定陶王'],
        mustNotInvent: ['具体封锁兵力', '未公开密道'],
        visibleSignal: '一处宫门忽然闭锁，护送人群被迫折返',
        offscreenAction: '压缩郭解可以选择的护送方向',
        costs: { influence: 1 }, effects: { royalSafety: -3, assailantPressure: 4 },
        utility: { urgency: 2, situation: { royalSafety: 3 }, escalation: 2 },
        visibility: 'public', durationTurns: 1,
      }),
    ],
    maxVisibleActions: 2,
    narrativeGuard: {
      forbiddenTerms: ['阮香凝', '盛姬', '董卓之死', '吕冀'],
      rejectConcreteQuantities: true,
      allowUnverifiedQuantities: true,
    },
  },
  opportunities: [{
    id: 'opportunity.lyg.s01_06.royal_escape',
    title: '护住新君的退路',
    characterIds: ['liuchao.character.guo_jie'],
    whyNow: '郭解已经察觉宫城护送次序出现缺口，定陶王需要一条不会被刺杀压力截断的退路。',
    nextStep: '协助郭解确认一条可用宫道并把定陶王交给下一段接应者；不得把介入等同于自动救下郭解。',
    stakes: '你可能亲历郭解承受致命代价，并被新朝视为护持责任的继承者。',
    rewardPreview: '取得一次调用洛都游侠耳目的行为权限。',
    futureHint: '郭解留下的护持网络会记住谁在最危险时接住了新君。',
    actionText: '我追踪“护住新君的退路”：协助郭解确认宫道、护送定陶王，并亲自把新君交到下一段接应者手中。',
    rewardKey: 'permission.lyg.guo_jie.youxia_dispatch',
    rewardLabel: '郭解·洛都游侠耳目一次调度',
  }],
};

const dongzhuo = requireEvent('lyg.event.s01_07');
dongzhuo.timeline = {
  kind: 'canon_anchor',
  notBeforeTurns: 0,
  deadlineTurns: 5,
  reveal: { publicAfterTurns: 1, playerKnowledge: 'public_report' },
};
dongzhuo.offscreenResolution = {
  id: 'offscreen.r2_10.lyg_event_s01_07',
  afterStallTurns: 99,
  flagKey: 'world.r2_10.lyg_event_s01_07.occurred',
  resolvedEventIds: ['lyg.event.s01_07'],
  worldDelta: '董卓伤重辞世，边地异动与凉州旧部的处置落到贾文和肩上；消息稍后传开，玩家未被伪记为在场送别。',
  evidence: '裁定 #95 与 yange.3.2：默认正典为董卓伤重辞世；显式生还 IF 可替代，时间合同不抢跑该分支。',
};
dongzhuo.worldActor = {
  pressure: {
    id: 'world.lyg.s01_07.liangzhou_succession',
    scope: 'faction',
    summary: '董卓伤势已无法支撑军中秩序，边警与凉州旧部必须在极短时间内找到承接者。',
    domains: ['military', 'succession', 'border'],
    geography: ['洛都', '凉州', '北境'],
    factionIds: ['liuchao.faction.liangzhou_army'],
    intensity: 3,
    canonPolicy: 'process_only',
  },
  decisionCore: {
    situation: {
      whitelist: ['liangzhouCohesion', 'borderAlarm'],
      initialValues: { liangzhouCohesion: 58, borderAlarm: 66 },
      limits: {
        liangzhouCohesion: { min: 0, max: 100 },
        borderAlarm: { min: 0, max: 100 },
      },
    },
    canonPolicy: {
      invariant: ['默认正典中董卓伤重辞世并留下边地军情'],
      forbiddenBefore: ['secret.ruan_xiangning_identity', 'event.lv_ji_execution'],
      processFreedom: ['凉州旧部的收束方式', '边警交给谁', '玩家是否承担传递与见证责任'],
    },
    actors: [
      actor({
        characterId: 'liuchao.character.dong_zhuo',
        identity: { factionId: 'liuchao.faction.liangzhou_army', office: '凉州军旧主、伤重边将', rank: 5 },
        personality: { aggression: 4, caution: 1, honor: 3, ambition: 4 },
        motives: { control: 4, legitimacy: 2, stability: 4 },
        resources: { influence: 5, wealth: 3, troops: 4, intelligence: 3 },
        knowledge: ['本人伤势已无法久持', '北境胡骑踪迹可疑', '凉州旧部可能因失去主将而分裂'],
        agendas: [{
          id: 'agenda.lyg.s01_07.dong_zhuo',
          goal: '在生命终点前把边警与军中责任交给能接住的人',
          clock: 2,
          escalation: ['压住哭声', '交代边警', '完成军中遗命'],
        }],
        allowedActionIds: ['public_declaration', 'spread_message', 'protect_principal'],
        evidence: 'yange.3.2 高光合同：董卓以军人方式送别、留下胡骑与边地剧变军情，不以哀号收场。',
      }),
      actor({
        characterId: 'liuchao.character.jia_wenhe',
        identity: { factionId: 'liuchao.faction.liangzhou_army', office: '凉州军谋主、旧部收束者', rank: 4 },
        personality: { aggression: 1, caution: 5, honor: 2, ambition: 3 },
        motives: { control: 4, legitimacy: 2, stability: 5 },
        resources: { influence: 4, wealth: 2, troops: 2, intelligence: 5 },
        knowledge: ['董卓伤势已无法久持', '凉州旧部需要明确退场次序', '定陶王登基结果不能被旧部争权破坏'],
        agendas: [{
          id: 'agenda.lyg.s01_07.jia_wenhe',
          goal: '接住董卓遗命并让凉州旧部退出洛都争权',
          clock: 1,
          escalation: ['收拢军令', '安排退场', '保留边警联络'],
        }],
        allowedActionIds: ['withdraw_force', 'reserve_supplies', 'prepare_fallback_route'],
        evidence: '裁定 #95 与 yange.3.2：贾文和送别旧主后必须收束凉州旧部，董卓生还 IF 中同样不得回京争权。',
      }),
    ],
    actionBindings: [
      binding({
        actionId: 'public_declaration', actorIds: ['liuchao.character.dong_zhuo'],
        label: '压住哭声交代军中遗命', reason: '用军人命令维持最后的秩序',
        knownFacts: ['本人伤势已无法久持', '凉州旧部可能因失去主将而分裂'],
        mustNotInvent: ['具体军队人数', '阮香凝身份', '吕冀后续'],
        visibleSignal: '董卓喝止哭声，令众将先报军令是否还能传下去',
        offscreenAction: '把旧部服从对象与退场次序交代清楚',
        costs: { influence: 1 }, effects: { liangzhouCohesion: 7, borderAlarm: 0 },
        utility: { urgency: 4, factionGoal: 4, situation: { liangzhouCohesion: -5 }, escalation: 3 },
        visibility: 'public', durationTurns: 2,
      }),
      binding({
        actionId: 'spread_message', actorIds: ['liuchao.character.dong_zhuo'],
        label: '把边警交给可信传递者', reason: '让胡骑异动不随本人死亡断线',
        knownFacts: ['北境胡骑踪迹可疑'],
        mustNotInvent: ['确定入侵日期', '权威兵力数字'],
        visibleSignal: '董卓让人取来边报，只圈出胡骑活动的方向与时段',
        offscreenAction: '把未经完全核实的边警交给贾文和与新朝',
        costs: { intelligence: 1 }, effects: { borderAlarm: 6, liangzhouCohesion: 2 },
        utility: { expectedBenefit: 3, situation: { borderAlarm: -3 }, escalation: 3 },
        visibility: 'public', durationTurns: 1,
      }),
      binding({
        actionId: 'protect_principal', actorIds: ['liuchao.character.dong_zhuo'],
        label: '最后确认新帝不受旧部挟持', reason: '让拥立结果不因本人退场倒退',
        knownFacts: ['定陶王已经登基'],
        mustNotInvent: ['新帝私下承诺', '董卓继续掌权'],
        visibleSignal: '董卓命旧部不得借其名义再入宫争权',
        offscreenAction: '以最后军令切断旧部挟持新帝的借口',
        costs: { influence: 1 }, effects: { liangzhouCohesion: 3 },
        visibility: 'rumor', durationTurns: 1,
      }),
      binding({
        actionId: 'withdraw_force', actorIds: ['liuchao.character.jia_wenhe'],
        label: '安排凉州旧部退出洛都争权', reason: '先把最危险的军政冲突从宫城移开',
        knownFacts: ['凉州旧部需要明确退场次序', '定陶王登基结果不能被旧部争权破坏'],
        mustNotInvent: ['具体撤军数量', '未经确认的封赏'],
        visibleSignal: '贾文和把诸营退场次序写成短札，只留一处边警联络',
        offscreenAction: '分批收束旧部并停止以董卓名义干预宫城',
        costs: { influence: 1, intelligence: 1 }, effects: { liangzhouCohesion: 5, borderAlarm: -1 },
        utility: { urgency: 3, factionGoal: 5, situation: { liangzhouCohesion: -5 }, escalation: 3 },
        visibility: 'public', durationTurns: 2,
      }),
      binding({
        actionId: 'reserve_supplies', actorIds: ['liuchao.character.jia_wenhe'],
        label: '为退往边地的旧部留出补给', reason: '没有补给的退场会迅速变成兵变',
        knownFacts: ['凉州旧部需要明确退场次序'],
        mustNotInvent: ['具体粮秣数字', '未入档仓库'],
        visibleSignal: '数份军需簿被重新封签，优先标出退往边地的路线',
        offscreenAction: '保留足以维持退场秩序的补给',
        costs: { wealth: 1, intelligence: 1 }, effects: { liangzhouCohesion: 4, borderAlarm: -1 },
        utility: { situation: { liangzhouCohesion: -3 }, escalation: 1 },
        visibility: 'rumor', durationTurns: 2,
      }),
      binding({
        actionId: 'prepare_fallback_route', actorIds: ['liuchao.character.jia_wenhe'],
        label: '保留边警失联后的备用传递线', reason: '旧主退场后仍要让北境消息抵达新朝',
        knownFacts: ['北境胡骑踪迹可疑'],
        mustNotInvent: ['暗桩名单', '确定开战时间'],
        visibleSignal: '贾文和把同一份边警拆成两路传递，彼此不知全貌',
        offscreenAction: '建立不依赖单一使者的边警传递线',
        costs: { intelligence: 1 }, effects: { borderAlarm: 3, liangzhouCohesion: 1 },
        utility: { expectedBenefit: 2, situation: { borderAlarm: -2 }, escalation: 2 },
        visibility: 'hidden', durationTurns: 2,
      }),
    ],
    maxVisibleActions: 2,
    narrativeGuard: {
      forbiddenTerms: ['阮香凝', '盛姬', '黑魔海', '吕冀赐死'],
      rejectConcreteQuantities: true,
      allowUnverifiedQuantities: true,
    },
  },
  opportunities: [{
    id: 'opportunity.lyg.s01_07.border_warning',
    title: '接住董卓的边地军情',
    characterIds: ['liuchao.character.dong_zhuo', 'liuchao.character.jia_wenhe'],
    whyNow: '董卓已经无法久持，胡骑异动若没有明确接手者，会随旧部退场断线。',
    nextStep: '确认军情来源与不确定性，把边警交给新朝或一条可持续的联络线。',
    stakes: '接下这份军情意味着以后必须为误报、迟报或边地剧变承担政治责任。',
    rewardPreview: '取得一次向贾文和核对边警来源与备选判断的权限。',
    futureHint: '北境真正起变时，贾文和会优先向曾接住军情的人递出第二份判断。',
    actionText: '我追踪“接住董卓的边地军情”：核对消息来源与不确定性，并把边警交给一条能在凉州旧部退场后继续运作的联络线。',
    rewardKey: 'permission.lyg.jia_wenhe.border_warning',
    rewardLabel: '贾文和·边警来源核对与备用判断',
  }],
};

const ruan = requireEvent('lyg.event.s01_08');
ruan.timeline = {
  kind: 'emergent',
  notBeforeTurns: 1,
  reveal: { playerKnowledge: 'immediate' },
};
ruan.worldActor = {
  pressure: {
    id: 'world.lyg.s01_08.secret_disclosure',
    scope: 'character',
    summary: '阮香凝掌握一条会改变玩家判断的盛姬线索，但公开方式会同时暴露她自己的风险。',
    domains: ['knowledge', 'trust', 'secret'],
    geography: ['洛都', '宫内'],
    factionIds: ['liuchao.faction.cheng_shi_shang_hui'],
    intensity: 2,
    canonPolicy: 'local_state',
  },
  decisionCore: {
    situation: {
      whitelist: ['trustWindow', 'exposureRisk'],
      initialValues: { trustWindow: 56, exposureRisk: 62 },
      limits: {
        trustWindow: { min: 0, max: 100 },
        exposureRisk: { min: 0, max: 100 },
      },
    },
    canonPolicy: {
      invariant: ['只有阮香凝向程宗扬明确交谈后，玩家才获得盛姬关联知识'],
      forbiddenBefore: ['event.lv_ji_execution'],
      processFreedom: ['核验线索来源', '谈话地点与见证者', '玩家是否继续追查盛姬'],
    },
    actors: [
      actor({
        characterId: 'liuchao.character.ruan_xiang_ning',
        identity: { factionId: 'liuchao.faction.cheng_shi_shang_hui', office: '程氏商会内线知情者', rank: 3 },
        personality: { aggression: 1, caution: 5, honor: 2, ambition: 2 },
        motives: { control: 3, legitimacy: 1, stability: 4 },
        resources: { influence: 2, wealth: 2, troops: 0, intelligence: 5 },
        knowledge: ['定陶王因盛姬而对阮香凝产生亲近感', '盛姬与黑魔海御姬奴有关', '这条线索尚未向无关人物公开'],
        agendas: [{
          id: 'agenda.lyg.s01_08.ruan_xiangning',
          goal: '把盛姬线索交给程宗扬，同时控制秘密外泄范围',
          clock: 1,
          escalation: ['确认谈话安全', '交代关联', '协助核验来源'],
        }],
        allowedActionIds: ['verify_rumor', 'gather_intelligence', 'conceal_evidence'],
        evidence: 'yange.8.2 与裁定 #108-109：阮香凝可向程宗扬揭露盛姬关联，其他未获知人物不得自动继承秘密。',
      }),
    ],
    actionBindings: [
      binding({
        actionId: 'verify_rumor', actorIds: ['liuchao.character.ruan_xiang_ning'],
        label: '先核对定陶王亲近她的缘由', reason: '避免把相似感受直接当成完整秘密',
        knownFacts: ['定陶王因盛姬而对阮香凝产生亲近感'],
        mustNotInvent: ['盛姬当前下落', '其他人物已经知情', '未入档血缘'],
        visibleSignal: '阮香凝避开旁人，先问定陶王近日是否提过相似的旧人',
        offscreenAction: '继续核对定陶王的言行与盛姬线索',
        costs: { intelligence: 1 }, effects: { trustWindow: 4, exposureRisk: -2 },
        utility: { urgency: 5, factionGoal: 3, expectedBenefit: 4, situation: { trustWindow: -3, exposureRisk: 3 }, escalation: 2 },
        visibility: 'public', durationTurns: 1,
      }),
      binding({
        actionId: 'gather_intelligence', actorIds: ['liuchao.character.ruan_xiang_ning'],
        label: '补齐盛姬关联的可核线索', reason: '让玩家能区分她亲知的事实与仍待查证的推断',
        knownFacts: ['盛姬与黑魔海御姬奴有关'],
        mustNotInvent: ['黑魔海完整组织图', '未来事件', '未经核实的具体人数'],
        visibleSignal: '阮香凝取出一份只写称谓与接触次序的短记，没有列无关姓名',
        offscreenAction: '整理可向程宗扬说明的最小事实集',
        costs: { intelligence: 1 }, effects: { trustWindow: 5, exposureRisk: 1 },
        utility: { factionGoal: 2, situation: { trustWindow: -4 }, escalation: 2 },
        visibility: 'rumor', durationTurns: 2,
      }),
      binding({
        actionId: 'conceal_evidence', actorIds: ['liuchao.character.ruan_xiang_ning'],
        label: '控制谈话的知情范围', reason: '秘密一旦被无关人物听见就会反向伤及她与玩家',
        knownFacts: ['这条线索尚未向无关人物公开'],
        mustNotInvent: ['暗桩名单', '吕雉或霍子孟已知秘密'],
        visibleSignal: '阮香凝确认门外无人后才继续，并要求不要代她向外公开身份',
        offscreenAction: '等待更安全的单独谈话窗口',
        costs: { intelligence: 1 }, effects: { exposureRisk: -5, trustWindow: -1 },
        utility: { failureRisk: -2, situation: { exposureRisk: 5 }, escalation: 1 },
        visibility: 'hidden', durationTurns: 2,
      }),
    ],
    maxVisibleActions: 2,
    narrativeGuard: {
      forbiddenTerms: ['吕冀赐死', '未来处置结果'],
      rejectConcreteQuantities: true,
      allowUnverifiedQuantities: true,
    },
  },
  opportunities: [{
    id: 'opportunity.lyg.s01_08.verify_shengji',
    title: '核验盛姬留下的关联',
    characterIds: ['liuchao.character.ruan_xiang_ning'],
    whyNow: '定陶王对阮香凝的亲近已经显出异常，继续拖延只会让线索与政治猜测混在一起。',
    nextStep: '与阮香凝单独交谈，区分她亲知的事实、定陶王的反应和仍需核验的盛姬线索。',
    stakes: '追查可能暴露阮香凝掌握秘密的范围，未经她同意向外披露会产生关系与政治风险。',
    rewardPreview: '获得一次向阮香凝核对秘密来源与知情边界的权限。',
    futureHint: '后续再遇黑魔海相关线索时，她会明确区分“亲知”“推断”和“不知”。',
    actionText: '我追踪“核验盛姬留下的关联”：与阮香凝单独交谈，逐项区分亲知事实、定陶王反应与仍待核验的推断。',
    rewardKey: 'permission.lyg.ruan_xiangning.source_check',
    rewardLabel: '阮香凝·秘密来源核对与知情边界',
  }],
};

await writeFile(stagePath, `${JSON.stringify(stage, null, 2)}\n`);
console.log(`R2-10C timeline/world actors applied: ${stagePath}`);
