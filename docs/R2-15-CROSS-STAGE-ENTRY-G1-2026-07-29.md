# R2-15 跨关主阅读面落点 G1 + G2

日期：2026-07-29；G2 关闭：2026-07-30

## 问题

跨关命令已经同时存在于主阅读面与右栏，也由本地引擎直接切换关卡；但切换只更新世界、位置、当前事件与任务，叙事历史和短期记忆仍保留旧关最后一段。结果是：

- 右栏任务和确定性动作已经属于新关；
- 主阅读面仍显示旧关送别、战斗或收束正文；
- 玩家必须再发一个动作，等 LLM 返回后，阅读面才真正进入新关。

这不是“入口只能靠右栏”的问题，而是切关后的两个 UI 面处于不同关卡，形成“旧正文 + 新任务”的认知硬切。

## 边界

1. `stage_ready` 继续由确定性直接命令消费，切关本身不调用 LLM；
2. 不新增第二种启程按钮，不把跨关塞回固定动词菜单；
3. 目标关载入后，主阅读面立即显示目标关权威 `opening.text`；
4. opening 落点不写入叙事历史、短期记忆或世界真值，不伪造一轮已经发生的故事；
5. 落点可存档、可重载，直到首个新关正文成功落账才消费；
6. 首个新关 prompt 从 opening 与当前事件继续，不复演旧关收束，不输出内部关卡 ID 或“切关”机制；
7. 不改变事件合同、合同 hash、Canon Rail、世界时钟或 NPC 累积状态。

## 实现

- runtime 新增一次性 `stageEntryPresentation`，包含旧／新关身份、进入回合与目标关 opening；
- `transitionToNextScenarioStage()` 激活新关首批事件后创建落点；
- 主阅读面优先显示落点，并以“旅途新章”区分于已经入库的普通 GM 正文；落点不携带旧的 LLM 行动选项；
- `buildScenarioStoryPrompt()` 在落点存在时注入跨关续写边界；
- `processGmResponse()` 只在首个新关正文成功落账后消费落点，陈旧旧关响应不能误清；
- JSON 重载保持落点，旧叙事历史和短期记忆逐字不变。

## G1 验收

- 切关后 `modId`、当前事件、任务、位置与主阅读面同时属于目标关；
- 主阅读面不再显示旧关最后一段，也不复用旧 `actionOptions`；
- 落点正文逐字来自目标关 `opening.text`；
- 切关过程零 LLM 调用、零伪造叙事历史、零短期记忆污染；
- reload 后仍显示同一落点；
- 首个新关 prompt 含“跨关落点”，但不含旧／新关内部 ID；
- 首个成功新关正文后落点消失，正常显示最新入库正文；
- 进行中的事件合同 hash 与准备状态不因展示态变化而重置。

## G1 结果

G1 已通过：

- 跨关落点、JSON 重载、prompt 边界与定向消费测试 14/14；
- `npm run type-check` 通过；
- `npm run canon:build` 通过：37 关 schema 全绿、517/517 自动化测试通过；
- `npm run build` production 编译通过；
- 未修改任何事件的 `playerCompletionContract`、`actionText` 或事件数据，合同 hash 不受展示态影响。

同批把 R2-14 的响应事务边界补成显式 `transactionCommitted`：生成失败占位仍会触发既有结构重试；只有已经成功提交状态事务的响应才允许缺少可选模型字段，从而避免同一玩家行动被展示层重放。

## G2 纵切

选一条真实 `stage_ready` 存档，分别从主区与右栏入口抽一条路线即可；二者共用同一 store 命令，无需重复完整剧情。真机需留证：

1. 点击启程前是旧关末段；
2. 点击后无 LLM 网络请求，主阅读面立即出现目标关 opening，右栏任务与动作同属目标关；
3. 刷新重载后仍是该 opening；
4. 执行一个新关确定性动作，出站 prompt 含跨关落点约束；
5. 正文落账后 opening 展示态被消费，事件合同与进度正常推进。

## G2 结果

G2 已通过，纵切为 `lcq.stage_04 → lcq.stage_04b_lingfei_baiyi_crisis`。验收在
HEAD `8ac5eb5` 使用独立临时槽与受控、schema-valid 的 SSE 响应完成：

- 启程前主阅读面仍是旧关末段，主区存在确定性启程命令；
- 点击启程产生 0 次 LLM 请求，`modId` 切到目标关，主阅读面逐字显示目标关
  `opening.text` 与“旅途新章”徽章；右栏目标和固定动作同步属于目标关；
- `stageEntryPresentation` 正确记录 from/to、进入回合与 opening；切关前后的叙事历史和短期记忆
  逐字不变，刷新重载后 opening 仍占据主阅读面；
- 首个目标关固定动作的真实出站 prompt 含
  `【跨关落点·只演出不改真值】`、精确 opening 与“不得复演上一关收束”，该指令块不暴露内部
  stage id；
- 仅 1 次 chat-completion 请求被匹配并返回受控 SSE，0 次结构重试；响应成功提交后
  `worldTurn 1→2`，`stageEntryPresentation` 被消费，主阅读面显示新正文，输入保持可用；
- 事件动作状态只初始化一次：`contractHash=ef18441a`、`attemptCount=1`、
  `lastOutcome=success`，没有重复正文或重复落账；
- 再次刷新后 `worldTurn=2`、展示态仍不存在、合同状态与最新正文均保持，刷新产生 0 次 LLM 请求。

两段证据来自：

- `claude-2026-07-30T07-49-49-040Z-f41f50d8`：完成 1–5，外层 30 分钟超时前已留存切关、
  重载和真实 prompt；重启构建产生的 11 个 builtin 非语义漂移经逐文件审计后精确恢复；
- `claude-2026-07-30T10-44-03-549Z-a45f571e`：完成 6–8；Claude 在写最终摘要前触及
  15 分钟外层超时，但运行时、UI、网络、存档和最终重载证据均已落盘，Codex 据此生成
  `assertion-summary.json`；本次 `sourceGuardPassed=true`，最终 Git 工作树干净。

证据目录：

- `/Users/clawbot/.claude/scratch/r2-15-stage-entry-g2-rerun-8ac5eb5/`
- `/Users/clawbot/.claude/scratch/r2-15-stage-entry-g2-cont-8ac5eb5/`

临时槽与临时 Chrome profile 已清理，请求头已脱敏。R2-15 可以关闭。
