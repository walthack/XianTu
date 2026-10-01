# 从飞机落地接到星月湖阶段结局（2026-09-21）

这是隔离试玩入口，不是完整游戏，也不是连续真机通过证明。T7 玩家可见正文风险仍保留。

## 玩家入口

- 首页「星月湖任务线试玩」默认是 **从飞机落地开始** 的连续档。
- 旧三幕短版（海神殿开局）留在同一页的次级折叠入口，可续玩旧档。
- 两种入口使用不同 `characterId` / slot / 存档 ID / extension key，互不覆盖，也不覆盖正式角色。
- 始终进入原 `/game`，复用自由输入、建议、判定、五原地图、背包关系、存读档、继续旅程。

| | 落地连续档 | 旧三幕短版 |
|---|---|---|
| characterId | `char_xingyuehu_landing_playtest_v1` | `char_xingyuehu_quest_playtest_v1` |
| slot | `星月湖从落地开始` | `星月湖任务线试玩` |
| kind | `xingyuehu-landing-through-v1` | `xingyuehu-quest-demo-v1` |
| routeMode | `from-landing` | 无（缺省即短版） |
| 开局 | `lcq.stage_01` 草原，`s01_01` 未完成 | `playtest.xingyuehu.old_war` 海神殿 |
| 结束 | 真实 `event.xiao_opens_resources.done` | 短版三幕裁剪后的同一旗标，且无当前章/活跃事件 |

## 真实主路（当前非隔离）

核对 builtin `nextStageId` 与 `DEFAULT_LINE_QUARANTINED_STAGE_IDS`：

```
lcq.stage_01
 → lcq.stage_02
 → lcq.stage_03（隔离，自动跳过）
 → lcq.stage_03b_snake_flower_bridge
 → lcq.stage_04
 → lcq.stage_04b_lingfei_baiyi_crisis
 → lcq.stage_05（隔离，自动跳过）
 → lcq.stage_05b
 → lcq.stage_06（隔离，自动跳过）
 → lcq.stage_07_qingyuan_jiankang
```

阶段结局：`lcq.event.xiao_opens_resources` 真实完成后显示结束卡。  
这是 **星月湖组织支持的阶段结局**，不是整个星月湖故事完结。07 章后续宫变事件与 08 不伪写完成。

### 保留的关

- `01 / 02 / 03b / 04 / 04b / 05b / 07` 使用原 `lcq.stage_*` ID，不改成 playtest modId。
- 每关全部 event ID 保留。04b、05b 不被裁成单事件。
- `slay_dragon` 仍在 05b 主路上，位于 `xieyi_entrustment` 之前；新档初始化不得把它写成 done。
- 清远到建康走 07 全章顺序：`xiaoyaoyi_arrives` → `s07_01`…`s07_04` → `s07_05` → `xiao_opens_resources`，不跳接骨灰/孟非卿短链。

### 继续隔离的关

- `lcq.stage_03`、`lcq.stage_05`、`lcq.stage_06` 仍隔离。
- 内容已迁到 `03b / 04b / 05b` 的，不恢复重复旧关。
- 切关沿正式 `transitionToNextScenarioStage` 的既有隔离跳过。

## 实现要点

- 建档复用 `createQingyuOpeningPlaytestSave` 的开场正文、自然意图、初始属性和 s01_01 落地 stall，然后删掉清羽 Demo marker，换上落地连续档 marker。
- `strictInitializer`：短版仍走裁剪 overlay；落地档只走 `overlayXingyuehuLandingPlaytestStage`（安全开场文案 + stage_02 自然意图，不裁事件、不改 stage ID、不把未来 done 写成初始 true）。
- 进 07 **不预置** `event.xieyi_entrustment.done`。生产切关本来也不继承 `event.*.done`；命运靠上一关真实落下的 `character.xie_yi.status` / 分支 IF。
- HUD：前段从当前章/事件 objective 提取，不列后续事件；未到托付拍不提示谢艺命运。反馈上下文锁定、最大高度、冲突 fail-closed 仍走短版逻辑。
- 结束卡：落地档文案写明阶段结局；短版文案保持三幕完成口径。返回同一入口页。

## 完成条件

落地档显示结束，当且仅当：

1. marker `kind=xingyuehu-landing-through-v1` 且 `routeMode=from-landing`
2. 当前 `modId === lcq.stage_07_qingyuan_jiankang`
3. `flags['event.xiao_opens_resources.done'] === true`

不要求后续宫变、章节清空或 `activeEventIds` 为空。短版结束条件仍要求短版 playtest modId 且无当前章/活跃事件，两套互不污染。

## 测试证据

命令（未跑 `canon:build` / 其它会重写 builtin 的钩子）：

```
node --test tests/xingyuehuLandingPlaytest.test.mjs \
  tests/xingyuehuQuestPlaytest.test.mjs \
  tests/xingyuehuQuestPlaytestExperience.test.mjs \
  tests/qingyuOpeningPlaytest.test.mjs
→ 31/31 PASS

node --test tests/single_player_surface.test.mjs \
  tests/xingyuehuG0Reachability.test.mjs \
  tests/xingyuehuB1LocalBranch.test.mjs
→ 22/22 PASS

npm run type-check → PASS
```

Vue 编译：`tests/xingyuehuQuestPlaytestExperience.test.mjs` 编译入口页与 HUD；`tests/single_player_surface.test.mjs` 编译 `MainGamePanel.vue`。

| 测试 | 证明了什么 | 不能称作 |
|---|---|---|
| 新档草原开场 | stage_01、`s01_01` 未完成、无未来命运/开库/slay_dragon.done、IDs 不与短版/清羽冲突 | 真机第一屏观感 |
| overlay 保留事件 | 04b/05b 事件数与 ID 与 builtin 一致，不改 stage ID | 玩家打完这些关 |
| 切关单测 | 每跳走正式 `transitionToNextScenarioStage`，隔离 03/05/06 被跳过，新关不因切关把未来 done 写成 true | **不是端到端**。中间拍用 rail 完成旗标推进 |
| 中间关未完成不得切 | 只完成 s01_01，或 04b 只走到旧战后，不能 depart | 未穷尽所有卡线 |
| 生死两条 | 05b 托付拍与 07 接应/认领/开库走真实结构化动作；进 07 时 `xieyi_entrustment.done` 仍为 false；回顾无「失踪」 | 05b 托付之前、07 旧案段仍是切关旗标，**不是连续真机** |
| 短版回归 | 原 4 个短版 runtime 测试 + 体验测试仍绿 | 短版真机 |

## 不能证明 / 仍保留的风险

- **不是连续真机通过。** 不得用「每关都有合同」代替从草原点到开库的真人/浏览器全线。
- 切关单测把中间 rail 事件的完成旗标直接置 true。这只证明转场 API 与隔离跳过，不证明准备合同、五原地图或判定在那些拍上可点通。
- 五原 `s02_04` 仍须走点心铺节点与局部合同；落地档保留 `lcq.stage_02` ID，因此地图闸仍生效。本轮 **没有** 用删前置的方式绕过它，也 **没有** 用真实旅行回执打穿五原。
- 05b 托付前的 `slay_dragon` 在生死测试里由 rail 旗标结清，不是玩家点「了结龙神」。初始化路径已断言它不是初始 done。
- 07 在 `xiaoyaoyi_arrives` 与 `s07_05` 之间的清远内斗拍，生死测试用 rail 旗标走过，不是真人选择。
- 结束卡出现后，07 后续宫变事件在运行时仍可能存在；UI 锁输入，但不等于那些事件被结算或被删除。
- **T7 正文风险未消除**：权威层可守住命运字段，模型仍可能把「补心丹已生效」或「谢艺失踪」写成既成事实。本轮未发送 LLM 回合，不覆盖 2026-09-14 B1 `VERDICT: FAIL`。
- 未解禁 `lcq.stage_06`。未改 canon、builtin、核心 prompt、冻结 ID、API 配置。未 commit。
