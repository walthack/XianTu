#!/usr/bin/env node
// P2:把富化扫描结果(affiliations/debut/storyAge)写进角色卡 staticProfile 新字段。
// 默认 dry-run;--apply 才写 character-cards-v3.json(+per-volume 若含该角色)。
// birthYear 不擅自算(需时间线锚+多数无年龄);storyAge 有值则存为参考。
import fs from 'node:fs';
import { join, resolve } from 'node:path';

const APPLY = process.argv.includes('--apply');
const root = resolve(import.meta.dirname, '..');
const cc = join(root, 'mod-kit/generated/deepseek-v4-flash/character-canon');
const scanDir = join(cc, 'enrichment-scan');
const CARD_FILES = ['character-cards-v3.json', 'qingyu.character-cards-v3.json', 'yunlong.character-cards-v3.json', 'yange.character-cards-v3.json'];

// 规范势力名集合(P0 去重后)
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const factionSet = new Set();
for (const b of ['qingyu', 'yunlong', 'yange']) { const dir = join(gen, b, 'stages');
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json') && !x.endsWith('.uncertainties.json')))
    for (const fa of (JSON.parse(fs.readFileSync(join(dir, f), 'utf8')).canon?.factions || [])) factionSet.add(fa.name);
}

// 归一映射(桶A 变体 + 桶C 裁定映射/裸名合并)
const NORMALIZE = {
  '星月湖大营': '星月湖', '程氏': '盘江程氏', '唐国': '唐国朝廷', '宋国朝廷': '宋国', '汉国': '汉国朝廷',
  '周氏（周飞）': '周族', '郭解势力': '汉国游侠', '游侠（郭解遗孤）': '汉国游侠', '汉国江湖游侠': '汉国游侠',
  '殇侯': '殇侯势力', '鹏翼商号': '鹏翼社',
  // 桶C 裁定(2026-07-02 用户)：主角/女主班底收拢为单一势力
  '程宗扬': '程宗扬势力', '程宗扬内宅': '程宗扬势力', '程宗扬麾下/直属营': '程宗扬势力',
  '程宗扬（个人）': '程宗扬势力', '程氏阵营': '程宗扬势力', '小紫': '小紫势力',
};
// 人工权威保护：归属经用户裁定/手工修正的角色，扫描结果不得覆盖其 affiliations
// （2026-07-03 审计落地 24 人 + 手工修正批；debut 同理保护 云丹琉=用户裁定清羽ch164）
const AFF_PROTECTED = new Set(['杨玉环','惊理','苏骁','侯玄','韩庚','张恽','吕巨君','定陶王','莫如霖','慈音','信永','观海','秦翰','曹季兴','高衙内','张之煌','飞鸟萤子','程郑','净念','唐季臣','阿夕','罗令','墨狼','曲武','黛姬雪娜','王哲','小紫','谢艺','武二郎','泉玉姬','岳帅','月霜']);
const DEBUT_PROTECTED = new Set(['云丹琉']);
// 成年化裁定(2026-07-04): 这些角色 storyAge 已按用户裁定调整,扫描不得覆盖
const AGE_PROTECTED = new Set(['雁儿','小玲儿','齐羽仙','王蕙','安康公主','吕奉先','高智商','霍去病']);
// 桶C pending:仍排除不写(泛外姓人,待复核)
const PENDING = new Set(['外姓人', '释特昧普势力']);

// 读结果
const results = fs.readdirSync(scanDir).filter(f => f.endsWith('.result.json'))
  .map(f => JSON.parse(fs.readFileSync(join(scanDir, f), 'utf8')))
  .filter(r => !r.parse_failed);
const byName = new Map(results.map(r => [r.name, r]));

// 加载卡(combined 为主)
const cards = {};
for (const cf of CARD_FILES) { const p = join(cc, cf); if (fs.existsSync(p)) cards[cf] = JSON.parse(fs.readFileSync(p, 'utf8')); }
const combined = cards['character-cards-v3.json'];
// name/alias → 规范名
const nameToCanon = new Map();
for (const c of combined.characters) { nameToCanon.set(c.canonicalName, c.canonicalName); for (const a of c.aliases || []) if (!nameToCanon.has(a)) nameToCanon.set(a, c.canonicalName); }

let willAff = 0, willDebut = 0, willAge = 0, noCard = 0, unknownFac = new Set();
const applyToCard = (c) => {
  const r = byName.get(c.canonicalName) || (c.aliases || []).map(a => byName.get(a)).find(Boolean);
  if (!r) return;
  const sp = c.staticProfile; let touched = false;
  const seen = new Set();
  const aff = [];
  for (const a of (r.affiliations || [])) {
    if (!a || !a.faction || PENDING.has(a.faction)) continue;
    const fac = NORMALIZE[a.faction] || a.faction;
    if (seen.has(fac)) continue; seen.add(fac);
    if (!factionSet.has(fac)) unknownFac.add(fac);
    aff.push({ faction: fac, role: a.role || '' });
  }
  if (aff.length && !AFF_PROTECTED.has(c.canonicalName)) { if (APPLY) sp.affiliations = aff; willAff++; touched = true; }
  if (r.debut && r.debut.location && !DEBUT_PROTECTED.has(c.canonicalName)) { if (APPLY) sp.debutLocation = { location: r.debut.location, locator: r.debut.locator || '', scene: r.debut.scene || '' }; willDebut++; touched = true; }
  if (r.storyAge && r.storyAge.value != null && !AGE_PROTECTED.has(c.canonicalName)) { if (APPLY) sp.storyAge = { value: r.storyAge.value, basis: r.storyAge.basis || '' }; willAge++; touched = true; }
  return touched;
};

// combined 主写
for (const c of combined.characters) applyToCard(c);
// 报告未命中卡的 result
for (const r of results) if (!nameToCanon.has(r.name)) noCard++;

// per-volume:同名角色同步(仅当已 apply)
if (APPLY) {
  for (const cf of CARD_FILES.slice(1)) { const d = cards[cf]; if (!d) continue;
    const cmap = new Map(combined.characters.map(c => [c.canonicalName, c.staticProfile]));
    for (const c of d.characters) { const src = cmap.get(c.canonicalName); if (!src) continue;
      for (const k of ['affiliations', 'debutLocation', 'storyAge']) if (src[k]) c.staticProfile[k] = src[k];
    }
    fs.writeFileSync(join(cc, cf), JSON.stringify(d, null, 2) + '\n');
  }
  fs.writeFileSync(join(cc, 'character-cards-v3.json'), JSON.stringify(combined, null, 2) + '\n');
}

console.log(`=== P2 富化写卡 ${APPLY ? '(已写)' : '(DRY-RUN)'} ===`);
console.log(`扫描结果:${results.length}(排除解析失败) | 写 affiliations:${willAff} | 写 debutLocation:${willDebut} | 写 storyAge:${willAge} | result无对应卡:${noCard}`);
if (unknownFac.size) console.log(`⚠ 扫出的势力名不在规范集(需核/新增):${[...unknownFac].join('、')}`);
