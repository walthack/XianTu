#!/usr/bin/env node
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const generated = path.join(root, 'mod-kit/generated/deepseek-v4-flash');
const series = ['qingyu', 'yunlong', 'yange'];
const futureLanguage = /随后|后来|最终|结局|下场|未来|将会|第\d{1,4}章|后续/;
const minorRole = /军士|士卒|守卫|侍卫|仆|婢|侍女|百姓|村民|店小二|杂役/;
const highRealm = /元婴|化神|炼虚|合体|渡劫/;

const rows = [];
let characterInstances = 0;
let temporalNotes = 0;
let roleRealm = 0;
let worldGravity = 0;

for (const book of series) {
  const dir = path.join(generated, book, 'stages');
  for (const filename of (await readdir(dir)).filter(name => name.endsWith('.json') && !name.endsWith('.uncertainties.json'))) {
    const data = JSON.parse(await readFile(path.join(dir, filename), 'utf8'));
    for (const event of data?.scenario?.events || []) {
      if (String(event?.offscreenResolution?.id || '').startsWith('offscreen.r2_9.')) worldGravity++;
    }
    for (const character of data?.canon?.characters || []) {
      characterInstances++;
      const notes = Array.isArray(character?.profile?.notes) ? character.profile.notes : [];
      const leaking = notes.filter(note => futureLanguage.test(String(note)));
      if (leaking.length) {
        temporalNotes++;
        if (rows.length < 40) rows.push({
          severity: 'P2', type: 'notes时间门控候选', file: `${book}/stages/${filename}`,
          character: character.name, detail: String(leaking[0]).replace(/\s+/g, ' ').slice(0, 140),
        });
      }
      if (minorRole.test(String(character.role || character.description || '')) && highRealm.test(String(character.realm || ''))) {
        roleRealm++;
        rows.push({
          severity: 'P1', type: 'role×境界异常', file: `${book}/stages/${filename}`,
          character: character.name, detail: `${character.role || character.description || '低阶身份'} / ${character.realm}`,
        });
      }
    }
  }
}

const lines = [
  '# R2-9 数据治理审计（可复跑）',
  '',
  '> 生成命令：`node scripts/audit-r2-9-data-governance.mjs`。这是风险定位报告，不自动覆盖人工正典。',
  '',
  '## 汇总',
  '',
  `- 扫描人物实例：${characterInstances}`,
  `- notes 含未来时态/章节词的门控候选：${temporalNotes}（候选不等于实锤；需逐条按 stage 时间确认）`,
  `- 低阶身份×高修仙境界异常：${roleRealm}`,
  `- R2-9 新增世界引力合同：${worldGravity}`,
  '- 年龄：沿用 P0 的寿元 clamp、孩童绝对年龄优先与新档 0 负岁门禁；本审计不重复改出生年。',
  '- 境界显示：`realmUtils.ts` 已在右栏和主提示词使用六朝高手榜词表；底层存档仍保留修仙等级用于排序。',
  '',
  '## 风险样本',
  '',
  '|级别|类型|文件|人物|样本|',
  '|---|---|---|---|---|',
  ...rows.map(row => `|${row.severity}|${row.type}|${row.file}|${row.character || ''}|${row.detail.replace(/\|/g, '／')}|`),
  '',
  '## 处置口径',
  '',
  '- P1 role×境界异常必须先核原文/高手榜再改，不允许脚本按身份词直接降级。',
  '- P2 notes 候选按关卡 `axisSeqLo/axisSeqHi` 做逐条门控；含“随后/后来”但描述已发生回忆者不得误删。',
  '- 每批数据修复先复制到 `stages-pre-*-backup`，修后以该备份链 diff 界定审计范围。',
  '- AFF_PROTECTED / AGE_PROTECTED / DEBUT_PROTECTED / USER_CANON 继续只读。',
  '',
];

const out = path.join(root, 'docs/R2-9-DATA-GOVERNANCE-AUDIT-2026-07-18.md');
await writeFile(out, `${lines.join('\n')}\n`);
console.log(`R2-9 governance audit written: ${path.relative(root, out)}`);
console.log(JSON.stringify({ characterInstances, temporalNotes, roleRealm, worldGravity }));
