# 仙途 (XianTu) · 项目总体状况与并行分工文档

> 面向「新加入的 agent」。读完这一篇即可独立认领一个模块开工。
> 最后更新：2026-07-21（R2-11M：八个隔离关的**第一关 `lyl.luoyang_coup` 已完成来源重建并落合同**，覆盖 308/380 → **316/381**。用户裁定真机测试非必要项，R2-11L 停止点已解除。剩余 7 个隔离关（65 个事件）仍须逐关回原文重建，禁止批量脚本自动合法化。日终交接=`docs/R2-11L-DAY-END-TEST-AND-CLAUDE-HANDOFF-2026-07-21.md`，首关产物=`docs/R2-11M-QUARANTINE-LUOYANG-COUP-SOURCE-MAP-2026-07-21.md`。）

> **多 agent 协作基线（用户裁定）**：本文件是本项目的共享进度、分工、交付与 Git 汇总权威；开始认领、完成交付或改变阶段状态时先读后更新。根目录 `CHANGELOG.md` 属原 repo 历史，不记录本协作线的状态。

> 2026-07-15 日终交接与晚间真机复测清单：`docs/DAY-END-2026-07-15.md`。最新高光小批量验收与外部测试卡见 `docs/R3-8-HIGHLIGHT-VERTICAL-SLICE-2026-07-16.md`。

---

## 0. 一句话

把三部「六朝」修真小说（清羽记 / 云龙吟 / 燕歌行）改造成一个可玩的 AI 修真文字游戏的**剧本 Mod 套件**：从小说原文抽取 → 生成 18 个关卡 Mod（地图/角色/关系/物品/事件/势力）→ 内置进 Webpack 应用 → 在测试服跑。当前主轴、人物、地图、关系、if 分支地基都已成型；运行时**默认线正典轨道（Canon Rail）+ 可见行动判定引擎 + 事件对账死锁自愈**三大系统已落地，续写**结局蓝图 v2** 已定稿为真值源。仍在推进：**数据深度补全 + if 线扩量 + 立绘 + 续写 canon 回填**。

---

## 1. 环境与路径（**必读，最容易踩坑**）

| 用途 | 路径 |
|---|---|
| **真实工作目录**（有 mod-kit/、.env、生成内容） | `/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu` |
| ⚠️ 旧 checkout（**没有** mod-kit，别在这干活） | `/Users/clawbot/Projects/XianTu` |
| 生成内容根 | `mod-kit/generated/deepseek-v4-flash/`（`qingyu/ yunlong/ yange/ shared-atlas/ character-canon/`）|
| 脚本（167 个 .mjs） | `scripts/` |
| 核心文档 roadmap | `mod-kit/generated/deepseek-v4-flash/character-canon/CORE-DOCS-ROADMAP.md` |
| **正典裁定簿（改 canon/prompt 前必读）** | `…/character-canon/CANON-DECISIONS.md`（96 条人工裁定 + 执法标记）|
| 续写总纲 / 剧透血缘密档 | `…/character-canon/ENDING-BLUEPRINT.md` v2（真值源）+ `RELATIONSHIPS-SECRET.md`（关系密档层，裁定 #89）|
| 默认线正典轨道设计 | `…/character-canon/DEFAULT-CANON-RAIL-DESIGN.md` |
| 对外发布 roadmap（发布门禁/发布后深耕） | `RELEASE-ROADMAP.md`（仓库根，2026-07-07 立档） |
| NAS Mod Kit（同步目标） | `/Volumes/botsvault/06_material/XianTu-Mod-Kit/` |
| NAS 成品区（18 个可导入 Mod） | `…/XianTu-Mod-Kit/完善版剧本Mod/{六朝清羽记,云龙吟,燕歌行}/` |
| 三本小说原文（抽取源） | `/Volumes/botsvault/06_material/{A-六朝清羽记, B- 六朝云龙吟, C-六朝燕歌行}.epub` |
| 人物卡（权威设定源） | `…/06_material/{六朝清羽记,六朝燕歌行}-人物卡.md`（云龙吟无卡）|

**书名映射**：qingyu=六朝清羽记=`lcq.`，yunlong=六朝云龙吟=`lyl.`，yange=六朝燕歌行=`lyg.`（角色统一 id 前缀已迁到 `liuchao.character.<slug>`）。

**Shell 注意**：每次 Bash 调用 cwd 会重置回 `~/Projects/XianTu`。必须每条命令内联 `cd /Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu && …`。

**LLM 抽取层**：DeepSeek-V4-Flash over OpenRouter（`.env` 里 `OPENROUTER_API_KEY`）。露骨章节框定法 = system 声明「成人向小说参考背景，仅提取游戏机制、中性临床措辞、勿复述露骨」即可正常返回（否则返空）。HTTP header 必须 ASCII（X-Title 不能含中文）。

**测试服**：`192.168.50.51:8091`，是 **macOS LaunchAgent 常驻**（`com.xiantu.devserver`），**不要**用 Bash `run_in_background` 起。
- 重启/强制重打包内置 mod：`launchctl kickstart -k gui/$(id -u)/com.xiantu.devserver`
- 日志：`~/Library/Logs/xiantu-devserver.log`
- 用户访问机：Windows ROG-SIN（`192.168.50.4`，`ssh kan@`，密钥认证）；存档/模板库在该机 Chrome 的 IndexedDB。游戏内 bug 优先用 **Chrome MCP** 连过去读 Pinia gameState / IndexedDB / Pixi 调试。

---

## 2. 架构：三层数据 + 一个应用

### 2.1 三层数据架构（用户定的项目方向，推进强制顺序 ①→②③）

```
① 严格剧本走向（canon 真值）   ← 地基。线性主轴 story-timeline(1034节点) + 18关卡对齐
        │
        ├── ② if 线 / 分支       「假如…从某锚点岔出」，可永久分叉或回流脊柱
        │
        └── ③ 未来拓展           相对锚点新增内容（续写 canon / 锚点间填空）
```

- **承重脊柱**（`{book}.story-spines.json`，status:final）= 与剧情同级的不变量。三本各定稿，kind 分 invariant/throughline/arc/bridge。好 if 线必须**敢翻枢纽事实**（死亡/胜负），否则只是花絮；翻完常被脊柱重新吸住。
- **主轴 axisId 软绑定**：`event.id` 冻结 append-only = 存档键；`axisId` 是软元数据。主轴改版只 regen-binding，存档不坏（见 `AXIS-INTEGRATION-PLAN.md`）。

### 2.2 数据管线（小说 → 关卡 Mod）

```
epub 原文
  → extraction/batch-*.json      （事件/角色状态/contentFacts/relationships）
  → stage-plan.json              （每关 sourceStart/EndIndex 范围）
  → stages/*.json  ×18           （scenario mod：map/characters/relationships/items/events/factions/contentAccess）
  → character-canon/             （LLM 抽取的 appearance/personality/constraints/cards）
```

18 关卡 Mod 每个自包含、可单独导入游戏 `/scenario-mods`。角色丰富度靠一串确定性脚本叠加投影（外貌/性格/六司/灵根/境界/技能/物品/约束/关系/势力关系），全部「补空不覆盖」+ 时间门控（晚期内容不进早期关卡），每步备份 `{book}/stages-pre-*-backup/`。

### 2.3 世界引擎 / 叙事层权威边界（**用户定的方向，改动前必读**）

**原则**：确定性调度决定「发生什么」，LLM 只负责「怎么讲」。

**最终目标**：让 380 个事件**都不再依赖 LLM 直接掌握世界真值**。
注意这不等于「让所有事件都自主场外跑完」——玩家亲历仍然要靠玩家玩出来，目标只是**真值的写入权归引擎**。

#### 已经收归引擎的（LLM 禁写，`src/utils/commandValidator.ts` FORBIDDEN_PATHS）

```
世界.状态.剧本模组.{worldTurn, worldPush, actorEngine, eventTimeline,
                    offscreenResolvedEventIds, chronicle, divergences, steeringCooldown}
角色.身份.称号            ← 里程碑奖励，只能由 milestoneRewards 授予
```

引擎能在**零 LLM 参与**下推进世界，已由真机证明（2026-07-20，R3 不介入 11 轮）：
`s01_05/s01_06/s01_07` 三个事件的硬截止到点、场外结算落账、回执生成、零权限授予全部由引擎完成，
三者 `done` 始终为 `false`、不进 `completedEventIds`，用独立标记 `…offscreen_resolved` 记账——
既推进了世界，又没有把这三拍伪记成玩家亲历。NPC 冲突裁定（`resolveNpcActionConflicts`）同理，
结果只进回执与 effects，从不碰 `done`。

#### 最后的迁移面：`flags.event.*.done`

它同样是世界真值（直接决定 `completedEventIds` → 回执 → 权限）。截至 R2-11B，
`s01_05–08` 已收归本地引擎；其余 376 个事件仍由旧 LLM / 事件对账路径写入。

`canonGuard.findScenarioFlagViolation` 管的是**资格**不是**属实**：
只能 `set`、只能写 `true`、路径须为 `flags.<event|chapter>.<id>.done`、事件须唯一可解析、
且必须落在 `getScenarioEventIdsAllowedForCompletion` 内（不得越级完成非当前章节/活跃事件）。
除已迁移的 `s01_05–08` 外，在这些边界内，**模型宣称完成即为完成，引擎无独立核实手段**。

380 个事件的 completion 条件全部是 done 标志形态（364 个 `flags.<id>.done` + 16 个 `flags.event.<id>_done` 变体）。
R2-11 现已让其中 **7/380** 可计算：燕歌 `s01_05–08` 的机会卡按玩家行动序列逐轮推进，`s01_09` 由非机会卡本地条件判定；清羽左武军复盘与云龙伊水押运分别验证无截止 emergent 和有截止 window 结构。LLM 正文与命令
均不构成完成证据；`s01_05/08` 在合同满足后立即结算，`s01_06/07` 只登记参与并等待绝对时间线截止，
避免玩家输入提前坐实郭解／董卓死亡。模型直写会被 `canonGuard` 拒绝，旧事件对账也不能跨越这些边界。

#### 实证代价（2026-07-20 G2 复验）

同一引擎、同一基准 `inputHash=397471a3`、同一批玩家输入，只换主叙事模型：

| 主叙事模型 | R1 诏令 / R2 入宫 |
|---|---|
| `deepseek/deepseek-v3.2` | 首轮即 `done=true`，各得唯一权限 |
| `MiniMax-M2.7-highspeed` | 7 轮内**发出剧本完成指令 0 条**（全程 30 条指令无一涉及剧本），机会卡到期作废，零权限 |

引擎每一步都正确执行既定合同，但玩家「认真选了一条路」的意图静默归零——
因为世界真值挂在模型的自觉性上。

#### 目标形态

把 LLM 从**写真值**降级为**提交证据**：叙事层报告玩家做了什么 → 引擎按完成合同独立裁定 →
引擎自己写 `done`，该路径进入 FORBIDDEN_PATHS。

首个纵切采用用户拍板的方案①：证据直接来自玩家本人输入，而非 LLM 转述；机会卡声明
`player_action_sequence`，每个成功回合最多推进一步。②通用 runtime completion 与③结构化语义主张
保留给非机会卡事件，待纵切真机复验后分结构推进。

**后续交互方向已落档、暂不实施（2026-07-20 用户认可）**：当前“追踪时塞入整段 `actionText`，
后续由 LLM 生成普通字符串选项，再靠关键词匹配推进”仅作为纵切过渡态。目标是追踪与执行分离，
由引擎固定提供带 `opportunityId / stepId / actionId / timeCost` 的推进选项，与 LLM 自由选项合并；
具体政策选择进入状态，模糊自由文本不误推进。关键事件采用不受 `steeringCooldown` 冻结的绝对截止，
UI显示进度、剩余窗口与时间成本，截止按 `participated / partial / offscreen` 收束。设计与实施门禁见
`docs/R2-11-OPPORTUNITY-ACTION-UX-DESIGN-2026-07-20.md`；当前真机验证期间不得改动生产基线。

**实施须知**：这是架构项，不是 G2 遗留缺陷。用户已选择方案①；相关背景与实证见
`docs/R2-10M-G2-REVERIFY-2026-07-20.md`，首个纵切见
`docs/R2-11-OPTION1-DETERMINISTIC-OPPORTUNITY-COMPLETION-2026-07-20.md`。

### 2.4 应用（**关键：Webpack 不是 Vite**）

- `src/env.d.ts` 引 webpack-env；ts-loader/vue-loader；`build = webpack --mode production`。内置聚合用 `require.context`，**不能**用 `import.meta.glob`。
- 18 个成品 Mod 已**内置**进 app（`src/modules/scenarioMods/builtins/`），启动播种进库（默认 `enabled:false`），用户无需手动导入。
- npm pre-hook（`prebuild`/`preserve`/`prewatch` 等）每次构建自动跑 `sync-builtin-mods.mjs` 从 mod-kit 重新打包最新 mod —— **改完 mod 下次 build/serve 自动生效**。
- 内置库自愈：`BUILTIN_VERSION = manifest内容哈希 + 播种逻辑后缀(.sN)`；改播种逻辑或要强制全库对账时 bump 后缀。
- **行动门控（二层失败惯性）**：应用侧轻量机制，存档路径 `系统.扩展.行动门控.recent`。失败/部分成功/被阻断且会影响后续尝试时，AI 通过 `tavern_commands` 写入门控；下一轮 prompt 注入活跃门控，要求承接失败后果、提高难度/要求新筹码或新路线，并避免 `action_options` 原样推荐刚失败动作。实现文件：`src/utils/actionGate.ts` + `src/utils/AIBidirectionalSystem.ts` prompt 注入/过期清理 + `businessRules.ts`/`actionOptions.ts` 规则。**不拦自由输入，不做高级分支状态机，不触碰 Mod 数据管线**。

---

## 3. 进度总览

> **前瞻计划以 `RELEASE-ROADMAP.md` 为权威**（发布门禁 R0–R2 + 发布后深耕 R3：续写 canon＝`ENDING-BLUEPRINT.md` v2、关系密档知情注入引擎、立绘、细粒度打磨等）。本节只记**当前快照**；「计划要落的部分」看 roadmap，别在这重复维护。

### ✅ 已完成（已构建 + 同步 NAS + 多数已 git 提交）

| 区块 | 状态 |
|---|---|
| 核心文档（地图/主轴/人物/别名/势力档案/图鉴/关系网络/主轴对齐） | ✅ |
| 18 关卡 Mod 全字段补全（外貌/性格/六司/灵根/境界/技能/物品/约束/关系/势力关系/品质数值） | ✅ |
| 原版品质系统兼容（24 品级→神仙天地玄黄凡）+ 物品/功法机制数值 | ✅ |
| 故事主轴 1034 节点 + 锚点 + axisId 软绑定 + 18 关对齐 | ✅ |
| 三本承重脊柱定稿（story-spines.json，GPT 二审精修） | ✅ |
| 内置剧情模板 + 自愈播种 | ✅ |
| 世界地图铺满全大陆地点（5→40+/关）+ 主角标记修复 | ✅ |
| 提示词六朝化（prompts_all）+ 主要女角外貌成年化（去幼态） | ✅ |
| 主要角色性格重做（统一一套 + 人物卡权威源）+ 关系缺失修复 | ✅ |
| if 线系统：schema v3 + 校验器 + 三本共 **14 条** 分支（qingyu4/yunlong5/yange5，覆盖四模式） | ✅ |
| 头像数据地基（schema/validator/运行时透传）+ EPUB 官方插图抽取 96 张 | ✅ |
| 时间节点违规清理（D4）、别名清理（D1）、势力 id 归一（D6） | ✅ |
| 行动门控（二层失败惯性）：失败后结构化记录场景惯性，下一轮不把同一动作当无后果重开 | ✅ |
| 局域网云存档：人物列表、当前存档、存档数据、剧本 Mod 库通过 `/api/v1/save-storage` 同步，成功保存有用户提示 | ✅ |
| 云端 API / 提示词配置：API 管理支持上传覆盖云端，提示词自定义项可跨设备同步，无需登录验证 | ✅ |
| **正典裁定簿 CANON-DECISIONS**（96 条人工裁定中央执法簿 + 溯源/执法标记，改 canon 前必读） | ✅ |
| **默认线正典轨道 Canon Rail**（未选 if 时沿原著主轴，确定性生成器接入 + 空轴/冲突硬门禁 + 冲突关隔离待复核，裁定 #58-65） | ✅ |
| **事件对账 + 主线死锁自愈**（哨兵触发/记忆窗口封顶/内嵌 think 剥离/bigram 证据接地，真机验收） | ✅ |
| **可见行动判定引擎 P0-P5**（本地确定性判定·预检·结算·行动余波·UI 回执，LLM 不重骰，裁定 #66-75） | ✅ |
| **判定闭环修复**（队列动作同样预检；双修/调息/疗伤命中修炼判定；恢复数值与临时状态仅由本地 resolution 写入，LLM 旧式判定标签/重复写入一律隔离） | ✅ |
| **判定测试辅助**（仅开发/测试服显示“大成功（测试）”；结果落盘带 `testOverride` 审计标记，生产构建不显示；预检卡完整展示六档后果） | ✅ |
| **Canon Rail 存档修复边界**（重置叙事/锚点时保留玩家关系标签、好感、关系卡记忆与 NPC 关系矩阵；`33333` 已从修复前备份回填关系状态，`c1c3892`） | ✅ |
| 主线 UI：objective 任务目标（37关205事件）+ 当前一拍显示 + 主/支线金色/灰色视觉区分 | ✅ |
| **续写结局蓝图 v2**（真值源，三幕脊椎 + 六国收束 + 终战=对抗策展系统）+ 剧透血缘关系密档层（裁定 #80-89） | ✅ |
| 角色 RAG 向量检索 + 内置瘦身（省 ~25%）；势力富化去重 66→58；BGM 音乐引擎 | ✅ |
| 单测 76 → **277 全绿** | ✅ |

### 🔥 进行中 / 待落地

- 🧪 **小圈子内测开测准备(2026-07-17 晚,Claude)**:真机冒烟通过(新档创角 7 步向导→退败开局生成约 2.5 分钟→首轮行动落定,正文质量在线)。修复退败关开局时间倒挂(opening 文本在 s01_04 之后但 initialFlags 全未完成,首任务指向已发生的平叛;现 s01_01–04 预置 done,首任务=s01_05 到昭阳宫参与新帝登基;mod-kit 源+builtin 已同步,备份 `yange/stages-pre-initialflags-fix-backup/`,`canon:build` 290 全绿+`validate:all` 通过)。共享库启用关卡 4→10(清羽 1-4/燕歌前 3/云龙坠美+临安桥接+血誓,覆盖全部 5 条 R3-8 高光;库备份 `scenario_mod_library_v1.json.bak-2026-07-17`)。测试者指引=`docs/PLAYTEST-GUIDE-SMALL-CIRCLE-2026-07-17.md`。⚠️ 已知:`validate-shared-scenario-atlas.mjs` 期望 37 stageBindings 实为 18,exit 1 为既有失败与本轮无关;§4 门禁清单待刷新为 `canon:build`+`validate:all`。冒烟在共享后端留了样例档 2 个(char_1784297682217 / char_1784299311193,可删)。initialFlags 修复=`d340215`(用户已批)。遗留观察:①退败两次新档初始境界不一致(一级/气血150 vs 三级中/气血950,Step2 数值生成随机性待查) ②开局单次 API 失败重试后总耗时可到 ~8.5 分钟(常态 ~2.5 分钟,R2-1 重试兜住) ③用户 Windows Chrome 本地库 merge 时 local 优先,可能把新启用关翻回 disabled,发现模板少了就在剧本模组 UI 重新启用。下一决策点=入口关 29 条薄摘要 mini-enrich 是否开测前做(用户未拍板)。**测试反馈集中记 `docs/PLAYTEST-FEEDBACK-LEDGER.md`**(首晚收官 **21 条**:1 非问题/15 待修/1 设计课题/压轴 #21=剧情跑歪无法收束〔用户定性的核心可玩性问题〕;四大系统性根因=notes 摊平门控失效·年龄/境界通胀·世界引力数据 1/380·记忆清洗漏路径;新威胁模型=模型预训练自带六朝原著;身份/语域漂移家族三例)。**修复优先级已定稿 `docs/FIX-SPRINT-PRIORITIES.md`**;**P0 已于 2026-07-18 完成**(Claude 执行,commits 868a764/5b38a09/a4cd510/cc44ce2:年龄投影六朝压缩+小紫毒宗回归修复〔裁定#55〕+定陶王去元婴+逐轮记忆清洗+目标接地/选项POV/rail生死三守卫;308 单测全绿,真机验证新档 39 人 0 超寿元、郭靖 4 岁)。P1 提示词护栏包→P2 收束能力〔#21 总目标〕→P3 数据治理待启;3 项待用户裁定。⚠️ 注:退败模板当前被用户从启用集下架,PLAYTEST-GUIDE 第一轮玩法需同步调整。

- ✅ **R2-0V 可玩纵切已通过**：2026-07-15 用 DEV-only 单机三槽入口走正式 `importSave()` 与持久化回读，在 Chrome 完成正典／生还／失踪三路线游玩和重载。正典无分歧；生还落 `longrest` 并在后续草庐场景继续出现；失踪落 `missing`，持续搜寻与黑魔海联络线防卫同时进入正文/行动项。同步修复导入假阳性、90 秒副对账阻塞和明确事实二次误判。R2-0 全量门已打开；其余 IF/场外结算真机抽检并入全量阶段。
- ✅ **R2-0 全量系统层已完成**：账本、人物状态、IF 接轨、prompt 消费与下游事件投影不再限定谢艺样板；没有手写 variant 的全库事件会按相关人物分歧生成确定性承接目标并屏蔽冲突 Rail。世界引力改为事件级 `offscreenResolution` 数据合同，#96 星月湖战争已迁入权威 stage；右栏新增人物状态回执和跨关战役编年史。新增分支/其他世界事件结果属于后续内容数据增量，不再需要改 R2-0 引擎。报告=`docs/R2-0-FULL-IMPLEMENTATION-2026-07-15.md`。
- ✅ **R2-4 新玩家首小时已完成**（2026-07-15）：跨轮即兴目标已有结构化任务槽、读档 prompt 与右栏展示，并补高置信确定性叙事补账（显式命令优先、去重/上限/否定与短动作护栏）；切关 UI 与 story prompt 移除下一关名/内部 ID，改为角色可感知的启程契机。真实 Chrome 测试服从创建角色、选择《六朝清羽记》第 1 关到首段叙事、行动和任务完整跑通，刷新重进后正文、地点和任务均恢复；第二步生成曾自动重试一次且无半成品落盘。
- ✅ **R2-1 API onboarding 已完成**（2026-07-15）：网页端新增首次配置四步引导、默认 API 就绪状态与保存后连接测试；无效 key、余额耗尽、权限、限流和服务不可用分级报错。配置云同步从 fire-and-forget 改为持久化 latest-write-wins 串行队列，失败保留 pending 并在下次加载优先重试，UI 展示同步状态。开局分步生成新增单次输出预算与跨层统一重试上限（总调用≤4、总重试≤2；Step1/2 各最多一次），provider 截断不再进入 JSON 解析，Step2 两败由本地安全默认值接管；真机触发一次超长正文修复后以约 1470 字正文、总 3 次调用成功落盘。完整 `validate:all`（255 测试）通过。
- ✅ **R2-3 主轴/存档契约冻结已完成**（2026-07-16）：`SAVE-CONTRACT.json` 冻结 37 stage 的 stage/chapter/event ID 与既有 completion flag 路径；新增校验器覆盖 1399 轴节点、379 个全局唯一 event ID、脊柱/IF 引用和 stage 软绑定，并接入 `canon:build`。同步修复主轴节点计数、清羽重建脚本旧脊柱索引和友通期事件陈旧轴引用；后续主轴只改软绑定，不改老存档键。
- ✅ **R2-8 叙事—数据同步兜底已完成**（2026-07-16，Claude 二审 P1 已修）：位置、即兴目标和可选任务审计员既有闭环之上，人物状态补账采用“角色专属规则 + 身份无关通用模板”。任意既存关系 NPC（含临时角色）可按高置信通用伤势/恢复词写当局 `当前状态`；主要正典 NPC 本人状态专属层经 302 人 registry、37 关及正典资料盘点扩至 13 人，覆盖冰蛊、寒毒、离魂/闭关、易碎反噬、失魂瘫痪、精血枯竭、断肢失明及袁天罡鼻血预知自身凶险；另补阮香凝瞑寂的跨角色状态，只在明确施术且点名既存中术目标时写目标。主角程宗扬另补生死根动态阶段：死气积聚、杂质伤脉及明确炼化后的解除，只写本地保护的 `角色.效果`，不重复授予灵根/技能。所有路径均不创建身份、不覆盖显式状态、不写 registry/长期记忆/剧本 flags。盘点=`docs/R2-8-CANON-STATUS-AUDIT-2026-07-16.md`。
- ✅ **R2.5 可靠性尾项继续收口**（2026-07-16）：API 请求已改为调用级配置快照与独立取消信号；旧存档四类记忆数组会清理思维链、JSON 包装和模型任务说明，新总结入库及事件对账消费共用清洗规则；临时 `_reconcileDebug` 已停止写入并在读档时移除。纯 UI 重放因当前会话无可调用浏览器控制运行时，仍保留一次测试服人工复核。
- 🧪 **R3-8×R3-1 高光小批量工程闭环，待外部体验**（2026-07-17 更新）：MiniMax 三书重抽补强二裁全部完成（清羽 282 分片/677 决策、云龙 313/779、燕歌 223/532，各 3 条脱敏隔离），并确认新结果只作旧人物高光裁定的补强层。三书 5 条小批量为燕歌董卓/班超、清羽王哲/易虎、云龙林冲；只新增班超一个 `critical:false` 事件，其余均 enrich 既有 event，旧 ID、登基脊柱和董卓生还 IF 不变。首轮 Canon Rail 当拍完成 P1 已由 `be056e8` 修复并真机重验；随后班超真机又暴露长存档上下文超限、半预制合同被截断、非阻塞事件未召回、字符串 `"true"` 和临时角色田荣持久化风险。本轮通过 prompt 状态去重、主叙事 8192 输出上限、600 字高光硬合同、点名召回一个已激活可选事件、精确完成键布尔规范化、临时角色禁落状态及 `completionEvidence` 确定性落账收口。复验完整命中班超六拍并将其 flag 落为 true，主任务仍停留 `s01_08`，证明高光不抢轴。Claude 首轮二审 `claude-2026-07-17T07-54-09-213Z-e08f6e11` 的易虎 P0 经 EPUB 原著第52章逐字复核，确认易虎确被巨石击中后卷走，问题是旧 `qingyu.54.1` 漏掉牺牲；已同步修 axis/Rail 并以“他是我哥”替换模型误写的哭喊。同轮对账互斥及主轴 evidence 死数据、林冲旧档 fallback 与意图式误落均已收口。聚焦复审 `claude-2026-07-17T08-20-17-989Z-3603286e` 确认核心修复有效、可进入小圈子内测；其发现的易虎残留短摘要及军士人数歧义已修正，并补同轮回归门禁。班超 ID/完成键已写入 append-only `SAVE-CONTRACT`；`canon:build` 290/290、37 关、1399 轴节点/380 event IDs 与 production build PASS。内测卡=`docs/R3-8-HIGHLIGHT-VERTICAL-SLICE-2026-07-16.md`；工程小批量已具备外部小圈子交付条件，反馈前不启 242 条全量或续作 canon。
- ✅ **R1-3 内容合规终审已回收**（2026-07-14 Claude 完成，R1 全清）：隔离图零泄漏/幼态复查修复4项（云如瑶16→18=裁定#98）/脱敏抽查按边界收口（成人内容不动=裁定#43，红线仅未成年×性化）。报告=`character-canon/R1-3-合规终审-2026-07-14.md`。R0 依赖项：公开发行需补角色档案层 NSFW 门控。
- ✅ **R2-6 跨关记忆 A 已落地**（2026-07-14 Claude）：lyl+lyg 2498 条/约 40 跨书角色，落点=stage `profile.memories` 按关直写（切关合并注入，时间门控天然）；红线=不写分歧 fork 终局+知情图谱保守+无据不编造。详设=`character-canon/R2-6-跨关记忆A-试点-2026-07-14.md`。
- ✅ **R2-5 OOC 盘点+修复已完成**（2026-07-14/15 Claude，执法=裁定#99）：4 边角落地——灵根注入点名档案/静态设定字段（性别/灵根/种族/出生日期）指令写保护+负向测试/NPC 边强约束优先/档案记忆 cap5。三前例（凝羽灵根/谢艺性别/苏妲己契约）双侧闭环。盘点=`character-canon/R2-5-OOC盘点-2026-07-14.md`。
- **R2-2 存档修复绕写封堵**：已完成。`characterStore.executeTavernCommands` 已接入 canonGuard、格式/值校验，并在修复模式绝对拒绝 `世界.状态.剧本模组` 与 `系统.扩展.剧本模组` 的所有写入（含 flags）；修复专用 validator 仅放行 `set`。全路径审计发现 skeleton 模式曾绕开 `commandValidator`、值校验和字段清理，现已与 strict 共用同一模型命令校验入口，仅在执行时保留轻量结构修复。P1 已用真实函数级执行通路补测并经 Claude 复审关闭；复审结论＝无 P0/P1、建议合入（定向 19/19、type-check、全量 225、37 关 schema 通过）。
- **R2.5 对账 evidence 语义相关性**：已完成。对账输出新增 `matchedCore`，并由 validator 强制与当前事件、逐字 evidence、存档上下文三点一致；已覆盖“真实但无关的上下文证据”拒绝用例。`knownCharacterIds` 为空集时拒绝 `characterStates` 的边界已补测；Claude 复审结论＝无 P0/P1、建议合入。P2 建议将 `matchedCore` 最短长度由 2 收紧至 3–4 字，暂不改变现有兼容性（定向 19/19、type-check、全量 225、37 关 schema 通过）。
- **R2 IF 重审**：14 条预写 IF 已按“自由行动后的自动承接 + 玩家可见后果”复审：谢艺、小紫、苏妲己伏诛与燕歌英逝双枢纽已是当前 event-chain 纵切（角色状态须精确匹配才触发）；其余 10 条仍属 future-stage 或余波不足的设计资产，不再虚报可玩。详见 `docs/R2-IF-BRANCH-AUDIT-2026-07-13.md`。
- **R2 内容数据扩量 MiniMax 试产**（2026-07-15）：以 4 条低后果 IF 测试 M2.7 的“事件事实—可见余波—回流点”扩写；结构 4/4 合格，但正典验收 0 条可原样落库、3 条需人工收紧、1 条淘汰。结论是可用于受约束候选生成，不得直写正典；报告=`mod-kit/generated/minimax-m2.7/r2-content-expansion-pilot-2026-07-15/REPORT.md`。
- **qingyu 全本重抽**（`scripts/reextract-qingyu.mjs`）—— 第一本 extraction 早期质量最弱，major 密度 0.63/章 vs 后两本 1.26/1.95，存在欠产 batch（水战弧 10 章 0 事件等）。重抽预期 major 185→~350。⚠️ **这是地基级改动**：完成后 qingyu 主轴段重建 → seq 重编号 → 需重映射脊柱锚点 + if 线样章 anchor。**未落库**（产 `qingyu.reextract.DRAFT.json` 不覆盖现版）。
- **if 线收尾**：validate-if-branches 接进门禁 runner；用户后审 14 条内容；if schema 接 `attitudeToProtagonist`。
- **态度建模全本跑**：qingyu 试点通过；待扩 yunlong+yange（~15 条处子/破身约束），低置信标人工核。
- **角色高光/机趣落 beat（R3-8）**：旧双模型审计与 MiniMax 三书补强二裁均已完成；核武梗样板（`12c6d84`）之后，董卓/班超/王哲/易虎/林冲共 5 条工程小批量已落。**方法论/材料索引/优先级公式全录 `RELEASE-ROADMAP.md` R3-8**；外部反馈通过前不启动 242 条批量铺开。
- **R3-8 角色表演卡 MiniMax 预扫**（2026-07-18，只读、未裁定）：从三部 EPUB 角色名命中片段与现有角色卡抽样扫描小紫/秦桧/朱老头/月霜/吕雉/贾文和。结论＝方向有效但称谓幻觉、缺证反推、秘密关系扩写与阶段越界明显，模型草稿不得直写 canon；推荐小紫+贾文和先做两张可追溯证据卡。报告=`docs/R3-8-VOICE-CARD-MINIMAX-SCAN-2026-07-18.md`。
- **R2-9 收尾已认领**（2026-07-18，Codex）：用户批准按推荐方案推进。裁定口径＝即兴大弧线采用“分歧账本显式立牌”（小偏放任/中偏收编/大偏玩家选择回轨）；242 高光继续冻结；漂移标本档封存为只读回归样本。执行顺序＝P1 双路由护栏 → R2-0 世界引擎 2A 检测/主动回轨 → 2B 世界引力/主动回合 → P3 治理 → 小紫+贾文和表演卡纵切 → 整环真机验收。
- ✅ **R2-9 工程收口（2026-07-18，Codex）**：P1 12 条双路由叙事护栏+接地目标回报；P2 近 6 轮三指标偏离评分、中偏收编/大偏玩家选择、右栏“斩线回轨”、一次性收束桥、世界每 2–3 回合主动与失败加权；世界引力从 1→23/380（新增 22 条，严格限当前激活节点，跳过郭解/董卓等 IF 生死拍，备份=`stages-pre-r2-9-world-gravity-backup`）；P3 裁定 #55 硬 lint、天赋情境因子+UI 标注、1616 人物实例可复跑审计；R3-8 首批小紫+贾文和阶段化表演卡接入，点名决策场景“只汇报/等命令”会在分步/非分步路由最多退回重写一次。MiniMax 实测首稿失败、重写后主动落子，但仍会编具体事实，扫描/自测输出均不入 canon。审计报告=`docs/R2-9-DATA-GOVERNANCE-AUDIT-2026-07-18.md`；242 继续冻结，漂移档只读封存。本批未重启/改写在线测试服，待整环门禁后在离线窗口部署。Claude 整体二审所报 P1“分步末次表演校验失败清空正文”已修：只有尚可重试时清空首稿，末次保留正文进入 Step 2；326 测试、`canon:build`、`validate:all` 全绿。二审所报台账状态滞后亦已回填：#5/#13/#17 分别标明核心已完成及 deadline、确定性台词 lint、大规模 NPC 议程池的后续边界。
- ✅ **R2-9 补充收口（2026-07-19，台账 #23／裁定 #108）**：阮香凝“凝玉姬”、黑魔海玉姬/高层与潜伏暗桩身份明确为内部机密；共享双路由护栏现统一执行“角色档案后台真值≠场内人物知识”，并点名限制吕雉、霍子孟等无揭露证据 NPC 不得直接识别或审问。从三处生成/抽档源删除原典未确立的“十二玉姬”固定数量说法，`canon:build` 扩展禁词执法防回流。327 测试、37 关 schema、`validate:all` 与 production build 全绿；裁定簿 NAS 镜像已核同。
- ✅ **R2-9 #23 Claude 二审补洞（2026-07-19，裁定 #109）**：二审确认方向正确并指出门禁编排、v2 回流源及传播语义缺口。现已将裁定 lint 强制接入 `validate:all` 与 production `prebuild`，直扫生成/最终产物/生成脚本/v2 输入；清理旧源并留备份。机密身份规则允许基于可见异常怀疑盘问但禁止先知点破，已知者延续、未告知者不继承，阮香凝本人公开与玩家泄密分开，后者须玩家明确授权并承担政治/关系后果；新增游婵通用规则回归。结构化 `revealedTo/evidenceFlags` 按既定边界留关系密档知情引擎 B/C。`canon:build` 330/330、100 份裁定产物、`validate:all` 与 production build 全绿。
- 🆕 **第二轮小范围测试反馈（2026-07-19，台账 #24/#25）**：#24 已核实为“96 张官图与 schema 地基存在，但 stage 引用、资产 manifest、统一解析器及叙事/关系展示槽未闭环”，按 P1 先做 6–10 位主要角色纵切；#25 已核实为“本地关键词 preflight 与旧主叙事自行 `〔判定〕` 并存”，导致漏命中时正文直接给出结果，按 P0 先统一判定权威、明确掷骰前确认并补三入口/同义表达/新生风险/刷新重试回归。两项目前均已落档，尚未实施。
- 🆕 **第二轮动机反馈（2026-07-19，台账 #26）**：当前主线 UI 只有单行 objective，即兴目标入库与展示只剩 `{标题}`；#5 的回报也只在完成后临场决定，接取前没有“相关角色—为何现在—下一步—代价/收益—可能打开的未来”承诺。按 P1 先做当前关 3 位已登场主要角色的故事机会纵切，再与 #24 头像合成高代入的人物机会卡；不直接批量生成任务，避免把自由互动任务化。
- 🧪 **世界演员首段已接运行时（2026-07-19，裁定 #110）**：采用“通用骨架 + 单 stage 开关”，不重写全局。`lyg.event.s01_05` 现以登基前夜压力源调度董卓/贾文和/霍子孟三条议程；右栏展示世界征兆、两张机会卡、why now/下一步/风险收益及回执，追踪后进入行动队列。只有玩家亲历完成承重拍才幂等解锁贾文和谋议或霍子孟军情权限；场外推进不伪记亲历、不授奖。默认 `process_only`，三路均回定陶王登基，阮香凝和郭解/董卓后续生死节点不提前消费。备份=`yange/stages-pre-r2-10-world-actor-backup`；发测前又对齐源 stage、builtin 与测试包的 `world/manifest/opening` 三层入口，并补齐旧测试包缺失的世界演员合同，备份=`yange/stages-pre-r2-10-entry-alignment-backup`。首个玩家新档暴露 `initialFlags` 虽为真但 `completedEventIds` 未同步，UI 仍激活 `s01_01`；现已由通用初始化按完成合同投影初始已完成事件，回归钉死首锚=`s01_05`。`canon:build`、`validate:all`、335 测试与 production build 全绿；LaunchAgent 已重启，共享 Mod 库保持启用，浏览器真机确认入口显示“新帝登基前夜”。提案/验收=`docs/R2-10-WORLD-ACTOR-VERTICAL-SLICE-2026-07-19.md`；测试指引已刷新为“诏令/入宫/不介入”三路线。

- ✅ **R2-9 控制协议正文泄漏已修（2026-07-19，台账 #27）**：真机捕获 `【贾文和·高智行为硬合同】`、`【世界留钩】正文结尾必须……` 与孤立反引号。共享 R2-9 双路由规则现明确禁止复述内部协议；角色级合同去掉高回显标题；生成门禁把已知 prompt echo 判为可重试失败；流式展示与最终叙事/记忆入库共用窄范围清洗兜底，保留实际世界动静、正常环境与 NPC 心理标记。Claude 二审 job=`claude-2026-07-19T09-04-41-536Z-f2bd8809` 的补洞见下一条。
- 🛠️ **R2-9 协议泄漏 Claude P0 补洞（2026-07-19）**：二审任务超时但已登记 10 条发现；4 个 P0 已修：`splitInitStep1` 接回共享 R2-9 护栏并在开局 Step1 检测/重试协议泄漏；联机兜底日志与模型服务器日志统一清洗；补齐“可选介入窗口/角色表演卡”两类漏网标签；旧 `系统.历史.叙事` 回读清洗并防继续导出污染。剩余 P1/P2（loading 原始分片短闪、标签单一事实源、末次降级依赖兜底、流式半标签短闪、合法截断反引号碰撞）已留台账 #27，待后续批次。Claude 补丁级复审（2026-07-19）：方向与实现确认可交付；新增一条具体 P1＝检测清单比清洗清单宽（世界演员合同/世界回合/机会追踪/承重角色保护/Canon Rail 只检测不清洗），末次降级稿清洗后未复检泄漏即接受，建议清洗后复检一次并与"标签单一事实源"一并收口。
- 📐 **亲密档案层立项（2026-07-19，R3-8B，用户拍板）**：动机＝亲密关系女性角色差异化不足。intimacyProfile 挂角色人工正典档案、走表演卡谱系（storyContext 注入），**不进 NPC 决策内核**；四纪律＝①年龄硬门禁（validator 执法接 `canon:build`，按实际年龄非外貌原型）②亲密场景+成人开启双条件注入、标签低显著度且同步登记检测+清洗两份清单 ③揭示层级接好感阶段做解锁玩法 ④来源双轨（canon 有据直用 / authored 经用户审定），首批仅 6–12 名亲密线主要女角。**待用户圈选首批名单后起草**；验收＝去名字盲测能认出是谁。规格=`docs/R3-8-INTIMACY-PROFILE-SPEC-2026-07-19.md`。
- 🧪 **R2-10B 两轮二审修复完成，G1 通过、G2 待验（2026-07-19，Codex）**：验收正式拆为两门。G1 用同一 `inputHash=7681bd8e` fixture 无网络重放 R3→R1→R2，三线均在 worldTurn 10 结算；R3 唯一 offscreen 回执且零权限，R1/R2 各唯一 participated 回执与对应权限，生产 canonGuard、runtime、局势白名单、hidden、跨锚清理、JSON 重载及幂等全过，命令=`npm run test:g1:npc`。G2 负责真实模型演出、泄漏、数字认识论、行动选项和玩家可读性，尚待当前版本真机重放。数量/生死/跨句门禁、追踪旧档、effect/config 迁移审计等两轮二审项均已闭环。**R2-10B 仍为 `[~]`；G1 已解锁 `s01_06–08` 隔离数据扩写，G2 前不得合并部署、共享服外测或总量铺开。** 报告=`docs/R2-10B-NPC-DECISION-CORE-TRUE-DEVICE-ACCEPTANCE-2026-07-19.md`。
- 🧭 **R2-10C 世界时间合同 + `s01_06–08` 跨事件 G1 通过（2026-07-20，Codex）**：事件分 `canon_anchor/window/emergent`，以首次结构资格为零点执行 `notBefore/deadline`；发生、公开、玩家获知分别留痕，未获知场外事实从 prompt、世界线面板和编年史隐藏。`s01_06` 资格后 1 回合激活/第 6 回合截止，`s01_07` 当轮激活/第 5 回合截止，两者消息延迟 1 回合；`s01_08` 为无硬截止的秘密对话，worldTurn 20 仍不会伪造玩家已知。三事件各有独立决策核、局势白名单和机会，跨事件存档/hidden/零场外授权全绿。**下一批：态度→knowledge→effects 完整反馈环，再做冲突/反制/多回合生命周期。** 报告=`docs/R2-10C-WORLD-TIMELINE-AND-CROSS-EVENT-G1-2026-07-20.md`。
- ✅ **R2-10D 态度／知识／effects 反馈环 G1 通过（2026-07-20，Codex）**：`knowledgeFacts/requiresKnowledge` 在评分前执法角色知情边界；少维度 `-100..100` 态度进入阈值与归一化效用；`stateEffects` 只改变事件局部资源、当前承重角色态度和已声明知识。跨事件 `actorMemory` 仅继承态度与知识，资源仍局部初始化。统一二审后补齐 validator 对初值／阈值／关系 effect 的范围强制及旧档运行时钳位。`s01_06` 攻守知识解锁后续行动、`s01_08` 核验链不泄黑魔海机密、`s01_05→07` 贾文和退场次序经 JSON 重载改变候选集均已自动验证。报告=`docs/R2-10D-NPC-FEEDBACK-LOOP-G1-2026-07-20.md`。
- ✅ **R2-10E 行动冲突／反制／多回合生命周期 G1 通过（2026-07-20，Codex）**：`durationTurns` 已成为存档内 `activeAction`，严格经历 started/continuing/completed 且 effects 只落一次；同域相反 stance 或显式 counter 由效用分+power 本地裁定，败方 effects/知识/态度和生命周期不落账，更强反制可中断在途行动。统一二审后改为全局稳定强度顺序裁定，`blocked` 败方立即退出本轮，不能继续阻断第三方。`s01_06` 郭解护持 vs 剑玉姬破坏和护送 vs 封路为首批冲突，`s01_07/08` 验证协同行动与秘密来源生命周期。报告=`docs/R2-10E-NPC-CONFLICT-AND-LIFECYCLE-G1-2026-07-20.md`。
- ✅ **R2-10F 地区／势力／人物分层唤醒 G1 通过（2026-07-20，Codex）**：决策核现按 local-critical/faction/offscreen-critical/minor/group 五档预算唤醒；当前地点、在场人物、受影响势力、追踪点名、重大事件与 cadence 是确定性输入，`wakeAudit` 逐 actor 留因。在途行动优先唤醒；休眠 actor 不结算、不泄露。`s01_06–08` 数据及旧 core 兼容均已回归。**下一批：机会卡与长期 NPC 记忆。** 报告=`docs/R2-10F-LAYERED-WAKE-G1-2026-07-20.md`。
- ✅ **R2-10G 机会卡与长期 NPC 记忆 G1 通过（2026-07-20，Codex）**：机会由 actor/action/knowledge 确定性触发并完整记录出现、追踪、过期、参与或场外状态；UI/prompt 只显示当前可用卡。统一二审后，卡片首次追踪时间不可由切换刷新，六回合到点后 `tracked` 显式转 `expired` 并拒绝重追。NPC 的行动、冲突与玩家介入形成显著度封顶 12 条的长期经历，JSON 重载和跨事件保留；相关标签进入后续候选评分及回执。报告=`docs/R2-10G-OPPORTUNITY-AND-NPC-MEMORY-G1-2026-07-20.md`。
- ✅ **R2-10H 跨书异构扩量 G1 通过、统一二审已收口（2026-07-20，Codex）**：清羽 `lcq.s10_04` 用势力级 emergent 复盘补给/军机断点，云龙 `lyl.s05_09` 用本地级 window 调度押运遇劫；两书复用同一决策、唤醒、机会和记忆内核但独立声明局势与不变量。二审后验收改为真实 JSON 往返、连续三轮生产 runtime、整份存档字节串／哈希一致；清羽与云龙均独立断言零授权。评分对象按稳定 key 遍历，可选上下文按 JSON 语义归一，同一 inputHash 不再受插入顺序影响。**世界/NPC 引擎 G1 路线与统一二审均已收口；既有 G2/共享外测门禁不变。** 报告=`docs/R2-10H-CROSS-BOOK-SCALE-G1-2026-07-20.md`，二审收口=`docs/R2-10I-SECOND-REVIEW-CLOSURE-2026-07-20.md`。
- 🛠️ **R2-10K G2 误杀与角色卡覆盖已修（2026-07-20，Codex）**：商贸“抽／折／增三成”和坊市路线不再被军事数量门禁误杀，军税／兵力／军事距离反例仍拦；疑问语境补 `有无(?!数)|有没有`；`s01_05` 允许已知组织名“黑魔海”，仍保护未揭露“盛姬”及其关联。三书结构化角色卡审计发现萨安／朱诺／弥骨连续 9 关存在但总卡漏失，已补最小卡并新增硬回归，305 张总卡、250 名 stage 出场角色、结构化缺口 0；另列 19 名跨 batch 高置信补卡候选，盛姬不再作为孤立个案抢建。`canon:build` 37 关、390/390 测试全绿，NAS 正典镜像已单向同步。报告=`docs/R2-10L-MISSING-LOAD-BEARING-CHARACTER-AUDIT-2026-07-20.md`。**仍待同源三路线 G2 真机重跑，R2-10B 保持 `[~]`。**
- 🛠️ **R2-10B 玩家知情账本 V1（2026-07-21，裁定 #121）**：把既有“未核实数字可叙述但不得写回世界真值”推广为显式 `playerKnowledge` 状态，V1 仅含 `confirmed/rumor`、`player/public`、`learnedAtTurn/sourceEventId`；与世界真值和 NPC 知识分账，LLM 写路径已封禁。证据只来自主角档案记忆、当前开场、已完成且玩家已获知事件与引擎确定性揭露；canon 仅作名字词典/审计嫌疑，关系边完全不参与。燕歌纵切移除 6 个已知实体裸名禁词，阮香凝秘密身份与吕冀未来结局改关联级保护；审计脚本固定为只报告不失败。**R2-11 方案①真机合同已通过；R2-10B 仍保持 `[~]`，须用同一 fixture 重跑 33 回合确认误杀归零。**
- ✅ **R2-10B G2 真机验收关闭（2026-07-21，Codex + Claude）**：同源 R1/R2/R3 共 33 轮全部落定，参与合同、唯一权限／回执、R3 机会卡到期场外及引擎独占 `done` 均通过；已知姓名误杀为 0。角色怀疑 13/13 放行、身份坐实 8/8 拦截，“你我三人”与“各退一步”各 3/3 放行；新增五类兵力数量原句 5/5 拦截，四类普通人数／语义句及近邻变体 8/8 放行，关联、兵力、距离回归带 13/13。最终修复 `N人 + 马上／马车／马不停蹄／马前后` 的中文分词回归并纳入自动化；该项不再追加真机轮次。**R2-10B 已由 `[~]` 翻为 `[x]`，后续低频门禁措辞记已知项，不阻塞世界引擎架构主线。**
- 🛠️ **R2-11C 结构化机会推进动作 G1（2026-07-21，Codex）**：`s01_05` 已实现追踪／执行分离，追踪不再把整条路线塞进行动队列；主界面由本地合同固定插入带 `opportunityId/stepId/actionId/timeCost/contractHash` 的推进按钮，成功回合后才结算。安民／选材／定都的真实选择进入 `completionChoices`，旧按钮跨步骤、过期与合同热更均拒绝；自由文本继续作为兼容入口。下一步扩 `s01_06–08` 并补剩余窗口与 `partial` 收束。报告=`docs/R2-11C-STRUCTURED-OPPORTUNITY-ACTIONS-G1-2026-07-21.md`。
- ✅ **R2-11D 跨事件结构化动作与 partial 收束 G1（2026-07-21，Codex）**：结构化按钮已贯穿 `s01_05–08`；`s01_06` 护送交接、`s01_07` 未核实边警与两种联络线、`s01_08` 私密知识核验均不依赖 LLM 选项或关键词推进。右栏显示步骤进度与剩余重要行动次数；绝对截止按 `participated / partial / offscreen` 三分，partial 保留有效步骤、选择和 NPC 经历但不授完整权限。跨事件测试已并入 `test:g1:npc`。下一门转入本地判定型步骤与非机会卡 completion，不再机械扩关键词序列。报告=`docs/R2-11D-CROSS-EVENT-ACTIONS-AND-PARTIAL-G1-2026-07-21.md`。
- ✅ **R2-11E 非机会卡本地判定完成 G1（2026-07-21，Codex）**：首个无机会卡事件 `s01_09` 已接 `playerCompletionContract.local_condition`；主界面固定动作由程序按行动前存档判为 success／partial，模型只演出既定结果，模型命令执行前已锁定 outcome，`done` 继续由 runtime 独占写。完全忽略则在六回合绝对截止场外结算，Rail 不会卡死。合同热更拒绝、JSON 重载、LLM 越权与 validator 反例均有自动化。下一门把 outcome 接入 effects／关系／知识，并验证失败后准备与重试。报告=`docs/R2-11E-NON-OPPORTUNITY-LOCAL-COMPLETION-G1-2026-07-21.md`。
- ✅ **R2-11F 事件结果反馈闭环 G1（2026-07-21，Codex）**：`s01_09` 的 success／partial 已通过窄白名单合同反馈 NPC 态度、NPC 知识、玩家知识与长期经历；态度运行时钳位、知识幂等排序、记忆复用 12 条显著度淘汰，LLM 对这些状态无写入权。装载校验覆盖越界 delta 与未知 actor。R2-11 覆盖增至 5/380；下一门验证失败后准备／重试生命周期。报告=`docs/R2-11F-OUTCOME-FEEDBACK-G1-2026-07-21.md`。
- ✅ **R2-11G 失败—准备—重试生命周期 G1（2026-07-21，Codex）**：本地事件动作新增 `attempt / prepare` 与事件内 preparation key；failure 不结算、同轮只消费一个动作、准备本身不结算、重试只在准备后开放，状态经 JSON 重载保持且合同热更即清。`s01_09` 已验证贸然宣旨失败→核对名册印信→按程序重试成功，三段分别反馈态度、NPC 知识与长期经历；直接 success／partial 与六回合场外截止仍保留。报告=`docs/R2-11G-FAILURE-PREPARATION-RETRY-G1-2026-07-21.md`。
- ✅ **R2-11H 跨书完成合同扩量 G1（2026-07-21，Codex）**：清羽 `lcq.event.s10_04_left_army_review` 与云龙 `lyl.event.s05_09` 接入两步结构化完成合同，覆盖无截止 persistent emergent 与五回合 window 两种结构。两书复用既有局势反馈、NPC 多回合行动、分层唤醒、权限／回执幂等及 12 条长期记忆，不复制燕歌局势键；JSON 多轮逐字节重放、亲历唯一授权、场外零权限均有自动化。覆盖增至 7/380。报告=`docs/R2-11H-CROSS-BOOK-COMPLETION-SCALE-G1-2026-07-21.md`。
- ✅ **R2-11I 二审 P0/P1 关闭（2026-07-21，Codex）**：场外结算新增 `local_condition` 合同 hash+ready 所有权保护，玩家在绝对截止同回合成功时只记 participated，不再与 offscreen 抢写；清羽／云龙各补演员不在场、未点名、势力未受影响时的 sleeping→零 decision→JSON 逐字节 replay。报告=`docs/R2-11I-DEADLINE-OWNERSHIP-AND-WAKE-REVERIFY-2026-07-21.md`。
- ✅ **R2-11J 明确目标事件批量迁移（2026-07-21，Codex）**：新增 `objective_action` 合同，玩家选择引擎固定【主线推进】动作即完成声明目标，不暗做属性检定，LLM 禁写真值。幂等脚本仅迁移有 objective、唯一标准完成键、无 completionEvidence、非隔离关的事件，共 267 个（清羽122／云龙59／燕歌86），覆盖 7/380→274/380；三书各抽样验证命令拒绝、引擎完成和 JSON 逐字节重放。剩余=34 个非隔离特殊结构+72 个隔离关。报告=`docs/R2-11J-OBJECTIVE-ACTION-BULK-MIGRATION-2026-07-21.md`。
- ✅ **R2-11K 非隔离特殊事件迁移（2026-07-21，Codex）**：21 个登场事件采用“留在现场观察并回应”的展示动作，10 个无 objective 剧情拍逐项人工补目标，左武军／易虎／班超 3 个半预制高光拆成三步 preparation 链；修复 active 非关键合同因不属于 narrative anchor 而不显示／不落账的问题。覆盖 274/380→308/380；剩余 72 个全在八个隔离关，依裁定 #61/#62 先重建来源。报告=`docs/R2-11K-SPECIAL-EVENT-CONTRACTS-2026-07-21.md`。
- ✅ **R2-11M 隔离关首关来源重建 `lyl.luoyang_coup`（2026-07-21，Claude，裁定 #122/#123）**：双模型复核对本关均为 `insufficient_evidence`／JSON 截断，等于零可用模型证据，全部结论改由 EPUB 第 66 集《两宫交兵》逐章原文比对得出（章序与 `source-index.json` 逐条互验，8 个章名逐字命中）。核出四类确定性缺陷并落修：①轴 idx 278 错标——seq 890-893 实出自源 279《弑君》/280《凌辱》，而源 278《游宫》原文无任何死亡，已重标为 `yunlong.279.1/2/3` 与 `yunlong.280.1`，脊柱与 `lyl.if_youtongqi_rescued` 三处引用同批改；②`s06_01b` 与 `s06_01` 依赖方向与原文相反，已交换；③源 286《赏格》整章无覆盖致桓郁谈判与中垒军军司马叛投两条下游因果断头，已补非关键事件 `s06_04b` 并按 append-only 追加 `SAVE-CONTRACT`；④四个 objective 与原文矛盾（`s06_01` 主角其时已被困昭阳宫藻井、`s06_03` 武库陷落在下一章且主角从未去过、`s06_06` 吕奉先属吕氏平叛军与主角非同阵营、`s06_01b` 主角是目睹非潜入），已按原文重写——这四条正是批量脚本必须禁跑的实证：本关 7 个事件全都满足 `objective_action` 的机械筛选条件，脚本会照单全收并把错误目标固化成引擎动作。八拍一律人工撰写 `objective_action`（否决 `local_condition`：本关结局由脊柱固定，无原文依据支持属性阈值，硬造 `successWhen` 即「按事件名猜合同」）；`s06_05` 给出两条并列拒绝，正典结局相同。实施中发现并修掉一个真缺陷：补录拍无轴序且不进事件链时**整章会在它浮出前收束、永远玩不到**，已排进链并以「空存档整章重放八拍按序落账」钉死。`r2_11j` 的隔离关断言改为双重门禁（隔离关永不得出现 `advance_declared_objective`；只有 `sourceRebuiltStageIds` 内的已重建关允许带合同）。**重建不等于解除隔离：本关仍在 `DEFAULT_LINE_QUARANTINED_STAGE_IDS`。** `canon:build` 424 测试/37 关、`validate:all`、`test:g1:npc`、production build 全绿；R2-3 契约 1399 轴节点/37 关/381 事件 ID。报告=`docs/R2-11M-QUARANTINE-LUOYANG-COUP-SOURCE-MAP-2026-07-21.md`。**遗留观察**：`lyg.event.highlight_banchao_lamb_leg` 是同形态无轴序非链事件，是否同样不可达本轮未验证。
- ✅ **R2-11N 洛都政变人物投影校准（2026-07-21，Claude）**：`43e4380` 来源重建未触及人物层，八拍 `relatedCharacterIds` 已按 EPUB 第 66 集逐章（0359-0371）核对重校——只收映射章内实际在场行动者：s06_01 补回程宗扬/二赵/中行说/金蜜镝，s06_03 移除仅被提及的吕冀并补回救援线（徐璜/唐衡/左悺/蔡敬仲/赵飞燕/金蜜镝等），s06_04 补守卫战攻防双方（敖润/吴三桂/刘子骏/齐羽仙/卢景/云丹琉/左悺），s06_06 补泄密链与阙楼组（齐羽仙/蔡敬仲/吕戟/云丹琉/卢景）；**s06_04b 移除误挂班超**（《赏格》章班超仅场外提及，本人未出场；s06_02 通商里议事在场，保留）。11 名真实参与者按时间门控补入本关 `canon.characters`（敖润/齐羽仙/金蜜镝/徐璜/唐衡/中行说/高智商/吴三桂既有 id 沿用，左悺/刘子骏/吕戟新建 `lyl.character.*`；吕戟因 flag slug 末段避 `lv_ji` 碰撞取 `lv_ji_changshui`），三人按 R2-10L `stage-canon-gap-recovered` 先例补最小总卡（只用原文坐实事实）。中行说未回搬第三本「内宅总管」身份（时间门控）。修复脚本=`scripts/fix-luoyang-coup-character-projection.mjs`（幂等），回归=`tests/r2_11n_luoyang_coup_character_projection.test.mjs`（逐拍清单+班超双向断言+slug 防碰撞+注册表覆盖），备份=`yunlong/stages-pre-r2-11n-charfix-backup/`、`character-cards-v3.json.pre-r2-11n.bak`。`canon:build` 428 测试/37 关、`validate:all` 全绿；覆盖数字不变（316/381），本关仍在隔离名单。
- ⏸️ **R2-11L 日终测试／Claude 交接（2026-07-21）**：生产代码停止在 `97c46dd` 后，用户先做游戏内测试。交接档固定今日三个提交、四类真机检查点、剩余八个隔离关的逐关来源重建顺序及禁止事项；后续 Claude 不得直接把 72 个旧事件批量合同化或回接默认 Rail。交接=`docs/R2-11L-DAY-END-TEST-AND-CLAUDE-HANDOFF-2026-07-21.md`。
- ✅ **R2-11B `s01_06–08` 跨事件确定性完成 G1（2026-07-21，Codex）**：迁移覆盖从 1/380 增至 4/380。`s01_06` 护持新君与 `s01_07` 承接边警均采用 `timeline_deadline`：玩家三步完成只登记 ready，郭解／董卓死亡仍须等程序绝对截止才落 `done`；`s01_08` 私下核验与认识论分层两步完成后立即结算，并以 `persistent` 保留无截止事件的唯一完成入口，避免卡片过期后永久卡轴。三线均不读取 LLM 正文/命令，模型直写被拒；JSON 重载、参与/场外竞争、唯一权限与 validator 缺截止／冲突过期反例已覆盖。报告=`docs/R2-11B-CROSS-EVENT-DETERMINISTIC-COMPLETION-G1-2026-07-21.md`。**下一门先做结构化推进选项、可见窗口与 `partial` 收束，再扩非机会卡事件；禁止继续机械复制关键词合同。**
- 📐 **世界/NPC 引擎设计参照系已落 roadmap（2026-07-19，用户拍板，Claude 执笔）**：`RELEASE-ROADMAP.md` R2-9 节末新增实现指引——确定性调度定"发生什么"、LLM 只管"怎么讲"（渲染层+提案层，红线＝LLM 永不直接回写权威状态）；文明6议程/三国志态度阈值/CK3阴谋/L4D Director/宿敌系统五条借鉴映射分别对接世界演员扩量、态度建模、机会卡形态、压力调度定位、分歧可见反馈；拒绝全量模拟/竞争AI/自由外交/每NPC独立agent。**Codex 后续做世界演员扩量或态度建模时须先读该节对齐。**

### 📋 列入「未来功能」

- 立绘 E-M2/M3/M4（上传存储 / 展示区 / AI 自动生成）。
- 燕歌行后续续写全新 canon（最大未来项，见 §5-F）。

### 🚫 已决定不修 / 待定

- D5 yange extraction 索引错位（纯展示位偏移，标记不修）。
- D2 阮香琳/蛇夫人/蛇奴 拆分、D3 尹馥兰/兰姑（身份层遗留，原文证据不足待人工裁定）。
- 6 条约束破戒后果需原文确认（碧奴/林娘子/虞紫薇/白仙儿/襄城君/孙寿）。

---

## 4. 验证门禁（任何模块改完都必须过）

在真实工作目录跑：

```bash
npm run type-check          # TS 类型
npm test                    # 单测（当前 186 用例，全绿）
npm run mod:validate        # 18 关卡 Mod 校验，必须 18/18 PASS
node scripts/validate-shared-scenario-atlas.mjs   # 共享 atlas（exit 0）
node scripts/validate-if-branches.mjs             # if 线（若动到 if/spine）
```

改完 mod 数据后：`node scripts/sync-builtin-mods.mjs` → 同步 NAS `完善版剧本Mod/` → `launchctl kickstart -k …` 重启服。
- 「补漏不重做」是铁律：脚本一律 union/补空不覆盖、晚期内容时间门控、每步落 `stages-pre-*-backup/`。
- 已存档不回溯，UI/坐标类变更需新开局验证。

---

## 5. 并行分工：可独立认领的模块

> 下面每个模块尽量**互不冲突**（动的文件集分开）。**唯一全局耦合点 = qingyu 全本重抽**（模块 B）会位移 qingyu 的 seq/锚点 —— 所有依赖 qingyu 主轴 seq 的工作（if 线锚点、主轴对齐）应在 B 落库前后协调，别同时改 qingyu 锚点。

### A. 角色数据深度补全 ⭐ 推荐首选，独立性最高
- **缺口**：~130 次要角色 `description` 未小说化；~20 男性外貌薄/无；多数角色 `memories` 仅 qingyu 8 人有；per-stage `currentAppearance`/`currentThought` 多缺。
- **可干**：扩 `regenerate-main-descriptions.mjs` / `extract-appearance-from-epub.mjs` 覆盖到次要角色；补 memories。
- **冲突面**：改的是各关 `canon.characters[].profile` 字段（补空不覆盖），不动主轴/if 线 → 与 C/D/E 并行安全。
- **铁律**：性格优先级 = 用户 OVERRIDES > 人物卡 > 原文抽取；**别拿 description blurb 当性格源**（会加暗黑滤镜）。改人设改 `consolidate-personality-drafts.mjs` 的 OVERRIDES。

### B. qingyu 全本重抽（地基，需协调）
- 跑 `reextract-qingyu.mjs` → 重建 qingyu 主轴段 → seq 重编号 → `reanchor-spines.mjs` / `reanchor-if-branches.mjs` 重映射锚点。
- **认领者必须独占 qingyu 主轴/锚点**，完成前通知其他模块暂停动 qingyu seq。后两本 yunlong/yange 不受影响。

### C. if 线 / 分支系统
- 14 条已成型（qingyu4/yunlong5/yange5；`if-branches-sample/` + `character-canon/{book}.if-branches.json`）。
- **可干**：把 `validate-if-branches.mjs` 接进门禁 runner；if schema 接 `attitudeToProtagonist`（翻转处子/破身时态度同步翻）；性别置换轴（genderswap，纯沙盒 if 层永不进 canon，样章已起 `qingyu.if-genderswap.SAMPLE.json`）；云龙/燕歌各再扩几条。
- **冲突面**：动 `if-branches/` + spine + schema，不动关卡 mod profile → 与 A 并行安全；但 anchor 依赖 qingyu seq，需与 B 协调。

### D. 态度建模 + 约束体检收尾
- 扩 `model-attitude-from-epub.mjs` 跑 yunlong+yange（~15 条处子/破身约束）。
- 6 条约束破戒后果原文确认（`constraints-audit.md` 列表）。
- 产物入 `character-canon/*.character-constraints-draft.json` → 投影 profile.notes。与 A 共享角色文件，注意先后顺序（都补空不覆盖，错开角色集即可）。

### E. 立绘 / 头像
- 数据地基已在（schema/validator/运行时）。EPUB 官方插图已抽 96 张（`character-canon/portraits/`，覆盖 ~50 角色）—— **有官图直接用，没官图的才生成**。
- **可干**：E-M2 上传/存储（IndexedDB + `img:<key>` 解析）；E-M3 立绘展示区；E-M4 AI 生成（主力引擎 = GPT via Codex 免费但慢；付费快速 = grok/gemini-3-pro-image）。
- **内容红线**：未成年/孩童化角色拒绝任何性化立绘；外貌字段取 `*.appearance-draft.json` 的 `appearance`+`bodyFeatures`，**别取** `character-descriptions.json`（有损摘要丢身材）。`portrait-risk-audit.json`：113 SAFE / 10 HIGH。
- **冲突面**：app 前端（`src/`）+ portraits 数据，与 A/C/D（数据层）几乎不冲突。

### F. 燕歌行续写新 canon（最大未来项，**设计层已定稿**）
- **结局蓝图 v2 已定稿=真值源**（`character-canon/ENDING-BLUEPRINT.md`，裁定 #69/#80-89）：三幕脊椎（人→组织→系统逐幕升维）、六国收束、终战=对抗自动策展系统、岳氏全谱/续写"毕业生"终幕；剧透血缘已落**关系密档层**（`RELATIONSHIPS-SECRET.md`，方案 A，不进可见关系网）。启动钩子仍 = #1017 李辅国魂魄占郭氏躯体。
- **待执行**：141 个空 ending 回填 + if 顶层分岔锚点定义 + 新承重脊柱/新角色（canon 新造）/新地区（扩 shared-atlas）。
- **独立 milestone（未做）**：运行时"知情 NPC 主动行动"注入引擎（按知情图谱分层可见 / per-stage 解锁），把密档血缘受控注入给该知情的 NPC。
- **难点**：无原文可抽 → 须「多模型协同创作」；独立性高但工作量最大、需用户深度参与方向。

### G. 应用侧功能 / 游戏内渲染
- 势力对外关系（factionRelationships）数据已在 worldInfo，但**游戏 UI 可能未渲染** → 游戏侧 Vue 工作。
- 是 `src/` 前端范畴，与数据层并行安全。

---

## 6. 工作分工惯例（用户定的固定模式）

- **Claude 管概念/方向/质量护栏**（框架·原型·schema·防过度推断·防过度模糊）；**DeepSeek 管批量原文读取 + 逐角色细化**。
- DeepSeek 坑：大块露骨原文易被审核返空、综合型约束易误判 unsupported → 用「约束式分类」（锚定章节窗口 + 只要标签不要复述细节）规避。
- **人物卡 = 权威源**，别太歪（程宗扬曾被抽成"随和洒脱"，卡实为"务实/精明/有野心"）。
- 未经用户要求不擅自 git 提交、不擅自同步 NAS 成品区（草稿类先待审）。

---

## 7. 给新 agent 的最短上手路径

1. `cd` 进真实工作目录（§1），`git log --oneline -5` 确认在 `d6a3323` 一脉。
2. 读 `character-canon/CORE-DOCS-ROADMAP.md`（带 ✅ 的逐项进度）+ 本文 §5 选一个模块。
3. 跑一遍 §4 门禁确认基线绿。
4. 认领模块前，若涉及 qingyu 主轴/锚点，先与模块 B 认领者对齐。
5. 改完 → 门禁全过 → 同步内置/NAS → 重启服 → （必要时）Chrome MCP 连 Windows live 验证。
```
