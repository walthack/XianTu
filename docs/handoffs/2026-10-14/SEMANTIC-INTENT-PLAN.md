# 自由输入的语义判断：现状、方案、取舍（只读调研，未改代码）

日期 2026-10-14。依据：r5 报告（`work/playtest-2026-09-28/REPORT-2026-10-14-baihu-demo-r5.md`）、源码、`REPORT-2026-10-12-retest.md` 的逐请求耗时表。

**怎么读标记**
- 【已核实】= 读了源码或报告原文。
- 【推断】= 由证据推出，没有直接证据。
- 本次沙箱拒绝执行任何脚本，所以所有"某句话会怎样"的结论都是读代码得出，没有跑过。
- r5 的原始日志（`cb/r5/logs`）不在本机可访问处，A/B 两句的模型实际回复看不到。

---

## 1. 现状盘点

### 1.0 先说一个会改变问题形状的事实

用户设想的"每回合把当前选项交给模型，让它选最接近的一项并给把握度"**代码里已经是这个架构**，不是新东西：

- 自由输入在发出前，`MainGamePanel.vue:1976–2061` 会先调一次独立的 `intent` 模块（`naturalIntentRouter.ts:385–486`）。
- 它把当前候选（`listNaturalIntentCandidates`，:143–181）连同 `intentMatch` 短语交给模型，模型返回 `actionId`、`evidence`、`certainty`（high/low 二值）、`affinityDelta`。
- 但模型选完之后，代码又用一串**正则和短语**逐关复核（:457–475），任何一关不过就静默落到"只叙事不结算"。

所以 r5 的"不结算"不是缺语义判断，而是**模型之后的规则关卡把语义判断否决了**，或模型本身没给出可用输出（见 1.3）。

### 1.1 三个环节：哪些是模型语义，哪些靠关键词/别名/正则

#### A. 停靠点自由文本（可选拍、人物线加分拍；候选来自 `runtime.ts:1583–1617`）

`resolveNaturalIntent` 里按顺序：

| 顺序 | 位置 | 做什么 | 性质 |
|---|---|---|---|
| 1 | `naturalIntentRouter.ts:291` | 输入等于按钮原句 | 精确匹配 |
| 2 | :294 | `previewWangZheStayEnding` | 关键词（在 runtime 内） |
| 3 | :297 → `baihuGambleRefusal.ts:437–454` | 拒赌（`isExplicitRefuseGambleText` :292、`matchConflictResponse` :304） | 关键词表 |
| 4 | :307–321 | 谈期限：`三个月/三月`、`同意|答应|认下…`、`霓龙丝…产地` | 正则 |
| 5 | :399 | `练功|修炼|闭关…` 直接放行为自由 | 正则 |
| 6 | :400–403 → `runtime.ts:1535–1580` | **主线当前事件**合同动作的 `intentMatch` 短语匹配；开头问句/假设/转述用正则挡 | 短语+正则；**人物线拍被明确排除**（:401） |
| 7 | :408 → `resolveOptionalLineAlias`（:361–378，fix1，**尚未提交**，+25 行） | **非人物线**可选拍的 `intentMatch` 短语，唯一命中才结算；整句先过 `hasUnclearIntentFrame` | 短语+正则；人物线同样排除（:367） |
| 8 | `MainGamePanel.vue:1964` → `wuyuanOpenWorldSlice.ts:399–417` | 五原开放区的行旅/问题动作文本匹配 | 关键词匹配 |
| 9 | :411–440 | 模型选择候选（含好感评估、状态提案） | **模型语义** |
| 10 | :457 | `certainty !== 'high'` 丢弃 | 模型自报，二值 |
| 11 | :462 | `evidence` 必须是玩家原文逐字子串 | 结构校验，不涉语义 |
| 12 | :465–467 | `rejectIf` 短语命中则丢弃 | 短语 |
| 13 | :468–471 → `evidenceClauseIsAffirmative`（:262–275）→ `hasUnclearIntentFrame`（:107–118） | 依据所在分句不得是问句/假设/转述/否定 | **正则**，在模型之后否决模型 |
| 14 | :472 `verifyFreshSelection` | 结果必须恰好落在当前候选内 | 结构校验（这是"代码只保证落在选项内"，已存在） |
| 15 | :474–475 | 候选带 `affinityAssessment`（所有人物线拍都带）且模型没给 `affinityDelta` → 丢弃 | 结构校验 |

另有：识别失败的 `onClassifierFailure`（:83–88）——有合同候选就 hold 并提示，否则降级为自由叙事。

【已核实】`NATURAL_INTENT_TIMEOUT_MS = 10000`（:27）整个仓库只有定义没有引用，真实超时由模块卡策略决定，不是 10 秒。

#### B. 场景交锋（`sceneModule`）

| 环节 | 位置 | 性质 |
|---|---|---|
| 终局选择匹配 `matchPlayerChoice` | `scene.ts:531` | 规则 |
| 闲聊/行动分类 `classifyByRules`（`ACTION_VERBS/OBSERVE_VERBS/FRAME` 等） | `inputPolicy.ts:50–83` | 正则；与模型的 `inputClass` 合并走 `route`（:121） |
| 模型识别：清单里列出目标（id：label，推进/铺垫）、参与方、要素，模型回 goal/claim/levers | `recognize.ts:108–140`（调用在 `controller.ts` 的 `submitSceneInput`） | **模型语义**，选项来自清单 |
| 提议白名单校验 `validateProposal` + `UNCLEAR` 正则 | `plan.ts:55+`、:30 | 结构校验 + 正则 |
| `groundedProposal`：`ATTACK/NON_COMBAT/PASSIVE` 正则、真阳之血补杠杆、**fix3/fix4 的"改道"**——模型选了铺垫目标，玩家原话命中推进目标别称或点名其作用对象就改归推进目标 | `recognize.ts:31–76`、`pushGoalFor` :98–106 | 别名+正则，**覆盖模型选择** |
| 规则兜底 `recognizeByRules`（`ATTACK/PROTECT/OBSERVE/HEAVY/MEDIUM/ALL` 正则 + 别名打分） | `recognize.ts:171–219` | 正则+别名 |
| 别名数据 | 合同 JSON | 【已核实】`sceneModule/contracts` 与 `contentPacks/packs/qingyu` 下的 f*.json 共 101 处 `aliases`，336 条 |

【已核实】识别提示里要求模型返回 `certainty`（`recognize.ts:117`），但场面代码**没有任何地方读它**（只有规则兜底写入 `'low'`，也无人读）。场面已有"预览→玩家确认→掷骰"这一步（`controller.ts` 的 `a.notice='请确认预览后掷骰。'`），所以场面识别错了也不会直接落账，风险天然比停靠点低。

fix3/fix4 补别名是对症的：模型把输入归到不推进轨道的铺垫目标（"躲开骨虎和断斧"），收不了尾。但这是用字典去修"模型选项没写清哪个会推进局势"，方向就是用户不想再走的那条。

#### C. 主线动作

- 候选：`getCurrentStoryEventActions`（`runtime.ts:1423–1525`）。
- 自由文本：先 `resolveStoryEventActionFromPlayerText`（`runtime.ts:1535–1580`，作者在合同里写的 `intentMatch` 短语），非人物线命中即结算，不等模型；人物线或没命中才走 1.1-A 的模型路径。
- 四个最重的分支点是硬编码选项锁：`branchDecision.ts:28–37` 的 `LOCKED_DECISIONS`（shanghou_revealed、ningyu_enters_gamble、free_ajiman、s05b_09）。这些窗口只能点按钮发送（`branchDecisionAllowsSend`），自由文本进不来。
- `keyBeatCards.ts` 的 `KEY_BEAT_CARDS` 现在是空表（用户 10-02 裁定），不起作用。

### 1.2 同一个坑在好几处：把"她说"当子串

`naturalIntentRouter.ts:114` 的转述检测是 `(她说|他说|凝羽说|…)`，**没有锚定句首**，所以"对**她说**一句话"也会命中。同类写法还有 `inputPolicy.ts:64` 的 `FRAME`（也含 `她说`，未锚定）。`runtime.ts:1545` 是 `^` 锚定的，没有这个问题。

### 1.3 r5 三句话为什么没结算

背景（【已核实】r5 报告）：同窗口里"我走到门前敲门"（knock）、"我隔着门提起黑石滩那夜的火"（recall）自由文本**结算了**，说明模型路径本身是通的；三句失败的是文本特有的原因。三个拍都是人物线，所以 1.1-A 的第 6、7 步（短语快速通道）对它们**不适用**，全部走模型路径。

**C：「我隔着门对她说一句话：好好养伤，我会回来」**——【已核实（读代码）】确定性被挡。
- 模型选对 `act.ningyu.y6.word` 也没用：第 13 步取依据所在分句"我隔着门对她说一句话"，交给 `hasUnclearIntentFrame`。
- 该分句含"**她说**"（"对她说一句话"），命中 :114 的转述正则，判成非肯定句，返回 `non_affirmative_evidence`（:469–471）。
- Y6 的 word 候选没有 `allowInquiry`，没有豁免。
- 依据取这个分句里的任何片段都躲不开，因为判断的是整个分句。

**B：「我隔着门唤她的名字：凝羽」**——【已核实】没有被正则挡；【推断】卡在模型相关的关卡，具体哪一关看不到。
- 正则那关：分句"我隔着门唤她的名字"不含 `她说|他说|是不是|如果…` 等任何 :107–118 的模式（读代码）。
- 剩下能挡它的：
  - 模型返回 `low` 或 `none`（第 10 步）；
  - 缺 `affinityDelta`（第 15 步，Y6 所有拍都带好感评估）；
  - 依据不是原文逐字（第 11 步）；
  - 模型归到 `word` 而不是 `call`。这句话同时贴近两个候选：`word` 的短语里有"隔着门"，`call` 的有"唤她"。
- 【推断】最可疑是最后一条加缺 `affinityDelta`，但没有日志无法确认。

**A：「我在一旁看着她，看着那道红光」（L5）**——【已核实】没有被正则挡；【推断】同 B，卡在模型相关关卡。
- 这句话把 L5 的三个短语（`看着她/在一旁/红光`）全命中了，但 L5 是人物线，短语快速通道按设计排除（`lmz` 好感必须由主持模型评估）。
- L5 是"只能见证"的拍，唯一动作，模型很可能返回 `affinityDelta` 缺失或 `certainty: low`，因为"看着"没有可评估的互动；【推断】。

**为什么看不到原因**（【已核实】）：`resolveNaturalIntent` 把丢弃原因放在 `result.reason`（`low_certainty / missing_affinity_assessment / bad_evidence / non_affirmative_evidence / explicit_none / stale_or_ambiguous_candidate`），但 `MainGamePanel.vue:2020–2050` 只读 `kind/hold/notice/clarification/selection`，`reason` 没有任何地方记录。所以 r5 里"静默不结算"没有留下可查的痕迹。这是第一个要补的缺口。

---

## 2. 方案：语义选单 + 把握度分档

### 2.1 设计

保持现有"代码列选项 → 模型选 → 代码保证落在选项内"，改三件事：

1. **选单带意思**：每个候选给一句话含义，模型返回选单键（`m1`…）而不是长 id。
   - 停靠点：含义就用现成的 `playerLine`（编译自 `intent.*`，如"我隔着门对凝羽说了一句话。"）加 `label`。
   - 现有 `intentMatch` 短语**改成"示例说法"**放进提示，写明"示例，不要求原文出现"，不再被代码当匹配词。
   - 不需要新写数据。
2. **模型输出换成**：
   ```
   {"pick":"m2|none","confidence":0~1,"stance":"do|ask|hypo|report|deny","alt":"m3|none",
    "evidence":"原文片段","affinityDelta":n,"statusProposals":[]}
   ```
   - `stance` 让模型自己判断"这是玩家在做、在问、在假设、在转述还是在否定"，取代 :107–118 的正则对模型的否决。
   - `alt` 是犹豫的第二个选项（B 句同时贴近 word/call 就是典型）。
3. **代码侧判定表**（阈值在配置）：

| 条件 | 结果 |
|---|---|
| `pick=none`、不在选单内、`stance≠do` | 只叙事，不落账（现有 `free`） |
| 分档阈值达到、`alt` 为空、`stance=do`、`evidence` 是原文子串 | 结算（走现有 `matched`，`verifyFreshSelection` 把关） |
| 达到"询问"阈值但没达到结算阈值，或 `alt` 非空，或被承重档否决 | **反问确认**：高亮对应的现有按钮并提示"你是想『…』吗？确认请点按钮，输入已保留" |
| 低于"询问"阈值 | 只叙事，不落账 |

- **反问确认直接复用按钮路径**：玩家点按钮就是今天已验证能结算的路径（r5 里按钮全部成功）。不新增结算入口。UI 做法沿用 `keyBeatHighlight`（`MainGamePanel.vue:962、2064–2072`）。
- 好感：`affinityDelta` 缺失不应静默丢整个动作。**需要你定**（fix1 就留了这个问题）：对非承重拍，缺失时用该拍配置的默认权重（`lines-resources.json` 的 `affinityWeights`，数值在 `game-numbers.qingyu.json` 的 `lineBonds`）兜底，还是仍然拒绝。我倾向非承重拍兜底，承重拍不兜底。

### 2.2 能否在现有一次调用里完成：能，不加请求；不建议并进主叙事那次

**现状耗时**（【已核实】`REPORT-2026-10-12-retest.md` 逐请求表，MiniMax-M2.7-highspeed，不是 r5 那批）：

| 模块 | 请求数 | 中位耗时 | 首有效内容中位 |
|---|---:|---:|---:|
| intent | 21（2 次 30 秒超时） | **12.7 s** | 11.0 s |
| narrative | 29 | 15.5 s | 7.7 s |

- intent 是串行在叙事之前的阻塞请求，已经占每个自由输入回合近一半的等待时间。
- 完成的 19 条里，首内容之后到结束的尾巴中位只有 0.8 s（输出几十到一两百字）。耗时主要是等首个内容，不是生成。

**增量估算**【推断，按上面两列推】：

| 项 | 变化 |
|---|---|
| 请求数 | +0（并进现有 intent 调用） |
| 输入字数 | 约 ±0：含义句替代 `intentMatch` 短语列表；系统提示多约 150–250 字；返回键 `m1` 代替长 eventId，输入里 eventId 可去掉 |
| 输出字数 | +约 40–60 字（`confidence/stance/alt`），≈ +20–40 token |
| 时间 | +0.1–0.3 s/回合（按尾巴中位 0.8 s、输出约 150 字估算每 20 token 约 0.1–0.15 s） |
| 玩家侧 | 反问确认多一次点击；只发生在拿不准时 |

**不并进主叙事调用的理由**：叙事模块的定位是"把已结算的本轮行动演成正文"（`moduleModelRuntime.ts:54` 的 purpose）。结算结果要先于叙事，叙事提示里还要带固定事实与校验。并成一次就变成"正文先写、结算后判"，正是 fx-pact2 出过的"正文写'三个月，我准了'而进度没动"（`naturalIntentRouter.ts:76` 注释）。

**一个与本方案无关、但更大的省时点**：intent 的 12.7 s 是现状里最大的单项。仅当 `candidates` 为空且没有状态目录条目可识别时，可跳过该调用。我没有核实有多少回合属于这种情况，这里不展开，只记录。

### 2.3 阈值放配置

新增 `mod-kit/game-numbers.qingyu.json` 的 `intent` 段，TS 里经 `sceneModule/numbers.ts` 的 `GAME_NUMBERS` 读取（`applyGameNumbers` 要求键在默认值里存在，所以新键必须先写进该 JSON）。内容分三档：

| 档 | 谁 | 结算阈值 | 其他条件 |
|---|---|---|---|
| `button_only` | `LOCKED_DECISIONS` 的 4 个事件 | 不适用 | 自由文本不结算（现状已如此） |
| `strict` | 拍的 `role` 含 `load_bearing`，或主线合同事件 | 0.90 | `alt` 必须为空，`stance=do`，且旧 `hasUnclearIntentFrame` 作为**只降级不丢弃**的否决：命中则转"反问确认" |
| `normal` | 其余停靠点 | 0.75 | `alt` 为空，`stance=do` |

- 通用：`ask` 阈值 0.45（低于则只叙事）。
- **以上数值是占位，不是依据**：模型自报的把握度未经校准，本机没有 intent 原始输出，没有数据可定。第一步要采样（见第 3 节）。
- 档位由数据（拍的 `role`、`LOCKED_DECISIONS`、是否主线事件）决定，不由关键词决定。

### 2.4 误判风险与控制，尤其承重拍

1. **选项封闭**（已有）：`verifyFreshSelection`（:183–218）保证只能落在当前候选；`intentSaveFingerprint` 防快照变化；`AIBidirectionalSystem.ts:746` 防合同哈希不一致。
2. **按档位处理承重拍**：承重拍走 `strict`，模型犹豫就转"反问确认"而不是结算；4 个最重的分支点仍是 `button_only`。
3. **只降级不丢弃的否决**：对 `strict` 保留 `hasUnclearIntentFrame`，但先修掉"对她说"这类子串误伤（把"她说"限定为句首或"她说："形态，而不是再加特例词），命中后变成反问确认，玩家点按钮即可。
4. **分两阶段上线，先不改"能结算什么"**：
   - 阶段 1a：只把今天"静默不结算"的情形改成"反问确认"（有按钮可点），**不新增自动结算**。最坏结果是多一次点击。
   - 阶段 1b：拿到真机的 pick/confidence/stance 数据后，才打开 `normal` 档自动结算。
5. **负例集**：每个窗口写一批"问句/假设/转述/否定/相反意思/只提人名"的句子，要求 `strict` 档零误结算。用现有 `naturalIntentRouter.test.mjs` 的模拟模型方式做回归；真机再用 r5 那类输入各跑一遍。
6. **模型限制**：当前 intent 走 `reasoningEffort: 'none'` 的快速模型；它说的把握度未必可靠。若第 3 节第 0 步的日志显示失败主要是模型输出 none/low 而不是关卡否决，阈值方案帮不上忙（见第 4 节）。

### 2.5 已加的别名：保留还是撤掉

- **fix1 `resolveOptionalLineAlias`（非人物线、唯一命中）**：**保留为快速通道，但冻结**。
  - 理由：它省一次 12.7 s 的调用，15 个拍有测试。
  - 约束：只限 `normal` 档；不再扩词；整句 `hasUnclearIntentFrame` 否决保留。
  - 待阶段 1b 数据出来后，若语义路径与它一致率够高，再评估撤掉统一。
- **`runtime.ts:1535` 的主线 `intentMatch` 匹配**：本轮不动。
- **fix3/fix4 场面别名与 `recognize.ts` 改道（336 条别名，`sceneEngagementClosers.test.mjs` 覆盖 26 个目标 431 个组合）**：**保留，冻结**。
  - 撤掉会让已修的收不了尾复发，且本方案阶段 1 不涉及场面。
  - 之后新合同不要再补别名，改为给每个目标写"完成什么局面"的一句话含义放进识别提示，并读取已有的 `certainty`（见第 3 节第 3 步）。
- 总原则：**不再往字典里加条目**；已有的字典保持原样，不继续扩张。

---

## 3. 要动的文件、工作量、分步

### 3.1 要动的文件（阶段 1：停靠点）

| 文件 | 位置 | 改动 |
|---|---|---|
| `src/modules/scenarioMods/naturalIntentRouter.ts` | `buildIntentPrompt` :325–355 | 候选改为"选单键+含义"；`intentMatch` 改为示例；提示里写明"拿不准选 none" |
| 同上 | `parseIntentJson` :220–250 | 解析 `pick/confidence/stance/alt` |
| 同上 | :457–476 | 用分档判定表替换 :457–475 的逐关复核；`NaturalIntentKind`（:30–36）新增 `confirm`；`NaturalIntentResult` 带上 `reason` |
| 同上 | `hasUnclearIntentFrame` :107–118、`evidenceClauseIsAffirmative` :262–275 | 只留给 `strict` 档做降级否决；修"对她说"子串误伤 |
| `src/components/dashboard/MainGamePanel.vue` | :2020–2050 | 处理 `confirm`：高亮对应按钮、提示、保留输入；顺手记录 `intent.kind/reason`（第 0 步） |
| `mod-kit/game-numbers.qingyu.json` | 新增 `intent` 段 | 三档阈值与 `ask` 阈值 |
| `tests/naturalIntentRouter.test.mjs`（+新增负例测试文件） | — | 判定表各分支、负例集 |

### 3.2 是否必须碰 `runtime.ts` / `AIBidirectionalSystem.ts`：阶段 1 不必

- 路由器输出的 `NaturalIntentSelection` 类型不变，下游原样消费：`AIBidirectionalSystem.ts:744–746`（`lineAffinityDelta` 透传与"模块行动已失效"检查）和 `MainGamePanel.vue:2048` 都不用改。
- 含义句取自已有的 `playerLine`/`label`，不新增合同字段，所以 `contractHash` 不变。
- **如果以后要给合同动作新增独立的 `meaning` 字段**，才必须碰 `runtime.ts`：
  - :1007–1008 `stableContractHashWithoutIntentMatch` 的剔除列表要加入新字段，否则 `contractHash` 变化，旧存档报"模块行动已失效"（`AIBidirectionalSystem.ts:746`）；
  - :3362–3364 的 `intentMatch` 对账要同样处理新字段。
- 因此建议含义句放在内容包文本（`lines-texts.json` 一类）里，运行时按需拼进提示，不进合同。

### 3.3 步骤（先试哪里）

先试 **停靠点自由文本，Y6 / L5**：失败集中在这里；候选少（一个窗口通常几项）；不涉及骰子；已有按钮路径可兜底。

| 步 | 内容 | 验证 |
|---|---|---|
| 0 | 记录丢弃原因：在 `MainGamePanel.vue` 的 intent 结果处记录 `kind/reason` 和模型原始回复摘要。约 0.5 小时 | 重跑 r5 那三句，能看见 `reason` |
| 1a | 路由器改造（选单+输出格式+判定表+`confirm`+UI 高亮），**只把静默不结算变成反问确认**。约 1.5–2 天（含负例测试） | `node --test` 全绿；`tsc`；三句话各得到"结算或反问确认"，无静默丢弃 |
| 2 | 真机 r6：用第 0 步的日志统计 pick/confidence/stance/alt 分布，定阈值；同时跑负例集 | `strict` 档零误结算 |
| 1b | 打开 `normal`/`strict` 的自动结算 | 同上，外加 r5 的 L5/Y6 三句自由文本直接结算 |
| 3 | （可选，等 1b 稳定）场面：给目标补"完成什么局面"含义；读 `certainty`，低把握时在预览上显示"我理解为：…"；之后评估改道是否可退役。约 1–1.5 天 | `sceneEngagementClosers.test.mjs` 不退步 |

合计约 3–4 个开发日 + 2 轮真机。步骤 0 可以单独先做，零风险。

---

## 4. 我的判断：值得修，但要窄；以及什么时候该暂不修

**值得修的部分**：
- 已核实的确定性缺陷（C 句被"她说"子串挡掉）本身就是 bug，不依赖任何方案。
- "静默不结算且无痕迹"是流程缺口，第 0 步成本极低。
- 把"模型之后的正则否决"改成"按档位转反问确认"，既满足"不靠关键词、靠语义近似"，又不扩大误结算面。

**不建议做的**：
- 不要做成"所有环节统一重构"。现有架构已经是"选单+模型选+封闭校验"，缺的是分档、把握度、反馈，不是推倒重来。
- 不要再补别名/特例（用户也不想）。

**建议暂不修（到此为止）的条件**：
- 第 0 步日志显示 A、B 失败的主因是**模型本身**回了 `none`/low，或者小模型的把握度完全不可用（高低把握都随机），那阈值方案没有意义，也不要再追：保留按钮作为可靠路径，把 C 句的子串 bug 修掉即可。
- 若负例集里 `strict` 档做不到零误结算，则承重拍保持 `button_only`/反问确认，不开自动结算。

**需要你定的事**：
1. `affinityDelta` 缺失时，非承重拍是否用默认权重兜底（2.1）。
2. Y6 word/token 和 L5 是否按 `strict` 档（建议是）。
3. 反问确认多一次点击，是否接受。

---

## 5 行摘要

1. 用户设想的"代码给选项、模型选最接近的并给把握度"现在已是主架构（独立 intent 调用，中位 12.7 s）；r5 失败多在模型之后的正则/结构关卡，而不是缺语义判断。
2. 「对她说一句话」被 `她说` 子串正则误判为转述，必然不结算（读代码得出，未运行）；L5 与「唤她的名字」没被正则挡，卡在哪一关因 `reason` 从未记录而不明。
3. 方案：并进现有 intent 调用（+0 请求，约 +0.1–0.3 s），加 `confidence/stance/alt` 与三档阈值（配置）；先把"静默丢弃"改成"高亮按钮反问确认"，不新增自动结算；不碰 `runtime.ts`/`AIBidirectionalSystem.ts`。
4. 已加别名保留为快速通道并冻结，不再扩；场面别名与改道不动，场面放到最后一步。
5. 先做第 0 步记录丢弃原因；若日志显示是模型本身回 none/low，则只修子串 bug，其余暂不修。
