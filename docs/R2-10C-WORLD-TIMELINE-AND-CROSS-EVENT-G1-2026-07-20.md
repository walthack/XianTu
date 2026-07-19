# R2-10C 世界时间合同与跨事件 G1

- 日期：2026-07-20
- 基线：R2-10B `s01_05` G1 已通过
- 范围：`lyg.event.s01_06–08`
- 结论：**时间合同与首批跨事件 G1 通过；下一批进入态度／知识／effects 反馈环。**

## 1. 时间合同

事件时钟以“首次具备结构资格”的世界回合为零点，不依赖 LLM：

| 类型 | 语义 | 程序行为 |
|---|---|---|
| `canon_anchor` | 正典硬锚点 | `notBeforeTurns` 前不激活；`deadlineTurns` 到达后按专用场外合同结算 |
| `window` | 有开放期与截止点的弹性事件 | 窗口内可由玩家/NPC 改变过程，截止后结算既定后果 |
| `emergent` | 条件满足才出现、无必然截止 | 不因玩家拖延伪造互动或知识获得 |

运行时分别记录：

- `eligibleAtTurn`：事件首次具备结构资格；
- `activatedAtTurn`：成为可演出的当前事件；
- `occurredAtTurn`：世界事实真正发生；
- `publiclyRevealedAtTurn`：成为公共消息；
- `playerLearnedAtTurn`：玩家角色可把结果当作已知事实。

未到 `playerLearnedAtTurn` 的场外事实会从 LLM prompt、世界线分歧面板和编年史中过滤；公开或取得指定权限后才进入玩家知识。

## 2. `s01_06–08` 三种结构

| 事件 | 类型 | 最早 | 截止 | 获知 | 世界演员结构 |
|---|---|---:|---:|---|---|
| `s01_06` 郭解之死 | `canon_anchor` | 资格后 1 回合 | 6 | 发生后 1 回合由公开消息获知 | 郭解护持 vs 剑玉姬破坏，`royalSafety/assailantPressure` |
| `s01_07` 董卓之死 | `canon_anchor` | 资格当轮 | 5 | 发生后 1 回合由公开消息获知 | 董卓遗命 + 贾文和收束，`liangzhouCohesion/borderAlarm` |
| `s01_08` 盛姬线索 | `emergent` | 资格后 1 回合 | 无 | 只有事件亲历完成后立即获知 | 阮香凝核验/披露/控制知情范围，`trustWindow/exposureRisk` |

`s01_06/07` 的硬截止只结算默认正典；裁定 #95 的显式生还 IF 仍可在截止前替代。`s01_08` 即使世界持续推进也不会自动完成，不会伪造玩家已听取秘密。

## 3. G1 证据

命令：`npm run test:g1:npc`

跨事件证据：

```text
s01_06 eligible=0 activated=1 occurred=6 public/playerLearned=7 outcome=offscreen
s01_07 eligible=6 activated=6 occurred=11 public/playerLearned=12 outcome=offscreen
s01_08 eligible=11 activated=12 occurred=undefined
```

同时断言：

- `steeringCooldown=50`、stall 冻结时，硬截止仍按事件时钟发生；
- 两次场外结算均不授予机会权限；
- hidden 行动不进入可见集合；
- 三个事件使用不同决策输入哈希与局势白名单；
- JSON 存档往返后不重复结算、分歧或回执；
- `s01_08` 推进至 worldTurn 20 仍保持未完成、未场外结算。

## 4. 下一批

按既定顺序进入：

1. 态度进入行动效用与反馈；
2. knowledge 成为行动资格与传播边界；
3. effects 可来源化改变关系、资源、知识和下一轮候选；
4. 再做行动冲突、反制与多回合生命周期。

G2 仍负责真实模型演出、泄漏与玩家可读性；G2 前不部署共享测试服或开放外测。
