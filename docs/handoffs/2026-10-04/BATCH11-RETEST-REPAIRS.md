# 第十一批：身份、在场、账本与一期止点返修

用户依据：`../_newbot_tmp/r9/` 真 MiniMax 五原新档至04b约110回合证据。保留已完成的黑魔海引子改写及独立战斗原型；不提交、不推送，不改合规内容。本轮未做真机。

## 逐条根因与实现

| 项 | 根因 | 改法与位置 |
|---|---|---|
| 1 小紫母系 | NPC同步使用短关卡id正则，漏掉04b完整id；presentActors另写固定种族，丢弃母系限定 | `src/modules/scenarioMods/runtime.ts:3730` 明确四关完整id，将已门控canon字段同步到关系；`legacyNarratorPacket.ts:187,213` 读取同一身份投影。70章碧鲮族、78章实际演出回执后母系、105章父系门均沿用，不提前开放 |
| 2 碧姬称呼（用户改写，以下补充为准） | 阁罗的蔑称被写进旁白、母系账本、资料与通用事件文案；另缺当前在场排除 | 通称统一碧姬，原著阁罗台词保留碧奴；旧回执兼容、现有身份门与在场约束不变。逐项落点见下节 |
| 3 易虎编年史 | 原生成基底两段洪灾标题/后果沿用死亡；scene exit误将失踪并进持久departedCast | `mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_04.json:3024,3084` 及04 overlay相应from/to、builtin `lcq.stage_04.json:2990,3054` 改失踪。`fixedEndingNarratives.ts:150` 不把失踪加入死亡名单；`presence.ts:238` 清旧易虎名单；`runtime.ts:3004` 兼容旧编年史和分歧记录，缺字段不报错。事实账本仍按失踪/血虎拦普通活人出场 |
| 4 遗腹女公开 | 完成事件描述被当作publicFacts/局部记忆事实，无父系门 | `legacyNarratorPacket.ts:255,381` 和 `AIBidirectionalSystem.ts:780` 用现有105章父系揭示门过滤公开事实；保留后台事件源和79章未证实怀疑，未新增事实解锁 |
| 5 认知与路径 | 旧entity known记录无claim/source；普通事件无timeline，默认写0；UI直接展示缺字段占位 | `runtime.ts:2531,2546,2563` 使用真实动作readyAtTurn作回执回合来源，为有sourceEventId的已知记录补名称/来源。`EpistemicLedgerPanel.vue:33,46,55` 解析已记录实体/事件名称，开场已知单独显示；找不到真实历史回合则“回合未记录”，不编数。`RightSidebar.vue:282` 传runtime；不从全角色列表生成玩家新知识 |
| 6 凝羽指代悬空 | 原文`bodies.log:598`先说“西门庆”，第600行再说“这个名字”；显示前名字过滤只允许带当年/曾经的同段句子，删掉姓名回答 | `characterResolver.ts:496` 合同已授权历史姓名可保留裸名字对白；该人物走进/出现等实际当前行动仍拒。未补固定正文，未授予西门庆当前登场或相识权限 |
| 7 时间/启程 | 历史条目无条件再加时间；任务栏按stage ready给启程，未看一期终点出发offer | `memorySanitizer.ts:46` 清重复开头游戏时间，统一用当前游戏时间一次；`AIBidirectionalSystem.ts:2976` 历史与短记忆同入口。`RightSidebar.vue:583` 仅真实departure offer存在才显示启程，保留本期结束 |

## 本轮文件清单

实现：
- `src/modules/scenarioMods/runtime.ts`
- `src/modules/scenarioMods/legacyNarratorPacket.ts`
- `src/modules/scenarioMods/presence.ts`
- `src/modules/scenarioMods/narrativeBoundaries.ts`
- `src/modules/scenarioMods/fixedEndingNarratives.ts`
- `src/modules/scenarioMods/characterResolver.ts`
- `src/utils/AIBidirectionalSystem.ts`
- `src/utils/memorySanitizer.ts`
- `src/components/dashboard/RightSidebar.vue`
- `src/components/dashboard/components/EpistemicLedgerPanel.vue`

数据/权威闭环：
- `mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_04.json`（被忽略的既有基底，未强行加入Git）
- `mod-kit/canon-authority-overlays/lcq.stage_04.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_04.json`
- `mod-kit/generated/deepseek-v4-flash/character-canon/CANON-DECISIONS.md`（#191，同步NAS只读镜像）
- `src/modules/scenarioMods/builtins/manifest.json`、`character-registry.json`（canon管线版本/时间产物）

测试/交接：
- `tests/batch11RetestRepairs.test.mjs`（新增5项）
- `tests/r2_13_interaction_handoff_demo.test.mjs:130`（旧“易虎之死”断言按本批失踪裁定同步，并断言无死亡字样）
- `PROJECT-STATUS.md`
- `docs/PLANNING-ROUNDS.md`
- 本交接文件

黑魔海改动在其独立交接中列出，不冒充本批新增；独立`dev/combat-proto/`与`tests/combatProto.test.mjs`未改。

## 验证与边界

- 定向：相关首轮37/37；最终兼容回归三文件26/26（含本批5项及后台事务、洪灾承接）。
- tsc：0错，`/tmp/b11-tsc-green.log`。
- npm test：1286项，1281通过、0失败、5既有跳过，`/tmp/b11-test-green.log`。
- canon:build：全步骤通过，47.4秒；内含1286项/1281通过/0失败/5既有跳过，manifest `06cc1e73ca2b`，`/tmp/b11-canon-green.log`。
- git diff --check：通过。

中间验证曾发现公开事实变量声明顺序、旧对账缺字段和旧死亡断言冲突，均已处理后重跑；另有一次Node25 IPC deserialize，相关文件独立通过，最终全量无该错误。不放宽drift、不新增skip，不删除别人的改动。

待New Bot复测：78章后的关系种族及presentActors一致；碧姬为通称、碧奴仅在原著角色蔑称台词；洪灾旧档编年史失踪口径；105前publicFacts无父系；认知名称/实际回合；凝羽名字对白完整；一期结束无启程。历史无真实回执的回合数不能重建，明确显示未记录。没有新增设计/合规判断，没有提交/推送，没有新真机PASS。

## 第2条用户改写：碧姬规范称呼（同批追加）

本条取代第2条旧报告口径，任何“第2条撤回”无效。问题不是另一个叫碧奴的人；她是碧姬，蔑称被错误推广成通用姓名。未更改人物生死或身份门控。

逐项落点：

1. **母系揭示场景卡与兜底旁白**：04b `weapon_deal_with_geluo`最后一步，`builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:4606,4613,4632`。阁罗“碧奴的女儿”台词保留；“她的母亲是碧奴”“与碧奴的母女关系”改碧姬。账本回执改“小紫母系已演出：碧姬的女儿”。修改在04b overlay `to`闭环，未单改builtin。
2. **人物关系面板与模型公开资料**：`characterResolver.ts:527,548,570`。新资料“【已知身世】小紫是碧姬的女儿”，旧蔑称回执只映射同一已演出事实、去重，不改变78/105章门。关系与presentActors继续读取同一已门控canon，未新建UI数据副本。
3. **模型演出指令**：`AIBidirectionalSystem.ts:823–824`。母系材料改碧姬；明确旁白/通称用碧姬，只有原著使用此蔑称的角色台词可用碧奴，不能另造人物。`narrativeBoundaries.ts:85`错误信息同步规范名。旧称仍参与越权识别，不作为可见人物名。
4. **召见目标/按钮/合同**：05b `geluo_summons_biji`，`builtins/data/lcq.stage_05b.json:3988,3992,4012,4021–4025` 的描述、轴拍、目标、label/actionText/成功回执统一碧姬；05b overlay同步。04b overlay里同一跨关事件源引用也同步。`runtime.ts:983`加精确 `e0119be2→f0f6dac7` 文案合同迁移，保留旧档动作进度，不放宽其他hash校验。
5. **主轴与支线面板摘要**：`canonRail.ts:509` mustReach及 `secondaryLines.ts:492` reviewSummary改碧姬。
6. **旧05关事件和情势材料**：`builtins/data/lcq.stage_05.json:1720,1736,2535,2554,2571`，对应generated基底和 `mod-kit/world-sim-refinements/qingyu-yunlong.json:1419,1423,1431`。旁白/情势摘要/可观察事实改碧姬；要保留阁罗蔑称时写成明确的“去唤碧奴”台词，不再作“叫碧奴的人”事实名。
7. **全书角色履历及registry/RAG材料**：权威源 `mod-kit/generated/deepseek-v4-flash/character-canon/character-cards-v3.json:15321,16645,16647,32278,40838,44530,49452`，小紫历程、岳帅登场场景、碧姬/谢艺/阁罗/鬼巫王的履历通称改碧姬；仅替换称呼，事件性质及成人内容不改。脚本重新生成 `builtins/character-registry.json:4994,4996,8312,10445,14951,34630,35335` 及对应embedText，没有手改registry。
8. **测试**：新增 `tests/bijiNaming.test.mjs`四项，覆盖合法台词与旁白分离、旧回执兼容/不预揭、目标名与精确合同迁移、registry通称与别名识别并存。`batch8DisclosureAndEndings`资料断言及`batch9Pipeline`账本断言同步新规范名；旧称输入/原著台词的边界测试仍保留。

仍含旧称的范围已逐类复核：合法阁罗台词；规范别名/私有知识防漏闭包/旧档兼容；解释蔑称的内部规则；原著第88章章名引证及历史裁定。它们均非通用称呼，保留用于来源识别和边界防漏。原始试玩正文、历史交接和分书旧抽取/备份不重写；实际权威卡→registry与运行时基底→overlay→builtin已闭环。未改人物canonicalName/id（原本就已为碧姬）、未另建人物。

验证：定向六文件37/37；tsc0错；npm test1290项，1285过/0败/5既有skip。canon:build全步骤通过47.6秒（内含1285过/0败/5既有skip，manifest `4ad8b7601312`）。diffcheck通过。备份`/tmp/xiantu-b11-biji-before.tgz`；日志`/tmp/b11-biji-*.log`。未做新真机、未commit/push，原第十一批其余六项和黑魔海引子改动保留。
