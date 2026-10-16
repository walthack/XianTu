#!/usr/bin/env node
// 校验物品/角色 ↔ 剧情事件的指针（严格度见 validation.config.json 的 storyLinks；--strict 把警告也当错误）。
import { fileURLToPath } from 'node:url';
import { loadInputs, auditStoryLinks } from './story-links.mjs';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { errors, warnings, appearances } = auditStoryLinks(loadInputs());
  const strict = process.argv.includes('--strict');
  for (const w of warnings) console.warn(`⚠ ${w}`);
  for (const e of errors) console.error(`✖ ${e}`);
  console.log(`story-links: ${Object.keys(appearances.entities).length} 个被跟踪实体，${errors.length} 个错误，${warnings.length} 个警告`);
  if (errors.length || (strict && warnings.length)) process.exitCode = 1;
}
