#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const auditDir = join(root, 'mod-kit/generated/deepseek-v4-flash/character-canon/minimax-v3-audit');
const batches = [
  ['needs-second-review', 'needs-second-review.minimax.raw.json'],
  ['stage-identity-varies', 'stage-identity-varies.minimax.repaired.json'],
  ['female-relationship-phase-needed', 'female-relationship-phase-needed.minimax.repaired.json'],
];

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function arr(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function brief(value) {
  if (!value) return '';
  if (Array.isArray(value)) return value.join('；');
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length))
      .map(([key, v]) => `${key}: ${brief(v)}`)
      .join('；');
  }
  return String(value);
}

await mkdir(auditDir, { recursive: true });

const reports = [];
for (const [batch, file] of batches) {
  const report = JSON.parse(await readFile(join(auditDir, file), 'utf8'));
  reports.push({ batch, ...report });
}

const combined = {
  generatedAt: new Date().toISOString(),
  source: 'MiniMax-M2.7',
  batches: reports.map(report => ({
    batch: report.batch,
    itemCount: report.items?.length || 0,
    globalFindings: report.globalFindings || [],
  })),
  items: reports.flatMap(report => arr(report.items).map(item => ({ batch: report.batch, ...item }))),
};

const verdictOrder = { human_review: 0, fix: 1, ok: 2 };
combined.items.sort((a, b) =>
  (verdictOrder[a.verdict] ?? 9) - (verdictOrder[b.verdict] ?? 9)
  || String(a.batch).localeCompare(String(b.batch))
  || String(a.canonicalName).localeCompare(String(b.canonicalName), 'zh-Hans-CN'),
);

const counts = combined.items.reduce((acc, item) => {
  acc[item.verdict] = (acc[item.verdict] || 0) + 1;
  return acc;
}, {});

const md = [
  '# MiniMax v3 人物卡二审汇总',
  '',
  `- 模型: MiniMax-M2.7`,
  `- 总条目: ${combined.items.length}`,
  `- human_review: ${counts.human_review || 0}`,
  `- fix: ${counts.fix || 0}`,
  `- ok: ${counts.ok || 0}`,
  '',
  '## 批次',
  '',
  ...combined.batches.flatMap(batch => [
    `### ${batch.batch}`,
    '',
    ...arr(batch.globalFindings).map(finding => `- ${finding}`),
    '',
  ]),
  '## 逐条结论',
  '',
  ...combined.items.flatMap(item => [
    `### ${item.canonicalName} (${item.batch})`,
    '',
    `- verdict: ${item.verdict}`,
    `- flagsConfirmed: ${arr(item.flagsConfirmed).join(', ') || '-'}`,
    `- flagsToRemove: ${arr(item.flagsToRemove).join(', ') || '-'}`,
    `- missingPhaseRules: ${brief(item.missingPhaseRules) || '-'}`,
    `- suspectedLeaks: ${brief(item.suspectedLeaks) || '-'}`,
    `- suggestedCanonicalPatch: ${brief(item.suggestedCanonicalPatch) || '-'}`,
    `- reason: ${item.reason || '-'}`,
    '',
  ]),
].join('\n');

const htmlRows = combined.items.map((item, index) => {
  const patch = brief(item.suggestedCanonicalPatch);
  return `
    <article class="card" data-verdict="${esc(item.verdict)}" data-batch="${esc(item.batch)}" data-name="${esc(item.canonicalName)}">
      <header>
        <div>
          <h2>${esc(item.canonicalName)}</h2>
          <p>${esc(item.batch)}</p>
        </div>
        <span class="badge ${esc(item.verdict)}">${esc(item.verdict)}</span>
      </header>
      <dl>
        <dt>确认标记</dt><dd>${esc(arr(item.flagsConfirmed).join(' / ') || '-')}</dd>
        <dt>建议移除</dt><dd>${esc(arr(item.flagsToRemove).join(' / ') || '-')}</dd>
        <dt>缺失阶段规则</dt><dd>${esc(brief(item.missingPhaseRules) || '-')}</dd>
        <dt>疑似越界/泄漏</dt><dd>${esc(brief(item.suspectedLeaks) || '-')}</dd>
        <dt>建议补丁</dt><dd>${esc(patch || '-')}</dd>
        <dt>理由</dt><dd>${esc(item.reason || '-')}</dd>
      </dl>
      <div class="actions" data-index="${index}">
        <button data-action="approve">批准</button>
        <button data-action="fix">待修</button>
        <button data-action="reject">驳回</button>
      </div>
      <textarea placeholder="人工备注"></textarea>
    </article>`;
}).join('\n');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>MiniMax v3 人物卡二审</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #202124; background: #f6f7f9; }
    body { margin: 0; }
    .top { position: sticky; top: 0; z-index: 2; background: #fff; border-bottom: 1px solid #dfe3ea; padding: 16px 24px; display: grid; gap: 12px; }
    h1 { margin: 0; font-size: 22px; letter-spacing: 0; }
    .summary { display: flex; gap: 10px; flex-wrap: wrap; color: #4b5563; font-size: 14px; }
    .toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    input, select, textarea, button { font: inherit; }
    input, select { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; background: #fff; }
    button { border: 1px solid #9aa4b2; border-radius: 6px; background: #fff; padding: 8px 10px; cursor: pointer; }
    button:hover { background: #eef2f7; }
    main { max-width: 1180px; margin: 0 auto; padding: 20px 24px 44px; display: grid; gap: 14px; }
    .card { background: #fff; border: 1px solid #dfe3ea; border-radius: 8px; padding: 16px; display: grid; gap: 12px; }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: start; }
    h2 { margin: 0; font-size: 18px; letter-spacing: 0; }
    header p { margin: 4px 0 0; color: #697386; font-size: 13px; }
    .badge { border-radius: 999px; padding: 4px 9px; font-size: 12px; border: 1px solid #cbd5e1; }
    .human_review { background: #fff4d6; color: #794d00; border-color: #f1c35b; }
    .fix { background: #ffe5e5; color: #8f1d1d; border-color: #f2a0a0; }
    .ok { background: #e5f5ec; color: #126b3a; border-color: #94d3ad; }
    dl { display: grid; grid-template-columns: 130px 1fr; gap: 8px 14px; margin: 0; line-height: 1.55; }
    dt { color: #5b6575; }
    dd { margin: 0; white-space: pre-wrap; }
    .actions { display: flex; gap: 8px; }
    textarea { min-height: 68px; resize: vertical; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; }
    .selected-approve { outline: 2px solid #2f9e5c; }
    .selected-fix { outline: 2px solid #d9534f; }
    .selected-reject { outline: 2px solid #555; }
  </style>
</head>
<body>
  <section class="top">
    <h1>MiniMax v3 人物卡二审</h1>
    <div class="summary">
      <span>总条目 ${combined.items.length}</span>
      <span>human_review ${counts.human_review || 0}</span>
      <span>fix ${counts.fix || 0}</span>
      <span>ok ${counts.ok || 0}</span>
    </div>
    <div class="toolbar">
      <input id="search" placeholder="搜索角色/理由/补丁">
      <select id="verdict">
        <option value="">全部结论</option>
        <option value="human_review">human_review</option>
        <option value="fix">fix</option>
        <option value="ok">ok</option>
      </select>
      <select id="batch">
        <option value="">全部批次</option>
        ${batches.map(([name]) => `<option value="${esc(name)}">${esc(name)}</option>`).join('')}
      </select>
      <button id="export">导出审批 JSON</button>
    </div>
  </section>
  <main>${htmlRows}</main>
  <script>
    const sourceItems = ${JSON.stringify(combined.items)};
    const key = 'xiantu-minimax-v3-audit-review';
    const state = JSON.parse(localStorage.getItem(key) || '{}');
    const cards = [...document.querySelectorAll('.card')];
    function save() { localStorage.setItem(key, JSON.stringify(state)); }
    function paint(card, name) {
      card.classList.remove('selected-approve', 'selected-fix', 'selected-reject');
      const entry = state[name] || {};
      if (entry.action) card.classList.add('selected-' + entry.action);
      card.querySelector('textarea').value = entry.note || '';
    }
    cards.forEach(card => {
      const name = card.dataset.name;
      paint(card, name);
      card.querySelectorAll('button[data-action]').forEach(button => {
        button.addEventListener('click', () => {
          state[name] = { ...(state[name] || {}), action: button.dataset.action };
          paint(card, name);
          save();
        });
      });
      card.querySelector('textarea').addEventListener('input', event => {
        state[name] = { ...(state[name] || {}), note: event.target.value };
        save();
      });
    });
    function filter() {
      const q = document.querySelector('#search').value.trim().toLowerCase();
      const verdict = document.querySelector('#verdict').value;
      const batch = document.querySelector('#batch').value;
      cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        card.hidden = (q && !text.includes(q)) || (verdict && card.dataset.verdict !== verdict) || (batch && card.dataset.batch !== batch);
      });
    }
    document.querySelector('#search').addEventListener('input', filter);
    document.querySelector('#verdict').addEventListener('change', filter);
    document.querySelector('#batch').addEventListener('change', filter);
    document.querySelector('#export').addEventListener('click', () => {
      const payload = {
        exportedAt: new Date().toISOString(),
        decisions: sourceItems.map(item => ({ ...item, humanDecision: state[item.canonicalName] || null })),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'minimax-v3-audit-review-export.json';
      link.click();
      URL.revokeObjectURL(link.href);
    });
  </script>
</body>
</html>`;

await writeFile(join(auditDir, 'minimax-v3-audit-combined.json'), JSON.stringify(combined, null, 2));
await writeFile(join(auditDir, 'minimax-v3-audit-summary.md'), md);
await writeFile(join(auditDir, 'minimax-v3-audit-review.html'), html);

console.log(JSON.stringify({
  combined: join(auditDir, 'minimax-v3-audit-combined.json'),
  summary: join(auditDir, 'minimax-v3-audit-summary.md'),
  reviewHtml: join(auditDir, 'minimax-v3-audit-review.html'),
  counts,
}, null, 2));
