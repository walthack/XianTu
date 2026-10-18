# 数值权威路径（game-numbers）

## 权威源（请改这里）

| 文件 | 顶层段 |
|---|---|
| `mod-kit/numbers-combat.json` | combat, difficulty, judgement, factors, weights, goalModifiers, sceneDefaults, historicalPrototype |
| `mod-kit/numbers-progress.json` | levels, training, techniques, status, currency, freeAction, affinity, reputation, lineBonds, npcCard |
| `mod-kit/numbers-runtime.json` | version, tuning, diagnostics, saves, aiRetry, feedback, e2eSmoke, perf |

运行时由 `src/modules/sceneModule/numbers.ts` **加载合并**为同一 `GAME_NUMBERS` 形状；`applyTuning` / `applyGameNumbers` 仍对合并视图打补丁（tuning 不感知物理文件数）。冷启动跑 `numbersRegistry`（缺段 → `LCQ-NUM-007`）。

## 生成物（勿手改）

- `mod-kit/game-numbers.qingyu.json`：三分包合并视图，供旧读者／文档引用／部分测试直读。
- 重新生成：`node scripts/merge-game-numbers.mjs`

## 调用约定

- 生产代码与模块：**只** `import { GAME_NUMBERS } from '.../sceneModule/numbers'`（或经已有封装再读）。
- **不要**在业务代码里散落 `import` 多个 `numbers-*.json`。
