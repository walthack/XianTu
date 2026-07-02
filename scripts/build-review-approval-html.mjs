#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const canonDir = join(root, 'mod-kit/generated/deepseek-v4-flash/character-canon');

const roleLogPath = join(canonDir, '_logs/character-card-review.deepseek.jsonl');
const p1Path = join(canonDir, 'p1-deepseek-review.json');
const outPath = join(canonDir, '二审人工审批台.html');

function readJsonl(text) {
  return text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
}

function text(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

function issueTitle(issue) {
  return [
    issue.type ? `【${issue.type}】` : '',
    text(issue.card).slice(0, 80),
  ].filter(Boolean).join(' ');
}

const roles = readJsonl(await readFile(roleLogPath, 'utf8'));
const p1 = JSON.parse(await readFile(p1Path, 'utf8'));

const items = [];

for (const role of roles) {
  const issues = Array.isArray(role.result?.issues) && role.result.issues.length
    ? role.result.issues
    : [{ type: '无明确偏差', card: '未发现明确偏差', source: '', evidence: '', suggestion: '' }];
  issues.forEach((issue, index) => {
    items.push({
      id: `role:${role.name}:issue:${index}`,
      group: '角色逐条',
      subject: role.name,
      severity: role.result?.severity || '',
      title: issueTitle(issue),
      type: issue.type || '',
      card: issue.card || '',
      source: issue.source || '',
      evidence: issue.evidence || '',
      suggestion: issue.suggestion || '',
    });
  });
}

items.push({
  id: 'p1:queen',
  group: '太皇太后',
  subject: '太皇太后',
  severity: p1.ta皇太后?.confidence || '',
  title: `候选：${p1.ta皇太后?.candidate || ''}`,
  detail: p1.ta皇太后?.reason || '',
  evidence: (p1.ta皇太后?.evidence || []).join('；'),
  suggestion: p1.ta皇太后?.nextSteps || '',
});

for (const army of p1.armies || []) {
  items.push({
    id: `army:${army.name}`,
    group: '军队抽档',
    subject: army.name,
    severity: army.性质 || '',
    title: army.性质 || '军队抽档',
    detail: [
      army.总部驻地 ? `驻地：${army.总部驻地}` : '',
      Array.isArray(army.统帅核心) && army.统帅核心.length ? `统帅：${army.统帅核心.join('、')}` : '',
      army.编制层级 ? `编制：${army.编制层级}` : '',
      Array.isArray(army.兵种装备) && army.兵种装备.length ? `兵种装备：${army.兵种装备.join('、')}` : '',
      Array.isArray(army.战术特点) && army.战术特点.length ? `战术：${army.战术特点.join('、')}` : '',
      Array.isArray(army.旗下重要人物) && army.旗下重要人物.length ? `人物：${army.旗下重要人物.join('、')}` : '',
      army.与主角关系 ? `与主角关系：${army.与主角关系}` : '',
      Array.isArray(army.关键事件) && army.关键事件.length ? `关键事件：${army.关键事件.join('、')}` : '',
      army.存疑 ? `存疑：${army.存疑}` : '',
    ].filter(Boolean).join('\n'),
    evidence: (army.evidence || []).join('；'),
    suggestion: army.存疑 || '',
  });
}

for (const review of p1.additionReviews || []) {
  for (const [index, issue] of (review.issues || []).entries()) {
    items.push({
      id: `addition:${review.name}:issue:${index}`,
      group: '势力逐条',
      subject: review.name,
      severity: review.verdict || '',
      title: `${issue.field || '字段'}：${issue.type || ''}`,
      type: issue.type || '',
      card: issue.addition || '',
      source: issue.source || '',
      evidence: '',
      suggestion: issue.suggestion || '',
    });
  }
}

const html = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>仙途二审人工审批台</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fa;
      --panel: #ffffff;
      --text: #1e2329;
      --muted: #667085;
      --line: #d9dee7;
      --accent: #0f766e;
      --approve: #16794c;
      --reject: #b42318;
      --revise: #a15c07;
      --todo: #475467;
      --shadow: 0 1px 2px rgba(16, 24, 40, .06), 0 8px 24px rgba(16, 24, 40, .08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    header {
      position: sticky;
      top: 0;
      z-index: 5;
      background: rgba(247, 248, 250, .95);
      border-bottom: 1px solid var(--line);
      backdrop-filter: blur(10px);
    }
    .topbar {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
      align-items: center;
      max-width: 1440px;
      margin: 0 auto;
      padding: 14px 20px;
    }
    h1 {
      margin: 0;
      font-size: 20px;
      letter-spacing: 0;
    }
    .hint { color: var(--muted); font-size: 12px; margin-top: 2px; }
    .actions, .filters, .row-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    button, select, input, textarea {
      font: inherit;
    }
    button {
      border: 1px solid var(--line);
      background: #fff;
      color: var(--text);
      border-radius: 6px;
      padding: 7px 10px;
      cursor: pointer;
    }
    button:hover { border-color: #98a2b3; }
    button.active { color: #fff; border-color: transparent; }
    button[data-action="approve"].active { background: var(--approve); }
    button[data-action="reject"].active { background: var(--reject); }
    button[data-action="revise"].active { background: var(--revise); }
    button[data-action="todo"].active { background: var(--todo); }
    .danger { color: var(--reject); }
    main {
      max-width: 1440px;
      margin: 0 auto;
      padding: 16px 20px 40px;
    }
    .toolbar {
      display: grid;
      grid-template-columns: minmax(240px, 1fr) auto;
      gap: 12px;
      align-items: center;
      margin-bottom: 14px;
    }
    input[type="search"], select {
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
      min-height: 36px;
      padding: 0 10px;
    }
    input[type="search"] { width: 100%; }
    .stats {
      display: grid;
      grid-template-columns: repeat(5, minmax(120px, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }
    .stat {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px 12px;
    }
    .stat b { display: block; font-size: 20px; }
    .stat span { color: var(--muted); font-size: 12px; }
    .list {
      display: grid;
      gap: 10px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
      overflow: hidden;
    }
    .card-head {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 10px;
      align-items: start;
      padding: 12px;
      border-bottom: 1px solid #eef1f5;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 2px 7px;
      border-radius: 6px;
      background: #eef6f5;
      color: #0f766e;
      font-size: 12px;
      white-space: nowrap;
    }
    .subject { font-weight: 700; margin-right: 8px; }
    .title { font-weight: 600; }
    .meta { color: var(--muted); font-size: 12px; margin-top: 3px; }
    .card-body {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 320px;
      gap: 12px;
      padding: 12px;
    }
    .detail-grid {
      display: grid;
      gap: 8px;
    }
    .field {
      border-left: 3px solid #d0d5dd;
      padding-left: 8px;
      white-space: pre-wrap;
    }
    .field b { display: block; margin-bottom: 2px; }
    .field span { color: #344054; }
    textarea {
      width: 100%;
      min-height: 92px;
      resize: vertical;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 8px;
    }
    .status-pill {
      min-width: 64px;
      text-align: center;
      border-radius: 999px;
      padding: 3px 8px;
      color: #fff;
      background: #98a2b3;
      font-size: 12px;
    }
    .status-approve { background: var(--approve); }
    .status-reject { background: var(--reject); }
    .status-revise { background: var(--revise); }
    .status-todo { background: var(--todo); }
    .empty {
      padding: 40px;
      text-align: center;
      color: var(--muted);
      background: #fff;
      border: 1px dashed var(--line);
      border-radius: 8px;
    }
    @media (max-width: 900px) {
      .topbar, .toolbar, .card-body { grid-template-columns: 1fr; }
      .stats { grid-template-columns: repeat(2, 1fr); }
      .card-head { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <div class="topbar">
      <div>
        <h1>仙途二审人工审批台</h1>
        <div class="hint">按钮状态自动保存在本机浏览器 localStorage；导出 JSON 后可交给 agent 落档。</div>
      </div>
      <div class="actions">
        <button id="exportJson">导出 JSON</button>
        <button id="exportMd">导出 Markdown</button>
        <button id="importBtn">导入 JSON</button>
        <button id="resetBtn" class="danger">清空审批</button>
        <input id="importFile" type="file" accept="application/json" hidden>
      </div>
    </div>
  </header>
  <main>
    <section class="stats" id="stats"></section>
    <section class="toolbar">
      <input id="search" type="search" placeholder="搜索角色、势力、字段、证据、建议">
      <div class="filters">
        <select id="groupFilter"><option value="">全部分组</option></select>
        <select id="statusFilter">
          <option value="">全部状态</option>
          <option value="unreviewed">未处理</option>
          <option value="approve">批准</option>
          <option value="reject">驳回</option>
          <option value="revise">需改写</option>
          <option value="todo">待查</option>
        </select>
        <select id="severityFilter"><option value="">全部级别</option></select>
      </div>
    </section>
    <section class="list" id="list"></section>
  </main>
  <script>
    const ITEMS = ${JSON.stringify(items)};
    const STORE_KEY = 'xiantu-review-approval-v1';
    const labels = { approve: '批准', reject: '驳回', revise: '需改写', todo: '待查', unreviewed: '未处理' };
    const state = loadState();

    const list = document.querySelector('#list');
    const stats = document.querySelector('#stats');
    const search = document.querySelector('#search');
    const groupFilter = document.querySelector('#groupFilter');
    const statusFilter = document.querySelector('#statusFilter');
    const severityFilter = document.querySelector('#severityFilter');

    initFilters();
    bindEvents();
    render();

    function loadState() {
      try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); }
      catch { return {}; }
    }
    function saveState() {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
      renderStats();
    }
    function entry(id) {
      if (!state[id]) state[id] = { status: '', note: '' };
      return state[id];
    }
    function initFilters() {
      for (const group of [...new Set(ITEMS.map(item => item.group))].sort()) {
        groupFilter.append(new Option(group, group));
      }
      for (const severity of [...new Set(ITEMS.map(item => item.severity).filter(Boolean))].sort()) {
        severityFilter.append(new Option(severity, severity));
      }
    }
    function bindEvents() {
      search.addEventListener('input', render);
      groupFilter.addEventListener('change', render);
      statusFilter.addEventListener('change', render);
      severityFilter.addEventListener('change', render);
      document.querySelector('#exportJson').addEventListener('click', exportJson);
      document.querySelector('#exportMd').addEventListener('click', exportMarkdown);
      document.querySelector('#importBtn').addEventListener('click', () => document.querySelector('#importFile').click());
      document.querySelector('#importFile').addEventListener('change', importJson);
      document.querySelector('#resetBtn').addEventListener('click', () => {
        if (!confirm('确认清空本机保存的审批状态？')) return;
        for (const key of Object.keys(state)) delete state[key];
        saveState();
        render();
      });
    }
    function render() {
      renderStats();
      const query = search.value.trim().toLowerCase();
      const group = groupFilter.value;
      const status = statusFilter.value;
      const severity = severityFilter.value;
      const filtered = ITEMS.filter(item => {
        const st = entry(item.id).status || 'unreviewed';
        const haystack = Object.values(item).join(' ').toLowerCase();
        return (!query || haystack.includes(query))
          && (!group || item.group === group)
          && (!status || st === status)
          && (!severity || item.severity === severity);
      });
      list.innerHTML = '';
      if (!filtered.length) {
        list.innerHTML = '<div class="empty">没有匹配项</div>';
        return;
      }
      for (const item of filtered) list.append(renderCard(item));
    }
    function renderStats() {
      const counts = { total: ITEMS.length, approve: 0, reject: 0, revise: 0, todo: 0, unreviewed: 0 };
      for (const item of ITEMS) counts[entry(item.id).status || 'unreviewed'] += 1;
      stats.innerHTML = [
        stat('总条目', counts.total),
        stat('批准', counts.approve),
        stat('驳回', counts.reject),
        stat('需改写', counts.revise),
        stat('待查/未处理', counts.todo + counts.unreviewed),
      ].join('');
    }
    function stat(label, value) {
      return '<div class="stat"><b>' + value + '</b><span>' + label + '</span></div>';
    }
    function renderCard(item) {
      const current = entry(item.id);
      const card = document.createElement('article');
      card.className = 'card';
      const statusText = labels[current.status || 'unreviewed'];
      card.innerHTML = [
        '<div class="card-head">',
        '<span class="badge">' + escapeHtml(item.group) + '</span>',
        '<div>',
        '<div><span class="subject">' + escapeHtml(item.subject) + '</span><span class="title">' + escapeHtml(item.title || '') + '</span></div>',
        '<div class="meta">' + escapeHtml(item.severity || '') + (item.type ? ' · ' + escapeHtml(item.type) : '') + '</div>',
        '</div>',
        '<span class="status-pill status-' + (current.status || 'unreviewed') + '">' + statusText + '</span>',
        '</div>',
        '<div class="card-body">',
        '<div class="detail-grid">',
        field('卡/原写法', item.card),
        field('原文核验/详情', item.source || item.detail),
        field('证据', item.evidence),
        field('建议', item.suggestion),
        '</div>',
        '<div>',
        '<div class="row-actions">',
        actionButton('approve', '批准', current.status),
        actionButton('reject', '驳回', current.status),
        actionButton('revise', '需改写', current.status),
        actionButton('todo', '待查', current.status),
        '<button data-action="clear">清除</button>',
        '</div>',
        '<p class="meta">备注/改法</p>',
        '<textarea data-note="' + escapeAttr(item.id) + '" placeholder="写你的裁定、替换文本、保留理由或待查线索">' + escapeHtml(current.note || '') + '</textarea>',
        '</div>',
        '</div>',
      ].join('');
      card.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
          const action = btn.dataset.action;
          current.status = action === 'clear' ? '' : action;
          saveState();
          render();
        });
      });
      card.querySelector('textarea').addEventListener('input', event => {
        current.note = event.target.value;
        saveState();
      });
      return card;
    }
    function field(label, value) {
      if (!String(value || '').trim()) return '';
      return '<div class="field"><b>' + label + '</b><span>' + escapeHtml(value) + '</span></div>';
    }
    function actionButton(action, label, current) {
      return '<button data-action="' + action + '" class="' + (current === action ? 'active' : '') + '">' + label + '</button>';
    }
    function collect() {
      return {
        exportedAt: new Date().toISOString(),
        source: '二审人工审批台.html',
        decisions: ITEMS.map(item => ({
          id: item.id,
          group: item.group,
          subject: item.subject,
          title: item.title,
          severity: item.severity,
          status: entry(item.id).status || 'unreviewed',
          statusLabel: labels[entry(item.id).status || 'unreviewed'],
          note: entry(item.id).note || '',
        })),
      };
    }
    function exportJson() {
      download('xiantu-review-decisions.json', JSON.stringify(collect(), null, 2), 'application/json');
    }
    function exportMarkdown() {
      const data = collect();
      const lines = ['# 二审人工审批导出', '', '> 导出时间：' + data.exportedAt, ''];
      for (const d of data.decisions) {
        if (d.status === 'unreviewed' && !d.note) continue;
        lines.push('## ' + d.group + ' / ' + d.subject, '');
        lines.push('- 条目：' + (d.title || ''));
        lines.push('- 结论：' + d.statusLabel);
        if (d.note) lines.push('- 备注/改法：' + d.note);
        lines.push('');
      }
      download('xiantu-review-decisions.md', lines.join('\n'), 'text/markdown');
    }
    async function importJson(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      const data = JSON.parse(await file.text());
      for (const d of data.decisions || []) {
        state[d.id] = { status: d.status === 'unreviewed' ? '' : d.status, note: d.note || '' };
      }
      saveState();
      render();
      event.target.value = '';
    }
    function download(filename, content, type) {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }
    function escapeAttr(value) {
      return escapeHtml(value).replace(/"/g, '&quot;');
    }
  </script>
</body>
</html>
`;

await writeFile(outPath, html);
console.log(outPath);
