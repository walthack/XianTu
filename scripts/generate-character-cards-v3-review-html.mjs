#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const canonDir = join(root, 'mod-kit/generated/deepseek-v4-flash/character-canon');
const inputPath = join(canonDir, 'character-cards-v3.json');
const outPath = join(canonDir, 'character-cards-v3-review.html');

const data = JSON.parse(await readFile(inputPath, 'utf8'));

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function list(values, cls = '') {
  const arr = (values || []).filter(Boolean);
  if (!arr.length) return '<span class="muted">无</span>';
  return `<ul class="${cls}">${arr.map(value => `<li>${esc(value)}</li>`).join('')}</ul>`;
}

function chips(values) {
  const arr = (values || []).filter(Boolean);
  if (!arr.length) return '<span class="muted">无</span>';
  return arr.map(value => `<span class="chip">${esc(value)}</span>`).join('');
}

function flagChips(values) {
  const arr = (values || []).filter(Boolean);
  if (!arr.length) return '<span class="muted">无</span>';
  return arr.map(value => `<span class="flag flag-${esc(value)}">${esc(value)}</span>`).join('');
}

function phaseBlock(phases) {
  const arr = (phases || []).slice(0, 18);
  if (!arr.length) return '<div class="muted">无阶段身份</div>';
  return arr.map(phase => {
    const title = phase.stageId
      ? `${phase.stageId}${phase.seqLo || phase.seqHi ? ` · seq ${phase.seqLo ?? '?'}-${phase.seqHi ?? '?'}` : ''}`
      : `${phase.scope || 'phase'} · ${phase.seq || ''}`;
    const forbidden = phase.forbidden?.length ? `<div class="forbid">禁用：${chips(phase.forbidden)}</div>` : '';
    const notes = phase.notes?.length ? `<div class="phase-notes">${list(phase.notes)}</div>` : '';
    const desc = phase.description ? `<div class="phase-desc">${esc(phase.description)}</div>` : '';
    return `<div class="phase">
      <div class="phase-head"><span>${esc(title)}</span><span class="status">${esc(phase.status || '')}</span></div>
      <div class="phase-id">${esc(phase.identity || phase.role || '')}</div>
      ${desc}
      ${forbidden}
      ${notes}
    </div>`;
  }).join('');
}

const characters = [...data.characters].sort((a, b) => {
  const af = a.review?.flags?.length || 0;
  const bf = b.review?.flags?.length || 0;
  if (af !== bf) return bf - af;
  return a.canonicalName.localeCompare(b.canonicalName, 'zh-Hans-CN');
});

const cards = characters.map(card => {
  const id = encodeURIComponent(card.canonicalName);
  const profile = card.staticProfile || {};
  const src = (card.sourceCards || []).map(item =>
    `<tr><td>${esc(item.book)}</td><td>${esc(item.tier)}</td><td>${item.approved ? '✓' : ''}</td><td>${item.reviewed ? '✓' : ''}</td><td>${esc(item.identity)}</td></tr>`
  ).join('');
  return `<article class="card" data-name="${esc(card.canonicalName)}" data-flags="${esc((card.review?.flags || []).join(' '))}" data-books="${esc((card.books || []).join(' '))}">
    <header>
      <div>
        <h2>${esc(card.canonicalName)}</h2>
        <div class="meta">${chips(card.books)} ${card.tier ? `<span class="chip tier">${esc(card.tier)}</span>` : ''}</div>
      </div>
      <div class="actions" data-id="${esc(id)}">
        <button data-action="approve">批准</button>
        <button data-action="revise">待修</button>
        <button data-action="reject">驳回</button>
      </div>
    </header>
    <div class="flags">${flagChips(card.review?.flags)}</div>
    <section class="grid">
      <div>
        <h3>静态资料</h3>
        <dl>
          <dt>性别</dt><dd>${esc(card.gender || '未载')}</dd>
          <dt>身份摘要</dt><dd>${esc(profile.identitySummary || '未载')}</dd>
          <dt>与主角关系</dt><dd>${list(profile.relationToProtagonist)}</dd>
          <dt>称呼</dt><dd>${list(profile.formsOfAddress)}</dd>
          <dt>目标</dt><dd>${list(profile.goals)}</dd>
        </dl>
      </div>
      <div>
        <h3>阶段身份</h3>
        ${phaseBlock(card.phaseIdentities)}
      </div>
    </section>
    <details>
      <summary>展开性格 / 事件 / 来源</summary>
      <div class="detail-grid">
        <div><h4>性格</h4>${list(profile.personality)}</div>
        <div><h4>关键情节</h4>${list((profile.keyEvents || []).slice(0, 24))}</div>
        <div><h4>弱点</h4>${list(profile.weaknesses)}</div>
        <div><h4>能力/武器</h4>${list(profile.signatureAbilities)}</div>
      </div>
      <table>
        <thead><tr><th>卷</th><th>层级</th><th>批准</th><th>二验</th><th>v2 身份</th></tr></thead>
        <tbody>${src}</tbody>
      </table>
    </details>
    <textarea data-note="${esc(id)}" placeholder="备注 / 修改建议"></textarea>
  </article>`;
}).join('\n');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>角色卡 v3 审批台</title>
<style>
  :root { color-scheme: light; --bg:#f7f7f4; --ink:#222; --muted:#72716b; --line:#d8d6cc; --card:#fff; --accent:#1f6f78; --bad:#9a3412; --ok:#2f6b3f; --warn:#8a5a00; }
  * { box-sizing: border-box; }
  body { margin:0; font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--ink); background:var(--bg); }
  .top { position:sticky; top:0; z-index:3; padding:14px 18px; background:rgba(247,247,244,.96); border-bottom:1px solid var(--line); display:grid; grid-template-columns:1fr auto; gap:12px; align-items:center; }
  h1 { margin:0; font-size:20px; }
  .stats { color:var(--muted); display:flex; gap:12px; flex-wrap:wrap; }
  .toolbar { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
  input, select, button, textarea { font:inherit; }
  input, select { height:32px; border:1px solid var(--line); background:#fff; padding:0 10px; border-radius:6px; }
  button { border:1px solid var(--line); background:#fff; border-radius:6px; padding:6px 10px; cursor:pointer; }
  button:hover { border-color:var(--accent); }
  main { max-width:1280px; margin:0 auto; padding:18px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:14px; margin:0 0 14px; box-shadow:0 1px 2px rgba(0,0,0,.035); }
  .card header { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; }
  h2 { margin:0 0 6px; font-size:20px; }
  h3 { margin:12px 0 8px; font-size:15px; }
  h4 { margin:10px 0 6px; }
  .meta,.flags { display:flex; gap:6px; flex-wrap:wrap; }
  .chip,.flag { display:inline-flex; align-items:center; min-height:22px; padding:2px 7px; border-radius:999px; background:#ecebe5; color:#333; font-size:12px; }
  .tier { background:#e3f0e5; }
  .flag { background:#fff4d7; color:#6f4700; }
  .flag-needs-second-review,.flag-stage-identity-varies { background:#ffe7d6; color:#8a2e0b; }
  .flag-female-relationship-phase-needed { background:#f0e6ff; color:#5b2b87; }
  .flag-duplicate-merged { background:#e3eef8; color:#215276; }
  .grid { display:grid; grid-template-columns:minmax(320px,.9fr) minmax(420px,1.1fr); gap:16px; }
  .detail-grid { display:grid; grid-template-columns:repeat(2,minmax(260px,1fr)); gap:12px; }
  dl { display:grid; grid-template-columns:88px 1fr; gap:6px 10px; margin:0; }
  dt { color:var(--muted); }
  dd { margin:0; }
  ul { margin:0; padding-left:18px; }
  .phase { border:1px solid var(--line); border-radius:6px; padding:8px; margin-bottom:8px; background:#fbfbf8; }
  .phase-head { display:flex; justify-content:space-between; gap:8px; color:var(--muted); font-size:12px; }
  .phase-id { font-weight:600; margin-top:4px; }
  .phase-desc { color:#4b4a45; margin-top:4px; }
  .forbid { margin-top:6px; color:var(--bad); }
  .status { white-space:nowrap; }
  .actions { display:flex; gap:6px; }
  .actions button.active[data-action="approve"] { background:#e7f5ea; border-color:var(--ok); color:var(--ok); }
  .actions button.active[data-action="revise"] { background:#fff7dc; border-color:var(--warn); color:var(--warn); }
  .actions button.active[data-action="reject"] { background:#ffe8df; border-color:var(--bad); color:var(--bad); }
  textarea { width:100%; min-height:66px; margin-top:12px; border:1px solid var(--line); border-radius:6px; padding:8px; resize:vertical; }
  table { width:100%; border-collapse:collapse; margin-top:10px; }
  th,td { text-align:left; border-top:1px solid var(--line); padding:6px; vertical-align:top; }
  .muted { color:var(--muted); }
  .hidden { display:none; }
  @media (max-width: 900px) { .top { grid-template-columns:1fr; } .grid,.detail-grid { grid-template-columns:1fr; } .card header { flex-direction:column; } }
</style>
</head>
<body>
<div class="top">
  <div>
    <h1>角色卡 v3 审批台</h1>
    <div class="stats">
      <span>v2 原始卡 ${data.stats.sourceCards}</span>
      <span>v3 角色 ${data.stats.canonicalCharacters}</span>
      <span>重复合并 ${data.stats.duplicateMergedCharacters}</span>
      <span>二验 ${data.stats.needsSecondReview}</span>
      <span>女性关系阶段化 ${data.stats.femaleRelationshipPhaseNeeded}</span>
    </div>
  </div>
  <div class="toolbar">
    <input id="q" placeholder="搜索角色/身份/备注">
    <select id="flag">
      <option value="">全部 flag</option>
      <option value="needs-second-review">需要二验</option>
      <option value="duplicate-merged">重复合并</option>
      <option value="stage-identity-varies">阶段身份变化</option>
      <option value="female-relationship-phase-needed">女性关系阶段化</option>
      <option value="known-phase-identity">已知阶段身份</option>
    </select>
    <select id="book">
      <option value="">全部卷</option>
      <option value="qingyu">清羽</option>
      <option value="yunlong">云龙</option>
      <option value="yange">燕歌</option>
    </select>
    <button id="export">导出审批 JSON</button>
    <button id="clear">清空本地审批</button>
  </div>
</div>
<main>${cards}</main>
<script>
const key = 'xiantu.characterCardsV3Review.v1';
const state = JSON.parse(localStorage.getItem(key) || '{}');
function save(){ localStorage.setItem(key, JSON.stringify(state)); }
function idOf(el){ return el.closest('.actions')?.dataset.id || el.dataset.note; }
function restore(){
  document.querySelectorAll('.actions').forEach(group => {
    const id = group.dataset.id;
    const status = state[id]?.status;
    group.querySelectorAll('button').forEach(btn => btn.classList.toggle('active', btn.dataset.action === status));
  });
  document.querySelectorAll('textarea[data-note]').forEach(t => { t.value = state[t.dataset.note]?.note || ''; });
}
function applyFilters(){
  const q = document.getElementById('q').value.trim().toLowerCase();
  const flag = document.getElementById('flag').value;
  const book = document.getElementById('book').value;
  document.querySelectorAll('.card').forEach(card => {
    const okQ = !q || card.innerText.toLowerCase().includes(q);
    const okFlag = !flag || card.dataset.flags.includes(flag);
    const okBook = !book || card.dataset.books.includes(book);
    card.classList.toggle('hidden', !(okQ && okFlag && okBook));
  });
}
document.addEventListener('click', e => {
  const btn = e.target.closest('button[data-action]');
  if (btn) {
    const id = idOf(btn);
    state[id] ||= {};
    state[id].status = state[id].status === btn.dataset.action ? '' : btn.dataset.action;
    save(); restore(); return;
  }
  if (e.target.id === 'export') {
    const blob = new Blob([JSON.stringify({ exportedAt:new Date().toISOString(), reviews:state }, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'character-cards-v3-review-export.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  if (e.target.id === 'clear' && confirm('清空本地审批状态？')) {
    localStorage.removeItem(key);
    location.reload();
  }
});
document.addEventListener('input', e => {
  if (e.target.matches('textarea[data-note]')) {
    state[e.target.dataset.note] ||= {};
    state[e.target.dataset.note].note = e.target.value;
    save();
  }
  if (e.target.id === 'q') applyFilters();
});
document.addEventListener('change', e => {
  if (e.target.id === 'flag' || e.target.id === 'book') applyFilters();
});
restore();
</script>
</body>
</html>`;

await writeFile(outPath, html);
console.log(outPath);
