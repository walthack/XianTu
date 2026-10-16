# NPC 设计审计：角色卡字段到底有没有被系统用上（只读，2026-10-14）

用户的判断是“根本问题是 NPC 怎么设计，不是自由输入”。本审计按这个方向，把每个角色卡字段从定义一路追到模型上下文和结算。

**怎么读标记**
- 【已核实】= 我读了源码或数据文件原文。行号取 2026-10-14 工作区。工作区有未提交改动，其中本文引用的 `AIBidirectionalSystem.ts` 相对 HEAD 有 7 行差异，`legacyNarratorPacket.ts` 有 2 行差异，行号可能漂移。
- 【推断】= 由已核实的事实推出，没有直接证据。
- 本次**没有运行任何游戏代码**，没有开 8091/8097，没有构建。我写了一个在内存里走主线的只读探针（`/tmp/npc_audit_probe.mjs`，仓库之外），想实测三位角色的实际提示内容；该命令被拒绝执行，所以**所有“进入模型的内容”都是读代码得出的，不是运行实测**。探针文件仍留在 /tmp，未执行。
- 没读的东西：`CANON-DECISIONS.md` 全文、`COMPLIANCE-REQUIREMENTS.md` 全文（只读了条目表 C01–C14、Q1–Q17 与附录标题）、各 `docs/R*` 规格正文、r5 日志。

---

## 0. 结论（一段话）

**角色卡的字段大部分是有的（性格、说话风格、底线、目标、软肋、称呼、与主角关系），但“把它们用起来”的整套机制（关系姿态、角色专属姿态档案、表演卡、亲密档案、私有知情、底线门控、承重角色保护）全部挂在 `buildScenarioStoryPrompt` → `formatFocusedCharacter` 这一条旧路径上（`storyContext.ts:515–674`）。而所有试玩存档（清羽记、南荒一二期、星月湖）被强制走“模块化”路径，这条旧路径在那里根本不会被调用**（`modularTurn.ts:44–52`、`AIBidirectionalSystem.ts:720、1221、1239、1257–1259`）。模块化路径里，每个在场 NPC 只带一张小卡：名字/称呼、最多 3 条性格短语、说话风格、外貌首句、种族、身份、性别代词（`legacyNarratorPacket.ts:194–241`）。**没有好感度，没有关系阶段，没有记忆，没有私有知情，没有底线，没有喜好厌恶，也没有“这个人遇到 X 会怎么反应”。**

另外两个更底层的缺口，不管走哪条路径都成立：
1. 角色卡里**根本没有**“喜好/厌恶”“价值观”“气质”“边界”这几类结构化字段（v3 卡全文搜索 `喜好`=0、`价值观`=0、`likes/dislikes`=0；`principles` 是最接近“价值观/底线”的散文列表）。
2. 好感只有“被事先写好的停靠点”才会改（行动权重表），自由行动对好感、记忆、伤势没有任何写入通路；“触犯人格底线好感暴跌”只存在于注释和常量里，没有检测代码。

---

## A. 盘点：NPC 由什么组成，每回合实际进模型多少

### A1. 先说哪条路径是“活的”

| 存档类型 | 回合怎么出正文 | 用到 `storyContext.formatFocusedCharacter`？ | 证据 |
|---|---|---|---|
| 试玩存档（清羽记开局、南荒一/二期、星月湖落地：`isScopedPlaytestSave`） | **只能走模块化**（`tryModularTurn`）；旧链路被 `assertDemoModulePath` 直接禁止 | **否** | `playtestNarrativeScope.ts:30`；`modularTurn.ts:44–52`；`AIBidirectionalSystem.ts:720、1221、1239、1257–1259`；`compileLegacyNarratorPacket(sceneSave, plan, '', '', '', …)` 传入的 `storyPrompt` 是空串（`AIBidirectionalSystem.ts:787`） |
| “六朝世界试玩”（`世界.状态`扩展键 `六朝世界试玩`，不在内容包试玩表里）及非试玩存档 | 快速演示或旧链路 | **是**（但这些分支被标注 `@deprecated LEGACY`，2026-10-02 用户决定模块化稳定后删除） | `worldSimulationPlaytest.ts:63、85`；`AIBidirectionalSystem.ts:1306–1307、1415` |

所以“系统有没有用到某字段”要分两问：模块化路径（M，试玩实际在跑的）和旧路径（L）。本文所有表格都分开写。

### A2. 模块化路径（M）里一个 NPC 的完整“演员卡”

字段全集就是 `LegacyPresentActor`（`legacyNarratorPacket.ts:49–65`），由 `readPresentActors`（`:194–241`）填写：

| 演员卡字段 | 来源 | 限额 | 行 |
|---|---|---|---|
| `characterId / entityType` | 画像 id | — | :223–224 |
| `name / panelName / selfReportedName / displayKind / 主角心称` | 称呼台账 `entity-ledger/overrides.json` 的 `naming`（按章号取档） | — | :225–229 |
| `traits` | `profile.personality`，每条截 24 字，丢弃命中 `PERSONALITY_LEAK_RE` 的条目，**只取前 3 条**；超预算压缩后只剩 2 条 | ≤3（压缩后 ≤2） | :35、:210–213；`:580` |
| `speechStyle` | `profile.speechStyle`（**只读 profile，不读注册表**），同样经 `PERSONALITY_LEAK_RE` | 压缩后 ≤100 字 | :214–216、:236；`:582` |
| `role` | `matched.role` | ≤80 字 | :231 |
| `race` | `profile.race` | ≤40 字 | :232 |
| `appearance` | `profile.appearance` 首句，并用正则抹掉部分身体部位词 | ≤90 字（压缩路径 120） | :233；`:581` |
| `gender / pronoun` | 卡 + 一张写死的名字→性别正则 | — | :220、:234 |
| `称呼.对主角 / 主角对他` | 台账 `npcAddress` → 写死的 `addresses` 小表 → `【称呼】`备注 → “你” | ≤70 字 | :221、:235 |

演员人数上限：普通关卡 **3 人**，南荒 03b/04/04b/05b 四关 **18 人**（`:238`）。整个场景材料软预算 10000 字符，只告警不拦截（`AIBidirectionalSystem.ts:869`；`legacyNarratorPacket.ts:561–590`）。每个演员估计 250–400 字符【推断：按字段限额相加，未运行】。

此外 M 路径每回合与 NPC 相关的内容只有：`present` 名单、`mustAppear`、`absentCast`（已故/离场/未登场名单）、“必须实际在场”名单、称呼约束与声线时序守卫（`AIBidirectionalSystem.ts:827、846–847、858、895–896`），和最近 2 条短期记忆摘录（`:824`）。

**M 路径里没有的东西**（对 `legacyNarratorPacket.ts` 与 `AIBidirectionalSystem.ts:716–951` 搜索 `好感|affinity|stanceOf|formatRelation|privateKnowledge|npcPrivate|npcDecision`，无相关命中（`AIBidirectionalSystem.ts` 范围内只有 `instanceof` 等无关子串）【已核实】）：好感度、关系标签、关系姿态、`notes` 备注（【底线】【目标】【软肋】【关系】…）、NPC 个人记忆 `记忆[]`、私有知情、亲密档案、表演卡、承重角色保护、`当前内心想法`。

**自由输入的一个额外缺口**【已核实，读代码】：自由输入且没有“当前事件动作”候选时，`candidates[0]` 为空，`capsule=null`，场景里 `present: []`、`presentActors: []`（`AIBidirectionalSystem.ts:794–795、809–812`）。候选为空是正常情况（`runtime.ts:1423–1440、1583–1590` 多处 `return []`）。此时模型**一个 NPC 卡也拿不到**，只有 `action: userMessage` 和一句“交谈/自由输入不代表完成事件”。

### A3. 旧路径（L）里一个 NPC 的聚焦卡

`formatFocusedCharacter`（`storyContext.ts:515–674`）每个聚焦角色最多约 12 行；聚焦人数：活跃事件关联 + 开场 `featured` 最多 8 人，加上按名字召回总计最多 12 人（`:698–715`）。另外 `buildNarrativePromptState` 会把**整个 `社交.关系`** 作为状态 JSON 发出去，没有按在场过滤（`narrativePromptState.ts` 的 `社交.关系: source.社交?.关系`），随遇见的 NPC 数增长【已核实代码；增长量未实测】。

### A4. 逐字段追踪总表（本审计核心）

归类：**①端到端已使用**（定义→有代码读→进模型）/ **②已加载但从未发给模型** / **③已定义但从未读取** / **④缺失**。“进模型”列分写 M 与 L；“结算”列指是否影响好感、反应、伤势等任何结算。

数据底座：权威卡 `character-cards-v3.json`（322 卡）→ 运行时副本 `builtins/character-registry.json`（322 卡，字段同）→ `characterResolver.resolveOne`（`:326–376`）在物化时写进各关 `canon.characters[].profile`（含 `notes` 里的【标签】行，`buildNotes` `:165–262`）→ `relationships.createNpcProfile`（`:158–221`）生成存档里的 `社交.关系[id]` 记录。

| 字段（卡 → 运行时） | 非空数（/322） | 谁读 | 进模型 M | 进模型 L | 结算 | 归类 |
|---|---|---|---|---|---|---|
| `personality[]` → `profile.personality` / `性格特征` | 261 | `characterResolver.ts:353–354`；`relationships.ts:180` | 前 3 条（`:210–213`） | 前 4 条（`storyContext.ts:557–558`） | 无（仅有一条 `智商|谋士…` 正则触发“必须先给方案”的指令，`:559–566`） | ①（M 受限） |
| `speechStyle` → `profile.speechStyle` | 227 | M：`legacyNarratorPacket.ts:214`；L：注册表直读 `characterResolver.ts:422–425` → `storyContext.ts:567–568` | 仅当 stage 画像里写了才有（见 A5：乐明珠无） | 有（直读注册表，不受画像缺失影响） | 无 | ①（M 对部分角色断供） |
| `principles[]`（≈价值观/底线）→ `【底线】`备注 + `社交.关系.人格底线` | 261 | `buildNotes` `characterResolver.ts:220`；`projectBottomLinesToNpcs` `runtime.ts:3444–3463`（好感≥40 或“自己人”标签才投影） | **否** | 备注经好感门控后发（`storyContext.ts:581–596`）；`人格底线`字段随 `社交.关系` 状态 JSON 发 | **无**。常量 `AFFINITY_LIMITS.bottomLineBreach/majorEvent` 全仓无读取者（`affinityLadder.ts:80、82`），没有“触犯底线”检测 | M：②；L：①；结算：③ |
| `goals[]` → `【目标】` | 228 | `characterResolver.ts:221` | 否 | 备注发出（L） | 无 | M：② |
| `weaknesses[]` → `【软肋】` | 208 | `characterResolver.ts:222` | 否 | 同上 | 无 | M：② |
| `relationToProtagonist[]` → `【关系】` | 259 | `characterResolver.ts:212–217`（南荒关只取 stage 画像覆盖值） | 否 | 同上 | 无（真正的关系标签`与玩家关系`来自关系边，不来自卡） | M：② |
| `formsOfAddress[]` + 台账 `naming` | 236 / 台账 22 实体 | `readPresentActors :235`；`projectNamingPacket`；守卫 `AIBidirectionalSystem.ts:858、895–896` | **有，且有产出侧守卫** | 有（备注 + 台账） | 间接：守卫会拒稿 | ① |
| `appearance` | — | `legacyNarratorPacket.ts:233`；`storyContext.ts:576` | 首句 | 全句 | 无 | ① |
| `identitySummary` / `role` / `description` | — | `:231`；`storyContext.ts:538–540` | role ≤80 | 有 | 无 | ① |
| `signatureAbilities[]` → `【绝技】` | 160 | `characterResolver.ts:223` | 否 | 备注 | 无 | M：② |
| `joining / keyEvents / ending` → `【入伙】【情节】【结局】` | 47 / 297 / 80 | `characterResolver.ts:224–226`（南荒关一律不回落静态卡，`:212–216`） | 否 | 备注（非南荒） | 无；`joining` 的语义被 `affinityCaps.ts` 手抄成 14 条上限表，未读卡字段 | M：② |
| `crossStageMemories[]` → `【历程】` | 26 | `characterResolver.ts:199–203` | 否 | 备注 | 无 | M：② |
| `phaseIdentities[].forbidden` → `【本阶段禁用】` / `关系身份门禁` | 120 个阶段 | `characterResolver.ts:232、237、246` | **否** | 备注 | 无 | M：② |
| `level` / `levelSource` | 卡里全为 null | 真值在 `mod-kit/entity-catalog/character-levels.qingyu.json`，`characterLevels.ts:7–11` | 否 | 否 | **仅场面战斗**：`sceneModule/host/factors.ts:80`；自由攻击未接 | ①（只对场面战斗） |
| `race / gender / pronoun` | — | `:220、232、234` | 有 | 有 | 无 | ① |
| `presenceWindow`（6 张卡） | 6 | `presence.ts:171` → 离场名单 | 间接（`absentCast`） | 同 | 无 | ① |
| `embedText`（RAG） | 322 | `characterRagService` | 否 | 旧链路前台召回 `characterRagSection`（`AIBidirectionalSystem.ts:1328`） | 无 | M：② |
| `privateProfile` | 运行时副本 0；v3 源卡 1 张（小紫） | 无任何读取（`src` 全搜无命中） | 否 | 否 | 否 | ③ |
| `review.humanNotes` | — | 刻意排除（`characterResolver.ts:250` 注释） | 否 | 否 | 否 | 设计如此 |
| **喜好 / 厌恶** | — | — | — | — | — | **④**（卡、注册表、类型均无字段） |
| **价值观**（结构化） | — | 只有 `principles` 散文 | — | — | — | **④** |
| **气质 / 反应倾向类型** | — | `personality` 是自由短语列表，无枚举 | — | — | — | **④** |
| **边界**（结构化、带阶段窗口） | — | 仅 `intimacyProfiles` 16 人的 `hardLimits` 文字，和 `phaseIdentities.forbidden` 文字 | — | 条件触发 | 无 | **④**（只有散文） |
| 存档记录 `社交.关系[id].记忆[]` | 每 NPC ≤12 条 | 写：`runtime.ts:4121`、`relationships.ts:213`；读：只有 UI 与 L 的状态 JSON | **否** | 随 `社交.关系` 发 | 无 | M：② |
| 存档记录 `先天六司`（NPC 魅力/心性等） | 默认 5 | `relationships.ts:188–195`；判定只读**玩家**的 `角色.身份.先天六司`（`judgementPreflight.ts:61、156`） | 否 | 随状态 JSON | **无**（NPC 属性不进社交判定） | M：②；结算：③ |
| 存档记录 `当前内心想法` | — | L 里要求模型每回合写（`AIBidirectionalSystem.ts:420–432`） | 否 | 是 | 无 | M：② |
| `npcPrivateKnowledge`（私有知情） | 账本 | 写：`runtime.ts:1257、4102`；读：`storyContext.ts:474–509、601–619` | **否** | 是（逐人行为提示 + 隔离守卫） | 无 | M：② |
| `stanceStates`（好感→三档姿态滞回） | 每 NPC 一条 | 写：`runtime.ts:3546–3562、3845`；读：`storyContext.ts:644` | **否** | 是 | 无 | M：② |

### A5. 三位角色的具体样子

选 乐明珠、凝羽、小紫（后者是代码里“配套最全”的一个，用来看上限）。

**乐明珠**（`liuchao.character.le_mingzhu`）
| 项 | 事实 |
|---|---|
| 卡里有 | 7 条性格、说话风格、3 条底线（师门宝物/护短/讨公道）、目标、软肋、关系、称呼（大笨瓜/老公…）【已核实：`character-registry.json`】 |
| 南荒各关怎么投影 | 03b、04：`profile` 只有 `appearance` 与 `origin`，**性格为空**；04b、05b：性格 7 条（`lcq.stage_0X` 内置数据）；05：只有 `origin`。**任何 lcq 关的 `profile` 都没有 `speechStyle`**【已核实：遍历 `builtins/data/lcq.stage_*.json`】 |
| 为什么底线/目标/软肋缺 | 南荒关（章 37–124，`isSouthernStage`，`ledger/naming.ts:89`）里，凡是 stage 画像显式带了该键但值为空，就不回落静态卡（`characterResolver.ts:143–149`）；乐明珠 03b/04/04b/05b 画像的 `principles/goals/weaknesses` 都是“带键空值”【已核实：注册表画像】 |
| 进模型（M） | 03b/04：演员卡只有名字、称呼、角色身份、外貌首句，**0 条性格，无说话风格**；04b/05b：前 3 条性格（娇憨可爱 / 小市侩小财迷 / 遇大风浪会怕会尖叫）。“大是大非有小女子的坚韧”“纯真无算计”等被 `slice(0,3)` 截掉【推断：按截断逻辑，未运行】 |
| 代码里另有但 M 不发 | `STANCE_PROFILES` 有她（本色锚 + 高/低档形态，`stanceProfiles.ts:139–154`）；`INTIMACY_PROFILES` 有她（`intimacyProfiles.ts:~109–128`）。两者只在 `formatFocusedCharacter` 里用 |
| 好感怎么变 | 只有 L1–L5 停靠点的权重（`lines-lemingzhu.json` → `lines-resources.json affinityWeights` → `game-numbers.qingyu.json lineBonds.lemingzhu`），经 `runtime.ts:4108–4113`；加上共历事件 +3/+8（`runtime.ts:3692–3713`）。不在 `AFFINITY_CAPS` 里 |
| “主动分” | 只由停靠点选择折算（`questLines.ts:119`）；自由文本不进分 |

**凝羽**（`liuchao.character.ning_yu`）
| 项 | 事实 |
|---|---|
| 卡里有 | 3 条性格、说话风格、3 条底线（不轻易表露情感/保护同伴优先/忠于自己的选择）、软肋、称呼；`goals` 为空 |
| 进模型（M） | stage_02、03b、04、04b：3 条性格 + 说话风格；**stage_01 画像没有 `speechStyle`**；底线三条在南荒关被“带键空值”挡掉 |
| 代码里另有但 M 不发 | `STANCE_PROFILES` 专属姿态（高好感：“仍然口是心非、语言不会变软、更不会示爱”，低好感：“更冷更短”，`stanceProfiles.ts:79–92`）；`INTIMACY_PROFILES`（`intimacyProfiles.ts:~89–108`） |
| 战斗境界 | `character-levels.qingyu.json` 有 第 30–45 章 = 4 级（原文明写）；只在场面战斗合同里被读 |

**小紫**（`liuchao.character.xiao_zi`）
| 项 | 事实 |
|---|---|
| 卡里有 | 3 条性格、说话风格（“程头儿”）、`principles/goals/weaknesses` **全空**；`relationToProtagonist` 很长；v3 源卡另有 `privateProfile`（含底线/目标），但运行时副本没有这一项，`src` 无任何读取 |
| 04b | 性格被 `resolveOne` 硬替换成一条表面性格（`characterResolver.ts:362`）；`profile` 无 `speechStyle` |
| 代码里另有但 M 不发 | 表演卡 `voiceCards.ts:12–37`（仅小紫、贾文和两人）、姿态档案、亲密档案；这是全库唯一同时挂了表演卡 + 姿态 + 亲密三层的角色 |

小结：**同样是主要角色，M 路径下三人收到的信息量差不多（几条短语），而三层精心写的“反应形状”都没有出现在模型面前。**

### A6. 其他系统逐项盘点

| 项 | 现状 | 进模型（每回合） | 证据 | 归类 |
|---|---|---|---|---|
| **好感系统** | 八档阶梯 + 三档姿态 + 滞回；单回合 ±15；事件共历 +3/+8；上限表 14 人；停靠点权重 | M：**0**。L：姿态 5 行 + 角色专属条款 + 上限一行 | `affinityLadder.ts:35–60、76–83、169–189`；`affinityCaps.ts:40–122`；`runtime.ts:3692–3713、4106–4113` | 引擎侧①；M 展示②；对“自由行动”的写入通路④ |
| **主动分** | 乐明珠线 L4 折算停靠点选择，分数线 8，满分 14 | 否（只写状态） | `questLines.ts:119`；`BAIHU-NINGYU-LMZ-DEMO-DELIVERY.md §9` | ① 但**只覆盖已写好的停靠点** |
| **双层记忆** | ①NPC 个人 `记忆[]`（≤12）；②玩家知情/NPC 私有知情账本 | M：0（只有最近 2 条短期叙事摘录）。L：有 | `runtime.ts:4121、1257`；`storyContext.ts:474–509、601–619` | M：② |
| **称呼台账** | 22 个实体的按章分档 + 守卫 | M、L 都有，且有产出侧拒稿 | `entity-ledger/overrides.json`；`ledger/naming.ts:7–38`；`AIBidirectionalSystem.ts:858、895–896` | ①（唯一做到“数据→提示→产出校验”闭环的 NPC 数据） |
| **在场/登场/退场** | `computePresentNames`（事件/开场/位置）+ `departedPresentNames`（`sceneLedger.actors` + 写死的事件→名单） | M、L 都有；M 是 `absentCast` + 必须在场 | `presence.ts:72、227、281`；`legacyNarratorPacket.ts:154–186`；`AIBidirectionalSystem.ts:827、846–847、888` | ①；其中“某事件完成后谁离场”写死在 TS（`presence.ts:216–219`） |
| **阶段限制**（某节点前不可发生实质关系） | ①卡画像按关投影；②`关系身份门禁`备注；③`relationshipEvolutionLine`；④14 人好感上限表 | M：**无**。L：备注 + 一段通用句 | `characterResolver.ts:232、237、246`；`storyContext.ts:1118`；`affinityCaps.ts` | M：④。乐明珠、凝羽都不在上限表里 |
| **必须存活保护** | L：`承重角色保护`一行，名单取自“未完成关键事件的关联角色”；命令层 #18 按名字 + 死亡词表拦截。**没有台账数据** | M：无；但 M 里模型不能写命令（`tavern_commands:[]`，`AIBidirectionalSystem.ts:930、936、943`），正文写死只靠 `absentCast`/守卫 | `storyContext.ts:1132–1147`；`canonGuard.ts:471–505`；`overrides.json` 无此类字段 | 数据④；L 机制部分① |
| **战斗境界** | `levelFact(id, 章)` 表 + 场面模块读 | 否 | `characterLevels.ts:7–11`；`sceneModule/host/factors.ts:80` | ① 仅场面战斗；自由攻击④ |
| **社交属性** | 判定只读玩家六司 + 配置权重；NPC 六司无人读 | 否 | `judgementPreflight.ts:61、156`；`game-numbers.qingyu.json weights.social` | NPC 侧③ |
| **NPC 决策核心** | 效用打分（性格向量/动机/关系/记忆）；只作用于带 `worldActor` 合同的锚点事件（世界局势） | 通过“世界演员合同”文字进模型（L） | `npcDecisionCore.ts:1–60`；`runtime.ts:795–830`；`storyContext.ts:353–411` | ① 但不是“NPC 对玩家行为的反应” |

---

## B. 目标对照：NPC 对玩家任何行为都按性格、好感、关系阶段、记忆和原著约束作出反应

评级：**已满足 / 部分满足 / 缺失**。默认评的是试玩实际在跑的 M 路径；括号里写 L。

### B1. 总体维度

| 维度 | 评级 | 依据 |
|---|---|---|
| 性格（决定反应形状） | **部分满足** | M 只给 ≤3 条短语（`legacyNarratorPacket.ts:211–213`），无“反应倾向”数据；L 有 49 人的专属姿态（`stanceProfiles.ts:52、695`），但是写在 TS 里、按显示名数组匹配、不在台账 |
| 好感（决定反应强度） | **缺失**（L：部分） | M 演员卡无好感字段；L 有三档姿态与五维指引（`relationStance.ts:23–80`，`storyContext.ts:638–649`） |
| 关系阶段/节点限制 | **缺失**（L：部分） | M 无；L 只有备注和一段通用句（`storyContext.ts:1118`）。乐明珠、凝羽无好感上限条目（`affinityCaps.ts:40–122`） |
| 记忆（NPC 记得发生过什么） | **缺失**（L：部分） | 写入有（`runtime.ts:4121`，≤12 条），M 不读，L 随状态 JSON 发 |
| 原著约束 | **部分满足** | 称呼、在场、已故名单是①；底线、阶段身份、私有知情在 M 都不在场 |
| 反应结果落账（好感/记忆/伤势/离场） | **缺失** | 自由输入无写入通路：`naturalIntentRouter.ts:381–382`“拿不准：照常让 NPC 回应，但不结算任何候选，也不回落关键词判定”；`MainGamePanel.vue:2020、2101` 据此跳过判定 |
| 行为识别（把“嘲讽/亲吻/求欢”读成结构化类别） | **缺失** | 路由器只匹配当前停顿点的候选，靠 `matchAny/matchAll/rejectIf` 短语表（`naturalIntentRouter.ts:364–376`）；旧判定预检是关键词表（`judgementPreflight.ts:26`）；亲密场景判定是 `INTIMATE_SCENE_RE` 关键词（`intimacyProfiles.ts:42`），且只有 L 用 |

### B2. 四类行为逐项

| 行为 | 识别 | 按性格 | 按好感 | 按关系阶段 | 按记忆 | 原著约束 | 后果落账 |
|---|---|---|---|---|---|---|---|
| **攻击** | 缺失（v2 计划已确认；自由输入无攻击路由） | 部分：全靠模型凭 3 条短语即兴 | 缺失 | 缺失 | 缺失 | 部分：M 模型不能写死亡命令，但正文仍可写死；承重名单 L 才有，且来自事件关联而非台账 | 缺失；境界差只有场面战斗在用 |
| **嘲讽** | 缺失（判定预检的`威胁`类仅关键词，自由路径被跳过） | 部分（同上） | 缺失；唯一的先例是乐明珠 L2 停靠点里作者写死的 −3（`lines-resources.json aff.w.lmz.tease_penalty`，`game-numbers.qingyu.json:286`） | 缺失 | 缺失 | — | 缺失 |
| **亲吻** | M 缺失；L 靠关键词门控注入亲密档案（`intimacyProfiles.ts:42、405–411`） | M 缺失；L 仅 16 人有档案 | M 缺失；L 档案按 20/60/80 分层揭示（`intimacyProfiles.ts:31–36`） | M 缺失 | 缺失 | M 缺失；L：`hardLimits` 文字（如凝羽“任何状态下不口头承认爱意”） | 缺失 |
| **调情/求欢邀请** | 同上 | 同上 | 同上 | 缺失：没有“某节点前不可”的结构化数据；`mutualCultivationConsent` 只对含`双修|采补`的动作文本做关键词同意判断（`judgementEngine.ts:469`） | 缺失 | 同上 | 缺失 |

### B3. 已满足的部分（别拆掉）

- 好感数据层：八档、三档姿态、滞回、单回合上限、命令层拒绝 `set`、上限削减（`affinityLadder.ts:35–83、169–189、217–278`；`affinityCaps.ts`）。
- 作者写好的停靠点反应：权重 + 记忆模板 + 状态 + 回执，经 `settleOptionalLine`（`runtime.ts:4090–4125`）。
- 称呼台账闭环、在场/离场闭环。
- “反应形状”的**内容**已有人工写好：49 个姿态档案、16 个亲密档案、2 张表演卡。缺的是**数据化 + 接进 M 路径**，不是重写。

---

## C. 最小 NPC 模型

### C1. 设计原则

1. **把已经写好的东西搬出 TS，变成按 id 的数据**。姿态档案、亲密档案的 `hardLimits`、表演卡声线，都是“角色数据”，现在用显示名数组硬编码在 `.ts` 里。
2. **不增加关键词机制**。行为类别由模型“读”出来，是枚举 id（`tag`），代码只做枚举查表；反例是现有的 `INTIMATE_SCENE_RE`、`PERSONALITY_LEAK_RE`，新方案不依赖也不扩展它们。
3. **代码结算“发生了什么”，模型只写“怎么演”**（与项目既有原则一致：`reputationLedger.ts` 头注释）。
4. **阈值进 config，限制进台账，文本进内容包**。
5. **每回合有界**：只取“被作用的 NPC + 在场且相关的 NPC”，全按 id 查表，没有随游玩增长的项。

### C2. 每角色数据字段（台账，按 id）

建议新文件 `mod-kit/entity-ledger/npc-profiles.json`（与 `overrides.json` 同目录同风格；备选见开放问题 O1）。每个条目：

```jsonc
{
  "id": "liuchao.character.le_mingzhu",
  "temperament": "tmp.open_naive",                // config.npc.temperaments 里的枚举 id：给“缺省反应形状”
  "values":   ["val.shimen_treasure", "val.defend_companion"],   // config.npc.values 里的 id；散文原文留在 textId
  "likes":    ["tag.gift", "tag.share_food", "tag.aid"],         // 玩家行为类别 id（不是词）
  "dislikes": ["tag.mock", "tag.threaten_companion"],
  "boundaries": [                                                // 边界：结构化、带阶段窗口
    { "id": "bnd.intimacy_stage_gate",
      "appliesToTags": ["tag.affection_touch", "tag.propose_intimacy"],
      "open": { "minTier": "trusted", "afterEvent": "<事件 id>" },     // 阶段限制放这里
      "closedReaction": "rx.gate_deflect" } ],
  "voice": { "styleTextId": "text.voice.lmz", "constantTextIds": ["text.const.lmz.1"] },  // 本色锚 + 声线
  "reactions": {                                                 // 按 行为类别 × 好感带 → 反应 id；缺省回落到 temperament 表
    "tag.mock":             { "low": "rx.lmz.mock.hurt_withdraw", "mid": "rx.lmz.mock.pout", "high": "rx.lmz.mock.tease_back" },
    "tag.affection_touch":  { "low": "rx.lmz.touch.startled_pull_away", "high": "rx.lmz.touch.accept_shy" }
  },
  "protection": [ { "fromChapter": 48, "toChapter": 130,
                   "mode": "wound_only",                         // 借鉴 Skyrim：essential / protected
                   "textId": "text.protect.lmz" } ],
  "combat": { "levelSource": "character-levels" },               // 引用现有等级表，不另存
  "social": { "resistAttr": "心性", "resistBase": 5 },           // NPC 在社交判定里的抵抗（可选；默认读 config）
  "stages": [ { "from": { "chapter": 48 }, "to": { "event": "<事件 id>" }, "voiceOverride": "text.voice.lmz.early" } ]
}
```

要点：
- **对应你要的字段**：价值观=`values`；喜好/厌恶=`likes/dislikes`；气质=`temperament`；边界=`boundaries`（含阶段窗口）；说话风格=`voice`（沿用卡的 `speechStyle` 文字，换成 textId 引用）；按好感档位的反应倾向=`reactions`（带宽 `low/mid/high`，沿用现有三档姿态，不新增档位）。
- **全部用 id 引用**：行为类别、价值、气质、反应、文本都是 id；角色本身用 `liuchao.character.*`。
- **与现有数据的映射**（一次性生成 + 人工审定，不是运行时推断）：
  | 现有 | → 新字段 |
  |---|---|
  | `STANCE_PROFILES[].constant` | `voice.constantTextIds` |
  | `STANCE_PROFILES[].bands.low/high` | `reactions.*.low/high` 的风格文本 |
  | `INTIMACY_PROFILES[].hardLimits` | `boundaries[]`（结构化）+ 文本 |
  | `INTIMACY_PROFILES[].tiers.minFavor` | `boundaries[].open.minTier`，数值改引 `affinityLadder` 档名 |
  | 卡 `principles[]` | `values[]`（需人工把散文归到 id） |
  | 卡 `personality[]` | `temperament`（人工选 1 个）+ 保留短语作 `traits` |
  | 卡 `speechStyle` | `voice.styleTextId` |
  | 卡 `phaseIdentities[].forbidden` | `boundaries[]` / `stages[]` |
  | `loadBearing` 事件关联（隐式） | `protection[]`（显式；清单待剧情策划，见 O7） |
  | **喜好/厌恶** | **新增，卡里没有，需人工写**（见 O5） |

### C3. 配置（阈值全在 `game-numbers.qingyu.json` 新增 `npc` 段，占位值，真机后调）

```jsonc
"npc": {
  "tags": ["strike","mock","threaten","deceive","affection_touch","affection_verbal","propose_intimacy","gift","aid","comfort"],   // 行为类别枚举（O4：与 SEMANTIC-INTENT-PLAN-v2 的 act/tone 合并）
  "tagOf": { "attack":{"*":"strike"}, "speak":{"tease":"mock","threaten":"threaten","deceive":"deceive"} /* … act×tone → tag 查表 */ },
  "bands": { "low": ["nemesis","hostile","wary"], "mid": ["stranger","acquainted"], "high": ["trusted","close","sworn"] },   // 引用 affinityLadder 档名，不重写数字
  "affinityBase": { "mock": -3, "strike": -15, "affection_touch": 0, "gift": 2 },
  "affinityLikeMultiplier": 1.5, "affinityDislikeMultiplier": 1.5,
  "reactionKinds": ["accept","accept_shy","deflect","refuse","rebuke","strike_back","withdraw","flee","hostile"],
  "temperaments": { "tmp.open_naive": { "mock": {"low":"withdraw","mid":"deflect","high":"deflect"} /* … */ } },
  "brief": { "maxFullActors": 3, "maxCharsPerActor": 320, "memoryPerActor": 2 }
}
```
- 单回合净变化沿用 `AFFINITY_LIMITS.perTurn`(15)；上限沿用 `affinityCaps`；“触犯边界好感暴跌”用现有常量 `bottomLineBreach`(60)，**第一次真正有读取者**。
- 这些键必须先写进该 JSON 才能被 `applyGameNumbers` 接受（既有约束，见 v2 §4.1）。

### C4. 代码结算 vs 模型

| 步骤 | 谁做 | 说明 |
|---|---|---|
| 读：玩家做了什么（`act/tone/target id/modal/feasible`） | **模型**（枚举 + id，数值丢弃） | 即 `SEMANTIC-INTENT-PLAN-v2.md` 的 S1；本模型是它的下游消费者 |
| act×tone → `tag` | 代码查表（config） | 无文本匹配 |
| 目标在场、可作用 | 代码（`presence.ts`、`sceneLedger`） | 沿用 |
| 阶段门（边界是否打开） | 代码读 `boundaries[].open`（档位 + 事件/章号） | 关着时 `reaction=closedReaction`，不推进任何状态 |
| 好感带 → 反应 id | 代码：先查 `profile.reactions[tag][band]`，没有再查 `temperaments[…]` | 同一好感下不同角色反应不同，就是这里分叉 |
| 好感增量 | 代码：`affinityBase[tag]` × likes/dislikes 倍率，钳制 perTurn 与上限 | 写入走与 `settleOptionalLine` 同一通道（`runtime.ts:4108–4113`、`pendingLineAffinityGrants`），玩家可见变化 |
| 记忆 | 代码：往 `记忆[]` 追加一条（模板在内容包），保留 12 条 | 复用 `runtime.ts:4121` 口径；追加不替换 |
| 受伤/离场/保护钳制 | 代码：`protection` 模式 + 现有 `injuryStore`、`sceneLedger` | 致命结果钳到 `wound_only` 时，既定事实要如实写出被钳制 |
| 把结果拼成“既定事实”给叙事 | 代码（模板文本在内容包） | 沿用 `judgementResolution` 回执通道（见 C7） |
| 台词、神态、小动作、节奏 | **模型** | 只在既定事实、`voice`、当前带的风格文本之内演 |
| 没读懂（`unclear` / `modal≠do`） | 模型照常回应，**代码不写状态** | 与路由器现有“拿不准”口径一致 |

### C5. 长线游玩里每回合上下文保持有界

NPC 简报（`npcBrief`）只在 `presentActors` 里增加三类内容，全是 id 查表：

1. **所有在场演员**（沿用现有上限 3；南荒 18 人的上限建议改成“全卡 ≤`maxFullActors`，其余只留名字”，O11）：`traits`（≤3）+ `voice` 一句 + 当前好感带的风格文本一行。
2. **本回合被作用的 NPC**（若有）：多带 `boundaries` 里与本回合 `tag` 相关的**那一条**、最近 `memoryPerActor`(2) 条与本 `tag` 相关的记忆。
3. **本回合若触发了反应**：一段“既定事实”（反应 id 对应的作者文本 + 好感变化 + 是否被阶段门或保护钳制）。仅在触发回合出现。

有界性论证：简报大小只与“在场人数”有关，不随游玩时长增长；`记忆[]` 已封顶 12、判定记录封顶 20；`protection` / `boundaries` / `reactions` 都是按 `(id, 当前章)` O(1) 查表，索引在模块加载时建好；**不把整个 `社交.关系` 发给模型**（L 路径现在会，见 A3）。

### C6. 与内容包（content packs）适配

- **台账层**（跨包稳定）：`entity-ledger/npc-profiles.json`，字段如 C2，只放“这个人是谁、边界在哪”。
- **包层**（每包专属）：`packs/<pack>/npc.json`，放反应 `rx.*`（kind、好感键、记忆模板 id、状态写入、textId）与文本；包内可对某角色按 stage/章号**覆盖**台账字段（对应现在卡的 `phaseIdentities`）。
- **编译**：`scripts/content-packs.mjs` 增加 `npcProfiles` 段输出到 `generated/catalog.json`，校验：角色 id 存在于 canon；`tag/temperament/value/reactionKind` 属于 config 枚举；`textId`/`memoryTemplateId`/`affinityKey` 存在；`bands` 键合法；`stages` 引用的事件/章号存在；ratchet 脚本新增“不得出现字面人名”检查（沿用 `validate-ledger-ratchet.mjs` 的口径）。
- **不覆盖受保护字段**：带 `AFF_PROTECTED / AGE_PROTECTED / DEBUT_PROTECTED / USER_CANON` 的字段是人工裁定，生成脚本不得写；改动先在 `CANON-DECISIONS.md` 追加裁定，再改（项目 `CLAUDE.md` 的规定）。`canon:build` 全绿才可提交。
- 新包只需提供自己的 `npc.json` + 复用台账；不碰 TS。

### C7. 接入点（尽量不碰冻结文件）

需要新增的“读卡/出简报”逻辑放在**未冻结**的 `legacyNarratorPacket.ts`（`readPresentActors`、`LegacyPresentActor`）和新目录 `scenarioMods/npc/`。不需要改冻结文件的部分：
- 演员卡里加 `reaction` / `bandLine` 字段：改 `legacyNarratorPacket.ts:49–65、194–241`（非冻结）。
- “既定事实”：沿用 `options.judgementResolution` → `formatVerifiedJudgementReceiptForPrompt` → 场景里的`公开判定`（`AIBidirectionalSystem.ts:813`，现成通道，v2 §1 同口径）。

**不可避免要动冻结文件的唯一一处**（如果要修 A2 说的“自由输入无候选时 NPC 全空”）：
- `src/utils/AIBidirectionalSystem.ts:794–795`（`const capsuleSelection = candidates[0]; const capsule = capsuleSelection ? readLocalMemoryCapsule(...) : null;`）：需要在候选为空时仍取当前焦点事件构造胶囊。
- 若改走“场景对象新增键”而不用判定回执，则还要动 `AIBidirectionalSystem.ts:809–815`。
- `runtime.ts` 不需要改（好感写入沿用 `runtime.ts:4108–4113` 的口径，由新模块调用，不改该函数）。
需要你明确授权上述行号（O8）。

### C8. 下游关系：自由输入意图识别

`SEMANTIC-INTENT-PLAN-v2.md` 的 S1“读”输出 `act/tone/target/modal/feasible`，本模型把它变成 `tag`，再查 `(target id 的 profile) × (好感带) × (阶段门)` 得到反应。v2 的 S3 路由表（攻击→战斗判定、嘲讽→社交判定）是本模型 `reactions` 的一种特例（`kind=strike_back` 之类需要判定的，仍走判定，其余不掷骰）；v2 的 `lifeProtection`（§2.5、§4.3）与本文 `protection` 是同一个东西，建议只留一份，放进 `npc-profiles.json`。

### C9. 借鉴《博德之门 3》与《上古卷轴 5》（仅凭我自身知识，未联网；不确定处标【不确定】）

| 来源机制 | 可迁移到 LLM 主持的游戏？ | 对应到本模型 | 现在的真实缺口 |
|---|---|---|---|
| BG3 同伴“认可度”：每个同伴有自己的喜好/厌恶，玩家的选择让认可度升降【较确定】 | **能**：认可变化由代码按“行为类别 × 该同伴价值”算，不让模型自评 | `values/likes/dislikes` + `affinityBase × 倍率` | 缺：行为类别枚举与每人价值表（A4 ④）；好感变化目前只来自写死停靠点 |
| BG3 认可阈值解锁/破裂关系线、个人任务、离队或转敌对【较确定；具体数值不确定】 | **能**：阈值就是你的八档，门写在数据里 | `boundaries[].open.minTier` + `protection` 的“本场回避/离队”降级 | 缺：阶段门是散文（`forbidden` 备注），M 不发；`nemesis→离场` 没有对承重角色的降级规则 |
| BG3 反应式对话/闲聊（对行动、地点、事件的随口评论）【较确定】 | **能**，且最适合交给模型 | `voice` + 当前带的风格文本，模型自由演 | 缺：M 演员卡没有“这个人在这个好感带说话是什么味”（stance 档案在 L） |
| Skyrim Radiant AI（日程/目标包）和 AI 属性（Aggression/Confidence/Morality 等）【较确定；取值范围不确定】 | **部分**：日程可用“在场/去处”表达；属性可压缩成 `temperament` 枚举 | `temperament`（缺省反应表）+ 既有 `presence` | 缺：气质枚举；日程现在只有事件驱动的在场 |
| Skyrim 关系等级（-4~+4 之类）门控对话/随从【不确定具体级数】 | **已有对应**：八档好感 | 无需新增 | 已有，缺的是 M 路径不发 |
| Skyrim 阵营与犯罪反应（目击者、悬赏、守卫）【较确定】 | **部分**：可映射为“阵营声望 + 在场者反应” | `reactions` 的 `kind` 里加阵营级后果（本期不做） | `reputationLedger.ts` 已有声望锚，但没接 NPC 反应 |
| Skyrim `essential / protected` 标记【较确定：essential=不可死、倒地后恢复；protected=只有玩家可杀】 | **能**，且正是你要的“必须存活” | `protection[].mode`（`wound_only` ≈ essential；`intervene` ≈ 他人救场） | 缺：台账无此数据；L 靠事件关联推导 |

---

## D. 测试反例（每条要有自动化断言；模型用桩，骰子用固定值；断言落在**结构化状态与提示内容**上，不对叙事正文做关键词匹配）

通用夹具：用 `tests/baihuMainlineWalk.mjs` 走到目标角色在场的停顿点，把好感值直接设到指定档（夹具设值，不走游戏循环）。

| # | 输入 / 设定 | 期望（代码侧） | 关键断言 |
|---|---|---|---|
| D1 **攻击必须存活 NPC** | 凝羽在场，台账 `protection` 窗口有效；读出 `act=attack, target=凝羽, modal=do`；骰面 1/10/20 × 境界差 −3/0/+3 | 无论哪档，凝羽状态不为 `dead/missing`；好感下降（config）；记忆 +1；既定事实含保护文本且写明“被钳制”；窗口外一章放行 | `sceneLedger.actors[id].status`；`npc.记忆.length`；事实块含 `protection.textId`；境界因子 = `levelModifier`。同一断言对乐明珠再跑一遍，证明不是单角色特判 |
| D2 **嘲讽（同输入、同好感、不同性格）** | `tag=mock`，好感 10，分别对乐明珠 / 凝羽 / 小紫 | 三者 `reaction id` 两两不同（温顺型 withdraw / 冷淡型 deflect / 占有型 hostile 等）；好感增量符号一致、幅度按 `likes/dislikes` | 反应 id 来自 `profile.reactions` 或 `temperaments`；社交判定无 `realm` 因子 |
| D3 **低好感亲吻** | `tag=affection_touch`，好感 −5；乐明珠、凝羽各一次 | 两人反应均为“拒绝/躲开/还手/愤怒”一类（kind ∈ refuse/withdraw/rebuke/strike_back），**且互不相同**；好感大降；不写任何推进旗标；不注入亲密档案文本 | 好感 delta = config；`flags` 无阶段推进键；提示里**没有** `hardLimits` 以外的亲密素材 |
| D4 **高好感亲吻** | 好感 65，阶段门 ①已打开 ②未打开 | ①：`accept/accept_shy` + 允许推进的状态键写入；②：`deflect`（门挡），好感小升或不变，**不推进** | 同一好感下 ①② 结果不同，证明阶段限制在数据里生效 |
| D5 **2×2：调情 / 求欢邀请** | 角色 {乐明珠, 凝羽} × 好感 {低 −5, 高 70}，`tag=affection_verbal` 与 `tag=propose_intimacy` | 4 种组合的 `reaction id` 全不相同；凝羽高好感的反应 `constraint ids` 含“不口头承认爱意”，乐明珠高好感含 `accept_shy` 类；任一组合不得绕过阶段门 | 断言 `reaction id` 与 `constraint ids`，不断言台词内容 |
| D6 **阶段门前后** | 同一高好感求欢邀请，节点前 / 节点后 | 节点前恒 `closedReaction`；节点后按 D5 | 事件完成前后的状态差 |
| D7 **喜好/厌恶生效** | 同好感下对乐明珠 `gift` vs 对凝羽 `gift` | 增量不同（likes 命中 ×倍率） | `affinityBase × multiplier` 精确值 |
| D8 **主动分不被自由行动污染** | 自由嘲讽 / 亲吻 1000 次 | `lemingzhu.activeScore` 状态不变（除非 v2 明确放行） | 保住“8 分线不可被刷”的不变量 |
| D9 **长线有界** | 模拟 300 回合、遇见 40 个 NPC | `npcBrief` 字数 ≤ `maxCharsPerActor × maxFullActors`；`记忆[]` ≤12；判定记录 ≤20；`(id, 章)` 查表次数与回合线性、单次耗时恒定 | 对比第 10 与第 300 回合的简报字节数 |
| D10 **无候选的自由输入** | 当前无事件动作，玩家对在场 NPC 说话 | 演员简报非空 | 目前会失败（A2），修复冻结行后转绿 |
| D11 **读失败 / 不明** | `unclear`、名单外 target id、`modal=ask/hypo` | 零状态写入 | 存档前后深比较相等 |
| D12 **不在场目标** | 对已离场 NPC 行动 | 不产生反应，叙事只能以听闻处理 | `presence`/`absentCast` |
| D13 **回放确定性** | 读档 / 回滚后重放同一输入同一骰面 | 反应 id 与状态一致 | 存档只存 id，不存合成对象 |
| D14 **内容包校验（负向）** | 未知 tag、缺失 textId、`bands` 缺键、字面人名 | `content-packs` 编译失败 | 退出码非 0 |
| D15 **反关键词静态检查** | 扫描 `scenarioMods/npc/` | 无对玩家原文的 `RegExp.test/match/includes` | 静态规则（沿用 v2 §9.2） |

涉及亲密内容的 D3–D6：以上只断言 **反应类别、好感、旗标、提示里放了哪些 id**。具体能写到什么程度、是否允许推进，见 E。

---

## E. 成人与合规内容：遵循原著，只标记；以下全部为**待用户决定项**，本文不改写、不替你定

依据（项目 `CLAUDE.md` 所引的 2026-10-04 11:39 用户裁定）：成人内容不做处理、不软化；硬线是全员满 18 岁、强迫内容不可玩化；C03/C04/C05 不作为通用要求，只保留用户单独定过的场合；待确认项不视为已批准。本审计据此：**不删、不软化、不扩写**任何一张卡或档案，只指出设计落在哪里。

### E1. 本设计触到合规的地方（只标记）

| # | 落点 | 关联条目 | 说明 |
|---|---|---|---|
| m1 | `tag=affection_touch / propose_intimacy` 的 `reactions` 与 `boundaries` | C10、C13 | 反应表会决定“接受/拒绝/推进”；凝羽等“成人向扩写线须合意、成年”(C13) 待确认 |
| m2 | 亲密场景判定现为关键词 `INTIMATE_SCENE_RE`（`intimacyProfiles.ts:42`） | C10、Q15 | 本设计用模型读出的枚举替代它；是否替代、替代后“宁漏不误”的方向如何保持，待定 |
| m3 | 卡里的情欲面字段（`personality`/`speechStyle`/`keyEvents` 中的内容、`intimacyProfiles.physical`） | C05、Q11 | 搬进台账时放公开字段还是非公开字段，待定 |
| m4 | 低好感对不情愿一方的“强行亲近”类输入 | C02、C14 | 本设计的方向是 **NPC 拒绝并有后果**，不是“演出”；但“尝试强迫”能否被读为可玩输入、如何呈现，待定 |
| m5 | 年龄与外貌措辞 | C01、Q3、Q13、Q17 | 乐明珠“童颜”口径（Q17）仍待确认；本文引用她的外貌字段只作字段盘点 |
| m6 | 凝羽 memories 中的敏感旧事 | Q6 | 附录 A 已列，本文不触碰 |
| m7 | 月霜亲密档案的半强迫素材 | Q7 | 搬迁到 `boundaries` 前必须先裁定 |
| m8 | NSFW 默认开关 | C08、Q14 | 与 `reactions` 的可见性是否分层有关 |
| m9 | 阶段限制“某节点前不可发生实质关系”由谁定节点 | — | 属于剧情设定，也牵涉 m1 |

### E2. 开放决策（需要你定）

| # | 问题 | 我的倾向（仅供参考，不预设） |
|---|---|---|
| O1 | 台账放哪：新文件 `entity-ledger/npc-profiles.json` / 扩 `overrides.json` / 只放内容包 | 新文件（`overrides.json` 已是“#199 命名”专用） |
| O2 | v1 先做哪几个角色的手写 `reactions` | 乐明珠、凝羽、小紫；其余先回落 `temperament` |
| O3 | 气质枚举有几种、叫什么 | 先 6–8 种，按现有 49 个姿态档案归纳 |
| O4 | 行为类别 `tags` 与 v2 的 `act/tone` 合并成一份枚举吗 | 合并，只留一份 |
| O5 | `likes/dislikes/values` 谁来写：模型生成草稿 + 人工审，还是全人工 | 草稿 + 人工审；卡里没有这些数据 |
| O6 | 好感增量、阶段门档位等数值 | 全部占位，真机后调 |
| O7 | 必须存活清单（哪些角色、哪个窗口、`wound_only` 还是 `intervene`） | 需剧情策划出；与 v2 开放问题 4 同一件事 |
| O8 | 是否授权改冻结行 `AIBidirectionalSystem.ts:794–795`（以及备选的 `:809–815`） | 授权 `:794–795` 一处即可 |
| O9 | `STANCE_PROFILES / INTIMACY_PROFILES / VOICE_CARDS` 迁数据后，TS 表保留到 legacy 删除为止还是立刻删 | 保留到 legacy 删除 |
| O10 | 南荒关“带键空值”挡掉静态卡的底线/目标/软肋（A5），这是有意防剧透，要不要为这些关补写“当期适用”的版本 | 补写；否则 M 路径永远拿不到 |
| O11 | 演员简报上限：普通 3、南荒 18，是否改成“全卡 ≤3，其余仅名字” | 改 |
| O12 | 自由攻击对不受保护 NPC 能否致死 | 与 v2 开放问题 3 同一件事 |
| O13 | 建不建“触犯边界 → 好感大降”的检测（读出 `tag` 命中 `dislikes/boundaries`） | 建（常量 `bottomLineBreach` 已存在无人读） |
| O14 | E1 中 m1–m9 的全部口径 | 等你逐项定 |

---

## 附录：证据索引与未核项

**主要证据位置**
- 路径强制：`playtestNarrativeScope.ts:30`；`modularTurn.ts:44–52`；`AIBidirectionalSystem.ts:720、1221、1239、1257–1259、1306–1307`
- M 路径提示：`AIBidirectionalSystem.ts:786–788、794–795、806–815、825、841–866、869、930`；`legacyNarratorPacket.ts:26、35、49–65、154–186、194–241、259–286、343–431、561–591`
- L 路径提示：`storyContext.ts:515–674、687–731、767–1307`（其中承重保护 `:1132–1147`，关系演进句 `:1118`）
- NPC 数据层：`characterResolver.ts:96–149、165–262、326–376、422–425、524–527`；`relationships.ts:158–221`；`runtime.ts:3437–3463、3546–3562、3692–3713、4087–4125`
- 反应形状（TS 内）：`voiceCards.ts:12–45`；`stanceProfiles.ts:52–709`；`intimacyProfiles.ts:42、66–383、405–422`；`relationStance.ts:23–80`
- 好感：`affinityLadder.ts:35–83、169–278`；`affinityCaps.ts:40–143`
- 输入侧：`naturalIntentRouter.ts:364–382、394–412`；`MainGamePanel.vue:2020、2101`；`judgementEngine.ts:469`；`judgementPreflight.ts:26、61、156`
- 保护/等级：`canonGuard.ts:471–505`；`characterLevels.ts:7–11`；`sceneModule/host/factors.ts:80`
- 台账：`mod-kit/entity-ledger/overrides.json`（22 实体，字段仅 `id/aliases/naming/sceneBinding`）

**我没核实的**
- 任何“运行时实际发出的提示全文”：全部由读代码推出，未运行。
- `AIBidirectionalSystem.ts:810、1331` 之外是否还有别的路径把 NPC 数据拼进 M 路径提示：我在 `tryModularTurn` 范围（716–951）内搜过，没找到。
- `tier`（主要/次要）字段在运行时的用途：未追踪。
- `characterRagService` 在旧链路里的实际召回内容：只确认入口，未读内容。
- 《博德之门 3》《上古卷轴 5》的具体数值与版本差异：C9 全凭记忆，已标【不确定】处请勿当事实引用。
