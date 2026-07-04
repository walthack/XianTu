#!/usr/bin/env node
// 落地 bottomline-scan 的原文底线扫描结果 —— 仅填 principles 为空的角色，置信中/高才落。
// 低置信/空结果留 bottomline-scan/REPORT-低置信待人工.md。幂等。
// 用法：node scripts/apply-bottomline-scan.mjs
import fs from 'node:fs';
import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit/generated/deepseek-v4-flash');
const scanDir = join(gen, 'character-canon/bottomline-scan');
const combined = JSON.parse(fs.readFileSync(join(scanDir, 'combined.json'), 'utf8'));
// 弱底线主要角色：现有 principles 是目标/性格误填，允许覆盖（用户指认小紫/乐明珠一类）
const WEAK_OVERWRITE = new Set(JSON.parse(fs.readFileSync('/private/tmp/claude-501/-Users-clawbot-Projects-XianTu/994f80a9-9c43-4d08-8f37-1f739eb4ec17/scratchpad/bottomline-weak-overwrite.json', 'utf8')));

const trusted = new Map(), lowconf = [];
for (const [name, r] of Object.entries(combined)) {
  const pr = (r.principles || []).filter(x => x && x.trim());
  if (pr.length && (r.confidence === '高' || r.confidence === '中')) trusted.set(name, pr);
  else lowconf.push({ name, principles: pr, confidence: r.confidence, parse_failed: r.parse_failed });
}
console.log(`可落地(中/高): ${trusted.size} | 低置信/空待人工: ${lowconf.length}`);

let filled = 0;
for (const cf of ['character-cards-v3.json', 'qingyu.character-cards-v3.json', 'yunlong.character-cards-v3.json', 'yange.character-cards-v3.json']) {
  const p = join(gen, 'character-canon', cf); if (!fs.existsSync(p)) continue;
  const doc = JSON.parse(fs.readFileSync(p, 'utf8')); let ch = false;
  for (const c of doc.characters) {
    const sp = c.staticProfile; if (!sp) continue;
    const hasPr = (sp.principles || []).length;
    if (hasPr && !WEAK_OVERWRITE.has(c.canonicalName)) continue; // 已有且非弱→跳过
    const pr = trusted.get(c.canonicalName); if (!pr) continue;
    sp.principles = pr; filled++; ch = true;
  }
  if (ch) fs.writeFileSync(p, JSON.stringify(doc, null, 2) + '\n');
}
console.log(`填充底线(空→扫描): ${filled} 处`);

const md = ['# 底线扫描·低置信/空 待人工', '', `> 共 ${lowconf.length} 人扫不出可信底线（原文片段不足或角色太次要）。`, ''];
for (const x of lowconf) md.push(`- ${x.name}（${x.confidence || '?'}${x.parse_failed ? '·解析失败' : ''}）${x.principles?.length ? '：' + x.principles.join('；') : ''}`);
fs.writeFileSync(join(scanDir, 'REPORT-低置信待人工.md'), md.join('\n'));
console.log(`低置信名单 → REPORT-低置信待人工.md`);
