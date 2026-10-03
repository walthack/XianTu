# 南荒扩展方案R实施交接 · 2026-10-03

状态：READY_FOR_NARRATIVE_REVIEW，已实现并完成定向检查，等待New Bot对照节奏大纲复核。不是全量门禁、真机或玩家体验通过；未commit/push。

## 授权、备份与依据

用户确认主策划裁定及剧情策划修订后授权实施。来源是 `/Users/clawbot/Desktop/narrative/南荒扩展/00-给主策划.md` 与01–04、`/Users/clawbot/Desktop/narrative/结局/E05-殇侯试物.md`，以及02 §7、03 §G新增谢艺长休承接。待圆钩子#17–25仅登记，不实施。正典裁定#170–173已追加；AGE/AFF/DEBUT等受保护registry字段没有改。按AGENTS.md单向镜像要求，仅将改过的CANON-DECISIONS.md同步到 `/Volumes/botsvault/06_material/XianTu-Mod-Kit/DeepSeek-V4-Flash/character-canon/`，没有反向读取覆盖工作源或同步其他成品。

改前备份：`/Users/clawbot/Desktop/xiantu-nanhuang-backup-20261003/pre-change.tgz`。基线：`3c8781d8ad20fe60660f9ab4f9b6d0d1a4218404`，分支 `feat/fast-no-legacy`。初始工作区干净；本轮工作区保留供复核。

## 主线与关卡

采用R：03b原著37–44章、04原著45–55章、04b原著56–86章（终点 `enter_dong_with_migu`），05b原著87–124章（含山村尾声）。07仍从萧遥逸上门开始；03/05/06保持隔离。

19个旧悬空事件挂章并挂extra rail：

- 04b：xiaozi_first_appears、haishen_hall_merfolk、pull_harpoon_lemingzhu、regroup_caravan_envoy、weapon_deal_with_geluo、spot_dong_informant、biling_bay_stance、ruins_ghost_warriors、wuerlang_slays_dagu、yiyang_repels_yinsha、huamiao_coop_boundary、guiwangdong_coop_pact、enter_dong_with_migu。
- 05b：blank_letter_and_dagu、geluo_summons_biji、escape_cave_mechanism、hongmiao_controlled、shanghou_revealed、shanghou_cures_ice_gu。

新增7个事件，加上旧事件共26个挂接：

|事件ID（省略lcq.event.前缀）|原著章节|位置与作用|
|---|---|---|
|s03b_wanwu_night|42–43|花苗新娘消息之后，万舞夜与哀悼承接|
|s03b_yinzhu_xiongerpu|44|03b尾部，阴蛛与熊耳铺向导|
|s04b_xi_furen_trade_route|64–65|04b第12拍之后，樨夫人商路|
|s05b_ice_gu_detour|118|散峒之后，冰蛊迫使改道|
|s05b_wuer_suli_depart|119|武二郎、苏荔等离队|
|s05b_shanghou_reads_letter|121|E05后呈信，实际解蛊与信中隐情|
|s05b_yeao_palm_ningyu_stays|123|叶媪授掌，承接124凝羽留村|

8个旧事件跨关移动保持ID和原完成路径：biling_bay_stance、huamiao_coop_boundary由05b到04b；blank_letter_and_dagu、geluo_summons_biji、escape_cave_mechanism、hongmiao_controlled由04b到05b；shanghou_revealed、shanghou_cures_ice_gu由07到05b。逐项确认不在SAVE-CONTRACT冻结事件快照中，不改其他冻结映射。

5个不上rail：zixi_intercept、persuade_wuerlang保留ID降非critical；ice_gu_coercion留原位并记录豁免，去掉当前可执行任务指引；wangzhe_letter（131章）、palace_haunting_rumor（133章）留待后期。前三者没有伪造完成或作废回执。

没有重跑rail生成器。数据采用既有canon-authority-overlays，再单向同步builtin；raw generated清羽stage源不改。03b/04新增的是现有机制的数据覆盖文件，不新增运行时框架。

## 合同、演员与分支

- s04_01改49章刺王密谋；44章向导独立新拍。小紫首现为70章，黑舌死因质问移94章。05b开场修为87章进峒后的接待。秦桧44章首次出场，07为再现报到。
- 121章新拍第1步成功后记实际解蛊回执；124章保留旧事件ID作确认及授艺，不重复施治。冰蛊不加致命期限。
- E05沿用fatalOutcomes，锁在shanghou_revealed：先展示标记及167人死亡警告，再选不碰/触碰，触碰进入固定全文「第一百六十八具白骨」。致命按钮在警告前和拒绝后不开放，直接调用也有守卫；未确认身份前不投出殇侯、电学解释。
- 演员按关卡最小卡及事件/动作回执过滤：朱八八至120章身份确认、花苗新娘至48章身份揭露。樨夫人、叶媪及必要配角补入本关演员表，暂时缺席不永久写成离队。南荒四关避免通过全书registry富化泄漏未来身份和经历；character-registry.json未改。
- 谢艺托付原冻结事件未改。沿用现有生死真值：长休线整个二期深度昏睡，不说话、不参战；叶媪照看、凝羽看护；无火化/骨灰/遗物交割。北上秘密带走，07第130章沿escort_wounded交萧遥逸。支援仅既有判定加成，不代替救治命运；醒来时间#25不实施。死亡线保留既有结果。
- 新开demo可选一期/二期：一期在04b入峒结束，二期在05b第124章结束，终点有界面提示及转关守卫。二期入口仍为从草地开始的完整新开流程，不是一期旧档升级迁移。去legacy模块入口沿用既有实现。

## 涉及文件

- 数据：`mod-kit/canon-authority-overlays/`五关及manifest；`src/modules/scenarioMods/builtins/data/`对应五关及builtin manifest。
- 拍序/目标：`canonRail.ts`、`fixedQuestObjectives.ts`、`secondaryLines.ts`、`characterQuests.ts`。
- 锁与演出：`branchDecision.ts`、`fixedEndingNarratives.ts`、`eventNarrativeView.ts`、`runtime.ts`。
- 演员投影：`characterResolver.ts`、`presence.ts`、`storyContext.ts`。
- Demo：`qingyuOpeningPlaytest.ts`、`strictInitializer.ts`、`src/views/QingyuOpeningPlaytestStartView.vue`、`src/components/dashboard/MainGamePanel.vue`。
- 测试：新增`tests/nanhuangExpansion.test.mjs`；同步`eventReachability.test.mjs`、`xingyuehuG0Reachability.test.mjs`、`r2_11j_objective_action_scale.test.mjs`。
- 文档：裁定簿#170–173、PROJECT-STATUS、PLANNING-ROUNDS；角色任务草案同步海神殿新事件，R2-11R来源报告标明121章历史结论已勘误。

以上简写TS文件都在 `src/modules/scenarioMods/`，路径相对本仓库根目录。

## 已验证与未验证

已执行定向串行测试31项，31通过、0失败、0跳过：nanhuangExpansion、eventReachability、r2_11j_objective_action_scale、xingyuehuG0Reachability、presence。新增6项检查覆盖R关界/ID及拍序、E05警告前守卫/拒绝/固定死亡全文、121与124解蛊分工、隐藏身份与谢艺长休/死亡分支、两期终点，以及用真实结构化动作回执连续走完04b/05b。没有用直接写完成标记替代这条连续推进检查。

五关scenario schema校验通过。保留的孤立事件警告恰是上述不上rail的5个；不把豁免声称为可玩。两处Vue组件通过SFC源码解析/compileScript，未做生产构建。最终git diff --check通过。

本轮未跑全量测试、tsc、build、canon:build、smoke或真机，未调用真实模型，未重启服务、不碰8091、未改存档、未commit/push。31项定向检查只证明所覆盖的结构和分支，不证明全部演员时点/文案体验/性能。全量门禁待New Bot执行；此前回归3c绿仅适用于旧快照。

待剧情复核：逐拍章节顺序、E05决定前知情边界、谢艺两命运演出、离队/身份门和一期终点。待后续验证：完整新档草地到124连续真机、真实模型不偷跑/不复活/不揭身份、所有角色的细粒度时间门、一期旧档扩展及更早历史存档兼容。#17–25钩子不在验收范围。


## 剧情复核返修与门禁结果 · 2026-10-03

New Bot复核：rail/方案R、7个新事件、E05文本逐字一致、长休文本、降级及可达性DEBT已确认；全量出现14个确定性回归，旧31项定向通过不足以交付。本次按05复核文档完成返修，仍未提交/推送。

1. B1不是删卡导致cap变化：`settleSharedExperienceAffinity`仅读事件关联、已有关系、名字cap和全局100上限，不读role/affiliations/attributes。新05b托付前有10个谢艺亲历承重拍累计+80，原夹具24先到100，故托付不能再+8。测试初始改0仍走完整实际动作路径，验证托付+8与回执幂等；另补满100只登记回执不增长/JSON重载不重复检查。生产结算和好感上限未改。
2. 删除四关整体跳过registry的代码；仅03b/04排除朱八八和乐明珠，04b/05b排除朱八八。其他角色恢复registry种族、外貌、时点notes。04b小紫保留表面性格，时点资料仍走registry。
3. 五个未认领新critical挂入二级线；criticalEventCoverage中增加旧ice_gu_coercion的裁定170豁免。白纸信/叶媪/授艺/秦桧入伙及小紫节点按axisSeq重排。既有散峒节点axisSeq晚于118章冰蛊分路，二级线依axisSeq列分路在散峒前；获准rail节奏不变，不修改冻结托付/原著轴映射。
4. 同步固定目标61、overlay8（补上03b/04真实闭包检查）、主角判据函数窗口、03b成人notes检查的在场对象；没有删除门禁。
5. 70章小紫合同去掉黑舌死亡准备，单步recognize_xiaozi；07秦桧objective/label/actionText统一再现。
6. 03b/04早期背景、医派、关系记忆、世界情境改花苗新娘；朱向导证据和相关势力描述去掉殇侯真身。世界情境的旧固定覆盖源 `mod-kit/world-sim-refinements/qingyu-yunlong.json` 同步，避免authority覆盖与其产生冲突。权威overlay按“generated→既有世界情境覆盖→authority”的实际生成顺序核对源漂移。
7. 叶媪04-c、血虎65章后、弥骨/卡瓦临时协定后、黑衣丽人托付后离场门已补；八个长休变体及谢艺提示须同时有void与正式长休branch.active，void+missing不冒称长休。#174记录本轮修订、八份overlay及退出旧重复指引范围。

备份：`/Users/clawbot/Desktop/xiantu-nanhuang-review-repair-backup-20261003/worktree.tgz`，世界情境源另有同目录副本。原批准方案、E05固定全文及冻结托付保持。

最终验证：

- 工作目录串行全量：1163项，1158通过、0失败、5跳过，exit0；日志 `/tmp/xiantu-nanhuang-review-full.log`。
- 完整canon:build：当前代码和generated数据复制到 `/tmp/xiantu-nanhuang-review-canon-20261003` 执行，所有步骤通过，exit0，37关schema通过、单测同为1158/0/5，37.0秒；日志 `/tmp/xiantu-nanhuang-review-canon.log`。副本重建后本次五关builtin与工作目录逐字一致，无生成回退。
- 首轮工作目录全量仅剩世界情境权威源冲突，修源后重跑全绿；首轮隔离canon漏带`.grok/workflows`测试依赖，补齐后重跑完整管线全绿。没有把任一次失败忽略或当作PASS。
- diffcheck通过。没有执行tsc/生产构建/真实模型/真机；没有重启服务、改存档、commit或push。隔离副本产物不反向覆盖工作目录；裁定簿按AGENTS单向同步NAS镜像。

成熟度：剧情已复核主要结构，返修完成且提交门静态通过；等待New Bot复核返修/安排真机，不声称玩家体验或正式P0通过。本节为当前状态，正文先前“未跑全量/canon”的记录属于首次交付快照。


## 复核2与发布授权

2026-10-03，New Bot确认南荒扩展复核2通过（全量1158过/0败、canon:build全绿），用户批准提交并推送 `feat/fast-no-legacy` 至GitHub `origin`（walthack/XianTu）。本节与已验证实现同一提交，不再改代码，不追加门禁执行；提交哈希由Git历史与交付回复提供。此前未提交/待复核记录保留为历史，真机/旧档兼容仍未验收。
