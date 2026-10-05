# 23号原著冲突清单 · 同轮实施交接

2026-10-05。范围：1–9、15–19；00:41五处章节门及P0、第十一/十二批、黑魔海和模块策划战斗改动保留。没有commit/push，没有整体回滚。

## 逐项结果

|编号|落实|原著/裁定依据|三项门禁|
|---|---|---|---|
|1|小魏、石刚统一为白湖商馆护卫|31章段41–46、79章段33、82章段55|tsc 0；全量 1352/1357 过、0败、5跳；canon 外部棘轮阻塞|
|2|黑舌为阁罗随从，非碧鲮族人|78章段109|tsc 0；全量 1353/1358 过、0败、5跳；canon 外部棘轮阻塞|
|3|达古为鬼王峒巫师|83章段20|tsc 0；全量 1354/1359 过、0败、5跳；canon 外部棘轮阻塞|
|4|娄蒙为红苗族长之子；丹宸仅采用红苗女子、娄蒙之妻的可证身份，删除道士身份|91章段57|tsc 0；全量 1355/1360 过、0败、5跳；canon 外部棘轮阻塞|
|5|阁罗由鬼王峒首领改为鬼巫王仆从，源卡及各阶段同步|78章段65|tsc 0；全量 1356/1361 过、0败、5跳；canon 外部棘轮阻塞|
|6|乐明珠源卡阶段身份为光明观堂弟子|47章段103/110|tsc 0；全量 1357/1362 过、0败、5跳；canon 外部棘轮阻塞|
|7|龙神gender无、entityType creature；投影、旧档还原及模型presentActors使用它|112章段46|tsc 0；全量 1358/1363 过、0败、5跳；canon 外部棘轮阻塞|
|8|易虎52章失踪；血虎61章出场，63章认出；不移动事件，63章事件更名认出血虎|52章、61章段51、63章|tsc 0；全量 1359/1364 过、0败、5跳；canon 外部棘轮阻塞|
|9|碧宛知识证据改65/76章，原揭示条件保留|65章段33、76章段91|tsc 0；全量 1360/1365 过、0败、5跳；canon 外部棘轮阻塞|
|15|覆盖旧#57：120章身份确认后殇侯称鬼巫王为徒弟；不推定教徒身份|120章段72–76|tsc 0；全量 1361/1366 过、0败、5跳；canon 外部棘轮阻塞|
|16|03b秦桧/吴三桂候选向导、吴战威白湖护卫、易彪云氏护卫；剔除后期岗位及阶段虚构状态|21/22作者表及23#16|tsc 0；全量 1362/1367 过、0败、5跳；canon 外部棘轮阻塞|
|17|母系私有知识持有者补阁罗；现有解锁门保留|78章阁罗揭示母系|tsc 0；全量 1363/1368 过、0败、5跳；canon 外部棘轮阻塞|
|18|四关同名重复地点归并规范id，所有结构引用同步；保留鬼王宫/驿馆/海神殿子地点，补白夷势力|23#18及2026-10-03地点裁定|tsc 0；全量 1364/1369 过、0败、5跳；canon 外部棘轮阻塞|
|19|19b三处41改40关卡实体，岳帅为另1个registry-only实体|四关角色id并集实算|tsc 0；全量 1365/1370 过、0败、5跳；canon 外部棘轮阻塞|

## 文件与落点

源卡、生成基底、overlay、registry/builtin按同一事实同步；每项严格overlay重建与幂等测试通过。from快照仅按当前卡投影来源精确重建，未放宽drift检查。05关没有tracked overlay，沿用既有生成基底同步。后续多关源卡投影同步是同一身份修正，不是新增剧情。

- `scripts/build-character-registry.mjs:140`：creature字段透传/校验，仅此类型使用它，其他人物逻辑保留。
- `scripts/apply-character-cards-v3-to-mod.mjs:154`：creature字段透传/校验，仅此类型使用它，其他人物逻辑保留。
- `src/modules/scenarioMods/characterResolver.ts:88`：creature字段透传/校验，仅此类型使用它，其他人物逻辑保留。
- `src/modules/scenarioMods/legacyNarratorPacket.ts:47`：creature字段透传/校验，仅此类型使用它，其他人物逻辑保留。
- `src/modules/scenarioMods/schema/canon.ts:84`：creature字段透传/校验，仅此类型使用它，其他人物逻辑保留。
- `src/modules/scenarioMods/validator.ts:192`：creature字段透传/校验，仅此类型使用它，其他人物逻辑保留。
- `src/modules/scenarioMods/runtime.ts:52`：规范别名比较；旧别名开场不再回落到首个地点，旧存档同场判断不额外要求移动。
- `src/modules/scenarioMods/strictInitializer.ts:1`：规范别名比较；旧别名开场不再回落到首个地点，旧存档同场判断不额外要求移动。
- `tests/authorConflictCorrections.test.mjs:12`：14项独立回归；龙神旧档还原/实际模型代词投影也覆盖。

本轮源/数据文件（与本轮备份比较，不等于整个脏工作区文件清单）：

- `mod-kit/generated/deepseek-v4-flash/character-canon/character-cards-v3.json`
- `mod-kit/generated/deepseek-v4-flash/character-canon/CANON-DECISIONS.md`
- `mod-kit/canon-authority-overlays/lcq.stage_05b.json`
- `mod-kit/canon-authority-overlays/lcq.stage_04b_lingfei_baiyi_crisis.json`
- `mod-kit/canon-authority-overlays/lcq.stage_07_qingyuan_jiankang.json`
- `mod-kit/canon-authority-overlays/lcq.stage_04.json`
- `mod-kit/canon-authority-overlays/lcq.stage_03b_snake_flower_bridge.json`
- `mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_08_jiankang_coup.json`
- `mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_10_jiangzhou_shadow_war.json`
- `mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_05b.json`
- `mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_06.json`
- `mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_09_trade_and_escape.json`
- `mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_04b_lingfei_baiyi_crisis.json`
- `mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_12_jiangzhou_counterwar.json`
- `mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_07_qingyuan_jiankang.json`
- `mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_05.json`
- `mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_11_lieshan_battle.json`
- `mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_04.json`
- `mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_03b_snake_flower_bridge.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_08_jiankang_coup.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_10_jiangzhou_shadow_war.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_05b.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_06.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_09_trade_and_escape.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_12_jiangzhou_counterwar.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_05.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_11_lieshan_battle.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_04.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_03b_snake_flower_bridge.json`
- `src/modules/scenarioMods/builtins/character-registry.json`
- `src/modules/scenarioMods/builtins/manifest.json`

仓库外文档：`/Users/clawbot/Desktop/narrative/19b-事实账本实现建议_模块策划.md:58、150、164`三处数量修正；备份`/tmp/author23/19b-before.md`。

裁定簿#197解锁对应已批准身份错误，旧#57/#188历史原文保留，以新裁定覆盖；年龄/成人/合规内容未改。源卡保留字段对比为0变化，证据`/tmp/author23/content-audit.json`。

## 验证与阻塞

- 最终tsc 0错误；npm test 1370项：1365通过/0失败/5既有跳过。
- 相关定向54/54（14身份、registry哈希、overlay重建幂等、场景账本、南荒扩展及行旅）。
- 地点id独立校验失败0，已登记警告37；沿用原坐标和既有债务，未新增豁免或改坐标。
- 每项canon:build均实际执行，在第一个账本人名棘轮步骤失败，后续步骤未运行。五个外部文件：`src/dev/combatTrial/CombatEncounterCard.vue`、`CombatTrialStartView.vue`、`f03Scenario.ts`、`flow.ts`、`overlay.ts`。这些文件及基线未修改；由模块策划处理后须重跑完整canon。
- 第4/15/19项初次全量出现Node25 deserialize偶发，分别隔离通过并最终全量通过；保留原失败及隔离日志。第18项规范化暴露开场别名直接查找缺口，已修代码，全量原断言通过，未改旧测试期望。
- 日志逐项为`/tmp/author23/<编号>-tsc.log`、`-npm.log`、`-canon.log`；汇总`results.json`；最终定向`final-focused.log`。
- 没有真机或真实模型验收；这批身份勘误不代表完整P1账本/秘密好感系统已完成。

## 后续交接

New Bot/模块策划修外部人名棘轮阻塞后重跑canon；真人复测重点为候选向导阶段身份、龙神代词、易虎失踪/血虎、母系持有者以及旧档地点别名。不改合规；无新增待裁定项。

## 同轮补充：谢艺男性指代（用户01:44补充）

### 排查结论与处理

1. **确认的源错误**：`scripts/add-secondary-line-opportunity-cards-south.mjs:181、184、224、228、233`写了五处女性代词（机会卡3处、决策证据2处）。已改为男性代词；当前生成源、04b overlay 的from/to闭包、builtin和旧链路说明一起修正。没有只改builtin。
2. **歧义而非女性身份**：`mod-kit/world-sim-refinements/qingyu-yunlong.json:1056`的“堵住谢艺，追问她的异常”，前后文指阿夕。改成“追问阿夕的异常”，没有改成“追问他的异常”。builtin同处`:6708`、当前生成源及旧pipeline的`merged-draft.json`同步。
3. **当前有效卡**：谢艺源卡、registry及生成关/overlay中命名人物对象未找到女性gender；未新增女性IF、未修改年龄或其他合规字段。没找到明确女性IF线定义，用户关于IF残留的推测尚无证据确认。历史交接`character-canon/HANDOFF-二审与待修.md:30`确有“谢艺曾被误判女性（实男）”的记录，不能据此认定IF来源。
4. **旧提示词与模型结果**：`.xiantu-server/world-sim-refinement-2026-08-14/prompts/lcq.stage_04b_lingfei_baiyi_crisis.txt`没有这些错误女性代词；原结果`results/lcq.stage_04b_lingfei_baiyi_crisis.json:272`有阿夕指代歧义。原模型结果留证不改；会被旧pipeline `apply`直接读取的`merged-draft.json:1050`已修正。当前canon同步读取tracked `mod-kit/world-sim-refinements/qingyu-yunlong.json`，不读取原始results。若重做旧pipeline的merge，会重新汇入旧原始结果，需要再次人工审查，不能把老结果当作当前批准稿。
5. **旧合同兼容**：`:1957` `reconcileOpportunityCompletionContract`对这一个机会卡和确切hash对`4270292f → 98654656`保留步骤/选择；其他hash变化仍按原逻辑重置，旧热更选项仍不能直接结算。避免只修actionText却让已告知谢艺的旧档重做第一步。测试实际走公开运行时接口验证第二步保留及无关hash拒绝兼容。

### 具体落点

|文件|行号|处理|
|---|---|---|
|scripts/add-secondary-line-opportunity-cards-south.mjs|181、184、224、228、233|源脚本五处她→他|
|mod-kit/canon-authority-overlays/lcq.stage_04b_lingfei_baiyi_crisis.json|5417、5423、5616、5620、5643；7808、7814、8007、8011、8034|from/to快照同步，无弱化drift|
|mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_04b_lingfei_baiyi_crisis.json|当前生成源对应五处及情势征兆|同源修正；仍ignored，未force add|
|src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json|3134、3140、3333、3337、3360、6708|派生结果同源；阿夕指代明确|
|mod-kit/world-sim-refinements/qingyu-yunlong.json|1056|追问阿夕的异常|
|.xiantu-server/world-sim-refinement-2026-08-14/merged-draft.json|1050|旧apply输入防误回流；未改原始results|
|docs/R3-10-LINE-CHAINS-FULL-2026-08-16.md|214|旧链路说明由他通报|
|src/modules/scenarioMods/runtime.ts|1957–1965|仅这次指代修订的精确合同兼容|
|tests/authorConflictCorrections.test.mjs|41、61|新增两项数据一致性/实际运行时旧合同测试|
|mod-kit/generated/deepseek-v4-flash/character-canon/CANON-DECISIONS.md|#198|追加用户事实裁定；历史记录保留|

### 全仓扫描结果与保留项

- 文本检索覆盖src、mod-kit（含ignored生成源与备份）、scripts、tests、docs、.xiantu-server（含提示词、模型结果/日志、存储）、dev；排除.git、node_modules及不用于源扫描的主dist/二进制资产。独立搜查女性IF关键字，未找到有效IF定义。
- 962份相关JSON结构化解析，按谢艺名称/规范id定位gender/sex/性别字段，女性命中0；详见`/tmp/xieyi-pronoun-fix/structured-gender-scan.json`。不把“谢艺寻找的女子”“谢艺带回凝羽后安顿她”等合法女性指代误改。
- 改后精确旧句仅有：原始模型results 1处；`qingyu/stages-pre-v3-cards-backup/lcq.stage_04b_lingfei_baiyi_crisis.json` 6处；`.xiantu-server/save-storage/scenario_mod_library_v1.json` 6处；测试中的3处负例。前两者为原始结果/改前备份，保留证据；本地模组库为用户存储，不直接改写（旧导入模组如继续加载，需重导入当前修正版）。
- 独立战斗bundle `dev/combat-trial/dist/combat-trial.js`仍含编译前6处旧句，是ignored产物，未手改、未重打包；由其维护者下一次构建更新。本轮没有改战斗源文件。
- 扫描证据：`scan-before.txt`、`exact-source-hits.json`、`exact-after.txt`、`female-if-final.txt`。含有“她”不等于谢艺性别错误；上述分类没有声称所有历史文本已清零。

### 验证

- 定向38/38：身份一致性、原源脚本、严格overlay重建/幂等、37关worldSimulation与机会卡本地结算、指代修订旧合同续步。
- tsc --noEmit：0错误。
- npm test：1372项，1367通过、0失败、5既有跳过。
- canon:build：执行后仍在账本人名棘轮因原五个战斗试玩文件中断，后续未执行；未放宽基线/未修改这些文件，不能标为全绿。
- git diff --check通过；日志`/tmp/xieyi-pronoun-fix/{focused,tsc,npm,canon,sync}.log`。本轮备份`before.tgz`；未做真机，没有commit/push。

本轮除上表外更新PROJECT-STATUS.md、PLANNING-ROUNDS.md及本文，builtin manifest由同步脚本派生更新。合规、其他角色的正确代词和既有改动保留。
