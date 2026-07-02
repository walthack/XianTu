#!/usr/bin/env node

// 给 if 线分支盖 consequence 后果级别(确定性,从 branchType/reconverge/kind/deleted 推)+ 警告文案。
// UI(Session A)按 consequence 渲染分级警告。Usage: node scripts/stamp-if-consequence.mjs

import { readFileSync, existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const ccDir = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash', 'character-canon');

// 级别 → 警告文案(只警告级别,不剧透内容)
const WARN = {
  ending: '⚠ 此抉择可能导向结局',
  permanent: '⚠ 此抉择将使剧情永久改道，无法回头',
  high: '此抉择将明显改变后续剧情走向',
  low: '', // 低半径:不弹警告(或仅一个分支图标)
};

function level(b) {
  const mode = b.reconverge?.mode;
  if (mode === 'ending') return 'ending';
  if (mode === 'none' || b.branchType === 'permanent') return 'permanent';
  if ((b.deletedCanonNodes || []).length || b.kind === 'character_inner' || b.overturnMode === 'full_reverse') return 'high';
  return 'low';
}

async function run() {
  for (const book of ['qingyu', 'yunlong', 'yange']) {
    for (const dir of [ccDir, '/Users/clawbot/Projects/XianTu/if-branches-sample']) {
      const f = join(dir, `${book}.if-branches.json`);
      if (!existsSync(f)) continue;
      const data = JSON.parse(await readFile(f, 'utf8'));
      for (const b of data.branches) {
        const lv = level(b);
        b.consequence = lv;
        b.consequenceWarning = WARN[lv];
      }
      await writeFile(f, JSON.stringify(data, null, 2) + '\n');
      if (dir === ccDir) console.error(`${book}: ` + data.branches.map(b => `${b.id.split('.').pop()}=${b.consequence}`).join(' '));
    }
  }
}
run();
