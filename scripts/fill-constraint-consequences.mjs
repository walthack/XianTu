#!/usr/bin/env node

// 确定性补「后果未知/空」的约束后果（仅从 rule 本身的逻辑推出，不读原文、不加新强断言）。
// 标 consequenceProvenance:"inferred-from-rule"。需原文确认的不在此列（留空，见 audit 报告）。
// 另修潘金莲一条缺 heading/file 的出处(#128→莲菊/0170.html)。
// 备份：<book>.character-constraints-draft.pre-fill.json（不覆盖既有）。
//
// Usage: node scripts/fill-constraint-consequences.mjs

import { existsSync, copyFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const ccDir = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash', 'character-canon');

// {book, name, ruleIncludes, consequence}
const PLAN = [
  // qingyu
  { book: 'qingyu', name: '凝羽', ruleIncludes: '太一经末技', consequence: '性行为不符双修功法要求时，真气交换无法正确进行、修炼受阻；殇侯指其所习为末技，需以正确方法修习方能正补。' },
  { book: 'qingyu', name: '慈音', ruleIncludes: '出家尼姑应守清净', consequence: '破戒（淫乱）则违背门规、有损出家身份与修行根基。' },
  { book: 'qingyu', name: '静善', ruleIncludes: '出家尼姑应守清净', consequence: '破戒（淫乱）则违背门规、有损出家身份与修行根基。' },
  // yunlong
  { book: 'yunlong', name: '鲁智深', ruleIncludes: '佛门戒律', consequence: '破戒则违佛门清规、有损修行身份。' },
  { book: 'yunlong', name: '媚娘', ruleIncludes: '玉露楼', consequence: '未经赎身或他人包养，则无法脱离玉露楼，持续受其控制。' },
  { book: 'yunlong', name: '尹馥兰', ruleIncludes: '妖铃收服', consequence: '违逆主人则受妖铃／所献一魂一魄操控之惩，须维持雌伏侍奉。' },
  { book: 'yunlong', name: '云丹琉', ruleIncludes: '云氏', consequence: '公开私情则违背云氏家族规矩，受族中约束与约谈。' },
  // yange
  { book: 'yange', name: '阮香凝', ruleIncludes: '双修深入交合', consequence: '强行深入交合会以死气伤及伴侣，故须避免深入双修。' },
  { book: 'yange', name: '吕雉', ruleIncludes: '刘奭故意采用后庭', consequence: '因仅后庭、未行正交，吕雉处子之身得以保全，以处子为前提的相关条件不受损。' },
  { book: 'yange', name: '吕奉先', ruleIncludes: '天策府', consequence: '未按时报到或违反学规者，受天策府学规处分。' },
  { book: 'yange', name: '袁天罡', ruleIncludes: '保持童身', consequence: '一旦破童身，预知能力即丧失或大幅衰退。' },
  { book: 'yange', name: '周飞', ruleIncludes: '不能人道', consequence: '无法行房事，性功能缺失。' },
  { book: 'yange', name: '仇亢宗', ruleIncludes: '睾丸被摘除', consequence: '生殖功能受损，可能丧失生育能力。' },
  { book: 'yange', name: '萧氏', ruleIncludes: '被征服者', consequence: '违抗主人则受惩处、失去待遇。' },
  { book: 'yange', name: '安乐公主', ruleIncludes: '被征服者', consequence: '违抗主人则受惩处、失去待遇。' },
  { book: 'yange', name: '安乐', ruleIncludes: '欲嬛', consequence: '违抗人身／性支配则受奴役身份（欲嬛）之约束与惩处。' },
  { book: 'yange', name: '郑注（鱼注）', ruleIncludes: '尸傀', consequence: '完全受炼制者操控，丧失自主行动能力。' },
];

const isEmpty = v => !v || v === '未知';

async function run() {
  const byBook = {};
  for (const p of PLAN) (byBook[p.book] ||= []).push(p);
  let filled = 0, miss = [];
  const books = new Set([...PLAN.map(p => p.book), 'yange']);
  for (const book of books) {
    const file = join(ccDir, `${book}.character-constraints-draft.json`);
    const bak = join(ccDir, `${book}.character-constraints-draft.pre-fill.json`);
    if (!existsSync(bak)) copyFileSync(file, bak);
    const data = JSON.parse(await readFile(file, 'utf8'));
    for (const p of byBook[book] || []) {
      const ch = data.characters.find(c => c.name === p.name);
      const c = ch?.constraints.find(c => (c.rule || '').includes(p.ruleIncludes) && isEmpty(c.consequence));
      if (!c) { miss.push(`${book}/${p.name}「${p.ruleIncludes}」`); continue; }
      c.consequence = p.consequence;
      c.consequenceProvenance = 'inferred-from-rule';
      filled++;
    }
    // 潘金莲 #128 出处补 heading/file
    if (book === 'yange') {
      for (const ch of data.characters) if (ch.name === '潘金莲')
        for (const c of ch.constraints) for (const s of c.sources || [])
          if (s.sourceIndex === 128 && !s.heading) { s.heading = '莲菊'; s.file = s.file || '0170.html'; console.error('修潘金莲 #128 → 莲菊/0170.html'); }
    }
    await writeFile(file, JSON.stringify(data, null, 2) + '\n');
  }
  console.error(`\n补后果 ${filled}/${PLAN.length}${miss.length ? '；未命中: ' + miss.join(', ') : ''}`);
}
run();
