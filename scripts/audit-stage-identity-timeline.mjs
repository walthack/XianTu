#!/usr/bin/env node

// Audit stage character identity text against the story timeline.
// Goal: catch phase-identity bleed, e.g. a later title being projected into an earlier stage.

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const canonDir = join(root, 'mod-kit/generated/deepseek-v4-flash/character-canon');
const builtinsDir = join(root, 'src/modules/scenarioMods/builtins/data');
const outPath = join(canonDir, 'stage-identity-timeline-audit.md');

const HIGH_RISK_TERMS = [
  '秦国正使',
  '秦国使者',
  '唐皇私下召见',
  '占卜官',
  '唐皇占卜',
  '汉使',
  '舞阳侯',
  '太皇太后',
  '皇后',
  '昭仪',
  '公主',
  '宗主',
  '掌教',
  '方丈',
  '盟主',
  '护法',
  '内臣',
  '宦官',
  '太监',
  '御姬奴',
  '仙姬',
  '正使',
  '使者',
];

const BOOK_PREFIX = {
  lcq: 'qingyu',
  lyl: 'yunlong',
  lyg: 'yange',
};

function textOf(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(textOf).join('；');
  if (typeof value === 'object') return Object.values(value).map(textOf).join('；');
  return String(value);
}

function compact(value, max = 180) {
  const s = String(value || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

function stageBook(mod) {
  const id = mod.manifest?.id || mod.id || '';
  const prefix = id.split('.')[0];
  return BOOK_PREFIX[prefix] || prefix;
}

function stageSeq(mod) {
  const manifest = mod.manifest || {};
  const lo = Number.isFinite(manifest.axisSeqLo) ? manifest.axisSeqLo : null;
  const hi = Number.isFinite(manifest.axisSeqHi) ? manifest.axisSeqHi : lo;
  return { lo, hi };
}

function hasTerm(text, term) {
  return text.includes(term);
}

function firstTimelineSeq(nodes, name, term) {
  const exact = nodes.find(node =>
    (node.participants || []).includes(name) &&
    hasTerm(`${node.beat || ''} ${node.heading || ''}`, term),
  );
  if (exact) return exact.seq;
  const loose = nodes.find(node =>
    hasTerm(`${node.beat || ''} ${node.heading || ''}`, name) &&
    hasTerm(`${node.beat || ''} ${node.heading || ''}`, term),
  );
  return loose?.seq ?? null;
}

function charIdentityFields(character) {
  return [
    { scope: 'identity', label: 'role', text: character.role || '' },
    { scope: 'identity', label: 'description', text: character.description || '' },
    { scope: 'identity', label: 'profile.origin', text: character.profile?.origin || '' },
    { scope: 'identity', label: 'affiliations', text: textOf(character.affiliations) },
    { scope: 'notes', label: 'profile.notes', text: textOf(character.profile?.notes) },
    { scope: 'notes', label: 'profile.memories', text: textOf(character.profile?.memories) },
    { scope: 'notes', label: 'profile.currentThought', text: character.profile?.currentThought || '' },
  ].filter(field => field.text);
}

const timeline = JSON.parse(await readFile(join(canonDir, 'story-timeline.json'), 'utf8'));
const nodes = timeline.nodes || [];
const files = (await readdir(builtinsDir)).filter(file => file.endsWith('.json')).sort();

const findings = [];
const scanRows = [];

for (const file of files) {
  const path = join(builtinsDir, file);
  const mod = JSON.parse(await readFile(path, 'utf8'));
  const { lo, hi } = stageSeq(mod);
  const book = stageBook(mod);
  const stageId = mod.manifest?.id || file.replace(/\.json$/, '');
  for (const character of mod.canon?.characters || []) {
    for (const field of charIdentityFields(character)) {
      const matchedTerms = HIGH_RISK_TERMS.filter(term => hasTerm(field.text, term));
      if (!matchedTerms.length) continue;
      for (const term of matchedTerms) {
        const firstSeq = firstTimelineSeq(nodes, character.name, term);
        const suspicious = firstSeq != null && hi != null && firstSeq > hi;
        const unknown = firstSeq == null;
        scanRows.push({ book, stageId, hi, name: character.name, term, firstSeq, suspicious, unknown, scope: field.scope, label: field.label });
        if (suspicious) {
          findings.push({
            stageId,
            file,
            hi,
            name: character.name,
            term,
            firstSeq,
            scope: field.scope,
            label: field.label,
            text: compact(field.text),
          });
        }
      }
    }
  }
}

const lines = [];
lines.push('# 阶段身份 × 时间线核验');
lines.push('');
lines.push(`生成时间：${new Date().toISOString()}`);
lines.push('');
lines.push('目标：检查 stage 中的人物身份/定位是否把后期身份提前投到早期剧情。运行时不会自动按时间线切换人物身份，因此阶段身份必须预先写进各 stage/canon。');
lines.push('');
lines.push(`- 扫描 stage：${files.length}`);
lines.push(`- 高风险身份命中：${scanRows.length}`);
lines.push(`- 明确提前出现：${findings.length}`);
lines.push(`- 其中身份字段：${findings.filter(row => row.scope === 'identity').length}`);
lines.push(`- 其中备注/关系字段：${findings.filter(row => row.scope === 'notes').length}`);
lines.push('');

lines.push('## 明确提前出现：身份字段');
lines.push('');
const identityFindings = findings.filter(row => row.scope === 'identity');
if (!identityFindings.length) {
  lines.push('- 未发现明确的“时间线首次出现晚于 stage”的身份词。');
} else {
  for (const f of identityFindings) {
    lines.push(`- **${f.stageId} / ${f.name}**：\`${f.term}\` 出现在 ${f.label}，stage seq<=${f.hi}，但时间线首次匹配在 #${f.firstSeq}`);
    lines.push(`  - 文件：\`${f.file}\``);
    lines.push(`  - 当前身份文本：${f.text}`);
  }
}
lines.push('');

lines.push('## 明确提前出现：备注/关系字段');
lines.push('');
const noteFindings = findings.filter(row => row.scope === 'notes');
if (!noteFindings.length) {
  lines.push('- 无。');
} else {
  for (const f of noteFindings) {
    lines.push(`- **${f.stageId} / ${f.name}**：\`${f.term}\` 出现在 ${f.label}，stage seq<=${f.hi}，但时间线首次匹配在 #${f.firstSeq}`);
    lines.push(`  - 文件：\`${f.file}\``);
    lines.push(`  - 当前备注文本：${f.text}`);
  }
}
lines.push('');

lines.push('## 需要人工看一眼的未知匹配');
lines.push('');
const unknowns = scanRows.filter(row => row.unknown);
if (!unknowns.length) {
  lines.push('- 无。');
} else {
  for (const row of unknowns.slice(0, 120)) {
    lines.push(`- ${row.stageId} / ${row.name}：\`${row.term}\` 出现在 ${row.label}，未在时间线中找到同名同词节点（可能是合法常态身份，也可能是卡片推断词）。`);
  }
  if (unknowns.length > 120) lines.push(`- ... 另有 ${unknowns.length - 120} 条未列出。`);
}
lines.push('');

lines.push('## 规则建议');
lines.push('');
lines.push('- 角色卡应支持“阶段身份”写法：早期身份、转折事件、后期身份。');
lines.push('- stage 投影人物卡时，应优先使用当前 stage 轴线范围内的阶段身份，而不是默认取最终态。');
lines.push('- 对跨卷角色（徐君房、程宗扬、袁天罡、一世不拾大师等）尤其要避免后期官职/称号/关系倒灌。');

await writeFile(outPath, `${lines.join('\n')}\n`);
console.log(outPath);
