#!/usr/bin/env node
/**
 * 将权威三分包合并为 mod-kit/game-numbers.qingyu.json（兼容旧读者与文档引用）。
 * 运行时权威加载在 src/modules/sceneModule/numbers.ts（直接 import 三分包再合并）。
 * 权威路径：
 *   mod-kit/numbers-combat.json
 *   mod-kit/numbers-progress.json
 *   mod-kit/numbers-runtime.json
 * 生成物：mod-kit/game-numbers.qingyu.json（勿手改；改三分包后跑本脚本）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => JSON.parse(readFileSync(resolve(root, 'mod-kit', name), 'utf8'));

const COMBAT = ['combat', 'difficulty', 'judgement', 'factors', 'weights', 'goalModifiers', 'sceneDefaults', 'historicalPrototype'];
const PROGRESS = ['levels', 'training', 'techniques', 'status', 'currency', 'freeAction', 'affinity', 'reputation', 'lineBonds', 'npcCard'];
const RUNTIME = ['version', 'tuning', 'diagnostics', 'saves', 'aiRetry', 'feedback', 'e2eSmoke', 'perf'];
const ORDER = ['version', 'levels', 'factors', 'combat', 'training', 'difficulty', 'currency', 'weights', 'goalModifiers', 'sceneDefaults', 'historicalPrototype', 'lineBonds', 'npcCard', 'affinity', 'reputation', 'status', 'techniques', 'freeAction', 'tuning', 'judgement', 'diagnostics', 'saves', 'aiRetry', 'feedback', 'e2eSmoke', 'perf'];

const parts = [
  ['numbers-combat.json', COMBAT],
  ['numbers-progress.json', PROGRESS],
  ['numbers-runtime.json', RUNTIME],
];

const merged = {};
for (const [file, keys] of parts) {
  const data = read(file);
  const got = Object.keys(data).sort();
  const expect = [...keys].sort();
  if (JSON.stringify(got) !== JSON.stringify(expect)) {
    throw new Error(`${file} 顶层键不符：got=${got.join(',')} expect=${expect.join(',')}`);
  }
  for (const key of keys) {
    if (key in merged) throw new Error(`重复键 ${key}`);
    merged[key] = data[key];
  }
}
const out = {};
for (const key of ORDER) {
  if (!(key in merged)) throw new Error(`合并结果缺 ${key}`);
  out[key] = merged[key];
}
const dest = resolve(root, 'mod-kit/game-numbers.qingyu.json');
writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`);
console.log(`merged → mod-kit/game-numbers.qingyu.json (${ORDER.length} top keys)`);
