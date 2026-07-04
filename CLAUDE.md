# Agent 须知（多 agent 一致性）

1. **修改 canon 数据（mod-kit/generated/**）或核心 prompt（src/modules/scenarioMods/storyContext.ts 等）前，必读**
   `mod-kit/generated/deepseek-v4-flash/character-canon/CANON-DECISIONS.md`（正典裁定簿）。
2. 带执法标记（AFF_PROTECTED / AGE_PROTECTED / DEBUT_PROTECTED / USER_CANON）的字段是人工裁定，
   **任何扫描/富化/重构不得覆盖**；确需改动，先在裁定簿追加解锁条目再动手。
3. 提交纪律：`npm run canon:build` 全绿（37 关校验 + 92 测试）才可 commit；
   人工拍板的新裁定在同一 commit 里追加进裁定簿；核心文档改动同步 NAS `character-canon/`。
