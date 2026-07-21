# R2-11J：明确目标事件批量迁移（2026-07-21）

## 结论

R2-11 的引擎独占完成覆盖从 `7/380` 提升到 `274/380`。本批迁移 267 个结构明确的事件：清羽 122、云龙 59、燕歌 86。

## 新合同：`objective_action`

适用于已经声明唯一、明确 `objective` 的单步事件。主界面提供带稳定 event/action id、合同 hash 与一回合成本的【主线推进】动作；玩家点击并成功完成该 AI 回合后，事件进入 ready，下一次 runtime 事务写入唯一完成键。LLM 正文和命令不能完成事件。

它与 `local_condition` 的区别：

- `objective_action`：玩家明确选择执行已声明目标即为 success，不暗中做属性检定。
- `local_condition`：按行动前存档判 success／partial／failure，可接准备与重试。
- 多步事件继续使用机会卡 action sequence 或专门合同，不能降格为单按钮。

## 自动迁移边界

脚本 `scripts/migrate-objective-action-contracts.mjs` 只迁移同时满足以下条件的事件：

1. 尚无玩家完成合同或机会卡完成合同；
2. 有非空 `objective`；
3. 无 `completionEvidence` 多拍合同；
4. completion 是唯一 `flags.* == true` 标准键；
5. 不属于裁定 #61/#62 的八个隔离关。

脚本默认 dry-run，只有 `--apply` 写入；重复执行幂等。

## 验收

- 380 个事件中恰有 267 个 `objective_action`，总引擎覆盖恰为 274。
- 八个隔离关零自动迁移，高光 evidence 事件零自动迁移。
- 三书各抽一个真实事件，经固定动作完成、LLM 完成命令拒绝、JSON 双路推进逐字节一致。
- 截止临界回合沿用 R2-11I 的 ready 所有权保护，不会被场外结算覆盖。

## 剩余 106 个

- 34 个非隔离事件：3 个多拍 evidence，31 个没有 objective（其中 21 个为人物登场）。下一批按“多步高光／登场展示／人工单步目标”分别建合同。
- 72 个位于八个隔离关：依裁定 #61/#62，必须先重建来源与顺序，不能因本轮扩量自动合法化旧自由稿或回接默认 Rail。

因此本批不是把 380 个事件机械做成同一种按钮；剩余数量与阻断原因均显式留档。
