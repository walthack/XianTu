#!/usr/bin/env node

// 唯一道具组候选（身份账补充设计稿 2026-10-26 §2.2）：列出 entity-catalog/items.json 里同名不同 id 的物品，供内容组人工判定哪些算同一件。
// 同名不一定是同一件东西（背包与素背包、手雷这类消耗品），所以只列候选，不改任何文件；
// 确认后由内容组手填 mod-kit/player-ledger-rules.json 的 itemGroups。输出到标准输出（markdown）。

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const readJson = rel => JSON.parse(readFileSync(resolve(root, rel), 'utf8'));

const items = readJson('mod-kit/entity-catalog/items.json').entries.map(e => e.definition || e);
const groups = readJson('mod-kit/player-ledger-rules.json').itemGroups || [];
const trades = readJson('mod-kit/numbers-progress.json').story?.trades || [];
const groupOf = new Map(groups.flatMap(g => g.itemIds.map(id => [id, g.id])));
const tradeGrants = new Set(trades.map(t => t.grantItemId).filter(Boolean));

const byName = new Map();
for (const item of items) byName.set(item.name, [...(byName.get(item.name) || []), item]);
const candidates = [...byName.entries()].filter(([, list]) => new Set(list.map(i => i.id)).size > 1).sort(([a], [b]) => a.localeCompare(b, 'zh'));

const cell = text => String(text ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, 60);
const lines = [
  '# 唯一道具组候选（只读）',
  '',
  `> items.json 共 ${items.length} 件，同名不同 id ${candidates.length} 组。同名不一定是同一件，逐组人工确认后再填 itemGroups；「已入组」列为当前规则表里的组，「story.trades」列标出直写背包的物品（不得入组）。`,
  '',
];
for (const [name, list] of candidates) {
  lines.push(`## ${name}（${list.length}）`, '', '| id | 类型 | 品级 | 描述 | 已入组 | story.trades |', '|---|---|---|---|---|---|');
  for (const item of list) {
    lines.push(`| \`${item.id}\` | ${cell(item.type)} | ${cell(item.grade)} | ${cell(item.description)} | ${groupOf.get(item.id) || '—'} | ${tradeGrants.has(item.id) ? 'grantItemId' : '—'} |`);
  }
  lines.push('');
}
process.stdout.write(`${lines.join('\n')}\n`);
