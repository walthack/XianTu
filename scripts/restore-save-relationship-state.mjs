#!/usr/bin/env node

// Restores only player-earned relationship labels and favour from a named
// save backup. It intentionally does not restore old character profiles,
// memories, appearance/thought fields, narrative history, scenario progress,
// inventory, or canonical static data.
//
// Usage:
// node scripts/restore-save-relationship-state.mjs --slot 33333 \
//   --backup savedata_char_xxx_33333.json.bak-canon-persona-... [--apply]

import { cp, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const storage = join(root, '.xiantu-server', 'save-storage');
const valueOf = flag => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : '';
};
const slot = valueOf('--slot');
const backupName = valueOf('--backup');
const apply = process.argv.includes('--apply');
if (!slot || !backupName) {
  throw new Error('需要指定 --slot <存档名> 与 --backup <备份文件名>');
}
if (backupName.includes('/') || backupName.includes('..')) {
  throw new Error('--backup 必须是 save-storage 内的备份文件名');
}

const matches = (await readdir(storage))
  .filter(name => name.startsWith('savedata_') && name.endsWith(`_${slot}.json`));
if (matches.length !== 1) throw new Error(`未找到唯一存档「${slot}」（匹配 ${matches.length} 个）`);
const file = join(storage, matches[0]);
const backupFile = join(storage, backupName);
const [wrapper, backup] = await Promise.all(
  [file, backupFile].map(async path => JSON.parse(await readFile(path, 'utf8'))),
);
const relations = wrapper?.data?.社交?.关系;
const backupRelations = backup?.data?.社交?.关系;
if (!relations || !backupRelations || typeof relations !== 'object' || typeof backupRelations !== 'object') {
  throw new Error('当前存档或指定备份缺少 社交.关系');
}

const changes = [];
for (const [name, previous] of Object.entries(backupRelations)) {
  const relationName = previous?.与玩家关系;
  const favour = previous?.好感度;
  if (typeof relationName !== 'string' || !Number.isFinite(favour)) continue;
  const current = relations[name];
  if (!current || typeof current !== 'object') {
    // This person was removed by a broad stage projection. Restore only a
    // minimal, safe player-relationship card; canonical profile data remains
    // controlled by the current stage/registry.
    relations[name] = {
      名字: previous.名字 || name,
      性别: previous.性别 || '未知',
      与玩家关系: relationName,
      好感度: favour,
      记忆: [],
    };
    changes.push(`${name}（恢复关系卡：${relationName} / ${favour}）`);
    continue;
  }
  if (current.与玩家关系 !== relationName || current.好感度 !== favour) {
    changes.push(`${name}：${current.与玩家关系 || '未设'} / ${Number.isFinite(current.好感度) ? current.好感度 : '未设'} → ${relationName} / ${favour}`);
  }
  current.与玩家关系 = relationName;
  current.好感度 = favour;
}

console.log(`${apply ? '将恢复' : '预览恢复'}：${file}`);
console.log(`- 关系状态变更 ${changes.length} 项；不恢复旧记忆或人物设定。`);
for (const change of changes) console.log(`- ${change}`);
if (apply) {
  const backupPath = `${file}.bak-relationship-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  await cp(file, backupPath);
  await writeFile(file, `${JSON.stringify(wrapper, null, 2)}\n`);
  console.log(`已写入；写前备份：${backupPath}`);
}
