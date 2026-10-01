# 可替换模型模块框架 · 模块策划打磨稿

日期：2026-10-01。性质：**模块策划方案，Q1–Q5 已由用户裁定（2026-10-01），已实施至 READY_FOR_TRUE_DEVICE（见 §十），代码已提交 `aa3a356`**。真机测试说明：[MODULE-FRAMEWORK-TRUE-DEVICE-TEST-2026-10-01.md](MODULE-FRAMEWORK-TRUE-DEVICE-TEST-2026-10-01.md)。对象：`MODEL-REPLACEABLE-MODULE-FRAMEWORK-2026-10-01.md`（下称"原框架"）及其实现 `moduleModelRuntime.ts`／`gameModelModules.ts`／`modularTurn.ts`／`modularTurnBackground.ts`。
上游方案：`TURN-MODULE-DECOUPLING-2026-10-01.md`（十模块归位方案，下称"解耦方案"）。
标注：〔核实〕＝本稿读代码确认，附位置；〔推断〕＝未验证的判断。未跑测试、未调模型、未改代码。

---

## 〇、一句话

原框架解决了"**同一个调用换个模型不改代码**"，但还没成为"**模块**"：模块定义里只有路由和预算，没有输入、输出、写权限、失败和消费者；而这五样恰恰是策划要打磨、换模型时要验收的东西。打磨方向是把**模块卡**做成一等公民，模型只是模块卡上的一个可替换槽位。

---

## 一、现状诊断（10 条）

| # | 问题 | 证据 | 影响 |
|---|---|---|---|
| D1 | "模块"＝模型路由别名，与 usageType 一一对应 | 〔核实〕`moduleModelRuntime.ts:14-16`：narrative→main、memory→memory_summary、quality→text_optimization | 解耦方案定了十个模块，注册表只有 3 个，其中 quality 不在十模块里；职责划分与注册表脱节 |
| D2 | 换模型并不独立 | 〔核实〕框架文档 §交接："三个入口共享原有 main／memory_summary／text_optimization 的分配"；全仓 `usageType:'main'` 15 处、`memory_summary` 7 处 | 给"剧情演出"换模型 = 同时换掉意图分类、旧主流程、快路、legacy pilot；无法只对一个模块做 A/B |
| D3 | 合同不在模块里 | 〔核实〕叙事 prompt 内联在 `AIBidirectionalSystem.ts:683-686`；记忆/检查 prompt 内联在 `modularTurnBackground.ts:51-53`；叙事边界校验硬编码事件 ID `modularTurn.ts:58`（`lcq.event.sudaji_south_pact`） | 原框架说"策划可调整模块材料和预算"，实际材料和边界全在代码里，策划改不动；每多一个承重拍就要在通用文件里多一个 if |
| D4 | 依赖是装饰 | 〔核实〕`dependencies:['settlement']`／`['commit']` 指向未注册节点；文档自认"执行器本身不会自动执行任意DAG" | 依赖字段既不校验也不调度，读者会误以为有编排 |
| D5 | 执行策略写死在执行器 | 〔核实〕`moduleModelRuntime.ts:52-53`：所有模块统一 `reasoningEffort:'low'`、`should_stream:false`、`requestMaxRetries:0`、`responseMode:'text'`；三模块 `maxTokens` 全是 8192 | 前台叙事不流式＝玩家干等整段；记忆只返回 `{"sentenceIds":[0,2]}` 却给 8192；不同供应商对 reasoning 参数支持不一（RUN5-REPAIR 记录 effort=none 仍出 149 reasoning tokens），换模型时没有地方声明"这个模型怎么控推理" |
| D6 | 最慢的小调用不在框架内 | 〔核实〕意图分类在 `MainGamePanel.vue:1787-1793` 直接 `aiService.generate({usageType:'main', maxTokens:1024…})`；Run5 意图调用最长 100 秒、1024 被推理吃满 | "行动解释"是解耦方案的第一个关键路径模块，却既不能单独换快模型，也不在模块回执里 |
| D7 | 成了第五条叙事管线 | 〔核实〕`AIBidirectionalSystem.ts:985` 先试 modular 再试 fastDemo；modular 只在隔离试玩 + localStorage 开关 + 自然意图存档生效，排除机会卡/判定/拒赌/开放世界动作（`:664-666`）；规划依赖 `planLegacyNarrativePilot` | 没有声明它替代哪条旧管线；不收敛就只是叠加 |
| D8 | 遥测把模块链路记成 legacy | 〔核实〕`AIBidirectionalSystem.ts:994`：`noteTurnPath(modularResponse ? 'legacy_pilot' : 'fast')` | 交接要求"区分模块链路与原链路"，但遥测口径本身就混了；20 回合矩阵会算错分母 |
| D9 | 后台产物没有可靠下游 | 〔核实〕记忆写入 `系统.扩展.回合模块试玩.receipts`（只留 20 条，`modularTurn.ts:105`），叙事只读最近 2 条 accepted（`AIBidirectionalSystem.ts:681-682`），与主记忆体系平行；quality findings 只在试玩 HUD 展示（`XingyuehuQuestPlaytestHud.vue:82`），没有任何系统读取；新回合开始时后台结果被静默丢弃（`modularTurnBackground.ts:39` `isAIProcessing` 直接 return，状态停在 pending） | 玩家打字快，记忆就丢；检查每轮花一次模型调用，产物只给人看、不进任何流程 |
| D10 | 前台失败无兜底、通用接口带剧本名 | 〔核实〕`tryModularTurn` 抛错直接冒泡（`:696-699`），不回落旧链路；`ModelModuleInput.qingyuTurnId`（`moduleModelRuntime.ts:24`） | 一次校验不过 = 整回合失败；预算概念被命名成清羽专用 |

D1–D5 是框架形态问题，D6–D10 是接线问题。

---

## 二、模块卡：打磨后的模块定义

模块的身份由**职责合同**决定，模型只是其中一个可替换字段。建议把 `ModelModuleDefinition` 扩成下面这张卡（字段名示意，实现时按现有命名风格）：

| 字段 | 含义 | 谁定 |
|---|---|---|
| `id` / `purpose` | 模块 id，一句话职责 | 系统策划 |
| `phase` | 回合阶段（见 §三），**取代假依赖** | 系统策划 |
| `blocking` | 是否在关键路径；前台模块必须有 `foregroundBudgetMs` | 系统策划 |
| `input` | 输入切片白名单（从回合快照投影的命名切片）+ `maxInputChars` | 系统策划定切片，剧情策划定材料内容 |
| `output` | 输出 schema + `validatorId` + 证据要求（原文摘录 / ID 引用 / 无） | 系统策划 |
| `write` | `none` / `proposal:<字段白名单>` / `authority`（仅代码模块） | 系统策划，**模型模块永不为 authority** |
| `modelPolicy` | `deterministicFirst`（能不用模型就不用）、`tier`（fast / narrative / analysis）、`visibleTokens`、`reasoningBudget`、`stream`、`retries` | 系统策划 |
| `promptKey` | 指向现有提示词注册表（`getPrompt`，`prompts/defaultPrompts.ts:647`）的键，不再内联 | 剧情策划可在提示词面板改 |
| `onFail` | `retry_same_snapshot(n)` → `fallback: legacy / template / skip` + 玩家可见文案 | 系统 + 剧情 |
| `onLate` | `drop` / `apply_next_turn` / `requeue` | 系统策划 |
| `consumers` | 读取方列表。**为空不准注册**（防止 quality 式只展示不消费） | 系统策划 |
| `metrics` | 合同通过率、P95、单次成本 | 联合验收 |
| `lifecycle` | `production` / `dev`。`dev` 模块必须同时写 `retireWhen`（退场条件），发布构建中不得默认启用 | 系统策划 |

**模型能力档案**（挂在 API 配置上，而不是模块上）：`jsonMode`、`reasoningControl`（none / effort / max_tokens / unsupported）、`thinkingTagFormat`、`streaming`、`contextWindow`、实测 P50。执行器做的是 **模块策略 × 模型能力 → 请求参数** 的映射。这才是"换模型不改业务代码"真正需要的层：今天 `reasoningEffort:'low'` 写死在执行器里，等于假设所有模型都接受这个参数。

**模型分配独立化**：新增 `moduleAssignments`（模块 → 配置），未设置时显示并采用"继承：主流程"。旧 usageType 分配保留，不迁移用户数据。这样给"剧情演出"换模型不会顺带换掉意图分类。

---

## 三、阶段与预算：把 30 秒写进框架

用固定阶段代替 `dependencies` 字符串，阶段即调度顺序，预算即 SLA 分解：

| 阶段 | 模块 | 是否模型 | 前台预算（建议起点，待实测校准） |
|---|---|---|---|
| intake | 行动解释 `intent` | 按钮/确定性匹配优先，必要时 fast 档 | ≤5 s |
| settle | 状态结算 `settle` | 代码，authority | <0.5 s |
| compile | 场景材料 `compile` | 代码 | <0.5 s，产物 ≤ `maxInputChars` |
| render | 叙事 `narrative` | narrative 档，**流式** | 首字 ≤3 s，完成 ≤20 s |
| commit | 统一提交 | 代码 | <0.5 s |
| derive | `memory` / `fact_proposal` | 小模型或跳过 | 后台；须在下一回合 compile 前完成，否则按 `onLate` 处理 |

前台合计 ≤30 s。框架在每个阶段记录耗时，超出阶段预算即记失败原因——Run4/5 那种"说不清慢在哪"的问题在框架层就能回答。

`settle`、`compile`、`commit` 是代码模块，也登记进注册表（`modelPolicy` 为空）。这样依赖关系是真的，回执也是完整的。

---

## 四、打磨后的模块清单

| 模块 | 阶段 | 写权限 | 模型策略 | 失败 / 迟到 | 消费者 | 现状 → 动作 |
|---|---|---|---|---|---|---|
| `intent` 行动解释 | intake | proposal:`actionId` | fast 档；可见 ≤256 token，推理关 | 失败→澄清提示，保留输入 | settle | 在 `MainGamePanel` 外 → **首个迁入**，收益最可测 |
| `settle` 状态结算 | settle | authority | 无 | 失败→整回合不提交 | compile、commit | 现有 runtime，仅登记 |
| `compile` 场景材料 | compile | none | 无 | 超预算→按切片优先级裁剪 | narrative | 现由 `buildLegacyNarratorPrompt` 产出 → 登记并记分段大小 |
| `narrative` 演出 | render | none（纯正文） | narrative 档；可见约 1.2K token（300–600 字），推理限额，流式 | 同快照重试 1 次 → 回落旧链路（Q3 已定） | 玩家、derive | 已有 → 去掉内联 prompt 和硬编码边界 |
| `memory` 记忆整理 | derive | proposal:短期记忆 | 摘录式，可见 ≤128 token | 迟到→`apply_next_turn` | 下一回合 compile、**主记忆体系** | 已有 → 成为短期记忆来源（Q2 已定） |
| `fact_proposal` 事实/关系提案 | derive | proposal:关系/承诺/见闻白名单 | 证据跨度必填 | 迟到→下一回合 compile 前补跑，否则标 stale | commit（下一回合） | 解耦方案有，未实现 |
| `quality` 质量检查 | — | — | — | — | — | 已有，仅试玩 HUD 展示 → **并入 `audit`，移出每回合流程**（Q1 已定） |
| `audit` 后台审计 | 检查点（非回合阶段） | none | 独立 usageType，未配置回退主模型 | `drop` | 本地审计日志、反馈台账 | 新增，见 §五之二 |
| `reconcile` / `progress_audit` | derive | 既有合同 | 既有 | 既有 | 既有 | 暂不迁，后续按模块卡补登记 |

---

## 五、策划可调与不可调

**可调（改数据或提示词，不改代码）**：材料切片的选择与字数、各模块的模型档位分配、采样率、`onFail` 玩家文案、事件级叙事边界、`promptKey` 对应的提示词。

**不可调**：写权限、结算逻辑、验证器逻辑、版本/存档隔离、正典保护字段。

为此要做两处数据化：

1. **叙事边界进事件合同**：把 `modularTurn.ts:58` 和 `AIBidirectionalSystem.ts:679-680` 里苏妲己谈期限的硬编码，改成事件上的声明字段（如 `narrativeBoundary: { untilCompleted: { forbid: [...], note: '...' } }`），由通用 validator 读取。这条和"场景合同化、runtime 不认具体 ID"是同一个方向。
2. **prompt 进注册表**：三段内联 instruction 迁到 `defaultPrompts`，复用已有的提示词面板和远端覆盖机制。

---

## 五之二、后台审计 `audit`：只读影子审计员（用户裁定 2026-10-01，取代 Q1 原方案）

**裁定**：后台长期运行一个审计模型，执行整体校验；对玩家不可见，不影响游戏进程。quality 并入本模块，不再作为独立的每回合模块保留。

### 定位

- 观测层，不是游戏模块：不参与结算、不拦截、不改正文。
- 运行时的拦截仍只由确定性验证器负责；审计结论要升级为拦截，必须先沉淀为验证器（见下文"产物去处"）。

### 模块卡

| 字段 | 取值 |
|---|---|
| `id` | `audit` |
| `phase` | 独立于回合阶段，挂在检查点：切关、每 N 回合（建议 N=5）、存档导出前 |
| `blocking` | 否 |
| `write` | **none**。不写存档、flag、关系、记忆，不发任何指令 |
| `consumers` | 本地审计日志（独立存储，不进存档）；研发期并入 `PLAYTEST-FEEDBACK-LEDGER.md` |
| `onLate` / `onFail` | `drop`，失败只记日志，不重试、不提示玩家 |
| `lifecycle` | `production` |

### 审计范围（跨回合，按检查点批量）

人物事实前后矛盾、知情泄漏、正文与结算/背包不一致、替玩家行动、已抛钩子长期无承接、称谓与语域漂移。单回合内能用规则判定的问题不归它，归确定性验证器。

### API 配置

- 在 API 设置页「功能分配」中新增独立入口「后台审计」，与现有各模型入口同等：可新建/选择独立的 API 连接、**独立 API Key**、模型名。
- 实现上新增独立 usageType（如 `background_audit`），**不与 main / text_optimization 共享分配**，改审计模型不影响任何其他功能。
- **未单独配置时，回退使用主模型配置**（main 的连接、Key、模型）。HUD/日志的路由回执中标明"继承主模型"。
- 实现注意：现有 `getAPIForType`（`apiManagementStore.ts:469-480`）在没有分配时返回 null、在分配失效时回退的是 `default` 连接，而不是 main 的当前分配。审计的"回退主模型"必须显式解析 main 的分配，不能直接复用这段回退逻辑。

### 不影响游戏进程的硬约束

1. **让路**：前台有请求在途时不发起审计；审计在途时前台请求发起，立即取消审计（复用现有 `isAIProcessing` 检查与 AbortController）。回退到主模型时，这一条是防止与前台争用同一供应商并发和限流的唯一保障，必须有测试。
2. **零写入**：审计结果不进存档、不进下一回合 prompt、不被任何运行时逻辑读取。
3. **独立预算上限**：单次输入字符上限、单次输出上限、每小时调用次数上限；超限即停到下一检查点。
4. **总开关**：设置页一键关闭，关闭即不发任何请求。

### 产物去处

审计日志按类别归并后，每个反复出现的类别走向三种去处之一：
1. 能用规则判定的 → 写成确定性验证器（先以"只记录不拦截"方式运行，误杀率达标再转正）；
2. 模型理解偏差 → 修提示词或 compile 材料切片；
3. 触发问题的回合 → 存入黄金快照集，作为换模型回归用例。

### 发布默认值（Q5 已定）

- 研发/内测构建默认开启；正式版默认关闭，玩家在设置页开启时明确提示会使用其配置的 API 额度。

---

## 六、收敛路线（不再新增并行管线）

每一步单独可验收、可回滚：

| 步 | 动作 | 验收 |
|---|---|---|
| S0 | 修遥测：modular 记为独立 path（D8） | 回合遥测三类 path 可区分 |
| S1 | 模块卡 schema + 阶段替代 dependencies；代码模块登记；执行器读 `modelPolicy` | 现有 36 项框架测试改写后全绿；行为不变 |
| S2 | `intent` 迁入框架 + `moduleAssignments` 独立分配 | 意图单独配 fast 模型；同一黄金快照集 P95 下降、合同通过率不降 |
| S3 | prompt 与叙事边界数据化 | 通用文件内无事件 ID；策划改提示词无需改代码 |
| S4 | `memory` 接主记忆、迟到改 `apply_next_turn`；`quality` 并入 `audit`（§五之二） | 快速连续输入下记忆不丢 |
| S5 | modular 覆盖落地连续档的全部常规动作，正式声明它替代 `fastNarrativeDemo`（在该范围内） | 该范围内 fastDemo 调用为 0 |
| S6 | `fact_proposal` 上线 | 关系/承诺提案有证据跨度，冲突拒绝有记录 |

---

## 七、换模型的验收方法：黄金快照集

原框架的验收是"至少 20 个真实回合"，这能验证体验，但**不适合评估"这个模型能不能顶替这个模块"**：路线不同、输入不同，结果不可比，而且贵。建议为每个模块建一套离线回放集：

- **快照集**：10–15 个固定回合快照（谈期限第 1/2 步、拒赌、凝羽交谈、谢艺托付、截断高发拍等），存模块输入切片，不存 API key 与玩家隐私。
- **每次换模型**：每个快照跑 3 次，记录合同通过率、P50/P95、可见字数、推理 token（上游可报时）、成本。
- **准入线（建议）**：合同通过率 ≥95%，P95 不超过阶段预算，叙事另做盲读抽查。
- **真实 20 回合**保留为体验验收，不再兼任模型选型。

这样"换模型"变成一张可比较的表，而不是一次次真机碰运气。

---

## 八、用户裁定（2026-10-01 全部按推荐采纳）

| # | 问题 | 选项与影响 |
|---|---|---|
| Q1 | `quality` 怎么处理 | ✅ **已定（2026-10-01）**：并入只读后台审计 `audit`，独立 API 入口与 Key，未配置回退主模型；见 §五之二 |
| Q2 | 记忆由谁做主 | ✅ **已定**：modular 路径内 `memory` 产物直接成为短期记忆来源，不再维持平行记忆账 |
| Q3 | 叙事校验失败后怎么办 | ✅ **已定**：同一快照重试 1 次，再失败回落旧链路；回执记录回落原因 |
| Q4 | 模型分配是否独立于旧功能分配 | ✅ **已定**：独立 `moduleAssignments`，未设置时继承主流程；旧功能分配保留不迁移 |
| Q5 | `audit` 正式版默认开关 | ✅ **已定**：研发/内测构建默认开启；正式版默认关闭，玩家开启时说明会占用其 API 额度 |

---

## 九、本稿未覆盖

- 未测量任何模型的速度与质量；阶段预算数字是起点，需用快照集校准。
- 解耦方案中的"世界调度""人物/知识投影"两个模块本稿只作为 compile 的输入切片对待，是否需要独立模块卡待 S3 后再看。
- 未改代码、未改 `PLANNING-ROUNDS.md`、未提交。


---

## 十、实施记录（2026-10-01，Claude 模块策划，READY_FOR_TRUE_DEVICE）

### 已落地

| 项 | 文件 | 说明 |
|---|---|---|
| S0 遥测 | `utils/turnTelemetry.ts`、`AIBidirectionalSystem.ts` | 模块演出记为独立 path `modular`（原误记 `legacy_pilot`），回合埋点常显 |
| S1 模块卡 | `services/moduleModelRuntime.ts` | phase/blocking/write/consumers/lifecycle/retireWhen/promptKey/onFail/onLate/policy；注册时校验（消费者为空、前台模块不在 intake/render、dev 无退场条件、无预算均拒绝）。注册表：intent / narrative / memory / audit |
| Q4 独立分配 | `stores/apiManagementStore.ts`、`services/gameModelModules.ts` | `moduleAssignments`（未设置＝继承模块卡声明的功能）、`moduleEnabled`；单独分配的连接停用/删除时回到继承，不落到 default；酒馆端继承主流程走宿主不直连；随配置导入导出与云同步 |
| S2 行动解释迁入 | `MainGamePanel.vue` | 意图分类经 `runGameModelModule('intent')`；预算/超时/推理档由模块卡定（与原值一致：1024/10s/none） |
| S3 数据化 | `services/prompts/defaultPrompts.ts`、`scenarioMods/narrativeBoundaries.ts` | 三段模块指令进提示词注册表（新分类「回合模块提示词」，停用/清空时回落默认值）；苏妲己谈期限边界移入数据表，通用代码不含事件 ID（有测试守卫） |
| Q3 失败策略 | `modularTurn.ts::attemptModuleNarrative`、`AIBidirectionalSystem.ts` | 同快照重试 1 次，再失败回落旧链路，回执记 `fallback{reason,attempts}`，HUD 显示；取消/预算错误不重试不回落；旧链路长请求预算为 0 时保留输入报错 |
| Q2 记忆单一来源 | `modularTurnBackground.ts`、`modularTurn.ts` | 采纳的摘录替换该回合短期记忆条目（保留时间前缀，只认提交时记录的那一条）；演出读取短期记忆末 2 条（每条 ≤600 字）；迟到结果排队到下一次前台提交后落账（onLate=apply_next_turn）；前台开始不再取消记忆任务，切档/卸载仍硬取消 |
| Q1/Q5 后台审计 | `scenarioMods/backgroundAuditCore.ts`、`services/backgroundAudit.ts` | 检查点＝自上次审计 ≥5 回合或换关；单次 ≤8 回合/≤12000 字；每小时 ≤12 次；前台开始即取消（不记已审）；结果逐条验证（类别/回合范围/逐字引文）后进 localStorage 日志（≤200 条，无 Key）；零写存档、不进 prompt；首次见到存档从当前进度起算不回审历史 |
| Q5 默认值 | `webpack.config.js`、`env.d.ts` | 新构建开关 `MODULE_DEV_DEFAULTS`：开发构建审计默认开，生产构建默认关（单页生产包已核为 `{audit:!1}`） |
| 设置页 | `APIManagementPanel.vue` | 「回合模块模型」四行：每行下拉含「继承「X」」与全部连接；当前实际路由；回合记忆开关（共用记忆总结）；后台审计开关、额度提示、日志条数与导出 |
| HUD | `XingyuehuQuestPlaytestHud.vue` | 去掉质量检查；显示继承标记、回落原因、记忆是否已替换短期记忆。审计对玩家不可见 |

### 实施中做出的一项调整（需知会）

**模块演出改用独立计量口径 `module_narrative`，不占旧链路"每回合 2 次长请求"预算。** 原因：受控冒烟证明，按原口径计量时，清羽固定道具档首稿失败后预算只剩 1 次，Q3 的"重试一次"在试玩档里永远不会发生（直接回落）。该预算是为约 9 万字上下文的旧链路请求设的；模块演出上下文 ≤1 万字。调整后：演出最多 2 次精简请求 + 旧链路仍 ≤2 次长请求；回合 60 秒总截止不变；演出请求不再触发主叙事截断补救（截断按 Q3 重试处理）。

### 门禁证据

- `npm run type-check`：PASS
- 全量 `node --test --test-concurrency=1 tests/*.test.mjs`：**1133 total / 1128 pass / 5 skip / 0 fail**（新增/改写：`moduleModelRuntime` 8 项、`modularTurn` 15 项、`moduleAssignmentsAndAudit` 7 项）
- 单页生产构建（直接调 webpack 输出到临时目录，未跑会同步 builtin 的 prebuild 钩子）：PASS
- `git diff --check`：PASS
- 受控浏览器 `node scripts/smoke-module-framework.mjs http://127.0.0.1:8091/`：**PASS**，模型与存储请求全部拦截，一次性浏览器上下文。覆盖：①模块演出继承主流程、记忆采纳后替换短期记忆（`【时间】她仍等你把条件说明白`）、审计到检查点发起并写日志（无 Key、不入存档）；②审计在途时开始前台回合，审计请求被中止、未写日志、下次提交重新发起；③首稿越界→同快照重试→采纳；④两稿都越界→回落旧链路，回执记原因；⑤自然输入的意图分类请求走 intent 模块指定的模型。旧 `scripts/smoke-modular-turn.mjs` 断言的是旧行为，已在文件头标注 SUPERSEDED。

### 未测 / 待办

- **真实模型未调用**：速度、正文质量、审计发现的有效性均未验证。
- 8091 已按用户指示于 2026-10-01 重启，`MODULE_DEV_DEFAULTS` 已注入（bundle 中核为 true），研发服务上审计默认开。
- **18097** 单页服务自 8 月起按真机约定停止重建，未带新代码，未改动。
- `canon:build` 未跑（本轮未改正典数据；该命令会同步 builtin）。
- vue-tsc 对改动文件无新增错误；`MainGamePanel.vue` 与 `APIManagementPanel.vue` 中的既有 vue-tsc 报错不在本轮改动行。
- 回落旧链路后，旧链路自身的失败仍按原有方式处理（保留输入）。
- 记忆替换只作用于模块链路回合；旧链路回合的短期记忆与自动总结机制未改。
