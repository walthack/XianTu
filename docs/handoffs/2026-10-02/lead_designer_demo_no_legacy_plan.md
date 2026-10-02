# Demo无legacy迁移方案（2026-10-02，待拍板，未实施）

建议覆盖清羽短demo与星月湖落地连续demo，长线到lcq.event.xiao_opens_resources为止。不新建sceneContracts、阶段系统、事件文件或交谈框架；沿用runGameModelModule、现有模块提示词/回执、地方合同与processGmResponse。范围内每个成功回合只能是模块演出或模块入口下的固定本地结算；真实外部LLM是否成功须另验，不以改path标签冒充迁移。

仓库根目录：/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu。下述路径均相对该根；附录给各数据文件的绝对路径及事件行号。

## 当前legacy类别与迁法

| 当前类别（来源） | 最小迁法 | 主要风险/验证 |
|---|---|---|
| 白湖之前18个白名单事件，模块关/材料拒收/失败时仍回落（AIBidirectionalSystem.ts:678/1024/1041） | demo强制从模块入口开始，固定快照最多两稿；保留已有packet/本地预结算与后检查，失败不能进入legacy分支。模块开关只控制正式版/范围外或删除demo关闭选择 | 一稿失败二稿成功；两稿失败没有第三个legacy请求，不执行合同，不写历史/记忆，不动存档 |
| 白名单外与离馆之后所有事件（modularTurn.ts:44，playtestNarrativeScope.ts:76，legacyPilotScenes.ts:4/135；附录全列） | 模块适用域改用现有两个demo标记+长线终点；为现有事件动作生成紧凑packet，复用compileLegacyNarratorPacket中公开事实、present、记忆摘录、结算回执字段。18个已验证场景保留专用检查；新增事件用既有事件/在场人物/地点/动作预结算作基础校验，不能只加白名单而仍被acceptLegacyPilotScene拒收，也不能整段关掉正典验证 | 武二郎第一步、南荒切关、支援谢艺、救治判定、萧遥逸到访/资源托付逐合同动作覆盖；局部事件不重演、固定生死合同不改 |
| 自由输入、提问、交谈，无事件选择（AIBidirectionalSystem.ts:683–696；legacyNarrativePilot.ts:89） | 同一tryModularTurn支持“未选事件动作”：从当前event/location/present、玩家输入和最近两条记忆生成现有场景字段，调用同一narrative模块。没有本地行动映射不推进合同；不造eventAction，不预完成事件。既定时间流逝/到点世界事件仍走当前引擎，公开结果加入同一回合材料 | “商馆开多久”“三个月回不来”均模块演出且不自动订约；否定/条件/问句不偷变同意，剧情到点织入仍照原本逻辑 |
| opportunity动作/探索与移动，旧模块入口排除（AIBidirectionalSystem.ts:683，1061–1086） | 将现有纯本地preview提前到模块入口：五原移动/应对、锦囊重复领取、机会合同与拒赌旧局部合同有可靠句时固定正文直接出；没有可靠句则同一narrative模块接收该地方合同公开预览事实。继续用现有settle函数，禁止写手控制库存/位置/机会完成 | 有本地句0次模型，不新增合同；无句1次模块；失败不落账，重复点/重复提交不重复交付 |
| 骰子/谢艺救治judgementResolution（AIBidirectionalSystem.ts:683；MainGamePanel.vue:2466；judgementEngine） | 保留现有公开掷骰/暂停确认以及verifyResolvedJudgementReceipt；已核验骰果/本地效应交narrative模块演出，成功后现有提交点一次落账。骰果由既有回执冻结，重试不能重新掷骰或换判定 | 支援+2、乐明珠救治、谢艺死亡/救活保持合同；取消、切档和迟到返回0副作用 |
| 模型拒收/截断兜底（AIBidirectionalSystem.ts:1739–1777；modularTurn.ts的attemptModuleNarrative） | 有现成固定本地正文的明确动作可不调模型；已经尝试模块且两稿失败一律保留输入、报“本轮未完成，请重试”，不回落完整legacy，不伪称合同已推进。复用generationFailed早退及UI错误状态，不自动调用retryAIResponse开启第二套旧链路 | 模块失败副作用为0；业务合同以成功提交后为准；若产品要求失败也推进必须另拍板，默认不做 |
| 旧pilot/fast/开关关闭，以及旧初始化入口（AIBidirectionalSystem.ts:835/741/1871） | demo入口前拦住所有旧路由；fast旧true也不能抢走demo回合；legacy pilot保留只供范围外直至全项目退役。现有demo固定开场/切关文本照用，不额外模型调用。独立generateInitialMessage只有实际demo调用点时才迁，当前无该调用证据 | 设旧fast/pilot true及模块false仍不发legacy；非demo行为不变；card空表清理由独立批准，不混入迁移 |

注意：当前“模块”仍依赖名字带Legacy的plan/packet/验证函数，名字不是执行旧链路的证据。迁移必须保留有效验证/事务，复用当前文件内工具，逐步把选动作规划和旧pilot开关耦合解开；不复制一个新场景系统。后台记忆/审计继续从已展示checked text取数据、回合/存档版本隔离，不让失败演出触发后台任务。

## 失败规则及测试/smoke影响

推荐：同一快照最多重试一次；两稿拒收/传输失败后前台报错、输入保留、忙碌释放，不提交游戏状态，不启动记忆/审计。复用现有timeout/AbortError类型，不能把取消当可重试，不为了demo无legacy而扩大超时预算。未来明确错误不应走UI现有自动结构化重试入口。

修改modularTurn.test.mjs的失败策略、baihuGambleRefusal.test.mjs原生成失败仍本地推进样本（仅模块失败情境改，真正固定本地合同仍正常）、run4FollowupRepairs.test.mjs跨回合隔离。smoke-module-framework.mjs现在Q3断言“fell back to legacy”，需改为两次模块+零旧请求+零落账+手动重试成功。smoke-key-beat-card.mjs保留自由交谈/结局展示但断言来源是modular或模块入口下的local。新增参数化全路线事件覆盖、自由交谈、机会、骰子、长线切关以及旧开关残留；不能只查回执path，还须检查请求形态与prompt大小，确认没有完整SaveData/legacy system。

全量tests/tsc/diff与临时端口受控smoke每批执行；最终另跑真实模型从落地连续到资源托付，分开报告演出/连续剧情/失败恢复/时延。19k增量说法已由原日志纠正，不能把“无legacy”直接称为30秒SLA通过。

## 分批实施与估算

1. 长线结构化覆盖：modularTurn.ts、playtestNarrativeScope.ts、legacyNarrativePilot.ts、legacyNarratorPacket.ts、legacyPilotScenes.ts、AIBidirectionalSystem.ts约6文件，新增/调整180–300行；tests/现有smoke约140–220行。先武二郎纵切，再参数化盘点全部动作。验收：每个新覆盖动作到模块，关卡/死亡/移动事实不变、无长legacy提示。不要在中间批次宣称无legacy目标完成。
2. 自由交谈/地方动作/判定：主要同上文件+MainGamePanel.vue、judgementPreflight/现有preview调用，约4–7文件/160–260行，测试约180–280行。验收问句不推进、地方合同0模型固定结果、公开判定一次结算、记忆与正文一致、跨档取消无污染。现有事件数据不改。
3. 强制demo无旧路由、错误重试与清理批准项：AIBidirectionalSystem.ts、modularTurn.ts、MainGamePanel.vue、试玩启动页、Hud约5文件/60–120行（不含获准card/fast删除量），测试/smoke约120–200行。完成后全路线所有successful receipt为modular或明确local，遗留开关全组合均不触发legacy；两稿失败不落账。再进行真实模型连续验收。

合并后预计触及8–11个现有运行文件，400–680行调整/新增；测试/smoke约440–700行。是读取现状后的范围估算，不是逐补丁工时承诺。风险最高在长路线模块适用域、自由输入隐含推进、谢艺救治事务与重试冻结骰果；迁移不改生死合同/裁定，不迁用户旧档，不清存档，不把原版范围外旧链路一并删。

## 需制作人拍板

- demo是否指两个试玩入口及落地→xiao_opens_resources整段（建议是）；是否包括world_sim人为偏离（建议本次只strict试玩，world_sim明确报超出demo，不能悄悄进legacy）。
- 模块两稿失败零推进、玩家手动重试（建议采纳）；现成固定地方结算无需调用LLM且记local是否符合“模块链路”（建议采纳，以统一模块入口而非全回合强制LLM为准）。
- fast旧开关在demo强制忽略/停用、模块关闭选项是否撤掉（建议采纳）；删除全项目fast/card代码另按bugfix5第七节批准，不与迁移绑定。
- 旧档仍沿原快照，仅新开档验收（建议采纳）；旧档数据升级另轮，不能靠本轮迁路由解决P0-2。

## 附录：当前长demo关卡全部声明事件与模块覆盖缺口

这是数据完整盘点，不声称每个可选/支线事件都在真机跑到。18个白名单事件仅在离馆前、selected/resolved_text动作且材料/模型通过时可模块；其他声明事件均需迁移或证明在终点前不可达。终点后剧情不纳入本次运行，但同一关卡内其节点仍列出防遗漏。各行带JSON原始位置。

### lcq.stage_01（7个声明事件）

| 事件 | 当前结构化模块覆盖 | 数据出处 |
|---|---|---|
| `lcq.event.s01_01` | 18白名单内；失败/自由交谈仍可能legacy | [lcq.stage_01.json:1969](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_01.json:1969) |
| `lcq.event.s01_02` | 18白名单内；失败/自由交谈仍可能legacy | [lcq.stage_01.json:2017](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_01.json:2017) |
| `lcq.event.s01_03` | 18白名单内；失败/自由交谈仍可能legacy | [lcq.stage_01.json:2097](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_01.json:2097) |
| `lcq.event.s01_04` | 18白名单内；失败/自由交谈仍可能legacy | [lcq.stage_01.json:2163](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_01.json:2163) |
| `lcq.event.s01_05` | 18白名单内；失败/自由交谈仍可能legacy | [lcq.stage_01.json:2645](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_01.json:2645) |
| `lcq.event.s01_06` | 18白名单内；失败/自由交谈仍可能legacy | [lcq.stage_01.json:2711](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_01.json:2711) |
| `lcq.event.debut_yueshuang` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_01.json:2774](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_01.json:2774) |

### lcq.stage_02（18个声明事件）

| 事件 | 当前结构化模块覆盖 | 数据出处 |
|---|---|---|
| `lcq.event.s02_01` | 18白名单内；失败/自由交谈仍可能legacy | [lcq.stage_02.json:2292](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_02.json:2292) |
| `lcq.event.s02_02` | 18白名单内；失败/自由交谈仍可能legacy | [lcq.stage_02.json:2702](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_02.json:2702) |
| `lcq.event.s02_03` | 18白名单内；失败/自由交谈仍可能legacy | [lcq.stage_02.json:2829](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_02.json:2829) |
| `lcq.event.s02_04` | 18白名单内；失败/自由交谈仍可能legacy | [lcq.stage_02.json:2887](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_02.json:2887) |
| `lcq.event.s02_05` | 18白名单内；失败/自由交谈仍可能legacy | [lcq.stage_02.json:2935](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_02.json:2935) |
| `lcq.event.s02_06` | 18白名单内；失败/自由交谈仍可能legacy | [lcq.stage_02.json:2982](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_02.json:2982) |
| `lcq.event.baihu_shangguan_escape` | 18白名单内；失败/自由交谈仍可能legacy | [lcq.stage_02.json:3030](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_02.json:3030) |
| `lcq.event.sudaji_south_pact` | 18白名单内；失败/自由交谈仍可能legacy | [lcq.stage_02.json:3075](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_02.json:3075) |
| `lcq.event.wuerlang_joins` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_02.json:3154](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_02.json:3154) |
| `lcq.event.ningyu_regicide_offer` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_02.json:3243](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_02.json:3243) |
| `lcq.event.gamble_bond_signed` | 18白名单内；失败/自由交谈仍可能legacy | [lcq.stage_02.json:3304](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_02.json:3304) |
| `lcq.event.charge_sudaji_fee` | 18白名单内；失败/自由交谈仍可能legacy | [lcq.stage_02.json:3366](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_02.json:3366) |
| `lcq.event.free_ajiman` | 18白名单内；失败/自由交谈仍可能legacy | [lcq.stage_02.json:3427](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_02.json:3427) |
| `lcq.event.iron_bridge_ambush` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_02.json:3519](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_02.json:3519) |
| `lcq.event.rainforest_black_shoal` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_02.json:3580](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_02.json:3580) |
| `lcq.event.ningyu_enters_gamble` | 18白名单内；失败/自由交谈仍可能legacy | [lcq.stage_02.json:3641](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_02.json:3641) |
| `lcq.event.zixi_taiyi_intercept` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_02.json:3721](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_02.json:3721) |
| `lcq.event.silent_sheyi_village` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_02.json:3783](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_02.json:3783) |

### lcq.stage_03b_snake_flower_bridge（8个声明事件）

| 事件 | 当前结构化模块覆盖 | 数据出处 |
|---|---|---|
| `lcq.event.s03b_snake_flower_bridge_01` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_03b_snake_flower_bridge.json:4096](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_03b_snake_flower_bridge.json:4096) |
| `lcq.event.s03b_snake_flower_bridge_02` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_03b_snake_flower_bridge.json:4136](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_03b_snake_flower_bridge.json:4136) |
| `lcq.event.s03b_snake_flower_bridge_03` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_03b_snake_flower_bridge.json:4521](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_03b_snake_flower_bridge.json:4521) |
| `lcq.event.s03b_snake_flower_bridge_04` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_03b_snake_flower_bridge.json:4561](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_03b_snake_flower_bridge.json:4561) |
| `lcq.event.s03b_snake_flower_bridge_05` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_03b_snake_flower_bridge.json:4942](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_03b_snake_flower_bridge.json:4942) |
| `lcq.event.s03b_snake_flower_bridge_06` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_03b_snake_flower_bridge.json:4982](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_03b_snake_flower_bridge.json:4982) |
| `lcq.event.s03b_snake_flower_bridge_07` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_03b_snake_flower_bridge.json:5022](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_03b_snake_flower_bridge.json:5022) |
| `lcq.event.zixi_intercept` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_03b_snake_flower_bridge.json:5062](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_03b_snake_flower_bridge.json:5062) |

### lcq.stage_04（7个声明事件）

| 事件 | 当前结构化模块覆盖 | 数据出处 |
|---|---|---|
| `lcq.event.s04_01` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04.json:2388](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04.json:2388) |
| `lcq.event.s04_02` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04.json:2441](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04.json:2441) |
| `lcq.event.s04_03` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04.json:2919](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04.json:2919) |
| `lcq.event.s04_04` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04.json:2970](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04.json:2970) |
| `lcq.event.s04_05` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04.json:3030](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04.json:3030) |
| `lcq.event.s04_06` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04.json:3147](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04.json:3147) |
| `lcq.event.s04_07` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04.json:3201](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04.json:3201) |

### lcq.stage_04b_lingfei_baiyi_crisis（37个声明事件）

| 事件 | 当前结构化模块覆盖 | 数据出处 |
|---|---|---|
| `lcq.event.s04b_lingfei_baiyi_crisis_01` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:4161](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:4161) |
| `lcq.event.s04b_lingfei_baiyi_crisis_02` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:4201](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:4201) |
| `lcq.event.s04b_lingfei_baiyi_crisis_03` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:4241](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:4241) |
| `lcq.event.s04b_lingfei_baiyi_crisis_04` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:4281](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:4281) |
| `lcq.event.s04b_lingfei_baiyi_crisis_05` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:4758](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:4758) |
| `lcq.event.s04b_lingfei_baiyi_crisis_06` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:4798](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:4798) |
| `lcq.event.s04b_lingfei_baiyi_crisis_07` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:4838](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:4838) |
| `lcq.event.s04b_lingfei_baiyi_crisis_08` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:4878](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:4878) |
| `lcq.event.s04b_lingfei_baiyi_crisis_09` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:4918](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:4918) |
| `lcq.event.s04b_lingfei_baiyi_crisis_10` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:4958](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:4958) |
| `lcq.event.s04b_lingfei_baiyi_crisis_11` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:4998](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:4998) |
| `lcq.event.s04b_lingfei_baiyi_crisis_12` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:5038](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:5038) |
| `lcq.event.s04b_lingfei_baiyi_crisis_13` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:5078](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:5078) |
| `lcq.event.s04b_lingfei_baiyi_crisis_14` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:5118](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:5118) |
| `lcq.event.s04b_lingfei_baiyi_crisis_15` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:5158](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:5158) |
| `lcq.event.s04b_lingfei_baiyi_crisis_16` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:5198](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:5198) |
| `lcq.event.s04b_lingfei_baiyi_crisis_17` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:5238](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:5238) |
| `lcq.event.s04b_lingfei_baiyi_crisis_18` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:5278](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:5278) |
| `lcq.event.s04b_lingfei_baiyi_crisis_19` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:5318](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:5318) |
| `lcq.event.haishen_hall_merfolk` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:5358](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:5358) |
| `lcq.event.xieyi_biling_war` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:5419](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:5419) |
| `lcq.event.weapon_deal_with_geluo` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:5483](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:5483) |
| `lcq.event.guiwangdong_coop_pact` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:5546](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:5546) |
| `lcq.event.blank_letter_and_dagu` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:5612](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:5612) |
| `lcq.event.geluo_summons_biji` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:5675](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:5675) |
| `lcq.event.ice_gu_coercion` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:5739](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:5739) |
| `lcq.event.persuade_wuerlang` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:5801](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:5801) |
| `lcq.event.spot_dong_informant` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:5863](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:5863) |
| `lcq.event.ruins_ghost_warriors` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:5926](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:5926) |
| `lcq.event.enter_dong_with_migu` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:5989](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:5989) |
| `lcq.event.hongmiao_controlled` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:6055](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:6055) |
| `lcq.event.xiaozi_first_appears` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:6120](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:6120) |
| `lcq.event.pull_harpoon_lemingzhu` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:6181](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:6181) |
| `lcq.event.regroup_caravan_envoy` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:6242](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:6242) |
| `lcq.event.wuerlang_slays_dagu` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:6306](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:6306) |
| `lcq.event.yiyang_repels_yinsha` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:6369](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:6369) |
| `lcq.event.escape_cave_mechanism` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_04b_lingfei_baiyi_crisis.json:6430](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:6430) |

### lcq.stage_05b（20个声明事件）

| 事件 | 当前结构化模块覆盖 | 数据出处 |
|---|---|---|
| `lcq.event.s05b_01_binu_reveals_xiaozi` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_05b.json:4194](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_05b.json:4194) |
| `lcq.event.s05b_02_xiaozi_exposed` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_05b.json:4241](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_05b.json:4241) |
| `lcq.event.s05b_03_saan_secret_path` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_05b.json:4296](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_05b.json:4296) |
| `lcq.event.s05b_04_enter_ghost_palace` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_05b.json:4352](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_05b.json:4352) |
| `lcq.event.s05b_05a_meet_ghost_king` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_05b.json:4408](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_05b.json:4408) |
| `lcq.event.s05b_05b_ideology_duel_and_defeat` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_05b.json:4461](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_05b.json:4461) |
| `lcq.event.s05b_06_breakout_and_reunion` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_05b.json:4514](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_05b.json:4514) |
| `lcq.event.s05b_07_xiaozi_trap` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_05b.json:4570](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_05b.json:4570) |
| `lcq.event.s05b_08a_rescue_suli` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_05b.json:4624](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_05b.json:4624) |
| `lcq.event.s05b_08b_altar_corpse_fight_and_danchen` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_05b.json:4678](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_05b.json:4678) |
| `lcq.event.s05b_09_temporary_pact_with_xiaozi` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_05b.json:4734](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_05b.json:4734) |
| `lcq.event.s05b_10_slave_revolt_and_phoenix_change` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_05b.json:4820](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_05b.json:4820) |
| `lcq.event.debut_lemingzhu` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_05b.json:4879](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_05b.json:4879) |
| `lcq.event.biling_bay_stance` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_05b.json:4916](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_05b.json:4916) |
| `lcq.event.huamiao_coop_boundary` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_05b.json:4964](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_05b.json:4964) |
| `lcq.event.ghost_king_swallowed` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_05b.json:5018](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_05b.json:5018) |
| `lcq.event.slay_dragon` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_05b.json:5074](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_05b.json:5074) |
| `lcq.event.xieyi_entrustment` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_05b.json:5132](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_05b.json:5132) |
| `lcq.event.tribes_pledge` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_05b.json:5286](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_05b.json:5286) |
| `lcq.event.xiaozi_kills_mother` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_05b.json:5342](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_05b.json:5342) |

### lcq.stage_07_qingyuan_jiankang（18个声明事件）

| 事件 | 当前结构化模块覆盖 | 数据出处 |
|---|---|---|
| `lcq.event.xiaoyaoyi_arrives` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_07_qingyuan_jiankang.json:4152](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json:4152) |
| `lcq.event.s07_01_old_case` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_07_qingyuan_jiankang.json:4289](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json:4289) |
| `lcq.event.s07_02_kill_wu` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_07_qingyuan_jiankang.json:4330](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json:4330) |
| `lcq.event.s07_03_xiaozi_appears` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_07_qingyuan_jiankang.json:4713](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json:4713) |
| `lcq.event.s07_04_zhuo_subdued` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_07_qingyuan_jiankang.json:5112](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json:5112) |
| `lcq.event.s07_05_eight_steeds_informed` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_07_qingyuan_jiankang.json:5153](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json:5153) |
| `lcq.event.s07_06_water_assassins` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_07_qingyuan_jiankang.json:5421](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json:5421) |
| `lcq.event.s07_07_dragon_hall` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_07_qingyuan_jiankang.json:5461](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json:5461) |
| `lcq.event.s07_08_palace_escape` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_07_qingyuan_jiankang.json:5501](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json:5501) |
| `lcq.event.s07_09_hengtang_ambush` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_07_qingyuan_jiankang.json:5541](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json:5541) |
| `lcq.event.s07_10_dragon_fang` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_07_qingyuan_jiankang.json:5581](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json:5581) |
| `lcq.event.s07_debut_qinhui` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_07_qingyuan_jiankang.json:5621](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json:5621) |
| `lcq.event.s07_qinhui_join` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_07_qingyuan_jiankang.json:5660](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json:5660) |
| `lcq.event.wangzhe_letter` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_07_qingyuan_jiankang.json:5700](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json:5700) |
| `lcq.event.xiao_opens_resources` | 不在模块白名单；离馆后亦被适用域挡住 | [lcq.stage_07_qingyuan_jiankang.json:5744](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json:5744) |
| `lcq.event.shanghou_revealed` | 不在模块白名单；离馆后亦被适用域挡住；同关终点后/旁支须按触发条件证明不入demo | [lcq.stage_07_qingyuan_jiankang.json:5884](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json:5884) |
| `lcq.event.palace_haunting_rumor` | 不在模块白名单；离馆后亦被适用域挡住；同关终点后/旁支须按触发条件证明不入demo | [lcq.stage_07_qingyuan_jiankang.json:5944](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json:5944) |
| `lcq.event.shanghou_cures_ice_gu` | 不在模块白名单；离馆后亦被适用域挡住；同关终点后/旁支须按触发条件证明不入demo | [lcq.stage_07_qingyuan_jiankang.json:5988](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json:5988) |

总计115个声明事件，18个已有受限模块白名单，其余97个需补覆盖或给出终点前不可达证据；三条隔离关stage_03、stage_05、stage_06按当前落地试玩路线跳过，不擅自加回。
