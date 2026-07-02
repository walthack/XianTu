#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const auditDir = join(root, 'mod-kit/generated/deepseek-v4-flash/character-canon/minimax-v3-audit');
const combinedPath = join(auditDir, 'minimax-v3-audit-combined.json');

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value) {
  if (!value) return '';
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join('；');
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length))
      .map(([key, v]) => `${key}: ${text(v)}`)
      .join('；');
  }
  return String(value);
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const combined = JSON.parse(await readFile(combinedPath, 'utf8'));
const items = combined.items.filter(item => item.verdict === 'human_review');

const md = [
  '# v3 人物卡：需要人工 Review 条目',
  '',
  `- 来源: MiniMax v3 audit`,
  `- 人工条目数: ${items.length}`,
  '',
  ...items.flatMap((item, index) => [
    `## ${index + 1}. ${item.canonicalName}`,
    '',
    `- 批次: ${item.batch}`,
    `- 需要你判断: ${item.reason || '-'}`,
    `- 缺失阶段规则: ${text(item.missingPhaseRules) || '-'}`,
    `- 疑似泄漏/越界: ${text(item.suspectedLeaks) || '-'}`,
    `- MiniMax 建议: ${text(item.suggestedCanonicalPatch) || '-'}`,
    '',
    '人工动作：批准 / 待修 / 驳回 / 备注',
    '',
  ]),
].join('\n');

const cards = items.map((item, index) => `
  <article class="card" data-name="${esc(item.canonicalName)}">
    <header>
      <span class="num">${index + 1}</span>
      <div>
        <h2>${esc(item.canonicalName)}</h2>
        <p>${esc(item.batch)}</p>
      </div>
    </header>
    <section>
      <h3>需要你判断</h3>
      <p>${esc(item.reason || '-')}</p>
    </section>
    <section>
      <h3>缺失阶段规则</h3>
      <p>${esc(text(item.missingPhaseRules) || '-')}</p>
    </section>
    <section>
      <h3>疑似泄漏/越界</h3>
      <p>${esc(text(item.suspectedLeaks) || '-')}</p>
    </section>
    <section>
      <h3>MiniMax 建议</h3>
      <p>${esc(text(item.suggestedCanonicalPatch) || '-')}</p>
    </section>
    <div class="actions">
      <button data-action="approve">批准</button>
      <button data-action="fix">待修</button>
      <button data-action="reject">驳回</button>
    </div>
    <textarea placeholder="你的备注：例如转折章节、正确身份、是否保留阶段化"></textarea>
  </article>`).join('\n');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>v3 人物卡人工 Review 队列</title>
  <style>
    :root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #202124; background: #f7f8fa; }
    body { margin: 0; }
    .top { position: sticky; top: 0; z-index: 2; background: #fff; border-bottom: 1px solid #d9dee7; padding: 16px 22px; display: grid; gap: 10px; }
    h1 { margin: 0; font-size: 22px; letter-spacing: 0; }
    .bar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    input, button, textarea { font: inherit; }
    input { min-width: 260px; border: 1px solid #c7d0dd; border-radius: 6px; padding: 8px 10px; }
    button { border: 1px solid #98a2b3; border-radius: 6px; background: #fff; padding: 8px 10px; cursor: pointer; }
    button:hover { background: #eef2f7; }
    main { max-width: 1060px; margin: 0 auto; padding: 20px 22px 44px; display: grid; gap: 14px; }
    .card { background: #fff; border: 1px solid #d9dee7; border-radius: 8px; padding: 16px; display: grid; gap: 12px; }
    header { display: flex; gap: 12px; align-items: start; }
    .num { width: 30px; height: 30px; border-radius: 50%; display: inline-grid; place-items: center; background: #243447; color: #fff; font-size: 14px; flex: 0 0 auto; }
    h2 { margin: 0; font-size: 19px; letter-spacing: 0; }
    header p { margin: 4px 0 0; color: #687385; font-size: 13px; }
    h3 { margin: 0 0 5px; font-size: 13px; color: #596579; letter-spacing: 0; }
    section p { margin: 0; line-height: 1.6; white-space: pre-wrap; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    textarea { min-height: 74px; border: 1px solid #c7d0dd; border-radius: 6px; padding: 8px 10px; resize: vertical; }
    .selected-approve { outline: 2px solid #238452; }
    .selected-fix { outline: 2px solid #c24135; }
    .selected-reject { outline: 2px solid #525866; }
  </style>
</head>
<body>
  <section class="top">
    <h1>v3 人物卡人工 Review 队列</h1>
    <div class="bar">
      <span>共 ${items.length} 条</span>
      <input id="search" placeholder="搜索角色/理由/建议">
      <button id="export">导出人工审批 JSON</button>
    </div>
  </section>
  <main>${cards}</main>
  <script>
    const items = ${JSON.stringify(items)};
    const key = 'xiantu-minimax-v3-human-review-only';
    const state = JSON.parse(localStorage.getItem(key) || '{}');
    const cards = [...document.querySelectorAll('.card')];
    function save() { localStorage.setItem(key, JSON.stringify(state)); }
    function paint(card) {
      const name = card.dataset.name;
      const entry = state[name] || {};
      card.classList.remove('selected-approve', 'selected-fix', 'selected-reject');
      if (entry.action) card.classList.add('selected-' + entry.action);
      card.querySelector('textarea').value = entry.note || '';
    }
    cards.forEach(card => {
      paint(card);
      card.querySelectorAll('button[data-action]').forEach(button => {
        button.addEventListener('click', () => {
          const name = card.dataset.name;
          state[name] = { ...(state[name] || {}), action: button.dataset.action };
          paint(card);
          save();
        });
      });
      card.querySelector('textarea').addEventListener('input', event => {
        const name = card.dataset.name;
        state[name] = { ...(state[name] || {}), note: event.target.value };
        save();
      });
    });
    document.querySelector('#search').addEventListener('input', event => {
      const q = event.target.value.trim().toLowerCase();
      cards.forEach(card => card.hidden = q && !card.textContent.toLowerCase().includes(q));
    });
    document.querySelector('#export').addEventListener('click', () => {
      const payload = {
        exportedAt: new Date().toISOString(),
        source: 'minimax-v3-human-review-only',
        decisions: items.map(item => ({ ...item, humanDecision: state[item.canonicalName] || null })),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'minimax-v3-human-review-only-export.json';
      link.click();
      URL.revokeObjectURL(link.href);
    });
  </script>
</body>
</html>`;

await writeFile(join(auditDir, 'minimax-v3-human-review-only.md'), md);
await writeFile(join(auditDir, 'minimax-v3-human-review-only.html'), html);
await writeFile(join(auditDir, 'minimax-v3-human-review-only.json'), JSON.stringify({ items }, null, 2));

console.log(JSON.stringify({
  count: items.length,
  md: join(auditDir, 'minimax-v3-human-review-only.md'),
  html: join(auditDir, 'minimax-v3-human-review-only.html'),
  json: join(auditDir, 'minimax-v3-human-review-only.json'),
  names: items.map(item => item.canonicalName),
}, null, 2));
