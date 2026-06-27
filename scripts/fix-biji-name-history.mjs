#!/usr/bin/env node

// 修正 小紫生母 的本名/役名：本名碧姬，被鬼巫王掳入鬼王峒后改称碧奴。
// canonical id 用本名 → liuchao.character.bi_ji（原 bi_nu 级联改）。
// 按关卡显示对应名字(名字即状态)：stage_05(被掳)=碧奴；stage_06(弑母,本名回归)=碧姬。
// Usage: node scripts/fix-biji-name-history.mjs [--dry-run]

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const stageDir = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash', 'qingyu', 'stages');
const dryRun = process.argv.includes('--dry-run');
const OLD = 'liuchao.character.bi_nu';
const NEW = 'liuchao.character.bi_ji';

const REF1 = new Set(['characterId', 'fromCharacterId', 'toCharacterId', 'playerCharacterId']);
const REFA = new Set(['featuredCharacterIds', 'relatedCharacterIds', 'allowedCharacterIds']);
function remap(node) {
  if (Array.isArray(node)) return node.forEach(remap);
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (REF1.has(k) && v === OLD) node[k] = NEW;
    else if (REFA.has(k) && Array.isArray(v)) node[k] = v.map(x => (x === OLD ? NEW : x));
    else remap(v);
  }
}

const PER_STAGE = {
  'lcq.stage_05': { name: '碧奴', desc: '本名碧姬，被鬼巫王掳入鬼王峒后改称碧奴；小紫生母，自幼将小紫弃养，妖艳放浪，母女积怨甚深。' },
  'lcq.stage_06': { name: '碧姬', desc: '本名碧姬（鬼王峒役名碧奴），小紫生母。本关于鬼王峒废墟被积怨已久的小紫亲手杀死。' },
};

async function run() {
  for (const f of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
    const path = join(stageDir, f);
    const m = JSON.parse(await readFile(path, 'utf8'));
    const id = m.manifest?.id;
    const ch = (m.canon?.characters || []).find(c => c.id === OLD);
    if (!ch && !JSON.stringify(m).includes(OLD)) continue;
    if (ch) {
      ch.id = NEW;
      const ps = PER_STAGE[id];
      if (ps) { ch.name = ps.name; ch.description = ps.desc; }
    }
    remap(m);
    if (!dryRun) await writeFile(path, `${JSON.stringify(m, null, 2)}\n`);
    console.log(`${id}: bi_nu→bi_ji${ch ? ` | 名=${ch.name}` : ''}`);
  }
  console.log(dryRun ? 'DRY RUN' : '本名/役名修正完成。');
}
run().catch(e => { console.error(e); process.exit(1); });
