#!/usr/bin/env node

// 约束确定性体检（零 LLM）：把每条约束的【索引章节 citation】注释到 json，并标两类病：
//   ① 过度推断：rule/consequence 含强断言(破身/上限封顶/废功…)，但 evidence 只到弱证据(性关系/亲热/双修…)。
//   ② 过度模糊/信息不足：consequence 为"未知"/空，或 rule 过短，走向交代不清。
// 校验 citation 完整性：每条 sources 是否有 sourceIndex+heading+file，且 file 在该本 source-index 中真实存在。
// 产 constraints-audit.md（需关注项置顶），并把 audit 块写回 <book>.character-constraints-draft.json。
//
// Usage: node scripts/audit-constraints.mjs [qingyu|yunlong|yange ...]
// 备份：首次运行写 <book>.character-constraints-draft.pre-audit.json（已存在不覆盖）。

import { readFileSync, existsSync, copyFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const ccDir = join(gen, 'character-canon');
const BOOKS = ['qingyu', 'yunlong', 'yange'];
const only = process.argv.slice(2);
const books = only.length ? BOOKS.filter(b => only.includes(b)) : BOOKS;

// 强断言：声称某种不可逆的身体/功法后果
const STRONG = ['破身', '破处', '开苞', '失贞', '落红', '元红已失', '元红流出', '上限受损', '威力封顶', '封顶', '废功', '废去', '根基受损', '沦为奴', '沦为奴隶', '被破处', '无法练至最高', '无法修炼至最高'];
// 弱证据：仅能证明发生了亲密/双修，不足以推出"破身"
const WEAK = ['发生性关系', '性关系', '交欢', '交合', '欢好', '亲热', '双修', '共浴', '肌肤之亲', '云雨', '后庭', '肛交', '走后门', '约定终身'];
const hasAny = (t, arr) => arr.filter(w => (t || '').includes(w));

function audit1(c, fileSet) {
  const ruleTxt = c.rule || '';
  const consTxt = c.consequence || '';
  const evTxt = [(c.evidence || ''), ...(c.sources || []).map(s => s.evidence || '')].join(' ');
  const claim = ruleTxt + ' ' + consTxt;
  const flags = [];

  // citation 完整性
  const citations = (c.sources || []).map(s => ({ heading: s.heading || null, sourceIndex: s.sourceIndex ?? null, file: s.file || null }));
  const badCite = citations.filter(ci => ci.sourceIndex == null || !ci.heading || !ci.file || (ci.file && !fileSet.has(ci.file)));
  if (!citations.length) flags.push('无出处');
  else if (badCite.length) flags.push(`出处不全(${badCite.length}/${citations.length})`);

  // ① 过度推断：强断言出现在 claim 里，但 evidence 不含任何强断言（只有弱证据）
  const strongInClaim = hasAny(claim, STRONG);
  const strongInEv = hasAny(evTxt, STRONG);
  const weakInEv = hasAny(evTxt, WEAK);
  if (strongInClaim.length && !strongInEv.length)
    flags.push(`疑过度推断[断言:${strongInClaim.join('/')}; 证据仅:${weakInEv.join('/') || '弱/无'}]`);

  // ② 过度模糊/信息不足
  if (!consTxt || consTxt === '未知') flags.push('后果未知/空');
  if (ruleTxt.length < 12) flags.push('规则过短');

  return { citations, flags };
}

async function run() {
  const sections = [];
  let need = 0, total = 0;
  for (const id of books) {
    const file = join(ccDir, `${id}.character-constraints-draft.json`);
    if (!existsSync(file)) { console.error(`skip ${id}`); continue; }
    const bak = join(ccDir, `${id}.character-constraints-draft.pre-audit.json`);
    if (!existsSync(bak)) copyFileSync(file, bak);
    const siPath = join(gen, id, 'source-index.json');
    const fileSet = new Set(existsSync(siPath) ? JSON.parse(readFileSync(siPath, 'utf8')).map(e => e.file) : []);
    const data = JSON.parse(await readFile(file, 'utf8'));

    const flagged = [], clean = [];
    for (const ch of data.characters) for (const c of ch.constraints) {
      total++;
      const a = audit1(c, fileSet);
      c.audit = a;
      const cites = a.citations.map(ci => `〔${ci.heading || '?'}·#${ci.sourceIndex ?? '?'}〕`).join(' ');
      const line = `- **${ch.name}** ${a.flags.length ? '⚠ ' + a.flags.join('；') : '✓'}\n    - 规则：${c.rule}\n    - 出处：${cites || '—'}`;
      if (a.flags.length) { flagged.push(line); need++; } else clean.push(line);
    }
    await writeFile(file, JSON.stringify(data, null, 2) + '\n');
    sections.push(`## 《${data.bookTitle || id}》　需关注 ${flagged.length} / 共 ${flagged.length + clean.length}\n\n### ⚠ 需关注\n${flagged.join('\n') || '（无）'}\n\n### ✓ 通过\n${clean.join('\n') || '（无）'}`);
    console.error(`${id}: 需关注 ${flagged.length} / ${flagged.length + clean.length}`);
  }
  const rep = join(ccDir, 'constraints-audit.md');
  await writeFile(rep, ['# 约束确定性体检（零 LLM）', '',
    `> 每条约束已注释 audit{citations,flags} 回 json。两类病：**过度推断**(弱证据→强断言) / **过度模糊**(后果未知·规则过短·出处不全)。`,
    `> 强断言词表=${STRONG.length}个 弱证据词表=${WEAK.length}个。需关注 ${need} / 共 ${total}。需关注项请对照原文人工裁定。`, '',
    ...sections, ''].join('\n'));
  console.error(`\n报告 ${rep}（需关注 ${need} / 共 ${total}）`);
}
run();
