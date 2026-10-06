# 补充21 · 南荒人物时点级数

日期：2026-10-06；执行：Codex；依据：`_newbot_tmp/2026-10-06-南荒人物武功级数表.csv`及同名说明。成熟度：代码、引用校验与可复现模拟通过，尚未真机；未提交、推送或重建8097。状态目录与H1热改由模块策划负责，本轮未编辑其文件。

## 数据与身份

权威表：`mod-kit/entity-catalog/character-levels.qingyu.json`。录入66行、44个实体，按id＋章窗＋变体解析；保留出处、原时点文字与置信度。CSV实际12行NA（说明稿统计为9），按CSV逐行保留null，不转换为0。7行低置信占位：小紫、阁罗、殇侯、萨安、生前易虎、黑纱女子、驾驭虎煞的丹宸；不视为已确证设定。

14个待建中复用9项，新增5个敌人/匿名场面实体id：`lcq.enemy.f01_swordsman`、`lcq.enemy.f01_axeman`、`lcq.enemy.f01_archer`、`lcq.enemy.f01_veiled_woman`、`lcq.enemy.male_corpse`，登记在既有enemies.json；未另建角色总表。普通/精英鬼武士复用guiwang_warrior，以variant区分。黑纱女子不绑定未揭实名。

娄蒙选`lcq.character.nanhuang_loumeng`（迁移前计数：新2／旧1），樨夫人选`lcq.character.nanhuang_xi_furen`（新14／旧4）；计数范围为src与canon overlay、实体/账本源，不含派生registry/index。原`canon.character.81be8593ee`及`canon.character.15b71fd1c8`保留idAliases；角色卡源、registry构建、resolver、账本身份与统一索引同步消费别名。

## 开打与场中快照

characterLevels.ts解析时点；host/factors.ts按合同levelContext生成最小级数快照和来源标识。时点/条件不变则复用快照，变化时重新投影；NA但有原著当量的怪物可记录effectiveLevel，没有当量的不编数字。未把整张未来级数表发给模型。

- F01第30章：剑手4级只盯武二郎，不作为主角正面敌方；斧手、弓手各自行动。固定3拍保留。
- F02第37章：主角独战重伤蛇彝男子，凝羽只在收束剧情入场；本轮未调F02数值。
- F10鬼巫王原级6，第97章施展六成用当量4；主角原级2＋当时死气当量3。丹宸失去虎煞后按条件降为当量2，不是全场2级。
- F13第109章开打，合同第2拍映射第110章，武二郎/凝羽退场为无力再战，未记为死亡；赢挂yin.sha_arm轻档仍保留。这个“第2拍对应第110章”的节奏映射需剧情/真机复核，不宣称原著给定拍号。
- 乐明珠第57章后4级，F11起读同一时点记录；F11正式宿主尚未接。武二郎113–114章源表缺值，不擅自补章窗。

## 胜率与调整

标准难度，原著时点级数，固定种子，每场2000局。模型自由策略未参与模拟，结果不能替代真机平衡验收。

| 场次 | 真实级数、调数前 | 调数后 |
|---|---:|---:|
| F01 | 2.20% | 56.45% |
| F02 | 49.80% | 49.80% |
| F03 | 1.30% | 43.60% |
| F04 | 18.40% | 60.60% |
| F05 | 3.15% | 44.00% |
| F10 | 10.10% | 60.70% |
| F13 | 56.10% | 56.10% |

F02此前83%基于旧级数口径；此次真实级数重算为49.80%，没有为追门槛改F02。F03-entry免门槛且未调；F06–F09/F11/F12/F14尚未正式接入，不冒报胜率。

调整仅在合同数值：F01斧/弓出手DC12→3/5；F03主要推进目标DC减4、三项敌方DC12→8（clock13不变）；F04推进DC11→7、敌方12→8（3格/ceiling2不变）；F05四项敌方DC5→1，并给血虎出手截止拍1（撑满2拍不变；这是出手频率数值调整，未做分摊机制）；F10推进目标DC减4（读势/暴露目标不变）、丹宸14→10、鬼巫王16→12、斧15→11、骨虎爪15不变。F13不调数值。

数值仍来自game-numbers.qingyu.json或合同JSON。级数事实来自时点表；代码不硬编码人物级数。旧simulation.playerLevels字段已不参与本模拟/快照，不作为第二权威。

## 门禁

- 时点表引用校验：66行／12 NA／7低置信，0错误。
- 定向58/58（supplement21CharacterLevels、sceneStage2等四文件）。
- tsc --noEmit：0错误。
- npm test：1594项，1589通过／0失败／5既有skip；并行模块工作也增加了测试，数量非本轮独占。
- npm run build：webpack成功。
- canon:build：全绿176.0秒，包含时点级数引用校验、七场胜率门禁与全量单测。
- git diff --check：通过。

日志：/tmp/supp21-tsc-final.log、supp21-target-final.log、supp21-full-final.log、supp21-build-final.log、supp21-canon-final.log；模拟完整回执/tmp/supp21-rates-final.json。当前8097仍c01331bf004d3ae78d70ac925acd5393，未换包；不把门禁PASS当真机PASS。

## 本轮文件

新增：entity-catalog/character-levels.qingyu.json、scenarioMods/characterLevels.ts、scripts/validate-character-levels.mjs、tests/supplement21CharacterLevels.test.mjs及本交接。

修改：entity-catalog/enemies.json/index.json、entity-ledger/overrides.json；character-cards-v3源与裁定簿#210；scripts/build-character-registry.mjs、build-entity-index.mjs、validate-required-combat-winrate.mjs、canon-build.mjs；scenarioMods/levelProgression.ts、characterResolver.ts、namedEntities.ts、ledger/affinityIdentity.ts；sceneModule/host/factors.ts、host/controller.ts、types.ts、levels.ts；contracts/f01/f02/f03/f04/f05/f03-entry/f10/f13/f14.draft.json；tests/sceneStage2.test.mjs；PROJECT-STATUS与PLANNING-ROUNDS。registry/manifest由门禁再生成。工作区其他已有或模块策划并行改动均保留，不列为本轮成果。

下一步：模块策划H1/状态工作结束并获合包通知后再部署；复核低置信7行、F13章拍映射、真实自由策略平衡；第3阶段仍未开。合规字段未改。
