#!/usr/bin/env node
// P3a：把卡 staticProfile.affiliations 投影进 stage canon.characters[].affiliations，
// 并为新势力铸 faction id/category、补进相关 stage canon.factions。
// merge(不覆盖已有,按 factionId 去重)、幂等。默认 dry-run，--apply 才写。
// 用法：node scripts/project-affiliations-to-stages.mjs [--apply]
import fs from 'node:fs';
import crypto from 'node:crypto';
import { join, resolve } from 'node:path';

const APPLY = process.argv.includes('--apply');
const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const BOOKS = ['qingyu', 'yunlong', 'yange'];

// category(en) → faction def type(zh)
const TYPE_ZH = { sect: '宗门', clan: '家族', military: '军队', state: '势力', organization: '组织' };
const guessCat = (n) => {
  if (/军$|营$|卫$|骑$|兵$|效节|天策府|府兵/.test(n)) return 'military';
  if (/朝廷|京兆府|州府|官府|刑部|大理寺|六扇门|兰台|王国|藩镇|平卢|魏博|昭南/.test(n)) return 'state';
  if (/侯府$|家$|氏$|族$/.test(n)) return 'clan';
  if (/宗$|观$|寺$|教$|门$|派$|阁$|殿$|丛林/.test(n)) return 'sect';
  return 'organization'; // 行/钱庄/商会/镖局/堂/院/会/社/盟/势力/集团/游侠/帮…
};
const slug = (n) => 'liuchao.faction.x' + crypto.createHash('md5').update(n).digest('hex').slice(0, 10);

// 载入 stage
const stages = [];
const canonFac = new Map(); // name -> {id, category}
for (const b of BOOKS) { const dir = join(gen, b, 'stages');
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json') && !x.endsWith('.uncertainties.json'))) {
    const p = join(dir, f); const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    stages.push({ p, m });
    for (const fa of m.canon.factions || []) if (!canonFac.has(fa.name)) canonFac.set(fa.name, { id: fa.id, category: fa.category || guessCat(fa.name) });
  }
}
// 卡 affiliations：canonicalName/alias -> [{faction,role}]
const cards = JSON.parse(fs.readFileSync(join(gen, 'character-canon/character-cards-v3.json'), 'utf8'));
const affByName = new Map();
for (const c of cards.characters) { const list = c.staticProfile.affiliations || []; if (!list.length) continue;
  affByName.set(c.canonicalName, list); for (const a of c.aliases || []) if (!affByName.has(a)) affByName.set(a, list); }

// faction 名 -> {id,category}（含新铸）
const minted = new Map(); // name -> {id,category}
function facOf(name) {
  if (canonFac.has(name)) return canonFac.get(name);
  if (minted.has(name)) return minted.get(name);
  const rec = { id: slug(name), category: guessCat(name) }; minted.set(name, rec); return rec;
}

// 时间门控排除（R2-11O）：卡 staticProfile.affiliations 是跨书静态身份，
// 机械并入早期关卡会把晚期身份带进早期时间线。以下逐条人工裁定排除，
// 键 = stageId，值 = "角色id:势力id" 对。新增排除须附原文/裁定依据。
const AFFILIATION_TIME_GATE_EXCLUSIONS = new Map([
  // 中行说在 lyl.luoyang_coup（云龙吟源 275-288）尚未投奔程宗扬——本关他只以
  // 天子近侍身份劫持吕冀、随刘建突围；「内宅总管」是燕歌行时区身份，不得投影进本关。
  ['lyl.luoyang_coup', new Set([
    'liuchao.character.zhong_hangyue:liuchao.faction.x2d33e1eaf9',
  ])],
]);

// 第 7–8 章只称“凝姨”；她与黑魔海、林冲的关系均在本关之后才揭示，
// 因而这里按角色整体封锁静态 affiliations，而不是追着未来卡片逐项列举。
const AFFILIATION_CHARACTER_TIME_GATE_EXCLUSIONS = new Map([
  ['lyl.lin_an_black_sea', new Set([
    'liuchao.character.ruan_xiang_ning',
  ])],
]);

// R2-11P 来源重建已逐人裁定本关可见 affiliations；全局静态卡包含后续加入关系，
// 本关演员一律以 stage 内手写集合为准，禁止构建期再次扩写。
const AFFILIATION_STAGE_LOCKS = new Map([
  // R2-11T 已按第74章开场可知状态逐人收口；后期商号、黑魔海与主角势力归属不得回灌。
  ['lcq.stage_05', new Set([
    'liuchao.character.cheng_zongyang', 'liuchao.character.le_mingzhu',
    'liuchao.character.xiao_zi', 'liuchao.character.xie_yi',
    'liuchao.character.yun_cang_feng', 'liuchao.character.ning_yu',
    'liuchao.character.wu_er_lang', 'liuchao.character.su_li',
    'liuchao.character.qi_yuan', 'lcq.character.np004',
    'lcq.character.np006', 'liuchao.character.bi_ji',
    'liuchao.character.a_xi', 'liuchao.character.dan_chen',
  ])],
  // R2-11S 已按第18章开场逐人收口；后期商号、黑魔海与星月湖归属不得回灌。
  ['lcq.stage_03', new Set([
    'liuchao.character.cheng_zongyang', 'liuchao.character.su_daji',
    'liuchao.character.ning_yu', 'liuchao.character.a_jiman_bana',
    'liuchao.character.wu_er_lang', 'liuchao.character.xi_men_qing',
    'liuchao.character.qi_yuan', 'liuchao.character.yun_cang_feng',
    'liuchao.character.xie_yi',
  ])],
  // R2-11R 已按第112章开场可知状态逐人收口；全局静态归属含后期身份，整关锁定。
  ['lcq.stage_06', new Set([
    'liuchao.character.cheng_zongyang', 'liuchao.character.le_mingzhu',
    'liuchao.character.xie_yi', 'liuchao.character.wu_er_lang',
    'liuchao.character.ning_yu', 'liuchao.character.su_li',
    'liuchao.character.xiao_zi', 'liuchao.character.gui_wu_wang',
    'liuchao.character.dragon_god', 'lcq.character.np006',
    'liuchao.character.yun_cang_feng', 'liuchao.character.bi_ji',
    'liuchao.character.shang_zhen_yu',
  ])],
  ['lyl.lin_an_black_sea', new Set([
    'liuchao.character.cheng_zongyang', 'liuchao.character.qin_hui',
    'liuchao.character.yu_zi_yuan', 'liuchao.character.lin_chong',
    'liuchao.character.li_shi_shi', 'liuchao.character.lu_zhi_shen',
    'liuchao.character.xue_yan_shan', 'liuchao.character.lin_qing_pu',
    'liuchao.character.ao_run', 'liuchao.character.feng_yuan',
    'liuchao.character.qing_mian_shou', 'liuchao.character.ruan_xiang_ning',
    'liuchao.character.gao_zhishang', 'liuchao.character.lu_qian',
    'liuchao.character.xiao_zi',
  ])],
  // R2-11Q 已按第 12–14 章逐人收口；静态卡包含后续入伙/组织关系，整关锁定。
  ['lyl.taiquan_expedition', new Set([
    'liuchao.character.cheng_zongyang', 'liuchao.character.qin_hui',
    'liuchao.character.yu_zi_yuan', 'liuchao.character.lin_qing_pu',
    'liuchao.character.li_shi_shi', 'liuchao.character.lin_chong',
    'canon.character.7718ae444a', 'liuchao.character.ruan_xiang_lin',
    'liuchao.character.lu_zhi_shen', 'liuchao.character.ao_run',
    'liuchao.character.qing_mian_shou', 'liuchao.character.ruan_xiang_ning',
    'liuchao.character.gao_zhishang', 'liuchao.character.lu_qian',
  ])],
]);

let projWrites = 0, facDefsAdded = 0, charsTouched = 0, stagesTouched = 0;
for (const { p, m } of stages) {
  let stageChanged = false;
  const stageExclusions = AFFILIATION_TIME_GATE_EXCLUSIONS.get(m.manifest?.id);
  const characterExclusions = AFFILIATION_CHARACTER_TIME_GATE_EXCLUSIONS.get(m.manifest?.id);
  const stageLocks = AFFILIATION_STAGE_LOCKS.get(m.manifest?.id);
  const facById = new Set((m.canon.factions || []).map(f => f.id));
  for (const c of m.canon.characters || []) {
    if (characterExclusions?.has(c.id) || stageLocks?.has(c.id)) continue;
    const list = affByName.get(c.name); if (!list) continue;
    const existing = c.affiliations || [];
    const seen = new Set(existing.map(a => a.factionId));
    let added = false;
    for (const a of list) {
      if (!a.faction) continue;
      const { id, category } = facOf(a.faction);
      if (stageExclusions?.has(`${c.id}:${id}`)) continue;
      if (seen.has(id)) continue; seen.add(id);
      existing.push({ factionId: id, category, role: a.role || '成员' });
      projWrites++; added = true;
      // 确保该 stage 有此 faction def
      if (!facById.has(id)) {
        facById.add(id);
        if (APPLY) (m.canon.factions = m.canon.factions || []).push({ id, name: a.faction, description: `${a.faction}（${TYPE_ZH[category] || '组织'}）——简介待补，源自角色归属富化自动补录。`, type: TYPE_ZH[category] || '组织', features: [] });
        facDefsAdded++;
      }
    }
    if (added) { c.affiliations = existing; charsTouched++; stageChanged = true; }
  }
  if (stageChanged) { stagesTouched++; if (APPLY) fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n'); }
}
console.log(`=== P3a 投影 ${APPLY ? '(已写)' : '(DRY-RUN)'} ===`);
console.log(`投影写入 affiliations:${projWrites} | 新铸 faction:${minted.size} | faction def 补进 stage:${facDefsAdded} | 触及角色档:${charsTouched} | 触及关卡:${stagesTouched}`);
if (!APPLY) console.log(`新铸示例:`, [...minted.entries()].slice(0, 20).map(([n, v]) => `${n}:${v.category}`).join(' | '));
