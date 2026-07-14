#!/usr/bin/env node

// 把分级后的 highlight-graded.{model}.json 整理成可直接开工的工单：
//  1) 识别性相关 beat → 压到中低档(pri≤55) + 标"脱敏"(保留事件骨架,落beat时非性化处理)。
//  2) 近重复合并(同角色+标题前缀)。
//  3) 按 pri 分区：必落(≥137) / 建议(100-136) / 脱敏改造(红线) / 其余(<100)。
// 只出工单,不改 stage。
//
// Usage: node scripts/build-highlight-worklist.mjs --model=deepseek

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const BOOKS = { qingyu: '六朝清羽记', yunlong: '六朝云龙吟', yange: '六朝燕歌行' };
const arg = (k, def) => { const m = process.argv.find(a => a.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : def; };
const model = arg('model', 'deepseek');

// 收紧的性相关判定：只抓真正的性内容，不误伤"性格/一世英名/勒杀"等。
const SEX = /阳具|献身|口含|交合|云雨|房事|鼎炉|春宫|情欲|性交|媾和|媾欢|欢好|淫辱|奸淫|裸身|裸露|处子之身|以身相酬|双修/;
const SEX_CAP = 55; // 脱敏项优先级上限（压到中低档）

function dedupe(items) {
  const seen = new Map(); // key -> best item
  for (const it of items) {
    const key = `${it.char || ''}|${(it.title || '').slice(0, 8)}`;
    const prev = seen.get(key);
    if (!prev || (it.pri || 0) > (prev.pri || 0)) seen.set(key, it);
  }
  return [...seen.values()];
}

function build(book) {
  const src = join(gen, book, `highlight-graded.${model}.json`);
  if (!existsSync(src)) { console.log(`跳过 ${book}：无 ${src}`); return; }
  let items = JSON.parse(readFileSync(src, 'utf8'));
  // 红线：标脱敏 + 压档
  for (const it of items) {
    const blob = (it.title || '') + (it.why || '') + (it.suggestion || '');
    if (SEX.test(blob)) { it.desex = true; it.pri = Math.min(it.pri || 0, SEX_CAP); }
  }
  // 只保留有意义的（原 tier S/A/B，丢 C/D 噪声）
  items = items.filter(it => ['S', 'A', 'B'].includes(it.tier));
  items = dedupe(items).sort((a, b) => (b.pri || 0) - (a.pri || 0));

  const must = items.filter(i => !i.desex && i.pri >= 137);
  const rec = items.filter(i => !i.desex && i.pri >= 100 && i.pri < 137);
  const desex = items.filter(i => i.desex).sort((a, b) => (b.pri || 0) - (a.pri || 0));
  const rest = items.filter(i => !i.desex && i.pri < 100);

  const fr = i => `全书${(i.charFreqShown ?? '')}`; // freq 已隐含在 pri，不再单列
  const line = i => `- **[${i.tier}·pri${i.pri}]** ${i.type}｜${i.title || ''}　→ \`${i.rec}\`${i.desex ? ' 🔞脱敏' : ''}\n  - 角色：${i.char || '?'}${i.def && i.def !== '无' ? `·${i.def}` : ''}　\`${i.window || ''}\`\n  - ${i.why || ''}${i.matchedBeat ? `（现beat：${i.matchedBeat}）` : ''}\n  - 补写：${i.suggestion || ''}`;

  const md = [
    `# ${BOOKS[book]} 高光/机趣工单（源:${model}）`,
    ``,
    `去重后 ${items.length} 条。分区：必落 ${must.length} / 建议 ${rec.length} / 脱敏改造 ${desex.length} / 其余 ${rest.length}。`,
    `性相关条目已压到中低档并标 🔞脱敏——保留事件骨架，落 beat 时按非性化改造（臣服/要挟/牺牲等）。`,
    ``,
    `## 一、必落（pri≥137：配角定义性高光为主）`,
    must.length ? must.map(line).join('\n') : '（无）', ``,
    `## 二、建议（pri 100-136）`,
    rec.length ? rec.map(line).join('\n') : '（无）', ``,
    `## 三、脱敏改造（性相关，中低档，非性化后再落）`,
    desex.length ? desex.map(line).join('\n') : '（无）', ``,
    `## 四、其余（pri<100，可选/丰富现有 beat）`,
    rest.length ? rest.map(line).join('\n') : '（无）', ``,
  ].join('\n');
  writeFileSync(join(gen, book, `highlight-worklist.${model}.md`), md);
  writeFileSync(join(gen, book, `highlight-worklist.${model}.json`), JSON.stringify({ must, rec, desex, rest }, null, 1));
  console.log(`${BOOKS[book]}: 必落 ${must.length} / 建议 ${rec.length} / 脱敏 ${desex.length} / 其余 ${rest.length}`);
}

for (const b of Object.keys(BOOKS)) build(b);
