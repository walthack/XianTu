# 补充22 · RERUN4返修

范围：依据 REPORT-2026-10-06-rerun4.md。不提交/推送、不删文件、不碰端口、不重建8097、不改合规。状态目录、自由文本状态挂载和H1由模块策划负责，未修改其文件。

## 逐条处理与根因

1. 防守误判：识别输出预算1024含推理，且规则按目标id子串评分，使yield_guard被当作防守。识别预算提高为4096，保留后台主模型和现有关闭思考适配；M2.7仍可能产生推理，不能承诺其原生关闭。目标评分改为目标语义标签；停止抵抗/投降须明确肯定表达，排除否定、放刀后继续防守，模型错误选择也退回规则核对。位置：`src/services/moduleModelRuntime.ts:50`、`src/modules/sceneModule/host/recognize.ts:24`。后台API更低的输出上限仍会限制预算，未强改用户配置。
2. 南荒自由输入：自然意图模型入口仍局限白湖逃出前，南荒只有规则别名，故插入拍attemptCount为0，凝羽自己的话也无模型归档。扩大到已授权清羽试玩整个剧情链，保留world_sim边界；沿用主持归档、±15钳制、绝对值≥10大事、同拍一次回执。位置：`playtestNarrativeScope.ts` 的isScopedNaturalIntentSave；`naturalIntentRouter.ts:361`。不相关输入仍走普通回合记忆，不完成事件、不改好感；未实施另行排期的NPC记忆系统。夹具验证南荒情感拍模型归档和重复结算保护，凝羽真实模型表达覆盖仍待复测。
3. 练功/冲关：自由意图跳过预检，已有trainingRealm效果又未被确定性效果写回器消费，导致正文有进度、存档为0。练功类输入进入预检/确认，白名单写回境界效果；所需进度统一读game-numbers，不再乘当前级数，清理旧300口径。位置：`MainGamePanel.vue:2064`、`judgementPreflight.ts`、`judgementEngine.ts:552`、`levelProgression.ts:9`。确认一次写回测试已覆盖；模型不结算进度。
4. NPC显示：每回合同步按角色id/当前章读时点级数，未知显示不详、不拼未知初期；谢艺保持65章前隐藏，公开后通幽。位置：`runtime.ts:3832`、`RelationshipNetworkPanel.vue:1603`。不改时点级数表本身。
5. 开局真霓龙丝：目录存在不等于发放。stage_01初始化从道具总表取np012定义，写入背包一次。位置：`strictInitializer.ts:246`；无新增名词硬写，无改随机掉落。
6. F03实战与模拟差异：模拟选高推进动作，实战没有直接攻击目标且规则容易选牵制/武二郎接手；默认目标一直选第一组，打满后仍攻击同组。合同新增直接攻击目标，模型把直接斩杀归到接手目标时纠正；默认选未达终态的敌人，并把各组轨道发给识别模型。位置：`contracts/f03.json`、`host/recognize.ts:35,138`。自然20兑现玩家动作幅度，不自动整场胜利。夹具逐个斩杀能在13拍内获胜；F03数值不调，模拟43.60%。自然轻击仍可能比模拟优化策略慢；实际模型是否持续正确选目标待真机，不把模拟算成实战PASS。
7. 显示与一致性：简报/敌方占位符统一从总表解析，F03易虎不再错误附F05血虎实例；局势标签按标签+主体去重。support动作的级差比较取当前在场敌方，不依赖模型是否填自己，修F05 -4变0。位置：`host/refs.ts:22,31`、`brief.ts:54`、`plan.ts:275`、`contracts/f03.json`。DC12/16来自主张幅度附加成本，本身有规则依据，未强行统一；相同动作的级差比较已稳定。F04合同加入总表竹筒完整事实与破碎禁写，场面演出检查解析禁写占位符（`contracts/f04.json`、`host/narrate.ts`）；本轮未新增场面收束后普通自由回合的全背包语义核验，仍需真机检查。
8. tuning404：试玩入口未指定tuning或加载404均打一行未加载、使用内置数值及hash；H1成功路径不动。位置：`src/dev/combatTrial/main.ts:33`。本轮未重建，当前served包尚没有这条日志。

## 数值及验收

F05稳定级差后首次门禁胜率38.80%（低于40%而阻断），按既有授权只改合同defend baseDifficulty 12→11，2000局复算40.00%，未添加分摊/状态机制。其余同口径：F01 52.25%、F02 49.80%、F03 43.60%、F04 60.60%、F10 60.70%、F13 56.10%。

定向新增14/14通过。最终canon:build全绿（177.2秒），内含1618项：1613通过、0失败、5既有跳过；七场胜率门禁全部通过。当前tsc/npm test/build最终复核记录见末尾。日志：/tmp/supp22-final3-canon.log、/tmp/supp22-current-{tsc,test,build}.log。没有真实模型/浏览器新复测，不声明真机PASS。8097保持既有0a229a2f5976d591e428b396d263604b；第3阶段未开。

## 本轮文件

- src/components/dashboard/MainGamePanel.vue
- src/components/dashboard/RelationshipNetworkPanel.vue
- src/dev/combatTrial/main.ts
- src/modules/scenarioMods/levelProgression.ts
- src/modules/scenarioMods/naturalIntentRouter.ts
- src/modules/scenarioMods/playtestNarrativeScope.ts
- src/modules/scenarioMods/runtime.ts
- src/modules/scenarioMods/strictInitializer.ts
- src/modules/sceneModule/brief.ts
- src/modules/sceneModule/contracts/f03.json
- src/modules/sceneModule/contracts/f04.json
- src/modules/sceneModule/contracts/f05.json
- src/modules/sceneModule/host/narrate.ts
- src/modules/sceneModule/host/recognize.ts
- src/modules/sceneModule/host/refs.ts
- src/modules/sceneModule/plan.ts
- src/services/moduleModelRuntime.ts
- src/utils/judgementEngine.ts（只补境界效果消费，不动合规判定）
- src/utils/judgementPreflight.ts
- tests/moduleModelRuntime.test.mjs（识别预算对齐4096）
- tests/supplement19RealmCurrency.test.mjs（读配置的失败冲关保留进度口径）
- tests/supplement22Rerun4.test.mjs
- PROJECT-STATUS.md、docs/PLANNING-ROUNDS.md、本交接
- canon门禁自动刷新builtins/character-registry.json generatedAt

模块策划同时修改statuses.json、host/injuries.ts、types.ts、narrativeStateReconciler.ts及freeTextStatus相关新文件，未覆盖/回滚；整工作区门禁包含其当前改动，但不是本轮叙事策划交付文件。段强死亡记忆、巨蕈林夜色两项按交接留剧情策划，不动。

## 最终门禁收口

当前文件复核：tsc 0错；npm test 1618项（1613通过/0失败/5跳过）；build成功；canon:build成功（177.2秒，含同口径1613过/0败/5跳）；git diff --check通过。未重建8097，未做git写操作。

发布补记：用户随后授权提交推送，本轮纳入RERUN4-REPAIRS-PUBLISH；上文“不提交”保留为当时工作约束。8097仍不重建。
