# R2-11W · 三书精选机会卡扩写

## 结论

机会卡从 7 张扩到 10 张，但不做“一事件一卡”。新增卡只放在已有 `decisionCore`、有明确角色动机和过程自由度的三个承重锚点，并由 NPC 已裁定的 actor/action 确定性触发。

| 主线 | 锚点 | 新机会 | 触发行动 | 只改变什么 |
|---|---|---|---|---|
| 清羽 | `lcq.event.s10_04_left_army_review` | 让小紫试一条假消息 | 小紫 `gather_intelligence/test_loyalty` | 无害错位消息、传播链复核、一次性反情报权限 |
| 云龙 | `lyl.event.s05_09` | 给伊水伏击留下反查线索 | 云苍峰 `open_safe_route` / 云丹琉 `block_road` | 现场留证、路线风险复核、一次性反伏击勘验权限 |
| 燕歌 | `lyg.event.s01_07` | 让凉州旧部退得出去 | 贾文和 `reserve_supplies/prepare_fallback_route` | 撤离军需分账、受限后勤联络、一次性协调权限 |

## 正典边界

- 小紫路线不得把试探冒充定罪，不得泄露真实江州军机。
- 云氏路线不得宣称追回全部金铢或全歼袭击者，不得为追线索拖住伤员撤离。
- 贾文和路线不得改变董卓既定退场、让凉州旧部挟持新帝或继续入宫争权，也不得把边警写成已确认入侵。
- 三张卡都只提供过程参与、NPC 记忆与一次性权限，不更改对应 Canon Rail 的结局。

## 自动门禁

- 全库机会卡总数固定为 10，且显著少于事件总数，防止机械铺卡。
- 每张新卡的 trigger 必须命中本事件真实 `decisionCore.actionBindings`。
- 默认局势下至少存在一项真实入选的 NPC 决策可触发新卡。
- 每张卡使用两步结构化行动合同，`timeCost=1`；全 builtin 继续通过 schema validator。
- 回归以完整关卡默认状态执行真实 runtime：先由默认 NPC 决策浮出卡片，再追踪、执行两步动作，并在每一步之间 JSON 重载；三张卡均只产生一份 participated 回执与一份权限授予，不产生 offscreen 竞争结算。
- 燕歌卡使用 `timeline_deadline`，两步完成后只进入 ready，董卓退场事实仍须等正典截止，不允许机会卡提前坐实。

## 非阻断观察

- R2-11U Claude 二审 P3：`lyg.shixiang_ambush` opening 以未经证实的传话略微预告首拍调查由头。它没有预写结果、flag 或后续来源事实，暂留作叙事钩子；未来若统一收紧 opening 到“连首拍由头也不透露”，再专项改写。
