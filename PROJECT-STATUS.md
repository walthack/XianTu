# 仙途 (XianTu) · 项目总体状况与并行分工文档

> 面向「新加入的 agent」。读完这一篇即可独立认领一个模块开工。
> 最后更新：2026-07-22（R2-11X：**37 关、396/396 确定性合同与 10 张精选机会卡已完成工程收口，最终 Claude 二审无 P0/P1**。全局回归逐一证明 396 个事件都有唯一完成所有者、LLM 直写 396/396 被拒；389 个 objective、1 个 local condition、6 个机会合同事件，8 个来源重建关共 88 个事件仍全部 quarantine。二审指出的机会卡生命周期 P2 已由后续提交 `0755a6e` 补成真实 trigger→追踪→两步结构化推进→JSON 重载→唯一回执重放；第二轮 P0 可见掷骰已收归本地单一权威，P1 记忆总结改为正文提交后的隔离任务并有失败/并发追加回归，`npm test` 496/496。最新产物=`docs/R2-11X-GLOBAL-CONTRACT-CLOSEOUT-2026-07-22.md`。）
> Roadmap 清账（2026-07-22）：R2-10B/C/K/M 的历史中间态已按后续 G2 与 R2-11 证据关闭；旧并行分工表已替换为当前六类可认领模块，Canon TODO 的已完成／部分完成／真实未完成项亦已重新归类并同步 NAS。

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

**最终目标**：让当前 396 个事件**都不再依赖 LLM 直接掌握世界真值**。
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

#### 已完成的迁移面：事件 completion flag

它同样是世界真值（直接决定 `completedEventIds` → 回执 → 权限）。截至 R2-11W，
37 关共 396 个事件已全部收归本地引擎：389 个 `objective_action`、1 个 `local_condition`，
另 6 个由带确定性完成合同的机会卡推进。LLM 正文与命令均不构成完成证据。

`canonGuard.findScenarioFlagViolation` 管的是**资格**不是**属实**：
只能 `set`、只能写 `true`、路径须为 `flags.<event|chapter>.<id>.done`、事件须唯一可解析、
且必须落在 `getScenarioEventIdsAllowedForCompletion` 内（不得越级完成非当前章节/活跃事件）。
所有事件现在都带事件级或机会级确定性合同；`canonGuard` 会拒绝模型直写其完成 flag，
事件对账也不得跨越合同。模型只演出已经由本地动作／条件／时间线裁定的结果。

R2-11 当前覆盖 **396/396**：267 个结构明确事件受限迁移，122 个特殊／来源重建事件使用人工
`objective_action`，燕歌 `s01_09` 使用非机会卡本地判定；燕歌 `s01_05–08`、清羽左武军复盘与云龙
伊水押运使用机会卡行动序列。八个来源重建关共 88 个事件虽已合同化，仍全部保留 quarantine，
不得把“引擎可完成”误作“允许回接默认 Rail”。全局收口证据见
`docs/R2-11X-GLOBAL-CONTRACT-CLOSEOUT-2026-07-22.md`。

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
`player_action_sequence`，每个成功回合最多推进一步。后续已按结构扩展为事件级 `objective_action`、
`local_condition` 与失败—准备—重试，最终覆盖全部 396 个事件。

**交互方向已实施（2026-07-21）**：追踪与执行已分离，
由引擎固定提供带 `opportunityId / stepId / actionId / timeCost` 的推进选项，与 LLM 自由选项合并；
具体政策选择进入状态，模糊自由文本不误推进。关键事件采用不受 `steeringCooldown` 冻结的绝对截止，
UI显示进度、剩余窗口与时间成本，截止按 `participated / partial / offscreen` 收束。设计与实施门禁见
`docs/R2-11-OPPORTUNITY-ACTION-UX-DESIGN-2026-07-20.md`。

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
- 🧪 **R2-10B 中间检查点：G1 通过（2026-07-19，后续 G2 已于 2026-07-21 关闭）**：同一 `inputHash=7681bd8e` fixture 无网络重放 R3→R1→R2，三线均在 worldTurn 10 正确结算；当时遗留的真实模型 G2 已由下方“R2-10B G2 真机验收关闭”完成，不再是当前待办。报告=`docs/R2-10B-NPC-DECISION-CORE-TRUE-DEVICE-ACCEPTANCE-2026-07-19.md`。
- 🧭 **R2-10C 世界时间合同 + `s01_06–08` 跨事件 G1 通过（2026-07-20，Codex）**：事件分 `canon_anchor/window/emergent`，以首次结构资格为零点执行 `notBefore/deadline`；发生、公开、玩家获知分别留痕，未获知场外事实从 prompt、世界线面板和编年史隐藏。`s01_06` 资格后 1 回合激活/第 6 回合截止，`s01_07` 当轮激活/第 5 回合截止，两者消息延迟 1 回合；`s01_08` 为无硬截止的秘密对话，worldTurn 20 仍不会伪造玩家已知。三事件各有独立决策核、局势白名单和机会，跨事件存档/hidden/零场外授权全绿。**下一批：态度→knowledge→effects 完整反馈环，再做冲突/反制/多回合生命周期。** 报告=`docs/R2-10C-WORLD-TIMELINE-AND-CROSS-EVENT-G1-2026-07-20.md`。
- ✅ **R2-10D 态度／知识／effects 反馈环 G1 通过（2026-07-20，Codex）**：`knowledgeFacts/requiresKnowledge` 在评分前执法角色知情边界；少维度 `-100..100` 态度进入阈值与归一化效用；`stateEffects` 只改变事件局部资源、当前承重角色态度和已声明知识。跨事件 `actorMemory` 仅继承态度与知识，资源仍局部初始化。统一二审后补齐 validator 对初值／阈值／关系 effect 的范围强制及旧档运行时钳位。`s01_06` 攻守知识解锁后续行动、`s01_08` 核验链不泄黑魔海机密、`s01_05→07` 贾文和退场次序经 JSON 重载改变候选集均已自动验证。报告=`docs/R2-10D-NPC-FEEDBACK-LOOP-G1-2026-07-20.md`。
- ✅ **R2-10E 行动冲突／反制／多回合生命周期 G1 通过（2026-07-20，Codex）**：`durationTurns` 已成为存档内 `activeAction`，严格经历 started/continuing/completed 且 effects 只落一次；同域相反 stance 或显式 counter 由效用分+power 本地裁定，败方 effects/知识/态度和生命周期不落账，更强反制可中断在途行动。统一二审后改为全局稳定强度顺序裁定，`blocked` 败方立即退出本轮，不能继续阻断第三方。`s01_06` 郭解护持 vs 剑玉姬破坏和护送 vs 封路为首批冲突，`s01_07/08` 验证协同行动与秘密来源生命周期。报告=`docs/R2-10E-NPC-CONFLICT-AND-LIFECYCLE-G1-2026-07-20.md`。
- ✅ **R2-10F 地区／势力／人物分层唤醒 G1 通过（2026-07-20，Codex）**：决策核现按 local-critical/faction/offscreen-critical/minor/group 五档预算唤醒；当前地点、在场人物、受影响势力、追踪点名、重大事件与 cadence 是确定性输入，`wakeAudit` 逐 actor 留因。在途行动优先唤醒；休眠 actor 不结算、不泄露。`s01_06–08` 数据及旧 core 兼容均已回归。**下一批：机会卡与长期 NPC 记忆。** 报告=`docs/R2-10F-LAYERED-WAKE-G1-2026-07-20.md`。
- ✅ **R2-10G 机会卡与长期 NPC 记忆 G1 通过（2026-07-20，Codex）**：机会由 actor/action/knowledge 确定性触发并完整记录出现、追踪、过期、参与或场外状态；UI/prompt 只显示当前可用卡。统一二审后，卡片首次追踪时间不可由切换刷新，六回合到点后 `tracked` 显式转 `expired` 并拒绝重追。NPC 的行动、冲突与玩家介入形成显著度封顶 12 条的长期经历，JSON 重载和跨事件保留；相关标签进入后续候选评分及回执。报告=`docs/R2-10G-OPPORTUNITY-AND-NPC-MEMORY-G1-2026-07-20.md`。
- ✅ **R2-10H 跨书异构扩量 G1 通过、统一二审已收口（2026-07-20，Codex）**：清羽 `lcq.s10_04` 用势力级 emergent 复盘补给/军机断点，云龙 `lyl.s05_09` 用本地级 window 调度押运遇劫；两书复用同一决策、唤醒、机会和记忆内核但独立声明局势与不变量。二审后验收改为真实 JSON 往返、连续三轮生产 runtime、整份存档字节串／哈希一致；清羽与云龙均独立断言零授权。评分对象按稳定 key 遍历，可选上下文按 JSON 语义归一，同一 inputHash 不再受插入顺序影响。**世界/NPC 引擎 G1 路线与统一二审均已收口；既有 G2/共享外测门禁不变。** 报告=`docs/R2-10H-CROSS-BOOK-SCALE-G1-2026-07-20.md`，二审收口=`docs/R2-10I-SECOND-REVIEW-CLOSURE-2026-07-20.md`。
- ✅ **R2-10K G2 误杀与角色卡覆盖修复（2026-07-20；后续复验已关闭）**：商贸比例／坊市路线误杀、疑问语境及已知组织名边界均修复；萨安／朱诺／弥骨三张硬缺卡已补。后续同源三路线 G2 已通过；19 名高置信补卡候选仅保留为内容质量队列。报告=`docs/R2-10L-MISSING-LOAD-BEARING-CHARACTER-AUDIT-2026-07-20.md`。
- ✅ **R2-10B 玩家知情账本 V1（2026-07-21，裁定 #121）**：显式 `playerKnowledge` 已与世界真值、NPC 知识分账，LLM 写路径封禁；随后同一 fixture 的 33 回合 G2 已确认已知姓名误杀归零，本项关闭。
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
- ✅ **R2-11O 洛都政变人物投影白名单化（2026-07-21，Claude，用户裁定）**：`2dcefdc` 的跨关整条目复制会把后期身份/经历/外貌带进早期时间线（金蜜镝凉州军阵披麻叩首外貌、中行说「内宅总管」归属、齐羽仙「玉姬之一」race 等），已改为**本关最小字段白名单投影**——11 个补入条目只含 `id/name/description/role/gender/affiliations/locationId/profile{origin(,notes)}`，静态档案由 canon:build 卡投影与运行时 registry 还原，realm/技能/物品等进度量一律不写；中行说「内宅总管」属燕歌行时区身份，`scripts/project-affiliations-to-stages.mjs` 新增**时间门控排除表**（`AFFILIATION_TIME_GATE_EXCLUSIONS`，逐条附依据）防投影回灌。修复脚本改为同 id 先删后写（自修复幂等），**备份永不覆盖原始快照**（`stages-pre-r2-11n-charfix-backup/` 与 `.pre-r2-11n.bak` 只在不存在时创建；快照已验证为 43 人、含班超误挂的原始态）。回归新增第六条：白名单字段结构断言 + 未来内容标记（内宅总管/凉州军/定陶王叩首/玉姬之一等）+ 中行说归属精确断言（开发中曾把「剑玉姬」误命中「玉姬」标记，已改精确为「玉姬之一」）。`canon:build` 437 测试/37 关、`validate:all` 全绿。
- ✅ **R2-11P 临安黑海关来源重建（2026-07-22，Codex + Claude 二审，裁定 #124）**：`lyl.lin_an_black_sea` 已从混入第 9–14 章与无来源推演的旧稿收回 EPUB 第 6–8 章《临安》《雷峰》《衙内》；15 个冻结 eventId 保持 append-only，按原文重写语义并串成唯一依赖链，只保留 `yunlong.6.1/8.1/8.2` 三条有据轴。opening/world background、15 人、10 势力、4 地点与逐人 affiliations 同步按时区收口；“凝姨”在角色卡投影、势力投影和运行时 registry 三处门控，不提前揭示真名、婚姻与黑魔海身份；旧 `mingqingsi_encounter` 后续章节高光 fallback 已删除。15 拍全部使用人工 `objective_action`，空档可顺序完成五章并逐字节重放；Character RAG `sourceHash` 改为覆盖最终 entries，stage-derived ID/`stagePresence` 变化会触发清库重建。覆盖 316/381→331/381，本关仍在 quarantine。`canon:build` 445 测试/37 关、`validate:all`、production build 全绿；Claude 二审无 P0/P1。二审 P3 已收口：删除重建脚本无效 `completionPath` 分支并补本条正文记录。**非阻断观察单独留档**：冯源显式角色卡门控仅作未来防御性增强，当前不是缺陷；后续隔离关不得照搬普通 completedEvent 的“场外插叙确认”模式，涉及真正机密实体时应优先使用 `offscreenResolution`。报告=`docs/R2-11P-QUARANTINE-LIN-AN-BLACK-SEA-SOURCE-MAP-2026-07-22.md`。
- ✅ **R2-11Q 历史误名“太泉探险”来源重建（2026-07-22，Codex + Claude 二审，裁定 #125）**：`lyl.taiquan_expedition` 的源窗口 12–14 与轴 563–566 实际均属临安《镖局》《宝刀》《处子》；旧稿的苍澜、太泉古阵、赤阳圣果、结盟与撤离无来源，且真正太泉已由后续三关覆盖。保留冻结 stage/event/chapter ID 与 completion path，五拍重写为江州军情、威远试探、屠龙刀伏击、林家疑云、西湖密谋；四条现有轴逐条复用，军情细拍不伪造轴。14 人、9 势力、1 地点收口；五名揭密敏感人物采用最小投影并做构建期／运行时时间门控，全体 affiliations 锁定。五拍人工合同及空档 JSON 回放通过；首次全量门禁修复 content 引用闭包与旧小紫 `contentAccess` 残片。Claude 二审无 P0/P1；P2 补回屠龙刀伏击现场参与判断的秦桧。**P3 记录**：惠远误挂本关阶段投影是父提交历史遗留，当前不在本关演员闭包、无运行时泄漏，留待正典表专项清理；registry/manifest 大 diff 已确认是 stagePresence 翻转后的机械重生成。覆盖 331/381→336/381，本关仍在 quarantine。`canon:build` 450 测试/37 关、`validate:all` 与 production build 全绿。报告=`docs/R2-11Q-QUARANTINE-TAIQUAN-EXPEDITION-SOURCE-MAP-2026-07-22.md`。
- ✅ **R2-11R 鬼王峒决战来源重建（2026-07-22，Codex + Claude 二审，裁定 #126）**：`lcq.stage_06` 六个冻结 ID 保留，按 EPUB 第112–124章纠正三处来源错误：鬼巫王被吞由下一章复述改绑 `qingyu.114.2`；龙神真正坠亡改绑 `qingyu.117.1`，谢艺拍仍严格保留裁定 #90 的 `s06_03 + qingyu.116.1 + lcq.if_xieyi_longrest`；冰蛊拍删除旧稿虚构的具体解法，改绑第124章明确确认的 `qingyu.126.2`。三个矛盾 objective 改为现场见证、围猎收束与承接小紫决断，`s06_04` 未弑母 IF 锚点不动。演员 42→13 且全部采用时点最小投影，构建期角色卡／势力投影与运行时 registry 三层门控；地点 58→2，关系按开场／事件引用闭合；六拍人工双步合同可从空档按序重放。Claude 两轮二审无 P0/P1；P1 已修：显式保存 `01→02→03` 可玩顺序并硬校验 critical ID，避免未来解除隔离时冻结轴 `210/211` 把谢艺拍倒排，同时不篡改裁定 #90。两项原 P2 已修：13 人 affiliation 锁与三层时间门、聚焦 prompt 泄漏回归；聚焦复审新增的测试证明力 P2 亦已收口，prompt 用例现点名并逐一断言全部 13 人。P3 单记：registry/manifest 为机械重生成，脚本本地双跑幂等且备份安全。覆盖 336/381→342/381，剩余四个隔离关共 39 事件；本关仍在 quarantine。`canon:build` 457 测试/37 关、`validate:all` 与 production build 全绿。报告=`docs/R2-11R-QUARANTINE-LCQ-STAGE-06-SOURCE-MAP-2026-07-22.md`。
- ✅ **R2-11S 白湖赌局至蛇彝村来源重建（2026-07-22，Codex + Claude 二审，裁定 #127）**：`lcq.stage_03` opening 从提前写入冰蛊、赌局后关系与南荒行程，收回到第18章中段“苏妲己已识破并扣押程宗扬”；十个冻结 ID 保留，重复绑定 `qingyu.33.1` 的 `s03_07/08` 拆正为铁索桥与劝住武二郎。旧稿在第33章即收束，漏掉下一关成立所需的第33–36章，故 append-only 新增 `s03_10` 太乙拦船、`s03_11` 雨林/黑石滩、`s03_12` 抵达蛇彝村；不提前宣告第37章后的袭击与灭村真相。九名演员采用第18章时点最小投影并做构建期／运行时时间门，全体 affiliations 锁定；13 拍人工双步合同可从空档重放至整章完成。Claude 二审无 P0/P1/P2；P3 仅记录 SAVE-CONTRACT 事件数组未按游玩顺序排列，不影响功能。事件总数 381→384，覆盖 342/381→355/384；本关仍在 quarantine。`canon:build` 463 测试/37 关、`validate:all` 与 production build 全绿。报告=`docs/R2-11S-QUARANTINE-LCQ-STAGE-03-SOURCE-MAP-2026-07-22.md`。
- 🛠️ **R2-11T 碧鲮湾至鬼王峒初探来源重建（2026-07-22，Codex + Claude 二审，裁定 #128/#129）**：`lcq.stage_05` opening 收回到第73章大潮后、第74章鲛人袭击前；十个冻结 ID 保留，重复与倒序轴绑定全部纠正。旧稿在第84章阴煞后提前收束，首稿 append-only 新增 `s05_10–15` 衔接至第92章；Claude 二审发现 P1＝漏掉 `qingyu.82.2` 蛇傀焚村与解救碧鲮族的关键因果，现 append-only 新增 `s05_16` 并插回小紫登场后、古道失散前。十四名演员采用时点最小投影，构建期卡／势力与运行时 registry 三层门控；17 拍人工双步合同可空档重放。P3 单记：第85章小魏支线和第86章工匠氛围拍不合同化，来源报告已明示；章节完成路径冻结校验偏弱沿用既有处理。事件总数 384→391，覆盖 355/384→372/391；剩余两个隔离关共 19 个旧事件，本关仍在 quarantine。补洞验证与聚焦复审进行中。报告=`docs/R2-11T-QUARANTINE-LCQ-STAGE-05-SOURCE-MAP-2026-07-22.md`。
- ✅ **R2-11U 长安佛门暗潮至水香楼余波来源重建（2026-07-22，Codex + Claude 二审，裁定 #130）**：`lyg.shixiang_ambush` opening 收回到第669章佛门公敌法旨后、杨玉环紫云楼示警前；删除水香楼邀捕、毒方刺客与女忍已到场等未来泄露。九个冻结 event ID、四个 chapter ID 和原 completion path 保留，append-only 补 `shixiang_s10–s14`，14 拍按 seq1093→1115 串行落为人工双步合同；三组重复轴与跨章倒序消失。演员由 66 人收口为 15 人时点投影，技能／功法／物品／境界与 content access 不回灌。source70、81.2、82.1 成人私密拍及 source75.1 除夕氛围拍不机械合同化。事件总数 391→396，覆盖 372/391→386/396；本关仍在 quarantine。Claude 二审无 P0/P1/P2；P3 单记：opening 以未经证实的传话略微预告首拍调查由头，但未预写结果、flag 或后续来源事实，暂留作叙事钩子。报告=`docs/R2-11U-QUARANTINE-LYG-SHIXIANG-AMBUSH-SOURCE-MAP-2026-07-22.md`。
- 🛠️ **R2-11V 甘露密谋至程宅战榜来源重建（2026-07-22，Codex + Claude 二审，裁定 #131）**：`lyg.ganlu_bian` opening 固定在 source126《滴漏》后，李昂后日诛宦计划作为已完成事实；旧 `sourceEnd=135` 与下一关重叠，现收回 source132《程宅战榜》，source133–135 凉州盟、招魂、小紫闭关全部归还下游。十个冻结 event ID、四个 chapter ID 与原 completion path 保留，按 seq1193→1202 加 source132 两个无现成轴细拍重写为十个串行人工合同；47 人收口为 14 人，构建期卡／affiliations／派生关系同步锁定。source127.2、128.3 成人拍及 source132 活扣、诊病旁支不机械合同化。二审 P1 已修：不动冻结 chapter completion path，按实际 eventIds 重写章节标题／摘要，使 `release_jingnian` 所在章明确包含“权宦追凶”，下一章准确对应甘露搅局与小紫问法。P3 单记：gitignored `lyg.ganlu_bian.sources.md` 仍是 source135 旧构建参考，不进入 runtime／测试／发布产物。覆盖 386/396→396/396；八个隔离关来源重建与合同化全部完成，但 quarantine 状态不变。报告=`docs/R2-11V-QUARANTINE-LYG-GANLU-BIAN-SOURCE-MAP-2026-07-22.md`。
- 🛠️ **R2-11W 三书精选机会卡扩写（2026-07-22，Codex，裁定 #132）**：全库机会卡 7→10，但继续禁止“一事件一卡”。清羽左武军复盘补小紫错位消息试探，云龙伊水押运补反伏击现场留证，燕歌董卓退场补贾文和撤离后勤；三张卡均由本事件真实 `decisionCore` actor/action 触发，默认局势至少有一项确定性入选行动可达。每张卡使用两步结构化行动，只授一次性复核／协调权限并写 NPC 记忆，不改变泄密真凶、金铢损失、董卓退场、边警真伪或任何 Canon Rail 结局。生成脚本二次运行三源文件哈希不变；`canon:build` 482 测试/37 关、`validate:all` 与 production build 全绿，待提交后 Claude 二审。报告=`docs/R2-11W-CURATED-OPPORTUNITY-CARDS-2026-07-22.md`。
- 🛠️ **R2-11X 全局事件合同收口审计（2026-07-22，Codex）**：37 关共 396 个事件，精确分布为 389 个 `objective_action`（267 受限机械迁移＋122 人工合同）、1 个 `local_condition`、6 个仅由机会合同完成的事件；10/10 机会卡有显式 trigger 与确定性完成合同。新增回归逐一模拟全部 396 个 LLM 完成写入并确认全部拒绝，同时确认 8 个来源重建关／88 个事件仍在 quarantine。首次全量 `npm test` 发生一次 Node test-runner 子进程反序列化版本瞬时错误，目标文件单跑 27/27、随后全量复跑 485/485，确认为 IPC 抖动而非代码断言失败。待两轮 Claude 二审收口后把 R2-11 工程里程碑翻为完成。报告=`docs/R2-11X-GLOBAL-CONTRACT-CLOSEOUT-2026-07-22.md`。
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

## 5. 当前可认领模块（2026-07-22 清账后）

> 历史 qingyu 全本重抽、IF 校验接门、R2-10 G2 与 R2-11 已全部收口，不再作为新 agent 待办。以下按当前优先级排序。

### A. 发测前门禁 ⭐ 当前首选
- **可见掷骰单一权威**：退役无本地回执的 LLM `〔判定〕`，统一 preflight→确认→掷骰→回执；覆盖三入口与刷新／重试。
- **结构化响应／记忆总结真机复测**：验证总结失败不破坏成功正文，失败路径保持零副作用。
- **发布对象裁定**：小圈子内测可直接进入发测；公开发布另需角色档案层 NSFW 门控。

### B. 单机化清理
- 按 R2-7 删除账号／登录、在线状态、联机游历、创意工坊、云账号 UI／路由／死代码。
- 保留本地 `save-storage`、`cloudDataSync` 与 devserver 存档链；单独分支、可回滚。

### C. 角色与势力数据质量
- 合并后的角色卡／描述二审队列：11 个阶段身份转折优先，再去重抽查约 25 张重点卡。
- 主要角色 affiliation 噪声抽查、148 人窄范围富化重扫、19 名高置信补卡候选。
- 势力 additions 剩余二验、友通期等人工复核、里程碑奖励落点。

### D. 地点、记忆与写实系统
- 常驻地点／`locationId` 补档与更深地点风貌扫描；现有地点检索纵切已可用。
- 全局花名册／分层私有知情 B；R2-6 的跨关记忆 A 已完成。
- 技能完整效果表、跨国移动约束、商店／掉落国别选源与经济平衡。

### E. 表现层与内容扩量（须先看小圈子反馈）
- 五条枢纽高光与两张 Voice Card 做外部对照；通过后再定 242 条高光批量、立绘槽和 top 20–30 表演卡。
- 立绘先做 SAFE manifest + resolver + 6–10 位主要角色消费闭环；已有官方插图优先。
- 亲密档案层等待用户圈选首批 6–12 名，继续执行年龄与双条件注入硬门禁。

### F. 燕歌续作与远期沙盒
- 先做第一幕“长安驱魂局”可玩纵切，再决定 141 ending 回填广度。
- 关系密档知情注入 B/C 与续作纵切一并设计；无原文部分走多模型协同创作。
- 地区沙盒／平行选国保持远期 overlay，不写回正典。

---

## 6. 工作分工惯例（用户定的固定模式）

- **Claude 管概念/方向/质量护栏**（框架·原型·schema·防过度推断·防过度模糊）；**DeepSeek 管批量原文读取 + 逐角色细化**。
- DeepSeek 坑：大块露骨原文易被审核返空、综合型约束易误判 unsupported → 用「约束式分类」（锚定章节窗口 + 只要标签不要复述细节）规避。
- **人物卡 = 权威源**，别太歪（程宗扬曾被抽成"随和洒脱"，卡实为"务实/精明/有野心"）。
- 未经用户要求不擅自 git 提交、不擅自同步 NAS 成品区（草稿类先待审）。

---

## 7. 给新 agent 的最短上手路径

1. `cd` 进真实工作目录（§1），`git status --short` 与 `git log --oneline -5` 确认当前分支／工作区；不要依赖历史固定提交号判断基线。
2. 读仓库根 `RELEASE-ROADMAP.md`、本文顶端最新状态与 §5；涉及正典数据时再读 `character-canon/CORE-DOCS-ROADMAP.md`／`TODO-待完成.md`。
3. 跑一遍 §4 门禁确认基线绿。
4. 认领模块前检查当前分支与他人改动；涉及 canon、核心 prompt 或冻结 ID 时先读裁定簿与 `SAVE-CONTRACT.json`，不得覆盖受保护字段。
5. 改完 → 门禁全过 → 同步内置/NAS → 重启服 → （必要时）Chrome MCP 连 Windows live 验证。
```
