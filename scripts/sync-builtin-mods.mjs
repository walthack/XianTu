#!/usr/bin/env node

// 把 18 个成品 stage mod 打包进 src 作为内置剧情模板(供应用 bundle)。
// 从 mod-kit/generated/.../{book}/stages/*.json(排除 uncertainties)复制到
// src/modules/scenarioMods/builtins/data/<manifest.id>.json，并按内容哈希写 version。
//
// Usage: node scripts/sync-builtin-mods.mjs

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile, rm, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expandWorldSimBaseline } from './expand-world-sim-baseline.mjs';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const outDir = join(root, 'src', 'modules', 'scenarioMods', 'builtins', 'data');
const books = ['qingyu', 'yunlong', 'yange'];

async function run() {
  // 只补缺失的 worldSimulation；已有人工纵切由生成器明确跳过，
  // 这样标准 canon:build 在任意工作机上都不会把全 stage 可玩底座覆盖掉。
  await expandWorldSimBaseline();
  if (existsSync(outDir)) await rm(outDir, { recursive: true });
  await mkdir(outDir, { recursive: true });
  const hash = createHash('sha256');
  const ids = [];
  for (const book of books) {
    const stageDir = join(gen, book, 'stages');
    for (const f of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json')).sort()) {
      const text = await readFile(join(stageDir, f), 'utf8');
      const mod = JSON.parse(text);
      const id = mod.manifest?.id;
      if (!id) throw new Error(`${book}/${f} 缺 manifest.id`);
      const pretty = `${JSON.stringify(mod, null, 2)}\n`;
      await writeFile(join(outDir, `${id}.json`), pretty);
      hash.update(id).update(pretty);
      ids.push(id);
    }
  }
  const version = hash.digest('hex').slice(0, 12);
  await writeFile(join(outDir, '..', 'manifest.json'), `${JSON.stringify({ version, ids }, null, 2)}\n`);
  console.log(`内置 ${ids.length} 个 mod → src/modules/scenarioMods/builtins/data/，version=${version}`);

  // 持久化世界地图背景到 dist(devServer 静态目录;webpack output.clean 会清,故每次同步重建)
  try {
    const distDir = join(root, 'dist');
    await mkdir(distDir, { recursive: true });
    await copyFile(join(gen, 'shared-atlas', '六朝世界地图.jpg'), join(distDir, 'liuchao-world-map.jpg'));
    console.log('世界地图背景 → dist/liuchao-world-map.jpg');
  } catch (e) {
    console.warn('世界地图背景拷贝失败:', e.message);
  }
}
run().catch(e => { console.error(e); process.exit(1); });
