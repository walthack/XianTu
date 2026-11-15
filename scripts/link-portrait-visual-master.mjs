#!/usr/bin/env node

// 让外观主表（portrait-visual-master.json，只在本机、不入库）和人物总表（character-registry.json）对上：
//   每个人物补 characterId、birthYear、birthYearBasis —— 原样取自总表，不另算、不加任何门槛；
//   每套服饰补 sceneTags —— 取自 scripts/portrait-outfit-scene-tags.json（入库，可人工改）。
// 不改 outfits[].scope：它会被 build-character-registry.mjs 投影进总表、再进叙事提示词（pickOutfitForStage），
// 改它等于改游戏里的文字；未绑定的变体仍是 unassigned，等人工按剧情指派。
//
// 主表按名字对总表的 canonicalName；对不上或对上多个都不猜，characterId 记 null 并列出来。
// build-portrait-visual-layers.mjs 重建主表时会丢掉人物层的这三个字段，所以重建后要再跑一次本脚本（幂等）。
//
// 用法：node scripts/link-portrait-visual-master.mjs [--check] [--master <主表路径>]
//   --check 只比对不写盘：主表与本脚本将写出的结果不一致（含出生年与总表不同步）时退出码 1。

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
export const DEFAULT_MASTER = join(root, 'mod-kit/generated/deepseek-v4-flash/character-canon/portrait-visual-master.json');
export const REGISTRY = join(root, 'src/modules/scenarioMods/builtins/character-registry.json');
export const SCENE_TAGS = join(root, 'scripts/portrait-outfit-scene-tags.json');

/** 纯函数：返回补好字段的主表副本与报告，不读写文件。 */
export function linkPortraitMaster(master, registry, sceneTags) {
  const byName = new Map();
  for (const c of registry.characters) (byName.get(c.canonicalName) || byName.set(c.canonicalName, []).get(c.canonicalName)).push(c);
  const vocabulary = new Set(Object.keys(sceneTags.vocabulary));
  const report = { linked: 0, unmatched: [], ambiguous: [], noBirthYear: [], outfits: 0, tagged: 0, untagged: [], problems: [] };
  const usedKeys = new Set();
  const characters = master.characters.map(entry => {
    const hits = byName.get(entry.name) || [];
    const hit = hits.length === 1 ? hits[0] : null;
    if (!hits.length) report.unmatched.push(entry.name);
    else if (!hit) report.ambiguous.push(`${entry.name}：${hits.map(c => c.id).join('、')}`);
    else report.linked++;
    const birthYear = hit?.staticProfile?.birthYear ?? null;
    if (hit && birthYear === null) report.noBirthYear.push(entry.name);
    const outfits = (entry.outfits || []).map(outfit => {
      report.outfits++;
      const key = `${hit ? hit.id : `name:${entry.name}`}/${outfit.id}`;
      usedKeys.add(key);
      const tag = sceneTags.outfits[key];
      if (!tag) { report.problems.push(`${key}（${entry.name}）在场景标签文件里没有条目`); return { ...outfit, sceneTags: [] }; }
      const bad = tag.tags.filter(t => !vocabulary.has(t));
      if (bad.length) report.problems.push(`${key}：标签 ${bad.join('、')} 不在词表里`);
      if (!tag.tags.length && !tag.untagged) report.problems.push(`${key}：没有标签也没有写留空原因`);
      if (tag.tags.length) report.tagged++; else report.untagged.push(`${entry.name}/${outfit.id}：${tag.untagged}`);
      return { ...outfit, sceneTags: [...tag.tags] };
    });
    return { ...entry, characterId: hit ? hit.id : null, birthYear, birthYearBasis: hit?.birthYearBasis ?? null, outfits };
  });
  for (const key of Object.keys(sceneTags.outfits)) if (!usedKeys.has(key)) report.problems.push(`场景标签文件里的 ${key} 在主表里找不到对应服饰`);
  return { master: { ...master, characters }, report };
}

const stringify = doc => `${JSON.stringify(doc, null, 1)}\n`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--master');
  const masterPath = at >= 0 ? resolve(args[at + 1]) : DEFAULT_MASTER;
  const check = args.includes('--check');
  if (!existsSync(masterPath)) { console.error(`找不到主表：${masterPath}（它不入库，只在本机；用 --master 指定路径）`); process.exit(2); }
  const before = readFileSync(masterPath, 'utf8');
  const { master, report } = linkPortraitMaster(JSON.parse(before), JSON.parse(readFileSync(REGISTRY, 'utf8')), JSON.parse(readFileSync(SCENE_TAGS, 'utf8')));
  console.log(`人物 ${master.characters.length}：对上总表 ${report.linked}，对不上 ${report.unmatched.length}，多个候选 ${report.ambiguous.length}，对上但总表没有出生年 ${report.noBirthYear.length}`);
  if (report.unmatched.length) console.log(`  对不上：${report.unmatched.join('、')}`);
  if (report.ambiguous.length) console.log(`  多个候选：${report.ambiguous.join('；')}`);
  if (report.noBirthYear.length) console.log(`  没有出生年：${report.noBirthYear.join('、')}`);
  console.log(`服饰 ${report.outfits} 套：有场景标签 ${report.tagged}，留空 ${report.untagged.length}`);
  for (const line of report.untagged) console.log(`  留空 ${line}`);
  for (const line of report.problems) console.log(`  问题 ${line}`);
  const after = stringify(master);
  if (report.problems.length) { console.error('有问题未解决，不写盘'); process.exit(1); }
  if (check) {
    if (after !== before) { console.error('主表与总表／场景标签文件不同步：去掉 --check 重跑一次'); process.exit(1); }
    console.log('主表已同步');
  } else if (after === before) console.log('主表已同步，无需写盘');
  else { writeFileSync(masterPath, after); console.log(`已写回 ${masterPath}`); }
}
