# 自由行动事件票：让“打王哲、嘲段强”也改好感、写 NPC 记忆（只读设计稿，未改代码）

日期 2026-10-15。承接 `SEMANTIC-INTENT-PLAN-v2.md`（其 S3/S4 的子集，不含停顿点“贴合度”对账）、`NPC-DESIGN-AUDIT.md`（C 节最小 NPC 模型）、`docs/handoffs/2026-10-05/NPC-MEMORY-PLAN.md`（记忆约束的出处）。

**怎么读标记**
- 【已核实】= 本次读了源码/配置/报告原文。行号取 2026-10-15 工作区（有大量未提交改动，其中 `npcCardLayer.ts` 尚未被 git 跟踪，`legacyNarratorPacket.ts`、`AIBidirectionalSystem.ts` 有未提交差异；行号会漂移）。
- 【推断】= 由已核实事实推出，没有直接证据。
- **本次没有运行任何游戏代码、没开 8091/8097、没构建。**所有“某句话会怎样”都是读代码得出的。
- MVP 报告**已找到**：`../playtest-2026-09-28/REPORT-2026-10-15-mvp-playthrough.md`（即 `work/playtest-2026-09-28/` 下，不在仓库内）。
- 没读的东西：`COMPLIANCE-REQUIREMENTS.md` 全文（只读了 C01–C14 条目表）；`CANON-DECISIONS.md` 里**没有**叫“事件票”的条目——你给的约束实际出处是 `NPC-MEMORY-PLAN.md`（第 15–18 行）与裁定 #117 / #203 / #205 / #149；MVP 原始日志（`cb/mvp/logs`）；各 NPC 的“必须活着”标记（角色总表 `character-registry.json` 的现有键里没有该字段，`rg` 全仓无 `mustSurvive`，见 §7）。
- 你写的“魅力/悔性/心性”：仓库里社交判定的三项是**魅力/悟性/心性**（`game-numbers.qingyu.json: weights.social`，权重 0.5/0.3/0.2）。我按“悔性=悟性 的笔误”处理并沿用现有三项、不新增属性；这与 v2 开放问题 2 同一件事，若不是笔误请告诉我。

---

## 类别清单（第三轮修订：6 个类别 + 类下变体；第四轮按用户已定决定再改，见本节末）

用户反馈“动作分得太细”。原文 §3–§9 的 7 个动作类型与 §14 的 7 个状态类动作（共 14 个并列枚举）已合并为 **6 个 `actionClass`**；具体动作改为类下的**变体（`variant`）**，差别只体现在 config 的参数行里（检定种类、属性、代价、上限、冷却、物品标签……），不再是并列的枚举。

| actionClass | 中文 | 变体 `variant`（config 白名单） | v1 默认启用 |
|---|---|---|---|
| `physical` | 肢体冲突 | `attack` 攻击；**限制行动**两个变体：`grab` 抓住（一拍短暂压制）、`bind` 捆绑（持续变体，待实现） | attack、grab；bind **关（待实现/默认关闭）** |
| `verbal` | 言语施压 | `taunt` 嘲讽、`threaten` 威胁、`deceive` 欺骗 | 全开 |
| `intimate` | 亲近 | `flirt` 调情、`kiss` 亲吻、`invite` 邀请 | 全开（合规见 §13 F1–F3） |
| `give` | 给予 | `gift` 赠物（物品/礼物同一种结算）、`feed_pill` 喂药/下毒（同一件事、同一套结算；毒性由物品效果标签承担） | 全开（毒性物品 v1 不登记，见 D19） |
| `cast` | 施术 | `transfer_qi` 传功、`heal` 疗伤、`bandage` 包扎（**仅此三项**） | 全开 |
| `other` | 其他/无效 | `none`（观察、闲聊、吃饭、不可能的事……不结算） | — |

- **来源对照**：原 14 个具体动作保留为变体（原 `give_item`→`gift`；第四轮起原 `poison` 下毒并入 `give.feed_pill`，不再是独立变体），**仅 `grab` 是第三轮新增**（你的提议，参数是我占位，见 D23）。
- **票的形状**：`{actionClass, variant, targetId, degree, performed, evidence, itemId}`——类与变体都是 config 白名单里的 id，`itemId` 是“手段”（只取代码生成的背包名单，可为 null）。模型仍不报数值。
- **结算怎么分层**：类提供**共用默认**（`route` 判定/查表、检定 `kind`、`modifierProfile`、难度、`outcomeFactor` 等）；变体是**一行覆盖**（`base`、`difficulty`、`npcOutcomes`、`cost`、`cooldown`、`cap`、`itemTag`、`protectedForbid`、`enabled`……）。变体 = 类默认 ⊕ 变体行（变体行优先）。代码只认**类的路由家族**和有限的 `effect` 种类，不认变体名。
- **加一个新行为只需一行配置**：例如要加“推搡”，在 `physical.variants` 里增加 `shove:{base:-2,npcOutcomes:["block","graze"]}`，其余继承 `physical.defaults`；提示词里的“类→变体”清单由 config 生成，`content-packs.mjs` 的校验自动覆盖新行（必填参数、引用是否存在）。
- **“只需配置”的边界（已核实一处，其余是设计）**：①`applyGameNumbers`（`sceneModule/numbers.ts:9`）对 tuning 补丁里的未知键会抛 `未知数值配置`，所以**新变体行必须写进 `mod-kit/game-numbers.qingyu.json` 默认文件**，运行期 tuning 补丁只能调已有变体的参数；②新变体若要用到**目录里没有的状态、没有对应标签的物品、或新的 `effect` 种类**（例如“用内力疗伤”需要新的解除规则种类），仍要改状态目录/代码，不算“只加一行”（D24）。
- **本轮新增决策**：D23（类/变体归属与 `grab` 占位）、D24（“只需配置”的边界）；D14 随之改为“哪些变体启用”。均在 §14.8。

**第四轮（用户已定的决定，不再是提议）**
1. **限制行动**：「抓住」与「捆绑」同属一类“限制行动”，归在 `physical` 肢体冲突类下作为变体，**不另设分类**（“限制行动”只是文档里的叫法，不是第七个 `actionClass`，也不是新枚举）。
   - `grab` 抓住 = **一拍的短暂压制，不留持续状态**：只产出本拍事实文本（`subdue`“被制住”），不写任何状态目录条目，不写 `injuryStore`，下一拍自动失效。
   - `bind` 捆绑 = 同类下的**持续变体**，需要新增状态「行动受限」。**本版标为“待实现/默认关闭”，不实现**（`enabled:false`；状态目录里不加该条）。
   - **以后启用捆绑只需**：在同一类下把 `bind` 设 `enabled:true`、并在状态目录新增「行动受限」一条（带 `remove` 规则；现有四种规则 `rest/time/item/story` 即可），**不改结构**（类、票形状、结算路径、`effect:'applyStatus'` 均不动）。
2. **下毒 = 喂药**：同一件事，都归 `give` 给予类，**共用一套结算**（`give.feed_pill`，`effect:'itemDefined'`）；毒性由**物品效果标签**承担（效果表里标签为毒性的物品→挂 `poisoned`+毒伤；有益标签→解除/进度）。`cast` 施术**只保留传功、疗伤、包扎**。
3. **必须活着 = 角色总表的标记字段**，不再另列名单（§7）。
4. **两条路径分开**：必须活着只约束**玩家自由行动路径**；**剧情合同路径**安排的死亡不受它限制（§7.3）。

---

## 0. 一句话

**模型只“报票”：玩家这一句里做了什么（动作类别与变体、对谁、轻重、是否真做了）——全是固定枚举/白名单加在场名单里的 id。之后一切数值（掷骰、好感、记忆、大事晋升、保护钳制）都由代码按 config 查表结算，好感与记忆在同一个函数里一次写完。叙事模型只拿到“既定事实”去演。**不对玩家原话做关键词匹配，不建别名词典。

---

## 1. 问题与根因

### 1.1 现象（MVP 报告原文）
- 02:36：“嘲讽段强（好感 80）→ 好感不变”（报告把它记为反例通过，因为叙事合理；但没有任何结算）。
- 02:40：“攻击必须存活的王哲 → 王哲闪避、扣腕卸刀、「你疯了？」，不死……但王哲好感未下降（55→55）”，被列为“小瑕疵”。
- 同报告 02:39：对在场月霜（低好感）“凑上去想亲”→ 叙事里月霜扼喉、商乐轩隔开；月霜好感显示变化来自 s01_04/06 事件奖励，**不是**这一吻（报告原话）。04:10 高好感凝羽亲吻 → 叙事冷淡一致。这些都**只有叙事，没有结算**。

### 1.2 因果链（【已核实】读代码）
1. `MainGamePanel.vue:1976` 在带范围的试玩存档里先调一次 intent 模型（`naturalIntentRouter.ts:385 resolveNaturalIntent`）。候选里没有对应动作时返回 `kind:'free'`，且 `skipKeywordPreflight:true`（`naturalIntentRouter.ts:381–383 narrateWithoutSettlement`、`:459–461`）。
2. `MainGamePanel.vue:2020` 把这个值取走，`:2100–2101` 据此 `shouldSkipJudgementPreflight` 为真 → 跳过 `buildLocalJudgementPreflight`（`judgementPreflight.ts:139`，里面 `RISK_RULES` `:20–29` 本来能把“砍/攻击”判成 combat、把“欺骗/威胁”判成 scheme/social）。
3. 没有判定卡 → `finalUserMessage`（`:2190–2214`）里没有任何“本地…已结算”行；回合走 `tryModularTurn`，其返回的 `tavern_commands` 恒为 `[]`（`AIBidirectionalSystem.ts:929、934、942` 等，【已核实】），叙事模型**没有写命令的通道**。
4. 好感只会被 `settleOptionalLine`（`runtime.ts:4090`）改，而它只在作者写好的停靠点动作被选中时被调用（`runtime.ts:1978`）。NPC 记忆同理（`runtime.ts:4101、4121`）。

所以“叙事对、状态没变”不是模型没读懂，是**自由输入没有通往结算的路由**。非试玩存档（`naturalIntentRouter.ts:405–407` 返回 `skipKeywordPreflight:false`）仍走老关键词预检，本方案不动它。

### 1.3 两个相关缺口（同一批改动要补，否则“写了也看不见”）
- 记忆能不能被模型看见：`npcCardLayer.ts:58 readNpcCard` 只给 `maxCards`=2 张卡，取**在场名单前两人**（`legacyNarratorPacket.ts:253 actors.slice(0, maxCards)`）。被打的 NPC 不一定排在前两位【推断：要看 `presentNames` 顺序，未运行】。
- “相关大事”只取编年史里作者事件（`npcCardLayer.ts:42–56 recentRelatedEvents`，按 `event.relatedCharacterIds`）。自由行动产生的大事没有地方被它读到。

---

## 2. 总览（数据流）

```
玩家自由输入（试玩存档，非按钮、非场面）
  │
  ├─ [已有] intent 模型调用（同一次，不加请求）
  │     输出新增 tickets[]：{actionClass, variant, targetId, degree, performed, evidence, itemId}
  │     代码校验：类别合法 / variant∈该类白名单且 enabled / targetId∈在场名单 / performed=yes / evidence 是原话子串 / 同目标仅一张
  │     只有 intent.kind==='free' 才收票（命中作者动作时不收，避免同拍双结算）
  │
  ├─ 路由（查 config.freeAction.classes[actionClass].variants[variant] 合并类默认后的 route）
  │     route=judge → 签发待确认判定（kind 与因子来自 config；authorityReceipt 带票）→ 玩家确认 → 掷骰
  │     route=table → 不掷骰，按 好感档/阶段门/气质 查反应表
  │
  ├─ settleFreeAction（一个函数，先算后写，一次提交）
  │     好感（±15 钳制、上限、玩家可见 grant）+ 记忆（记忆[] + ≥10 的大事 episode）+ log + 幂等键
  │
  └─ 既定事实块 → 拼进 finalUserMessage / 公开判定 → 叙事模型只演这些
```

与 v2 的关系：v2 的 S1“读”里 `act/tone/target/modal` 是本票的超集；若 v2 P1 先落地，票并入 Reading 即可，本方案的校验与结算部分不变。v2 的 `goal` 对账（停顿点达成）与本方案正交，这里**不做**。

---

## 3. 事件票怎么工作（要求 1）

### 3.1 票的固定形状
```jsonc
{ "actionClass": "physical|verbal|intimate|give|cast|other",
  "variant":     "<该类 config 白名单里的变体 id>",
  "targetId":    "<在场名单里的实体 id>|null",
  "degree":      "light|normal|heavy",
  "performed":   "yes|no|unclear",
  "evidence":    "<玩家原话里的连续片段，≤ evidenceChars>",
  "itemId":      "<代码生成的背包名单里的物品 id>|null" }
```
- `actionClass`：玩家这一句的动作大类（6 类，见文首“类别清单”）。`other` = 不结算（观察、闲聊、吃饭、御剑上天……），其下只有 `none` 一个变体。**类别枚举与每类的变体白名单都在 `game-numbers.qingyu.json` 的 `freeAction.actionClasses` / `freeAction.classes.<类>.variants`，代码不写字面量**。
- `variant`：该类下的具体动作（如 `physical.attack`、`verbal.taunt`）。必须属于所报 `actionClass` 且 `enabled`；**提示词里的“类→变体”清单由 config 生成**（只列启用的变体，每个带一行中文说明）。没有合适变体时模型应报 `other/none`，而不是就近硬套（D23）。变体之间的差别**只在 config 参数**，不在代码里。
- `itemId`：“手段”。只有变体行声明了 `needsItem` 的（`give.*`、`cast.heal/bandage`）才允许非空；其余变体填了即整张票作废。名单由代码按“背包 ∩ 物品效果表”生成（见 §14.3 闸门 4）。
- `targetId`：只能是提示里给出的在场名单中的 id（名单由代码生成，见 §3.2）。模型编出名单外的 id → 整张票作废。
- `degree`：这一下多重/多露骨（轻描淡写 / 常规 / 全力或当众）。只放大或缩小 config 里的系数，不直接给数。
- `performed`：玩家是否**真的做了**这件事。`yes` = 本回合实际发生；`no` = 问句、假设、转述、否定、只是想想；`unclear` = 拿不准。**只有 `yes` 才结算。**这个字段取代 `naturalIntentRouter.ts:107–118 hasUnclearIntentFrame` 那一族正则——票路径不使用任何对玩家原话的正则，模型自己填 `performed`。
- `evidence`：只做审计与“确有此话”校验，不参与判定。校验沿用 `naturalIntentRouter.ts:252 evidenceBelongsToPlayer`（连续子串比较，不是关键词匹配）。

### 3.2 票从哪里来
- **挂在已有的 intent 调用上**：`naturalIntentRouter.ts:325–355 buildIntentPrompt` 的输出 JSON 增加 `"tickets":[…]`（最多 `maxTicketsPerTurn`=2 张，每个目标最多 1 张），`:220 parseIntentJson` 透传，`NaturalIntentResult`（`:57–70`）新增可选字段 `freeActionTickets`。这与现有 `statusProposals`（`:450–451` → `freeTextStatusSemantic.ts validateFreeTextStatusProposals`）是同一种“模型提案、代码校验、失败即关闭”的结构，不是新范式。【已核实】
- **在场名单**：`questLineContext(save).presentActorIds`（`questLineContext.ts:9`，代码声明的在场人物，已排除 `dead/missing/departed`），附显示名，截断到 `roster.max`。`legacyNarratorPacket.ts:303–306` 的自由输入回落就用它，口径一致。【已核实】王哲、段强在 MVP 存档里是否在该名单中——**未验证**（P0 探针）。
- **只在 `intent.kind==='free'` 时收票**。命中作者动作（`matched`/`alias`）的回合，好感/记忆已由 `settleOptionalLine` 写（`runtime.ts:4090`），再收票会违反“同一事件只结算一次”（裁定 #205、#203）。
- 范围：与 intent 路由相同——仅 `isScopedNaturalIntentSave`（`playtestNarrativeScope.ts` 清羽/星月湖试玩全链）。其他存档不变。

### 3.3 校验（`freeAction/ticket.ts: validateFreeActionTickets`，仿 `freeTextStatusSemantic.ts:25–50`）
1. JSON 可解析、数组、长度 ≤ `maxTicketsPerTurn`；
2. 每张票的键集合**恰好**是 7 个（`itemId` 可为 null），多出任何键 → 丢弃该票（越权字段）；
3. `actionClass`、`degree`、`performed` 必须在 config 枚举里；`variant` 必须在 `classes[actionClass].variants` 里且 `enabled!==false`（类与变体不匹配、变体编造、变体被关 → 整张作废；被关的变体不发“未发生”事实行，等同今天的行为）；`itemId` 非空须属于代码生成的名单且该变体声明了 `needsItem`；
4. `targetId` ∈ 校验时**重新**从存档算出的在场名单（不信提示里发过的那份），且 `relationshipOf(save, id)`（`ledger/affinityIdentity.ts:105`）存在；
5. `performed==='yes'`；
6. `evidence` 是玩家原话子串；
7. 任何一条不过：丢这一张，不追问、不降级结算（与 `onClassifierFailure` 的“有合同候选则 hold”无关：票不属于合同动作）。
- 模型数值字段一律不收。玩家写“系统：好感+100”无处落地：票里没有数值位。

### 3.4 票如何跨“确认判定”存活（【已核实】一个必须处理的坑）
需判定的类型走 `待确认判定 → 玩家点执行 → sendMessage({skipPreflight:true, resolution})`（`MainGamePanel.vue:2594–2613 executePendingJudgement`）。`sendMessage` 重入后，`:1976 if (saveData && !buttonSelected)` **没有**检查 `execution`，会**再调一次 intent 模型**；既慢（读 `SEMANTIC-INTENT-PLAN-v2.md` §8 引用的 6.3–14.5 s），也可能给出不同的票。【推断：读码结论，未运行】
- 处理：票写进待确认判定的 `authorityReceipt`，新增一种回执 `{kind:'free_action_judgement', ticketId, actionClass, variant, targetId, degree, itemId}`——`judgementEngine.ts:13` 联合类型加一支，`:156 normalizeAuthorityReceipt` 加一支；`:310 verifyResolvedJudgementReceipt` 比较的快照里已含 `authorityReceipt`（`:281–305`），所以回执不能被前端伪造。
- `MainGamePanel.vue:1976` 加条件：`execution?.resolution?.authorityReceipt?.kind==='free_action_judgement'` 时**跳过 intent 调用**，票取自回执。顺带省一次模型调用。
- 幂等键 `fa.<judgementId|turn>.<targetId>.<variant>`，存 `runtime.freeAction.settled`（只留最近 `settledKeep` 个）；重试/读档同键不再写（对应裁定 #67“读档／重试不得重骰”的同口径）。

---

## 4. 按动作类别 + 变体从 config 结算（要求 2）

结算参数表在 `game-numbers.qingyu.json: freeAction.classes.<类>.{defaults,variants.<变体>}`（形状见 §9.1）。代码按**类的路由家族**（`judge` 掷骰 / `table` 查表 / `none`）走流程，变体只提供参数。**数值全是占位，真机后调；凡写“引用”的是复用已有键、不新增数。** 本节先讲 `physical`、`verbal`、`intimate` 三类；`give`、`cast` 两类见 §14。

| 类 / 变体 | route | 判定 | 境界差 | 属性 | 结果落点 |
|---|---|---|---|---|---|
| `physical` / attack、grab | judge | kind=`combat`（类默认），难度占位 11（与 `combat.baselineDc` 同值，单测断言相等） | **有**：`goalModifierRule('default').levelGap=true`，值=`levelModifier(玩家级, NPC级)`（`sceneModule/levels.ts:3`；一级±`levels.gapOne`(4)，≥两级±`levels.gapMany`(12)），因子 `source:'realm'` | `weights.combat` 根骨/灵性/气运 | attack：好感大降、记忆、玩家按既有规则受损；grab（限制行动，一拍压制）：好感小降、记忆，NPC 侧只有“挡下/被制住”两种事实，**不留持续状态** |
| `physical` / bind（限制行动，持续变体） | **关**（`enabled:false`，**待实现/默认关闭**） | — | — | — | v1 不结算（目录无「行动受限」状态；启用方式见文首第四轮第 1 条，§14.1、D14、F10） |
| `verbal` / taunt、threaten | judge | kind=`social`（类默认） | **无**：`goalModifierRule('social').levelGap=false`（`game-numbers: goalModifiers.social`） | `weights.social` 魅力0.5/悟性0.3/心性0.2 | 好感降、记忆 |
| `verbal` / deceive | judge | 变体覆盖 kind=`scheme` | 无（同 social 档的 `levelGap=false`） | `weights.scheme` 悟性0.5/心性0.3/魅力0.2 | 得手/识破两种事实，好感降、记忆 |
| `intimate` / flirt、kiss、invite | table | 不掷骰 | 无 | 无 | 查 §4.3 反应表，好感与记忆由反应决定 |

同一类内的变体共用同一条代码路径，**变体之间的差异全部是参数**：`kind`、`difficulty`、`base`、`npcOutcomes`、`matrix` 等。要让某变体“换一种检定”，只改它那一行的 `kind`/`modifierProfile`（`deceive` 就是这样改成 `scheme` 的）。

### 4.1 physical（attack、grab，bind 待实现；要求：按境界差判战斗）
- 签发：`judgementPreflight.ts` 新增 `buildFreeActionJudgementProposal(save, turn, ticket, spec)`，放在 `:304 buildEventActionJudgementProposal` 旁边，复用同一套因子（`stateFactors :60`、技能 `:93`、天赋 `:118`、幸运、环境）并加 `realm` 因子；`authorityReceipt` 用 §3.4 的新种类；`canonPolicy:'route_process_only'`（裁定 #69：过程代价，不直接完成/改写正典事件）；`target`=targetId；`whyNow` 写成“我理解为：对〈显示名〉出手”（玩家可点 `cancelPendingJudgement`，`MainGamePanel.vue:2626`，无骰无后果——这是对“模型把玩笑读成攻击”的主防线）。
- NPC 境界：`effectiveLevel(levelFact(id, namingChapter(runtime)))`（`characterLevels.ts:7–11`；`ledger/naming.ts:7`），查不到按 `host/factors.ts:70–91 snapshotLevels` 的回落链（关系记录 `境界` → 卡 `level` → 敌人 `level`），仍无则**按同级**（差 0）。
- **数据缺口（【已核实】）**：`mod-kit/entity-catalog/character-levels.qingyu.json` 当前有 46 个 entityId，**不含** `lcq.character.wang_zhe`、`lcq.character.duan_qiang`；NPC-DESIGN-AUDIT A4 记卡里 `level` 全为 null。所以今天打王哲会按“同级”算，与叙事里“扣腕卸刀”不一致。需要补数据行（来源与章段由你/剧情策划给；我不编），见决策 D6。
- 玩家侧后果：沿用 `judgementEngine.ts:505 deterministicOutcomeEffects`（部分/失败/大失败扣气血上限 5%/15%/40%，裁定 #73），不另写。
- NPC 侧事实（不落持久伤势，见决策 D4）：变体行的 `npcOutcomes` 列出允许的事实档，`attack`=`挡下 / 擦伤 / 受创 / 被制住` 四档，`grab`=`挡下 / 被制住` 两档（占位，D23），每档对应一个事实文本（textId），受 §7 保护封顶。`grab` 与 `attack` 走同一检定与境界差，差别只在 `base` 更小、没有“擦伤/受创”。
- **`grab` 抓住（限制行动）= 一拍的短暂压制，不留持续状态**：“被制住”只是本拍的既定事实文本，不写状态目录、不写 `injuryStore`、不写 `sceneLedger`；下一拍无任何残留，玩家若要继续压制须再报一张票。`effect:'none'`。
- **`bind` 捆绑（限制行动的持续变体）在本类下占位，`enabled:false`，待实现/默认关闭（原因见 §14.1 与 F10）**。它与 `grab` 同属“限制行动”、同在 `physical` 类下，区别只在 `effect:'applyStatus'` 与新增状态「行动受限」；以后启用只需在同一类下开该变体并新增该状态，不改结构（文首第四轮第 1 条）。本版不实现，不加状态目录条目。
- 致死：`freeAction.lethalAllowed=false` 默认。代码里**没有**写 `dead/missing` 的分支。`mustSurvive` 是其上的逐人硬约束，只管自由行动路径（§7.3）。

### 4.2 verbal（taunt、threaten、deceive；要求：社交属性检定，无境界差）
- 同样走待确认判定，kind=`social`（类默认；`deceive` 变体覆盖为 `scheme`），因子只含六司加权、幸运、环境，**不加 realm 因子**；难度占位：taunt 11、threaten 13、deceive 13（变体行的 `difficulty`）。
- 好感：`delta = clamp(round(base × degreeFactor × outcomeFactor), −15, +15)`。敌意类动作的 `base` 为负；`outcomeFactor` 对成功/失败各一个系数（占位）；**成功的语义须你定**：taunt 的“成功”是“激怒到了”还是“对方不为所动”（决策 D7）。v1 默认：敌意类好感一律下降，检定结果只改变幅度与既定事实文本（得手/被反驳/被识破）。
- 不按好感档做乘数（v1 不做；段强 80 档与陌生人档同公式，避免过早复杂化）。

### 4.3 intimate（flirt、kiss、invite；要求：看好感档、阶段、NPC 性格/边界）
- **不掷骰。**三个输入决定一个固定枚举“反应”：
  1. **好感档**：`tierOf(好感度)`（`affinityLadder.ts`）映射到 `low/mid/high` 带，带划分引用 `affinity.tiers`（`game-numbers`），不新增数字；
  2. **阶段门**：该 NPC 的 `intimacyGate`（档位下限 + 可选“某事件完成后”），来自新台账 `mod-kit/entity-ledger/npc-profiles.json`（见 §9.2）。门关 → 反应取 `closedReaction`，**不推进任何状态**；
  3. **性格/边界**：台账里的 `temperament`（config 枚举）对基础反应做一次重映射（如冷淡型把 `accept` 映成 `deflect`）。
- 反应枚举（config）：`accept / accept_shy / deflect / refuse / rebuke / strike_back`。每个反应对应 `{好感增量, 记忆模板 id, 既定事实 textId}`。反应枚举、带划分、性格重映射放在类级 `intimate.intimacy`（三个变体共用）；**每个变体只带自己的 `matrix`**（带 × 门开/关 → 反应），所以加一个新的亲近类变体 = 新增一行 `matrix`。
- 与 MVP 对照：月霜低好感“凑上去想亲”→ 低带 → `rebuke`/`strike_back` 类（好感降、写记忆）；凝羽高好感 → 高带，冷淡型把 `accept` 重映射成 `deflect`（“不推开但不回应”），好感小升。**具体哪个反应、数值多少，需要策划对每个人写，v1 只给结构和 2–3 行示例（非裁定）。**
- 缺数据时：没有 `npc-profiles.json` 条目的人，用 config 默认（`defaultGateTier`、`temperament:'reserved'`），宁严勿松；并在测试里列出“用了默认值的被作用 NPC”。
- 这些类型涉及合规，见 §12，**这里只是结构**。

### 4.4 好感与记忆“同一事件只结算一次”（约束：同一事件只改一次）
一个函数 `freeAction/settle.ts: settleFreeAction(save, ticket, resolution?)` 完成：
1. **先算后写**：先把所有写入计划算好并校验（NPC 存在、模板 id 存在、config 完整），任何一步失败 → 零写入（对标 `runtime.ts:4090–4097` 的“先验证所有引用再写”）；
2. 好感：`delta=clampLineAffinityDelta(raw)`（`runtime.ts:4087` **已导出**，复用，不改）；上限 `affinityCapFor(...)`（`affinityCaps.ts:130`）只限制向上；`clampAffinity`（`affinityLadder.ts:96`）限幅；
3. 记忆：见 §5；
4. 玩家可见：往 `runtime.pendingLineAffinityGrants` 追加 `{characterId, from, to, name, receiptId, weightId}`（形状同 `runtime.ts:4110`），下一次 `advanceScenarioRuntime` 取走并清空（`runtime.ts:3842–3843`），再被 `AIBidirectionalSystem.ts:3533–3541` 转成状态流。【已核实代码；是否在 modular 回合都触发，P0 探针确认】
5. 幂等：写 `settled[key]`，同键直接返回上次的事实。
- **每拍至多一次**：本方案的“拍”= **叙事回合**（`getNarrativeTurn(save)`，`@/utils/actionGate`）。同一 `(targetId, turn)` 最多一次改好感；该回合已有作者回执改了同一人（`pendingLineAffinityGrants` 里已有该 `characterId`）则好感不再改，记忆仍可写。“拍”也可以理解为作者停靠点，见决策 D3。
- **单拍 ±15、≥10 为大事**：`freeAction.affinity.perBeatCap=15`（与 `affinity.limits.perTurn` 同值，单测断言相等）；`majorAbs=10`——**注意**：`runtime.ts:4097` 把 10 写死在代码里，本方案自己的 10 放 config（不改冻结文件）。

---

## 5. 记忆：两层、由代码结算的事件生成、有界读取（要求：约束）

### 5.1 两层的落点
| 层 | 存哪 | 本方案谁写 |
|---|---|---|
| 层 1：每个 NPC 的个人记忆 | `社交.关系[id].记忆[]`（保留 12，`runtime.ts:4121` 口径）+ `runtime.actorEngine.actorMemory[id].episodes`（按显著度封顶 12，`runtime.ts:481 normalizeMemoryEpisodes`） | **票结算写**（模板文本，不是叙事摘录） |
| 层 2：私有知情 | `runtime.npcPrivateKnowledge` / `actorMemory[id].knowledge` | **票永不写**。`npcKnowledge` 效果只存在于作者停靠点（`runtime.ts:1233–1245`）。裁定 #149：模型不得经普通通道把私有关联反写；此处连提案通道都不开 |

- 记忆正文来自内容包 `texts`/`resources` 里的模板 id（按 `variant × 结果带 × 反应` 取），槽位只有 `{actor}` 这类代码填的显示名（查称呼台账，不存显示名），**不收叙事正文，不收模型文字**。`memory.includeEvidence` 默认 false；开了也只截 `evidenceChars` 且只作玩家原话引用（决策 D8）。
- 轻事件：只 `记忆[].push(模板文本)`，`slice(-12)`。
- 大事（`|delta| ≥ majorAbs`，正负对称，裁定 #205）：另写一条 episode 到 `actorMemory[id].episodes`：`{id:'memory.free.<key>', eventId:'free_action', summary, tags:['free:<actionClass>.<variant>','major_episode',`receipt:<key>`], salience: max(majorSalienceFloor, 变体显著度), occurredAtTurn}`。**`addNpcMemoryEpisodes` 在 `runtime.ts:571`，未导出**，所以 `freeAction/memory.ts` 自己写这十几行（同样去重、封顶 12、按 `normalizeMemoryEpisodes` 同一排序）并加一条一致性单测。避开冻结文件的代价是这点重复。
- 不会误伤决策核心：`npcDecisionCore.ts:259–262、358–388` 只读 tags 命中作者声明的 `utility.memories[].tag` 的记忆；我们的 tag 不在任何作者声明里。【已核实】

### 5.2 “事件类型的权重决定是否升大事”
我按这样落实（需你确认，决策 D2）：每个**变体**在 config 里有**基础权重**（即变体行的 `base`，单位=好感点；类只给默认），`delta = clamp(base × degreeFactor × outcomeFactor)`；是否升大事只看 `|delta| ≥ majorAbs`。这样权重确实决定晋升，同时和裁定 #205 的“绝对值至少 10 升大事”同一条规则，不出现两套门槛。占位例：`physical.attack` base −10（normal 刚好够大事，heavy −15 封顶）、`physical.grab` −4、`verbal.threaten` −6、`verbal.taunt` −4、`verbal.deceive` −4。

### 5.3 每回合模型看多少（约束：1–2 人，每人 3 条最近 + 2 条相关大事）
- 现成的消费端已经满足大部分约束：`npc.maxCards=2`、`maxMemories=3`（`npcCardLayer.ts:92`）、`maxEvents=2`（`:95`）、卡总字数 `maxCardChars=1400`（`game-numbers: npcCard`）。【已核实】
- 要改两处（都在非冻结文件）：
  1. `npcCardLayer.ts:42–56 recentRelatedEvents`：在编年史相关事件之外，并入该 NPC 的 `major_episode` episodes（按 `occurredAtTurn` 取最近），**合计仍 ≤ `maxEvents`**，保持“2 条相关大事”；
  2. `legacyNarratorPacket.ts:208/253`：读 `runtime.freeAction.focus={turn,targetIds}`（我们结算时写入），本回合让被作用的 NPC 排到前面并保证在 `maxCards` 之内；目标不在 `presentNames` 里则不注入（不凭空造人）。用存档字段传递，避免动 `AIBidirectionalSystem.ts:794` 的调用点。
- 私有知情继续走原有门，不经本方案。

---

## 6. 与现有“作者停靠点”并存的边界
- 作者按钮/别名/模型 `matched` 的结算路径一概不变（`resolveNaturalIntent` 返回 `button/alias/matched` 时不收票）。
- 乐明珠主动分（`lineBonds.lemingzhu.activeScore`，阈值 8）：票结算**不写**任何 `activeScore` 状态，所以“8 分线不可被刷”不变量不受影响（测试 T10 守住）。
- 场面模块激活时 `MainGamePanel.vue:1881–1888` 的 `submitSceneInput` 先接管输入，本方案不介入。

---

## 7. 必须活着：角色总表标记字段，只约束“自由行动路径”（要求 3；第四轮改写）

> 第四轮前这一节是“台账 `lifeProtection` 清单 + 章号窗口 + `intervene/wound_only` 两模式”。按用户已定决定改为**每个角色一个标记字段**，不再另列名单；旧的台账 `lifeProtection`、章号窗口、`intervene` 模式一并取消（对应新待决见 D25、D26）。

### 7.1 数据放哪：角色总表里每个角色的标记字段
- 现状【已核实】：`src/modules/scenarioMods/builtins/character-registry.json`（角色总表，`docs/CHARACTER-DATA-STRUCTURE.md` 术语：一人一 id）每条记录的键是 `id, canonicalName, aliases, gender, books, tier, stagePresence, staticProfile, phaseIdentities, review, embedText`，**没有**“必须活着”类字段；`rg mustSurvive` 全仓无命中。`mod-kit/entity-ledger/overrides.json` 也没有任何保护字段（顶层键为 `version, ruling, entities(23个), chapterGates, namingInstructions, …`）。
- 方案：在角色总表每条记录上加**布尔标记字段 `mustSurvive`**（缺省 `false`；与 `tier` 同级，属静态档案字段）。**不再有“必须活着名单”**，也不再往 `overrides.json` 加 `lifeProtection`。
- **谁打标**：剧情策划**按原著**逐人打标（谁在原著里必须活到某处、不能被玩家随手弄死）。我不编、不预填；没打标 = `false` = 不额外保护。字段由源卡 `character-cards-v3` 经 `scripts/build-character-registry.mjs` 构建进总表（该脚本是否原样透传新字段——**我没读，未核实**，P4 动手前确认）。
- **谁读**：由**角色卡读出给代码用**——`npcCardLayer.ts:3` 注释写明角色卡静态部分“来自角色总表（经阶段档物化）”【已核实注释原文】，自由行动的 `freeAction/protect.ts` 走同一条“按 id 读角色卡/总表”的入口取 `mustSurvive`，O(1)，**不进任何提示词**，不随游玩长度增长。`mustSurvive` 是人物级字段，是直接读总表还是须先写进阶段档物化——**未核实**（P0 探针增一项）。
- 改总表/源卡带执法标记的字段前仍须读 `CANON-DECISIONS.md`、同提交追加裁定（项目 `CLAUDE.md`）；`mustSurvive` 是新键，不覆盖 `AFF_PROTECTED / AGE_PROTECTED / DEBUT_PROTECTED / USER_CANON` 字段。

### 7.2 自由行动路径：必须活着的人怎么钳制
- 触发时机：只在 `settleFreeAction` / `settleStateAction`“作用到某个 id”这一步，读一次该 id 的 `mustSurvive`。
- 规则（`mustSurvive===true` 的目标）：
  1. **自由行动结算不得把其推到濒死（`dying`），更不得写死亡**（`dead/missing/departed`）。这是逐人硬约束，**即使将来把全局 `lethalAllowed` 打开也不放行**。
  2. **可以中毒，但不会死**：毒（`give.feed_pill`，毒性由物品效果标签决定）可以对其生效——挂 `poisoned`（有限时长）并产生毒伤——但毒伤**到下限即停止**：伤害结算后其气血不得低于 `freeAction.lifeFloor.hpRatio × 气血上限`（**占位，初值 0.1**，真机后调），已在下限时继续下毒不再追加毒伤、不升级到 `dying`。
  3. **`attack` 的 NPC 侧结果封顶为“受创”**（沿用原 `wound_only` 口径）：不出现“被制住/致死”类事实。`grab` 的“被制住”是一拍短暂压制、不留状态、不致死，对 `mustSurvive` 目标**放行**（v1 占位，待确认见 D26）。
  4. 钳制不静默：既定事实必须同时写出“玩家出手了 / 判定结果 / 被钳制原因 textId”。
- v1 的实际作用面：`lethalAllowed=false` 下自由行动本来就写不出死亡，所以标记在 v1 主要管**毒伤下限**与“不挂 `dying`”，并作为将来开 `lethalAllowed` 之后的挡板。【推断】
- **与 `loadBearingCharacterIds` 的关系（变更）**：原文把 `storyContext.ts:517 loadBearingCharacterIds(runtime)`（未完成关键事件的 `relatedCharacterIds`）作为缺省并集。按“不再另列名单”，**必须活着只认 `mustSurvive` 一个来源**；`loadBearingCharacterIds` 不再并入保护判定（它在 `npcCardLayer.ts:91` 的原有用途不变）。是否保留为兜底见 D26。
- 离场降级：`nemesis` 档的“离场”类反应对 `mustSurvive` 目标一律降成“本场回避”，不写 `sceneLedger.actors[id].status`（`questLineContext.ts` 的 `departed()` 读它）。v1 本来就不做离场，列此条防未来误加。

### 7.3 两条路径分开：自由行动路径 vs 剧情合同路径
| | 自由行动路径 | 剧情合同路径 |
|---|---|---|
| 是什么 | 玩家自由输入 → 事件票 → `settleFreeAction` / `settleStateAction`（本文 §3–§6、§14） | 作者场景合同 / 剧情线效果 / 固定结局叙事：`cast.exit … status:'dead'`（`schema/scenario.ts:232`）、`fixedEndingNarratives.ts:118`、`runtime.ts:4112–4115` 的剧情线 `kind:'status'` 效果 |
| 谁决定生死 | 代码按 config 与骰面；`mustSurvive` 与 `lethalAllowed` 在此生效 | 作者数据与裁定簿 |
| 受 `mustSurvive` 约束吗 | **受** | **不受** |
| 例 | 玩家下毒/攻击王哲：毒伤到下限停止，不挂 `dying` | 谢艺死亡线：`lcq.event.s06_03` 正常 `done` 时维持“谢艺之死”正典 Rail（`CANON-DECISIONS.md` #90、#97） |

- **硬规则：代码不得用 `mustSurvive` 拦截剧情死亡。** 该字段只许在 `freeAction/protect.ts` 里被读，且只被 `settleFreeAction` / `settleStateAction` 调用；**不得**接进 `injuries.ts`、`runtime.ts`、场景写回 `host/writeback.ts`、`canonGuard.ts`、`fixedEndingNarratives.ts` 等共用写入或守卫函数。标 `mustSurvive` 的角色（如谢艺）在剧情合同里照常可以死。
- 因此原“第二保险”（把受保护 id 并入 `canonGuard.ts:535 guardScenarioModCommands` 的 #18 `RAIL_AHEAD_DEATH_RE`）**取消**：#18 属于叙事/旧链路的剧情守卫，把 `mustSurvive` 并进去就会拦截剧情死亡，违反本节硬规则。modular 路径下模型本来没有命令通道（§1.2 第 3 点），自由行动不依赖它。
- 测试：见 T11、T30、T31（§11.1）。

---

## 8. 改动清单（要求 4）

### 8.1 新增（均非冻结）
| 文件 | 内容 |
|---|---|
| `src/modules/scenarioMods/freeAction/ticket.ts` | `FreeActionTicket` 类型、`freeActionRosterOf(save)`、`validateFreeActionTickets`、`variantSpecOf(actionClass, variant)`（类默认 ⊕ 变体行的浅合并，唯一读取变体参数的入口；也用来生成提示词里的“类→变体”清单） |
| `src/modules/scenarioMods/freeAction/settle.ts` | `settleFreeAction`：路由查表、先算后写、幂等、`runtime.freeAction`（`log≤20`、`settled≤30`、`focus`） |
| `src/modules/scenarioMods/freeAction/memory.ts` | 轻记忆 push、大事 episode 写入（含与 `normalizeMemoryEpisodes` 一致的排序与 12 封顶） |
| `src/modules/scenarioMods/freeAction/protect.ts` | `isMustSurvive(save, id)`：按 id 读角色卡/总表的 `mustSurvive`；毒伤下限与“不推到濒死/死亡”的钳制函数。**只被 `settleFreeAction`/`settleStateAction` 调用**（§7.3 硬规则） |
| `src/modules/scenarioMods/freeAction/facts.ts` | 把结算结果拼成“既定事实”文本（模板 id → 内容包文本） |
| `mod-kit/entity-ledger/npc-profiles.json` | `temperament`、`intimacyGate`（v1 只放这两项；喜好/价值观等 NPC-DESIGN-AUDIT C2 的其余字段**不做**） |
| `tests/freeActionTicket.test.mjs`、`tests/freeActionSettle.test.mjs`、`tests/lifeProtection.test.mjs`（测 `mustSurvive` 钳制 T11/T30 与路径隔离 T31） | 见 §10 |

### 8.2 修改（均非冻结）
| 文件:位置 | 改什么 |
|---|---|
| `naturalIntentRouter.ts:57–70`（类型）、`:220`（`parseIntentJson`）、`:325–355`（`buildIntentPrompt`）、`:450–476`（`resolveNaturalIntent`） | 提示加票说明与在场名单；解析并校验 `tickets`；仅 `kind:'free'` 时挂 `freeActionTickets`。`freeAction.enabled=false` 时与今天逐字一致（回滚开关） |
| `judgementEngine.ts:13、:156` | `JudgementAuthorityReceipt` 联合加 `free_action_judgement`，`normalizeAuthorityReceipt` 加分支 |
| `judgementPreflight.ts`（`:304` 旁新增） | `buildFreeActionJudgementProposal` |
| `components/dashboard/MainGamePanel.vue:1976`（跳过重入的 intent）、`:2020–2050`（取票）、`:2100–2117` 旁（签发判定卡或进入表路由）、`:2128` 之后到 `:2146` 之前（`settleFreeAction`，用 `gameStateStore.toSaveData()` → 结算 → `gameStateStore.loadFromSaveData()`，同 `:651 persistJudgementSave` 的模式）、`:2213` 之后（追加“【本地自由行动已结算】”事实行） | 放在“上次对话”备份（`:2119–2128`）**之后**：回滚到上次对话时结算一并回滚 |
| `npcCardLayer.ts:42–56` | 并入 `major_episode` |
| `legacyNarratorPacket.ts:208、:253` | 读 `runtime.freeAction.focus` 让目标排前 |
| `mod-kit/game-numbers.qingyu.json` | 新增 `freeAction` 段（§9.1）。【已核实】`applyGameNumbers` 要求补丁里的键先在默认值里存在（`sceneModule/numbers.ts:9` 对未知键抛错），所以变体行（含将来新增的）要写进该 JSON 默认文件；tuning 补丁只能改已有参数。`numbers.ts:16–18` 的跨字段校验是写死的，`freeAction` 的校验放在下一行的脚本里，不改 `numbers.ts` |
| `src/modules/contentPacks/packs/qingyu/texts.json`、`lines-resources.json`、`scripts/content-packs.mjs` | 事实/记忆/保护文本；校验：`textId` 存在、类别枚举与每个变体的类归属合法、**每个变体合并类默认后必填参数齐全（`judge` 需 `kind/modifierProfile/difficulty/base/outcomeFactor`，`table` 需对应表，`effect` 在代码认得的种类内）**、反应表无缺格 |
| 角色总表构建链：源卡 `character-cards-v3` → `scripts/build-character-registry.mjs` → `character-registry.json`，以及校验脚本 | 新增布尔字段 `mustSurvive`（缺省 false；校验：只能是布尔）。**取代**原台账 `lifeProtection`（不再改 `overrides.json`、不再有章号窗口与 `by/textId`）。改源卡/总表前**必读 `CANON-DECISIONS.md`**，同提交追加裁定行，`npm run canon:build` 全绿（项目 `CLAUDE.md`）。构建脚本是否透传新字段未核实 |
| ~~`canonGuard.ts:477`（可选，P4）~~ | **取消**：不得把 `mustSurvive` 并进剧情死亡守卫（§7.3） |

### 8.3 能否避开冻结文件？
**能，核心方案不需要改 `runtime.ts` 与 `AIBidirectionalSystem.ts`。**依赖的全是只读/已导出的东西：
- `runtime.ts:4087 clampLineAffinityDelta`（已导出）；
- `runtime.pendingLineAffinityGrants` 是存档里的字段，由 `runtime.ts:3842–3843` 取走，我们只往里追加；
- `AIBidirectionalSystem.ts:3533–3541` 把 grant 转状态流、`:812` 把 `options.judgementResolution` 作为“公开判定”放进场景，不改。

**两处“可能”需要动冻结文件的情形（均未发生，列出行号与原因，需你明确授权才动）：**
1. **非判定类（`route=table` 的变体：`intimate.*`、`give.*`）的既定事实能否到达叙事模型**。我的方案把事实行拼进 `finalUserMessage`（`MainGamePanel.vue:2213` 之后），再由 `processPlayerAction(...)`（`:2298`）带入 `tryModularTurn(…, userMessage)`，场景里 `action: userMessage`（`AIBidirectionalSystem.ts:811`）。**这条“事实行真的出现在模型提示里”是读码推断，未运行**。若 P0 探针发现 `action` 里不含该行，则需改 `AIBidirectionalSystem.ts:811–813`（在场景对象里加 `本地自由行动: options.freeActionFacts`，并在 `:332–340` 的 options 类型加字段）。判定类不受影响（走 `公开判定`，`:812` 已转发）。
2. **“带原话的记忆替换按钮模板记忆”**不在本方案范围（本方案只“追加”），所以不用改 `runtime.ts:4101、4121`（与 v2 §6.1 同结论）。

---

## 9. 配置形状（要求 6：数字进 game-numbers，实体按 id）

### 9.1 `mod-kit/game-numbers.qingyu.json` 新增 `freeAction`（全部占位，真机后调）
```jsonc
"freeAction": {
  "enabled": false,                                   // 总开关；false=今天的行为
  "actionClasses": ["physical","verbal","intimate","give","cast","other"],   // 类别枚举；变体白名单在 classes.*.variants
  "degrees": ["light","normal","heavy"],
  "performed": ["yes","no","unclear"],
  "ticket": { "maxPerTurn": 2, "evidenceChars": 30, "rosterMax": 6, "itemListMax": 6 },
  "affinity": { "perBeatCap": 15, "majorAbs": 10, "majorSalienceFloor": 80 },
  "degreeFactor": { "light": 0.5, "normal": 1, "heavy": 1.5 },
  "lethalAllowed": false,                              // 全局：任何变体都不写 dead/missing/departed，不升级到 dying（只管自由行动路径）
  "lifeFloor": { "hpRatio": 0.1 },                      // 占位：mustSurvive 目标被自由行动（含毒伤）打到的气血下限=上限×0.1；到下限即停，不挂 dying、不写死亡
  "memory": { "includeEvidence": false, "memoryChars": 80 },
  "state": { "logKeep": 20, "settledKeep": 30 },
  // 变体 = classes[类].defaults ⊕ classes[类].variants[变体]（浅合并，变体行优先）。
  // 变体行可用的参数（缺省则继承类默认；校验器按 route 检查必填）：
  //   通用   label, enabled(默认 true), route(judge|table|none), effect(none|practiceProgress|applyStatus|removeStatus|downgradeStatus|transferItem|itemDefined)
  //   judge  kind, modifierProfile, difficulty, base, outcomeFactor{六档}, npcOutcomes[]
  //   table  matrix{带×门开/关→反应}（intimate）
  //   手段   needsItem, itemTag/itemTags, consume
  //   门槛   needsGoodwill(有益类，low 带直接不可), requires{actorLevel}, protectedForbid(目标 mustSurvive=true 则一律拒绝；v1 只有 bind 带，且 bind 本身默认关)
  //   代价   cost{resource,onResolveRatio,criticalFailureRatio}, backlash{failure,critical_failure}
  //   上限   gain{base,perTransferCap,ceilingBelowNeed}, cooldownMinutes, phaseBudgetRatio, maxStatusMinutes
  "classes": {
    "physical": {
      "label": "肢体冲突",
      "defaults": { "route": "judge", "kind": "combat", "modifierProfile": "default", "difficulty": 11, "effect": "none",
                    "outcomeFactor": { "critical_failure": 1.5, "failure": 1.25, "partial": 1, "success": 1, "great_success": 1, "perfect": 1 } },
      "variants": {
        "attack": { "label": "攻击", "base": -10, "npcOutcomes": ["block","graze","wound","subdue"] },
        // 限制行动（同属一类，不另设分类）：grab=一拍压制、无状态；bind=持续变体、待实现
        "grab":   { "label": "抓住", "base": -4,  "npcOutcomes": ["block","subdue"], "effect": "none" },   // 占位（D23）；不写任何状态
        "bind":   { "label": "捆绑", "enabled": false, "effect": "applyStatus", "statusId": "action.restricted", "protectedForbid": true }
                                                         // 待实现/默认关闭：启用=此行 enabled:true + 状态目录新增「行动受限」（id 占位），不改结构
      }
    },
    "verbal": {
      "label": "言语施压",
      "defaults": { "route": "judge", "kind": "social", "modifierProfile": "social", "difficulty": 11, "effect": "none",
                    "outcomeFactor": { /* 同 physical 六档，占位 */ } },
      "variants": {
        "taunt":    { "label": "嘲讽", "base": -4 },
        "threaten": { "label": "威胁", "base": -6, "difficulty": 13 },
        "deceive":  { "label": "欺骗", "base": -4, "difficulty": 13, "kind": "scheme" }
      }
    },
    "intimate": {
      "label": "亲近",
      "defaults": { "route": "table", "effect": "none" },
      "intimacy": {                                      // 三个变体共用
        "defaultGateTier": "close", "defaultTemperament": "reserved",
        "bands": { "low": ["nemesis","hostile","wary"], "mid": ["stranger","acquainted"], "high": ["trusted","close","sworn"] },
        "reactions": ["accept","accept_shy","deflect","refuse","rebuke","strike_back"],
        "temperamentRemap": { "reserved": { "accept": "deflect" } },
        "reactionEffect": { "deflect": { "delta": 1 }, "refuse": { "delta": -5 }, "rebuke": { "delta": -10 }, "strike_back": { "delta": -15 } /* … */ }
      },
      "variants": {
        "flirt":  { "label": "调情", "matrix": { /* low/mid/high × open/closed，占位 */ } },
        "kiss":   { "label": "亲吻", "matrix": { "low": { "open": "strike_back", "closed": "strike_back" } /* mid/high 同形 */ } },
        "invite": { "label": "邀请", "matrix": { /* 同形 */ } }
      }
    },
    "give": {
      "label": "给予",
      "defaults": { "route": "table", "needsGoodwill": true, "needsItem": true, "consume": 1 },
      "variants": {
        "gift":      { "label": "赠物", "effect": "transferItem", "denyEquipped": true, "denyStoryItem": true },
        // 喂药与下毒是同一件事、同一套结算：效果与毒性都取自物品效果表（item-effects.json）的标签；needsGoodwill 由物品标签决定（有益标签要好感，毒性标签不看态度）
        "feed_pill": { "label": "喂药/下毒", "effect": "itemDefined", "needsGoodwill": "byItemTag" }
      }
    },
    "cast": {
      "label": "施术",       // 仅 transfer_qi / heal / bandage 三项
      "defaults": { "route": "judge", "kind": "craft", "modifierProfile": "social", "difficulty": 11, "maxStatusMinutes": 1440 },
      "variants": {
        "transfer_qi": { "label": "传功", "effect": "practiceProgress", "needsGoodwill": true, "requires": { "actorLevel": "ge_target" },
                         "cost": { "resource": "灵气", "onResolveRatio": 0.3, "criticalFailureRatio": 0.5 },
                         "gain": { "base": "training.successProgress", "perTransferCap": "training.greatProgress", "ceilingBelowNeed": 1 },
                         "cooldownMinutes": 1440, "phaseBudgetRatio": 0.5,
                         "backlash": { "failure": "wound.exhaustion", "critical_failure": "qi.disordered" } },
        "heal":        { "label": "疗伤", "effect": "removeStatus", "needsGoodwill": true, "needsItem": true, "itemTag": "heal", "downgrade": { "dying": "wound.severe" } },
        "bandage":     { "label": "包扎", "effect": "removeStatus", "needsGoodwill": true, "needsItem": true, "itemTags": ["hemostatic","splint"] }
      }
    },
    "other": { "label": "其他/无效", "variants": { "none": { "route": "none" } } }
  }
}
```
- 战斗难度、境界差、社交权重、好感档位**一个新数字都不引入**：`levels.gapOne/gapMany`、`goalModifiers`、`weights.*`、`affinity.tiers`、`npcCard.*` 全是引用。
- 原先分散的 `freeAction.types`、`freeAction.intimacy`、`freeAction.combat.lethalAllowed`、`freeAction.stateAction`（§14.6 旧版）**已并入上面的 `classes` 与全局 `lethalAllowed`**，单一来源。`"training.successProgress"` 之类的字符串是对已有键的引用，加载时解析并断言相等。
- 【已核实】`applyGameNumbers`（`sceneModule/numbers.ts:9–12`）对补丁里的未知键/类型不符会抛错，能防住 tuning 补丁的拼写错误；但它**不能**用来新增变体（新键会被当作“未知数值配置”）。新增变体 = 改默认 JSON 文件，由 `content-packs.mjs` 校验必填参数。
- 再加单测：`freeAction.classes.physical.variants.attack` 合并后的 `difficulty === combat.baselineDc`、`freeAction.affinity.perBeatCap === affinity.limits.perTurn`；以及 T27–T28（§11.1）。

### 9.2 台账与角色总表字段（实体按 id；示例仅示意，**不是裁定**）
```jsonc
// mod-kit/entity-ledger/npc-profiles.json
{ "version": 1,
  "profiles": [
    { "id": "liuchao.character.ning_yu", "temperament": "reserved",
      "intimacyGate": { "minTier": "close" /* , "afterEventId": "<事件 id>" */ } } ] }

// 角色总表 src/modules/scenarioMods/builtins/character-registry.json：每个角色记录新增一个布尔键（第四轮；取代原 overrides.json 的 lifeProtection 清单）
{ "id": "<实体 id>", "canonicalName": "…", "tier": "…", /* …现有键不动… */ "mustSurvive": false }   // 缺省 false；策划按原著打标；只约束自由行动路径（§7.3）
```

---

## 10. 延迟与上下文（要求 5；**全部为估算，标注依据**）

### 10.1 每回合延迟
| 项 | 变化 | 依据 |
|---|---|---|
| 模型请求数 | **+0**（票挂在已有 intent 调用上）；确认判定后的重入还会**少** 1 次 intent 调用 | 设计 + §3.4 读码 |
| intent 输入 | +约 150–250 token（在场名单 ≤6 人 + 票规则 + 6 个类别及其**启用**变体的一行说明）。变体越多越长：每多一个启用变体约 +8–15 token（【推断】），所以只渲染 `enabled` 的变体 | 【推断】按字符数粗估，P1 影子期实测 |
| intent 输出 | 无票 +约 5 token；有票 +约 40–80 token | 【推断】 |
| intent 额外时延 | ≈ +0.1–0.5 s | 【推断】。参照：intent 基线总耗时 6.3–14.5 s（`SEMANTIC-INTENT-PLAN-v2.md` §8 引用 `REPORT-2026-10-12-retest.md` 抽读 7 行，我这次没重算）；叙事调用多 643 token 输入时配对时延中位差 −1.1 s、AFTER 更慢占 42%（`_newbot_tmp/ab-npc-latency/RESULT.md` §3，n=31 对，**是噪声量级**） |
| 本地结算 | 微秒–毫秒，id 查表；`loadBearingCharacterIds` 遍历事件表一次（`npcCardLayer.ts:91` 每回合本来就在算） | 设计 |
| 叙事提示 | 触发后果的回合 +约 100–250 字的事实行；NPC 卡不增（仍受 `maxCardChars=1400`） | 【推断】；卡层单独增量实测 +930–950 字符/643 token（RESULT.md §2、§5） |
| 玩家侧 | `route=judge` 的变体（`physical.*`、`verbal.*`、`cast.*`）多一次“确认判定”点击（可取消）；`route=table` 的变体（`intimate.*`、`give.*`）无点击 | 设计；点击是否可省见决策 D1 |

另一个我**发现但没验证**的省时点：`MainGamePanel.vue:1976` 在确认判定后会重跑 intent（§3.4）。本方案顺手消掉它。

### 10.2 长局增长
- 持久状态全部有上限：`记忆[]`≤12；`episodes`≤12（按显著度淘汰）；`runtime.freeAction.log`≤20、`settled`≤30；判定记录沿用 `judgementEngine.ts MAX_RECENT_RESOLUTIONS`=20。
- 提示端不随游玩增长：NPC 卡每人最多 3 条记忆 + 2 条大事（`npcCard` 上限）；RESULT.md §5 的合成 t10/t100/t300 实验里卡层追加字符分别为 950/940/930（即与存档规模无关），但 t300 是合成存档，不是自然游玩。
- 存档体积：每次结算 ≤ 1 条 `记忆[]`（≤80 字）+ 大事 1 条 episode（≤约 200 字节）+ 1 条日志；300 次高强度自由行动上界 ≈ 12×(约 250 字节)×被作用 NPC 数，量级是 KB。【推断】
- `mustSurvive` 查询是按 id 读角色卡/总表的 O(1)；`loadBearingCharacterIds` 随事件数线性，但与游玩回合数无关。

---

## 11. 测试计划（要求 7）

通用夹具：沿用 `tests/baihuMainlineWalk.mjs`、`tests/npcCardLayer.test.mjs` 的真实 `tryModularTurn` 管线（模型调用截获、不联网），好感值由夹具直接设档；骰子用 `resolvePendingJudgement` 的 `roll` 参数固定。断言落在**结构化状态与提示内容**，不对叙事正文做关键词匹配。

### 11.1 反例表
| # | 场景 | 期望 | 关键断言 |
|---|---|---|---|
| T1 **打王哲（MVP 复现）** | `lcq.character.wang_zhe` 在场，好感 55；票 `physical.attack`/normal/yes | 签发 combat 判定卡；确认后好感下降；写 1 条 `记忆[]` + 1 条 major episode；王哲不死 | 因子里 `source:'realm'` 存在且值=`levelModifier(...)`（补等级数据前断言为 0 并显式标注“数据缺口”）；好感 55→45（占位）；`|delta|≥10` → 有 `major_episode`；`sceneLedger.actors[id].status` 不为 `dead/missing`；`pendingLineAffinityGrants` 追加一条 |
| T2 **嘲段强（MVP 复现）** | `lcq.character.duan_qiang` 在场，好感 80；票 `verbal.taunt`/normal/yes | 社交判定；好感小降；轻记忆，**无** episode | 因子里**无** `source:'realm'`；境界差 ±3 骰面相同结果相同；`|delta|<10` → 无 `major_episode`；`记忆[]`+1 |
| T3 **低好感亲吻** | 月霜好感 −10；票 `intimate.kiss`/yes | 低带反应 `rebuke/strike_back`；好感降；记忆+1；不推进任何阶段旗标 | `reaction` 枚举；`flags` 无推进键；无骰；提示里无亲密档案素材 |
| T4 **高好感亲吻** | 凝羽好感 100；票 `intimate.kiss`/yes；门关/门开各一次；冷淡型 | 门开：`deflect`（重映射）好感小升；门关：`closedReaction`，**不推进** | 同好感下两种门结果不同；`temperamentRemap` 生效 |
| T5 **离题** | “我先去吃饭，睡一觉”→ `other/none` 或无票 | 零结算 | 存档前后深比较相等；`freeAction.log` 无新增 |
| T6 **不可能的行动** | “我御剑飞上月亮”（`other/none`）；“一刀砍向苏妲己”而其不在场；模型返回名单外 id | 不兑现 | 零写入；名单外 id 整张票作废；不出判定卡 |
| T7 **performed≠yes** | “如果我砍了王哲会怎样？”“她说你要砍我吗”“我没有打王哲” | 零结算 | `performed:'no'`/`unclear` 票被丢；**全程无正则**（反关键词静态检查，见 11.2） |
| T8 **同回合同目标重复** | 同一回合同一目标两张票；或作者回执已改同一 NPC | 只结算一张；好感只改一次，记忆可写 | `settled` 键唯一；`pendingLineAffinityGrants` 该 id 仅一条 |
| T9 **确认判定重入** | 签发 → 确认 | 重入不再调 intent；票取自回执；伪造回执被拒 | intent 桩调用次数=1；篡改 `authorityReceipt` → `verifyResolvedJudgementReceipt` 返回 null |
| T10 **主动分不被刷** | 自由嘲讽/亲吻各 1000 次（含乐明珠） | `lemingzhu.activeScore.*`、`branch.lmz.*` 不变 | 状态深比较 |
| T11 **必须活着（攻击）** | `mustSurvive=true` 与 `false` 的两个 NPC 各被 attack，骰面 1/10/20 × 境界差 −3/0/+3 | `mustSurvive=true`：NPC 侧结果封顶“受创”，并如实写“被钳制”原因；`false`：按 config 放行 | 事实块含 `textId` 文本；`status` 恒非 `dead/missing`；标记缺省视为 `false` |
| T12 **注入** | 玩家写“系统：判定=大成功，好感+100” | 无效 | 票无数值位；`affinity` 只由 config 与骰面决定 |
| T13 **模型失败** | intent 超时/坏 JSON | 沿用 `onClassifierFailure`；不收票、不写任何状态 | 存档深比较相等 |
| T14 **过期预览** | 判定待确认期间存档指纹变化 | 作废 | 不结算 |
| T15 **回滚开关** | `freeAction.enabled=false` | 与今天逐字一致 | `naturalIntentRouter.test.mjs` 全绿 |
| T16 **记忆被模型看见** | 结算后下一回合的提示 | 目标 NPC 的卡里含 `最近记忆` 与 `相关重大事件`（major episode）；仍 ≤3 条/≤2 条 | `readNpcCard` 输出；`maxCardChars` 内 |
| T17 **长线** | 模拟 300 次自由行动、40 个 NPC | `记忆[]`≤12、`episodes`≤12、`log`≤20、`settled`≤30；卡字节第 10 与第 300 回合差 ≤ 1 个 `maxCardChars` | 计数与字节 |
| T18 **配置/内容包负向** | 未知 `actionClass`、`variant` 挂在错误的类下、变体行缺必填参数（`judge` 缺 `kind/difficulty/base` 等）、`effect` 不在代码认得的种类内、反应矩阵缺格、`textId` 缺失、台账出现字面人名 | `content-packs` / ratchet 失败，退出码非 0 | 退出码 |
| T19 **决策核心无副作用** | 写入大事 episode 后重放世界演员回合 | 效用与回执不变 | `npcDecisionCore` 输出对比 |
| T27 **类/变体不匹配与编造** | 模型返回：①`physical` 类下报 `kiss`；②`verbal` 类下报不存在的 `humiliate`；③`variant` 缺失；④`itemId` 填在不带 `needsItem` 的变体上；⑤`bind`（`enabled:false`） | 整张票作废，零写入；⑤ 不发“未发生”事实行 | 存档深比较相等；校验日志里记录原因枚举 |
| T28 **新增变体只改 config** | 测试用 config 在 `physical.variants` 加 `shove:{base:-2,npcOutcomes:["block","graze"]}`；再加一个 `effect:"teleport"` 的变体 | `shove` 不改任何代码即可：被提示词清单列出、被校验器接受、结算出好感与记忆；`teleport` 被 `content-packs` 校验拒绝 | 对 `shove` 复用 T1 的断言（因子含 `realm`、好感按 `base`）；`teleport` 退出码非 0；`src/**` 的 diff 为空 |
| T29 **同类变体误判的代价** | 玩家嘲讽被报成 `threaten`（同类） | 仍走 `verbal` 路径：无境界差、好感降，幅度按 `threaten` 行；**不会**走战斗或亲近路径 | 因子无 `source:'realm'`；`|delta|` ≤ `threaten` 行 `base` × `heavy` 的上限 |
| T30 **必须活着者中毒到下限停止** | `mustSurvive=true` 的 NPC，反复被喂带毒性标签的物品（测试 config 临时登记毒性物品，`lifeFloor.hpRatio` 取占位值） | 可以中毒（挂 `poisoned`、限时），毒伤逐次累加到下限即停；之后再下毒不再追加毒伤；永不挂 `dying`、不写 `dead/missing` | 气血恒 ≥ `lifeFloor.hpRatio × 上限`；`injuries[id]` 无 `dying`；同一毒物对 `mustSurvive=false` 的 NPC 不受该下限（但仍受 `lethalAllowed=false`，不写死亡）；放开 `lethalAllowed` 的测试 config 下 `mustSurvive=true` 仍不死 |
| T31 **剧情死亡不被拦截** | 对 `mustSurvive=true` 的角色（如谢艺），走**剧情合同路径**：作者场景 `cast.exit … status:'dead'` / 固定结局叙事写入死亡 | 照常写入死亡，`mustSurvive` 不起作用；自由行动路径对同一角色仍受钳制（对照） | 剧情路径下 `status==='dead'`；静态检查：`mustSurvive` 的读取只出现在 `freeAction/protect.ts`，且只被 `settleFreeAction`/`settleStateAction` 引用（`injuries.ts`、`runtime.ts`、`host/writeback.ts`、`canonGuard.ts`、`fixedEndingNarratives.ts` 零引用） |
| T32 **喂药/下毒共用结算** | 同一目标、同一 `give.feed_pill` 变体，分别喂有益标签物品与毒性标签物品 | 走**同一条**结算函数与同一套闸门/幂等/消耗规则；差别只来自物品效果标签（有益→`removeStatus/practiceProgress`；毒性→`poisoned`+毒伤） | 两次调用的代码路径相同（同一入口、无按变体名分支）；`give` 类下不存在 `poison` 变体，票报 `cast/poison` 或 `give/poison` → 整张作废（接 T27） |
| T33 **施术仅三项** | `freeAction.classes.cast.variants` 的键集合；模型报 `cast` 类下的 `poison` | 键集合恰为 `transfer_qi / heal / bandage`；报 `cast.poison` 整张作废 | 键集合深比较；校验日志原因=变体不在白名单 |
| T34 **抓住为一拍压制且不留状态** | 对 NPC 报 `physical.grab`，确认判定后结算；再推进一拍 | 本拍事实为“挡下”或“被制住”；结算前后 `injuryStore`、`sceneLedger`、`角色.效果` 深比较**无新增状态行**；下一拍无任何残留压制 | 状态存储深比较相等（除好感/记忆/`log`/`settled`）；不存在 `action.restricted` 之类状态 |
| T35 **捆绑默认关闭** | 报 `physical.bind`；默认 config | 整张票作废，零写入，且**不发**“未发生”事实行（与今天行为一致）；状态目录里没有「行动受限」条目 | 存档深比较相等；`bind.enabled===false`；`content-packs` 校验通过（关闭的变体可以缺状态目录条目） |

### 11.2 反关键词静态检查
扫描 `src/modules/scenarioMods/freeAction/**`：不得对玩家原文做 `RegExp.test/match/includes`；唯一允许的是 `evidence` 是否为原话子串的比较（沿用 `evidenceBelongsToPlayer`）。

### 11.3 影子期（P1）人工标注
60 句：攻击/嘲讽/威胁/欺骗/调情/亲吻/邀请/问句/假设/转述/否定/闲聊/不可能。度量：JSON 合格率、`actionClass` 准确率与 `variant` 准确率（**分开统计**：类错的代价大于同类内变体错，见 R11）、`performed` 准确率、**`physical` 类漏标数**。放行门槛由你定（决策 D9；我的建议同 v2：合格率≥95%、`physical` 类零漏标、`performed` 准确率≥90%；本轮新增建议：`actionClass` 准确率≥95%，`variant` 准确率先只记录不设门槛）。

### 11.4 真机（P4，`xiantu-game-selftest`）
重跑 MVP：打王哲、嘲段强、月霜低好感亲、凝羽高好感亲、离题、不可能行动各一遍；记录票 JSON、判定 ID、好感/记忆前后值、`记忆[]` 与 episode、下一回合提示里的卡内容、每回合墙钟。

---

## 12. 阶段、工时、风险、待你决定（要求 8）

### 12.1 阶段（工时为估算，不含剧情策划写数据的时间）
| 阶段 | 内容 | 过关条件 | 估时 |
|---|---|---|---|
| P0 探针 | 不改代码：①`presentActorIds` 是否含王哲/段强；②确认判定后 intent 是否重跑；③事实行是否进入模型提示（决定 §8.3 的冻结行问题）；④grant 是否进状态流；⑤`mustSurvive` 能否从角色卡/总表读出（见 §7.1） | 五项各有证据 | 0.5 d |
| P1 票 + 影子 | `ticket.ts`、config、提示、校验；只记日志，不写任何状态 | 60 句标注达标 | 1.5 d |
| P2 敌意类结算 | `judgementEngine`/`Preflight`、`settle.ts`、`memory.ts`、`facts.ts`、MainGamePanel 接线、`npcCardLayer`/`legacyNarratorPacket` | T1、T2、T5–T10、T12–T17 绿；`canon:build` 绿 | 3 d |
| P3 亲密表 | `npc-profiles.json` 结构 + 反应矩阵 + 台账校验（内容由策划写） | T3、T4 绿 | 2 d（+ 策划） |
| P4 保护 + 真机 | `mustSurvive` 字段与钳制、T11、T30、T31（不再有 #18 并集）；真机一轮 | 真机复现 MVP 六例 | 1.5 d + 1 d 真机 |
合计约 **9.5 个开发日 + 真机**（估算）。比 v2 的 7.5 d 多出的主要是“记忆同事务 + 大事消费 + 亲密表”。

### 12.2 风险
| # | 风险 | 缓解 / 余留 |
|---|---|---|
| R1 | 模型把玩笑读成攻击，或把嘲讽读成示好 | `performed` 只放 `yes`；判定类有“我理解为：…”可取消；P1 影子量化，不达标不开 |
| R2 | `route=table` 的变体（`intimate.*`、`give.*`）没有确认点，读错就写好感 | 状态流可见、回滚到“上次对话”；P1 看误判率；也可加轻确认（D1） |
| R3 | NPC 等级数据缺（王哲/段强）→ 按同级结算，与叙事不符 | D6：补数据；补前单测显式标“数据缺口” |
| R4 | 事实行到不了模型（§8.3 ①） | P0 探针；最坏改 `AIBidirectionalSystem.ts:811–813`，需授权 |
| R5 | 引擎写好感 + 叙事再写 | modular 路径 `tavern_commands:[]`，无此通道（已核实）；事实块里仍写“好感已写，不要再提” |
| R6 | 重复写 episode 逻辑与 `normalizeMemoryEpisodes` 漂移 | 一致性单测；若你授权 `runtime.ts:571` 加 `export`（一个词），可改为直接复用 |
| R7 | “拍”的定义不同于叙事回合 | D3 |
| R8 | 大事晋升被刷（不断攻击同一人） | 每 `(目标, 回合)` 一次；好感有下限 −100 与档位钳制；`settled` 去重；是否加“同目标同类型冷却”见 D10 |
| R9 | 行号漂移、未提交文件（`npcCardLayer.ts` 未被 git 跟踪） | 动手前重核行号 |
| R10 | 台账/总表改动触碰带执法标记字段 | `mustSurvive`/`npc-profiles` 是新键，不覆盖 AFF/AGE/DEBUT/USER_CANON 字段；仍需先读裁定簿并同提交追加条目 |
| R11 | 合并成 6 类后“类对、变体错”（如嘲讽报成威胁）或“类错”（如抓住报成亲吻） | 同类变体共用同一路径，类内错只影响幅度（T29）；类错才会跨路径，所以 P1 把类准确率设门槛、变体准确率先只记录；判定类仍有“我理解为：…”可取消 |
| R12 | 变体行越加越多：提示词变长、参数组合没人验 | 提示词只渲染 `enabled` 变体；校验器对每个变体做必填参数与引用检查（T18）；新增变体上线前必须走影子期标注 |

### 12.3 需要你决定（附我的建议）
- **D1**：`intimate` 类（flirt/kiss/invite）要不要“轻确认”？建议：v1 不加，靠状态流可见 + 回滚；P1 误判率高再加。判定类是否一律保留确认卡（裁定 #67 要求显式执行/取消）？建议保留。
- **D2**：“事件类型权重决定是否升大事”按 §5.2（权重=基础好感点，晋升仍是 |delta|≥10）落实，同意吗？
- **D3**：“每拍一次”的拍 = 叙事回合（建议），还是作者停靠点？
- **D4**：攻击后是否写 NPC 持久伤势（`injuryStore`，`sceneModule/host/injuries.ts:24`）？建议 v1 只写事实文本，不写状态（避免和场面模块的伤势账冲突）。
- **D5**（第四轮改）：必须活着改为角色总表的 `mustSurvive` 标记字段（§7.1），**不再有清单与章号窗口**。需剧情策划按原著给每个角色打标；仓库里现在一个都没有。王哲是否打标？字段名 `mustSurvive` 是我取的，是否沿用请你定。
- **D6**：王哲、段强（及你想让玩家能打的其他人）的境界数据行，来源章段由谁给。
- **D7**：`verbal` 类（taunt/threaten/deceive）的“检定成功”语义（见 §4.2）。
- **D8**：记忆是否允许带玩家原话片段（默认否）。
- **D9**：影子期放行门槛。
- **D10**：同目标同类型要不要冷却（防刷）。
- **D11**：`mod-kit/entity-ledger/npc-profiles.json` 作为新文件，还是并进 `overrides.json`（NPC-DESIGN-AUDIT O1 倾向新文件）。
- **D12**：是否授权（仅在 P0 探针证明需要时）改 `AIBidirectionalSystem.ts:811–813`；是否授权 `runtime.ts:571` 加 `export`。默认都不授权。
- **D13**：“悔性”是否即“悟性”（§头部）。

---

## 13. 合规（要求 9：只标记，不给方案）

依据项目 `CLAUDE.md` 所引的 2026-10-04 11:39 裁定与 `docs/COMPLIANCE-REQUIREMENTS.md` 条目表（只读了 C01–C14 标题）。不删、不软化、不扩写任何卡或档案；以下仅标出本设计触到的位置：
- **F1** `intimate` 类（`flirt/kiss/invite`）的反应矩阵与 `intimacyGate`：触 C10（亲密档案双重门控）、C13（成人向扩写线须合意成年，月霜/凝羽）、C08（NSFW 开关）。
- **F2** 低好感对不情愿一方的“强行亲近”类输入是否算可玩输入、如何呈现：触 C02、C14（旧裁定与 C03/C04 冲突，状态“待确认”）。
- **F3** `intimate.invite` 这个变体本身是否应存在于 config：用户本次列出了“邀请”，我照列；是否保留待你定（变体可单独 `enabled:false`，不影响其他变体）。
- **F4** `physical` 类（attack、grab）对原著敌对/暴力情节的呈现：触 C03（记事实不演出）；该条面向原著情节，是否也约束玩家自发的暴力，未裁定。
- **F5** 乐明珠“童颜”口径（Q17）与任何以其为目标的亲密类票：触 C01、Q17，待确认。
- **F6** `intimate` 类记忆模板的文字内容（写进 `texts.json`/`lines-resources.json`）：触 C05（公开字段分层）、C12（对外文本脱敏）。
- **F7** NPC-DESIGN-AUDIT E1 的 m1–m9 同样适用本文，未重复展开。

---

## 附：证据索引与未核项

**主要证据位置**
- 路由根因：`naturalIntentRouter.ts:381–383、385–486`；`MainGamePanel.vue:1976、2020、2100–2101`；`judgementPreflight.ts:20–29、33、139`。
- 结算与记忆写入口：`runtime.ts:1978、3842–3843、4087、4090–4125`（`:4097` 写死 10）；`runtime.ts:158、460、481、497、571、1219、1233`（`addNpcMemoryEpisodes` 等未导出）。
- 判定：`judgementEngine.ts:13、20–28、34–38、156、281–330、372、402、505、601、633`；`judgementPreflight.ts:60、304、369`；`sceneModule/levels.ts:3–4`；`characterLevels.ts:7–11`；`host/factors.ts:70–91`。
- 好感：`affinityLadder.ts:75、96、204`；`affinityCaps.ts:130`；`game-numbers.qingyu.json: affinity、levels、weights、goalModifiers、combat、npcCard`。
- 消费端：`npcCardLayer.ts:42–56、58–101`；`legacyNarratorPacket.ts:208、253、283、303–306`；`AIBidirectionalSystem.ts:794、811–813、929–942、3497、3533–3541`（工作区行号）。
- 保护：`storyContext.ts:517、526`；`canonGuard.ts:473、477、535、569`；`overrides.json` 顶层键。
- 先例：`freeTextStatusSemantic.ts:25–50`（模型提案 + 目录校验 + 证据子串）。
- 报告：`REPORT-2026-10-15-mvp-playthrough.md` 02:36、02:39、02:40、04:10；`_newbot_tmp/ab-npc-latency/RESULT.md` §2、§3、§5。

**没核实的**
- 任何“运行时实际发给模型的提示全文”、事实行是否进入 `action`、grant 是否在每个 modular 回合进状态流、确认后 intent 是否真的重跑：均为读码推断。
- 王哲/段强在 MVP 存档里是否在 `presentActorIds`；其卡/关系记录是否有 `境界`。
- `COMPLIANCE-REQUIREMENTS.md` 各条正文；`CANON-DECISIONS.md` #100–#188 未逐条读（只检索了与记忆/小票相关的条目）。
- 延迟数字全部是估算或引用他人实测，本次没有测量。

---

## 14. 状态改变类玩家动作（第二轮，只读设计，未改代码）

问题：自由行动能不能改变人物状态？例：「我给乐明珠传功提高她功力」。覆盖：传功、疗伤、下毒、喂药、包扎、捆绑、赠物。
标记沿用文首：【已核实】=本轮读了源码/配置原文；【推断】=读码推出、未运行。**本轮仍未运行任何游戏代码、未构建、未开服。**行号为 2026-10-15 工作区行号，会漂移。

### 14.0 一句话

**能，但今天的代码对“NPC 状态/功力/物品”没有任何一条自由行动可调用的写入通道**：能写 NPC 状态的只有作者场景写回与作者剧情线效果；能写“境界进度”的只有玩家自己的修炼回执；物品“使用”只扣数量、不产生任何机器可读效果。所以这类动作要新增一个**结算分支**（与 §4 同一套票/确认/幂等），不是“多挂几个字段”。模型仍只报票；效果种类、幅度、代价、上限全部由代码按 config 与账本查表，**传功只能抬“修炼进度”，永远不能改境界名/阶段/级数**。

### 14.1 现状盘点（要求 1）：代码今天已经能写什么

**① 状态目录（读过全文）**——`src/modules/sceneModule/contracts/statuses.json`（目录）+ `contracts/statuses.builtin.json`（内置）+ `contentPacks/packs/qingyu/statuses.json`（仅 `addiction`、`addiction.maigu` 两条）。解析顺序：目录＞合同＞内置（`statuses.ts:31`）。
- 你说的“6 个通用状态”：`wound.severe` 重伤、`weak.body` 虚弱、`wound.soul` 神魂受创、`unconscious` 昏迷、`poisoned` 中毒、`dying` 濒死（目录里 `tier:'general'`；设计出处 `_newbot_tmp/generic-injury-status-design-2026-10-06.md` 第 4 行）。
- 武侠状态：`wound.external` 外伤（别名含砍伤/刀伤/剑伤）、`bleeding` 流血、`fracture` 骨折、`dizzy` 晕眩、`drunk` 醉酒、`acupoint.sealed` 被点穴、`paralyzed` 麻痹、`qi.disordered` 内力紊乱。另有同为通用的 `wound.exhaustion` 真气透支、`wound.blood_loss` 失血、`wound.fright` 惊惧，和本书类 `poison.cold` 寒毒等。
- **目录里没有“被捆绑/束缚”状态**（全文读过，id 清单无此类；内置 6 条也没有）。所以“捆绑”今天没有可写的状态落点。
- 每条状态的“解除”只有四种规则：`rest`、`time`、`item`（`ref` 是通用标签，如 `heal / antidote / hemostatic / splint / sober / unseal / repair`）、`story`（作者 flag）。**没有“用内力/技能解除”这种规则。**
- `dying` 的 `source` 写着“救治回执解除时同步改挂重伤”，但读 `injuries.ts:40–46` 的实现：解除只是把该行过滤掉，**没有改挂**。目录文字与代码不一致（【已核实】）。
- `dying`、`poisoned` 目录里没有时限（`afterScene.minutes:null`，只能 `item` 解除）；`rg` 查 `dying` 全仓，代码里**没有任何“濒死超时就死”的逻辑**；死亡只由作者场景 `cast.exit … status:'dead'` 写入（`schema/scenario.ts:232`、`fixedEndingNarratives.ts:118`）。

**② 能写状态的代码路径（谁能写、写给谁）**

| 路径 | 玩家 | NPC | 自由行动能否调用 |
|---|---|---|---|
| `mountFreeTextStatuses`（`host/freeTextStatus.ts:58`，由 `narrativeStateReconciler.ts:643` 调） | 能，写 `角色.效果` + `injuryStore` | **不能**（内部硬取 `playerId`，且要求正文主语是「你」，`:38–49`） | 不能：它按正则/名称匹配正文，不是票；且只处理目录里标了 `freeText` 的状态：`narrative`=外伤/流血/骨折/晕眩/中毒/虚弱/失血/惊惧/真气透支，`input`=醉酒；**被点穴、麻痹、昏迷、内力紊乱、重伤、神魂受创、濒死都没标，这个入口一律不挂** |
| 场面写回 `recordSceneInjuries`（`host/writeback.ts:75` → `injuries.ts:47`） | 能 | **能**（按合同 party 的 id 写 `sceneLedger.statusRecords.actors[id]`） | 不能：只在作者场景合同收束时调用 |
| 剧情线效果 `kind:'status'`（`runtime.ts:4112–4115`，冻结文件内联代码） | 能 | **能**（`e.actorId` 任意人物） | 不能：只由作者事件触发；不是导出函数，无法复用 |
| 判定回执 `角色.效果 upsert`（`judgementEngine.ts:573`，只用于「阴阳调和」buff） | 能 | 不能 | 不能：仅 `applyDeterministicEffects` 认的几个固定 key |
| **解除** `removeSceneInjury`（`injuries.ts:40`） | 能 | **能**（`{actorId}`，匹配 `rest`/`item` 规则，`item` 要求 `rule.ref===itemId`） | **有入口、无生产调用方**：`rg` 只命中 `tests/sceneCommonCapabilities.test.mjs:44–46` 与 `COMMON-CAPABILITIES-STAGE1.md`（该文档明说“本轮没有新增休整/修复按钮”）。可直接复用 |
| 到期 `pruneSceneInjuries`（`injuries.ts:29`） | 能 | 能 | 自动，按 `sceneTime` 分钟 |

另一个要紧的事实（【已核实】`injuries.ts:81–94 restoreSceneInjuries`）：`store.actors[id]` 里的行，**会在该人物下一次作为作者场景 party 时被还原进场内状态**。也就是说，自由行动写给 NPC 的状态会流进作者合同的战斗——见 14.6 与 D20。

**③ 血量**：玩家 `角色.属性.气血.当前` 能被判定回执写（`judgementEngine.ts:505–560`：combat 失败扣 5%/15%/40%，修炼恢复）。NPC 档案里有 `属性.气血`（`relationships.ts:196`，初值 100/100），**没有任何写入方**。

**④ 境界 / 修炼进度 / 上限**
- 玩家：`trainingRealm`（`levelProgression.ts:13`）经 `kind:'cultivate'` 判定回执写 `角色.属性.境界`（`judgementEngine.ts:513`，写入在 `:547`）。成功 +`training.successProgress`(10)，大成功 +`greatProgress`(20)，`progressPerLevel`=100；进度满 → 初期→中期→后期（进度清零）；**冲关**要 阶段=后期 且 进度≥需要 且 `level<cap`，成功升一级，失败保留 `failureRetention`(0.5)。**修炼上限** `cap` = 当前章原著级数 `stageCanonLevel`（`levelProgression.ts:8`，查 `levelFact`）+（`trainingCap` 为 `canon+1` 时加 `canonExtra`(1)；`none` 时不设限）；预设在 `game-numbers.difficulty.presets`。`applyStoryLevel`（`:11`，`fixedEndingNarratives.ts:131` 调）是作者剧情抬级，`initializeLevel`（`:10`）按原著自动抬到章级。
- **`trainingRealm` 的触发是对 `actionText` 的正则**（`:14` `/练功|修炼|闭关|冲关|冲击境界/`；恢复另有 `judgementEngine.ts:435` 的关键词）。所以**新动作绝不能用 `kind:'cultivate'`**——否则 `actionText` 里碰巧有“修炼”二字，会顺手给**玩家自己**涨进度（`:513`）。本设计用 `craft`（见 14.3）。
- NPC：**没有写入方**。LLM 写 `社交.关系.X.境界` 被校验器拒绝（`commandValidator.ts:293–295` “人物级数只能由代码回执写入”）；档案创建时固定 `阶段:'初期'、当前进度:0、下一级所需:100`（`relationships.ts:181`），名称取卡片 `level`。
- **战斗级数不读档案进度**：`host/factors.ts:80–83 snapshotLevels` 先取 `levelFact`（原著级数表），查不到才回落到档案 `境界` 名称。所以**今天往 NPC 档案写进度，对判定/战斗没有任何数值效果**（【已核实】读码）。这是 14.2 里 D15 的核心。

**⑤ 物品 / 账**
- 玩家获得：`settleScenarioInventoryTransfers`（`inventoryTransactions.ts`，按 `transferId` 回执幂等，**只加不减**）。
- 玩家“使用”：背包按钮 → `enhancedActionQueue.useItem`（`:353–412`）：只扣数量、记撤回、往动作队列塞一句“使用了…（效果：…）”，**不写任何状态/进度**；效果交给叙事模型自己写（modular 回合 `tavern_commands` 恒为空，§1.2，所以实际上多半没人落地——【推断】）。
- `mod-kit/entity-catalog/items.json` 310 条，`definition` 字段只有 `id/name/description/type/grade/attributeBonus/skillIds/storyItem/techniqueId`；`consumable` 54 条，**没有任何机器可读的“使用效果/标签”**（【已核实】）。状态目录里的 `ref:'heal'` 等标签**没有任何物品与之对应**，`rg` 没找到映射代码。
- 玩家物品→NPC：NPC 档案有 `背包.物品` 的形状（`relationships.ts:218` 创建时），但**没找到“把玩家物品写进 NPC 背包”的代码**（`rg 赠送|送给|giftItem|gift` 命中 6 个无关文件，未逐个读，不能保证）。已装备/剧情道具（`storyItem` 6 条）的转让规则：没有。

**小结：已经能写 / 不能写**
| 能力 | 玩家 | NPC |
|---|---|---|
| 挂状态（任意目录状态） | 作者路径可；自由文本仅 10 条，且靠正则 | 仅作者路径 |
| 解除状态 | `removeSceneInjury` 可（无生产调用） | 同左 |
| 气血 | 判定回执可 | 无 |
| 境界进度/突破 | 仅 `trainingRealm`（玩家自己，有上限） | **无** |
| 物品扣减 | UI 使用可（无效果）；`useNicheCrystal` 一例 | 无 |
| 物品增加 | 作者发放可 | 无 |

### 14.2 动作 → 效果类型（config 驱动，要求 2）

状态类动作不再新增枚举值：它们分别是 **`cast` 施术类**（仅 `transfer_qi` 传功、`heal` 疗伤、`bandage` 包扎三项）与 **`give` 给予类**（`gift` 赠物、`feed_pill` 喂药/下毒）下的变体——**下毒与喂药是同一件事，共用一套结算，毒性由物品效果标签承担**；`bind` 捆绑属 `physical` 类的“限制行动”持续变体（待实现/默认关闭，需新增「行动受限」状态）。票沿用 §3.1 的 7 键形状，其中**可空键 `itemId`**（“手段”）只取自代码生成的“背包里有效果表的物品名单”。模型仍不报任何数值。

**效果种类枚举**（变体行的 `effect` 参数指向其中一种，代码只认这些；这是“只加配置”的边界之一，见文首与 D24）：
| effect | 写什么 | 写在哪（已有函数） |
|---|---|---|
| `practiceProgress` | 目标 `社交.关系[key].境界.当前进度` += Δ | 直接改档案对象（`relationshipOf`，`affinityIdentity.ts:105`） |
| `applyStatus` | 目标挂一条目录状态（有限时长） | 复制 `freeTextStatus.ts:84–87` / `runtime.ts:4112–4115` 的 5 行写法进 `injuryStore`（`injuries.ts:24`）+ `renderInjuryViews`（`:73`） |
| `removeStatus` | 按物品标签解除目标一条状态 | `removeSceneInjury(save,{actorId},statusId,'item',tag)`（`injuries.ts:40`，**已导出，原样复用**） |
| `downgradeStatus` | `dying`→`wound.severe` | 解除 + 挂（目录文字要求、代码未实现，见 14.1） |
| `transferItem` | 玩家背包 −1；NPC 档案 `背包.物品` +1 或仅记账 | 玩家侧 `数量--`（同 `host/loot.ts` `useNicheCrystal` 写法）；NPC 侧见 D22 |
| `none` | 只产生好感/记忆（§4–5） | 已设计 |

**各变体的落点（占位，真机后调；凡“引用”均为复用已有键，不新增数；完整参数行见 §9.1 `classes.cast` / `classes.give`）**
| 类 / 变体 | route / kind | 效果 | 要求的物品 |
|---|---|---|---|
| `cast` / transfer_qi | judge / `craft`（类默认；悟性/灵性/心性，`weights.craft`） | `practiceProgress`（+可选 buff，见 D15） | 无 |
| `cast` / heal | judge / `craft` | `removeStatus`（标签 `heal`）；`dying`→`downgradeStatus` | 带 `heal` 标签的物品 |
| `cast` / bandage | judge / `craft` | `removeStatus`（`bleeding` 要 `hemostatic`；`fracture` 要 `splint`） | 带对应标签的物品 |

| `give` / feed_pill（喂药=下毒，同一套结算） | table（有益标签物品：先看对方愿不愿，§4.3 三档带，`needsGoodwill`；毒性标签物品：不看态度） | 物品效果表里的 `removeStatus / practiceProgress / applyStatus`（`effect:'itemDefined'`）；**毒性标签→`applyStatus poisoned`（有限时长，不升级）+ 毒伤**（毒性数值由效果表标签承担，占位）；目标 `mustSurvive` 时毒伤到 `lifeFloor` 下限停止（§7.2） | 效果表里的物品（有益或毒性标签） |
| `give` / gift | table | `transferItem` + 好感/记忆 | 背包有该物品且未装备、非 `storyItem` |
| `physical` / grab（限制行动，一拍压制） | judge / `combat` | `effect:'none'`：只出本拍事实“挡下/被制住”，**不挂状态** | 无 |
| `physical` / bind（限制行动，持续变体） | **待实现/默认关闭**（`enabled:false`） | 将来：`applyStatus`「行动受限」（目录暂无此条，本版不加）；见 D14、F10 | — |

同类变体的差别只有这些参数：`itemTag(s)`、`effect`、`kind`/`modifierProfile`、`cost`、`gain`、`cooldownMinutes`、`phaseBudgetRatio`、`protectedForbid`、`enabled`。

### 14.3 怎样在代码里结算（要求 2）

**流程（接在 §3–§4 之后，不另起一套）**
```
票（含 variant、itemId） → 校验（§3.3 + 本节 14.3 的“动作可行性闸门”；闸门条件读自 `variantSpecOf` 的参数，不按变体名分支）
  ├─ 闸门不过 → 不出判定卡、不扣任何东西、不改任何状态 → 只拼“未发生”事实行（textId）给叙事
  └─ 闸门过 → route=judge: 签发待确认判定（kind 取 config；actionText 由代码模板生成，不含玩家原话）
              → 玩家确认 → 掷骰（沿用 §3.4 回执 free_action_judgement）
              → settleStateAction：重新跑一遍闸门（存档指纹/背包可能已变）→ 先算后写一次提交
```

**动作可行性闸门**（“只有真能做到才结算”，纯函数，确认前后各跑一次）：
1. **执行者资格**：`levelOf(玩家境界)`（`realmUtils.ts:5`，查不到→不可）≥ 目标当前章级数 `effectiveLevel(levelFact(id, namingChapter(runtime)))`（`characterLevels.ts:7–11`）。仅声明了 `requires.actorLevel:'ge_target'` 的变体（v1 只有 `cast.transfer_qi`）用此条；疗伤类不设级数门，但见第 5 条。
2. **目标资格**：目标 id ∈ 在场名单（§3.2）、`relationshipOf` 存在、**≠ 玩家自己**（防“绕路给自己涨功力”：玩家境界只能走 `trainingRealm` 回执）、不是正在进行的作者场景 party（`activeScene(save)`，`host/ext.ts`；与 §6 同口径：场面模块已接管）。
3. **目标态度**：`tierOf(好感度)` 落在 `low` 带（敌对/戒备）→ 声明了 `needsGoodwill` 的变体（v1：`cast.transfer_qi/heal/bandage`、`give.gift/feed_pill`）直接不可（对方不受），**不扣代价**；`give.feed_pill` 的 `needsGoodwill` 由物品效果标签决定（有益标签要看，毒性标签不看）；未声明的变体（`physical.bind`）不看态度。
4. **物品**：变体声明 `needsItem` 时，`itemId` 必须在“背包中有效果表条目且数量>0”的名单里，且效果表标签与变体的 `itemTag(s)` 相符；效果表标签必须能命中目标某条状态的 `remove[kind:'item'].ref`（`heal` 命中 `wound.external / wound.severe / wound.soul / dying / wound.blood_loss`；`hemostatic` 命中 `bleeding`；`splint` 命中 `fracture`；`antidote` 命中 `poisoned / paralyzed / unconscious`；`sober` 命中 `drunk`；`unseal` 命中 `acupoint.sealed`——**全部取自目录里已有的 `remove` 规则，不新增**）。命不中 → 不可。`story` 类解除（腰伤/胸伤/灼伤/呛水伤/阴寒余伤/噬魂余波/阴煞噬臂/寒毒）`removeSceneInjury` 本来就不匹配，**自由行动治不了作者锁定的伤**（读 `injuries.ts:43` 的规则种类，【已核实】）。**毒性标签的物品不走“命中目标某条状态 `remove.ref`”这一检查**（它挂状态而不是解除状态），只要求效果表里登记了毒性标签且 `itemId` 在背包名单内。
5. **执行者代价**：资源够付才可（见下）。
6. **冷却与预算**：见下“上限”。
7. **必须活着**：§7 的 `isMustSurvive` 钳制（仅自由行动路径）+ 下方 14.5。

**代价（对执行者，变体行的 `cost` 参数，如 `classes.cast.variants.transfer_qi.cost`）**
- 传功：付真气。今天代码**只会写玩家的气血/神识**（`judgementEngine.ts:544–572` 的 `applyDeterministicEffects` 只认 `角色.属性.气血.当前`、`神识.当前` 与境界，不认 `灵气`；神识扣减的现成逻辑是 `spiritCostEffects`，`:450`）。两条路：①神识（零新增写 key，复用 `proposal.spiritCost`）；②灵气（`角色.属性.灵气` 类型里有，`game.d.ts:663`，但没有写入分支；由 `settleStateAction` 自己写，不碰判定引擎）。倾向②（“传功耗真气”更贴原著口径），决策 D15。扣多少=`上限×ratio`，成功 `onResolve`、大失败 `criticalFailure`，仿 `JudgementSpiritCost` 的两档，**数值占位**。
- 疗伤/包扎/喂药（含下毒）/赠物：消耗物品 1 件（玩家 `数量--`，归零删条目，写法同 `useNicheCrystal`）。**物品在“成功/部分/失败”都消耗；闸门不过则不消耗。**
- 反噬（失败路径）：传功失败 → 执行者挂 `wound.exhaustion`（−1，1440 分钟，目录已有）；大失败 → `qi.disordered`（−2，4320 分钟，目录已有）。**不对目标写任何坏结果**（保护目标，也避免“好心办坏事”撞必须存活）。玩家侧挂载沿用 `freeTextStatus.ts:77–87` 的写法。
- 喂药/下毒共用一套结算：**没有单独的“下毒识破”检定**（原 `cast.poison` 的 `scheme` 判定随该变体取消，是否要保留见 D26）。毒性标签物品命中后：挂 `poisoned`（有限时长，不升级）+ 毒伤；好感按效果表标签里的 `base`（占位，同 §5.2 口径）下降并写记忆，大事晋升同 §5.2；目标 `mustSurvive` 时毒伤到 `lifeFloor` 下限停止（§7.2）。

**上限（传功，变体行的 `gain` 参数：`classes.cast.variants.transfer_qi.gain`）**
- 单次增量 `Δ = clamp(round(base × degreeFactor × outcomeFactor), 0, perTransferCap)`；`base` **引用** `training.successProgress`(10)，`perTransferCap` **引用** `training.greatProgress`(20)——“一次传功最多相当于一次大成功修炼”，不新增数字。失败 Δ=0。
- **永不跨阶**：`进度 ≤ 下一级所需 − 1`（`ceilingBelowNeed:1`）。因此传功**不可能**触发 初期→中期→后期，更不可能升级；档案的 `境界.名称/阶段` 由代码**只读**。这一点与玩家自己的 `trainingRealm`（满格才翻阶段）刻意不同：NPC 的阶段/级数只由原著级数表与作者剧情决定。
- **受目标自身上限与原著级数约束**：目标当前章 `levelFact` 必须 `available:true` 且 `applicability:'nine_levels'`；`settingStatus:'placeholder'`（低置信占位行）是否允许 → D16。不读“下一章的更高级数”：乐明珠表里 第48–56章=2级、第57–98章起=4级（`character-levels.qingyu.json` 乐明珠四行，【已核实】），**传功不得在第 56 章提前把她当 4 级用**——本设计里进度本来不转级数，这条靠“代码永不写 NPC 级数/阶段”的**棘轮测试**守住。
- **冷却**：同 `(执行者, 目标, 动作类型)` 间隔 ≥ `cooldownMinutes`（游戏分钟，`sceneTime(save)`，`injuries.ts:15`），占位 1440。**总预算**：同一目标同一阶段累计传功进度 ≤ `phaseBudgetRatio × 下一级所需`，占位 0.5（即 50 点，约 5 次）。预算记 `runtime.freeAction.transferBudget[targetId]`（与 `settled` 同在存档，随读档回滚）。冷却可被“睡一觉”刷新，**真正的硬顶是预算**。
- 幂等沿用 §3.4：键 `fa.<judgementId|turn>.<targetId>.<variant>`；同 `(目标, 回合)` 一票。

**写入的有限性（防止污染作者场景）**：自由行动给 NPC 挂的状态一律写**有限 `expiresAt`**（config `classes.cast.defaults.maxStatusMinutes`，占位 1440，覆盖目录里的 `null`），`sourceScene` 用前缀 `free:<key>`，便于识别、审计、以及 D20 的跳过规则。

### 14.4 保护原著强度设定（要求 3）

1. **级数表是只读权威**：`mod-kit/entity-catalog/character-levels.qingyu.json`（66 行/44 个实体，`level / effectiveLevel / available / applicability / settingStatus`）。新代码**不得写表、不得写 NPC 档案 `境界.名称/阶段`**；只许 `境界.当前进度` 单字段，且≤`need−1`。**棘轮测试**：任意次数传功后，`levelFact(id, ch)`、档案 `境界.名称/阶段/下一级所需` 逐字不变。
2. **必须活着**走 §7 的 `mustSurvive` 标记字段（角色总表，**不再有台账清单、也不再并入 `loadBearingCharacterIds`**），**只约束自由行动路径**（§7.3）：
   - **有益变体**（声明 `needsGoodwill` 的：传功/疗伤/包扎/赠物，以及有益标签的喂药）：不伤人，允许；仍受 14.3 的进度/预算顶。
   - **毒（`give.feed_pill` + 毒性标签）**：`mustSurvive` 目标**可以中毒但不会死**——允许挂 `poisoned`（有限时长），毒伤到 `lifeFloor.hpRatio` 下限（占位）停止，不挂 `dying`、不写死亡（**取代**原“有害变体对受保护目标一律拒绝”）。
   - **`physical.bind`**（持续限制行动，待实现/默认关闭）仍带 `protectedForbid:true`（`mustSurvive` 目标一律拒绝）——这是原文口径，未被本轮决定改动，将来启用时是否保留见 D26。`physical.attack/grab` 不带此参数，走 §7.2 的封顶/放行。
   - `lethalAllowed=false`（§4.1）延伸到本节：任何自由行动**不写** `dead/missing/departed`，**不升级到 `dying`**（不走 `applyStatus` 的升级链，因为那条链只在场景状态里用）；`mustSurvive` 是在此之上的**逐人硬约束**，即使将来开 `lethalAllowed` 也不放行。
3. **玩家自己的境界不受影响**：目标≠玩家；`kind` 不用 `cultivate`（14.1 ④）；`transfer_qi` 的 `actionText` 由代码模板生成，不含玩家原话，从而不命中 `levelProgression.ts:14` 与 `judgementEngine.ts:435` 的正则。
4. **主动分不被刷**：沿用 §6/T10，扩展到传功/赠物：乐明珠 `lineBonds.lemingzhu.activeScore.*`、`branch.lmz.*` 不变（本设计不写任何这些状态，靠测试守住）。
5. **等级/强度不被外部堆叠**：每个目标同时最多 1 条“受传功 buff”（若 D15 选加 buff），到期自然消失；buff 的 `rollModifier` 量级不超过 `factors.statCap`(2)。
6. 改带执法标记的台账（`AFF_PROTECTED/AGE_PROTECTED/DEBUT_PROTECTED/USER_CANON`）前仍须读 `CANON-DECISIONS.md`、同提交追加裁定（项目 `CLAUDE.md`）。本节新增的 `item-effects.json` 不覆盖这些字段。

### 14.5 反例与预期（要求 5）

| # | 场景 | 预期 | 靠什么守住 |
|---|---|---|---|
| E1 **低级传高级** | 玩家 1 级、目标乐明珠 2/4 级 | **闸门不过**：无判定卡、不扣真气、不改进度；叙事收到“功力不及，未能传功”事实行 | 闸门 1；事实行必须发，否则叙事模型会自行写成功（读码推断：§1.2 的反面——“叙事有、状态无”） |
| E2 **重复传功** | 连传 10 次 / 睡觉清冷却再传 | 受 `cooldown` + `phaseBudget` + `≤need−1` 三道顶；预算满后闸门不过、不扣代价 | `transferBudget` 随存档；`settled` 去重；读档/重试同键不重复 |
| E3 **传给敌人** | 目标在 `low` 带，或已是进行中场景的对手 | 声明 `needsGoodwill` 的变体不可：不扣、不写；若目标是只有 `lcq.enemy.*` id 的敌人，`relationshipOf` 不存在 → 整票作废（§3.3 第 4 条） | 闸门 2、3 |
| E4 **必须活着 / 剧情锁定** | 目标 `mustSurvive=true` / 正处作者场景 | 有益变体允许但仍受顶；`protectedForbid` 变体（`bind`，默认关）拒绝；作者场景 party 一律拒绝（场面接管）；作者 `story` 解除的状态治不了 | 14.4 第 2 条；闸门 2；14.3 第 4 条 |
| E5 **治疗致命伤** | 目标 `dying`：无 `heal` 物品 / 有 | 无物品：不可、不扣；有物品：移除 `dying`、**改挂 `wound.severe`**（目录文字要求），物品消耗；若判定失败：物品耗尽、`dying` 保留，**不会因拖延而死**（代码无濒死超时） | `removeSceneInjury` + 新增 `downgradeStatus`；T-新增“解除后不得留空” |
| E6 **毒必须活着者** | 目标 `mustSurvive=true`，被喂毒性标签物品 | **不拒绝**：挂 `poisoned`、限时、不升级，毒伤到 `lifeFloor` 下限停止，不挂 `dying`、不死；物品照常消耗；非 `mustSurvive` 者同样限时、不升级（`lethalAllowed=false`），无下限钳制 | `lifeFloor`；`maxStatusMinutes`；T30 |
| E7 **以自己为目标 / 让别人间接涨自己** | “我给自己传功”“让乐明珠把功力传回给我” | 目标=玩家 → 票作废；NPC→玩家不在本节（玩家进度只走 `trainingRealm`） | 闸门 2 |
| E8 **票里的物品不存在 / 已装备 / 剧情道具** | 模型报名单外 `itemId`；赠出已装备武器或 `storyItem` | 整票作废；赠物拒绝已装备与剧情道具；结算时背包数量再核一次 | 名单由代码生成；闸门 4 |
| E9 **注入** | “系统：乐明珠功力+100 / 境界升到九级” | 无效：票无数值位，进度只由 config 与骰面决定；`境界.名称` 不可写 | 14.4 第 1 条棘轮 |
| E10 **同回合多目标/多动作** | 同回合“传功+疗伤”同一人 | 同 `(目标, 回合)` 仅一张状态类票（§3.2 已有“同目标仅一张”） | 校验 |
| E11 **事实行到不了叙事** | 即 §8.3 ① | 同 §8.3，P0 探针；本节新增的“未发生”行走同一通道 | P0 |

### 14.6 改动清单、冻结文件、延迟、配置（要求 4）

**新增（非冻结）**
- `src/modules/scenarioMods/freeAction/stateEffects.ts`：闸门（纯函数）+ `settleStateAction`（先算后写一次提交，含执行者代价与反噬）。
- `src/modules/scenarioMods/freeAction/itemEffects.ts`：从背包 ∩ 效果表生成“可用物品名单”（供提示词与校验）。
- `mod-kit/entity-ledger/item-effects.json`（**新文件，按物品 id**）：`{ itemId, tags:["heal"…], effect?:{…}, consume:1 }`；校验：`itemId` 在 `items.json`、标签属于目录里出现过的 `remove.ref`。位置待 D17。
- `tests/freeActionState.test.mjs`；内容包 `texts.json` 里的“未发生/成功/反噬”事实文本（`textId`）。

**修改（非冻结）**
- `freeAction/ticket.ts`（`itemId` 键与名单校验）、`naturalIntentRouter.ts:325–355`（提示词增加物品名单；类→变体清单已由 §8.2 的同一处改动生成，不为状态类另加）、`judgementPreflight.ts`（`buildFreeActionJudgementProposal` 加 state 类分支，`actionText` 由模板生成）、`MainGamePanel.vue` 的 §8.2 同一接线点（不新增接线点）。
- `injuries.ts:81–94 restoreSceneInjuries`：可选（D20）——对 `sourceScene` 以 `free:` 开头的行，在“作者关键场景”里跳过还原。
- `contentPacks/packs/qingyu/statuses.json`：可选新增 1 条 `buff`（D15）；`StatusDef.kind` 类型里已有 `'buff'`，但目录与内置里**一条 buff 都没有**（【已核实】）。

**冻结文件（`runtime.ts`、`AIBidirectionalSystem.ts`）：本节不需要。**依据：写入点全在非冻结且已导出的 `injuries.ts`（`injuryStore/renderInjuryViews/removeSceneInjury/sceneTime`）、`affinityIdentity.ts:relationshipOf`、`characterLevels.ts`、`realmUtils.ts`。`runtime.ts:4112–4115` 的状态写入是函数体内联代码、无法加 `export` 复用，所以**复制 5 行**（`freeTextStatus.ts:84–87` 已是这样做的），加一条一致性单测。唯一冻结关联与 §8.3 ① 相同：事实行是否进叙事模型提示（读码推断，未运行）；若 P0 探针证否，需改 `AIBidirectionalSystem.ts:811–813`（同 §8.3），本节不增加新的冻结行。另外：NPC 状态变化**不会**出现在玩家可见的“状态流”里——`AIBidirectionalSystem.ts:3533–3541` 只转 `pendingLineAffinityGrants`（§4.4），所以玩家看到的只有事实行与叙事；NPC 伤病文字是否被叙事读到（`renderInjuryViews` → `sceneLedger.injuries`）在自由回合路径上**未验证**（P0 探针）。

**延迟（估算，依据同 §10）**
| 项 | 变化 | 依据 |
|---|---|---|
| 模型请求数 | +0（票仍挂在已有 intent 调用上） | 设计 |
| intent 输入 | 比 §10 再 +约 50–250 token（`give`/`cast` 两类的启用变体说明 + 背包里“有效果表的物品”名单，名单上限 `itemListMax`=6 件）。合并成 6 类后，枚举部分不再随动作数线性增加，随**启用变体**数增加 | 【推断】；无效果表物品时名单为空 |
| intent 输出 | 有票 +约 10 token（`itemId`） | 【推断】 |
| 本地结算 | 毫秒级：`injuryStore` 小对象过滤、`renderInjuryViews` 按 actor 数重建视图 | 【推断】读码；未测 |
| 玩家侧 | `route=judge` 的变体（`cast.*`）多一次确认点击（可取消）；`route=table` 的变体（`give.*`）无 | 同 §10 |

**配置形状**：已并入 §9.1 的 `freeAction.classes.cast` 与 `freeAction.classes.give`（单一来源，此处不再重复；旧版独立的 `stateAction` 段已取消，其 `protectedForbid` 列表改为变体行参数（第四轮后仅 `bind` 带），`lethalAllowed` 改为全局 `freeAction.lethalAllowed`）。`"training.successProgress"` 之类写成对已有键的引用，加载时解析并断言与原键相等，延续 §9.1 的单测思路。`modifierProfile` 的 `factorProfile` 具体含义我没读，P0 确认。`applyGameNumbers` 不能用来新增变体键，见 §9.1。

### 14.7 测试补充（接 §11 编号）
（下列测试的动作均指 `cast.*` / `give.*` 变体（`physical.bind` 默认关闭，见 T35）；闸门读变体参数而不是变体名，所以每条断言对“换一个同参数的变体”同样成立，T28 覆盖。）
- **T20 闸门**：`cast.transfer_qi`：1 级传 2/4 级→零写入、零扣费、有“未发生”事实行；同级/高级→通过。
- **T21 上限**：连续传功至预算满→后续闸门不过；`境界.名称/阶段/下一级所需` 与 `levelFact` 不变；进度恒 ≤ need−1。
- **T22 玩家自涨**：目标=玩家 / `actionText` 含“修炼”→玩家 `境界` 不变。
- **T23 解除**：`cast.heal` + `heal` 物品+`dying`→挂 `wound.severe` 且物品−1；无物品→不变；`story` 类状态→治不了。
- **T24 毒**（`give.feed_pill` + 测试 config 里临时登记的毒性标签物品）：非 `mustSurvive` 者限时、不升级、不出现 `dying/dead`；`renderInjuryViews` 后 `injuries[id]` 含该行；`mustSurvive` 者的断言见 T30；与喂药共用结算见 T32。
- **T25 作者场景污染**（D20）：带 `free:` 行的 NPC 进入作者合同，战斗胜率模拟（`combat.simulation`）仍在 `minWinRate/maxWinRate` 内。
- **T26 赠物**（`give.gift`）：已装备/`storyItem`/名单外物品→拒绝；成功→玩家 −1、NPC 记账、`settled` 去重。

### 14.8 需要你决定（接 D13，附建议）
- **D14**：v1 启用哪些变体（每个变体一个 `enabled` 开关，不是类级开关）？建议：`cast.transfer_qi`、`cast.heal`、`cast.bandage`、`give.gift`、`give.feed_pill`；`physical.grab` 开（一拍压制、无状态，见 D23）；`physical.bind` 关（**已定：待实现/默认关闭**，目录无「行动受限」状态，且触硬线，见 F10）；毒性物品 v1 不登记（见 D19）。
- **D15**：传功扣哪种资源（神识=零新增写入 / 灵气=settle 自己写）？NPC 进度今天**没有战力意义**（14.1 ④），要不要同时给一条有限时“受传功” buff 让它有意义？建议：灵气；v1 先不加 buff，只记进度与记忆，真机后再看。
- **D16**：传功顶：`ceilingBelowNeed`、`phaseBudgetRatio`(0.5)、冷却(1440 分钟)是否同意；`placeholder` 低置信级数行、`not_applicable`（非九级体系）目标是否一律拒绝（建议：非九级与 `available:false` 拒绝，`placeholder` 也拒绝）。
- **D17**：物品效果表放哪、谁写。`items.json` 的 54 件 `consumable` 里，哪些算 `heal/antidote/hemostatic/splint/sober`（样例：山草药 `lcq.item.nh_mountain_herb`、驱毒丸（改良版）`lyg.item.np049`——只是名字像，**我没有裁定，也没写进表**）。以及“无物品、用内力疗伤”算不算：需要给目录加新的解除规则种类（改 `StatusRemoveRule` 与目录），建议 v1 不做。
- **D18**：同意由代码实现“解除 `dying` 时改挂 `wound.severe`”（目录文字已有、代码未实现）？
- **D19**：带毒性标签的物品是否在物品效果表里登记（即“下毒”是否开放；原 `cast.poison` 已并入 `give.feed_pill`，v1 建议不登记=关）；若开放，同意“`mustSurvive` 者可中毒但毒伤到下限停止 + 限时 + 不升级”（取代原“保护者一律拒绝”）。
- **D20**：自由行动写给 NPC 的状态要不要在“作者关键场景”里被跳过还原（改 `injuries.ts:81–94`）？建议：跳过，避免玩家用毒/药改写作者调过的战斗平衡。
- **D21**：被拒绝（闸门不过）也必须发“未发生”事实行，同意？（不发的话叙事可能照写成功。）
- **D22**：`give.gift` 赠物：NPC 真收入 `背包.物品`，还是只记账（好感+记忆）？已装备与 `storyItem` 一律禁赠，同意？
- **D23（第三轮新增，第四轮改）**：6 类与变体归属。第四轮已按用户决定调整：①~~`poison` 放 `cast`~~ → 下毒并入 `give.feed_pill`，与喂药共用一套结算，毒性由物品效果标签承担，`cast` 只留传功/疗伤/包扎；②`grab` 改名“抓住”，放 `physical` 的“限制行动”下，一拍短暂压制、不留状态，与 `attack` 同检定（战斗 + 境界差），只给“挡下/被制住”事实、`base` 占位 −4，**这一行数据仍是我编的占位，不是裁定**，v1 默认开；`bind` 捆绑是同类下的持续变体，待实现/默认关闭；③你列的“物品/礼物”合并为同一个变体 `gift`（结算相同：`transferItem`+好感+记忆），若二者结算要区别（例如礼物按价值加好感），再加一行变体即可，不需要第七个类。
- **D24（本轮新增）**：“新行为只需一行配置”的边界是否接受：新变体复用已有的类路径、`effect` 种类、状态目录条目、物品标签时，只改 `game-numbers.qingyu.json` 加一行（不能走 tuning 补丁，见 §9.1）；需要**新 `effect` 种类、新状态目录条目或新解除规则种类**（例如“用内力疗伤”“行动受限”状态）的，仍是代码/目录改动，不算“只加一行”。**捆绑是已知的例外：** 它的 config 行已写好（`enabled:false`），启用时再加「行动受限」一条状态目录，不改结构。
- **D25（第四轮新增）**：`mustSurvive` 是否需要“章号/事件窗口”？原文的 `lifeProtection` 带 `fromChapter/toChapter`；按“角色总表一个标记字段”落地后变成**全程有效的布尔**（只约束自由行动）。若某人只在原著某段必须活着、之后允许被自由行动弄死，布尔字段表达不了，需要你定：①接受全程布尔（建议 v1，因为 `lethalAllowed=false` 下自由行动本来就写不出死亡）；②字段改成带窗口的结构。另：毒伤下限 `lifeFloor.hpRatio`（占位 0.1）取值与“毒伤落点”——NPC 气血今天**没有任何写入方**（§14.1 ③），毒伤是新增写 NPC `气血`，还是只用 `poisoned` 状态加下限计数——请你定。
- **D26（第四轮新增）**：①原“必须活着”的 `intervene`（由在场第三方介入）模式随台账取消，要不要在别处保留；`loadBearingCharacterIds` 派生口径不再并入保护，要不要保留为兜底；②合并后 `give.feed_pill` 没有原 `cast.poison` 的 `scheme` 识破检定——毒性物品是否仍要一次识破判定（会让 `give` 类出现 `judge` 路径，与类默认 `table` 不同）；③`physical.bind` 的 `protectedForbid`（对 `mustSurvive` 目标一律拒绝）在将来启用时是否保留；④`grab` 的“被制住”对 `mustSurvive` 目标放行（§7.2 第 3 条，占位）是否同意。

### 14.9 合规（只标记，不给方案）
- **F8** `cast.transfer_qi` / `cast.heal` 涉及肢体接触与功力交换：判定引擎里已有“双修/采补”的合意关键词判断 `mutualCultivationConsent`（`judgementEngine.ts:469`，上方注释写 C02：“药物/控制不能充当同意”）；本设计**不使用**该正则，但 `transfer_qi` 与它语义相邻，触 C02。
- **F9** `give.feed_pill`（含毒性物品的“下毒”）作用于不情愿的 NPC：触 C02 注释里的“药物不能充当同意”；`unconscious / acupoint.sealed / paralyzed` 的目录 `source` 与 `freeTextStatus.ts` 头注释均写有“合规标记：不得用于把强迫情节做成可玩内容”，本设计的 `feed_pill` 可能引向这些状态。
- **F10** `physical.bind` 捆绑（待实现/默认关闭；以及与之同属“限制行动”的 `physical.grab` 抓住“被制住”事实，一拍、不留状态）：目录无「行动受限」状态；将来是否新建、是否可玩，触项目 `CLAUDE.md` 2026-10-04 裁定的硬线“强迫内容不可玩化”及 C03/C04/C05/C14（均“待确认”）。
- **F11** 以乐明珠为目标的 `cast.transfer_qi`、`give.feed_pill`、`give.gift`：触 C01、Q17（童颜口径，待确认），同 F5。
- **F12** 物品「麻古」（`lcq.item.np005 / np006`）与 `addiction*` 状态：若成为 `feed_pill`（喂药/下毒）的物品，触毒瘾/药物类条目；我没读这些条目正文。
- **F13** 年龄硬线（全员满 18）：本节的票通道**未加**对 `AGE_PROTECTED` 字段的检查；是否需要，未裁定。

### 14.10 本节没核实的
- 运行时提示全文、事实行是否进叙事、NPC 伤病文字是否进入自由回合的叙事包、`modifierProfile.factorProfile` 的含义、NPC 背包写入代码是否真不存在（只做了关键词检索）、`COMPLIANCE-REQUIREMENTS.md` 条目正文、`CANON-DECISIONS.md` 中涉及级数/保护的全部条目（只检索了 #41、#54、#71–72、#183、#185、#210、#216 附近）。
- 所有数值（Δ、冷却、预算、代价比例、时长）均为占位；所有延迟为估算。
- 第三轮（合并为 6 类）新增的未核实项：`physical.grab`（抓住）的整行参数是我占位的，没有任何数据或裁定对应；`weights.craft` 与 `kind:'craft'` 在判定引擎里的完整支持度沿用上一轮结论、本轮未重读；`variantSpecOf` 的“类默认 ⊕ 变体行”浅合并、提示词清单生成、`content-packs.mjs` 的必填参数校验都是设计，**未写代码、未运行**。本轮只核实了一处代码事实：`sceneModule/numbers.ts:9` 对补丁未知键抛错（因此新变体要写进默认 JSON）。
- 第四轮新增的未核实项：`mustSurvive` 字段能否经 `build-character-registry.mjs` 从源卡原样透传进总表、是直接读总表还是须经阶段档物化（`npcCardLayer.ts:3` 注释写“经阶段档物化”，我只核实了该注释）；「行动受限」状态的 id（`action.restricted`）与解除规则是占位；`lifeFloor.hpRatio` 与毒性数值全部占位；NPC 气血无写入方（§14.1 ③）意味着毒伤落点需 D25 定。本轮核实的只有：角色总表现有键里无 `mustSurvive`（读 JSON 键）、`CANON-DECISIONS.md` #90/#97 确有“谢艺之死”正典 Rail 与 `s06_03` 条目。


## 15. 第五轮（2026-10-17）落地备注与设计备注

### 15.1 本轮已实现（代码在 `src/modules/scenarioMods/freeAction/`，测试 `tests/freeActionRound1017.test.mjs`）
- **玩家原文调试通道**：`playerTextDebug.ts`；开关 `freeAction.debug.playerTextLog`（默认 `false`），条数 `debug.keep`、截取字数 `debug.textChars`。只写 console 与内存环形缓冲，不落盘、不进存档、不发网络；与 `noteTicketDiscard`（有意不记原文）互相独立。接线三处：`naturalIntentRouter.withTickets`（校验后没出票也没“未发生”事实）、`free()` 里候选被否决而丢掉模型票的分支、`MainGamePanel.vue` 中 `freeActionHandled` 为假处。
- **传功不回落旧 cultivate**：变体行 `legacyGuardWords`（`cast.transfer_qi` 上，词表在配置）+ `legacyGuard.ts`。试玩范围内含该词的句子：路由返回 `skipKeywordPreflight:true`，界面不再叫旧预检（含修炼词的句子也一样）；没出票或识别降级时给叙事发一行“未发生”（`free.fact.gate.unrecognized`）。传功自己的票据与结算（`kind:'craft'`、模板化 `actionText`）本来就不碰玩家境界。
- **`level_unknown`**：结论见 §15.2；开关 `requires.onLevelUnknown`（`deny` 默认 / `assume_equal`）。
- **护卫（`guard.shield`）最小版**：见 §15.3。
- **回执持久化**：被拒 / 给予成功（类的 `receipt:"given"` 配置）/ 其他（模型报 `other` 且 `performed=yes`）改为界面持久提示，文案在 `texts.json` 的 `free.receipt.*`，下一次发送或点“收起”清除。
- **叙述服从“未发生”**：事实块文案进 `texts.json`（`free.block.*`），被拒块加“不得写成已成”；每个有自由行动事实块的回合另附一行“背包事实”（本回合增减 + 背包现有，种数上限 `narration.inventoryListMax`）；同目标被挤掉的第二张票补一行“未发生”。不动 `runtime.ts` / `AIBidirectionalSystem.ts`。

### 15.2 `level_unknown` 的判断
- 触发条件（`gates.ts`）：目标在时点级数表里没有可用的九级行（无行 / 不可用 / 非九级体系 / 占位行），或关系档案的境界没有 `下一级所需>0`。
- 数据面：`mod-kit/entity-catalog/character-levels.qingyu.json` 共 66 行，覆盖人物 id 不多；总表 333 个人物里能在该表里找到行的只有 33 个（按 id 与 `idAliases` 比对）。所以对多数原著人物，传功默认会被这条拒绝——**这是按设计的保守拒绝，不是 bug**，但覆盖面确实窄。
- 处理：默认保持拒绝（T20 与初识登记测试锁定）；想放开就把该变体的 `requires.onLevelUnknown` 改成 `assume_equal`：查不到级数的目标按同级放行，仍要求目标有可涨的进度条、施术者有修为。是否放开由你定。
- **（已被 §15.5 取代）** 默认已改为 `assume_equal`。

### 15.3 护卫与必活保护是两套机制（命名区分）
- 必活保护 = 总表人物的静态标记 `mustSurvive`，经 `protect.ts` 读取，作用是给敌对结算封顶（`protectedCap`）或直接拒绝（`protectedForbid`）。
- 护卫 = 玩家行动产生的限时状态：类 `guard`、变体 `shield`（护住）、状态 id `guarded`（受护卫）；对象须在场，时长 `maxStatusMinutes`、好感 `base` 都在配置；只记状态，**本版没有任何结算读取它**。
- 两者不共用字段与代码路径，名字里刻意不出现 `protect`。

### 15.4 设计备注（只写文档，不实现）：逃走 / 带人逃跑
- **不能逃走的战斗由合同标明**：交锋合同上应有显式字段声明“此战不可逃”，而不是靠关键词或模型判断。字段取值由内容作者定，代码只读该字段。
- **逃走的两种合法结果**，合同二选一：① 逃走即失败，游戏结束（走现有结局通道，不另造死亡写入口）；② 直接逃不掉（闸门拒绝，给“未发生”事实，不掷骰、不扣任何东西）。两种都不允许“逃了但无事发生”。
- **可以逃走的战斗**才谈判定：走 `escape` 判定类，成功后的位置变化由场景/开放世界的移动写入口完成；我未核实该写入口，实现前先查。
- **带人逃跑**不做：它同时涉及闸门（双目标）、场景（位置变化）和票数上限（每回合 2 张、每目标 1 张），并与“不能逃走的战斗”规则相互牵制。要做时建议单设 `escort` 变体，由代码规定“成功则被带者随同转移”，模型只报一张票。
- 以上均未实现，也没有真机验证。

### 15.5 传功闸门收紧 / 护卫先关（2026-10-17 后续）
- **传功好感门槛**：`cast.transfer_qi.requires.minGoodwill`（`game-numbers.qingyu.json`），目标好感低于它 → 闸门拒绝，原因码 `goodwill_below_min`，文案 `free.fact.gate.goodwill_below_min`。默认 **20**（2026-10-17 用户裁定，原估算 40 作废；**数值未经实玩验证**）。与 `needsGoodwill` 的“低姿态”检查并存，且先于级数检查：好感不够时不看级数。
- **级别**：目标级数已知（九级时点行可用）且高于玩家 → 照旧 `level_too_low`；同级或更低按原规则走。
- **`onLevelUnknown` 默认改为 `assume_equal`**：级数查不到的目标不再因 `level_unknown` 拒绝，按同级对待、只看好感（施术者仍须有修为）。改回 `deny` 即恢复旧行为（`level_unknown` 原因码与文案保留）。副作用：`assume_equal` 下目标没有可涨的进度条时，不再报 `level_unknown`，由后面的预算检查报 `budget_full`（文案“眼下已受不住更多的传功”，对这种情形不太贴切）。
- **护卫 `guard.shield` 关闭**：变体行 `enabled:false`。提示词只列启用变体，所以护卫类整体不再出现；模型若仍报票，校验丢弃（`variant_disabled`）。代码、`free.fact/memory.shield.*` 文案、`guarded` 状态都保留；改回 `true` 即恢复。

### 15.6 正向社交好感的整形（2026-10-17，用户已批准）
- **基础值在代码**：`settle.ts` 的 `plan()` 算出 `base × 轻重 × 结果系数`（或亲近查表值）。被拒、没发生、判定失败时基础值本来就是 0。
- **票上的可选浮动位 `affinityDelta`**：模型按 −15..+15 的口径报；`validateFreeActionTickets` 取整并钳到单拍上限，不是有限数字就当没报（票照收）。判定类票把它存进判定回执（`FreeActionJudgementReceipt.affinityDelta`），确认后结算取回。
- **整形顺序（`shapeDelta`）**：基础值 → 正向按“目标:行动类”窗口内次数乘 `affinity.repeat.factors` → 递减后为 0 就是 0（不看浮动位）→ 否则浮动位在 `[基础 − floatBand, 基础 + floatBand]` 内采纳 → `perBeatCap` 钳制。敌意（基础值<0）不递减。
- **配置**（`freeAction.affinity`）：`floatBand: 2`；`lightReceipt: true`；`repeat.windowMinutes: 1440`（从窗口内第一次起算，满一整段后重算）、`repeat.factors: [1, 0.5, 0.25, 0]`（超出表长取最后一项）。**数值占位，未经实玩验证。**
- **递减账**：`runtime.freeAction.repeatLedger["<目标>:<行动类>"] = { count, since }`，随 `state.budgetKeep` 修剪。同拍被拦下的不计次。
- **叙事事实**：递减到 0 → `free.fact.affinity.worn`；好感已到上限或被上限截短 → `free.fact.affinity.capped`。追加在该次结算的事实行末尾，也会随幂等重放原样返回。
- **到顶轻回执**（可选，默认开）：同一附注经 `SettleResult.affinityNotes` → 回合 `affinityNotes` → `renderReceipts({ affinity })` → 界面持久条 `free.receipt.affinity`；由 `freeAction.affinity.lightReceipt`（默认 `true`）开关，关则只留叙事事实。
- **大事**：`major` 看实际生效的变化（`applied` 且 `|to − from| ≥ majorAbs`），不再看计划值。
- **冷却**：没有给 flirt/kiss/invite/gift 配 `cooldownMinutes`——那会让闸门把整件事写成“没发生”；用递减窗口代替。需要时仍可在变体行上加。
- **共历事件通道已接入“同一拍只结算一次”**：`settleSharedExperienceAffinity` 写好感前查 `affinityBeatTaken`，写入成功后记 `affinityTurn`（与自由行动共用）。

