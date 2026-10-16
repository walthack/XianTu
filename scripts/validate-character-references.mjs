#!/usr/bin/env node
// 人物 id 引用校验：内置关里与总表重复的静态字段，必须与总表一致（不得手写出分歧）。
// 只读 builtins；不改任何数据。见 docs/CHARACTER-DATA-STRUCTURE.md §5。
// 用法：node scripts/validate-character-references.mjs
import { fileURLToPath } from 'node:url';
import { auditBuiltinCharacterReferences } from './character-inline-copies.mjs';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { stages, copies, diverged } = auditBuiltinCharacterReferences();
  for (const d of diverged) {
    console.error(
      `✖ ${d.stageId} ${d.name}(${d.id}) ${d.field} 与总表不一致：内联 ${JSON.stringify(d.inline)}，总表 ${JSON.stringify(d.supplied)}。`
      + '运行时以总表为准，内联值是死数据——要改请改总表，不要手写阶段档。',
    );
  }
  console.log(`character-references: ${stages} 关，${copies.length} 条内联副本与总表一致，${diverged.length} 条分歧`);
  if (diverged.length) process.exitCode = 1;
}
