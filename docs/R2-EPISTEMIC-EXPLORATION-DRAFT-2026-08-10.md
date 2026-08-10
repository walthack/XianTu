# R2-17 · 认知探索与路径差异全局规格

> 状态：**G0 二审意见已合并；G1A 单 Stage 纵切已实现，自动门禁通过，待独立二审与真机**。
> 适用范围：三书 37 个剧情 Stage 的审计、分型与后续小批量改造。
> 首个实施纵切：`lyg.mijing_rumen` 的《阳武侯小史》流言；`lcq.stage_05 → lcq.stage_06` 保留为后续私密身份纵切。
> 关联：`RELEASE-ROADMAP.md` R2-0、R2-10、R2-11；`docs/R2-0V-XIEYI-VERTICAL-SLICE.md`；R3-5 NPC 私有知情。

---

## 0. 决策摘要

本项目不再把“忠于原著 ↔ 玩家自由”看成一根需要折中的滑杆。后续设计分别控制三件事：

1. **事实权威要硬**：世界真值、玩家知识、NPC 知识、路径选择及其后果由本地合同落账；LLM 不裁定“发生了什么”。
2. **行动表达要宽**：玩家可以调查、询问、跟踪、隐瞒、站队、换位或放弃介入，但行动只能通过世界已有的人物、地点、资源、关系与时间通道生效。
3. **认知开放要渐进**：固定正典不是探索的敌人；世界真相固定，玩家何时、从谁、以什么可信度知道，以及能否利用，才是玩法。

R2-17 只负责两类不要求改动脊柱的探索：

- **信息未知**：玩家从征兆、说法与证据中建立自己的认知。
- **路径未知**：主轴结果相同，但玩家以不同站位、立场、方法和参与身份抵达。

R2-0 的因果分歧能力继续保留，但不再作为每个 Stage 的重玩差异 KPI。R2-0V 是已经完成的 IF 引擎专项验收，不追溯修改其历史结论。

---

## 1. 全库基线与立项理由

按 2026-08-10 当前内置数据与运行时 `isCriticalStoryEvent` 口径盘点：

| 指标 | 当前值 |
|---|---:|
| 内置 Stage | 37 |
| 事件总数 | 396 |
| critical 事件 | 361（约 91%） |
| non-critical 事件 | 35 |
| 全部事件均为 critical 的 Stage | 21 |
| 声明 `initialPlayerKnowledge` 的 Stage | 2 |
| 声明 `initialNpcPrivateKnowledge` 的 Stage | 3 |
| 通过事件动作写入玩家知识的 Stage | 3（共 6 条 effect） |
| 配置世界演员机会卡的 Stage | 3（共 10 张） |

这说明正典覆盖已经很深，但玩家主动发现和选择路径的体验密度极低。全库扩展的目标不是给每一关机械加“问 NPC 得 rumor”按钮，而是：

> 每个 Stage 都被明确归类为提出疑问、提供线索、允许站位、兑现知识或承接余波中的一种或多种职责；只有确有原文证据和可玩兑现点的关卡才新增内容。

### 1.1 已有可复用地基

| 能力 | 当前状态 | R2-17 用法 |
|---|---|---|
| `playerKnowledge` | 已持久化并注入 prompt | 承载玩家已听说／已确认的命题 |
| `initialNpcPrivateKnowledge` | holder 定向注入、non-holder 隔离已通 | 限定谁能提供哪条线索或答案 |
| `outcomeEffects.playerKnowledge` | 结构化事件动作可确定性写入 | 作为唯一正常获知入口之一 |
| `eventActionStates` | 记录动作尝试与事件内 preparation | 只用于事件内步骤，不冒充跨事件路径账本 |
| 世界演员机会卡 | 有触发、追踪、过期、参与／场外生命周期 | 适合有世界时钟的介入机会，不作为所有调查的通用容器 |
| Canon Rail / 本地完成合同 | 396/396 事件完成权已收归引擎 | 确保探索内容不抢轴、不伪造 completion |
| 分歧账本 | 已支持 IF 与场外世界结果 | 只记录真正改变世界事实的分歧，不记录普通知识／站位 |

### 1.2 尚未闭合的地基

1. 当前 UI 与记录器只允许一个主线事件动作面；并行 non-critical 事件不能稳定显示、选择和结算。
2. `playerKnowledge` 缺少玩家可读 claim、来源、证据及 rumor 被确认／证伪的生命周期。
3. 没有独立的跨事件路径选择账本；`preparations` 仅在单个事件内有效。
4. 没有玩家可见认知面板，知识积累主要停留在 prompt 内部。
5. 普通自由输入仍可能绕过结构化按钮；R2-17 不把“事实权威已完全闭合”当作既成事实。

---

## 2. 范围与非目标

### 2.1 本项负责

- 全部 Stage 的探索职责审计与分型。
- 玩家认知命题的来源、状态、证据、确认、证伪与利用合同。
- 同一正典结果下的站位、立场、方法和参与身份记录。
- 与 Canon Rail 并行、可忽略、不阻塞主线的探索行动入口。
- 最小玩家认知 UI。
- 数据作者模板、validator、回归与真机验收口径。

### 2.2 本项不负责

- 不把所有 Stage 改成调查关。
- 不新增或批量扩张 IF 线；需要改变死亡、胜负或脊柱时回 R2-0／正典裁定流程。
- 不实现完整战斗状态机；战斗关只定义“站在哪里、保护谁、目击什么”的路径差异。
- 不用 LLM 自动扫描后裸灌秘密、线索或错误传闻。
- 不把关系密档 bake 进 `社交.关系`、`社交.关系矩阵` 或通用 prompt。
- 不要求熟悉原著的玩家假装失忆；玩家可提出已知猜测，但角色必须在世界内取得证据后才能合法利用。

---

## 3. 权威分层

| 层 | 回答的问题 | 权威来源 | LLM 权限 |
|---|---|---|---|
| 世界真值 | 事实到底是什么 | canon、事件本地结算、人工裁定 | 不可创造或修改 |
| 玩家认知 | 玩家角色听说／确认／排除了什么 | `playerKnowledge` 本地账本 | 只可按账本叙述 |
| NPC 认知 | 哪名 NPC 知道或相信什么 | `npcPrivateKnowledge`／NPC knowledge | 只向 holder 定向演出 |
| 公开状态 | 社会是否普遍知道 | 确定性公开／传播 effect | 不可因玩家知道而自动公开 |
| 路径记录 | 玩家以何种位置／身份／方法参与 | 新的 path receipt 本地账本 | 只可消费已落账记录 |
| 表演 | 语气、动作细节、感官与对话 | LLM | 可自由发挥，但不能新增事实 |

硬规则：

1. 玩家输入是行动提案，不是事实写入。
2. NPC 的陈述是“某人说了什么”，不自动等于世界真值。
3. 玩家知道某事实，不等于任一 NPC 知道；玩家向外披露必须是显式行动并承担后果。
4. `confirmed` 只能由声明过的确定性证据／事件 effect 产生。
5. LLM 正文、action options、模型命令和预训练记忆均不是知识升级证据。

---

## 4. Stage 探索职责分型

每个 Stage 在全库审计表中必须选择一个**主要职责**，可选一个次要职责，也可以明确为 `payoff_only`／`none_with_reason`。不要求每关播种新秘密。

| 类型 | 作用 | 典型玩家动作 | 允许的主要产出 |
|---|---|---|---|
| `seed` 铺垫 | 提出可感知但未解释的异常 | 观察、留意、记住 | clue／rumor，不给终局答案 |
| `investigate` 调查 | 从不同来源获得说法或证据 | 询问、查档、跟踪、比对 | rumor、evidence、refuted |
| `position` 站位 | 在危机中选择位置、保护对象或目击范围 | 跟随、护卫、前锋、后撤 | path receipt、局部知识、代价 |
| `allegiance` 立场 | 在不改主轴结果时选择支持、沉默或反对谁 | 公开支持、私下提醒、隐瞒 | path receipt、关系／警觉变化 |
| `route` 路径 | 选择地点、接触对象或处理顺序 | 绕路、潜入、拜访、等待 | 不同来源与机会成本 |
| `payoff` 揭晓 | 消费既有线索，确认或推翻命题 | 对质、核验、见证 | confirmed／refuted、解锁利用 |
| `aftermath` 余波 | 决定已知事实如何使用 | 告知、隐瞒、交换、公开 | public scope、NPC 行动、后续机会 |

### 4.1 分型纪律

- 高潮／揭晓关允许只消费旧线索，不得为了指标强塞新疑团。
- 旅行关的核心可以是路线和接触对象，不必有秘密。
- 战斗关的探索重点是站位、保护对象和目击范围，不把伤害结算塞进本项。
- 纯过渡关可以标记 `none_with_reason`，但必须说明相邻关如何承担认知或路径职责。
- 同一秘密可以跨多个 Stage 展开；每个 Stage 必须声明自己是 seed、evidence、payoff 还是 aftermath，避免重复揭晓。

---

## 5. 内容合同

### 5.1 一个可铺开的认知命题必须具备

| 字段 | 必需 | 说明 |
|---|---|---|
| `propositionId` | 是 | 稳定语义 ID，与一次听闻记录的 `factId` 分开 |
| `subjectId/predicate/objectId` | 是 | 与现有私有知情精确匹配；关系方向不可偷换 |
| `sensitivity` | 是 | `public / personal / secret / top_secret` |
| `canonEvidence` | 是 | 原文、axis、人物卡或人工裁定；无据不建 |
| `holders` | 条件必需 | 哪些 NPC 知道、怀疑或仅听说 |
| `revealPolicy` | 是 | 最早可出现征兆、rumor、confirmed 的事件／阶段 |
| `sources` | 是 | 玩家可从谁、何地、哪种动作取得何种质量的信息 |
| `confirmationPolicy` | 是 | 何种直接证据或哪些独立线索组合可 confirmed |
| `payoffs` | 是 | 哪些事件、行动或披露会消费它 |
| `blockedInferences` | 密档必需 | 不得由该命题顺带推出的更深秘密 |

### 5.2 玩家知识记录的目标形态

在兼容现有 `ScenarioPlayerKnowledgeFact` 的前提下，G1 设计目标为：

```ts
interface ScenarioPlayerKnowledgeFactV2 {
  factId: string;                 // 一次认知记录，append-only
  propositionId: string;          // 稳定语义命题
  subjectId: string;
  predicate: string;
  objectId?: string;
  claim: string;                  // 玩家可读，但不能包含尚未获得的深层答案
  status: 'rumor' | 'confirmed' | 'refuted';
  disclosureScope: 'player' | 'public';
  source: {
    kind: 'observed' | 'npc_statement' | 'document' | 'event' | 'deduction';
    eventId: string;
    actionId?: string;
    actorId?: string;
    label: string;
  };
  evidenceFactIds?: string[];
  supersedesFactIds?: string[];
  learnedAtTurn: number;
  resolvedAtTurn?: number;
}
```

兼容纪律：

- 旧档缺少新增字段时继续按现有 `subject/predicate/object/status` 读取，不反向猜 claim。
- rumor 与 confirmed 使用不同 `factId`；升级通过 `propositionId + supersedesFactIds`，不得依赖当前 `||=` 覆盖。
- false rumor 记录的是“某来源提出了某种说法”，不是把错误关系写成世界真值。
- `refuted` 代表玩家已有证据排除该说法，不代表所有 NPC 都停止相信。
- 敏感命题定义不得整体进入通用 prompt；只编译当前玩家已获知的最小 claim。

### 5.3 确认与证伪

- **直接确认**：玩家亲眼见证确定性事件、取得可信文书／物证，或声明为可靠 holder 的 NPC 在允许阶段明确披露。
- **交叉确认**：满足 `confirmationPolicy` 中声明的独立来源组合；同一 NPC 重复说两次不算两份证据。
- **仍为 rumor**：匿名传闻、利益相关者单方说法、推测、梦话、仅凭异常表情或玩家原著记忆。
- **证伪**：确定性证据与 rumor 冲突，写入 refuted／supersedes；不得静默删除旧认知历史。
- 一次普通“对质”不能因为按钮名强行 confirmed；必须有对方实际知情、愿意披露或其他本地证据条件。

### 5.4 利用知识

每条进入可玩层的命题至少声明一个消费点；只进图鉴、不改变任何选择的条目不计作纵切完成。

允许的消费方式：

- 解锁新的结构化行动或更低成本的既有行动。
- 识破谎言、改变谈判筹码或避免错误对象。
- 决定向谁披露，触发不同 NPC 行动、关系、警觉或公开范围。
- 改变危机场景中的站位、保护对象或撤退路线。
- 改变同一正典拍的理解和承接，但不能仅换几个称谓就宣称结构性差异。

若知识会改变 critical 结果，必须转入显式 IF／分歧流程，不得通过 `requiresKnowledge` 偷改脊柱。

---

## 6. 路径差异合同

知识账本回答“玩家知道什么”；路径账本回答“玩家怎样参与”。两者不得混用。

### 6.1 目标形态

```ts
interface ScenarioPathReceipt {
  receiptId: string;
  sourceEventId: string;
  choiceId: string;
  mutexGroupId: string;
  dimension: 'position' | 'allegiance' | 'method' | 'participation' | 'route';
  label: string;
  selectedAtTurn: number;
  consumeAtEventIds: string[];
  expiresAfterEventId?: string;
}
```

### 6.2 规则

1. 同一 `sourceEventId + mutexGroupId` 一次只能产生一个 receipt；validator 与运行时均不得靠 `dimension` 或标签猜互斥关系。
2. receipt 必须声明下游消费点；validator 拒绝永久悬空的选择。
3. 下游至少改变一项：可用动作、风险／成本、获得信息、NPC 具体行动、关系／警觉、目击范围。
4. 只改变形容词、镜头远近或一句台词，不算结构性路径差异。
5. receipt 可以在消费后保留为历史，但是否继续影响必须显式声明。
6. `eventActionStates.preparations` 仍只服务事件内步骤，不扩义成跨事件 receipt。
7. 探索产生的 `knowledge/proposition/path/mutex` ID 必须以全局 `event.id` 为命名空间；`sourceEventId` 与 `choiceId` 必须分别等于所属事件与动作。跨关账本合并遇到同 ID 一律拒绝转场，不得按展开顺序静默覆盖。

---

## 7. 行动入口与主线并行

### 7.1 为什么需要最小引擎扩展

当前 `getCurrentPlayerCompletionEvent()` 优先返回唯一 critical 锚点；不在章节 `eventIds` 的非 Rail 事件不会激活，即使手工活跃也会被清除。因此“新增一个不进章节链的非 critical 调查事件、零引擎改动”不可行。

### 7.2 G1 目标：探索行动面

新增独立于主线 completion 面的只读选择／本地记录通道，暂称 `exploration_engine`：

- 来源必须是当前章节中已激活、`critical:false` 的探索合同，或当前锚点显式声明的探索 affordance。
- UI 与主线按钮并列但明确标为“线索／站位／交涉”，不得冒充主线完成步骤。
- 选择器携带 `eventId + actionId + contractHash`；记录器按所选探索合同校验，不复用“当前唯一主线事件”猜目标。
- 探索动作可写玩家知识、path receipt、白名单关系／警觉变化和 NPC memory；不得写 critical completion 或任意世界路径。
- 玩家忽略时不阻塞主线；若世界时钟使机会失效，必须显式过期而非僵尸残留。
- 探索事件仍必须列入章节 `eventIds` 才可达；章节完成继续只统计 critical 链。

G1A 不另造一套机会卡调度器。它复用现有 `playerCompletionContract` 的动作、hash、幂等尝试与 outcome effects，只新增“显式标记的 non-critical 探索事件可与唯一主线动作并列显示”的选择器和记录入口。现有世界演员机会卡继续负责带世界时钟、追踪和场外结算的介入；普通调查不需要 agenda／actor decision／track 生命周期。若 G2 证明探索也需要复杂窗口，再评估合并，而不是 G1A 预先复制整套机会卡引擎。

### 7.3 自由输入边界

- 玩家可以自由输入调查或站位意图。
- 只有匹配当前 exploration affordance 并经过本地确认的输入，才可写知识／receipt。
- 未匹配时可获得普通叙事回应、拒绝、无结果观察或新的可选入口，但不能因 LLM 正文自报而升级知识。
- 熟悉原著的玩家可以直接提出正确猜测；在角色尚无证据时，这仍只是玩家提案，不自动产生 confirmed 或解锁机制收益。
- “读者知道、角色不知道”称为**读者元知识**，不写入 `playerKnowledge`。作者可以提供承认这种戏剧反讽的表达动作，但不得因此授予角色证据、confirmed 或机制收益。

---

## 8. 每个 Stage 的作者模板

全库审计先填表，不先改数据：

```md
### <stageId>

- 主要职责：seed / investigate / position / allegiance / route / payoff / aftermath / none_with_reason
- 次要职责：
- 本关玩家核心疑问：
- 正典不变量／脊柱：
- 可观察征兆：
- 信息源与 holder：
- rumor：
- 可确认事实与证据：
- blockedInferences：
- 路径互斥组：
- 忽略探索时如何推进：
- 近端兑现（本关）：
- 远端兑现（后续 stage/event）：
- 玩家可见代价：时间 / 关系 / 警觉 / 资源 / 失去另一路径
- 所需引擎能力：现有 / exploration_engine / knowledge_v2 / path_receipt / UI
- 原文／裁定依据：
- 风险等级：普通 / personal / secret / top_secret
- 读者元知识／戏剧反讽：无 / 可承认猜测但无机制收益 / 本关兑现
```

### 8.1 内容密度原则

- 每个 Stage 必须完成审计，但不强制新增内容。
- 有探索内容的 Stage 只选一个主要轴，避免同时堆秘密、站位、路线和阵营。
- 推荐每个近端问题提供 2–4 个质量不同的来源／路径；这只是内容预算，不是 validator 硬数值。
- 玩家必须能完全不碰可选探索并继续主线。
- 每条内容必须有命名兑现点；长线谜团可以跨关，但不能写“以后再说”而没有 event／stage 锚。
- 同一结构不得全库机械复制；三书小批量必须覆盖至少三种 Stage 类型后才能扩量。

### 8.2 代价设计

探索不应因为“玩家想了解世界”而统一受罚，但行动应有情境代价：

- 普通观察／礼貌询问：通常只有时间成本。
- 侵犯隐私、尾随、窃取、当面对质：关系、警觉或失败风险。
- 选择一个站位／来源：机会成本，即放弃同一互斥组的其他视角。
- 公开秘密：传播范围、政治风险与 holder 反应。

任何关系变化必须进入主叙事实际消费的权威关系通道；仅写进未被当前场景读取的 actor memory 不得在规格中宣称“态度已改变”。

---

## 9. 玩家认知面板（G1 必需）

没有玩家可见反馈，就不能从玩家视角验收认知探索。G1 至少提供一个小型抽屉，不要求一次重做完整关系 UI。

### 9.1 展示

- `我已确认`：confirmed。
- `我听说／我怀疑`：rumor。
- `已排除`：refuted，可折叠。
- 每条显示玩家可读 claim、来源标签、获得时间／阶段；不显示内部 ID、holder 清单、未获知答案或 blocked inference。
- 旧档或旧 V1 事实缺少 `claim` 时，显示明确标记为“旧记录”的 `subjectId · predicate · objectId` 通用标签；这只是字段展示，不反推自然语言 claim，也不补造答案。
- 同一 proposition 的升级以历史链展示，不静默覆盖旧来源。

### 9.2 安全

- 面板只读 `playerKnowledge`，绝不直接读 `npcPrivateKnowledge` 或关系密档。
- 未获知 secret/top_secret 的标题本身也不得出现，避免“？？？是小紫生母”式标题泄底。
- public 与 player-only 必须可区分，避免玩家误以为所有人都知道。

---

## 10. Validator 与自动回归

### 10.1 数据门禁

- 探索事件必须属于一个章节、可达、`critical:false`，不得携带 axis 锚。
- 探索合同不得写 critical completion、分歧账本或任意 SaveData 路径。
- proposition、source event/action、holder、subject/object 必须可解析。
- secret/top_secret 必须有 evidence、revealPolicy、blockedInferences 与 holder 边界。
- confirmed effect 不得早于 revealPolicy；提前确认必须先有 append-only 人工裁定。
- rumor 与 confirmed 不得复用会被 `||=` 卡死的 factId。
- false rumor 不得与真实私有事实使用相同“confirmed 可解锁”语义键。
- path receipt 的 source、互斥组和消费点必须可达。
- 每个新增探索内容必须有忽略路线回归。
- append-only event/fact/receipt ID 接入存档契约；旧档默认无知识／receipt 时安全。

### 10.2 权限与泄漏回归

- non-holder 不获得 claim；玩家知情后也不自动继承。
- rumor 不升级为 confirmed，不顺带推出 blocked inference。
- confirmed 只退休相应玩家／holder 正文门禁，不开放普通关系结构化写入。
- 玩家原著提示、自由输入、模型 action option 和正文自报均不能落知识。
- claim、source、path receipt JSON 往返和跨关保留稳定。
- 旧存档热更只补声明资产，不覆盖已经获得、证伪或公开的历史。
- 通用 prompt 只注入每个 `propositionId` 最新且未被 supersede 的记录；认知面板可查看完整历史链，避免 append-only 账本无限堆入模型上下文。
- 私密关联门禁仍以 `subjectId + predicate + objectId` 及 registry 别名闭包为权威；`propositionId` 只负责认知链归组，不得成为绕过既有 guard 的第二套身份匹配。

### 10.3 纵切自动断言

同一正典段至少构建以下存档：

1. 完全忽略探索。
2. 获得一条 rumor／局部线索。
3. 经合法证据 confirmed，或选择另一条 path receipt。

三槽共同断言：

- critical completion、Canon Rail 结果与脊柱一致。
- `playerKnowledge`／path receipt／后续可用行动存在确定性差异。
- 未获知槽的 prompt 与正文门禁继续拦截秘密。
- 已获知槽只开放对应最小 claim，不开放更深推论。
- 重载、跨拍、跨关后状态和可用行动一致。

---

## 11. 真机体验验收

自动化通过后才做真实模型纵切。最低验收：

- 玩家在 15 分钟内能指出一个“我想知道什么”或“我要站在哪一边”的问题。
- 玩家能说清至少一条信息来自谁／哪里，以及它目前是传闻还是确认。
- 至少一条知识或路径选择改变后续可用行动、风险、NPC 行动或目击范围；只有文案差异不算。
- 三次重玩保持同一组指定 critical 结果，但认知、路径和机会集合显著不同。
- 完全忽略探索仍可通关，世界不会因可选事件悬置而死锁。
- 熟悉原著的测试者直接说出答案时，角色没有证据就不能获得机制收益。
- `sourceGuardPassed=true`；工作树和测试存储按真机纪律恢复。

历史 R2-0V 的“结构性不同世界线”继续作为 IF 专项证据；R2-17 使用本节的新验收，不修改 R2-0V 已完成记录。

---

## 12. 推进顺序与扩量门

### G0 · 全局规格（本文件）

- [x] 建立问题模型、全库基线、Stage 分型、数据目标、作者模板与验收口径。
- [x] 合并两轮独立二审：补显式 `mutexGroupId`、旧档 claim 兜底、prompt 收敛、guard 匹配权威与读者元知识边界；G1 不再一次并行三条纵切。

### G1A · 单 Stage 最小纵切

只实施 `lyg.mijing_rumen` 的《阳武侯小史》流言：复用现有 non-critical 事件，验证并行探索动作、knowledge V2 最小字段、互斥 path receipt、认知抽屉和一次下游消费。暂不做 false rumor／refuted，不碰私密关系 guard，不新建完整机会卡调度器。

G1A 通过后再决定是否进入 G1B 私密身份纵切；不得因为一条公开流言跑通就宣称全局扩量条件满足。

### G1B · 私密身份纵切

`lcq.stage_05 = investigate`，`lcq.stage_06 = position + payoff`；验证 clue→confirmed→利用，不提前确认母女关系。只有 G1A 的并行动作、存档与 UI 合同稳定后才启动。

### G2 · 三书小批量

- 每书各选 1–2 个不同类型 Stage。
- 战斗／危机站位、地点／世界谜团和私密身份／关系至少各有一条通过后才可评估扩量。
- 只人工编写有原文／裁定证据的 proposition、source、payoff。
- 自动化、真机和独立二审无 P0/P1 后评估体验，不按数量开闸。

### G3 · 37 Stage 审计

- 全部填写作者模板并标注 `primaryRole`。
- 输出“新增／只消费／无需改造／证据不足”四区工单。
- 审计不自动改 Stage 数据，不把“已分类”表述为“已可玩”。

### G4 · 受控扩量

- 依据 G1/G2 玩家体验决定密度，不设“每关必须 N 条”指标。
- 禁止全库裸灌 rumor、秘密、站位或错误传闻。
- secret/top_secret 继续逐条走 holder、来源、别名、命令写入与 Claude 二审闭环。

---

## 13. G1A 实施纵切：`lyg.mijing_rumen`

### 13.1 选择理由

- 现有 `lyg.event.yangwuhou_rumor` 已是章节 `eventIds` 内的 non-critical 事件，不新增存档 ID。
- 裁定 #3 已明确“皇叔”是《阳武侯小史》引发的舆论附会，不是程宗扬的正典身份；不会触碰密档或创造新事实。
- Stage 内有九个承重拍，探索事件可被忽略而不阻塞主线，适合验证并行动作面。
- `s02_09` 真龙异象会放大血统舆论，天然是路径回执的下游消费点。

### 13.2 单 Stage 职责

- `primaryRole = investigate`
- `secondaryRole = position`
- 核心问题：这套“皇叔”说法从哪里来，洛都众人为什么愿意相信？
- 正典不变量：程宗扬不是因这本小史而获得真实血统；`s02_01–09` 结果不变。

### 13.3 互斥探索路径

| 路径 | 玩家知识 | path receipt | `s02_09` 消费 |
|---|---|---|---|
| 私下追问小紫 | confirmed：王蕙撰写小史，“皇叔”是街巷附会 | `method/private_trace` | 真龙异象出现时，玩家明确知道政治神话如何被加工 |
| 先听街巷传抄 | rumor：洛都正在传播血统说，但尚未核清推动者 | `method/public_listen` | 真龙异象出现时，玩家只能观察传言如何自我强化，不得先知作者 |

两条 receipt 共用 `mutexGroupId=lyg.event.yangwuhou_rumor.mutex.source_method`；所有探索产生的 knowledge/proposition/path/mutex ID 必须以所属全局事件 ID 为命名空间，跨关合并遇到同 ID 时 fail-closed，禁止静默覆盖。任一动作成功即完成该可选事件，另一条不得再选。完全忽略时主线照常推进，认知抽屉不出现该命题。

### 13.4 G1A 验收

1. 主线按钮与“探索”按钮并列，探索选择携带自身 `eventId + actionId + contractHash`，不能误结算当前 critical 锚点。
2. 三槽（忽略／私下追源／街巷听风）保持相同 `s02_*` 主轴结果，但知识、receipt 与 `s02_09` prompt 合同不同。
3. 认知抽屉显示 claim、状态与来源；旧 V1 知识显示“旧记录”字段标签，不反猜 claim。
4. JSON 重载和跨关保留稳定；LLM 不能直接写 playerKnowledge/pathReceipts。

---

## 14. 后续私密参考纵切：`lcq.stage_05 → stage_06`

本节仅作为全局规格的第一个候选实例，不代表已经批准实施。

### 14.1 正典边界

- `s05_13` 已有确定性动作 `identify_biji_in_person`，可确认碧姬的星月湖旧身份。
- 小紫／碧姬母女关系按现行密档只能在 `s06_04` 亲历对质后 confirmed。
- `s06_02` 龙神死亡、`s06_03` 谢艺结局、`s06_04` 碧姬结局均不因本纵切改变。
- 不在 `s06_02` 完成后新增 `ask_xieyi`：下一正典拍就是谢艺遭雷击与托孤，不能制造普通询问时间缝隙。

### 14.2 候选认知链

| 时点 | 可获知内容 | 最高状态 | 说明 |
|---|---|---|---|
| `s05_13` | 碧姬与星月湖旧身份链 | confirmed | 复用既有动作与谢艺线索 |
| `s06_01/02` 前后 | 小紫对碧姬存在异常针对性旧恨 | rumor／observed clue | 不推出母女关系 |
| `s06_02` | 不同站位看见小紫、乐明珠或谢艺的局部行动 | clue + path receipt | 选择一个视角即放弃另两个 |
| `s06_04` | 碧姬与小紫是母女 | confirmed | 复用既有双向玩家知识 effect |
| `s06_04` 后 | 玩家如何承接、隐瞒或向谁说明 | aftermath 候选 | 不改变碧姬死亡结果 |

### 14.3 候选路径互斥组

| 站位 | 近端差异 | 下游消费要求 |
|---|---|---|
| 跟小紫靠近龙首 | 高风险，观察她对龙脑位置的掌握 | `s06_04` 可用更接近她心理的承接行动 |
| 护住乐明珠后方 | 放弃近距离观察，获得她的信任／说法 | 后续由乐明珠提供自己的观察，但仍可能只是 rumor |
| 随谢艺处于前锋 | 更早目击雷击与伤势，承担风险 | `s06_03` 托孤可成为私下耳语／更完整交代，并写明确 receipt 消费 |

站位不能只改变正文措辞；G1 实施前必须为三条分别指定可测试的知识、行动、风险或 NPC 行为差异。

### 14.4 明确否决旧草案中的实现

- 不创建一个不进 `chapter.eventIds` 的 `s06_k1` 孤儿事件。
- 不宣称并行探索可以零引擎改动。
- 不让 `confront_biji` 单击直接提前 confirmed 母女关系。
- 不把“小紫／碧姬态度下降”写进当前场景不消费的 actor memory 后就宣称关系已改变。
- 不用同一 factId 先写 rumor 再期待现有 `||=` 自动升级 confirmed。

---

## 15. G0 拍板结果

1. **独立立项**：使用 `R2-17`；`R2-15`、`R2-16` 已被既有项目占用。
2. **不改历史验收**：R2-0V 保持原记录；R2-17 使用独立的认知／路径验收。
3. **认知面板进入 G1 必需范围**：允许最小抽屉，不推迟到“可选二期”。
4. **探索代价按情境设计**：礼貌询问不统一扣关系；侵入、对质、公开和互斥路径必须有真实代价或机会成本。
5. **全库先审计后扩量**：37 Stage 全部分类，但只有证据与兑现闭合者进入实现队列。

---

## 16. G0 独立二审记录（2026-08-10）

两轮 Claude 只读审查均无 P0。正文已合并以下冻结前意见，不再把审查附录当作第二份规格：

- path receipt 使用显式 `mutexGroupId`。
- 旧档缺 claim 时只显示字段标签，不反推自然语言答案。
- append-only 知识在 prompt 中按 proposition 收敛；私密 guard 继续以三元组与 registry 别名闭包为权威。
- G1 收缩为单 Stage G1A；战斗、地点谜团与私密身份拆到后续门。
- `lcq.stage_05 = investigate`、`lcq.stage_06 = position + payoff`，不在 stage_06 虚造普通调查时隙。
- 读者元知识作为作者横切项，不冒充角色 `playerKnowledge.confirmed`。
- false rumor／refuted 推迟到 G2；G1A 只验证 rumor 或 confirmed 的确定性获得与消费。

审查同时确认：全库计数、运行时单一主线动作面、孤儿 non-critical 事件不可达、`||=` 升级缺陷及 `lcq.stage_05→06` 正典时序均与当前代码／数据一致。
