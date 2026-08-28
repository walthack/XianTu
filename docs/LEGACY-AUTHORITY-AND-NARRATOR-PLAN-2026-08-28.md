# Legacy Authority Core 与 Narrator：合并架构与分阶段实施

> 日期：2026-08-28
> 工作目录：`/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu`
> 基线 HEAD：`1ad0578`（含 Fast 默认关、结构化判定回执、s01_01 单幕试验）
> 配置关系对照：`docs/LEGACY-LLM-GATES-API-AND-PROMPTS-2026-08-27.md`
> 真机样本：完整 Legacy 观察两轮 `/tmp/xiantu-legacy-profile-1787832246033`；单幕试验约 77 秒、639 字（质量过、速度未过）
> 范围：这是速度改造的唯一实施入口。不关闭 P0-1/P0-2，不改玩家 API，不扩 Fast，不在完整 Legacy 上零碎减 token。

## 结论先行

不要继续给完整 Legacy 抠提示词。把它拆成两层，再用前后台调度接到一起：

- **Legacy Authority Core**：本地判定、正典、知识、事件、位置、物品、关系、伤害、存档写入。门禁在这里执行，不靠每轮把全文规则塞进模型。
- **Legacy Narrator**：只读本回合编译好的 Render Packet，写 800–1000 字正文。没有命令、没有存档权。

前台只阻塞 **一次正文模型**。长期记忆整理、索引、审计、规划全部进提交后的后台队列。这不是减少门禁，是把门禁从「反复告诉模型」迁到本地执行层。

现有 s01_01 单幕试验是车辆，不是终点：已做到 text / 2048 / 无命令 / 无 embedding，仍拼接完整业务提示并整包缓冲，所以 77 秒无法归因。

## 1. 目标流水线

```
玩家行动
  → 本地判定与结算（门 1–6、9）
  → ≤50ms 读取已缓存记忆胶囊；超时只用本地 ID 召回
  → 编译 4–6KB Render Packet
  → 前台唯一一次 Narrator LLM
  → 按句安全校验并流式显示（门 7）
  → 全文终检（门 8）
  → 本地状态提交，立刻解锁输入框
       └── 后台队列：总结、增量索引、胶囊预计算、审计、下一回合预备
```

两条时间线不得混进 `processPlayerAction` 的 `await`：

| 时间线 | 可以等什么 | 不准等什么 |
|---|---|---|
| 前台（锁输入框） | 本地结算、≤50ms 胶囊、一次 Narrator、句级/全文门禁、本地提交 | embedding、建库、记忆总结、审计 LLM、事件对账、第二模型 |
| 后台（提交后） | 总结、三套索引增量、一次 query embedding、审计、规划 | 改正式剧情状态（P0-1 关闭前）；覆盖已上屏正文 |

前台唯一允许的“异步”是 token 流上的句级流水线。

## 2. 为什么不能在完整 Legacy 上减 token

配置关系已经核对：三套开关不是同一个。

| 层 | 管什么 | 减 prompt 中文能否改它 |
|---|---|---|
| 后台 API | 模型、温度、`forceJsonOutput`、功能指派 | 否 |
| 提示词管理 | 系统规则正文 | 只能略减输入 |
| 剧本 `renderGuard` | 知识/未来/人物门禁 + 整包缓冲 | 否；命中则 UI 等全文 |

完整 Legacy 真机（Fast 关、清羽隔离档、观察）：

- 输入约 134KB / 5.9 万字
- `json_object` + stream + `max_tokens=8192`（面板 20000 被代码掐到 8192）
- 首包约 3s，上屏约 62s
- 冷启动 10 次 embedding（角色 RAG 无独立开关），热回合 1 次；不是 60 秒主因
- 次级 MiniMax 对账/总结这两轮 0 次

单幕试验仍 `assembleNarrativeOnlySystemPrompt` + 正典/事件/NPC，并因 `requiresNarrativeBuffering` 整包缓冲。质量正向，速度目标未过。

## 3. 不可削减的十个门

优化前先建覆盖矩阵。原规则不能凭感觉删除；每条必须落到至少一层。删 prompt 文案不算落地。

| # | 门 | 当前主要落点 | Packet/Narrator 后的落点 |
|---|---|---|---|
| 1 | 输入来源 | 结构化选项 fresh 比对；单幕要求 `eventActionProvenance=selected` | 同左，编译前 fail closed |
| 2 | 本地判定 | `resolvePendingJudgement`、事件/机会/开放世界合同、气血回执 | Authority 先结算；Packet 只带既定结果 |
| 3 | 知识投影 | `buildScenarioStoryPrompt` 玩家已知事实 | Packet 只含本轮允许事实 |
| 4 | 空间 | runtime 位置、到达回执；移动系统仍待设计 | Packet 只投影当前所在与已有回执；禁止文本匹配补移动 |
| 5 | 正典／未来泄露 | `renderGuard.reservedFutureTerms` 等 + 返回后校验 | 禁止表进 Packet；句级/全文再拦 |
| 6 | 人物 | 在场/已揭示投影、未登场剥离 | 在场人物来自 runtime，不每轮向量搜角色表 |
| 7 | 句级输出 | 现为整包缓冲，几乎没有句级 | 完整句过门才显示，留 1–2 句跨句窗 |
| 8 | 全文终检 | `validateNarrativePerformance`，违规可再打一次 main | 终检仍做；失败本地收束，**不二次模型** |
| 9 | 状态写入 | 完整 Legacy 仍让模型出 `tavern_commands` | Narrator 无命令、无存档权 |
| 10 | 失败 | 解析失败/占位重试；辅助任务仍可能占等待 | 超时、空响应、违规 → 已审核本地收束 |

覆盖矩阵是第 0 步交付物之一：表 + 测试断言。缺层的标出，第 2 步编译时补本地。

## 4. Render Packet

新 Packet 只含：

- 玩家本轮结构化行动
- 本地既定结果
- 当前地点可见事实
- 当前在场人物及少量性格/声线锚点
- 本轮必须出现的事实 / 禁止出现的事实
- 当前身体状态
- 最近一段正文
- 用户可管理的精简 Narrator Profile
- 800–1000 字输出要求
- 已缓存记忆胶囊（2–4KB，可空）

完整业务规则不删除，而是编译：

| 原规则 | 新执行位置 |
|---|---|
| 伤害与战斗 | 本地判定引擎 |
| 物品获得 | transfer / settlement 回执 |
| 移动与位置 | 结构化移动（待设计）；此前只投影已有回执 |
| 关系终态 | 本地关系系统 |
| 事件完成 | Canon Rail / 事件合同 |
| 知识与秘密 | 玩家知识投影 |
| 正文风格 | Narrator Profile（1–2KB，提示词管理可改这一份，不是整包业务规则） |
| 输出违规 | 句级 + 全文门禁 |

体积目标：静态 Profile 1–2KB + 动态场景 2–4KB，总输入 ≤6KB。

## 5. 记忆与召回

问题不是「有没有向量」，而是检索进了前台关键路径。完整 Legacy 可能串行等待：长期记忆全量同步、query embedding、叙事 `autoIndex` 再检索、角色表 embedding。叙事 RAG 在 `buildSectionForPrompt` 里先 `ensureIndexed` 再 search。读档在 `characterStore` 也会 `await syncFromLongTermMemories`。

### 分层

- **权威事实**：事件回执、关系、承诺、物品、位置、死亡、任务结果。本地写，LLM 不得改。
- **情节索引**：eventId / locationId / actorIds / turn。
- **叙事摘要**：后台模型压缩，只读。
- **原始片段**：需要时才召回，不进前台 Packet。

### 胶囊（前台只读这个）

硬上限：3–6 条、1200–2000 中文、约 2–4KB。字段包括当前地点、在场人物、当前事件、强相关事实、承诺/物品、最近叙事。

编译时：

1. eventId
2. locationId
3. 在场 actorIds（来自 runtime，不向量搜角色表）
4. 物品 / 承诺 / 任务 ID
5. 仍不足且后台索引已就绪，才允许语义向量；前台若误入语义路径，50ms 放弃

缓存键：`eventId + locationId + actorIds + actionHash`。同一场景连续行动复用。没有胶囊 = 本轮不用语义记忆，禁止塞全部长期记忆。

冷启动第一次行动：空胶囊 + 本地 ID 必须可玩。这是验收，不是降级。

### 建库

读档后、新记忆提交后，后台只索引增量。不再每轮全量比对同步。后台失败不影响行动。自动记忆总结可继续用 `queueIsolatedMemorySummary`，但关闭「正在总结／总结成功」前台提示。

三套向量若要用：统一 Recall Broker，**一次 query vector**，本地三索引检索后合并去重。Broker 是第 1 步之后的升级，不是第 1 步本身。

## 6. 句级安全流式

不能裸流。现有整包缓冲是为了防止先画出秘密、全文才发现违规。

改为：

1. 网络继续收 token
2. 缓冲到完整句
3. 留 1–2 句处理跨句关联
4. 对完整句跑本轮允许/禁止事实
5. 合格句立即显示（`firstSafeSentenceAt`）
6. 违规句及后续停显
7. 完成后全文门禁
8. 失败追加本地自然收束，不重发模型

800–1000 字目标不变。速度 SLA 看首个安全段，不是把正文改回十几字模板。只在 text-only Narrator + Packet 上做；完整 Legacy JSON 命令流不做句级流。

## 7. 后台调度与多模型

### 优先级

- 玩家 Narrator：最高
- 同 API 地址后台：前台运行时暂停或排队
- 已运行且可取消的后台让位
- 不同 API 才允许有限并行
- embedding 必须批量，禁止冷启动串行十次
- 提交后立刻入队；若玩家已发出下一行动，同 API 让位。停手 1–2 秒只防连点，不能拖到下一回合胶囊为空
- 后台不 toast、不锁输入框

### 任务与是否阻塞正文

| 任务 | 模型类型 | 阻塞当前正文 |
|---|---|---|
| 正文渲染 | 当前质量较好的高速模型 | 是，唯一一次 |
| 记忆总结 | 便宜高速 | 否 |
| Embedding | 专用 embedding | 否 |
| 进度审计 | 小模型 | 否 |
| 事件对账 | 小模型或本地规则 | 否（P0-1 前不写正式剧情） |
| NPC 场外规划 | 小模型，预备下一回 | 否 |
| 质量分析 | 后台，只改后续策略 | 否 |

不要做：规划模型 → 正文模型 → 审核模型。

`narrative_render` 功能位：默认继承 main；可单独指定；不静默换模型；provider/temperature/streaming/重试仍受全局配置。单幕 10 次 A/B **先仍用当前 main**，过线后再加功能位，避免把缓冲问题和模型差异搅在一起。

后台返回必须带 `saveSlotId / baseRevision / inputHash / eventId / generationId`。切档、换关、revision 不一致、重复提交、改了不允许字段 → 丢弃。不准用晚到结果覆盖已上屏正文。

P0-1 仍是 `event_reconcile` 取消/合并缺口。修好前只后台化记忆缓存和 embedding，不扩大后台写正式剧情。

## 8. 明确禁止

- 删除正典、知识或状态门禁换速度
- 把 800–1000 字改回模板短句
- 先把 2048 降到 768/1024 赌首字
- 前台两阶段「正文 + 命令」
- 三个 RAG 各发一次 embedding
- 索引未完成时发送全部长期记忆
- 裸流未校验 token
- 后台覆盖已读正文
- P0-1 未关时扩大后台正式存档写入
- 在完整 Legacy JSON 路径上做句级流
- 再开第三条与 Fast/单幕并列的主路；车辆就是 s01_01 试验开关
- 文本匹配修补移动

## 9. 分阶段实行

车辆：`xiantu.legacyNarrativePilot.s01_01.v1`，默认关。Fast 保持关。每阶段只认领一刀，先验收再下一阶段。

### 阶段 0 — 埋点与门禁矩阵（零行为变化）

打在完整 Legacy 和 s01_01 试验上：

`promptBytes`、`requestStartedAt`、`responseHeadersAt`、`firstReasoningAt`、`firstContentAt`、`firstSafeSentenceAt`、`responseCompletedAt`、`retryCount`、`embeddingCountBeforeGenerate`、`recallWaitMs`、`auxWaitMsBeforeUnlock`、`backgroundStartedAfterCommit`、provider/model/maxTokens、是否 `json_object`、是否整包缓冲。

同时交出十门覆盖矩阵初表（规则 → 门编号 → 测试或代码锚点）。

完成标准：同一次 s01_01 能拆出准备、请求、首包、首内容、完成、重试、embedding 次数；77 秒不再是一锅粥。不改游戏行为。

### 阶段 1 — 前台 0 embedding

- 读档和回合请求不再 `await` 全量记忆同步 / 叙事 `autoIndex`
- `characterRag.ensureIndexed` 与检索不得出现在 `generate` 之前
- 结构化回合不发 query embedding
- 提交后后台增量索引；失败静默
- 无索引时用本地 ID/关键词，禁止全量长期记忆回退
- 记忆总结保留排队，去掉前台 toast

完成标准：正文请求发出前 embeddingCount=0；冷启动第一次行动不被建索引挡住；记忆准备 ≤50ms（超时丢语义）。不做完整 Broker。

### 阶段 2 — s01_01 Render Packet

把单幕路径从「精简但仍拼接业务/世界/事件/正典」改成编译 Packet。`assembleNarrativeOnlySystemPrompt` 的长规则改为本地执行 + Profile。Narrator 调用：`responseMode=text`、一次 chat、无命令。

完成标准：该路径输入 ≤6KB；十门在矩阵上有本地对应；自由输入/非 s01_01/Fast 开仍走原路；事件结算与气血等本地结果与现网一致。

### 阶段 3 — 按句安全流式

仅 Packet + text-only 路径。`requiresNarrativeBuffering` 改为等第一句安全。失败本地收束，不二次模型。

完成标准：不裸流、不泄密；`firstSafeSentenceAt` 可测；全文仍终检。

### 阶段 4 — 前后台调度器

把阶段 1 的切片升级成队列：优先级、同 endpoint 互斥、取消未开始任务、revision 校验。审计可入队但只写派生缓存。

完成标准：后台对前台 +0ms；开关后台不改变本回合既定事实；`isAIProcessing` 在本地提交后结束，不等总结/索引。

### 阶段 5 — 单幕 10 次 A/B（仍用当前 main）

同档、同动作、同模型 ≥10 次 `lcq.event.s01_01`：

- 正文请求 ≤6KB
- 800–1000 字目标不变
- 1 次前台 chat，0 embedding，0 第二模型
- 首个安全段 median ≤10s，P95 ≤20s
- 全文 median ≤30s，P95 ≤45s；超过 45s 本地收束
- 10/10 本地事件结果一致
- 10/10 无位置、物品、伤害、死亡、关系或未来泄露
- 人工盲评不低于 639 字样本
- 后台开/关不改变正式状态

不过线不得扩场景、不得加 `narrative_render` 功能位。

### 阶段 6 — 可选加速（过线后）

- API 管理增加 `narrative_render`，默认继承 main，不静默换模型
- 稳定前缀 + Prompt Cache（未命中不影响正确性）
- Recall Broker：一次 query 打三个本地索引
- 按草原 → 帅帐 → 五原前段扩车辆，每次扩都重跑对应门禁矩阵

### 阶段 7 — P0-1 之后

合入 abort 原子性后，才把 `event_reconcile` 等状态相关任务全面后台化。P0-2 仍是清羽→白湖发测门，不因本计划关闭。

## 10. 现有资产怎么用

| 资产 | 用法 |
|---|---|
| Fast Demo | 保持默认关，不扩、不当主路 |
| s01_01 单幕试验 | 阶段 0–5 的唯一车辆 |
| `verifyResolvedJudgementReceipt` | 门 2/9 的权威输入 |
| `queueIsolatedMemorySummary` | 后台总结入口，去掉前台提示 |
| `runBoundedAuxiliaryTask` | 不再用「超时前仍 await」挡解锁；改为提交后入队 |
| 提示词管理 | 最终只保留 Narrator Profile，不把整包业务规则每轮送给模型 |
| 后台 API 指派 | 前台仍一次 `usageType=main`（或过线后的 `narrative_render`）；总结/embedding/审计走后台位 |

## 11. 未证明 / 不得宣称

- 句级流在现网 JSON 路径上的安全性（不要试）
- 换 Narrator 模型后的质量（阶段 5 过线前不换）
- Prompt Cache 命中率
- 五原移动合同（仍待独立设计）
- P0-1 已修、P0-2 已过

**P0-1 NOT CLOSED。P0-2 NOT CLOSED。**

## 12. 阶段 0–2 落地（2026-08-28）

代码已接到工作区，未宣称真机速度过线，未关 P0。

- 阶段 0：`turnTelemetry` 打在完整 Legacy 与 s01_01 试验；十门矩阵在 `legacyGateMatrix.ts`。
- 阶段 1：前台 `generate` 前不再 `await` RAG / 全量长期记忆；读档与提交后 `scheduleBackgroundMemoryWork`；记忆总结去掉前台 toast。
- 阶段 2：s01_01 试验改走 Render Packet（≤6KB），`responseMode=text`、一次 chat、无命令。自由输入 / 非 s01_01 / Fast 开仍走原路。
- 阶段 3：Packet 文本路径按句门禁后显示，`firstSafeSentenceAt` 可测；完整 Legacy JSON 仍整包缓冲。失败本地收束，不二次模型。
- 未做：阶段 4 完整调度器、换 `narrative_render` 模型。
