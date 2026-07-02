#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const canonDir = join(root, 'mod-kit/generated/deepseek-v4-flash/character-canon');

const v3Files = [
  'character-cards-v3.json',
  'qingyu.character-cards-v3.json',
  'yunlong.character-cards-v3.json',
  'yange.character-cards-v3.json',
];

const decisions = {
  '阿夕': {
    note: '人工批注：转折点为鬼巫王身死，六朝清羽记第13章秦淮风流起。',
    identitySummary: '花苗少女',
    relationship: [
      { seq: '六朝清羽记第13章前', identity: '花苗少女/原花苗族，禁止提前称为程宗扬阵营或内宅成员' },
      { seq: '六朝清羽记第13章秦淮风流起', identity: '鬼巫王身死后进入关系转折，之后可按原文写入程宗扬阵营/内宅从属' },
    ],
  },
  '何漪莲': {
    note: '人工批注：不是何进之女，只是洛帮帮主；六朝燕歌行“霓开莲动”收入后宫。',
    identitySummary: '洛帮帮主',
    relationToProtagonist: ['六朝燕歌行“霓开莲动”后收入程宗扬内宅'],
    relationship: [
      { seq: '霓开莲动前', identity: '洛帮帮主，禁止写作何进之女或程宗扬内宅成员' },
      { seq: '六朝燕歌行·霓开莲动起', identity: '洛帮帮主/程宗扬内宅成员' },
    ],
    replaceTexts: [
      ['大将军何进之女，阮香凝的女儿/继女', '洛帮帮主'],
      ['后宫；与母亲阮香凝构成母女禁忌', '六朝燕歌行“霓开莲动”后收入程宗扬内宅'],
    ],
  },
  '黄氏': {
    note: '人工批注：六朝云龙吟临安篇第六集末尾至第七集开头有关系转折描写。',
    identitySummary: '临安篇配角',
    relationship: [
      { seq: '六朝云龙吟临安篇第六集末尾前', identity: '临安篇配角，禁止提前写作程宗扬阵营成员' },
      { seq: '六朝云龙吟临安篇第六集末尾-第七集开头', identity: '与程宗扬发生关系转折，之后按原文写入程宗扬阵营/从属关系' },
    ],
  },
  '刘娥': {
    note: '人工批注：转折承接六朝清羽记；六朝云龙吟太泉古阵篇第11集进入受制阶段；转折前身份为宋国太皇太后。',
    identitySummary: '宋国太皇太后/后期受制于程宗扬阵营',
    relationship: [
      { seq: '转折前', identity: '宋国太皇太后，禁止提前写作程宗扬阵营或从属关系' },
      { seq: '六朝云龙吟太泉古阵篇第11集', identity: '进入受制阶段，之后可写作程宗扬阵营从属' },
    ],
  },
  '潘金莲': {
    note: '人工批注：身份是光明观堂高阶医女，鹤羽剑姬；唐国篇第十四集红芳吐蕊第一章确认其关系状态和效忠转折。',
    identitySummary: '光明观堂高阶医女，鹤羽剑姬，乐明珠的亲师姐',
    relationship: [
      { seq: '转折前', identity: '光明观堂高阶医女/鹤羽剑姬，为保护乐明珠追索程宗扬；禁止提前写作后宫或内宅成员' },
      { seq: '唐国篇第十四集·红芳吐蕊第一章', identity: '确认效忠和关系转折，之后可写作程宗扬阵营/内宅成员' },
    ],
    replaceTexts: [
      ['太乙真宗传人，乐明珠的亲师姐', '光明观堂高阶医女，鹤羽剑姬，乐明珠的亲师姐'],
      ['作为光明观堂弟子执行师门任务，维护尊严', '作为光明观堂高阶医女执行师门任务，维护尊严'],
    ],
  },
  '萧氏': {
    note: '人工批注：不是被程宗扬直接导致前置受害；第23集宫阙万千三章百死莫赎中为唐国内部宦官迫害。唐国太后，后在第25集迟迟钟鼓与安阳公主一同被收编。另需补杨妃/杨艳卡，杨妃是李昂之妻，不是杨玉环。',
    identitySummary: '唐国太后/杨妃之婆婆/安乐公主与安阳公主之母',
    relationToProtagonist: ['六朝燕歌行第25集迟迟钟鼓后被程宗扬阵营收编'],
    relationship: [
      { seq: '六朝燕歌行第23集·宫阙万千三章百死莫赎', identity: '唐国太后，受唐国内部宦官迫害；禁止写作程宗扬义母或程宗扬所致前置受害' },
      { seq: '六朝燕歌行第25集·迟迟钟鼓', identity: '与安阳公主一同被程宗扬阵营收编' },
    ],
    replaceTexts: [
      ['唐国太后/程宗宗义母/杨妃之婆婆/安乐之母', '唐国太后/杨妃之婆婆/安乐公主与安阳公主之母'],
      ['唐国太后/程宗宗义母/杨妃之婆婆/安乐之', '唐国太后/杨妃之婆婆/安乐公主与安阳公主之母'],
      ['程宗宗的义母/被其奸淫对象', '六朝燕歌行第25集迟迟钟鼓后被程宗扬阵营收编'],
      ['程宗宗', '程宗扬'],
    ],
    addMissingCharacter: '杨妃（杨艳）：唐国皇后/李昂之妻，非杨玉环；用户批注提示 v3 角色卡缺失，需单独补卡。',
  },
  '雁儿': {
    note: '人工批注：批准；第284章初夜作为关系转折点。',
    identitySummary: '小婢',
    relationship: [
      { seq: '第284章前', identity: '侍婢/侍女身份，禁止提前写作侍妾或内宅伴侣' },
      { seq: '第284章起', identity: '关系转折后，可写作侍妾/半个主子' },
    ],
  },
  '虞白樱': {
    note: '人工批注：六朝云龙吟太泉古阵篇第17集第一章家规明确关系转折。',
    identitySummary: '女杀手，虞紫薇的双胞胎姐姐',
    relationship: [
      { seq: '太泉古阵篇第17集第一章家规前', identity: '女杀手/中立交易者，禁止提前写作程宗扬后宫或内宅成员' },
      { seq: '六朝云龙吟太泉古阵篇第17集第一章家规起', identity: '确认关系转折，之后可写作程宗扬内宅成员' },
    ],
  },
  '云丹琉': {
    note: '人工批注：六朝云龙吟汉国篇第30集第三章欲醉明确关系转折。',
    identitySummary: '云如瑶亲侄女，云世商会家主侄女/女骑士',
    relationship: [
      { seq: '汉国篇第30集第三章欲醉前', identity: '云家大小姐/云世商会人物/中立盟友，禁止提前写作程宗扬内宅成员' },
      { seq: '六朝云龙吟汉国篇第30集第三章欲醉起', identity: '确认关系转折，之后可写作程宗扬内宅成员' },
    ],
  },
  '赵合德': {
    note: '人工批注：六朝云龙吟汉国篇第30集第7章弑君明确关系转折；转折前为汉国昭仪。',
    identitySummary: '汉国昭仪/赵飞燕之妹',
    relationship: [
      { seq: '汉国篇第30集第7章弑君前', identity: '汉国昭仪/赵飞燕之妹，禁止提前写作程宗扬妾室或情人' },
      { seq: '六朝云龙吟汉国篇第30集第7章弑君起', identity: '确认关系转折，之后可写作程宗扬内宅成员' },
    ],
  },
  '林娘子': {
    note: '人工批注：林娘子就是阮香凝，林冲之妻。',
    mergeInto: '阮香凝',
  },
};

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function replaceDeep(value, replacements) {
  if (!replacements?.length) return value;
  if (typeof value === 'string') {
    return replacements.reduce((text, [from, to]) => text.split(from).join(to), value);
  }
  if (Array.isArray(value)) return value.map(item => replaceDeep(item, replacements));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, replaceDeep(val, replacements)]));
  }
  return value;
}

function phaseRule(seq, identity, status) {
  return {
    scope: 'relationship-chain',
    seq,
    identity,
    status,
    source: 'human-review-v3',
  };
}

function removeGenericRelationshipRules(phases) {
  return asArray(phases).filter(phase => {
    if (phase.scope !== 'relationship-chain') return true;
    return ![
      '原阵营/中立/敌对身份，禁止提前称为后宫、侍妾、情人或程宗扬阵营成员',
      '按原文转折事件后，才可写入程宗扬阵营/后宫/侍妾/情人等关系身份',
    ].includes(phase.identity);
  });
}

function uniqueByJson(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const key = JSON.stringify(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function pushUnique(array, value) {
  if (!value) return array;
  if (!array.includes(value)) array.push(value);
  return array;
}

function applyDecision(character, decision) {
  if (decision.replaceTexts) {
    character = replaceDeep(character, decision.replaceTexts);
  }
  character.review ||= {};
  character.review.reviewed = true;
  character.review.humanReviewed = true;
  character.review.humanNotes = pushUnique(asArray(character.review.humanNotes), decision.note);

  if (decision.identitySummary !== undefined) {
    character.staticProfile ||= {};
    character.staticProfile.identitySummary = decision.identitySummary;
    character.phaseIdentities = asArray(character.phaseIdentities).map(phase => {
      if (phase.scope !== 'stage-projection') return phase;
      return { ...phase, identity: decision.identitySummary, role: decision.identitySummary };
    });
  }
  if (decision.relationToProtagonist) {
    character.staticProfile ||= {};
    character.staticProfile.relationToProtagonist = decision.relationToProtagonist;
  }

  if (decision.relationship) {
    const concreteRules = decision.relationship.map((rule, index) =>
      phaseRule(rule.seq, rule.identity, index === 0 ? 'forbid-final-state-before-turning-point' : 'allowed-after-turning-point'));
    character.phaseIdentities = uniqueByJson([
      ...concreteRules,
      ...removeGenericRelationshipRules(character.phaseIdentities),
    ]);
  }

  if (decision.addMissingCharacter) {
    character.review.followUps = pushUnique(asArray(character.review.followUps), decision.addMissingCharacter);
  }

  return character;
}

function mergeCharacters(characters, fromName, intoName, note) {
  const fromIndex = characters.findIndex(character => character.canonicalName === fromName);
  const into = characters.find(character => character.canonicalName === intoName);
  if (!into) return { merged: false };

  if (fromIndex === -1) {
    into.review ||= {};
    into.review.reviewed = true;
    into.review.humanReviewed = true;
    into.review.flags = pushUnique(
      asArray(into.review.flags).filter(flag => flag !== 'needs-second-review'),
      'duplicate-merged',
    );
    into.review.humanNotes = pushUnique(asArray(into.review.humanNotes), note);
    into.review.aliasMerged = pushUnique(asArray(into.review.aliasMerged), fromName);
    return { merged: false, alreadyMerged: true };
  }

  const from = characters[fromIndex];
  into.review ||= {};
  into.review.reviewed = true;
  into.review.humanReviewed = true;
  into.review.flags = pushUnique(
    asArray(into.review.flags).filter(flag => flag !== 'needs-second-review'),
    'duplicate-merged',
  );
  into.review.humanNotes = pushUnique(asArray(into.review.humanNotes), note);
  into.review.aliasMerged = pushUnique(asArray(into.review.aliasMerged), fromName);
  into.sourceCards = uniqueByJson([...asArray(into.sourceCards), ...asArray(from.sourceCards)]);
  into.phaseIdentities = uniqueByJson([...asArray(into.phaseIdentities), ...asArray(from.phaseIdentities)]);
  into.staticProfile ||= {};
  into.staticProfile.formsOfAddress = uniqueByJson([
    ...asArray(into.staticProfile.formsOfAddress),
    fromName,
    '林冲之妻',
  ]);

  characters.splice(fromIndex, 1);
  return { merged: true };
}

const summary = [];
for (const file of v3Files) {
  const path = join(canonDir, file);
  const data = JSON.parse(await readFile(path, 'utf8'));
  if (!Array.isArray(data.characters)) continue;

  const fileSummary = { file, updated: [], merged: [] };
  for (const [name, decision] of Object.entries(decisions)) {
    if (decision.mergeInto) continue;
    const index = data.characters.findIndex(character => character.canonicalName === name);
    if (index === -1) continue;
    data.characters[index] = applyDecision(data.characters[index], decision);
    fileSummary.updated.push(name);
  }

  const mergeDecision = decisions['林娘子'];
  const mergeResult = mergeCharacters(data.characters, '林娘子', mergeDecision.mergeInto, mergeDecision.note);
  if (mergeResult.merged) fileSummary.merged.push(`林娘子 -> ${mergeDecision.mergeInto}`);
  if (mergeResult.alreadyMerged) fileSummary.merged.push(`林娘子 -> ${mergeDecision.mergeInto} (already merged)`);

  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
  summary.push(fileSummary);
}

const notes = {
  generatedAt: new Date().toISOString(),
  source: '/Volumes/botsvault/06_material/XianTu-Mod-Kit/v3 review.txt',
  decisions,
  summary,
};

await writeFile(join(canonDir, 'minimax-v3-human-review-applied.json'), `${JSON.stringify(notes, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
