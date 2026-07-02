#!/usr/bin/env node

// Build a human-review package for unifying character aliases into v3 cards.
// This is deterministic and review-only: it does not modify character-cards-v3.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const canonDir = join(root, 'mod-kit/generated/deepseek-v4-flash/character-canon');
const outDir = resolve(process.argv[2] || join(canonDir, 'alias-unification-review'));
const nasDir = '/Volumes/botsvault/06_material/XianTu-Mod-Kit/alias-unification-review/character-canon-2026-07-01';
const books = ['qingyu', 'yunlong', 'yange'];
const forcedDuplicateMerges = [
  {
    from: '朱老头（刘谋）',
    into: '殇侯',
    aliasesToCarry: ['次卿', '老头', '刘谋', '马倌', '山长', '五陵刘谋', '朱老头'],
    note: '人工规则：朱老头（刘谋）为错误组合卡，应并入殇侯。',
  },
];

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function uniq(items) {
  return [...new Set(items.filter(Boolean).map(x => String(x).trim()).filter(Boolean))];
}

function splitName(name) {
  const out = new Set([name]);
  const bare = String(name || '').replace(/[（(][^）)]*[）)]/g, '').trim();
  if (bare) out.add(bare);
  for (const m of String(name || '').matchAll(/[（(]([^）)]+)[）)]/g)) {
    for (const p of m[1].split(/[\/、·•・]/).map(s => s.trim())) if (p.length >= 2) out.add(p);
  }
  for (const p of bare.split(/[·•・]/).map(s => s.trim())) if (p.length >= 2) out.add(p);
  return [...out].filter(Boolean);
}

function parseTitleNameComposite(name) {
  const value = String(name || '').trim();
  const m = value.match(/^([一-龥]{1,4}王)([李刘赵朱][一-龥]{1,3})$/);
  if (!m) return null;
  return { title: m[1], personalName: m[2], displayName: value };
}

function aliasKey(value) {
  return String(value || '').replace(/\s+/g, '').trim();
}

function isBareCourtTitle(name) {
  return /^(伪)?(太皇太后|太后|皇太后|皇后|皇上|陛下|圣上|天子|皇帝|皇叔|唐皇|宋主)$/.test(String(name || '').trim());
}

function titleBase(name) {
  return String(name || '').replace(/[（(][^）)]*[）)]/g, '').replace(/^伪/, '').trim();
}

function isSovereignOrRegentTitle(name) {
  return /^(太皇太后|太后|皇太后|皇后|皇上|陛下|圣上|天子|皇帝|唐皇|宋主)$/.test(titleBase(name));
}

function isScopedCourtTitle(name) {
  return /^(伪)?(太皇太后|太后|皇太后|皇后|皇上|陛下|圣上|天子|皇帝|皇叔|唐皇|宋主)\([汉唐宋晋秦](?:·[^)]+)?\)$/.test(String(name || '').trim());
}

function titleScopeStatus(name) {
  const value = String(name || '').trim();
  if (!isScopedCourtTitle(value)) return '';
  if (!isSovereignOrRegentTitle(value)) return 'scoped_unique';
  return /·[^)]+/.test(value) ? 'scoped_stage' : 'needs_stage';
}

function cardContext(card) {
  const p = card.staticProfile || {};
  return [
    card.canonicalName,
    card.gender,
    ...(card.books || []),
    p.identitySummary,
    p.speechStyle,
    ...(p.formsOfAddress || []),
    ...(p.keyEvents || []),
    ...(card.phaseIdentities || []).flatMap(x => [x.identity, x.role, x.description, ...(x.notes || [])]),
    ...(card.sourceCards || []).flatMap(x => [x.book, x.identity, x.role, x.relationToProtagonist]),
  ].filter(Boolean).join(' ');
}

function inferCountry(card, extraText = '') {
  const text = `${cardContext(card)} ${extraText}`;
  if (/大汉|汉国|汉朝|汉宫|汉帝|汉家|江都王/.test(text)) return '汉国';
  if (/大唐|唐国|唐朝|唐皇|唐宫|唐帝|李唐/.test(text)) return '唐国';
  if (/大宋|宋国|宋朝|宋主|宋帝|宋廷/.test(text)) return '宋国';
  if (/大晋|晋国|晋朝|晋帝|晋廷/.test(text)) return '晋国';
  if (/大秦|秦国|秦朝|秦帝|秦廷/.test(text)) return '秦国';
  return '';
}

function countryShort(country) {
  return {
    汉国: '汉',
    唐国: '唐',
    宋国: '宋',
    晋国: '晋',
    秦国: '秦',
  }[country] || country;
}

function normalizeAliasForCard(card, alias, detail = {}) {
  const raw = String(alias || '').trim();
  if (!raw) return { alias: '', note: '' };
  if (/[（(]/.test(raw) && splitName(raw).includes(card.canonicalName)) return { alias: '', note: '组合显示名已跳过' };
  if (/^\([^)]{1,6}\)/.test(raw) || /^（[^）]{1,6}）/.test(raw)) return { alias: raw, note: '' };
  const genericTitle = isBareCourtTitle(raw);
  if (!genericTitle) return { alias: raw, note: '' };
  const country = inferCountry(card, JSON.stringify(detail));
  if (!country) return { alias: raw, note: '裸称谓，未能自动判定国家；审核时需注明所属国家' };
  return { alias: `${raw}(${countryShort(country)})`, note: `裸称谓已自动限定为 ${country}` };
}

function proposalRisk(proposal) {
  if (proposal.action !== 'add_alias') return 'manual';
  if (proposal.alias && /[（(]/.test(proposal.alias) && splitName(proposal.alias).includes(proposal.targetCanonicalName)) return 'drop_display';
  const status = titleScopeStatus(proposal.alias);
  if (status === 'needs_stage') return 'needs_stage_scope';
  if (status === 'scoped_stage') return 'scoped_stage';
  if (status === 'scoped_unique') return 'scoped_title';
  return 'safe_alias';
}

function applyModeForRisk(risk) {
  if (risk === 'needs_stage_scope') return 'card_display_only_until_scoped';
  if (risk === 'manual') return 'manual_merge_or_create';
  if (risk === 'merge_duplicate_card') return 'manual_merge_or_create';
  if (risk === 'drop_display') return 'drop';
  if (risk === 'duplicate_reverse_alias') return 'drop';
  return 'global_alias_candidate';
}

function sameStableId(a, b) {
  const idsA = new Set((a.sources || []).map(s => s.id).filter(Boolean));
  const idsB = new Set((b.sources || []).map(s => s.id).filter(Boolean));
  return [...idsA].some(id => idsB.has(id));
}

function sourceScoreForCanonical(proposal) {
  let score = 0;
  for (const source of proposal.sources || []) {
    if (source.source === 'character-alias-registry') score += 4;
    if (source.source?.endsWith('.character-id-map')) score += 2;
    if (source.type === '本名') score -= 2;
    if (source.via === proposal.targetCanonicalName) score += 1;
  }
  return score;
}

function collapseReciprocalAliasProposals(proposals) {
  const byPair = new Map();
  for (const p of proposals) {
    if (p.action !== 'add_alias' || !p.targetCanonicalName || !p.alias) continue;
    const pair = [p.targetCanonicalName, p.alias].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')).join('::');
    const arr = byPair.get(pair) || [];
    arr.push(p);
    byPair.set(pair, arr);
  }
  for (const arr of byPair.values()) {
    if (arr.length !== 2) continue;
    const [a, b] = arr;
    if (a.targetCanonicalName !== b.alias || b.targetCanonicalName !== a.alias) continue;
    const shouldCollapse = sameStableId(a, b) ||
      (a.sources || []).some(s => s.source === 'character-alias-registry') ||
      (b.sources || []).some(s => s.source === 'character-alias-registry');
    if (!shouldCollapse) continue;
    const keep = sourceScoreForCanonical(a) >= sourceScoreForCanonical(b) ? a : b;
    const drop = keep === a ? b : a;
    keep.action = 'merge_character';
    keep.mergeFrom = keep.alias;
    keep.mergeInto = keep.targetCanonicalName;
    keep.risk = 'merge_duplicate_card';
    keep.applyMode = applyModeForRisk(keep.risk);
    keep.reviewed = false;
    keep.approved = false;
    keep.note = `互反别名疑似重复角色卡：应合并 ${keep.mergeFrom} -> ${keep.mergeInto}，并保留 ${keep.alias} 为别名。`;
    drop.risk = 'duplicate_reverse_alias';
    drop.applyMode = applyModeForRisk(drop.risk);
    drop.approved = false;
    drop.note = `反向重复项；由 merge_character: ${keep.mergeFrom} -> ${keep.mergeInto} 处理。`;
  }
  return proposals.filter(p => p.risk !== 'duplicate_reverse_alias');
}

function collapseDuplicateManualNameProposals(proposals) {
  const out = [];
  const manualByName = new Map();
  for (const p of proposals) {
    if ((p.action === 'missing_registry_character' || p.action === 'id_map_orphan') && p.suggestedName) {
      const key = p.suggestedName;
      const existing = manualByName.get(key);
      if (existing) {
        existing.alias = uniq([...(existing.alias || '').split(/\n/), ...(p.alias || '').split(/\n/)]).join('\n');
        existing.sources = [...(existing.sources || []), ...(p.sources || [])];
        existing.ids = uniq([...(existing.ids || []), existing.id, p.id]);
        existing.roles = uniq([...(existing.roles || []), existing.role, p.role]);
        if (!existing.id && p.id) existing.id = p.id;
        if (!existing.role && p.role) existing.role = p.role;
        const notes = uniq([existing.note, p.note].filter(Boolean));
        existing.note = notes.join('\n');
        continue;
      }
      manualByName.set(key, p);
    }
    out.push(p);
  }
  return out;
}

function collapseForcedDuplicateMerges(proposals) {
  const out = [];
  for (const forced of forcedDuplicateMerges) {
    const removed = [];
    for (let i = proposals.length - 1; i >= 0; i--) {
      const p = proposals[i];
      const isForcedAlias = p.action === 'add_alias' &&
        p.targetCanonicalName === forced.from &&
        forced.aliasesToCarry.includes(p.alias);
      const isForcedManual = (p.action === 'missing_registry_character' || p.action === 'id_map_orphan') &&
        (p.suggestedName === forced.from || forced.aliasesToCarry.includes(p.suggestedName));
      if (!isForcedAlias && !isForcedManual) continue;
      removed.push(p);
      proposals.splice(i, 1);
    }
    if (!removed.length) continue;
    out.push({
      action: 'merge_character',
      targetCanonicalName: forced.into,
      alias: forced.from,
      mergeFrom: forced.from,
      mergeInto: forced.into,
      aliasesToCarry: forced.aliasesToCarry,
      books: uniq(removed.flatMap(p => p.books || [])),
      sources: removed.flatMap(p => p.sources || []),
      confidence: 'high',
      reviewed: false,
      approved: false,
      risk: 'merge_duplicate_card',
      applyMode: applyModeForRisk('merge_duplicate_card'),
      note: `${forced.note} 相关称呼：${forced.aliasesToCarry.join(' / ')}。`,
    });
  }
  return [...proposals, ...out];
}

function buildLookup(cards) {
  const lookup = new Map();
  for (const card of cards) {
    for (const name of uniq([card.canonicalName, ...(card.aliases || []), ...splitName(card.canonicalName)])) {
      if (isBareCourtTitle(name)) continue;
      const key = aliasKey(name);
      if (!lookup.has(key)) lookup.set(key, []);
      lookup.get(key).push(card);
    }
  }
  return lookup;
}

function bestMatch(lookup, name) {
  for (const variant of splitName(name)) {
    const hits = lookup.get(aliasKey(variant)) || [];
    if (hits.length === 1) return { card: hits[0], via: variant, ambiguous: false };
    if (hits.length > 1) return { card: hits[0], via: variant, ambiguous: true, candidates: hits.map(c => c.canonicalName) };
  }
  return null;
}

function addAliasProposal(map, card, alias, source, detail = {}) {
  const normalized = normalizeAliasForCard(card, alias, detail);
  alias = normalized.alias;
  if (!alias || alias === card.canonicalName || (card.aliases || []).includes(alias)) return;
  const rawName = detail.rawName || '';
  const isCompositeSource = /[（(]/.test(rawName) && splitName(rawName).includes(card.canonicalName);
  const key = `${card.canonicalName}::${alias}`;
  const rec = map.get(key) || {
    action: 'add_alias',
    targetCanonicalName: card.canonicalName,
    alias,
    books: uniq(card.books || []),
    sources: [],
    confidence: 'medium',
    reviewed: false,
    approved: proposalRisk({ action: 'add_alias', targetCanonicalName: card.canonicalName, alias }) !== 'needs_stage_scope',
    note: normalized.note || '',
  };
  if (normalized.note && !rec.note.includes(normalized.note)) rec.note = rec.note ? `${rec.note}\n${normalized.note}` : normalized.note;
  if (!isCompositeSource) rec.sources.push({ source, ...detail });
  map.set(key, rec);
}

function candidateRow(p, index) {
  const risk = p.risk || proposalRisk(p);
  const applyMode = p.applyMode || applyModeForRisk(risk);
  const search = [
    p.action, p.targetCanonicalName, p.alias, p.suggestedName,
    p.id, p.role, p.note, risk, applyMode, ...(p.sources || []).map(s => JSON.stringify(s)),
  ].join(' ').toLowerCase();
  const title = p.action === 'add_alias'
    ? `${p.targetCanonicalName} ← ${p.alias}`
    : p.action === 'merge_character'
      ? `${p.mergeFrom || p.alias || p.suggestedName} -> ${p.mergeInto || p.targetCanonicalName}`
    : `${p.suggestedName || p.alias || p.targetCanonicalName}`;
  const warning = risk === 'needs_stage_scope'
    ? '<div class="warn">君主/摄政称谓只有国家作用域，不能进入全局 lookup；需要补阶段，如 名称(国·阶段)，或仅作为卡内展示别名。</div>'
    : risk === 'manual'
      ? '<div class="warn">待建/待合并项：不能走 add_alias，需人工决定 create_card 或 merge。</div>'
      : '';
  return `<article class="card risk-${esc(risk)}" data-action="${esc(p.action)}" data-risk="${esc(risk)}" data-apply="${esc(applyMode)}" data-search="${esc(search)}">
    <header>
      <div>
        <div class="title">
          <h2>${index + 1}. ${esc(title)}</h2>
          <label><input type="checkbox" class="reviewed" ${p.reviewed ? 'checked' : ''}> 已审核</label>
          <label><input type="checkbox" class="approved" ${p.approved ? 'checked' : ''}> 采纳</label>
        </div>
        <div class="meta">
          <span>${esc(p.action)}</span>
          <span>${esc(p.confidence || 'medium')}</span>
          <span class="risk-chip">${esc(risk)}</span>
          <span>${esc(applyMode)}</span>
          ${(p.books || []).map(b => `<span>${esc(b)}</span>`).join('')}
        </div>
      </div>
    </header>
    ${warning}
    <section class="grid">
      <label>action<textarea data-field="action" data-array="no">${esc(p.action)}</textarea></label>
      <label>targetCanonicalName<textarea data-field="targetCanonicalName" data-array="no">${esc(p.targetCanonicalName || '')}</textarea></label>
      <label>alias<textarea data-field="alias" data-array="no">${esc(p.alias || '')}</textarea></label>
      <label>suggestedName<textarea data-field="suggestedName" data-array="no">${esc(p.suggestedName || '')}</textarea></label>
      <label>id<textarea data-field="id" data-array="no">${esc(p.id || '')}</textarea></label>
      <label>role<textarea data-field="role" data-array="no">${esc(p.role || '')}</textarea></label>
      <label>risk<textarea data-field="risk" data-array="no">${esc(risk)}</textarea></label>
      <label>applyMode<textarea data-field="applyMode" data-array="no">${esc(applyMode)}</textarea></label>
    </section>
    <section>
      <h3>来源</h3>
      <pre>${esc(JSON.stringify(p.sources || [], null, 2))}</pre>
    </section>
    <section>
      <h3>审核备注</h3>
      <textarea data-field="note" data-array="no">${esc(p.note || '')}</textarea>
    </section>
  </article>`;
}

async function buildHtml(review, output) {
  const actionStats = review.proposals.reduce((acc, p) => {
    acc[p.action] = (acc[p.action] || 0) + 1;
    return acc;
  }, {});
  const stats = {
    addAlias: review.stats.addAlias ?? actionStats.add_alias ?? 0,
    missingRegistryCharacter: review.stats.missingRegistryCharacter ?? actionStats.missing_registry_character ?? 0,
    idMapOrphan: review.stats.idMapOrphan ?? actionStats.id_map_orphan ?? 0,
  };
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>角色别名统一审核</title>
<style>
body{margin:0;background:#f6f6f2;color:#202124;font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.top{position:sticky;top:0;z-index:5;background:rgba(246,246,242,.96);border-bottom:1px solid #d8d6cf;backdrop-filter:blur(8px)}
.wrap{max-width:1220px;margin:0 auto;padding:16px 20px}h1{font-size:22px;margin:0 0 8px}h2{font-size:18px;margin:0}h3{font-size:14px;margin:10px 0 6px}
.controls{display:grid;grid-template-columns:1fr auto auto auto;gap:8px}input,select,button,textarea{border:1px solid #d8d6cf;border-radius:6px;background:white;color:#202124;font:inherit}input,select,button{height:36px;padding:0 10px}button{cursor:pointer}
.card{background:white;border:1px solid #d8d6cf;border-radius:8px;margin:12px 0;padding:14px;box-shadow:0 1px 2px rgba(0,0,0,.04)}.card.done{border-color:#8fc79c;box-shadow:0 0 0 2px rgba(33,110,57,.08)}
.card.risk-needs_stage_scope{border-color:#e5b567}.card.risk-manual{border-color:#d8a0a0}.card.risk-scoped_stage,.card.risk-scoped_title{border-color:#9bbfe0}
.title{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.title label{display:inline-flex;gap:6px;align-items:center;border:1px solid #d8d6cf;border-radius:999px;padding:3px 10px;color:#5f6368}.title input{width:16px;height:16px}
.meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.meta span{display:inline-flex;border:1px solid #d8d6cf;border-radius:999px;padding:2px 8px;background:#fafafa;font-size:12px}
.risk-chip{background:#fff4d6!important;border-color:#efd28a!important}.risk-safe_alias .risk-chip{background:#e6f4ea!important;border-color:#b7dfc2!important}.risk-manual .risk-chip,.risk-needs_stage_scope .risk-chip{background:#fce8e6!important;border-color:#f3b3ad!important}
.rules{border:1px solid #d8d6cf;border-radius:8px;background:#fff;padding:10px;margin:10px 0;color:#3c4043}.rules ul{margin:6px 0 0;padding-left:20px}.warn{margin:10px 0;padding:8px 10px;border-left:3px solid #b06000;background:#fff4d6;border-radius:4px;color:#7a4300}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}label{display:block;color:#5f6368;font-size:12px}textarea{display:block;width:100%;min-height:44px;margin-top:4px;padding:8px;resize:vertical;color:#202124}pre{white-space:pre-wrap;background:#f8f9fa;border:1px solid #e2e2dd;border-radius:6px;padding:10px;overflow:auto}.hidden{display:none}
@media(max-width:760px){.controls,.grid{grid-template-columns:1fr}.wrap{padding:12px}}
</style>
</head>
<body>
<div class="top"><div class="wrap">
<h1>角色别名统一审核</h1>
<p>补别名 ${stats.addAlias} 项；疑似新角色/待合并 ${stats.missingRegistryCharacter} 项；id-map 遗留名 ${stats.idMapOrphan} 项。</p>
<div class="rules">
  <b>Claude 二审规则</b>
  <ul>
    <li>导出落地必须同时满足 <code>reviewed=true</code> 与 <code>approved=true</code>。</li>
    <li>裸朝廷称谓不进全局别名；称谓格式用后缀：<code>太后(汉)</code>、<code>太皇太后(唐·阶段)</code>。</li>
    <li>君主/摄政称谓只有国家仍不够，风险为 <code>needs_stage_scope</code> 时需补阶段，或仅作卡内展示。</li>
    <li>组合显示名如 <code>李昂（唐皇）</code>、<code>太皇太后郭氏</code> 只作来源/displayName，不作为 alias。</li>
  </ul>
</div>
<div class="controls">
  <input id="q" placeholder="搜索角色/别名/id/来源">
  <select id="action"><option value="">全部类型</option><option value="add_alias">补别名</option><option value="missing_registry_character">疑似新角色/待合并</option><option value="id_map_orphan">id-map 遗留名</option></select>
  <select id="risk"><option value="">全部风险</option><option value="safe_alias">可作为别名</option><option value="scoped_title">带作用域称谓</option><option value="scoped_stage">带阶段称谓</option><option value="needs_stage_scope">需补阶段</option><option value="manual">待建/待合并</option></select>
  <button id="exportAll">导出全部</button>
  <button id="exportReviewed">导出已审核</button>
  <button id="exportApplicable">导出可落地</button>
</div>
</div></div>
<main class="wrap">${review.proposals.map(candidateRow).join('\n')}</main>
<script>
const KEY='xiantu.aliasUnificationReview.v2';
const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
function readCard(card){
  const obj={reviewed:card.querySelector('.reviewed').checked,approved:card.querySelector('.approved').checked};
  card.querySelectorAll('textarea[data-field]').forEach(el=>{obj[el.dataset.field]=el.value.trim()});
  return obj;
}
function cardKey(card){return [card.querySelector('[data-field="action"]').value,card.querySelector('[data-field="targetCanonicalName"]').value,card.querySelector('[data-field="alias"]').value,card.querySelector('[data-field="suggestedName"]').value].join('::')}
function save(){const data={};document.querySelectorAll('.card').forEach(c=>data[cardKey(c)]=readCard(c));localStorage.setItem(KEY,JSON.stringify(data))}
document.querySelectorAll('.card').forEach(card=>{
  const key=cardKey(card); if(saved[key]){card.querySelector('.reviewed').checked=!!saved[key].reviewed;card.querySelector('.approved').checked=!!saved[key].approved;card.querySelectorAll('textarea[data-field]').forEach(el=>{if(saved[key][el.dataset.field]!=null)el.value=saved[key][el.dataset.field]})}
  card.classList.toggle('done',card.querySelector('.reviewed').checked);
  card.addEventListener('input',save);
  card.querySelectorAll('input[type="checkbox"]').forEach(el=>el.addEventListener('change',()=>{card.classList.toggle('done',card.querySelector('.reviewed').checked);save()}));
});
function filter(){const q=document.getElementById('q').value.trim().toLowerCase();const action=document.getElementById('action').value;const risk=document.getElementById('risk').value;document.querySelectorAll('.card').forEach(c=>c.classList.toggle('hidden',(q&&!c.dataset.search.includes(q))||(action&&c.dataset.action!==action)||(risk&&c.dataset.risk!==risk)))}
document.getElementById('q').addEventListener('input',filter);document.getElementById('action').addEventListener('change',filter);document.getElementById('risk').addEventListener('change',filter);
function download(name,data){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download=name;a.click()}
document.getElementById('exportAll').onclick=()=>download('alias-unification-review-all.json',[...document.querySelectorAll('.card')].map(readCard));
document.getElementById('exportReviewed').onclick=()=>download('alias-unification-review-reviewed.json',[...document.querySelectorAll('.card')].map(readCard).filter(x=>x.reviewed));
document.getElementById('exportApplicable').onclick=()=>download('alias-unification-review-applicable.json',[...document.querySelectorAll('.card')].map(readCard).filter(x=>x.reviewed&&x.approved&&x.applyMode==='global_alias_candidate'));
</script>
</body>
</html>`;
  await writeFile(output, html);
}

async function run() {
  await mkdir(outDir, { recursive: true });
  const data = await readJson(join(canonDir, 'character-cards-v3.json'));
  const cards = data.characters || [];
  const lookup = buildLookup(cards);
  const idToCard = new Map();
  const aliasProposals = new Map();
  const missingRegistry = [];
  const idMapOrphans = [];

  const registry = await readJson(join(canonDir, 'character-alias-registry.json'));
    for (const rec of registry.characters || []) {
    const titleName = parseTitleNameComposite(rec.canonicalName);
    const lookupName = titleName?.personalName || rec.canonicalName;
    const match = bestMatch(lookup, lookupName);
    if (match?.card && !match.ambiguous) {
      if (rec.id) idToCard.set(rec.id, match.card);
      if (titleName) addAliasProposal(aliasProposals, match.card, titleName.title, 'character-alias-registry.titleNameComposite', { id: rec.id, role: rec.role || '', rawName: rec.canonicalName, via: match.via });
      for (const alias of rec.aliases || []) addAliasProposal(aliasProposals, match.card, alias, 'character-alias-registry', { id: rec.id, role: rec.role || '', via: match.via });
      if (rec.realName) addAliasProposal(aliasProposals, match.card, rec.realName, 'character-alias-registry.realName', { id: rec.id, role: rec.role || '', via: match.via });
    } else {
      const titleAliases = (rec.aliases || []).filter(isBareCourtTitle);
      missingRegistry.push({
        action: 'missing_registry_character',
        suggestedName: titleName?.personalName || rec.canonicalName,
        alias: uniq([titleName?.title, ...(rec.aliases || [])]).join('\n'),
        id: rec.id,
        role: rec.role || '',
        books: rec.books || [],
        sources: [{ source: 'character-alias-registry', aliases: rec.aliases || [], multiNameAcrossStages: rec.multiNameAcrossStages || [], match, rawName: rec.canonicalName, titleNameComposite: titleName || undefined }],
        confidence: match?.ambiguous ? 'low' : 'medium',
        reviewed: false,
        approved: false,
        note: titleName
          ? `组合显示名已拆分：${titleName.displayName} -> 原名 ${titleName.personalName}，alias ${titleName.title}。`
          : titleAliases.length
          ? `含裸朝廷称谓 ${titleAliases.join('、')}；必须按国家/阶段限定，不能作为全局别名。例：宋国太皇太后多指刘娥；唐国篇太皇太后指郭氏；吕雉仅在汉国篇第五集第7章后可用该级别称号。`
          : (match?.ambiguous ? `疑似撞名：${match.candidates.join(' / ')}` : '角色卡未找到明确同名/别名；需要判断是新角色还是并入现有角色。'),
      });
    }
  }

  const reg2Path = join(canonDir, 'alias-registry-v2.json');
  if (existsSync(reg2Path)) {
    const reg2 = await readJson(reg2Path);
    for (const rec of reg2.characters || []) {
      const match = bestMatch(lookup, rec.name);
      if (!match?.card || match.ambiguous) continue;
      for (const alias of rec.aliases || []) {
        addAliasProposal(aliasProposals, match.card, alias.alias, 'alias-registry-v2', { book: rec.book, type: alias.type || '', evidence: alias.evidence || '', notes: rec.notes || '' });
      }
    }
  }

  const missingByNameOrId = new Map();
  for (const item of missingRegistry) {
    if (item.suggestedName) missingByNameOrId.set(`name:${item.suggestedName}`, item);
    if (item.id) missingByNameOrId.set(`id:${item.id}`, item);
  }

  for (const book of books) {
    const idMap = await readJson(join(canonDir, `${book}.character-id-map.json`));
    for (const [name, rec] of Object.entries(idMap)) {
      const idMatchedCard = rec.id ? idToCard.get(rec.id) : null;
      const titleName = parseTitleNameComposite(name);
      const lookupName = titleName?.personalName || name;
      const match = idMatchedCard ? { card: idMatchedCard, via: 'id-map-id', ambiguous: false } : bestMatch(lookup, lookupName);
      if (match?.card && !match.ambiguous) {
        if (titleName) addAliasProposal(aliasProposals, match.card, titleName.title, `${book}.character-id-map.titleNameComposite`, { id: rec.id || '', role: rec.role || '', via: match.via, rawName: name });
        for (const variant of splitName(name)) {
          if (titleName && variant === titleName.displayName) continue;
          if (variant !== match.card.canonicalName && !(match.card.aliases || []).includes(variant)) {
            addAliasProposal(aliasProposals, match.card, variant, `${book}.character-id-map`, { id: rec.id || '', role: rec.role || '', via: match.via, rawName: name });
          }
        }
      } else {
        const existing = missingByNameOrId.get(`name:${name}`) || (rec.id ? missingByNameOrId.get(`id:${rec.id}`) : null);
        if (existing) {
          existing.books = uniq([...(existing.books || []), book]);
          existing.sources.push({ source: `${book}.character-id-map`, id: rec.id || '', role: rec.role || '', match });
          if (!existing.role && rec.role) existing.role = rec.role;
          continue;
        }
        idMapOrphans.push({
          action: 'id_map_orphan',
          suggestedName: titleName?.personalName || name,
          alias: uniq([titleName?.title, ...splitName(name).filter(x => x !== name && x !== titleName?.personalName)]).join('\n'),
          id: rec.id || '',
          role: rec.role || '',
          books: [book],
          sources: [{ source: `${book}.character-id-map`, id: rec.id || '', role: rec.role || '', match, rawName: name, titleNameComposite: titleName || undefined }],
          confidence: match?.ambiguous ? 'low' : 'medium',
          reviewed: false,
          approved: false,
          note: titleName ? `组合显示名已拆分：${titleName.displayName} -> 原名 ${titleName.personalName}，alias ${titleName.title}。` : (match?.ambiguous ? `疑似撞名：${match.candidates.join(' / ')}` : 'id-map 中存在，但角色卡未找到明确同名/别名。'),
        });
      }
    }
  }

  const proposals = collapseForcedDuplicateMerges(collapseDuplicateManualNameProposals(collapseReciprocalAliasProposals([
    ...[...aliasProposals.values()].sort((a, b) => a.targetCanonicalName.localeCompare(b.targetCanonicalName, 'zh-Hans-CN') || a.alias.localeCompare(b.alias, 'zh-Hans-CN')),
    ...missingRegistry.sort((a, b) => a.suggestedName.localeCompare(b.suggestedName, 'zh-Hans-CN')),
    ...idMapOrphans.sort((a, b) => a.suggestedName.localeCompare(b.suggestedName, 'zh-Hans-CN')),
  ].map(proposal => {
    const risk = proposalRisk(proposal);
    const finalRisk = proposal.risk || risk;
    return {
      ...proposal,
      risk: finalRisk,
      applyMode: proposal.applyMode || applyModeForRisk(finalRisk),
    };
  }))));
  const riskStats = proposals.reduce((acc, p) => {
    acc[p.risk] = (acc[p.risk] || 0) + 1;
    return acc;
  }, {});
  const review = {
    generatedAt: new Date().toISOString(),
    source: {
      cards: 'character-cards-v3.json',
      registry: 'character-alias-registry.json',
      registryV2: 'alias-registry-v2.json',
      idMaps: books.map(b => `${b}.character-id-map.json`),
    },
    stats: {
      cards: cards.length,
      addAlias: aliasProposals.size,
      missingRegistryCharacter: missingRegistry.length,
      idMapOrphan: idMapOrphans.length,
      total: proposals.length,
      risks: riskStats,
    },
    proposals,
  };
  await writeFile(join(outDir, 'alias-unification-proposals.json'), `${JSON.stringify(review, null, 2)}\n`);
  await writeFile(join(outDir, 'REPORT.md'), [
    '# Character alias unification review',
    '',
    `- Cards: ${review.stats.cards}`,
    `- Add alias proposals: ${review.stats.addAlias}`,
    `- Missing registry characters: ${review.stats.missingRegistryCharacter}`,
    `- ID-map orphans: ${review.stats.idMapOrphan}`,
    `- Total review rows: ${review.stats.total}`,
    `- Risk stats: ${JSON.stringify(review.stats.risks)}`,
    '',
    '## Court-title rule',
    '',
    '- Bare court titles are not global aliases: 太皇太后, 太后, 皇太后, 皇后, 皇上, 陛下, 圣上, 天子, 皇帝.',
    '- Title aliases use suffix scope, such as `太后(汉)`; sovereign/regent titles should use temporal scope, such as `太皇太后(唐·阶段)`.',
    '- 太皇太后 is especially context-bound: 宋国篇多指刘娥；唐国篇指郭氏；吕雉 only gains the higher title after the relevant Han-volume chapter, so it needs temporal/stage scope before global lookup.',
    '',
  ].join('\n'));
  await buildHtml(review, join(outDir, 'review.html'));

  if (existsSync('/Volumes/botsvault')) {
    await mkdir(nasDir, { recursive: true });
    for (const file of ['alias-unification-proposals.json', 'REPORT.md', 'review.html']) {
      await writeFile(join(nasDir, file), await readFile(join(outDir, file)));
    }
  }
  console.log(JSON.stringify({ outDir, nasDir, stats: review.stats }, null, 2));
}

if (process.env.XIANTU_ALIAS_REVIEW_HTML_FROM_JSON) {
  const review = await readJson(resolve(process.env.XIANTU_ALIAS_REVIEW_HTML_FROM_JSON));
  await mkdir(outDir, { recursive: true });
  await buildHtml(review, join(outDir, 'review.html'));
  if (existsSync('/Volumes/botsvault')) {
    await mkdir(nasDir, { recursive: true });
    await writeFile(join(nasDir, 'review.html'), await readFile(join(outDir, 'review.html')));
  }
  console.log(JSON.stringify({ outDir, html: join(outDir, 'review.html'), source: process.env.XIANTU_ALIAS_REVIEW_HTML_FROM_JSON }, null, 2));
} else {
  run().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
