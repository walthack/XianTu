# 三级任务链说明（2026-08-30 汇编）

> **本文性质**：把散在 `PROJECT-STATUS.md` 时间线、R3-10／R3-12 设计稿与四个源文件里的三级任务链口径汇编成一篇可独立阅读的说明。
> **不引入新裁定、不改任何行为**。所有数量与规则均已对照当前源码核实（核实方式记在 §9）；凡属推断的地方都标了「推断」。
> **真值源仍是代码**：口径冲突时以 `src/modules/scenarioMods/{mainQuestAxis,secondaryLines,characterQuests,fixedQuestObjectives}.ts` 的文件头裁定为准，本文只是导读。

---

## 0. 一句话

三级任务链＝**主轴（两个通关条件＋六层长期方向）－ 二级任务线（十条长期内容）－ 人物任务（挂在上级事件下的插入段）**，权重依次递减；三级都只回答「现在已知可以做什么」，**不产生进度压力，玩家可无限期搁置**。

---

## 1. 为什么要分三级

立项理由有两条，都来自真机实测：

1. **「不催」被做成了「不说」**（2026-08-15 用户实测）。六朝世界模式下玩家问「我怎么知道主线是什么」，而 `storyContext` 在该模式写死「没有需要玩家逐拍完成的下一任务」，UI 任务目标面板整块 `v-if="!worldMode"` 关掉。用户判词：**「上古卷轴虽然是自由大世界，但还是有主轴剧情的」——自由的是推进节奏，不是方向感。**
2. **长期内容不能交给 LLM 自由发挥**（2026-08-16 用户裁定）。「二级主线的发展不能靠 LLM 自己发挥，而是稳定可靠、随着玩家自己随时能够触发的（类似上古卷轴走到一个地方触发事件，接到派系主线任务）。LLM 的发挥尽量安排在那些非重要小支线或者流言这种程度。」

分级的第三个作用是**保密**：终局暗线不能是一条静态常驻文案，否则开局即剧透，于是主轴自身还要再分六层（见 §2.1）。

---

## 2. 三级的定义

### 2.1 第一级：主轴 `mainQuestAxis.ts`

**主轴不是一条故事线，是两个通关条件**（重要，别再当故事线扩写；R3-12 文档里早先几处相反的判断已作废）：

| 条件 | 内容 | 备注 |
|---|---|---|
| 要求一 | 修为达六阳，前往太泉古阵**祭祀故人** | 正典写的是祭祀「故人」，全书无「祭祀大阵」字样；**不得叙述成开启装置** |
| 要求二 | 保住**至少一名**岳血后裔 | **不要求集齐**。月霜是王哲点名的默认人选，可被小紫等替代；终局只需一个可用接口 |

- **判据**：去掉它终局就演不下去。一切「立势」（汉国朝堂／唐国长安／商队／秦国称帝／星月湖军）＝资源包＝可替换 → 一律不进主轴，归二级线。
- 王哲三托付里的**锦囊归太乙掌教二级线**（已定性），不在主轴完成要求内。
- **失败结局**：两条都没满足时后期给失败结局（已裁定，实现待排）。⏳ 只满足其中一条走什么结局**未定**，当前按「不足以进真结局、但不落失败结局」处理。
- **六层长期方向** `MAIN_QUEST_LAYERS`：锚在王哲三托付上逐层加深，玩家永远答得出该往哪，但答的是他已经够得着的那一层。层 1「活下来」开局即有；层 2–5 由抵达特定关卡解锁；**层 6（`restricted: true`）涉及试验场暗线，靠三碎片认知落 `playerKnowledge` 解锁，未解锁前不得出现在 prompt 任何位置**——`resolveMainQuestLayer()` 是纯函数，一律不返回层 6。
- **节点粒度**：`MAIN_QUEST_NODES` 是任务节点粒度不是逐拍，对标上古卷轴 5 的主线日志（约 18–19 条）。底层 143 条 `situation.objective` 原封不动留在原地（`canon_companion` 侧栏也在读），主轴只是叠在其上的一层。

### 2.2 第二级：二级任务线 `secondaryLines.ts`

十条线，四种 `kind`：`commerce`（商道）／`expedition`（太泉古阵）／`sect`（太乙真宗、星月湖、黑魔海／毒宗）／`nation`（昭南、晋国、宋国、汉国、唐国）。承载国家、地区、宗派、远征与商道变现层的长期内容。

- **商道线设计意图与另外九条不同**：它不是第九条平行故事线，而是**下游汇聚层**——其余各线打下的地盘在这条线上结算成收入。地基已有（`settleEventReputation` 全局声望、`reputationLedger.regionStanding()` 地区立足度、`currencySystem` 多币种钱包），**真正缺的只有折现层**（`regionStanding` × 本线进度 → 每回合收益）。
- ⚠ **教训（已记档）**：曾断言「地区声望不存在」，实为按中文 grep 漏看了英文命名的引擎模块。**本仓库中英混用命名，单语言 grep 的阴性结果不构成「不存在」的证据。**

### 2.3 第三级：人物任务 `characterQuests.ts`

**形态是插入段，不是第三条节点序列**（2026-08-16 用户裁定）：

> 「角色剧情是**二级线的下层插入事件**……这样才能产生——**如果这个角色不在场，这个 event 会变成另外一个样**的效果。」

每一拍都挂在一个**已存在的 event** 上，回答「这一拍因为带着谁而不同」，而不是「第几步做什么」。**人物任务不抢上级已认领的 event**，升成二级线就会抢占上级事件。八条成线人物：小紫、卓云君、谢艺、乐明珠、萧遥逸、杨玉环、赵合德、凝羽。

另有 **A 档单点高光** `CHARACTER_HIGHLIGHTS`：不成线，但这一拍属于这个人。来源是孤儿归类——「料不够并不是这个角色不需要登场的理由」（用户裁定），故一律保留为挂点，够料的日后升格成线。

---

## 3. 数据在哪、有多少（对照当前源码计数）

| 层 | 文件 | 规模 |
|---|---|---|
| 主轴 | `src/modules/scenarioMods/mainQuestAxis.ts` | 完成要求 2；长期方向层 6（层 6 restricted）；节点 16（ready 13／pending 3）；主轴关 18；`STAGE_ORDER` 全链 37 关 |
| 二级线 | `src/modules/scenarioMods/secondaryLines.ts` | 线 10；节点 383（ready 375／pending 8） |
| 人物任务 | `src/modules/scenarioMods/characterQuests.ts` | 成线人物 8；拍 54（ready 35／insert 10／new 9）；单点高光 64 |
| 玩家侧目标覆盖 | `src/modules/scenarioMods/fixedQuestObjectives.ts` | 覆盖 52 条 |

**`reviewSummary` 与 `objective` 是两样东西**（2026-08-21 重写）：三级表里的 `reviewSummary` 是**制作侧结果摘要**，可以记结果，**但不进入玩家 UI 与叙事 prompt**；玩家目标一律取当前绑定 event 的固定 `objective`，`pending/new` 不冒充当前任务。`FIXED_QUEST_OBJECTIVE_OVERRIDES` 只改表现层（任务栏、叙事视图、动作预填），**不改 event id、conditions、completion、contract hash/action payload、Canon Rail、IF 与世界真值**。

节点状态口径：`ready`＝已有真实 event 承载；`pending`／`new`＝正典有但游戏未落地（id 是建议 id，**尚不存在**）；`insert`＝挂在上级已认领 event 下的插入段。

⚠ 人物任务表由 `docs/R3-10-CHARACTER-QUESTS-DRAFT-2026-08-16.md` 机械抽取生成，**改内容改文档再重抽，不要手改源文件的表**。

---

## 4. 怎么自然接上（锚与触发）

### 4.1 主轴
层级由 `resolveMainQuestLayer(currentStageId)` 按 `STAGE_ORDER` 的先后确定性解析。**不能靠章节完成条件**——`world_sim` 的结算路径只写 `world.r2_*` 与 `offscreenResolvedEventIds`，不写 `flags.event.*.done`，章节完成条件永不满足。

### 4.2 二级线：**锚＝你知道那件事的那一拍**
这是 2026-08-16 收窄后的规则。原规则「国家线锚地点、宗派线锚人」两种都太宽泛：走进建康只是「你到了能知道的位置」，不等于知道宫里闹鬼；见到谢艺也不等于知道星月湖是什么。**线是被「知道」打开的，不是被「到场」打开的。** 样板是黑魔海——云苍峰把空白羊皮纸解读成秘法传讯的那一刻。

`resolveAvailableLines()` 是纯函数（只看地点、相识账本与已完成事件），判定优先级：

1. `anchorEventIds`（且未标 `anchorEventPending`）→ 只由它判定；
2. `anchorLocationIds` → 玩家当前地点命中；
3. `anchorCharacterIds` → 相识账本里任一锚人已达门槛（如星月湖八骏见谁都算）。

配套约束：

- **锚只能落 event，"知道"却是 beat 层的事实**（beat 1399 : event 396 ≈ 3.5:1）。对不上的线要为那一拍补 event，未补前标 `anchorEventPending` 并落回粗锚，否则线永远打不开。
- **不锚关卡**：`DEFAULT_LINE_QUARANTINED_STAGE_IDS` 让默认路线静默跳过 8 关，主轴已因此死过 3 条节点；关卡编排会变，地点与人不会。
- **孪生 id 全收，不是挑对的那个**：同一地方常有多个 id 各自只覆盖一部分关卡。实测洛都 `liuchao.location.luoyang` 覆盖 24 关、`lyl.location.luoyang` 覆盖 6 关，早先只填后者导致汉国锚在 6 关里只有 3 关能响。
- **没有「接受任务」这道手续**：锚一满足就把 `entryHint` 作为待办显示。照着做就是加入，不做也不损失什么。

### 4.3 人物任务
不需要锚——`characterBeatsAt(eventId)` 只看当前 event 是否被某条人物线挂了拍。

---

## 5. 推进形状：A／B 两类，外加一道冻结闸

**沿用 R3-12，不新增事件分类 schema**（明令禁止再造 `world_driven/player_driven` 平行 schema）：

- **A ＝ 无时限等待玩家**；
- **B ＝ `offscreenResolution` 超时后世界自行结算，玩家只能事后得知**。

「自动发生／不强推」只在具体任务线内部选择现有 A/B 合同。全库 396 个事件里只有 **24 条**带 `offscreenResolution`（6%），`deadlineTurns` 一条没有——自行推进本来就是小集合。

**线承重事件冻结闸 `lineCriticalFrozen()`**（2026-08-16 裁定）：玩家没到现场，这件事就不许自行推进。判定两级——事件带 `locationId` 则比地点，不带则退到关卡级（10 条里有 3 条如此）；`canon.locations` 缺失时**判定不了就不判**。裁定原文：「任务指引玩家去皇宫，玩家不去，剧情就不推进……用例时间也就停着等玩家回来再继续。」即**不是「发生了而玩家没赶上」，是那件事根本没发生**。

⚠ **两处已知未决**（原样搬运，勿当已解决）：

- 本规则与 R2-10／R2-11 既有验收冲突（5 条测试红），分歧实质是「玩家缺席算不算玩家的选择」；
- 确有一批 objective 需要时效、玩家没选择就该自动发生，待单独过滤豁免后**再回头重判那 5 条**。在此之前二级主线默认冻结。
- 24 条里只处置了「权力格局级」一类；**其余 14 条未审核，一律维持现状（照旧自行结算）**，不要因为没进表就当成已判过。

---

## 6. 运行时接线

| 消费点 | 文件 | 行为 |
|---|---|---|
| 叙事上下文（world_sim） | `storyContext.ts` | 依次拼四行：长期方向（层）／当前主轴目标（或"当前可切入点"）／此刻可投的门路（二级线 `entryHint`）／人物任务切入。**任一为空则整行省略**，不得另写「本关无主线／不重要」「本拍无人有戏」 |
| 右栏 UI | `RightSidebar.vue` | 同三源；只展示**当前 event 的固定目标**，不摊同关未来节点，也不显示 `ready/total/余待扩` 制作进度 |
| 目标文案 | `runtime.ts` / `eventNarrativeView.ts` → `resolveFixedQuestObjective` | 玩家看到的目标＝event.objective 经覆盖表修正后的结果 |

其他口径：

- **「即兴目标」已改称「个人目标」**：只是玩家主动意图的跨轮备忘，**不具备任务奖励、期限或结算权**。
- **任务栏不是遥控器**：任务栏显示「现在已知可以做什么」，不能成为必须原样点击才能推进的下一页按钮。这条是 2026-08-20 真机暴露的引擎缺陷（自由行动 17 轮 `s01_01` 仍未落账），后由 `intentMatch` 自然行动解析修复。
- **随机内容不是第四级**：「动态委托／机缘」只能消费已成立的世界事实，不能反向改写三级线、正典事件或人物真相，也不能抢先结算三级线承重事件或带正式 IF 的生死节点（`docs/DYNAMIC-LLM-QUEST-DESIGN-2026-08-21.md`；本轮只完成设计，**尚未接入 runtime**）。

---

## 7. 硬规则清单（改动前先对一遍）

1. 主轴＝两个通关条件，**不扩写成故事线**，王哲托付之后的续写属待办，不要擅自扩。
2. 层 6 未解锁前不得进 prompt 任何位置。
3. 不新增 `world_driven/player_driven` schema，只用现有 A/B。
4. 不让 LLM 写 `flags.event.*.done`。
5. 人物任务不升级为第三条并行主干，不抢上级 event。
6. `reviewSummary` 不进玩家面；`pending/new` 不冒充当前任务。
7. 目标覆盖只改表现层，不碰合同、hash、Canon Rail 与世界真值。
8. 二级线锚落 event、不锚关卡；孪生 id 全收。
9. **`railStageComplete` 死锁**：Canon Rail 只盖部分拍时，玩家跟着主线走会在 rail 跑完那一刻锁死剩余内容（清空 `activeEventIds` 并把所有章标完成）。已有回归测试 `tests/stage02RailDeadlock.test.mjs`。
10. `axisSeq` 为 null 不能当 0 排序，会把后段内容顶到线首（已修三处）。

---

## 8. 门禁与测试

三级链相关的现有测试：`tests/mainQuestAxis.test.mjs`、`mainQuestAxisEvents.test.mjs`、`secondaryLines.test.mjs`、`secondaryLineNodes.test.mjs`、`characterQuest*`／`fixedQuestObjectives.test.mjs`、`lineCriticalFreeze.test.mjs`、`questCompassArrival.test.mjs`、`stage02RailDeadlock.test.mjs`。

结构性门禁（DEBT 只减不增）：`eventReachability`（critical event 必须绑章或在 rail 上，DEBT 97）、`debutCardGating`（登场卡必须有 conditions，DEBT 18）。

项目级门禁仍是 `npm run type-check` ＋ 全量 tests ＋ `canon:build` 全绿 ＋ `build:single` ＋ `git diff --check`。

---

## 9. 本文的核实方式（可复算）

- 线／拍／覆盖数量：直接对四个源文件计数（`SECONDARY_LINES` 的 `id:` 与 `reviewSummary:`、`CHARACTER_QUESTS` 的 `id:` 与 `status:`、`MAIN_QUEST_NODES`／`STAGE_ORDER`／`MAIN_QUEST_STAGES`、`FIXED_QUEST_OBJECTIVE_OVERRIDES` 键数）。
- 规则与裁定原文：取自各文件头注释与 `PROJECT-STATUS.md` 的 08-18／08-20／08-21 三段。
- 消费点：`grep` 四个模块的 import 方，结果为 `storyContext.ts`、`RightSidebar.vue`、`runtime.ts`、`eventNarrativeView.ts`、`fastNarrativeDemo.ts`、`wuyuanOpenWorldSlice.ts`。
- **未做**：未跑测试、未起真机验证；本文只汇编既有事实，未验证运行时当前行为是否与文档一致。

---

## 10. 未决与待办（原样搬运）

- 主轴续写（王哲托付之后）待办；只满足一个通关条件时的结局待裁定。
- 商道线**折现层**未开发（`regionStanding` 目前零消费者）；`regionStanding` 由 `STAGE_ORDER` 走过比例派生＝「打到哪赚到哪」，玩家能否主动经营某地待裁定。
- 晋国线首节点归属、太泉入口暗号提前剧透——列为后续候选，2026-08-20 未越界修改。
- 动态委托／机缘只有设计，未接 runtime；建议首个纵切是五原商馆的低风险 NPC 交付委托。
- `lineCriticalFrozen` 与 R2-10／R2-11 的 5 条红测试待重判（见 §5）。
- 24 条 `offscreenResolution` 中 14 条未审核。

---

## 11. 相关文档索引

| 文档 | 内容 |
|---|---|
| `docs/THREE-TIER-QUEST-TRIGGER-AUDIT-2026-08-20.md` | 三级归属与自然触发复核（清羽 Demo 逐节点 A/B 矩阵、十条线复核表） |
| `docs/FIXED-QUEST-OBJECTIVE-REVIEW-2026-08-21.md` | 固定目标 52 条改写复审 |
| `docs/DYNAMIC-LLM-QUEST-DESIGN-2026-08-21.md` | 动态委托／机缘（明确不是第四级） |
| `docs/R3-10-CHARACTER-QUESTS-DRAFT-2026-08-16.md` | 人物任务线初稿（人物任务表的抽取源） |
| `docs/R3-10-SECT-LINES-*.md`／`R3-10-*-LINE-*.md` | 各二级线归属调研 |
| `docs/R3-12-QUEST-DRIVE-DISCUSSION-2026-08-18.md` | A/B 推进形状的来源讨论 |
| `docs/TEXT-OPEN-WORLD-RPG-DESIGN-AUDIT-2026-08-21.md` | 三级任务在整体 RPG 定位中的位置 |
| `PROJECT-STATUS.md` §〇/§一（08-18）、08-20 夜、08-21 | 三级链的时间线原始记录 |
