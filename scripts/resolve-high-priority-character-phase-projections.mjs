#!/usr/bin/env node

// R2-12：把已人工核定的关系转折落实到逐关开场投影。
// 默认 dry-run；传 --apply 才写入总卡与三本分卷卡。

import { constants, copyFile, readFile, writeFile } from 'node:fs/promises';
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

const PRE = {
  阿夕: {
    stages: new Set([
      'lcq.stage_03b_snake_flower_bridge',
      'lcq.stage_04b_lingfei_baiyi_crisis',
      'lcq.stage_05',
      'lcq.stage_05b',
    ]),
    relation: '花苗少女；本关开场尚未成为程宗扬内宅成员或女奴',
    forbidden: ['不得提前称为程宗扬的女奴、内宅成员'],
  },
  何漪莲: {
    stages: 'all',
    relation: '洛帮帮主；尚未成为程宗扬内宅成员',
    forbidden: ['不得写成何进之女', '不得提前写成程宗扬内宅成员'],
  },
  潘金莲: {
    stages: new Set([
      'lcq.stage_03b_snake_flower_bridge', 'lcq.stage_04b_lingfei_baiyi_crisis',
      'lcq.stage_05b', 'lcq.stage_06', 'lcq.stage_07_qingyuan_jiankang',
      'lcq.stage_08_jiankang_coup', 'lcq.stage_09_trade_and_escape',
      'lcq.stage_10_jiangzhou_shadow_war', 'lcq.stage_11_lieshan_battle',
      'lcq.stage_12_jiangzhou_counterwar', 'lyl.taiquan_core_conflict',
      'lyg.han_succession', 'lyg.changgan_begins', 'lyg.shixiang_ambush',
      'lyg.changgan_interlude',
    ]),
    relation: '光明观堂高阶医女；因乐明珠之事追索程宗扬，尚未归入其阵营或后宫',
    forbidden: ['不得提前称为程宗扬后宫或效忠者', '不得改变元红保留的人工裁定'],
  },
  萧氏: {
    stages: 'all',
    relation: '唐国太后；本关开场尚未被程宗扬阵营收编',
    forbidden: ['不得提前称为程宗扬阵营成员或从属'],
  },
  雁儿: {
    stages: new Set([
      'lcq.stage_03b_snake_flower_bridge', 'lcq.stage_04b_lingfei_baiyi_crisis',
      'lcq.stage_05b', 'lcq.stage_06', 'lcq.stage_07_qingyuan_jiankang',
      'lcq.stage_08_jiankang_coup', 'lcq.stage_09_trade_and_escape',
      'lcq.stage_10_jiangzhou_shadow_war', 'lcq.stage_11_lieshan_battle',
      'lcq.stage_12_jiangzhou_counterwar',
    ]),
    relation: '程宅侍女；本关开场仍为侍女，第284章关系转折须由关内事件推进后成立',
    forbidden: ['第284章事件前不得写成侍妾或已有性关系'],
  },
  虞白樱: {
    stages: new Set(['lyl.taiquan_core_conflict']),
    relation: '女杀手、虞紫薇的双胞胎姐姐；尚未成为程宗扬后宫成员',
    forbidden: ['不得提前写成程宗扬后宫成员'],
  },
  云丹琉: {
    stages: new Set([
      'lyl.lin_an_bridge', 'lyl.xiaoyingzhou_blacksea_trap',
      'lyl.taiquan_sacred_fruit', 'lyl.taiquan_afterfall',
      'lyl.luoyang_cloud_secret',
    ]),
    relation: '云氏女骑士；本关开场尚未与程宗扬确立伴侣或后宫关系',
    forbidden: ['“欲醉”事件前不得写成程宗扬后宫或伴侣'],
  },
  赵合德: {
    stages: new Set([
      'lyl.lin_an_bridge', 'lyl.xiaoyingzhou_blacksea_trap',
      'lyl.taiquan_sacred_fruit', 'lyl.taiquan_afterfall',
      'lyl.luoyang_cloud_secret', 'lyl.luoyang_coup',
    ]),
    relation: '汉国昭仪、赵飞燕之妹；本关开场尚未与程宗扬确立妾室或情人关系',
    forbidden: ['“弑君”事件前不得写成程宗扬妾室或情人', '不得把友通期当作真赵合德'],
  },
  阮香凝: {
    stages: new Set([
      'lyl.lin_an_black_sea', 'lyl.lin_an_bridge',
      'lyl.taiquan_expedition', 'lyl.xiaoyingzhou_blacksea_trap',
    ]),
    identity: '林冲之妻（此时真实姓名与阵营身份尚未揭示）',
    role: '林娘子',
    description: '林冲之妻，身份仍有疑点；本关开场不得由全局档案补出真实姓名、阵营或未来关系。',
    hideCanonicalAlias: true,
    relation: '林冲之妻；与程宗扬尚无后宫关系',
    forbidden: [
      '不得提前揭示真实姓名、真实阵营或未来关系',
      '正式关系转折前不得写成程宗扬侍妾或后宫成员',
    ],
  },
};

const REMOVE_STALE = new Map([
  ['黄氏', new Set(['lyl.taiquan_expedition'])],
  ['刘娥', new Set(['lyl.taiquan_expedition'])],
]);

const INTERNAL_NOTE_TAGS = ['【关系】', '【称呼】', '【目标】', '【软肋】', '【入伙】', '【情节】', '【结局】'];

function appendHumanNote(review, note) {
  const current = Array.isArray(review.humanNotes)
    ? review.humanNotes
    : review.humanNotes ? [review.humanNotes] : [];
  if (!current.includes(note)) current.push(note);
  review.humanNotes = current;
}

function resolveCard(card) {
  let changed = 0;
  const stale = REMOVE_STALE.get(card.canonicalName);
  if (stale) {
    const before = card.phaseIdentities?.length || 0;
    card.phaseIdentities = (card.phaseIdentities || []).filter(
      phase => !(phase.scope === 'stage-projection' && stale.has(phase.stageId)),
    );
    changed += before - card.phaseIdentities.length;
  }

  const rule = PRE[card.canonicalName];
  if (rule) {
    for (const phase of card.phaseIdentities || []) {
      if (phase.scope !== 'stage-projection') continue;
      const isPre = rule.stages === 'all' || rule.stages.has(phase.stageId);
      if (!isPre) continue;
      if (rule.identity) phase.identity = rule.identity;
      if (rule.role) phase.role = rule.role;
      if (rule.description) phase.description = rule.description;
      if (rule.hideCanonicalAlias) phase.hideCanonicalAlias = true;
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
      changed += 1;
    }
  }

  if (rule || stale) {
    card.review ||= {};
    card.review.flags = (card.review.flags || []).filter(flag => flag !== 'female-relationship-phase-needed');
    if (!card.review.flags.includes('relationship-phase-resolved')) {
      card.review.flags.push('relationship-phase-resolved');
    }
    appendHumanNote(
      card.review,
      '2026-07-22：已按人工核定转折点完成逐关开场关系投影；转折发生在关内时以关卡开场身份为准，由事件推进后再改变。',
    );
  }
  return changed;
}

const summaries = [];
for (const file of files) {
  const path = resolve(canonDir, file);
  const data = JSON.parse(await readFile(path, 'utf8'));
  let changed = 0;
  for (const card of data.characters || []) changed += resolveCard(card);
  if (apply && changed) await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
  summaries.push({ file, changed });
}

for (const stageFile of ['lyl.lin_an_bridge.json', 'lyl.xiaoyingzhou_blacksea_trap.json']) {
  const stagePath = resolve(canonDir, `../yunlong/stages/${stageFile}`);
  const stage = JSON.parse(await readFile(stagePath, 'utf8'));
  const actors = stage.canon?.characters || [];
  const actorIndex = actors.findIndex(actor => actor.id === 'liuchao.character.ruan_xiang_ning');
  if (actorIndex < 0) continue;
  const previous = actors[actorIndex];
  actors[actorIndex] = {
    id: previous.id,
    name: '林娘子',
    role: '林冲之妻（开场真实来历尚未揭示）',
    description: '林冲之妻，举止温婉；真实姓名、阵营与未来关系只可随本关事件推进揭露。',
    gender: '女',
    affiliations: (previous.affiliations || []).filter(item => item.factionId === 'lyg.faction.song_state'),
    profile: {
      origin: '林冲之妻，开场真实来历尚未揭示',
      personality: ['温柔贤惠', '细致谨慎'],
    },
  };
  if (apply) {
    try {
      await copyFile(stagePath, `${stagePath}.pre-r2-12.bak`, constants.COPYFILE_EXCL);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
    await writeFile(stagePath, `${JSON.stringify(stage, null, 2)}\n`);
  }
  summaries.push({ file: `yunlong/stages/${stageFile}`, changed: 1 });
}

console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', summaries }, null, 2));
