#!/usr/bin/env node

// Repairs one NPC birth date from the reviewed character registry without
// touching scenario progress, memories, inventory, or any other relationship
// field. Use --apply to write a timestamped backup.
// Usage: node scripts/repair-canon-character-age.mjs --slot 33333 --character 卓云君 [--apply]

import { cp, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const storage = join(root, '.xiantu-server', 'save-storage');
const valueOf = flag => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : '';
};
const slot = valueOf('--slot');
const characterName = valueOf('--character');
const apply = process.argv.includes('--apply');
if (!slot || !characterName) {
  throw new Error('需要指定存档和人物：--slot <存档名> --character <人物名>');
}

const matches = (await readdir(storage))
  .filter(name => name.startsWith('savedata_') && name.endsWith(`_${slot}.json`));
if (matches.length !== 1) throw new Error(`未找到唯一存档「${slot}」（匹配 ${matches.length} 个）`);
const file = join(storage, matches[0]);
const wrapper = JSON.parse(await readFile(file, 'utf8'));
const relation = wrapper?.data?.社交?.关系?.[characterName];
if (!relation || typeof relation !== 'object') {
  throw new Error(`存档未记录人物「${characterName}」的关系卡`);
}

const registry = JSON.parse(await readFile(
  join(root, 'src', 'modules', 'scenarioMods', 'builtins', 'character-registry.json'),
  'utf8',
));
const character = (registry.characters || []).find(entry =>
  entry.canonicalName === characterName || (entry.aliases || []).includes(characterName),
);
const birthYear = character?.staticProfile?.birthYear;
if (!Number.isInteger(birthYear)) {
  throw new Error(`正典角色表中「${characterName}」没有可用的 birthYear，拒绝猜测修复`);
}

const previous = relation.出生日期;
const corrected = { 年: birthYear, 月: 1, 日: 1 };
console.log(`${apply ? '将修复' : '预览'}：${file}`);
console.log(`- ${character.canonicalName} 出生日期：${JSON.stringify(previous)} → ${JSON.stringify(corrected)}`);
if (apply) {
  const backup = `${file}.bak-canon-age-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  await cp(file, backup);
  relation.出生日期 = corrected;
  await writeFile(file, `${JSON.stringify(wrapper, null, 2)}\n`);
  console.log(`已写入；备份：${backup}`);
}
