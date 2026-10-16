#!/usr/bin/env node
// 生成只读派生的登场反向索引 mod-kit/entity-catalog/entity-appearances.json（不要手改；校验会发现过期）。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadInputs, buildAppearances, serializeAppearances, APPEARANCES_PATH } from './story-links.mjs';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const built = buildAppearances(loadInputs());
  writeFileSync(new URL(`../${APPEARANCES_PATH}`, import.meta.url), serializeAppearances(built));
  console.log(`entity-appearances: ${Object.keys(built.entities).length} 个被跟踪实体`);
}
