# Agent 须知（多 agent 一致性）

1. **修改 canon 数据（mod-kit/generated/**）或核心 prompt（src/modules/scenarioMods/storyContext.ts 等）前，必读**
   `mod-kit/generated/deepseek-v4-flash/character-canon/CANON-DECISIONS.md`（正典裁定簿）。
2. 带执法标记（AFF_PROTECTED / AGE_PROTECTED / DEBUT_PROTECTED / USER_CANON）的字段是人工裁定，
   **任何扫描/富化/重构不得覆盖**；确需改动，先在裁定簿追加解锁条目再动手。
3. 提交纪律：`npm run canon:build` 全绿（37 关校验 + 92 测试）才可 commit；
   人工拍板的新裁定在同一 commit 里追加进裁定簿；核心文档权威=工作目录（裁定簿/简报已入 git）；改动后单向 rsync 到 NAS `character-canon/`（仅用户阅览镜像，不得反向拉取或在 NAS 上编辑）。

## Claude 二审回报

- 提交只读二审时，必须通过 `/Users/clawbot/.codex/bin/claude-review-submit.mjs`，不得直接调用 `claude-async.mjs submit`。
- 包装器会原子登记 `~/.codex/claude-review-watch.json`；本线程心跳只监控该 job，完成后主动回报并写入 `reported:true`，避免遗漏或重复回报。
