# nh6-player 第四轮：代码返修与剧情交接

状态：READY_FOR_RETEST，未提交。全部原有工作区修改保留。本轮只修零项及P1代码侧；P2/P3不实施，搜刮不实施。

## 证据与环境判断

- 原报告：[/nh6-player/REPORT.md](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/playtest-2026-09-28/nh6-player/REPORT.md)；模型原文为同目录logs/bodies.log，玩家已显示内容为logs/turns.out。
- sp-escape.json没有五原正文历史、s02_04被强制完成，可以解释第一屏帅帐旧正文和早期承接缺前文，亦解释旧记录的第0回合；不能解释正文泄露作者指令、固定文预设返回、当前人物性别/身份错误、未发生结果被写成已发生。第7–21条没有哪一整条可直接作为快进假象关闭。
- g71之后代码已热重载：小紫真身泄漏和海湾孟老大/阁罗属于新代码下仍存在的问题。早期同行卡/下一站场景串入可能来自第三轮修复前；要在统一门禁后重测，不能以旧截图判本轮未生效。
- 当次console.log没有这三拍逐稿的守卫拒因记录。对原文和旧检查的离线复核发现：03b02 #47/#49缺谢艺（#47还写领取小皮袋）；03b07 #65/#66缺花苗新娘、#67缺阿夕；s04_02 #83缺谢艺、#84缺阿夕。#48/#82仅单独阅读/在场/物品检查不失败。此为重建检查结果，**不是恢复了当时每稿的完整运行时原因**，还可能叠加自主权/伤亡等检查。新逐稿日志继续保留。

## 零项与P1改动

| 项 | 根因 | 本轮代码改法与位置 |
|---|---|---|
| 0 | 第三轮把正文拒稿与传输失败都用三次上限 | [modularTurn.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/modularTurn.ts:179)按错误类型选上限；[AIBidirectionalSystem.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/utils/AIBidirectionalSystem.ts:836)传输两次、正文守卫三稿。原baihu第1450行期望2不改，失败不结算不进legacy。 |
| 1 | 多步合同actionText被直接用作玩家预填，夹有作者约束；武二郎固定文沿用“返回”前提 | [playerActionPresentation.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/playerActionPresentation.ts:61)仅清理展示投影；[runtime.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/runtime.ts:1327)保留原actionText及合同哈希。约束转到AIB模型侧；武二郎第二步显示谈报酬/同行，既有固定文去掉再见和走投无路。 |
| 2 | 全部related在场者被当成逐一必须点名；结果材料可能只含“执行了目标”；安全兜底又只复制标题；NPC杀人和作者已批准的伤亡可能误拒 | [AIBidirectionalSystem.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/utils/AIBidirectionalSystem.ts:753)整拍完成才加入当前变体的已批准结果，场景终点隔离仍沿第三轮；名单为可在场，s04_07樨夫人/易勇仍必须出场。三稿全拒取同一结果，无UI动词或用户输入。 [legacyNarrativeContract.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/legacyNarrativeContract.ts:137)识别既定惨案/受伤/击杀语义；[playerAgencyGuard.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/playerAgencyGuard.ts:29)识别逗号后已知NPC接管主语，仍拦未请求的玩家杀人。没有改变道具守卫，也没有实现搜刮。 |
| 3 | 固定阴蛛拍从已死开始，没有夜袭镜头；按钮先报尸体；自我纠错文本未被拦 | [fixedEndingNarratives.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/fixedEndingNarratives.ts:26)既有固定拍先交代阴蛛袭击、武二郎杀蛛、未能救回，再接焚尸；不改死亡事实或合同。玩家显示改查看异动；指令守卫拦“不对，现在应该称呼另一位阿葭”，提示禁止再造同名伴娘、将苏荔写成苍老族长。熊耳铺已到却仍说启程的语境属后续地点/连续性问题，不在本轮另加正文。 |
| 4 | 切关直接展示scenario.opening.text，三关都是章节纲要，其中04含“玩家可…” | [runtime.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/runtime.ts:1542)三关展示当前world.background首句，04只取无刺王预告的首个分句；不改源开场或记忆。其他关过滤设计语句。本轮未改剧情数据，源稿需按下表交给剧情策划。 |
| 5 | 当前传入小紫的简版外貌已不含父母，未发现亲缘字段被喂入该简版；模型自行补亲缘，缺未揭身份检查 | AIB加入当前只知自称小紫的边界、不要照念按钮；[narrativeBoundaries.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/narrativeBoundaries.ts:79)04b拦碧姬/岳帅亲缘相似，静默重写。不声称角色卡泄漏已坐实，不改受保护身份或首现时间。 |
| 6 | 未平定/未死亡的时序事实未检查；十里焦土可被错套南荒；孟老大别名不在南荒缺席名单；阁罗在场检测漏“一言不发地” | AIB补正典事实及孟非卿/孟老大缺席别名；narrativeBoundaries按鬼巫王吞噬完成回执放行其死亡，否则拦提前平定/死亡；拦当前南荒=王哲焦土但允许回忆/比较。modularTurn在场规则补动作前修饰语，拦提前现身的阁罗，历史提及不退稿。 |

## 剧情数据交接：本轮未改

生成基底：[qingyu/stages](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/mod-kit/generated/deepseek-v4-flash/qingyu/stages)。03b/04/04b已有受追踪authority overlay，剧情策划应维护这些来源，不单改builtin；builtin只用于核对运行时内容。

| 源文件与条目 | 建议 |
|---|---|
| [03b overlay](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/mod-kit/canon-authority-overlays/lcq.stage_03b_snake_flower_bridge.json)：scenario.opening.text（“蛇彝毒袭、鬼王峒血符和花苗送嫁…”），以及manifest.description、scenario.chapters[].summary | 开场只写到达蛇彝村、现场可见的死静；章纲保留内部用途，不作为玩家开场。逐条复核summary是否在章节开始显示时先报结果。 |
| [04 overlay](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/mod-kit/canon-authority-overlays/lcq.stage_04.json)：scenario.opening.text（“凝羽受伤…击杀九名…玩家可介入…”），manifest.description、chapters[].summary | 改为雾中队伍察觉危险的未决现场；删除设计权限句，不在交战前报伤亡。 |
| [04b overlay](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/mod-kit/canon-authority-overlays/lcq.stage_04b_lingfei_baiyi_crisis.json)：scenario.opening.text（“灵飞镜、黑魔海秘讯和鬼王峒陷阱…识破白夷内变”），manifest.description、chapters[].summary | 仅写白夷地界与当前商议；不预报内变、陷阱及后续结局。 |
| [stage02基底](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_02.json)：ningyu_regicide_offer/silent_sheyi_village/rainforest_black_shoal各actions[].actionText；wuerlang_joins第二步actionText/outcomeText | 后续把作者约束移出玩家文案字段；武二郎第二步不强写曾离开返回。代码本轮只做显示投影，原合同未改。 |
| 03b overlay：s03b_wanwu_night、s03b_yinzhu_xiongerpu（burn_yinzhu_victim.label/actionText）；s03b_snake_flower_bridge_07.description | 后续源合同标题改未决异动；阴蛛拍描述明确袭击→死亡→焚尸顺序。送亲/贡物的细节若要兜底也能说清，请剧情策划提供经原文核验的安排，不让代码编贡物数量。 |

## P2/P3分类（第7–21条，本轮全部未实施）

(a)代码/模型材料；(b)剧情源数据；(c)快进存档假象。可为混合项；没有证据的不裁成(c)。

| 条 | 分类 | 具体位置、建议和环境判断 |
|---|---|---|
| 7 称呼/身份/性别/道具串人 | a+b | a：AIB生成材料、legacyNarratorPacket.presentActors的姓名/性别/职务/道具归属及连续性检查。b：03b/04/04b overlay canon.characters[].profile，谢艺/云苍峰/祁远/武二郎的角色卡；明确程宗扬称谓、谢艺男性、祁远商队身份、武二郎非领族人，折扇归属。快进缺前文会放大称谓漂移，但“她/云公子/镖局”不是合理假象。 |
| 8 寒气/旧史/谈话者/伤者断续 | a+b | a：当前步骤与历史事实的统一投影/连续性；b：stage02 ningyu_regicide_offer.trace_ningyu_cold_qi_source，04b s04b_xi_furen_trade_route、s04b_lingfei_baiyi_crisis_14及海神殿/拔鱼叉节点description/relatedCharacterIds。剧情策划核定凝羽寒气来源与入商馆经历，避免模型臆造年月；海神殿须承接受伤乐明珠，不无故换阿夕。不是(c)。 |
| 9 紫溪整段重复 | a | modularTurn.validateModuleCastNarrative的重复阈值、AIB历史摘录；现有规则不足以拦一到两句整段复写。无须改事件结算，不是(c)。 |
| 10 数值/无翼/外貌反复 | a+b | a：legacyNarratorPacket.body、AIB角色投影及外貌特征频率；b：角色卡speechStyle/appearance/notes，分清内部排除约束与可见正面外貌。关卡overlay内凝羽、武二郎、祁远卡与源character-cards-v3对应人。不是(c)。 |
| 11 钟点/夜景 | a+b | a：AIB将确定钟点变为场景材料、行旅日历与回合钟点；b：stage02 iron_bridge_ambush/rainforest_black_shoal，03b s03b_wanwu_night等夜间节点，给明确可用时段。不能凭“模型写暮色”擅改已批准天数。不是(c)。 |
| 12 卡面/地点顺序/同行 | a+b，部分已有第三轮修复待复测 | a：travelLedger出发/到达/同行，AIB预结算下一站隔离；b：03b_05巨藤/03b_06苏荔出场，04 s04_06/s04_07白夷站，04b_14去碧鲮各locationId与演出结束点。确认“出发卡先展示”与正文是否仍在出发场景。早期截图不能证明第三轮修复失败，也不能归快进。 |
| 13 提前揭示/动词不当 | b+a | b：stage02 ningyu_regicide_offer.hear_ningyu_regicide_price与雨林祁远救险叙述；04 s04_03；04b_02、biling_bay_stance；03b_04前往白夷目的地说明。label应写玩家当前可做的未决动作，白夷为最终目的地、中间经巨藤/花苗须说明。a：runtime.deriveInteraction/标签动词、在场地点判断。需要搜出实际“救回落水祁远”按钮来源再核定，不臆造动作ID。不是(c)。 |
| 14 自由输入已答应却不结算 | a+b，早期缺前文放大矛盾 | a：natural intent到结构化动作匹配及未结算情况下模型不得写已完成；b：wuerlang_joins与s04_02的条件、允许自由输入完成的动作语义。要确定“成”对应哪个动作，不能以模型一句承诺倒推结算。返回前提在本轮P1已去掉，余项不改。 |
| 15 泛仙侠编造/价格/属性不入账 | a+b，早期被快进放大 | a：世界设定、注册物品/货币和境界回执边界、自由交易结算；b：商店目录与04b鸦人拍敌人允许身份/地名/门派材料。由剧情策划核原文，不默认接受乌戈力/幽冥殿等模型名。无五原正文能放大市集离题，但虚构和正文假交易/假升级仍是真问题。搜刮待批准，不借本条实现。 |
| 16 固定文薄/发蛊缺演出 | b+a，开场旧文为c | b：03b阴蛛pick_zhu88_as_guide、04 s04_04发蛊夜袭，s04_05旱洪、s04_06解毒的description/分步节奏；熊耳铺秦吴突然出现需补当前可见引介。a：fixedEndingNarratives的正常演出选择策略。本轮只补P1阴蛛过渡，不扩写其余固定文。起点旧帅帐开场是(c)，不能据此免除后续流水感。 |
| 17 内部id认知面板 | a+c（仅第0回合/旧记录来源） | EpistemicLedgerPanel.vue第40–41行直接把subjectId/predicate/sourceEventId当显示名；要有显示名解析与旧档无来源的自然描述。快进确能产生第0回合及缺来源，展示内部id仍是(a)。 |
| 18 术语/提示不清 | a+b | RightSidebar.vue的偏离/回轨文本，MainGamePanel.vue toast“天机重现”；主策划/剧情策划确认玩家用语和后果解释后做显示替换。不是(c)。 |
| 19 止点仍可启程 | a | RightSidebar.vue的questMain.cleared/nextStageReady启程区域需复用本期止点门，与主面板同源。不是(c)。 |
| 20 成人氛围重复/文案口味 | b+a | b：03b/04/04b canon.characters中阿夕/苏荔/凝羽当下卡及stage02凝羽第二步文案；源character-cards-v3对应appearance/personality/notes，按剧情侧提供的当前可见卡做审校。a：模型材料选取和身体特征重复频率。全员成年约束保留，不用“少女”当成已核实未成年年龄；不改受保护年龄。不是快进假象。 |
| 21 第二步首次点击未预填 | a待证，不能裁为c | MainGamePanel.selectScenarioEngineAction/engineOptionLine与回合中按钮刷新时序。驱动过快是待证解释，并非快进档证据；手动一次成功、回合未变，目前不能断言UI回归。建议门禁后加等待按钮稳定的点击记录，再裁驱动/界面。 |

上述(b)内容全部未改；具体执行前由剧情策划逐条核原著/当前时点。年龄、命运、rail/事件ID、行旅天数本轮不改。

## 文件与验证

本轮增量文件（不等于工作区总diff）：

- [src/utils/AIBidirectionalSystem.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/utils/AIBidirectionalSystem.ts)
- [src/modules/scenarioMods/modularTurn.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/modularTurn.ts)
- [src/modules/scenarioMods/narrativeBoundaries.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/narrativeBoundaries.ts)
- [src/modules/scenarioMods/playerActionPresentation.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/playerActionPresentation.ts)
- [src/modules/scenarioMods/playerAgencyGuard.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/playerAgencyGuard.ts)
- [src/modules/scenarioMods/runtime.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/runtime.ts)
- [src/modules/scenarioMods/legacyNarrativeContract.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/legacyNarrativeContract.ts)
- [src/modules/scenarioMods/fixedEndingNarratives.ts](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/fixedEndingNarratives.ts)
- [tests/modularTurn.test.mjs](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/tests/modularTurn.test.mjs)
- [tests/playerActionPresentation.test.mjs](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/tests/playerActionPresentation.test.mjs)
- [tests/r2_15_cross_stage_entry.test.mjs](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/tests/r2_15_cross_stage_entry.test.mjs)
- [tests/run4FollowupRepairs.test.mjs](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/tests/run4FollowupRepairs.test.mjs)
- [tests/run4Repairs.test.mjs](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/tests/run4Repairs.test.mjs)
- [PROJECT-STATUS.md](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/PROJECT-STATUS.md)
- [docs/PLANNING-ROUNDS.md](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/docs/PLANNING-ROUNDS.md)
- [mod-kit/generated/deepseek-v4-flash/character-canon/CANON-DECISIONS.md](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/mod-kit/generated/deepseek-v4-flash/character-canon/CANON-DECISIONS.md)（追加#182实现记录，不改人物数据）
- 本交接文档

串行定向9文件 **121/121通过**，无跳过；[日志](/tmp/xiantu-nh6-player-r4-focused.log)。baihu原32项全过，原expect(calls,2)保持。新增覆盖传输两次/拒稿三稿、安全已结算兜底三拍、真实模型调用入口不逐人点名、NPC主语与玩家擅自杀人区分、阿葭过渡、章节介绍投影、未揭身份/正典时序/缺席别名。全部stub/静态证据，非新真机PASS。

git diff --check通过。未跑全量单测/tsc/build/canon:build/真机；这些由New Bot统一跑。未commit/push。备份：/Users/clawbot/Desktop/xiantu-nh6-player-round4-backup-20261004/。
