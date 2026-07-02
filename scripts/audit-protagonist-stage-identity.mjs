#!/usr/bin/env node

// Build a stage-by-stage identity matrix for Cheng Zongyang.
// He travels across states and often carries multiple overlapping identities, so
// generic "later title appeared early" checks are not enough for him.

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const builtinsDir = join(root, 'src/modules/scenarioMods/builtins/data');
const outPath = join(root, 'mod-kit/generated/deepseek-v4-flash/character-canon/protagonist-stage-identity-matrix.md');

const CHENG_ID = 'liuchao.character.cheng_zongyang';
const TITLE_TERMS = [
  '商人',
  '客卿',
  '奴隶',
  '执事',
  '星月湖',
  '少主',
  '大行令',
  '通问计议使',
  '汉国舞阳侯',
  '舞阳侯',
  '汉国正使',
  '正使',
  '副使',
  '博陆郡王',
  '郡王',
  '王爷',
];

function textOf(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(textOf).join('；');
  if (typeof value === 'object') return Object.values(value).map(textOf).join('；');
  return String(value);
}

function compact(value, max = 140) {
  const s = String(value || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

function stageSeq(mod) {
  const manifest = mod.manifest || {};
  const lo = Number.isFinite(manifest.axisSeqLo) ? manifest.axisSeqLo : null;
  const hi = Number.isFinite(manifest.axisSeqHi) ? manifest.axisSeqHi : lo;
  return { lo, hi };
}

function manifestStageName(mod) {
  return mod.manifest?.name || mod.manifest?.id || '未命名 stage';
}

function stageCountry(mod) {
  const joined = [
    mod.manifest?.id,
    mod.manifest?.name,
    mod.manifest?.description,
    mod.world?.name,
    mod.world?.era,
    mod.world?.background,
  ].filter(Boolean).join('；');
  const countries = [];
  for (const country of ['秦', '晋', '宋', '汉', '唐']) {
    if (joined.includes(`${country}国`) || joined.includes(`${country}军`) || joined.includes(`${country}宫`)) countries.push(`${country}国`);
  }
  if (joined.includes('南荒')) countries.push('南荒');
  if (joined.includes('太泉')) countries.push('太泉古阵');
  return [...new Set(countries)].join(' / ') || '未明';
}

function titleHits(row) {
  const text = [
    row.role,
    row.description,
    row.origin,
    row.affiliations,
    row.playerRole,
    row.background,
  ].join('；');
  return TITLE_TERMS.filter(term => text.includes(term));
}

function socialIdentity(row) {
  if (row.stageId === 'lcq.stage_01' || row.stageId === 'lcq.stage_02') {
    return '序章：穿越/左武军临时依附，不列入社会身份起点';
  }
  if (row.stageId === 'lcq.stage_03') return '苏妲己名下奴隶（白湖商馆奴隶）';
  if (row.playerRole) return row.playerRole;

  const affiliations = row.affiliations.split('；').filter(Boolean);
  const affiliationRole = affiliations.at(-1) || '';
  if (affiliationRole && !affiliationRole.includes('.')) return affiliationRole;
  return row.role || '待补';
}

const files = (await readdir(builtinsDir)).filter(file => file.endsWith('.json')).sort();
const rows = [];

for (const file of files) {
  const mod = JSON.parse(await readFile(join(builtinsDir, file), 'utf8'));
  const character = (mod.canon?.characters || []).find(item => item.id === CHENG_ID || item.name === '程宗扬');
  if (!character) continue;
  const { lo, hi } = stageSeq(mod);
  const row = {
    file,
    stageId: mod.manifest?.id || file.replace(/\.json$/, ''),
    stageName: manifestStageName(mod),
    lo,
    hi,
    country: stageCountry(mod),
    playerRole: mod.scenario?.opening?.playerRole || mod.opening?.playerRole || '',
    role: character.role || '',
    description: character.description || '',
    origin: character.profile?.origin || '',
    affiliations: textOf(character.affiliations),
    background: mod.world?.background || '',
  };
  row.socialIdentity = socialIdentity(row);
  row.hits = titleHits(row);
  rows.push(row);
}

const lines = [];
lines.push('# 程宗扬阶段身份矩阵');
lines.push('');
lines.push(`生成时间：${new Date().toISOString()}`);
lines.push('');
lines.push('用途：程宗扬的公开身份会随国家、任务、出使名义和随行阵营变化。本表用于核验 stage 中的男主身份是否应写成“当前公开身份 + 可用底牌/旧身份”，避免把后续官职或其他国家身份直接倒灌。');
lines.push('');
lines.push('口径：`穿越者`是底层来历，不算六朝社会身份链起点；`lcq.stage_01/02` 视为序章/临时依附，第一稳定社会身份从 `lcq.stage_03` 的“苏妲己名下奴隶（白湖商馆奴隶）”开始。');
lines.push('');
lines.push('| Seq | Stage | 地域/国家 | 社会身份口径 | opening.playerRole | 角色 role | 命中身份词 |');
lines.push('| --- | --- | --- | --- | --- | --- | --- |');
for (const row of rows) {
  const seq = row.lo === row.hi ? String(row.lo ?? '') : `${row.lo ?? '?'}-${row.hi ?? '?'}`;
  lines.push(`| ${seq} | ${row.stageId} | ${row.country} | ${compact(row.socialIdentity, 40)} | ${compact(row.playerRole, 34)} | ${compact(row.role, 34)} | ${row.hits.join('、') || '无'} |`);
}
lines.push('');
lines.push('## 逐 stage 摘要');
lines.push('');
for (const row of rows) {
  const seq = row.lo === row.hi ? String(row.lo ?? '') : `${row.lo ?? '?'}-${row.hi ?? '?'}`;
  lines.push(`### ${row.stageId}（${seq}）`);
  lines.push('');
  lines.push(`- 文件：\`${row.file}\``);
  lines.push(`- Stage：${row.stageName}`);
  lines.push(`- 地域/国家：${row.country}`);
  lines.push(`- 社会身份口径：${row.socialIdentity}`);
  if (row.playerRole) lines.push(`- opening.playerRole：${row.playerRole}`);
  lines.push(`- character.role：${row.role || '未写'}`);
  lines.push(`- character.description：${compact(row.description, 220) || '未写'}`);
  if (row.origin) lines.push(`- profile.origin：${compact(row.origin, 180)}`);
  if (row.affiliations) lines.push(`- affiliations：${compact(row.affiliations, 220)}`);
  if (row.background) lines.push(`- world.background：${compact(row.background, 220)}`);
  lines.push('');
}
lines.push('## 写法建议');
lines.push('');
lines.push('- 每个 stage 的程宗扬建议拆成：`当前公开身份`、`当地可调用身份/资源`、`不宜提前暴露的后续身份`。');
lines.push('- `穿越者`只写在来历/底色，不作为身份链节点；身份链第一节点是“苏妲己名下奴隶（白湖商馆奴隶）”。');
lines.push('- `character.role` 优先写当前 stage 玩家实际扮演/被外界识别的身份；跨国旧身份可写进备注，但不要覆盖当前任务身份。');
lines.push('- 出使相关身份必须带国家与阶段，例如“宋国通问计议使”“汉国使团交涉核心”“汉国正使”，不要只写“正使”。');
lines.push('- 若同一 stage 已有多个国家身份，`opening.playerRole` 应比人物卡更具体，人物卡保持稳定底色。');

await writeFile(outPath, `${lines.join('\n')}\n`);
console.log(outPath);
