# 主策划 bugfix5 交付报告（2026-10-02）

本轮按任务顺序先修 1–6，再查 7、标注 8、提交 9 的方案。用户授权直接实施，保留此前所有未提交改动；未 reset/checkout/stash/commit、未删文件、未重启 8091、未使用用户浏览器/GUI/launchd。smoke 使用独立 headless 临时上下文与 18337 端口，模型响应为 fixture，存档接口被阻断，后台代理指向不可达本地端口；不算真机/真实 LLM 验收。

备份：`/Users/clawbot/Desktop/pre_bugfix5_20261002_123303/`，按仓库相对路径保存，另存原 git status/diff。第 8 项对已有备份文件另存 `.before_item8`，不覆盖原始备份。

## 一、五原落奴整页崩溃（P0-1）

根因：open_world_engine 选项没有 actionId，原表达式在锁表和 actionId 同为 undefined 时错误命中。`src/modules/scenarioMods/branchDecision.ts` 的 detectBranchDecision 先确认锁表条目存在再比较动作 ID。不改变三把锁和结算。

新增 `tests/baihuGambleRefusal.test.mjs`：从落地原生合同推进到 s02_04，取真实五原选项（确有无 actionId 项）调用锁检测，断言不锁、不崩溃。smoke 注入该生产动作推进出的快照，验证输入框和行动按钮正常渲染、无 pageerror。

## 二、死亡结局事实展示

选择方案 (b) 直接展示 gameOver.facts：`src/components/dashboard/MainGamePanel.vue` 的 game-over-card 按条渲染已有结局事实，提示改为「这条路走到了尽头。本局结局如下。」不增加写手调用，不移动结算、不改变生死事实；现有禁止死亡色情化的规则不变。固定事实不依赖此前正文是否写到执行与死亡。

smoke 覆盖拒赌炮烙、拒约炮烙、冰蛊三个数据结局的全部事实及新提示。展示 smoke 用 gameOver 快照；各致命/延迟触发语义仍由 fatalOutcomes 与分支测试覆盖，不冒充真实模型新结局演出。

## 三、结局残留入口与斩线回轨

根因：旧拒赌入口来自独立选择器；AI 选项和侧栏回轨按钮未以 gameOver/锁定状态过滤。MainGamePanel 的 scenarioEngineActionOptions 结束时返回空数组，AI 选项区与分组标题加 gameOver 条件，启程 offer 同样停止显示。RightSidebar 的回轨按钮在 gameOver 或当前事件动作构成分支锁时隐藏。改动只收显示入口，现有输入禁用、回滚和合同不变。

smoke：三类结束快照均无 engine/AI 选项、无回轨入口；赌局锁定快照无回轨入口，固定决定区正常出现。

## 四、普通动作与致命选项重名

`src/modules/scenarioMods/runtime.ts` 的 getCurrentStoryEventActions 原来只对普通 steps 做碰撞检查。现把普通和 fatalChoices 合并后统一计数，只有碰撞才追加各自作者 label，保留其他按钮既有文案。回归同时检查谈期限第 1 步和订约步各自与致命选择不重名。

## 五、订约成功正文和记忆缺失条款

根因：卡片撤销后固定结果句随空卡表失效，合同本地完成并不保证模型正文/记忆含有条款。`src/utils/AIBidirectionalSystem.ts` 的 processGmResponse 在谈期限 seal_three_month_south_pact 成功结算时，用固定结果覆盖本轮正文与 mid_term_memory，包含三个月、南荒霓龙丝、逾期受炮烙和南下由头；清空本轮 AI 选项。没有恢复卡片，也不再把模型保护承诺追加到记忆里。

回归故意给出「三个月没人找你麻烦」的原稿与记忆：断言实际正文、历史、短期及隐式中期记忆均含逾期受炮烙且不含虚构承诺。模块回执后续取已经检查的 response.text，记忆模块据此摘录。

## 六、删句破坏对白；只读问题登记与验证

`characterResolver.ts` 的 stripNarrativeEntityTypeConflicts / stripNarrativeUnintroducedCharacters 原来按句号切割且不携带引号：删掉含开引号或发言者的句子后，闭引号和同段声线描写会残留。带引号的文本改按段删除命中的段，其他段完整保留；无对白文本保留原句级行为。不补造发言、不重试模型。代价是违规人物所在对白段整体不展示。

新增 `tests/scenarioModRuntime.test.mjs`：含违规姓名的多句对白及「声音清泠」整体移除，下一段武二郎对白引号完整保留；实体类型误写亦覆盖。复测日志没有保留逐守卫的原稿/删句轨迹，无法认定两次残句各由哪个守卫单独造成；已确认上述两处切句方式可稳定复现同类残留。固定道具获得删句器与已经空表的卡片边界删句器本轮未扩改。

### P1-3 字数核查（只查，未改提示词或超时）

原报告「凌晨02:49同一句67.9k→86.9k增长19k」混用了回合。原始 `mfx/logs/ctx.log` / `net.log` 记录：

- 02:49:25（SGT，req3），「你这商馆开了多久？」：87,750；对应13.6s成功。
- 02:49:53（req5），「要是三个月回不来怎么办？」：89,347。
- 02:56:02（req14），stage_01 s01_02「我先保住自己和身边的人。」：67,877；是另一场景。
- 11:35:36（lrt req3），「要是三个月回不来怎么办？」：86,912。比凌晨同问句少2,435，不能据此认定新增19k引发超时。

口径：driverlrt.mjs 第21行的 total 是 JSON.stringify(messages).length，content 段长度较小，差额含嵌套 JSON 引号/换行转义和 messages 包装。单位是 JS 字符数，不是 token 或字节。

若仅比较报告引用的两个数字，跨场景 67,877→86,912 的19,035可严格对账如下（不代表同回合版本增量）：

| 来源 | 差额 |
|---|---:|
| 游戏状态段：31,823→39,781 | +7,958 |
| 主 system 中其他段合计 | +8,674 |
| 实时关注 NPC 独立 system：178→179 | +1 |
| 最近事件/短期历史：542→1,707 | +1,165 |
| user：450→421 | -29 |
| JSON 转义与包装差额：7,200→8,466 | +1,266 |
| 合计 | +19,035 |

主 system 其他段的 +8,674 中：新增/变化人物关系合同（苏妲己1825、王哲1575、韩庚1330、月霜1279，减stage01段强528）净 +5,481；stage正典1869→2166 +297；相关人物约束1001→1089 +88；其余段聚合 +2,808。日志只存top15，无法把这2808再逐段精确拆分，也无法从状态段摘要证明其内部哪些 JSON 字段增量最多，故不推测。

86,912 请求：主system76,139（游戏状态39,781；其他36,358）、NPC179、历史1707、user421、序列化差额8466。武二郎85,128：主system73,829（游戏状态40,854；其他32,975）、NPC179、历史2088、user578、序列化差额8454。主要负担是完整投影状态、全局规则、人物关系/知识/正典以及记忆，非仅当前行动。60s主请求与10s分类超时保持不动；该原因分析不作真实性能PASS。

P0-2：旧存档的 events 是旧数据快照，缺新拒赌/不撕/支援动作及延迟合同，本轮只登记、不迁移。复测须用新开档。

### 第1–6项验证

- 全量 node --test tests/*.test.mjs：1147 项，1142通过、5跳过、0失败。初次新增测试对无碰撞的第2步错误要求补名，已校正为仅碰撞追加作者名，再跑全量通过；不是忽略失败。
- tsc --noEmit：通过；git diff --check：通过。
- 临时18337 smoke：通过；含自由交谈无卡、五原页面、赌局锁、三结局事实与残留选项检查。完整证据保存备份目录 `full-item1-6-final.log`、`tsc-item1-6.log`、`diff-item1-6.log`、`smoke-bugfix5-final.log`。
- 尚未进行新一轮真实 LLM/真机演出与30秒SLA验收；超时未修。


### 实际改动/回归行号（仓库根目录为 /Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu）

- 一：src/modules/scenarioMods/branchDecision.ts:41；tests/baihuGambleRefusal.test.mjs:1284。
- 二：src/components/dashboard/MainGamePanel.vue:344–345；scripts/smoke-key-beat-card.mjs（三结局展示断言）。
- 三：MainGamePanel.vue:164、169、890、933；src/components/dashboard/RightSidebar.vue:212（及440/456导入）。
- 四：src/modules/scenarioMods/runtime.ts:1396；tests/baihuGambleRefusal.test.mjs:1294。
- 五：src/utils/AIBidirectionalSystem.ts:2721；tests/baihuGambleRefusal.test.mjs:1294。
- 六：src/modules/scenarioMods/characterResolver.ts:420、463；tests/scenarioModRuntime.test.mjs:593。

## 七、card / fast 实际可达性与删除范围（本轮未删）

card：keyBeatCards.ts:27 是空表，getActiveKeyBeatCard/keyBeatStep/isKeyBeatCardAction 都不能返回有效卡片。调用在 MainGamePanel.vue:255/908/1934 与 AIBidirectionalSystem.ts:1073/1080，路径回执只有 keyBeatLocalText 成立才会标 card。当前无这个可能；生产推进快照测试与18337 smoke亦无卡。旧回执数据仍可能显示历史card，不能据此认定新回合触发。

fast：fastNarrativeDemo.ts:341 缺省/false关闭，storage key=xiantu.fastNarrativeDemo.v1；AIBidirectionalSystem.ts:741 的 tryFastNarrativeDemo 被1024调用，1034写fast回执。独立探针（备份目录route-proof.log）同一demo快照/闲聊输入：未设→legacy，false→legacy，true→fast。故正常默认demo不走fast，但残存显式true开关能走到；不能宣称彻底不可达。未读取/修改用户浏览器localStorage，也不推测用户当前旧开关值。fast输入识别之外的 naturalIntentRouter 的“FastPath”是本地自然行动解析，不能按同名字误删。

### 待批准的最小删除范围

| 范围 | 位置 | 测试影响 |
|---|---|---|
| card唯一数据/工具 | src/modules/scenarioMods/keyBeatCards.ts:1–文件末 | baihuGambleRefusal.test.mjs:1263后无卡断言改为UI/回执断言，不能删整个分支/五原测试文件 |
| card UI | MainGamePanel.vue:255–268、491、908–910、1749–1751、1774–1775、1934–1940、2556及card专属CSS；普通选项条件/过滤器去card引用 | smoke-key-beat-card.mjs保留并改名为普通交谈与死亡展示smoke；本轮不改名/删除 |
| card运行分支 | AIBidirectionalSystem.ts:3、700结果提示、684/766/855卡排除、1073–1080卡本地正文、2706–2719卡后处理与2740卡选项过滤；local分支保留 | 当前普通交谈、结局、记忆测试保持 |
| card回执枚举/HUD | modularTurn.ts:9–10；XingyuehuQuestPlaytestHud.vue:82 | 删新回合path成员时仍可容忍旧存档字符串；不要清旧历史 |
| fast待决定，不能按不可达删除 | AIBidirectionalSystem.ts:741–832/1024/1034，MainGamePanel.vue:574–577/2181–2190/2466；fastNarrativeDemo.ts与fastNarrativeDemoAdjudication.ts | tests/fastNarrativeDemo.test.mjs、fastNarrativeDemoRoutes.test.mjs、fastNarrativeDemoAdjudication.test.mjs；相关smoke先查全部import再清。骰子引擎、自然识别、共享地方合同保留 |

### legacy 当前回合清单及武二郎解释

1. 白湖离馆之前：自由闲聊/提问，没有selected或resolved_text事件动作的输入（如商馆年限、三个月回不来）；模块只接收选定/识别到的白名单事件动作。
2. 白名单外事件：stage_01的debut_yueshuang；stage_02的wuerlang_joins、ningyu_regicide_offer、iron_bridge_ambush、rainforest_black_shoal、zixi_taiyi_intercept、silent_sheyi_village；长demo后续全部关卡（逐事件清单见迁移方案附录）。实际触发前提仍以事件条件为准。
3. 白湖离馆之后：modularTurn.ts:44 仍绑定 isScopedNaturalIntentSave，后者在baihu_shangguan_escape完成后返回false（playtestNarrativeScope.ts:76），所以不仅武二郎不在18事件白名单，整段南荒/谢艺/星月湖都尚未启用模块演出。
4. opportunityAction/judgementResolution/纯openWorldAction/gambleRefusalAction 被tryModularTurn排除；其中已有本地预览句的回合走local，不请求legacy模型；没有本地正文的回合仍进legacy。不要把所有未模块回合统称为legacy。
5. 模块预结算失败、场景材料不接受、system>10000、两稿拒收等回落；模块关/非localOnly回合也走原链路。legacy pilot开关默认关，打开后其渲染/本地句库回执也未另设pilot类型。
6. generateInitialMessage是独立旧初始化入口；当前试玩落地/切关使用固定开场，不表示试玩每次开场真的调用它。

武二郎第1步：不在legacyPilotScenes.ts:4的18事件名单，且白湖离馆已完成导致自然输入窗关闭，因此按钮选中也不能进入tryModularTurn；没有机会/五原本地预览句，进入完整legacy请求。85,128的各来源长度见第六节，并非卡片造成。

## 八、legacy退役标记（仅注释）

全部标记使用用户指定原句：
`// @deprecated LEGACY：模块化稳定后删除（2026-10-02 用户决定）`

位置：
- src/utils/AIBidirectionalSystem.ts:834：tryLegacyNarrativePilot。
- 同文件:1041：未命中模块/fast后的legacy入口。
- 同文件:1089：没有本地正文时的完整legacy分支。
- 同文件:1299：buildSplitSystemPrompt。
- 同文件:1378：buildSplitInjects。
- 同文件:1870：generateInitialMessage旧初始化入口。
- src/utils/legacyForegroundRecall.ts:62：resolveLegacyForegroundRecall。
- src/modules/scenarioMods/legacyNarrativePilot.ts:37：旧pilot开关入口。
- src/modules/scenarioMods/legacyNarrativePilotGenerate.ts:93：generateLegacyPilotNarrative。

未标注共享processGmResponse、buildLegacyNarratorPrompt、planLegacyNarrativePilot、validateLegacyVisibleNarrative为整体删除：当前模块仍直接调用这些共享编译/预结算/验证工具。未来只清旧链路调用与旧生成器，先解开模块依赖。

记录放PROJECT-STATUS.md新增bugfix5节：这是共享进度与技术退役权威；该决定不是原著事实/人工正典解锁，故不写CANON裁定簿。按AGENTS要求同一批次补记PLANNING-ROUNDS.md。本轮代码删除9行标记后与.before_item8副本逐字一致，证明只加注释、不改路由行为。

标注后全量串行 node --test --test-concurrency=1 tests/*.test.mjs：1147项，1142通过/5跳过/0失败；tsc --noEmit、git diff --check通过。并发原命令两次出现Node v25.8.1子测试消息“Unable to deserialize cloned data due to invalid or unsupported version”，失败文件不同，已保存full-item8.log与full-item8-final.log；未改测试来规避，串行跑同一完整集合复核。最后再次执行用户指定并发原命令，结果另记后文。smoke-module-framework.mjs在18337通过，包含两稿拒收后当前仍回落legacy的验证；这属于现状证明，不是未来迁移验收。服务已SIGINT关闭并验证端口不能连接。

## 九、迁移方案交付与需用户拍板

方案：`/Users/clawbot/Desktop/lead_designer_demo_no_legacy_plan.md`。只有方案，无迁移代码。推荐先补长demo结构化事件、再迁交谈/机会/判定、最后统一关闭demo旧路由和回落。需拍板：demo无legacy是否覆盖清羽短版和落地到星月湖长版（推荐两者）；模块失败两次后是否保持零结算/原输入让玩家手动重试（推荐）；fast旧开关是否一并停用（推荐）；本地固定结算是否允许不调模型但统一记模块来源（推荐）；旧存档是否只支持新开复测，另轮再做迁移（推荐）。


### 最终验证补记

最后指定并发原命令仍有1个测试文件进程消息反序列化异常（scenarioModStoryContext.test.mjs），汇总1136/1130pass/5skip/1 runner fail，未出现该文件业务断言的具体失败。已安装Node22.22.1交叉运行也同样出现此运行器异常（1132/1126pass/5skip/1 runner fail），因此不能归因于Node25版本本身。完整串行集合1147/1142pass/5skip/0fail；第1–6项并发完整集合此前已1147/1142pass/5skip/0fail。并发异常未彻底定位，属于验证限制，不能把最终并发运行报告为全绿。

标记后tsc日志为空且进程exit0；diff check日志为空且exit0。smoke最终两项均pass：smoke-bugfix5-final.log与smoke-module.log。临时18337关闭后connect_ex失败，无残留监听。新增/修改文件逐个有备份；9条legacy注释移除后能逐字还原第8项前的代码（对新涉及文件取原始备份），没有行为变更。项目状态与策划轮次同步了本轮交付与退役方向；未改canon数据/合同/生产API配置。

后续需另处理并发测试运行器异常；本轮不扩大到测试工具链修复。卡/fast删除、demo强制模块化和旧档迁移均未执行，等待上述决策。真实模型性能/超时也保持待复测。
