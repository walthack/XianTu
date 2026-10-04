# 第九批交接：五原引导、南荒正典与小紫公开信息

2026-10-04；未commit/push；保留全部既有工作区修改；未更改任何既有测试期望。

**状态：代码及定向夹具交付，待New Bot真机复测；全量门禁不能宣称绿色。** 本批B1新裁定与第八批两条“南荒人”断言冲突，旧测试完整保留。不是偶发IPC，也不是执行错误，详见下文。

## 基线与范围

用户提供的独立第八批门禁：1259项（1254过／0败／5跳）、tsc0、canon:build通过，manifest ea85fe34c360；全新五原至一期终点约120回合真实MiniMax证据在 `../_newbot_tmp/c1/logs/`。这是修前基线，不是本批真机验收。

备份：`/Users/clawbot/Desktop/xiantu-batch9-backup-20261004-111552/pre-change.tgz`。原著核对源 `~/tmp_lcq/full.txt`，32章4999–5005、70章10473–10476、78章11611/11626实际读过；其余52/63/72/79/105/126章沿用户给出的定位与裁定，不声称独立通读。第九批裁定追加#188，来源卡与裁定簿单向镜像NAS。

## A：严重项

| 项 | 根因与改法 | 文件／函数 | 验证 |
|---|---|---|---|
| A1 | 前置只有底层拒绝，UI目标不指向点心铺；保留前置，目标明确地点／本地动作。预结算因open_world_prerequisites拒绝时直接返回玩家正文引导，不发模型请求、不伪完成、不弹红字。实际按钮为“用话头拖住他们”或“撞开桌案抢出口”。 | runtime.ts:2347 `wuyuanS0204Guidance`；fixedQuestObjectives.ts；eventNarrativeView.ts:203；AIBidirectionalSystem.ts:732 | 新流水线夹具实际processPlayerAction：0模型调用、generationError为空、事件未完成、未记录尝试。 |
| A2 | 账本已记失踪，现身守卫仅匹配动作句，漏掉“熟悉路／留下帮忙”安排。旧档无账本也从52章完成及63章血虎拍推导missing／transformed摘要；固定事实说明怪物不是普通向导。守卫拦其继续当帮工，允许回忆与异化事实。 | fixedEndingNarratives.ts:176 `sceneLedgerSummary`；modularTurn.ts:241；04b overlay及镜像血虎／樨夫人事件 | 旧档无ledger、失踪及怪物两态、历史提及、安排帮工夹具。底层旧actors的missing不改成dead，怪物真值同时记伤病／worldFacts。 |
| A3 | **用户撤销：不改**。成年女子／成年少女是合规措辞，已知与原著用词不同，有意保留；18+年龄保护不动。 | 04b首现fallback、profile.appearance保持原样 | 新夹具检查成年女子／成年少女仍在。 |
| A4 | 岳帅不在当前演员表，场景无性别硬事实。模型材料明确“岳帅＝岳鹏举，男性”；正文守卫拦女性／丈夫／女性遗腹女母亲口径。 | AIBidirectionalSystem.ts:824；narrativeBoundaries.ts:70 | 反例退稿，正确“他”允许。 |
| A5 | 弑主第一步没有承重固定要点，模型自己换刺杀对象。第一步forceFixed，正文明确苏妲己及“连我一起杀”，不写苏荔。生成与发布入口都消费同一作者fallback；第二步阴寒／西门庆旧事不变。 | 02 overlay及镜像:3330；AIBidirectionalSystem.ts:748/2937；runtime.ts:3219合同同哈希叙事补齐 | 新真实流水线：0演出请求、原条件显示、准备回执成立；原第二步年龄重写／对白保留测试继续通过。 |

## B：小紫与谢艺

| 项 | 实施 | 文件／验证 |
|---|---|---|
| B1 | 出场公开碧鲮族；母系演出回执成立后“碧鲮族（母系碧姬）”。撤销第八批“南荒人”。第70章在场门不提前，小紫18+及成年描写保留。 | characterResolver.ts:509/550/556；新门控夹具。 |
| B2 | weapon_deal_with_geluo完成后记程宗扬“怀疑岳帅遗腹女，未证实”；105章s05b_09第一步已验证counterstrike_plan_formed才确证，沿第八批既定首步粒度，不因激活确证。正文疑问和已知事实独立校验。 | characterResolver.ts:519/564；narrativeBoundaries.ts:86；新怀疑允许／确证拒收夹具。按用户指定节点，虽交易锚点78章、猜测出处79章，不另加事件。 |
| B3 | 南荒03b/04/04b/05b均不准公开毒宗／殇侯师承，父系揭露不解除此门；唯一传人清羽不开放。源卡privateProfile.publication记录126章最早师承与云龙41集5章“唯一”来源。未新增126章事件或自动师承公开接线。 | 源卡、narrativeBoundaries.ts:85、模型材料；非公开源资料仍不导出registry公开卡／embedding。 |
| B4 | 源卡公开身份、两关公开描述和运行时统一删除跟朱老头同行暗示，保留村中少女与紫衣表面形象。 | 源卡→registry／卡投影→5关overlay；characterResolver.ts:550。 |
| B5 | 源卡把“受命护佑遗孀遗孤”改为寻找碧姬；早期phase.goals留空。105章前运行时canon notes／memories／goals和社交缓存均滤掉对象秘密；错误护佑句任何阶段都去除；历史材料也不带错误护佑句。不删好感、一般旧事、装备，不向冻结06卡额外塞新备注。 | characterResolver.ts:603；runtime.ts:3710；AIBidirectionalSystem.ts历史摘录；源卡／registry。旧缓存夹具及冻结05/06重建测试通过。 |
| B6 | **78章交易第二步**补阁罗当面称“碧奴的女儿”和小紫说阿娘，并加碧奴／女儿factChecks与完整fallback；该步才写worldFacts母系演出回执。79章眼线仍做眼线，不混成身世首次揭露。旧档只有交易done没有新版母系回执，不自动补母系；后续105确证仍可公开。已相识小紫补登记社交条目，不因预加载04b就提前相识。 | 04b镜像:4605/4612/4631、overlay；characterResolver.ts:520；runtime.ts:3650。新真实演出流水线一次模型成功显示母系正文后才落账，缺事实则重写／作者fallback，不静默只记资料。 |

旧档叙事补齐只在同一机械合同哈希相等时更新ningyu、兵器交易、血虎元数据，准备／尝试不丢失；普通机械变更仍失效。母系回执跨关沿既有sceneLedger携带，无新存档框架。模型看的是本步已验证预结算状态，不能让“不得揭母系”的旧指令与本步必演事实冲突。

## C与轻微项：已修／未完成清单

- **已修**兵器生意第一步：保留祁远归队这一原拍要点，同时补“提出兵器生意／开始商议货源”、必检词与fallback，不再只有缴贡回执。
- **部分修**搜刮：正文须提到本次每种已入账物，不得宣称取得回执外的已知物品／货币；清单外观察仍允许，不改概率、种子、3次上限或实际发放。全拒沿既有搜刮回执fallback，网络失败不伪结算。蛇彝空村补无活村民／斥候、无新咬伤的现场材料与守卫；未知别称／代词组合仍可能漏过，需真机复测，不宣称无限制语义识别。
- **已修**huamiao_coop_boundary：公开目标、预填与按钮都改为跟云苍峰谈；保留原ID、合同actionText和哈希。
- **部分修**人物台词／物品事实：补拦“潘师姐／潘掌门许可”、灵飞镜绑定阿夕生命或前朝名将遗物；云苍峰说祁远二十年旧路、乱码未修。
- **未修**地点／目标衔接：03b首拍已在村内仍说去领地；焚尸后熊耳铺仍指花苗；凝羽路上位置ID／坐标滞留五原。路途中节点目前无worldLocationId，不能随手塞一个新地图锚点；需要把道路节点的正式地点、坐标与任务投影统一一轮做。
- **未修**祁远落水前的救人按钮时机／交谈动词，需要按原拍进一步拆／校准出场前兆及动作，不在本批静默改结算。
- **未修**五原被捕／六十金／入队、易虎救人／送别／解毒、小紫和阁罗出场固定演出篇幅。已有合同／记账不动；留下一轮专门扩写承重正文。
- **未修**早关：蔺采泉性别、云若、卓云君提前演员、王哲七日粮尽、锦囊太泉内容。需要核对01/02原稿并处理已有固定文本／演员，不称快进假象或已有PASS。
- **顺手已修**乐明珠称呼：源卡03b/04/04b/05b公开phase称呼收为程宗扬，过滤早期canon后期大笨瓜／老公，prompt加声线时序，正文实际乐明珠喊大笨瓜退稿。第110章属于109–112复合拍，当前以该拍完成为保守放开边界；晚于110章片段，不提前。
- **顺手已修**认知与路径：lcq/liuchao系统标识不显示到claim／source／label／dimension；缺摘要显示可读旧记录说明。其他项目旧记录兼容不变，原挂载断言通过。谢艺旧“当前关卡lcq.stage_04”缓存清掉，阶段身份生成不带stageId，其他NPC旧记忆显示投影也去stageId。
- **轻微保留**章节标题格式、人称混用；周澈／星宿海／苏帅／族长床头柜；早期同行名单和01仅7分钟时钟。本批不作体验PASS。

## 自测与门禁冲突

串行定向17文件 **162/162通过**，日志 `/tmp/xiantu-b9-focused-final.log`：canonAuthorityOverlay、batch9CanonAndGuidance、batch9Pipeline、nanhuangSceneLedger、batch6NarrativeCorrections、run4FollowupRepairs、locationLoot、locationLootContent、characterRegistryHash、epistemicLedgerPanelMounted、playerActionPresentation、questCompassArrival、baihuGambleRefusal、modularTurn、r2_11r_lcq_stage_06_source_rebuild、r2_11t_lcq_stage_05_source_rebuild、r2_12_character_phase_projection。

另单独运行**未改的**batch8DisclosureAndEndings：6项／4过／2败，日志 `/tmp/xiantu-b9-old-policy.log`。失败测试第18与第25行期望`南荒人`，本批B1要求实际`碧鲮族`；同测试稍后母系／race旧断言也已过时。按“不要改测试期望”，既不改断言、不skip，也不做测试环境特判。**全量／canon必定在这些旧口径处仍红，需要用户决定是否允许测试侧按B1/B6定案同步。** 无法同时让相反种族口径的断言通过。

合计已执行168项：166过／2旧口径冲突；不是全量执行。`git diff --check`通过。生成registry、卡投影／归属／同门及sync-builtin源闭环；37内置关保留，严格overlay原11条（含重建／二次套用）全过，未放宽drift或删检查。当前manifest **43cfeee8f54d**。没有跑本批全量npm test／tsc／build／canon:build／真机。独立门禁及120回合复测由New Bot负责。

旧测试与备份逐字节一致；全批保留既有修改，包括战斗原型。新增两份测试而未改旧文件。相邻修复的冰蛊、60→10、背包与搜刮上限、三稿静默fallback／两次网络失败测试均继续通过；它们只是夹具证据，不能替代真机。

## 本轮文件清单

相对本轮开工备份共29个文件（含本交接与状态文档，源卡为ignored权威文件）：

- `PROJECT-STATUS.md`
- `docs/PLANNING-ROUNDS.md`
- `docs/handoffs/2026-10-04/BATCH9-CANON-GUIDANCE.md`
- `mod-kit/canon-authority-overlays/lcq.stage_02.json`
- `mod-kit/canon-authority-overlays/lcq.stage_03b_snake_flower_bridge.json`
- `mod-kit/canon-authority-overlays/lcq.stage_04.json`
- `mod-kit/canon-authority-overlays/lcq.stage_04b_lingfei_baiyi_crisis.json`
- `mod-kit/canon-authority-overlays/lcq.stage_05b.json`
- `mod-kit/generated/deepseek-v4-flash/character-canon/CANON-DECISIONS.md`
- `mod-kit/generated/deepseek-v4-flash/character-canon/character-cards-v3.json`
- `src/components/dashboard/RelationshipNetworkPanel.vue`
- `src/components/dashboard/components/EpistemicLedgerPanel.vue`
- `src/modules/scenarioMods/builtins/character-registry.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_02.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_05b.json`
- `src/modules/scenarioMods/builtins/manifest.json`
- `src/modules/scenarioMods/characterResolver.ts`
- `src/modules/scenarioMods/eventNarrativeView.ts`
- `src/modules/scenarioMods/fixedEndingNarratives.ts`
- `src/modules/scenarioMods/fixedQuestObjectives.ts`
- `src/modules/scenarioMods/locationLoot.ts`
- `src/modules/scenarioMods/modularTurn.ts`
- `src/modules/scenarioMods/narrativeBoundaries.ts`
- `src/modules/scenarioMods/playerActionPresentation.ts`
- `src/modules/scenarioMods/runtime.ts`
- `src/utils/AIBidirectionalSystem.ts`
- `tests/batch9CanonAndGuidance.test.mjs`
- `tests/batch9Pipeline.test.mjs`

卡投影会更新ignored的generated阶段镜像，不只手改builtin；五关overlay保留其余既有差异，将events／characters为整体严格from→to快照，避免子字段与整体操作冲突。03b/04对应builtin内容本批逐字节未变；overlay.from因源卡投影变化更新。
