#!/usr/bin/env node

// R2-12 第二批：处理风险评分最高 25 张卡中的确定性问题。
// 只改有原文时间轴支持的逐关开场关系、完全相同的关系链重复项；默认 dry-run。

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const canonDir = resolve(root, 'mod-kit/generated/deepseek-v4-flash/character-canon');
const files = [
  'character-cards-v3.json',
  'qingyu.character-cards-v3.json',
  'yunlong.character-cards-v3.json',
  'yange.character-cards-v3.json',
];
const apply = process.argv.includes('--apply');

const stageSet = (...ids) => new Set(ids);
const LCQ_PRE_XIAOZI = stageSet(
  'lcq.stage_03b_snake_flower_bridge', 'lcq.stage_04b_lingfei_baiyi_crisis',
  'lcq.stage_05', 'lcq.stage_05b', 'lcq.stage_06',
);
const LCQ_PRE_ZHUO = stageSet(
  'lcq.stage_01', 'lcq.stage_03b_snake_flower_bridge',
  'lcq.stage_04b_lingfei_baiyi_crisis', 'lcq.stage_05b', 'lcq.stage_06',
  'lcq.stage_07_qingyuan_jiankang',
);
const YUNLONG_THROUGH_SACRED_FRUIT = stageSet(
  'lyl.jiangzhou_retreat', 'lyl.lin_an_black_sea', 'lyl.lin_an_bridge',
  'lyl.taiquan_expedition', 'lyl.xiaoyingzhou_blacksea_trap',
  'lyl.taiquan_sacred_fruit',
);
const YUNLONG_THROUGH_AFTERFALL = stageSet(
  ...YUNLONG_THROUGH_SACRED_FRUIT,
  'lyl.taiquan_core_conflict', 'lyl.taiquan_afterfall',
);
const ALL_YUNLONG = stageSet(
  ...YUNLONG_THROUGH_AFTERFALL,
  'lyl.luoyang_cloud_secret', 'lyl.luoyang_coup', 'lyl.han_palace_endgame',
);
const YANGE_THROUGH_HAN_SUCCESSION = stageSet(
  'lyg.dingtao_beijing', 'lyg.mijing_rumen', 'lyg.han_succession',
);

const PRE = {
  小紫: {
    stages: LCQ_PRE_XIAOZI,
    role: '同行的神秘少女',
    description: '来历成谜的少女，表面天真娇憨，实际心思敏锐；她与程宗扬正在由同行逐步建立信任。',
    personality: ['表面天真娇憨', '观察敏锐', '真实心思尚未完全显露', '会保护认下的同行者'],
    relation: '同行伙伴；本关开场尚未与程宗扬确立后宫或正宫关系',
    forbidden: ['第229序关系确认前不得称为程宗扬后宫之首或正宫'],
  },
  卓云君: {
    stages: LCQ_PRE_ZHUO,
    identity: '太乙真宗御教仙姑',
    role: '太乙真宗教御',
    description: '太乙真宗御教卓云君，修为高深且重视宗门身份；本关开场仍有自己的立场，尚未受制于程宗扬阵营。',
    personality: ['高傲端庄', '重视宗门身份', '虚荣且强撑尊严', '处事谨慎'],
    speechStyle: '端庄克制，以太乙真宗教御身份说话',
    signatureAbilities: ['太乙真宗火系术法', '太乙真宗房中修炼法门'],
    relation: '太乙真宗教御；与程宗扬立场多有冲突，尚未被擒或归入其阵营',
    forbidden: ['第243序被擒前不得称为侍奴、后宫或程宗扬内宅成员'],
  },
  吕雉: {
    stages: stageSet(...ALL_YUNLONG, ...YANGE_THROUGH_HAN_SUCCESSION),
    role: '汉国太后与吕氏权力核心',
    description: '汉国太后吕雉仍以吕氏与飞羽族存续为先，在朝局中与程宗扬既对立又有交易空间。',
    personality: ['冷静', '威严', '隐忍但不卑微', '善于权谋'],
    speechStyle: '自称哀家或我，语气冷静威严',
    relation: '汉国吕氏权力核心；本关开场尚未向程宗扬委身或确立从属关系',
    forbidden: ['第1019序关系转折前不得称为程宗扬奴婢或后宫成员'],
  },
  阮香琳: {
    stages: YUNLONG_THROUGH_SACRED_FRUIT,
    personality: ['精明爽快', '市侩现实', '重视家业与女儿安危', '前期对程宗扬戒备'],
    relation: '威远镖局镖头夫人、李师师义母；本关开场尚未归入程宗扬后宫',
    forbidden: ['第641序关系转折前不得称为程宗扬后宫成员'],
  },
  孙寿: {
    stages: YUNLONG_THROUGH_AFTERFALL,
    identity: '襄城君、吕冀之妻',
    role: '吕氏外戚女眷',
    description: '襄城君孙寿出身吕氏外戚集团，骄横而善于趋利避害；本关开场尚未成为程宗扬内宅成员。',
    appearance: '衣饰华贵，保持襄城君的世家女眷仪态。',
    personality: ['骄横', '贪婪虚荣', '心狠手辣', '欺软怕硬', '善于趋利避害'],
    speechStyle: '以襄城君身份说话，骄矜而强势',
    principles: ['维护自身与吕氏外戚利益', '趋利避害'],
    relation: '吕氏外戚女眷；本关开场尚未被程宗扬收编为妾室或侍奴',
    forbidden: ['第776序受制前不得称为程宗扬妾室、侍奴或内宅成员'],
  },
  杨玉环: {
    stages: 'all',
    identity: '太真公主、镇国大长公主',
    relation: '唐国太真公主；与程宗扬互相试探并结为盟友，现有时间轴尚未确立后宫关系',
    forbidden: ['现有正典时间轴截至第1399序，不得提前称为程宗扬伴侣或后宫成员'],
  },
  尹馥兰: {
    stages: YUNLONG_THROUGH_AFTERFALL,
    identity: '原青叶教掌教夫人，现受制于程氏阵营',
    role: '受制的青叶教掌教夫人',
    description: '尹馥兰原为青叶教掌教夫人，眼下处境受制，但本关开场尚未与程宗扬确立姬妾或侍奴关系。',
    appearance: '丰腴熟美，仍带昔日掌教夫人的仪态。',
    personality: ['世故', '善于察言观色', '处境受制时谨慎自保'],
    principles: ['先求自保', '不轻易放弃旧身份带来的体面'],
    relation: '受制于程氏阵营；本关开场尚未成为程宗扬姬妾或侍奴',
    forbidden: ['第707序关系转折前不得称为兰奴、姬妾或性奴'],
  },
  安乐公主: {
    stages: stageSet(
      'lyg.han_succession', 'lyg.changgan_interlude', 'lyg.ganlu_bian',
      'lyg.liangzhou_league', 'lyg.buddhist_conspiracy', 'lyg.ganlu_aftershock',
    ),
    relation: '唐国公主、李昂胞妹；本关开场尚未被程宗扬收入内宅',
    forbidden: ['第1297序关系转折前不得称为程宗扬情妇、侍奴或后宫成员'],
  },
  鱼玄机: {
    stages: 'all',
    personality: ['美艳才女', '善于权衡利害', '谨慎维护自身靠山'],
    speechStyle: '才女式含蓄措辞，面对权势时谨慎周旋',
    relation: '咸宜观女冠、鱼朝恩族人；当前投影均早于关系转折，与程宗扬尚无从属关系',
    forbidden: ['第1381序关系转折前不得称为程宗扬侍奴或后宫成员'],
  },
  相雅: {
    stages: stageSet('lyl.jiangzhou_retreat'),
    relation: '荆溪族女子；本关开场与程宗扬尚未相识，关系须由关内救援与投靠事件推进',
    forbidden: ['第553序相遇前不得称程宗扬为主人或写成其女奴、伴侣'],
  },
  齐羽仙: {
    stages: 'all',
    relation: '黑魔海巫宗执行者；当前投影均早于关系转折，与程宗扬保持合作、戒备或敌对',
    forbidden: ['第1380序关系转折前不得称为已被程宗扬收服'],
  },
  成光: {
    stages: stageSet('lyg.dingtao_beijing'),
    identity: '江都王太子妃、吕氏案阶下囚',
    role: '吕氏案阶下囚',
    description: '刘建败亡后，成光以江都王太子妃身份沦为阶下囚；本关开场尚未被程宗扬收编。',
    appearance: '云髻修眉，丹唇皓齿，面容娇艳。',
    personality: ['懦弱胆小', '逆来顺受', '在阶下囚处境中以自保为先'],
    speechStyle: '处境受制时谨慎低声，避免激怒掌权者',
    principles: ['以保全性命与身份为先'],
    relation: '吕氏案阶下囚；本关开场尚未被程宗扬收编为侍奴或鼎炉',
    forbidden: ['第965序关系转折前不得称为程宗扬侍奴或鼎炉'],
  },
};

// 这些角色的已知转折早于其全部当前逐关投影；静态档案不改，只关闭旧待办旗标。
const ALL_CURRENT_PROJECTIONS_POST = new Set(['罂粟女', '惊理', '云如瑶', '蛇夫人']);
const EXACT_CHAIN_DEDUPE = new Set(['小紫', '卓云君', '阮香琳', '惊理']);
const INTERNAL_NOTE_TAGS = ['【关系】', '【称呼】', '【目标】', '【软肋】', '【入伙】', '【情节】', '【结局】'];
const NOTE = '2026-07-22：R2-12 第二批按原文时间轴完成当前逐关开场关系投影；关内发生的转折不得回灌至开场。';

function appendHumanNote(review, note) {
  const notes = Array.isArray(review.humanNotes)
    ? review.humanNotes
    : review.humanNotes ? [review.humanNotes] : [];
  if (!notes.includes(note)) notes.push(note);
  review.humanNotes = notes;
}

function dedupeRelationshipChain(card) {
  const seen = new Set();
  card.phaseIdentities = (card.phaseIdentities || []).filter(phase => {
    if (phase.scope !== 'relationship-chain') return true;
    const key = JSON.stringify(phase);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function applyOpeningRule(card, rule) {
  for (const phase of card.phaseIdentities || []) {
    if (phase.scope !== 'stage-projection') continue;
    if (rule.stages !== 'all' && !rule.stages.has(phase.stageId)) continue;
    if (rule.identity) phase.identity = rule.identity;
    if (rule.role) phase.role = rule.role;
    if (rule.description) phase.description = rule.description;
    for (const key of ['appearance', 'personality', 'speechStyle', 'principles', 'signatureAbilities']) {
      if (Object.prototype.hasOwnProperty.call(rule, key)) phase[key] = rule[key];
    }
    phase.blockedStageNotePrefixes = ['【性癖】', '【身体】'];
    phase.relationToProtagonist = [rule.relation];
    phase.formsOfAddress = [];
    phase.goals = [];
    phase.weaknesses = [];
    phase.joining = [];
    phase.keyEvents = [];
    phase.ending = [];
    phase.forbidden = rule.forbidden;
    phase.notes = (phase.notes || []).filter(
      note => !INTERNAL_NOTE_TAGS.some(tag => String(note).startsWith(tag)),
    );
    phase.notes.unshift(`【关系】${rule.relation}`);
  }
}

function resolveCard(card) {
  const before = JSON.stringify(card);
  if (EXACT_CHAIN_DEDUPE.has(card.canonicalName)) dedupeRelationshipChain(card);

  const rule = PRE[card.canonicalName];
  if (rule) applyOpeningRule(card, rule);

  if (rule || ALL_CURRENT_PROJECTIONS_POST.has(card.canonicalName)) {
    card.review ||= {};
    card.review.flags = (card.review.flags || []).filter(
      flag => flag !== 'female-relationship-phase-needed',
    );
    if (!card.review.flags.includes('relationship-phase-resolved')) {
      card.review.flags.push('relationship-phase-resolved');
    }
    appendHumanNote(card.review, NOTE);
  }
  return before !== JSON.stringify(card);
}

const summaries = [];
for (const file of files) {
  const path = resolve(canonDir, file);
  const data = JSON.parse(await readFile(path, 'utf8'));
  const changedCards = [];
  for (const card of data.characters || []) {
    if (resolveCard(card)) changedCards.push(card.canonicalName);
  }
  if (apply && changedCards.length) await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
  summaries.push({ file, changedCards });
}

console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', summaries }, null, 2));
