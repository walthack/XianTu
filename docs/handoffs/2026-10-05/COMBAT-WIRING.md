> **当前交付：第1阶段收口＋主模型配置路由＋W-48补挂。** F03/F10/F13已接；F13输→E07，F14草稿输→E08、正式入口未接。N1–N4已落，W49/50按裁定入材料。旧“17:00续做”、rout分档和待W48 id均为历史。当前8097 MD5 `f5e92d4eeb2a2418778fb3127d3ec8fc`，最新静态门禁1511过／0败／5skip、tsc0、canon绿；最新包真模型未测。见[日终汇总](DAY-END.md)、[W48收口](W48-STAGE1-CLOSE.md)。本轮只更新文档，没有重建8097、提交或推送。

# COMBAT-WIRING · 2026-10-05

用户13:35/13:50授权，在0cfd3cd3之上接入；没有commit/push。受保护的8091/8095/8096/8099/8100和PID79521未动。8097原静态服务PID65144继续服务，仅重建它自己的dist。

## 实现与真实触发

- MainGamePanel.vue:328、644、1810：正式场面卡、统一输入入口和isAIProcessing互斥。识别只提议；预览不掷骰，确认一次才结算；先持久化骰种、游标、场面与代码回执，再描写。普通选项/关键拍按钮在场面期间隐藏，启程与处理中回退被拦。
- AIBidirectionalSystem.ts:1170：普通AI入口在可用性检查/模型请求前拦住必经交锋，不允许用普通叙事或自由输入绕过。
- runtime.ts:1800、1869、1900、2738、3727：只接受同事件/动作/合同版本的closed场面完成回执；场内暂停剧情自动推进，必经战斗不再被offscreen自动完成。收束完成不等于玩家取胜，真实win/lose/timeout独立记录。不再追加旧合同固定成功事实和旧场景伤亡账，避免超时撤退却发放“九人全灭”回执。
- host/controller.ts：识别→预览→确认→结算→简报→描写→closeScene→状态与剧情同事务收束。玩家简报不含模型指令或内部id；模型仍用完整合同简报。模型不可用时退回规则识别/按代码结果描写，不另掷；decided检查点可点“继续收束（不再掷骰）”。确认终局选择也单独二次确认。
- host/ext.ts：系统.扩展.场面模块（version=1），含active、已收束history、inputLog、骰种/游标/审计、预览与选择。沿用现有toSaveData/loadFromSaveData和saveCurrentGame，JSON读档可恢复。收束history保留最终state与输入日志。
- host/writeback.ts：statusAdapters把主角持久状态写角色.效果；NPC伤病按角色id写sceneLedger.injuries，既有伤病不被重复状态覆盖；固定代价/收束事实写worldFacts，合同flags独立写回。

### F03

正常到达04关s04_02现场后，点击其主线动作或自由输入打法，进入combat.f03.mountain_stream_fog。最多四拍按合同钟执行，收束完成s04_02并回接后续主线。预览、失败、撤回均不能直接把事件标完成。

### F10

正常到达05b的s05b_05b_ideology_duel_and_defeat现场后，主线动作/自由打法进入combat.f10.ghost_king_clash。三拍后合同让鬼巫王离场，继续骨虎/丹宸阶段，收束回接s05b_06。输入合同所列“加入/投降”意图会先显示终局确认，确认后E06。本轮没有擅改模块策划给出的defeat.outcome=continue；它不是“任何一次大失败立即E06”。

### F13 → E07

在05b包含ghost_king_swallowed的运行时，代码结算写flags['lcq.encounter.f13.tier']='rout'后，下一次advanceScenarioRuntime消费为E07：新版正文/固定承接/配图一起落历史，gameOver阻止续玩，重复推进不重复追加。无跳井前置。

**尚未接入：F13本身的新场面合同及自然战斗输入→tier生产端。本轮接的是触发消费，不应将注入rout的夹具说成已经真实玩过F13。** F03/F10之外的战斗仍用原链路。

## 旧路径开关

浏览器默认开启新模块。URL ?sceneModule=off退回旧路径，?sceneModule=on恢复；也可localStorage键xiantu.sceneModule.v1写off/on，刷新。无浏览器环境默认保留旧引擎，接入测试显式开启。已经开战的active场面不受off绕过，须先收束或读开战前档；不能通过开关丢弃已掷骰状态。

8097默认也开启新模块，F03用真实合同与同一正式卡片，不再安装旧portal；?sceneModule=off保留旧A/B试玩。试玩采用interceptAll，产品采用合同/默认passThroughChat（闲聊需规则和模型均有正面证据）。旧关系垫片已移除，直接使用已修好的正式关系id与存档逻辑。

## 验收证据

最终门禁结果见本节末尾追加。初轮旧演出夹具直接调用F03被新入口阻止；仅在该测试显式off来验证保留旧路径，calls等原断言未改。新场面由独立测试覆盖。

- 定向：sceneModule、sceneHostWiring、combatTrialIsolation；覆盖合同严格lint、F03/F10收束、显式终局确认、持久状态、一次确认、JSON检查点、模型中断恢复、闲聊冻结、旧开关、普通AI入口拦截、F13结局消费。
- 实际隔离Chrome浏览器8097：F03四拍、确认、刷新继续上次、收束；预览游标0，掷后1，刷新仍1，种子不变；结束active=null/history=1，无pageerror。日志/tmp/combat-wiring-browser.json。
- 8097 webpack实际打包通过；仅规则/模型不可用兜底验证，未进行真实MiniMax战斗验收。New Bot应再用正式API复测F03/F10。
- 曾遇Node测试IPC deserialize（scenarioModStoryContext），单独31/31通过；保留失败日志/tmp/combat-wiring-canon-ipc-failure.log，完整重跑，未改期望或放宽基线。

## 文件清单

宿主：MainGamePanel.vue、SceneEncounterCard.vue、AIBidirectionalSystem.ts、scenarioMods/runtime.ts。

sceneModule：brief.ts、lint.ts、types.ts；contracts/f03.json、f10.json、registry.ts、statuses.json；host/controller.ts、ext.ts、factors.ts、narrate.ts、recognize.ts、refs.ts、writeback.ts。其中合同与部分辅助文件是combatwire留下的未提交成果，原交接文件只有额度用尽信息，本轮保留并通过lint/实际宿主测试，不冒充模块策划已经交付完整报告。

试玩：src/dev/combatTrial/main.ts、CombatTrialStartView.vue、overlay.ts；webpack.combat-trial.config.js。

测试：sceneHostWiring.test.mjs（新增）、sceneModuleBrief.test.mjs（模块策划改动保留）、run4FollowupRepairs.test.mjs（仅旧路径夹具加off）。

文档：PROJECT-STATUS.md、docs/PLANNING-ROUNDS.md、本交接。canon:build刷新registry generatedAt，保留其产物；没有主动编辑registry。

## 复测/待核项

1. 使用真MiniMax验证多拍自由打法、闲聊、意图澄清、预览撤回、读档以及收束正文。
2. 新F03合同的固定内伤与旧s04_02中“凝羽身上是别人的血/未伤”口径不同：本轮以新合同执行结果写账，没有擅改旧canon正文。剧情/模块策划需核对这个迁移冲突。
3. F10 continue败局和主动加入E06的口径见上；若要改变正式合同，另行裁定，宿主不重判。
4. 当前没有新增T4动态物件登记器，未扩战斗设计，也未改合规内容。
5. 执行期间外部新增docs/COMPLIANCE-REQUIREMENTS.md改动及.bak-20261005-1411；本轮未编辑、未删除、未回滚这些文件，也不将其列为本轮战斗实现。

## 最终门禁（全部通过）

- 定向80/80，通过；/tmp/combat-wiring-focused.log。
- npx tsc --noEmit：exit 0、0错误；/tmp/combat-wiring-final-tsc.log。
- npm test：1466项，1461通过、0失败、5既有跳过；/tmp/combat-wiring-full-tests.log。
- npm run canon:build：完整通过，54.3秒，内含1466项单测及37关/schema/地点/存档/棘轮检查；/tmp/combat-wiring-canon.log。
- git diff --check：通过。

门禁后没有再改实现代码；仅补交接/进度文档及重建8097当前源码产物。没有push/commit，工作区保留本轮改动与外部改动。

## 14:16 追加合同任务 · 第一阶段（F03/F10 补完）

完整读取29号（706行）和31号（586行）；后置用户裁定优先于29号旧JSON样例。保留上轮全部宿主/UI/8097及外部改动，不提交、不推送，不操作8100。以下是追加任务的阶段交付，不冒充14场全部接入。

### 已落实

| 项 | 文件/位置 | 最终行为 |
|---|---|---|
| F03/活口 | contracts/f03.json:738；types.ts:96/183；scene.ts:301/569 | 捕获为独立合法终态，收束不把俘虏改成尸体；胜利仍要求无武士逃走。代码结算，模型不能改终态。 |
| W-07/逃走 | f03.json:13/1079；host/writeback.ts:55 | 记录 scene.f03.escaped；根据实际收束终态判断，不能直接把“玩家败”当成“必有逃兵”。无好感-10或其他附加处罚。 |
| W-07/跨关与入峒 | strictInitializer.ts:373；contracts/f03-entry.json:12；registry.ts:22；runtime.ts:1802/2741 | scene.*跨关保留。只有escaped=true且entry_battle.done不为true，才在enter_dong_with_migu第一步stop_migu_reception_clash挂一场必经拦截。战斗结束置done，一次性；原本第二步记路线仍要玩家完成，不自动完成整个入峒事件。 |
| W-08 | f03.json:1165；host/narrate.ts:26 | 去掉花苗人固定杀“两名”的样例限制；人数由描写模型按本拍演出，不写入胜负、逃走、奖励或后续分支。requiredFacts现已实际送进叙事请求。 |
| F10/骨虎 | f10.json:166/666；plan.ts:237；scene.ts:301 | 骨虎轨道必须有经原话证据/可用性/状态检查通过的true_yang_blood杠杆；空泛攻击或模型杜撰“用血”不能推进。有效沾血动作成功即完全解体，具体沾法不写死，不自动在第5拍解体。 |
| F10/丹宸 | f10.json的drive_away/备选终态；scene.ts:569 | 可以制服/打败或赶走，不杀；收束不把“赶走”改成强行留在大厅。前段3拍、第4拍离开，后段无限拍保留；普通败局不进E06。 |
| 旧检查点 | host/controller.ts:21 | F03/F10 version2→3显式兼容：骰流、已掷结果与状态不变，旧预览清掉，需重新输入确认；未知版本不静默迁移。 |
| 纯数据合同 | scene.ts:629；tests/sceneHostWiring.test.mjs最后一项 | 回写旗标用独立副本，不污染下一局合同；追加同时败局/敌方已制住的夹具，确认无逃兵不能误发追加战斗。 |
| W-52 | contracts/f14.draft.json:15/24/26 | 草稿写明114·16用背硬接龙爪，废功到118·134才公开；不是阴煞噬臂造成的废功。本场不限拍。草稿未注册，不进入游戏和模型材料。 |

### 本阶段新增/修改文件

- 新增 contracts/f03-entry.json、contracts/f14.draft.json。
- 修改 contracts/f03.json、f10.json、registry.ts（这些文件本来就是上一阶段未提交的新文件）。
- 修改 sceneModule/types.ts、plan.ts、scene.ts、lint.ts；host/controller.ts、writeback.ts、recognize.ts、narrate.ts。
- 修改 scenarioMods/runtime.ts、strictInitializer.ts。
- 修改 tests/sceneHostWiring.test.mjs；F10旧新增夹具改成真实用血输入，胜利断言未放宽，另补无血/模型捏造血证据不能消灭骨虎的反例。
- 更新本交接、PROJECT-STATUS.md、docs/PLANNING-ROUNDS.md。canon只刷新生成产物时间戳，不手改registry源。

以上路径以仓库根为基准，sceneModule相关文件位于src/modules/sceneModule/。

### 未完成与下一阶段

- F01/F02/F04–F09/F11–F13尚未转成正式新合同；F14只有未启用草稿。遵照“先F03/F10跑通再扩”，不能把31号仍标待定的W条目默认为采纳。F14草稿明确待W-51/W-53/W-54；其他场次待定列表仍以31号为准。
- F06/F08/F09/F11/F12合规标记沿用户14:10原著口径，未自行改写、删改或制作替代内容。本阶段未触碰这些场次的数据。
- F03活口可以在叙事中问话，但本阶段没有新建审问事件或编造可得情报；审问只能用已公开事实，额外情报上限仍待剧情侧提供（29号Q-4/31号G-4）。
- E06选择触发已接，但旧全文与“加入→地牢关押→剖颅”存在29号P-19/W-35所列差别，正文沿原样等待剧情定稿，未擅改。
- 新F03的凝羽内伤依29号47·2列固定状态；没有为此自主重写旧canon材料。
- 未跑真实MiniMax/真人战斗；本阶段证据是确定性夹具、正式宿主流程与构建门禁。入峒测试隔离了其他支线及合成rail位置投影，需New Bot用连续真档验一次F03→04b入峒。

### 本阶段验证

- 定向86/86；日志 /tmp/combat-contract-focused.log。
- tsc --noEmit exit0，0错；/tmp/combat-contract-tsc.log。
- 首轮npm test遇Node IPC deserialize（scenarioModStoryContext）；单跑31/31，未改断言；保留 /tmp/combat-contract-full-tests.log、/tmp/combat-contract-ipc-single.log。
- 最终串行全量1472项：1467过、0败、5既有skip；/tmp/combat-contract-full-serial-final.log。
- canon:build最终结果另追加，不预报成功。
- 8100监听仍是PID78852；未重启、未修改其快照。8097另行重建当前源码产物，不影响8100。

### 追加合同第一阶段 · 最终门禁

- tsc0；定向86/86；串行全量1472项＝1467过、0败、5既有skip。
- canon:build exit0，全步骤通过，54.0秒；内置单测同为1467过、0败、5skip。日志 /tmp/combat-contract-canon.log。
- git diff --check通过。最终门禁后不再改实现代码。
- 8097仅重建当前源码；真实MiniMax/真人战斗验收未做。8100仍为原监听进程与独立快照，不提交、不推送。

## 14:57追加：新档机制战斗检查点

生成入口：`node scripts/generate-scene-combat-checkpoints.mjs [输出目录]`。
默认输出（仓库根目录为 `/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu`）：

- `_newbot_tmp/combat-checkpoints/F03-before.json`：04山涧，s04_02未结算；读档时开关使用`?sceneModule=on`，第一个迎战动作走新F03宿主。
- `_newbot_tmp/combat-checkpoints/F10-before.json`：05b鬼王宫，ideology_duel_and_defeat未结算；读档后走新F10宿主。
- `_newbot_tmp/combat-checkpoints/F13-before.json`：05b深井祭台，ghost_king_swallowed未结算；**只满足决战事件前检查点，F13正式新合同尚未接入，不能宣称可直接进入新模块战斗**。该档扩展`战斗检查点来源.newSceneReady=false`明确标记。
- `_newbot_tmp/combat-checkpoints/replay.json`：生产合同动作、真实切关和已完成新模块战斗回放轨迹。

所有档从`createQingyuOpeningPlaytestSave(stage01, now, 2)`新建，使用当前builtins与账本；不读取旧档，不直接写completedEventIds/事件done标记，不替换关系称呼。本地动作经recordStoryEventStructuredAction结算，五原前置经开放世界动作结算，转关经transitionToNextScenarioStage。到目标时调用的advanceScenarioRuntime已完成当前账本和关系投影。F03前显示花苗新娘，F10/F13前显示乐明珠；朱老头沿当前显示名规则。

证据等级：新档生产合同受控回放，不是真模型通玩。历史战斗使用白名单识别夹具和成功骰点，按新宿主预览→确认→结算→写回完成；目标战斗未开始，不带目标强制骰点。普通剧情回放不请求演出模型，不能拿这些档验证历史正文连续性。输出为原始SaveData JSON，使用现有导入存档方式读入；本轮未操作8100或真实玩家浏览器，尚未做UI导入实测。

新增文件：scripts/generate-scene-combat-checkpoints.mjs、tests/sceneCombatCheckpoints.test.mjs；检查点和轨迹仅存ignored目录，不纳入提交。定向16/16、tsc0；全量/canon最终结果后续追加。

### 新档检查点追加门禁结果

- 定向16/16，tsc0，git diff --check通过。
- 首次全量仅r2_13_interaction_handoff_demo发生Node IPC deserialize；原断言不动，单跑9/9通过。
- 重跑串行全量1473项：1468过、0败、5既有skip；`/tmp/combat-checkpoints-full-final.log`。
- canon:build全绿56.2秒，内置全量同为1468过、0败、5skip；`/tmp/combat-checkpoints-canon.log`。
- 原始失败证据`/tmp/combat-checkpoints-full.log`保留；未做真实UI导入验收。F13新模块入口仍未接，不能把门禁绿当作该项完成。

## 17:00 续做收口 · F03/F10 验收修正、F13、战利品、导入检查点

### 15:08 清单 1–8 的处理（均已进入本次 8097 包）

| 条 | 落地内容 | 代码落点 |
|---|---|---|
| 1 | F03 九名武士逐人持有刻度，按首敌/七人/末敌三个战术组限制单次行动最多一组；自然20仍受限制。删掉所有「武二郎以一敌六」的强制收束。武二郎第3拍才入场。 | contracts/f03.json；types.ts:122/177；plan.ts:205 |
| 2 | 底层模块保留倒下控制状态供审计，正式游戏写回适配器在收束时改为有期限的具体伤情；主角不写99999分钟的倒下，NPC伤情文字注明时长。 | host/writeback.ts:16；statusAdapters.ts:32 |
| 3 | F10加入/投降独立选择分支，明确确认后直接E06，不走普通lose的药瓶/骨虎/离场收束。E06新正文逐字录入及新承接句。 | contracts/f10.json closing.playerChoices；scene.ts:506/555；fixedEndingNarratives.ts:14/99 |
| 4 | 排除否定、拒绝、假设和疑问的投降表达；「我绝不答应他」不弹死亡确认。 | scene.ts:506；sceneHostWiring.test.mjs |
| 5 | 9个人头全部倒下/被俘才赢；拖满4拍走失败代价，不能算胜。敌方可攻击凝羽/新娘/阿夕，倒下者有伤情；商馆护卫阵亡仅失败/拖满分支。雾、涧边、扔刀支持牵制/活捉/扭转。 | contracts/f03.json；plan.ts；host/writeback.ts |
| 6 | 凝羽固定内伤保留，s04_02禁写词改「凝羽在此战受外伤」，K6别人的血不动，builtin与overlay一致。 | builtins/data/lcq.stage_04.json:2869；overlay/lcq.stage_04.json:4366 |
| 7 | W-07是过吊桥后、接待前的外围哨位新增第0步 fight_outer_sentry_intercept。只有有逃兵才触发，且一次；胜负均接回原 stop_migu_reception_clash，再做记路线，绝不自动替代原两步。无好感−10、戒备或难度惩罚。 | contracts/f03-entry.json；runtime.ts:1410/2273；04b builtin/overlay |
| 8 | 骨虎与用血都从第4拍开放。胜利发断斧+既有碎水晶，失败挂腿/右臂/背伤及双刀卷刃。加入/投降不发奖励也不挂普通失败成本。 | contracts/f10.json；host/writeback.ts；contracts/statuses.json |

F10背伤具体扣多少气血，剧情稿没有数值：本轮复用现有伤情目录的动作/防御减益及限时伤情，不新增扣血值。该细项仍需数值合同补齐。W-07目前合同指定易彪为前锋；尚无队伍前锋槽，未做玩家在易彪/吴战威间动态选前锋。NPC仍使用既有sceneLedger.injuries文字载体，并非新增全域伤情计时系统。

### 剧情补定与 F13

- E06按 `Desktop/narrative/结局/E06-天命的指引.md` 新正文，加入/投降→生擒→地牢→亲自剖颅。16号原稿不改。
- W-07新地点 `lcq.location.guiwang_outer_post`，坐标1622,8678，为过吊桥后的外围哨位，非弥骨接待处。挂点与场景卡名单同步overlay；不让弥骨/石匠参加追加战。
- F13已注册新合同：`combat.f13.ghost_king_final`，挂`lcq.event.ghost_king_swallowed`。输入闸、预览/确认/结算/存档/描写/收束与F03、F10共用同一宿主。
- 井口彻底失守或主角倒下→合同直接E07；普通失败但井口尚在→伤情代价，仍到星阵/吞王。两种收束分离，大败不提前写吞王。没有跳井前提。
- 自然算法受控复现：新F13检查点基础加值9，种子14，无forced骰点，行动骰1,1,15,4,18,1，井口失守→E07；日志`/tmp/combat-f13-natural-seed.log`。这是代码/种子验证，不是真MiniMax验收。
- W-48/49/50待裁定部分未代定；F14仍只登记草稿因果W-52，未启用。尚未转接F01/F02/F04–F09/F11/F12/F14。

### 17:05 F10 战利品

- 断斧 `lcq.item.f10_broken_axe`：05b content.items与overlay登记，凡品双手兵器，沿现有装备增幅实现气血上限+15、根骨+2；装备/卸下可逆。事件判定入口与新场面共用砸击/破障+1、闪避−1。装备入口阻止与双刀/其他手持兵器并用。
- 碎水晶 `lcq.item.nh_niche_crystal`：沿用现有物品id。宫内交锋卡提供两个互斥选择：下一次外伤降一档，或下一次防御+2。消费与护膜状态先存档，不掷骰、不推进剧情；第一次触发后清除。内伤不减，宫外不提供护膜，普通使用入口提示到交锋卡选择用途。
- F10奖励经`settleScenarioInventoryTransfers`写一次性回执；搜刮现有授权过滤会检查背包和转移回执，因此消费后也不再从搜刮池刷新。没有改搜刮概率/种子/次数。
- 实现入口：host/loot.ts、host/writeback.ts、host/factors.ts、enemy.ts、statuses.ts、enhancedActionQueue.ts、judgementPreflight.ts、SceneEncounterCard.vue、MainGamePanel.vue。

### 三个新档检查点与读档

仓库绝对根目录：`/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu`。

- `_newbot_tmp/combat-checkpoints/F03-before.json`
- `_newbot_tmp/combat-checkpoints/F10-before.json`
- `_newbot_tmp/combat-checkpoints/F13-before.json`

三个都直接是 `{type:'saves',saves:[{存档名,存档数据}]}` 游戏导出格式。不需要再手工包壳；原始SaveData另存同目录`F03/F10/F13-before.raw.json`，保留raw形式便于排查。生成器每次从新档工厂沿生产合同回放，前序战斗使用受控成功识别/骰点，目标战斗未开始、没有forced骰。F13现在newSceneReady=true。

读档：在8097建立/选择隔离试玩角色，打开存档管理→导入上述`*-before.json`→读档；使用`?sceneModule=on`。F03点迎战；F10点应对鬼巫王；F13点守井口/输入打法。它们走同一正式宿主。F10输入「我投降」再确认可测E06；F13大败自然消费E07。

导入格式经实际`unwrapDadBundle`和V3校验函数测试，检查点目标/事件未完成/人物ID键/新模块入口都通过；这次没有驱动浏览器做导入UI或真实MiniMax测试。前序回放无模型正文，不作历史正文连续性证据。

### 最终门禁、包与保护面

- 定向86/86；tsc --noEmit 0错误；git diff --check通过。
- 串行全量1482项：1477通过、0失败、5既有skip；`/tmp/combat-finish-full-final.log`。
- canon:build全绿55.7秒，内置单测同为1477过、0败、5skip；`/tmp/combat-finish-canon.log`。未放宽棘轮、未改旧测试期望。
- 首次全量2个失败（新增动作缺场景卡字段；底层倒下审计口径）原日志保留`/tmp/combat-finish-full.log`，均修实现后重跑；新增验收测试按本次用户合同写。
- 8097已重建完成，webpack成功；LAN `http://192.168.50.51:8097/?sceneModule=on`。静态HTTP实取包与磁盘md5一致：`838ef0cf21749ce969bd01c91317dee5`；sha256 `d363cf7b95135117b4c7d66d0b549aac2151566e3c5be055e61669a59144c815`。
- 该包包含F03/F10修正1–8、F13胜败/E07、E06新正文、W-07新挂点、F10装备/碎水晶、导出格式改动对应代码；不存在「已改源未进8097包」的清单项。生成器/checkpoint文件本身是仓库脚本/独立文件，不是浏览器bundle。
- 8097仍用node65144，无须重启服务；8100仍node78852，PID79521仍存活；其余受保护端口未操作。没有提交/推送/删除/回滚。已有外部合规文档M及bak原样保留，未作为本轮修改。

### 本续做阶段文件

- 合同：contracts/f03.json、f10.json、f13.json、f03-entry.json（registry此前阶段已接）。
- 共用规则：types.ts、plan.ts、scene.ts、lint.ts、enemy.ts、statuses.ts、statusAdapters.ts。
- 宿主：host/controller.ts、writeback.ts、factors.ts、新host/loot.ts。
- 游戏：MainGamePanel.vue、SceneEncounterCard.vue、runtime.ts、fixedEndingNarratives.ts、enhancedActionQueue.ts、judgementPreflight.ts。
- 数据：stage_04、04b、05b builtin与对应3个canon-authority-overlay；门禁刷新的character-registry/manifest产物保留。
- 检查点/验证：generate-scene-combat-checkpoints.mjs、sceneHostWiring.test.mjs、sceneCombatCheckpoints.test.mjs、新sceneCombatLoot.test.mjs。
- 状态文档：本交接、PROJECT-STATUS.md、PLANNING-ROUNDS.md。此前接入和并行改动均保留。

排队的32号NPC记忆已做只读评估，方案与工作量见[NPC-MEMORY-PLAN.md](NPC-MEMORY-PLAN.md)，未实施；命名展示细项与28号的关系已标出，不静默改口径。


## 8097 真模型重测返修（2026-10-05，含用户追加的战利品口径）

本节为最新交付，覆盖17:00节里“战斗领取后搜刮不再刷新”的旧口径。依据 ../playtest-2026-09-28/REPORT-2026-10-05-combat.md「重测」及用户随后追加裁定。保留所有既有工作区；无 commit/push、无删除/回滚，不操作8100/8091/8095/8096/8099与PID79521，未改合规内容。修改前快照在 /tmp/xiantu-combat-rerun-backup/。

| 项 | 根因与处理 | 主要落点 |
| --- | --- | --- |
| 1 F13大败 | 弃守没有独立意图入口、失守只来自自然1大失败。合同新增弃守/逃跑的主动结局选择，经确认接E07；否定/假设不触发。守口普通失败+1，通道敌方命中再+1，达到3格接E07。删除旧fumble的重复失守计数，避免同一次玩家失败记两次。 | contracts/f13.json:178/269/326/418；scene.ts失败与选择处理；enemy.ts命中轨道变化 |
| 2 结局全文 | gameOver.facts只存收束摘要，界面只渲染facts。结局卡按endingId读取完整固定正文并分段显示；E06/E07均覆盖。宿主历史有固定正文就只写固定正文，不再前接bridge；E06开头“你听见自己说「好」”只保留定稿中的一次。不改剧情策划定稿。 | MainGamePanel.vue:355/895；host/controller.ts:146 |
| 3 F10输局与血 | 骨爪命中原来只刷卷刃，未累计伤势；识别器将被动挨咬/切斧柄想当然补成用血。骨爪每次命中挂外伤，沿既有轻→重→倒下链升级。明确任咬/不抵抗/不动等作为放弃防御，有防御减值，仍走正常骰流。血杠杆须玩家表达主动用血，且从第4拍起可用，排除任咬/切斧柄脑补；加入/投降仍经确认独立E06。 | contracts/f10.json:581/705/846；host/recognize.ts:22；plan.ts提议校验；scene.ts敌方防御 |
| 4 叙事与结算 | 目标未分阶段、背伤固定拍先宣告受伤、终态检查把所有win都视为已兑现、普通回合不读战斗终态。离场后目标换成摆脱丹宸/骨虎；识别器只提供当前阶段目标和要素；第5拍只写攻击逼近。已结算伤势每拍同步角色效果与伤情账，不提前发奖励/完成事件。新增条件式正文检查：未制伏不写捆住、无伤回执不写背伤、离场后不继续交锋、解体骨虎不再扑咬；普通叙事接入已收束骨虎事实和写后静默重写。 | contracts/f10.json:37/1103；brief.ts；host/writeback.ts:98；host/narrate.ts:95/102；AIBidirectionalSystem.ts:828/876 |
| 5 状态/预览/稳定 | null时长不再转99999，使用既有-1的“不按时间消退”语义，说明与UI明确修复后解除；同一source/note去重。预览相同说明只显示一次，仍逐人结算。相同原话+合同版本+拍数+轨道/状态/游标等状态指纹的识别结果存档复用；状态改变后重新识别，不能把旧目标强套到新局面。 | statusAdapters.ts:21；StatusDetailCard.vue:75；SceneEncounterCard.vue:9；host/ext.ts；host/controller.ts:99 |
| 6 检查点保护 | 以前导入后loadGame直接将检查点设成当前槽。带“战斗检查点来源.newSceneReady”的导入档读档时另建唯一复测槽，先持久化新槽再设为当前；原检查点不写回。复测工作副本打标，普通读档不重复复制。 | characterStore.ts:1099；新增utils/saveCheckpoint.ts |
| 追加 奖励与搜刮独立 | 按用户新口径，鬼王宫碎水晶/断斧不因F10奖励回执或背包已有同物而从搜刮池排除。战斗奖励仍每场一次，搜刮仍按自身条目once和每地3次记录，消费后不重置搜刮once；关键道具规则不动。不增造未配置的搜刮条目（现有池有碎水晶，未新增断斧池项）。 | locationLoot.ts:55/60；sceneCombatLoot.test.mjs |

### 定向与门禁

- 定向：110/110，0失败。覆盖F13弃守/否定、普通失败与敌方命中累计失守、F10任咬/切斧柄错误识别、累计伤势普通输局、伤势即时同步、条件式叙事检查、固定结局只写一次、识别跨存档复用、检查点副本隔离、两种战利品分别与搜刮独立。
- tsc --noEmit：exit 0、0错误。
- 串行全量：1490项，1485通过／0失败／5既有skip，54.1秒。
- canon:build：exit 0，56.7秒，全步骤绿，内含相同1490项；人名棘轮未放宽。
- git diff --check：通过。
- 两条旧断言按明确新规格同步：null时长从99999改为-1，并断言修复说明；兼容升级版本改为当前合同版本（保留种子、游标不变及预览作废断言）。无弱化失败／dice／红线断言。
- 日志：/tmp/combat-rerun-focused-updated-final.log、/tmp/combat-rerun-tsc-updated-final.log、/tmp/combat-rerun-full-final.log、/tmp/combat-rerun-canon.log、/tmp/combat-rerun-8097-build.log、/tmp/combat-rerun-checkpoints.log。

### 8097包与检查点

LAN：http://192.168.50.51:8097/?sceneModule=on 。webpack构建成功（5.5秒），原静态服务PID65144继续服务，不重启其他服务。新包combat-trial.js：MD5 `504827947cf67309bc7ea93c572e0642`；SHA256 `a395dcfc341f3c6554320126c38606839c7aa6f66b06dc5607b72155ddbc3c87`。LAN实取MD5相同。原测试包838ef0cf…已替换；请刷新后重测。

本包包含上轮15:08的1–8及17:00补定（F03逐人/单组上限/护队/有限伤势，F10独立投降E06/否定识别/第4拍用血/奖励，W07外围哨位追加战），以及本轮1–6和奖励搜刮新口径。F13正式合同与E07消费已接。F14仍草稿未注册，其余未转新合同的场次没有冒充已接。原交接的前锋动态选择、待裁定W48–50等未扩围处理。

三个检查点已用当前新档生产回放重新生成，直接从存档面板“导入存档”选择JSON，再加载；第一次读检查点会另存复测工作档：

- `_newbot_tmp/combat-checkpoints/F03-before.json`
- `_newbot_tmp/combat-checkpoints/F10-before.json`
- `_newbot_tmp/combat-checkpoints/F13-before.json`

格式仍为游戏导出 `{type:'saves',saves:[…]}`，原始.raw.json保留。不是旧档注入，不是新的真模型通玩证据。检查点回放中已完成战斗是受控成功夹具；真实API测试由测试方续做。

### 模型路由（仅查明，未改）

四模块强制M3是既有意图，来源提交3c8781d8及此前去legacy/解决OpenRouter超时的决定（PROJECT-STATUS既有记录）。`src/services/gameModelModules.ts:15–25`在getAPIForModule返回之后，再筛选直连MiniMax-M3；即使主模型或模块分配是M2.7-highspeed，也不会通过该白名单，而会选启用的M3。故测试103请求全为M3与代码吻合。

若用户决定恢复配置生效：需调整resolveGameModuleRoute的强制M3分支，让显式模块配置优先、继承时采用getAPIForModule返回配置；识别/演出/审计默认inheritUsageType为main，记忆默认memory_summary（moduleModelRuntime.ts:48/56/62/68）。`apiManagementStore.ts:528`本来已有这套配置继承逻辑。保留独立开关、请求开始时固定连接。M2.7关闭thinking还需核对aiService.ts:2169仅M3启用的thinking禁用参数，不直接照抄供应商能力；本轮未改路由/主模型/传输配置。

### 验证边界

未做本轮真实MiniMax或玩家UI通玩，110/110及全绿只证明受控路径和代码门禁。本次条件式写后检查覆盖报告中的具体冲突，不是通用语义审校；换一种表达仍可能漏检。识别复用只保证相同场面状态、相同原话稳定，不保证状态变化后目标不变。检查点保护经过纯数据行为测试及loadGame接线核对，实际浏览器导入/自动存档保护待测试复核。

### 本轮改动文件（保留全部此前改动）

- `src/modules/sceneModule/types.ts`
- `src/modules/sceneModule/scene.ts`
- `src/modules/sceneModule/enemy.ts`
- `src/modules/sceneModule/plan.ts`
- `src/modules/sceneModule/brief.ts`
- `src/modules/sceneModule/statusAdapters.ts`
- `src/modules/sceneModule/contracts/f10.json`
- `src/modules/sceneModule/contracts/f13.json`
- `src/modules/sceneModule/host/ext.ts`
- `src/modules/sceneModule/host/controller.ts`
- `src/modules/sceneModule/host/recognize.ts`
- `src/modules/sceneModule/host/narrate.ts`
- `src/modules/sceneModule/host/writeback.ts`
- `src/components/dashboard/MainGamePanel.vue`
- `src/components/dashboard/SceneEncounterCard.vue`
- `src/components/dashboard/components/StatusDetailCard.vue`
- `src/stores/characterStore.ts`
- `src/utils/AIBidirectionalSystem.ts`
- `src/utils/saveCheckpoint.ts`
- `src/modules/scenarioMods/locationLoot.ts`
- `tests/sceneHostWiring.test.mjs`
- `tests/sceneModuleBrief.test.mjs`
- `tests/sceneCombatCheckpoints.test.mjs`
- `tests/sceneCombatLoot.test.mjs`

另更新本交接、PROJECT-STATUS.md、docs/PLANNING-ROUNDS.md。canon管线自动刷新registry/manifest元数据；未手改canon人物、年龄或合规字段。


## 2026-10-05 · 用户最新裁定：F13/F14 只有赢与输

覆盖此前本交接中的“普通输继续／大败进结局”口径：F13 任一输局→E07，F14 任一输局→E08；只有赢才能继续。F13 合同合并失败条件、删除 rout 分支与输后吞王收束，弃守仍经确认进入同一输局。合同升版，旧状态保留骰与进度，已判输状态收束也按新合同进入结局。F14 草稿保留未注册状态；输局与消费端改为 E08，谢艺只固定重伤，生死交 xieyi_entrustment（死亡线/长休 IF 均保留）。旧档 rout flag 仅按 lose 读取兼容，不建立另一档。

### 11场＋G1–G5计划更新（仍未开工）

原五阶段顺序与21–30小时估算不变。F14 E08 分界已取消，不再列待定；谢艺死亡与长休 IF 不再列冲突。F13/F14无需实现伤害程度决定结局档位，均在合同判输后消费固定结局。W-48/49/50仍待定，不写死。F14正式转换注册、其余10场及G1–G5仍等待用户开工，NPC记忆继续排后。

本轮仅源码/合同/定向验证，不重建8097；端口仍是已通过 RERUN2 的旧包 MD5 504827947cf67309bc7ea93c572e0642，新输局口径尚未进该包。无提交/推送、无合规修改。验证结果见本节后续记录。

验收：定向69/69，tsc --noEmit 0错，canon:build全绿56.4s（ℹ tests 1492；ℹ pass 1487；ℹ fail 0；ℹ skipped 5），git diff --check通过。日志 /tmp/xiantu-win-lose-{focused,tsc,canon}.log。未重建8097、未真机；门禁生成的registry/manifest刷新保留。


### 2026-10-05 · 11场计划第1阶段交付（等待第2阶段）

通用状态目录、角色id/群体伤情跨场写回、条件事件、审问章节白名单、输局共同承重已实现，另加奖励授权校验；N1–N4按用户新定锁定。W49/50已登记待逐场合同接入，W48等待剧情侧状态id，不造id；F14仍未注册，谢艺只固定重伤，生死交托付。交付与文件清单见[第1阶段交接](COMMON-CAPABILITIES-STAGE1.md)。

定向96/96、tsc0错、串行全量1513项（1508过/0败/5既有skip）、canon:build全绿56.5秒、diff检查通过。8097重建，LAN/本地MD5一致 `7523b61590d263c0b28eb98f79902d1b`；未做本阶段真模型或玩家复测，不把门禁视为体验PASS。未提交推送、未改合规内容、未操作保护端口/PID，所有既有工作区改动保留。第2阶段及NPC记忆未开始，等待用户开工指示。


### 2026-10-05 · 主模型配置路由交付（独立小改）

四模块识别/演出/记忆/审计移除强制M3筛选，统一继承后台主模型；旧模块独立分配不覆盖。M3原关闭思考保留，M2.7/highspeed仅分离思考字段（官方说明服务端思考不能关闭，不冒称已关）。定向72/72，tsc0，全量1515项1510过/0败/5skip，canon:build绿56.8秒，diff检查通过。8097门禁后重建，LAN/本地MD5一致 `85aeeb7fe4365fd4e5d2cef75bec1f69`。无真实模型复测，无提交/推送/删除/合规改动，保护端口/PID未动；第2阶段仍等待授权。详情：[主模型路由交接](MAIN-MODEL-ROUTE.md)。


### 2026-10-05 · 第1阶段W-48收口补挂

剧情侧状态id已齐：统一目录新增yin.sha_arm轻档，F13胜利收束只引用id挂武二郎，败局/弃守不挂，不合并W52；F13v6兼容v5进度。状态仍可参战，化虎不算解除；数值扣幅/根治时长未定，不擅自补数值与自动治愈。W49/50在F13叙事事实中引用，心脏不入奖励；未扩大救援结算流程。详情：[W48收口](W48-STAGE1-CLOSE.md)。

定向22/22、tsc0，全量1516项1511过/0败/5skip，canon:build绿60.7秒，diff检查通过。8097重建，LAN/本地MD5 `f5e92d4eeb2a2418778fb3127d3ec8fc` 一致；主模型跟后台配置保留。未做真模型复测、未开启第2阶段、无提交推送/删除/合规改动/保护端口PID操作。


### 2026-10-06 · 第2阶段精简合同收口（补充4为准）

F01/F02/F04/F05接同一宿主；输局最简游戏结束，F01完整3回合生存、F04剧情竹筒自动发放、F05血虎濒死制住。四份战前游戏导出检查点已生成，原三份同时重生。定向100/100、tsc0、全量串行1531项1526过/0败/5既有skip、canon:build PASS64.0秒。详情：[第2阶段交付](../2026-10-06/COMBAT-STAGE2.md)。

按用户补充4，本轮不重建8097：磁盘包仍f5e92d，四场新代码尚未入包；先完成id总表再测。只读盘点及统一方案已交，未做总表改造，待用户拍板。竹筒已入现有04b/05b物品清单，当前没有独立全项目物品总表，缺口不掩盖。无提交/推送、删除、合规正文或保护服务操作。
