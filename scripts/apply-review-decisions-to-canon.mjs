#!/usr/bin/env node

// Apply the human-approved review decisions back to canon source files and stage mods.
// Scope: character cards + non-army faction additions/stage faction descriptions.
// Skips: army drafts, todo/unreviewed decisions without an explicit manual note, and 青龙寺/太皇太后 pending items.

import { cp, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const canonDir = join(gen, 'character-canon');
const decisionsPath = join(canonDir, '二审人工审批-势力逐条完成.json');
const books = ['qingyu', 'yunlong', 'yange'];
const cardFiles = books.map(book => join(canonDir, `${book}.character-cards-v2.json`));
const additionsPath = join(canonDir, 'faction-details-v2-additions.json');
const backupDir = join(gen, '_backups', `character-canon-pre-review-apply-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const dry = process.argv.includes('--dry-run');

function uniq(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function removeIncludes(values, needles) {
  return (values || []).filter(value => !needles.some(needle => String(value).includes(needle)));
}

function ensureIncludes(values, additions) {
  return uniq([...(values || []), ...additions]);
}

function replaceInArray(values, match, next) {
  return (values || []).map(value => String(value).includes(match) ? next : value);
}

function appendReviewNote(card, note) {
  const text = `二审人工裁定：${note}`;
  card.备注 = card.备注 ? `${card.备注}；${text}` : text;
}

function touch(card) {
  card._reviewed = true;
  card._approved = true;
  card._manual = card._manual || '二审人工审批';
  return card;
}

function updateCard(card) {
  let changed = true;
  switch (card.name) {
    case '凝羽':
      card.关键情节 = replaceInArray(card.关键情节, '第18章首次出场', '第17章首次出场，冰山美女身材火辣');
      break;
    case '小紫':
      card.身份 = '黑魔海毒宗唯一嫡传；全书女主角、智商天花板；男主后宫正宫';
      card.外貌 = String(card.外貌 || '')
        .replace(/鲛人天生绝美、身体柔若无骨；?/g, '')
        .replace(/入水运秘法则双腿并拢化晶莹流光鱼尾、真气化鳞；?/g, '')
        .replace(/海神眷族可水底呼吸、操控水流（隔代继承自母亲碧姬的纯正鲛人血脉）/g, '碧鲮族血脉，非鲛人；鲛人为碧鲮族死敌')
        .replace(/\s+/g, ' ')
        .trim();
      if (!card.外貌) card.外貌 = '碧鲮族血脉，非鲛人；鲛人为碧鲮族死敌。容貌精致绝伦，肌肤水嫩，常带狡黠笑意。';
      card.称呼 = "对程宗扬称呼：'程头儿'；被他人称呼：'小紫'，后宫佳丽尊称'紫妈妈'";
      card.种族 = '碧鲮族（岳帅遗孤之一，母亲碧姬；非鲛人）';
      break;
    case '苏妲己':
      card.称呼 = '自称本夫人/夫人；称程宗扬为死奴才；被程宗扬称苏夫人/夫人';
      break;
    case '乐明珠':
      card.身份 = '光明观堂正统小师妹，潘金莲/义姁同门';
      card.目标动机 = '依赖程宗扬，渴望亲近、宠爱与安全感。';
      card.称呼 = '对程宗扬称呼：平时“大笨瓜”，亲热时“老公”；被称呼：小香瓜、乐妹妹';
      card.关键情节 = replaceInArray(card.关键情节, '处女身死卡临门一脚', '处女身，卡在临门一脚（元红未破）');
      break;
    case '潘金莲':
      card.身份 = '光明观堂高阶医女，鹤羽剑姬，乐明珠的亲师姐';
      card.与主角关系 = '后宫；前期为护师妹乐明珠千里追杀程宗扬，车厢内被强行攻陷前实为处子之身，但程宗扬保留她的元红，仅用后庭。';
      break;
    case '吕雉':
      card.性格 = ['平时冷静、威严、隐忍但不卑微', '入主角后宫团后顺从、隐忍、羞耻感强'];
      card.说话风格 = '敌对/太后身份时自称哀家或我，语气冷静威严；与主角确定从属关系后自称奴婢，语气柔媚、卑微。';
      card.称呼 = '和主角敌对时称程公子；和主角委身后称主子；被他人称吕雉、皇后/太后。';
      break;
    case '杨玉环':
      card.与主角关系 = '后宫；古灵精怪、主动挑衅又会被程宗扬压制，最终成为究极尤物。';
      card.称呼 = '对程宗扬称程宗扬/程侯爷；被他人称呼：杨玉环、杨妞儿、杨大美女';
      card.关键情节 = ['升级究极尤物'];
      break;
    case '赵飞燕':
      card.性格 = removeIncludes(card.性格, ['表面冷酷皇后', '傲娇']);
      card.性格 = ensureIncludes(card.性格, ['温柔忍让', '内心脆弱缺安全感']);
      break;
    case '卓云君':
      card.身份 = String(card.身份 || '')
        .replace(/前掌教王哲身死后真宗三巨头之一/g, '太乙真宗六大教御之一')
        .replace(/地位极高，太乙真宗六大教御之一/g, '太乙真宗六大教御之一');
      break;
    case '阮香凝':
      card.说话风格 = '温柔娇媚，潜伏时贤惠柔顺；常自称妾身/奴家，语气柔顺但底色是伪装与城府。';
      break;
    case '黎锦香':
      card.身份 = '剑霄门旧主之女/门主，周飞名义妻子，受广源行控制';
      card.性格 = ['温婉含蓄', '外柔内韧', '自尊强', '身陷广源行与周飞泥潭而求自救'];
      card.说话风格 = '文雅含蓄，自称妾身；语气多温婉克制，不以“周飞老婆”自称。';
      card.人格底线 = ['保全自尊与清白名分，设法自救'];
      card.目标动机 = '设法自救，摆脱周飞与广源行束缚。';
      card.与主角关系 = '与程宗扬发生亲密关系并借其自救；不是受杨玉环指使，也无杨玉环下药破处情节。';
      card.关键情节 = removeIncludes(card.关键情节, ['杨玉环合演骗局', '亲侄女杨玉环', '李辅国']);
      card.性癖 = removeIncludes(card.性癖, ['被恶趣味逼维持长辈威严', '杨玉环旁观']);
      break;
    case '蛇夫人':
      card.性格 = removeIncludes(card.性格, ['表现放荡不羁却对程宗扬绝对忠诚']);
      card.性格 = ensureIncludes(card.性格, ['对程宗扬绝对忠诚']);
      break;
    case '惊理':
      card.身份 = '原龙宸杀手，后期成为侍奴（程宗扬的奴婢）';
      card.加入经过 = '《六朝清羽记》第三章“猛虎出柙”中被小紫用计擒住，后成为程宗扬阵营成员。';
      break;
    case '泉玉姬':
      card.称呼 = '对程宗扬：主银；被他人称呼：泉玉姬、泉奴（仅限程宗扬/小紫）、泉捕头';
      card.关键情节 = removeIncludes(card.关键情节, ['打探杨玉环行踪']);
      break;
    case '齐羽仙':
      card.弱点软肋 = '血藤控制发生在太泉古阵事件中，不作为常态性格软肋。';
      break;
    case '殇侯':
    case '殇振羽':
      card.目标动机 = '因痛失所爱而投身魔门，毒杀仇人，屠吕家满门；后与程宗扬合作赚钱并培养程宗扬。';
      break;
    case '秦桧':
      card.外貌 = '举止温文尔雅，外形讨好，发须整齐，仪表翩翩，气度不凡。';
      card.人格底线 = removeIncludes(card.人格底线, ['股东大会制度']);
      card.关键情节 = removeIncludes(card.关键情节, ['第164章以惊魔指与妖妇硬拼']);
      break;
    case '武二郎':
      card.与主角关系 = '前期同伴，后续仍为盟友/兄弟般伙伴，并非程宗扬部下。';
      card.称呼 = '对程宗扬称“程宗扬”或直呼其名；被众人称“武二郎”或“武二”';
      card.加入经过 = '因共同利益、义气与“钱景”结伴同行，并非苏妲己指派雇佣。';
      break;
    case '秦翰':
      card.关键情节 = (card.关键情节 || []).map(item => String(item).includes('被折断指骨') || String(item).includes('折断的指骨')
        ? '与程宗扬交手中折断程宗扬指骨'
        : item);
      card.身体性特征 = (card.身体性特征 || []).map(item => String(item).includes('指骨')
        ? '曾在交手中折断程宗扬指骨'
        : item);
      card.关键情节 = removeIncludes(card.关键情节, ['两日前离开苍澜']);
      if (String(card.结局下场 || '').includes('两日前离开苍澜')) card.结局下场 = '携一颗赤阳圣果回临安缴旨。';
      break;
    case '古冥隐':
      if (String(card.身份 || '').includes('宋国太监')) card.身份 = '黑魔海供奉/邪教人物';
      if (card.与主角关系 === '无直接关系') card.与主角关系 = '与主角阵营敌对或间接相关';
      if (!card.身份) card.身份 = '黑魔海供奉/邪教人物';
      if (!card.与主角关系) card.与主角关系 = '与主角阵营敌对或间接相关';
      card.关键情节 = ensureIncludes(card.关键情节, ['身上藏有幽冥宗之秘，后被死丫头（小紫）尽得']);
      break;
    default:
      changed = false;
      break;
  }
  if (changed) touch(card);
  return changed;
}

function applyFactionDecisions(faction) {
  switch (faction.name) {
    case '龙宸':
      faction.头目核心 = ['座主（真身未明）', '长老焚无尘'];
      faction.手段机制 = ensureIncludes(faction.手段机制, ['标记召唤']);
      faction.旗下重要人物 = uniq(['虞白樱', '虞紫薇', '焚无尘', '牛金牛', '虚日鼠', '女土蝠', '室火猪', '壁水貐', '斗木獬', '危月燕', '惊理', '罂奴']);
      break;
    case '圣教':
      faction.name = '圣教（黑魔海）';
      faction.性质 = '魔道宗派/黑魔海教众自称';
      faction.头目核心 = ['魔尊（真身未明确）', '剑玉姬（高层智囊/巫宗核心）', '殇侯/殇君（毒宗元老）', '泉玉姬（黑魔海玉姬之一）'];
      faction.架构层级 = '圣教即黑魔海，分巫宗、毒宗等支系；光明观堂是其死敌而非分支。大体有魔尊、仙姬/玉姬、供奉、姬奴、普通教众等层级。';
      faction.旗下重要人物 = ['殇侯/殇君（毒宗元老）', '小紫（毒宗唯一嫡脉）', '齐羽仙（巫宗成员）', '泉玉姬（玉姬之一）', '游婵（黑魔海分部下级小头目，负责和飞鸟翔/飞鸟熊藏接头）', '鱼朝恩（毒宗成员）', '古冥隐（黑魔海供奉）'];
      faction.关键事件 = faction.关键事件.map(item => String(item).includes('杀死星月湖龙骥') ? '谢艺之死涉及黑魔海设计，具体走向需与游戏实际剧情匹配' : item);
      break;
    case '广源行':
      faction.总部 = '晴州，具体地点未明';
      faction.头目核心 = ['严森垒（账房）', '庞白鸿/庞执事（执事，同一人）'];
      faction.手段机制 = ['安插亲信', '扶植傀儡帮会', '借刀杀人', '重金买凶'];
      break;
    case '丹霞宗':
      faction.头目核心 = ['柴永剑（继任宗主）', '左彤芝（左护法/护法长老）', '白老宗主（已故，曾任丹霞宗宗主及凉州盟盟主）', '白仙儿（宗主之女）'];
      faction.架构层级 = '宗主、护法长老、弟子；护法长老分左右护法。';
      break;
    case '娑梵寺':
      faction.手段机制 = ['小还丹疗伤', '擅长经营敛财', '油滑处世', '信永热衷赚钱和扩张寺产僧众'];
      faction.旗下重要人物 = ['释信永（首席方丈）', '信寂（掌衣僧）', '信道（掌钵僧）', '信德（掌油僧）', '信空（戒律僧）', '癫头陀（带发头陀）'];
      break;
    case '罗马军团':
      faction.架构层级 = '军团制，包含青年队、壮年队、老兵队、百人队、中队等层次；已知第三军团“奥古斯丁”、第五军团“云雀”、第六军团“钢铁之壁”、第十军团“骑士”、第十二军团“掷闪电者”。';
      faction.旗下重要人物 = ['阿伽门侬（罗马联军统帅）', '第三军团：奥古斯丁', '第五军团：云雀', '第六军团：钢铁之壁', '第十军团：骑士', '第十二军团：掷闪电者'];
      break;
    case '铁马堂':
    case '剑霄门':
    case '雪隼佣兵团':
      // Human approvals/rejections did not require source-field rewrites beyond keeping current additions.
      break;
    case '青龙寺':
      faction._pendingReview = true;
      break;
  }
  faction._humanReviewed = true;
  faction._reviewSource = '二审人工审批-势力逐条完成.json';
  return faction;
}

function factionDescription(faction) {
  const pieces = [];
  if (faction.性质) pieces.push(faction.性质);
  if (faction.总部) pieces.push(`总部/据点：${faction.总部}`);
  if (faction.宗旨目标) pieces.push(`目标：${faction.宗旨目标}`);
  if (faction.头目核心?.length) pieces.push(`核心：${faction.头目核心.join('、')}`);
  if (faction.旗下重要人物?.length) pieces.push(`人物：${faction.旗下重要人物.slice(0, 8).join('、')}`);
  if (faction.与主角关系) pieces.push(`与程宗扬：${faction.与主角关系}`);
  return pieces.join('；').slice(0, 900);
}

function renderFactionMarkdown(data) {
  const fields = ['性质', '总部', '宗旨目标', '头目核心', '架构层级', '手段机制', '旗下重要人物', '与主角关系', '关键事件'];
  const lines = ['# 仙途 · 势力深设定（人工二验回流）', '', '> 来源：`二审人工审批-势力逐条完成.json`。军队抽档与待查条目未并入。', ''];
  for (const faction of data.factions || []) {
    lines.push(`## ${faction.name}`);
    if (faction._pendingReview) lines.push('- **状态**：待查，暂未回流游戏。');
    for (const field of fields) {
      const value = faction[field];
      const text = Array.isArray(value) ? value.join('、') : (value || '');
      if (text) lines.push(`- **${field}**：${text}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  if (!existsSync(decisionsPath)) throw new Error(`missing decisions: ${decisionsPath}`);
  if (!dry) {
    await cp(canonDir, backupDir, { recursive: true });
  }

  const decisions = JSON.parse(await readFile(decisionsPath, 'utf8'));
  const skipped = (decisions.decisions || []).filter(item => item.group === '军队抽档' || item.status === 'todo');

  const touchedCards = new Set();
  for (const file of cardFiles) {
    const data = JSON.parse(await readFile(file, 'utf8'));
    for (const card of data.characters || []) {
      const before = JSON.stringify(card);
      const applied = updateCard(card);
      if (JSON.stringify(card) !== before) touchedCards.add(card.name);
    }
    if (!dry) await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
  }

  const additions = JSON.parse(await readFile(additionsPath, 'utf8'));
  for (const faction of additions.factions || []) applyFactionDecisions(faction);
  if (!dry) {
    await writeFile(additionsPath, `${JSON.stringify(additions, null, 2)}\n`);
    await writeFile(join(canonDir, 'faction-details-v2-additions.md'), renderFactionMarkdown(additions));
    await writeFile(join(canonDir, 'faction-details-v2-reviewed.json'), `${JSON.stringify(additions, null, 2)}\n`);
    await writeFile(join(canonDir, 'faction-details-v2-reviewed.md'), renderFactionMarkdown(additions));
  }

  const byName = new Map((additions.factions || []).filter(f => !f._pendingReview).flatMap(f => {
    const names = [f.name, f.name.replace(/（.*?）/g, '')];
    if (f.name === '圣教（黑魔海）') names.push('圣教', '黑魔海');
    return names.map(name => [name, f]);
  }));
  let stageFactionUpdates = 0;
  for (const book of books) {
    const stageDir = join(gen, book, 'stages');
    for (const file of (await readdir(stageDir)).filter(name => name.endsWith('.json') && !name.includes('uncertainties'))) {
      const path = join(stageDir, file);
      const mod = JSON.parse(await readFile(path, 'utf8'));
      let changed = false;
      for (const faction of mod.canon?.factions || []) {
        const detail = byName.get(faction.name);
        if (!detail) continue;
        const nextDesc = factionDescription(detail);
        if (nextDesc && faction.description !== nextDesc) {
          faction.description = nextDesc;
          faction.features = uniq([...(faction.features || []), ...(detail.手段机制 || []).slice(0, 5)]);
          changed = true;
          stageFactionUpdates += 1;
        }
      }
      if (changed && !dry) await writeFile(path, `${JSON.stringify(mod, null, 2)}\n`);
    }
  }

  const report = [
    '# 二审人工审批回流摘要',
    '',
    `- 时间：${new Date().toISOString()}`,
    `- 审批源：${decisionsPath}`,
    `- 备份目录：${dry ? '(dry-run)' : backupDir}`,
    `- 角色卡更新：${[...touchedCards].sort().join('、')}`,
    `- stage 势力简介更新处数：${stageFactionUpdates}`,
    `- 跳过：军队抽档 ${skipped.filter(item => item.group === '军队抽档').length} 条；待查 ${skipped.filter(item => item.status === 'todo').length} 条。`,
    '',
    '## 跳过条目',
    '',
    ...skipped.map(item => `- ${item.group}/${item.subject}: ${item.title}${item.note ? `（备注：${item.note}）` : ''}`),
    '',
  ];
  if (!dry) await writeFile(join(canonDir, '二审人工审批回流摘要.md'), `${report.join('\n')}\n`);
  console.log(report.join('\n'));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
