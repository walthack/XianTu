#!/usr/bin/env node
// 把旧存档(年0帧)对齐到新纪年基点200:统一平移所有「年」时间戳 +200(消灭负出生年、保持内部一致)
// + 寿元入人类尺度 + 修不可能年龄 + 补漏势力。不动战力/进度/记忆。realm 高手榜对齐留待 canon 结构化后 re-sync。
// 输出新文件,保留原档。用法:node scripts/reconcile-save.mjs
import fs from 'node:fs';

const IN = '/Volumes/botsvault/06_material/XianTu-Mod-Kit/save/仙途-存档1-2026-07-02.json';
const OUT = '/Volumes/botsvault/06_material/XianTu-Mod-Kit/save/仙途-存档1-修正版-2026-07-02.json';
const OFFSET = 200; // 年0帧 → 基点200(主角出生 0→200)

// 新境界寿命上限(人类尺度,取新区间上界)
const LIFECAP = { 凡人: 90, 练气: 95, 筑基: 100, 金丹: 110, 元婴: 120, 化神: 135, 炼虚: 150, 合体: 160, 渡劫: 200 };
const realmOf = (n) => (n?.境界?.名称) || '凡人';

const s = JSON.parse(fs.readFileSync(IN, 'utf8'));
const d = s.payload.saves[0].存档数据;
const log = [];

// 1) 统一平移所有「年」时间戳 +200(键名恰为「年」的都是日期年;间隔配置键是「最小间隔年」等,不受影响)
let shifted = 0;
const shiftYears = (o) => {
  if (Array.isArray(o)) return o.forEach(shiftYears);
  if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o)) {
      if (k === '年' && typeof v === 'number') { o[k] = v + OFFSET; shifted++; }
      else shiftYears(v);
    }
  }
};
shiftYears(d);
const cur = d.元数据.时间.年;
log.push(`统一平移「年」+${OFFSET}: 共 ${shifted} 处 | 时间.年→${cur} | 玩家出生→${d.角色?.身份?.出生日期?.年}(年龄${cur - d.角色.身份.出生日期.年})`);

// 玩家寿命上限入档(练气)
const pl = d.角色?.属性?.寿命;
if (pl && pl.上限 > LIFECAP.练气) { log.push(`玩家 寿命上限: ${pl.上限} → ${LIFECAP.练气}`); pl.上限 = LIFECAP.练气; }

// 2) NPC:不可能年龄压回人类值 + 寿元入档 + 补漏势力
const rel = d.社交?.关系 || {};
for (const [k, n] of Object.entries(rel)) {
  const name = n.名字 || k;
  const realm = realmOf(n);
  const cap = LIFECAP[realm] ?? 100;
  if (n.出生日期 && typeof n.出生日期.年 === 'number') {
    let age = cur - n.出生日期.年;
    let note = `${name}(${realm}): 出生年${n.出生日期.年} 年龄${age}`;
    if (age >= cap) {
      const target = Math.min(age, Math.round(cap * 0.6));
      n.出生日期.年 = cur - target;
      note += ` ⚠年龄≥寿元 → 压到${target}(出生${n.出生日期.年})`;
    }
    log.push('  ' + note);
  }
  const lifeMax = n.属性?.寿元上限 ?? n.寿元上限;
  if (typeof lifeMax === 'number' && lifeMax > cap) {
    if (n.属性 && '寿元上限' in n.属性) n.属性.寿元上限 = cap;
    if ('寿元上限' in n) n.寿元上限 = cap;
    log.push(`     寿元上限 ${lifeMax} → ${cap}`);
  }
  if (name === '谢艺' && !n.势力归属) { n.势力归属 = '星月湖'; log.push('     势力归属(空) → 星月湖'); }
}

s.exportedAt = new Date().toISOString();
fs.writeFileSync(OUT, JSON.stringify(s));
console.log('=== 修正明细 ===');
log.forEach(l => console.log(l));
// 校验:无残留负年份
const neg = (JSON.stringify(d).match(/"年":-\d+/g) || []);
console.log('\n残留负年份:', neg.length ? neg.length + ' 处 ' + [...new Set(neg)].join(',') : '无 ✓');
console.log('输出:', OUT);
