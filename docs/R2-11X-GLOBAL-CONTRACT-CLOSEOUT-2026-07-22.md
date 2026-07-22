# R2-11X · 全局事件合同收口审计

## 结论

当前 37 个 builtin stage 共 396 个事件，已全部拥有引擎可计算的玩家完成路径。LLM 继续负责演出，但不再拥有任何事件 `done` 真值的直接写入权。

| 完成结构 | 事件数 | 说明 |
|---|---:|---|
| `objective_action` | 389 | 267 个结构明确事件由受限迁移生成；122 个特殊／隔离事件为人工合同 |
| `local_condition` | 1 | 燕歌 `s01_09` 的失败—准备—重试纵切 |
| 仅机会卡合同 | 6 | 燕歌 `s01_05–08`、清羽左武军复盘、云龙伊水押运 |
| **合计** | **396** | **覆盖 396/396** |

## 机会与隔离边界

- 6 个事件配置 10 张机会卡；10/10 有显式 trigger，10/10 有确定性完成合同。
- 新卡只在已有 NPC 决策核和明确过程自由度的锚点人工精选，不按 396 个事件机械铺设。
- 8 个来源重建关共 88 个事件已全部落人工合同，但 `DEFAULT_LINE_QUARANTINED_STAGE_IDS` 保持不变；合同完成不等于解除默认 Rail 隔离。

## 写入权边界

- 玩家使用引擎声明的结构化动作推进合同；自由文本只作兼容入口。
- `canonGuard` 拒绝 LLM 对带确定性合同事件直接写完成 flag。
- 机会卡的出现、追踪、步骤、参与／partial／场外、回执、权限和 NPC 记忆均由本地状态机结算。
- `timeline_deadline` 事件将“玩家已准备好”与正典硬截止分开，玩家不能提前坐实承重生死拍。

## 自动证据

- `tests/r2_11j_objective_action_scale.test.mjs`：396 总事件、389 objective、267 机械边界、396 covered、隔离关不得机械迁移。
- `tests/r2_11w_curated_opportunity_cards.test.mjs`：10 张精选卡、真实 actor/action trigger、默认决策可达、全 builtin schema 通过。
- `tests/r2_11x_global_contract_closeout.test.mjs`：逐一验证 396 个事件都有唯一确定性完成所有者，且 LLM 对每个事件的直接完成写入均被拒绝。
- 八个来源重建关分别具备空档整章／整关重放、冻结 ID 与 completion path、quarantine 保留回归。
- `npm run canon:build`：37 关、482 测试全绿。
- `npm run validate:all` 与 `npm run build`：全绿，production webpack 成功。

## 发布前剩余门禁

1. 收完 `lyg.ganlu_bian` 与本次机会卡提交的 Claude 只读二审；P0/P1 修复，P3 单记。
2. 选择三条新增机会各做一次真机追踪／两步推进／重载回执冒烟，重点看玩家可读性，不再验证真值所有权本身。
3. 8 个隔离关保持不发布到默认 Rail，后续解除须另立审核点。
