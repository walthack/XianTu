# 补充19 / 20 交接（1812RESUME）

范围：境界、难度、数值配置、灵石资产删除、苏妲己金铢、合同胜率与归关/六人资料。未提交推送、未重建8097、未操作端口、未删文件。状态目录、13处状态识别、registry热改/tuning.json归模块策划，本轮未修改；之前工作区的共有改动保留。

## 补充19

- 数值权威：`mod-kit/game-numbers.qingyu.json`；级名权威：`mod-kit/entity-catalog/levels.json`。一级差±4，两级以上±12；六司、幸运、小阶段、DC基线、门槛、练功进度、难度默认、货币比值都从数值配置读取。核心入口`src/modules/sceneModule/numbers.ts`。
- H1接口：`applyGameNumbers(patch)`校验后合并，保持嵌套引用。模块策划的加载器可调用它接入配置；本轮没有改其registry/tuning.json，**不声称H1加载器已经接通本JSON**。热改接线需模块策划确认。
- 原著0–9级，初期/中期/后期；删除圆满/极境和旧修仙升阶指令。存档难度设置独立；标准默认自动抬级、练功上限原著级。练功/冲关由代码回执结算，模型不能写境界。保留旧模块文件但不再使用旧表。
- 谢艺第六级通幽；其他卡原著级数没有证据时明确null，不能由练气/化神等旧名字换算。未来剧情策划填逐时点级数及剧情升级步骤后，自动抬级、练功上限才有完整原著依据。
- 铢系唯一钱包：1金=20银=2000铜；清掉灵石钱包/兑换/主动生成字段，原著物品五灵石保留。苏妲己60金收入/50金支出不变，金价值度取统一权威2000（旧“0.1”是旧基准换算，不沿用）；`runtime.ts`3726附近。
- F01仍固定3拍，剑手只看守无法行动的武二郎，正面攻击为斧手/弓手，数值无需调。F02数值不变。
- F04原四格轨道改三格/ceiling2，攻击DC12→11。
- F05改撑过2拍：clock2/beatAtLeast3（引擎收束时序）；四个敌方攻击DC12→5，无分摊机制、血虎保底保留。
- F03旧4拍在当前人头胜利规则下参考策略胜率0%，仅clock4→13；第1/3/4拍出场事实不变，未另加机制。F03-entry完全未调、免门槛。
- F10/F13按主角3级模拟，不调合同DC等数值。
- F13通用先输后赢：`src/modules/sceneModule/scene.ts:171`的isWon先排除isLost，确认/敌方出手后亦先判输（410/441附近）。合同败局含主角倒下/失守满/原同伴条件；无败局且守口满才能赢；W48轻档保留。

### 模拟（同一新级差、同一策略/种子，调整前后各场2000局）

| 合同 | 调整前 | 调整后 |
|---|---:|---:|
| combat.f01.iron_bridge | 66.85% | 66.85% |
| combat.f02.snake_assault | 82.55% | 82.55% |
| combat.f03.mountain_stream_fog | 0.00% | 43.60% |
| combat.f04.crow_man | 26.90% | 60.60% |
| combat.f05.dungeon_trap | 4.90% | 47.75% |
| combat.f10.ghost_king_clash | 42.20% | 42.20% |
| combat.f13.ghost_king_final | 56.10% | 56.10% |

模拟器通过registry的角色id对应源卡读取已核定级数（谢艺6），未知角色才同级兜底。最终无低于40%的必经场；F02高于75%警告，遵从“不动”保留。F03-entry未纳门槛。

证据：`/tmp/supp19-before-known.json`、`/tmp/supp19-final-rates-known.json`，脚本`validate-required-combat-winrate.mjs`接入canon:build。参考策略不偷看骰：合法行动选择期望轨道进度；F01/F05参考防守。**多数人物/敌人时点级数仍缺，模拟按同级兜底，不能等同于完整原著级数或真人胜率。**后续补级数须重跑门槛。

数值口径待后续确认：六司±2+幸运±1+后期+2理论合计5，可能大于新一级差4；按用户最新独立数值保留，没有自行加总钳制。

## 补充20

- `mod-kit/canon-authority-overlays/lcq.stage_05.json`新增5个insertKeys的supersededBy注记，带04b的stageId/eventId；manifest登记第11份overlay。套用幂等、严格drift检查保留。
- 作废历史副本：s05_01、02、08、05、09分别指向haishen_hall_merfolk、pull_harpoon_lemingzhu、ruins_ghost_warriors、wuerlang_slays_dagu、yiyang_repels_yinsha。
- 05仍17事件，前置/flag/ID不删，s05_10仍依赖s05_09；LYL同名事件未动。默认方案R主线走04b→05b，05为隔离历史关；显式IF入口并未因此删除，注记不阻断IF本身。
- 当前04b已56–86章且五拍已上rail，无需重复挂章。
- 达古82–83章：鬼王峒巫师；蛇傀78–80章：阁罗随从；黑舌78–80章：阁罗随从/鬼王峒的人，不写94章真正死因；石刚31–73章：白湖商馆护卫，73后失踪离场；小魏34–118章白湖商馆护卫/弩手，119离队、130后续存在不写当前演出；卡瓦40–108章花苗汉子。源卡、阶段卡、registry统一。
- presenceWindow仅出退场章窗和来源；未来退出事实存作者私有privateLifecycle，不投影给模型。presence.ts按章节屏蔽离场人物，石刚不在73章以后继续随队。

## 验收

定向46/46；tsc --noEmit 0错误；npm test 1581项1576过/0败/5跳；生产build通过；canon:build全绿178.8秒（内含同一1581项，必经战门槛110.4秒，37关schema、实体/地点/主轴门禁通过）。git diff --check通过。首次生产构建发现InventoryPanel空赋值，已修复，二次构建通过。真人未测，8097仍c01331bf004d3ae78d70ac925acd5393。

日志：/tmp/supp19-target-final.log、/tmp/supp19-tsc-final.log、/tmp/supp19-full5.log、/tmp/supp19-build2.log、/tmp/supp19-canon-final.log。

## 文件清单（与补充19前备份比较；包含构建产物）

以下含37关产物及先前19范围的清理。状态组共有文件不列为本轮接手改动。

- `src/types/game.d.ts`
- `src/composables/useGameData.ts`
- `src/stores/gameStateStore.ts`
- `src/utils/dataValidation.ts`
- `src/utils/cultivationSpeedCalculator.ts`
- `src/utils/commandValidator.ts`
- `src/utils/judgementEngine.ts`
- `src/utils/judgementPreflight.ts`
- `src/utils/dataRepair.ts`
- `src/utils/currencySystem.ts`
- `src/utils/realmUtils.ts`
- `src/data/realms.ts`
- `src/data/specialNpcs.ts`
- `src/services/initialization/characterInitialization.ts`
- `src/services/initialization/offlineInitialization.ts`
- `src/services/prompts/defaultPrompts.ts`
- `src/modules/sceneModule/tiers.ts`
- `src/modules/sceneModule/enemy.ts`
- `src/modules/sceneModule/levels.ts`
- `src/modules/sceneModule/types.ts`
- `src/modules/sceneModule/numbers.ts`
- `src/modules/sceneModule/scene.ts`
- `src/modules/sceneModule/brief.ts`
- `src/modules/sceneModule/plan.ts`
- `src/modules/scenarioMods/strictInitializer.ts`
- `src/modules/scenarioMods/relationships.ts`
- `src/modules/scenarioMods/modularTurn.ts`
- `src/modules/scenarioMods/fixedEndingNarratives.ts`
- `src/modules/scenarioMods/levelProgression.ts`
- `src/modules/scenarioMods/runtime.ts`
- `src/modules/scenarioMods/presence.ts`
- `src/modules/scenarioMods/validator.ts`
- `src/modules/scenarioMods/builtins/character-registry.json`
- `src/modules/scenarioMods/builtins/manifest.json`
- `src/modules/scenarioMods/schema/scenario.ts`
- `src/modules/scenarioMods/schema/canon.ts`
- `src/modules/scenarioMods/builtins/data/lyl.luoyang_coup.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_08_jiankang_coup.json`
- `src/modules/scenarioMods/builtins/data/lyl.jiangzhou_retreat.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_10_jiangzhou_shadow_war.json`
- `src/modules/scenarioMods/builtins/data/lyl.taiquan_sacred_fruit.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_05b.json`
- `src/modules/scenarioMods/builtins/data/lyl.taiquan_afterfall.json`
- `src/modules/scenarioMods/builtins/data/lyg.han_succession.json`
- `src/modules/scenarioMods/builtins/data/lyl.xiaoyingzhou_blacksea_trap.json`
- `src/modules/scenarioMods/builtins/data/lyg.shituolin_endgame.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_01.json`
- `src/modules/scenarioMods/builtins/data/lyl.lin_an_black_sea.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_09_trade_and_escape.json`
- `src/modules/scenarioMods/builtins/data/lyl.taiquan_core_conflict.json`
- `src/modules/scenarioMods/builtins/data/lyg.changgan_interlude.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json`
- `src/modules/scenarioMods/builtins/data/lyl.taiquan_expedition.json`
- `src/modules/scenarioMods/builtins/data/lyg.dingtao_beijing.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_12_jiangzhou_counterwar.json`
- `src/modules/scenarioMods/builtins/data/lyg.buddhist_conspiracy.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_02.json`
- `src/modules/scenarioMods/builtins/data/lyl.luoyang_cloud_secret.json`
- `src/modules/scenarioMods/builtins/data/lyl.han_palace_endgame.json`
- `src/modules/scenarioMods/builtins/data/lyg.ganlu_aftershock.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json`
- `src/modules/scenarioMods/builtins/data/lyl.lin_an_bridge.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_05.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_11_lieshan_battle.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_04.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_03b_snake_flower_bridge.json`
- `src/modules/scenarioMods/builtins/data/lyg.changgan_begins.json`
- `src/modules/scenarioMods/builtins/data/lyg.mijing_rumen.json`
- `src/modules/scenarioMods/builtins/data/lyg.liangzhou_league.json`
- `src/modules/sceneModule/host/factors.ts`
- `src/modules/sceneModule/host/controller.ts`
- `src/modules/sceneModule/contracts/f01.json`
- `src/modules/sceneModule/contracts/f04.json`
- `src/modules/sceneModule/contracts/f05.json`
- `src/modules/sceneModule/contracts/f13.json`
- `src/modules/sceneModule/contracts/f03.json`
- `src/dev/combatTrial/f03Scenario.ts`
- `src/dev/combatTrial/main.ts`
- `src/components/dashboard/MainGamePanel.vue`
- `src/components/dashboard/SectPanel.vue`
- `src/components/dashboard/RelationshipNetworkPanel.vue`
- `src/components/dashboard/CharacterDetailsPanel.vue`
- `src/components/dashboard/GameMapPanel.vue`
- `src/components/dashboard/InventoryPanel.vue`
- `src/components/dashboard/UnmappedLocationsPanel.vue`
- `src/components/dashboard/SettingsPanel.vue`
- `src/components/common/FormattedText.vue`
- `src/components/dashboard/components/SectTasksContent.vue`
- `src/components/dashboard/components/SectManagementContent.vue`
- `src/components/dashboard/components/GameVariableFormatGuideModal.vue`
- `src/utils/prompts/tasks/characterInitializationPrompts.ts`
- `src/utils/prompts/cot/cotCore.ts`
- `src/utils/prompts/definitions/worldStandards.ts`
- `src/utils/prompts/definitions/npcRelationRules.ts`
- `src/utils/prompts/definitions/businessRules.ts`
- `src/utils/prompts/definitions/dataDefinitions.ts`
- `scripts/sync-builtin-mods.mjs`
- `scripts/apply-character-cards-v3-to-mod.mjs`
- `scripts/build-character-registry.mjs`
- `scripts/canon-build.mjs`
- `scripts/build-entity-index.mjs`
- `scripts/validate-required-combat-winrate.mjs`
- `mod-kit/entity-catalog/enemies.json`
- `mod-kit/entity-catalog/currencies.json`
- `mod-kit/entity-catalog/index.json`
- `mod-kit/entity-catalog/levels.json`
- `mod-kit/canon-authority-overlays/lcq.stage_05b.json`
- `mod-kit/canon-authority-overlays/lcq.stage_04b_lingfei_baiyi_crisis.json`
- `mod-kit/canon-authority-overlays/manifest.json`
- `mod-kit/canon-authority-overlays/lcq.stage_02.json`
- `mod-kit/canon-authority-overlays/lcq.stage_05.json`
- `mod-kit/canon-authority-overlays/lcq.stage_04.json`
- `mod-kit/canon-authority-overlays/lcq.stage_03b_snake_flower_bridge.json`
- `mod-kit/game-numbers.qingyu.json`
- `mod-kit/generated/deepseek-v4-flash/character-canon/character-cards-v3.json`
- `mod-kit/generated/deepseek-v4-flash/character-canon/CANON-DECISIONS.md`（#208/#209）
- 37关generated源（忽略文件；只供构建，不强制加入Git）
- `tests/supplement19RealmCurrency.test.mjs`
- 已有测试口径同步：realmDisplayName、batch6NarrativeCorrections、sceneModuleIsolation、judgementPreflight、sceneStage2、sceneHostWiring、canonAuthorityOverlay、sceneCommonCapabilities、syncBuiltinModsSafety、r2_11n_luoyang_coup_character_projection（只允许null级数元数据，未来信息禁写断言保留）

补充20直接文件：五份清羽overlay、05新overlay/manifest、六人源卡、presence.ts、canon schema、两份投影/registry脚本与相应builtins。其余为补充19范围及构建产物；这是与补充19前快照比较的累计清单，不把模块策划接手的状态/H1变更算作本轮新改。

边界：合规文本不改；不回退模块策划状态/H1工作；不部署；NAS镜像未同步（本轮无提交，仅工作区交付）。
