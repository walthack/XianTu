#!/usr/bin/env node
// 63 归属审计·裁定落地（2026-07-03 用户批准方案：规则自动裁定 + 6 行人工拍板 + 杨玉环用户修正）。
// 1) 改卡（4 卡文件）：删除/改挂/role 时序与语域标注
// 2) stage 同步：受影响角色的 stage affiliations 按新卡【替换】（P3a 是 merge 不会删）
// 用法：node scripts/apply-affiliation-adjudication.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');

// name → 操作列表。op: remove(faction) / role(faction,newRole) / replace(faction,newFaction,newRole)
const ADJ = {
  // —— 用户修正：杨玉环 ——
  杨玉环: [
    ['role', '太乙真宗', '钦命授箓传道（名义）'], ['role', '阳钧宗', '钦命授箓传道（名义）'],
    ['role', '乾贞道', '钦命授箓传道（名义）'], ['role', '长青宗', '钦命授箓传道（名义）'],
    ['role', '瑶池宗', '钦命授箓传道（名义）'], ['role', '光明观堂', '挂名弟子'],
  ],
  // —— 转变类：保留+时序 ——
  惊理: [['role', '龙宸', '原杀手（行刺小紫失败被擒后脱离）'], ['role', '小紫势力', '被擒后收为侍奴']],
  苏骁: [['role', '秦国', '原秦军右庶长（闻江州起兵弃将印来投，旧属）'], ['role', '鹏翼社', '挂名（星月湖掩护组织）']],
  侯玄: [['role', '秦国', '化名客卿边将（星月湖潜伏时期）']],
  韩庚: [['role', '太乙真宗', '王哲爱徒（拟传掌教；后与王哲一同战死草原）']],
  张恽: [['role', '汉国朝廷', '中黄门（后叛附吕氏）']],
  吕巨君: [['role', '汉国朝廷', '射声校尉（吕氏任命）']],
  定陶王: [['role', '汉国朝廷', '被拥立傀儡天子（凉州军挟持）']],
  莫如霖: [['role', '星月湖', '岳帅门下旧部（自称忠心耿耿）']],
  // —— 仪式性/挂名：降标注 ——
  慈音: [['role', '香竹寺', '挂单比丘尼（暂居非常住）']],
  信永: [['role', '十方丛林', '名誉主持（挂名）']],
  观海: [['role', '青龙寺', '获准演法的密宗客僧（非本寺僧）']],
  秦翰: [['role', '皇图天策府', '出身（学员经历，现已离府）']],
  // —— 删（证据确凿的错挂） ——
  曹季兴: [['remove', '巫宗']],
  高衙内: [['remove', '禁军']],
  张之煌: [['remove', '吕氏外戚集团']],
  飞鸟萤子: [['remove', '十方丛林']],
  程郑: [['remove', '左武军'], ['remove', '程氏商会']],
  净念: [['remove', '十方丛林']],
  唐季臣: [['remove', '舞阳侯府']],
  阿夕: [['remove', '鬼王峒']],
  罗令: [['remove', '长安城总店'], ['remove', '程氏商会']],
  // —— 改挂 ——
  墨狼: [['replace', '星月湖', '黑魔海', '九御之一·墨狼（王处仲处暗藏）']],
  曲武: [['replace', '盘江程氏', '石家', '护卫']],
  // —— 保留+标注 ——
  黛姬雪娜: [['role', '罗马军团', '拜火教女祭司（随军协同，非编制）']],
};

function applyOps(list, ops) {
  let out = [...(list || [])];
  for (const op of ops) {
    if (op[0] === 'remove') out = out.filter(a => a.faction !== op[1]);
    else if (op[0] === 'role') out = out.map(a => a.faction === op[1] ? { ...a, role: op[2] } : a);
    else if (op[0] === 'replace') out = out.map(a => a.faction === op[1] ? { faction: op[2], role: op[3] } : a);
  }
  return out;
}

// 1) 改卡
let cardEdits = 0;
for (const cf of ['character-cards-v3.json', 'qingyu.character-cards-v3.json', 'yunlong.character-cards-v3.json', 'yange.character-cards-v3.json']) {
  const p = join(gen, 'character-canon', cf);
  if (!fs.existsSync(p)) continue;
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  let changed = false;
  for (const c of d.characters) {
    const ops = ADJ[c.canonicalName];
    if (!ops) continue;
    const before = JSON.stringify(c.staticProfile.affiliations || []);
    const after = applyOps(c.staticProfile.affiliations, ops);
    if (JSON.stringify(after) !== before) { c.staticProfile.affiliations = after; changed = true; if (cf === 'character-cards-v3.json') cardEdits++; }
  }
  if (changed) fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n');
}
console.log(`卡改动角色: ${cardEdits}`);

// 2) stage 替换同步（仅受影响角色）：按新卡重建其 stage affiliations
const cards = JSON.parse(fs.readFileSync(join(gen, 'character-canon/character-cards-v3.json'), 'utf8'));
const cardAff = new Map(cards.characters.filter(c => ADJ[c.canonicalName]).map(c => [c.canonicalName, c.staticProfile.affiliations || []]));
// faction 名→id（含已铸）
const facByName = new Map();
for (const b of ['qingyu', 'yunlong', 'yange']) {
  const dir = join(gen, b, 'stages');
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json') && !x.endsWith('.uncertainties.json'))) {
    const m = JSON.parse(fs.readFileSync(join(dir, f), 'utf8'));
    for (const fa of m.canon.factions || []) if (!facByName.has(fa.name)) facByName.set(fa.name, { id: fa.id, category: fa.category });
  }
}
const guessCat = (n) => /军$|营$|卫$|骑$|兵$/.test(n) ? 'military' : /朝廷|王国/.test(n) ? 'state' : /家$|氏$|族$|侯府$/.test(n) ? 'clan' : /宗$|观$|寺$|教$|门$|派$|丛林/.test(n) ? 'sect' : 'organization';
const slug = (n) => 'liuchao.faction.x' + crypto.createHash('md5').update(n).digest('hex').slice(0, 10);
let stageEdits = 0;
for (const b of ['qingyu', 'yunlong', 'yange']) {
  const dir = join(gen, b, 'stages');
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json') && !x.endsWith('.uncertainties.json'))) {
    const p = join(dir, f); const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    let changed = false;
    const facIds = new Set((m.canon.factions || []).map(x => x.id));
    for (const c of m.canon.characters || []) {
      const aff = cardAff.get(c.name);
      if (!aff) continue;
      const rebuilt = aff.map(a => {
        const rec = facByName.get(a.faction) || { id: slug(a.faction), category: guessCat(a.faction) };
        if (!facByName.has(a.faction)) facByName.set(a.faction, rec);
        if (!facIds.has(rec.id)) { facIds.add(rec.id); (m.canon.factions = m.canon.factions || []).push({ id: rec.id, name: a.faction, description: `${a.faction}——简介待补。`, type: '组织', features: [] }); }
        return { factionId: rec.id, category: rec.category || 'organization', role: a.role || '成员' };
      });
      if (JSON.stringify(rebuilt) !== JSON.stringify(c.affiliations || [])) { c.affiliations = rebuilt; changed = true; stageEdits++; }
    }
    if (changed) fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n');
  }
}
console.log(`stage 角色归属替换: ${stageEdits} 处`);

// 3) 同门派生边全量重建前置：剥掉旧「同势力派生」边（canon:build 的 derive 会重生）
let stripped = 0;
for (const b of ['qingyu', 'yunlong', 'yange']) {
  const dir = join(gen, b, 'stages');
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json') && !x.endsWith('.uncertainties.json'))) {
    const p = join(dir, f); const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    const before = (m.canon.relationships || []).length;
    m.canon.relationships = (m.canon.relationships || []).filter(e => !(e.tags || []).includes('同势力派生'));
    if ((m.canon.relationships || []).length !== before) { stripped += before - m.canon.relationships.length; fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n'); }
  }
}
console.log(`剥除旧同势力派生边: ${stripped}（canon:build 将按新归属重生）`);
