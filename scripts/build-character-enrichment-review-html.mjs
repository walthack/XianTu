#!/usr/bin/env node

// Build a standalone review HTML for multimodel character enrichment proposals.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const input = resolve(process.argv[2] || 'mod-kit/generated/deepseek-v4-flash/character-canon/multimodel-enrichment/enrichment-proposals.json');
const output = resolve(process.argv[3] || 'mod-kit/generated/deepseek-v4-flash/character-canon/multimodel-enrichment/review.html');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textList(items) {
  if (!Array.isArray(items) || items.length === 0) return '<span class="muted">空</span>';
  return `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function pill(text, cls = '') {
  return `<span class="pill ${cls}">${escapeHtml(text)}</span>`;
}

function confidencePills(confidence) {
  const ds = confidence?.deepseek || 'missing';
  const mm = confidence?.minimax || 'missing';
  const cls = v => v === 'high' ? 'ok' : v === 'medium' ? 'mid' : 'bad';
  return `${pill(`DeepSeek: ${ds}`, cls(ds))}${pill(`MiniMax: ${mm}`, cls(mm))}`;
}

function block(title, body) {
  return `<section class="block"><h4>${escapeHtml(title)}</h4>${body}</section>`;
}

function editableValue(value) {
  if (Array.isArray(value)) return value.join('\n');
  return String(value || '');
}

function editableBlock(title, field, value, isArray = true) {
  return block(
    title,
    `<textarea class="edit-field" data-field="${escapeHtml(field)}" data-array="${isArray ? 'yes' : 'no'}" spellcheck="false">${escapeHtml(editableValue(value))}</textarea>`
  );
}

function contentRefs(items) {
  if (!Array.isArray(items) || items.length === 0) return '<span class="muted">无 stage content 引用</span>';
  return `<div class="refs">${items.map(item => `
    <div class="ref">
      <div><b>${escapeHtml(item.name || item.id)}</b> ${pill(item.type || 'unknown')}</div>
      <code>${escapeHtml(item.id)}</code>
      ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
    </div>
  `).join('')}</div>`;
}

function diffSection(label, current, proposed, editable = false) {
  return `<div class="diff">
    <div>${block(`${label} · 当前`, Array.isArray(current) ? textList(current) : `<p>${escapeHtml(current || '空')}</p>`)}</div>
    <div>${editable ? editableBlock(`${label} · 提案`, label, proposed, Array.isArray(proposed)) : block(`${label} · 提案`, Array.isArray(proposed) ? textList(proposed) : `<p>${escapeHtml(proposed || '空')}</p>`)}</div>
  </div>`;
}

const data = JSON.parse(await readFile(input, 'utf8'));
const proposals = data.proposals || [];
const stats = data.stats || {};
const failures = data.failures || [];

const cards = proposals.map((p, index) => {
  const reviewReasons = [];
  if (p.needsReview) reviewReasons.push('需复核');
  if (p.confidence?.deepseek === 'low' || !p.confidence?.deepseek) reviewReasons.push('DeepSeek低/缺失');
  if (p.confidence?.minimax === 'low' || !p.confidence?.minimax) reviewReasons.push('MiniMax低/缺失');
  const search = [
    p.name, p.gender, ...(p.books || []), ...(p.reasons || []),
    ...(p.current?.personality || []), ...(p.proposed?.personality || []),
    ...(p.proposed?.weapons || []), ...(p.proposed?.techniques || []), ...(p.proposed?.items || [])
  ].join(' ').toLowerCase();

  const patchJson = JSON.stringify({
    name: p.name,
    staticProfilePatch: {
      personality: p.proposed?.personality || [],
      speechStyle: p.proposed?.speechStyle || '',
      principles: p.proposed?.principles || [],
      goals: p.proposed?.goals || [],
      weaknesses: p.proposed?.weaknesses || [],
      signatureAbilities: p.proposed?.signatureAbilities || [],
    },
    loadoutCandidates: {
      weapons: p.proposed?.weapons || [],
      techniques: p.proposed?.techniques || [],
      items: p.proposed?.items || [],
    },
    confidence: p.confidence,
    needsReview: p.needsReview,
  }, null, 2);

  return `<article class="card" data-name="${escapeHtml(p.name)}" data-review="${p.needsReview ? 'yes' : 'no'}" data-search="${escapeHtml(search)}">
    <header>
      <div>
        <div class="title-row">
          <h3>${index + 1}. ${escapeHtml(p.name)}</h3>
          <label class="review-check"><input type="checkbox" class="reviewed-toggle"> 已审核</label>
        </div>
        <div class="meta">
          ${pill(p.gender || '未知性别')}
          ${(p.books || []).map(book => pill(book)).join('')}
          ${(p.reasons || []).map(reason => pill(reason, 'reason')).join('')}
          ${p.needsReview ? pill('需人工复核', 'bad') : pill('相对可采纳', 'ok')}
        </div>
      </div>
      <div class="conf">${confidencePills(p.confidence)}</div>
    </header>

    ${reviewReasons.length ? `<div class="warn">${reviewReasons.map(escapeHtml).join(' / ')}</div>` : ''}

    <details open>
      <summary>人格字段对比</summary>
      ${diffSection('personality', p.current?.personality || [], p.proposed?.personality || [], true)}
      ${diffSection('speechStyle', p.current?.speechStyle || '', p.proposed?.speechStyle || '', true)}
      ${diffSection('principles', p.current?.principles || [], p.proposed?.principles || [], true)}
      ${diffSection('goals', p.current?.goals || [], p.proposed?.goals || [], true)}
      ${diffSection('weaknesses', p.current?.weaknesses || [], p.proposed?.weaknesses || [], true)}
    </details>

    <details>
      <summary>武器 / 功法 / 道具候选</summary>
      ${diffSection('signatureAbilities', p.current?.signatureAbilities || [], p.proposed?.signatureAbilities || [], true)}
      <div class="triple">
        ${editableBlock('weapons', 'weapons', p.proposed?.weapons || [])}
        ${editableBlock('techniques', 'techniques', p.proposed?.techniques || [])}
        ${editableBlock('items', 'items', p.proposed?.items || [])}
      </div>
    </details>

    <details>
      <summary>已有 stage content 引用</summary>
      ${contentRefs(p.stageContent || [])}
    </details>

    <details>
      <summary>JSON 补丁视图</summary>
      <pre class="patch-json">${escapeHtml(patchJson)}</pre>
    </details>
  </article>`;
}).join('\n');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>六朝角色补全审核</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f7f4;
      --panel: #ffffff;
      --ink: #202124;
      --muted: #70757a;
      --line: #d8d6cf;
      --ok: #216e39;
      --mid: #8a5a00;
      --bad: #b3261e;
      --soft-bad: #fce8e6;
      --soft-ok: #e6f4ea;
      --soft-mid: #fff4d6;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      font-size: 14px;
      line-height: 1.55;
    }
    .top {
      position: sticky;
      top: 0;
      z-index: 10;
      border-bottom: 1px solid var(--line);
      background: rgba(247,247,244,.96);
      backdrop-filter: blur(10px);
    }
    .wrap { max-width: 1280px; margin: 0 auto; padding: 18px 20px; }
    h1 { margin: 0 0 8px; font-size: 22px; }
    .stats { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 14px; }
    .controls { display: grid; grid-template-columns: minmax(220px, 1fr) auto auto auto auto auto; gap: 8px; align-items: center; }
    input, select, button, textarea {
      height: 36px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: white;
      color: var(--ink);
      padding: 0 10px;
      font: inherit;
    }
    button { cursor: pointer; }
    main.wrap { padding-top: 14px; }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      margin: 12px 0;
      padding: 14px;
      box-shadow: 0 1px 2px rgba(0,0,0,.04);
    }
    .card header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
    h3 { margin: 0; font-size: 18px; }
    .title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin: 0 0 8px; }
    .review-check {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 28px;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 2px 10px;
      background: #fafafa;
      color: var(--muted);
      font-size: 13px;
      user-select: none;
      cursor: pointer;
    }
    .review-check input { width: 16px; height: 16px; margin: 0; padding: 0; }
    .card.reviewed { border-color: #9bd3aa; box-shadow: 0 0 0 2px rgba(33, 110, 57, .08); }
    .card.reviewed .review-check { background: var(--soft-ok); border-color: #b7dfc2; color: var(--ok); }
    .meta, .conf { display: flex; flex-wrap: wrap; gap: 6px; }
    .pill {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 2px 8px;
      background: #fafafa;
      color: #3c4043;
      font-size: 12px;
    }
    .pill.ok { background: var(--soft-ok); color: var(--ok); border-color: #b7dfc2; }
    .pill.mid { background: var(--soft-mid); color: var(--mid); border-color: #efd28a; }
    .pill.bad { background: var(--soft-bad); color: var(--bad); border-color: #f3b3ad; }
    .pill.reason { background: #eef2ff; border-color: #cdd7ff; }
    .warn {
      margin: 10px 0;
      padding: 8px 10px;
      border-left: 3px solid var(--bad);
      background: var(--soft-bad);
      color: var(--bad);
      border-radius: 4px;
    }
    details { border-top: 1px solid var(--line); padding-top: 10px; margin-top: 10px; }
    summary { cursor: pointer; font-weight: 650; }
    .diff { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 10px 0; }
    .triple { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px; }
    .block {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px;
      background: #fcfcfb;
      min-width: 0;
    }
    .block h4 { margin: 0 0 6px; font-size: 13px; color: var(--muted); }
    textarea.edit-field {
      width: 100%;
      min-height: 96px;
      height: auto;
      resize: vertical;
      padding: 8px 10px;
      line-height: 1.5;
      background: #fff;
    }
    textarea[data-array="no"] { min-height: 72px; }
    ul { margin: 0; padding-left: 20px; }
    p { margin: 0; }
    .muted { color: var(--muted); }
    .refs { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 8px; margin-top: 10px; }
    .ref { border: 1px solid var(--line); border-radius: 6px; padding: 8px; background: #fcfcfb; }
    code, pre {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
    }
    pre {
      overflow: auto;
      background: #1f2328;
      color: #e6edf3;
      border-radius: 6px;
      padding: 12px;
      white-space: pre-wrap;
    }
    .hidden { display: none; }
    @media (max-width: 820px) {
      .controls { grid-template-columns: 1fr 1fr; }
      .diff, .triple { grid-template-columns: 1fr; }
      .card header { flex-direction: column; }
    }
  </style>
</head>
<body>
  <div class="top">
    <div class="wrap">
      <h1>六朝角色补全审核</h1>
      <div class="stats">
        ${pill(`目标 ${stats.targets ?? proposals.length}`)}
        ${pill(`提案 ${stats.proposals ?? proposals.length}`)}
        ${pill(`需复核 ${stats.needsReview ?? 0}`, 'bad')}
        ${pill(`相对可采纳 ${stats.readyish ?? 0}`, 'ok')}
        <span id="reviewedCount" class="pill ok">已审核 0</span>
        ${pill(`失败/缺失 ${stats.failures ?? failures.length}`, failures.length ? 'bad' : 'ok')}
        ${stats.extraModelNames?.length ? pill(`额外别名 ${stats.extraModelNames.join(', ')}`, 'mid') : ''}
      </div>
      <div class="controls">
        <input id="q" type="search" placeholder="搜索角色 / 书名 / 武器 / 功法 / 人格关键词">
        <select id="filter">
          <option value="all">全部</option>
          <option value="review">只看需复核</option>
          <option value="ready">只看相对可采纳</option>
          <option value="done">只看已审核</option>
          <option value="todo">只看未审核</option>
        </select>
        <button id="openAll">展开全部</button>
        <button id="closeAll">折叠全部</button>
        <button id="exportReviewed">导出已审核</button>
        <button id="exportAll">导出全部</button>
      </div>
    </div>
  </div>
  <main class="wrap">
    ${failures.length ? `<section class="card"><h3>失败/缺失</h3>${textList(failures.map(f => `${f.name}: ${f.type}${f.error ? ` (${f.error})` : ''}`))}</section>` : ''}
    <div id="cards">${cards}</div>
  </main>
  <script>
    const STORAGE_KEY = 'xiantu.characterEnrichmentReview.v1';
    const q = document.getElementById('q');
    const filter = document.getElementById('filter');
    const cards = [...document.querySelectorAll('.card[data-name]')];
    const reviewedCount = document.getElementById('reviewedCount');

    function parseField(textarea) {
      const text = textarea.value.trim();
      if (textarea.dataset.array === 'yes') {
        return text ? text.split(/\\n+/).map(item => item.trim()).filter(Boolean) : [];
      }
      return text;
    }

    function collectCard(card) {
      const fields = {};
      card.querySelectorAll('.edit-field').forEach(textarea => {
        fields[textarea.dataset.field] = parseField(textarea);
      });
      return {
        name: card.dataset.name,
        reviewed: card.querySelector('.reviewed-toggle').checked,
        staticProfilePatch: {
          personality: fields.personality || [],
          speechStyle: fields.speechStyle || '',
          principles: fields.principles || [],
          goals: fields.goals || [],
          weaknesses: fields.weaknesses || [],
          signatureAbilities: fields.signatureAbilities || [],
        },
        loadoutCandidates: {
          weapons: fields.weapons || [],
          techniques: fields.techniques || [],
          items: fields.items || [],
        }
      };
    }

    function updatePatch(card) {
      const patch = collectCard(card);
      const pre = card.querySelector('.patch-json');
      if (pre) pre.textContent = JSON.stringify(patch, null, 2);
    }

    function readState() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
      catch { return {}; }
    }

    function writeState() {
      const state = {};
      for (const card of cards) {
        state[card.dataset.name] = collectCard(card);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      updateReviewedCount();
    }

    function loadState() {
      const state = readState();
      for (const card of cards) {
        const saved = state[card.dataset.name];
        if (saved) {
          card.querySelector('.reviewed-toggle').checked = !!saved.reviewed;
          const patches = { ...(saved.staticProfilePatch || {}), ...(saved.loadoutCandidates || {}) };
          card.querySelectorAll('.edit-field').forEach(textarea => {
            if (Object.prototype.hasOwnProperty.call(patches, textarea.dataset.field)) {
              const value = patches[textarea.dataset.field];
              textarea.value = Array.isArray(value) ? value.join('\\n') : String(value || '');
            }
          });
        }
        updatePatch(card);
        syncReviewedClass(card);
      }
      updateReviewedCount();
    }

    function syncReviewedClass(card) {
      card.classList.toggle('reviewed', card.querySelector('.reviewed-toggle').checked);
    }

    function updateReviewedCount() {
      const count = cards.filter(card => card.querySelector('.reviewed-toggle').checked).length;
      reviewedCount.textContent = '已审核 ' + count + '/' + cards.length;
    }

    let saveTimer = null;
    function scheduleSave(card) {
      updatePatch(card);
      clearTimeout(saveTimer);
      saveTimer = setTimeout(writeState, 200);
    }

    function downloadJson(filename, data) {
      const blob = new Blob([JSON.stringify(data, null, 2) + '\\n'], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }

    function exportCards(onlyReviewed) {
      writeState();
      const items = cards
        .map(collectCard)
        .filter(item => !onlyReviewed || item.reviewed);
      downloadJson(onlyReviewed ? 'character-enrichment-reviewed.json' : 'character-enrichment-all-edits.json', {
        exportedAt: new Date().toISOString(),
        count: items.length,
        characters: items
      });
    }

    function applyFilter() {
      const needle = q.value.trim().toLowerCase();
      const mode = filter.value;
      let shown = 0;
      for (const card of cards) {
        const byText = !needle || card.dataset.search.includes(needle);
        const checked = card.querySelector('.reviewed-toggle').checked;
        const byMode = mode === 'all'
          || (mode === 'review' && card.dataset.review === 'yes')
          || (mode === 'ready' && card.dataset.review === 'no')
          || (mode === 'done' && checked)
          || (mode === 'todo' && !checked);
        const ok = byText && byMode;
        card.classList.toggle('hidden', !ok);
        if (ok) shown += 1;
      }
      document.title = '六朝角色补全审核 (' + shown + '/' + cards.length + ')';
    }
    q.addEventListener('input', applyFilter);
    filter.addEventListener('change', applyFilter);
    document.getElementById('openAll').addEventListener('click', () => document.querySelectorAll('details').forEach(d => d.open = true));
    document.getElementById('closeAll').addEventListener('click', () => document.querySelectorAll('details').forEach(d => d.open = false));
    document.getElementById('exportReviewed').addEventListener('click', () => exportCards(true));
    document.getElementById('exportAll').addEventListener('click', () => exportCards(false));
    cards.forEach(card => {
      card.querySelectorAll('.edit-field').forEach(textarea => textarea.addEventListener('input', () => scheduleSave(card)));
      card.querySelector('.reviewed-toggle').addEventListener('change', () => {
        syncReviewedClass(card);
        scheduleSave(card);
        applyFilter();
      });
    });
    loadState();
    applyFilter();
  </script>
</body>
</html>
`;

await writeFile(output, html);
console.log(output);
