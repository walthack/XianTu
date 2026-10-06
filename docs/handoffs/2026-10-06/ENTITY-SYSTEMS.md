# R02、统一三类总表与支线/情感拍扩展 · 2026-10-06

状态：实现收口，最终门禁全绿，新包待真机；不提交、不推送；第3阶段未开。前轮脏工作区保留，未改合规正文或受保护服务。备份 /tmp/xiantu-id-systems-backup-20261006-080757、/tmp/xiantu-catalog-backup-20261006-080932。

## 交付

1. R02：sceneModule/brief.ts 终态校验按明确主体与肯定谓词匹配。多主体、否定、引述、假设、歧义代词不硬拒；唯一行动对象的清楚代词仍校验。host/narrate 提供角色总表当前称呼。旧规则断言未放宽；新增语料覆盖多人同终态/否定/代词。
2. 总表：mod-kit/entity-catalog/items.json（310）、skills.json（143）、techniques.json（67）；index.json 是 kind/id/source/aliases 派生元索引，不复制现有角色、地点、称谓、状态和合同权威。stage-access.json 表达37关可得/揭示引用；builtins只发布id引用，加载/初始化/验证边界补完整定义。共112道具、20技能、6功法阶段变体无损保留；同名不同id不猜合并。
3. 本轮新增正式定义：lcq.item.demo_short_knife（旧演示短刀原定义移入）、lcq.item.zipper（旧规范拉链id补定义）、lcq.item.ajiman_bond（已有身契结算定义移入）；并非新编道具剧情。竹筒 lcq.item.crow_bamboo_tube 已属前轮，仍storyItem定向发放；身契、锦囊、霓龙丝标storyItem。普通掉落/拾取原流程保留。
4. 结构化硬名词：F10两个库存杠杆以 {{item:id}} 引用；武器磨损分类读总表type；旧演示短刀结构化记录带itemId、显示名读总表；身契/拉链名字与身契描述读总表。物价、伤情、骰种、F10胜利与搜刮不去重口径不变。
5. 支线/情感拍：mod-kit/quest-lines/lines.json 为唯一剧情源；resources.json 按id集中展示文字、意图、记忆模板、事实、好感档。schema/parser及引用校验接canon:build。统一投影为既有exploration事件/章节引用，沿用支线/人物任务UI，不增加第三条必做主线。
6. 完成只认自己的动作回执；prepare不完成，多步/可选步/多选一、closeWhen expired、组合门、原著章号门、真地点与作者场景卡在场/离场检查、npcKnowledge/itemGrant/setReceipt/setState/状态与现有结局id效果均有白名单。resolution挂现有endingId；角色结局类型仅保存提案元数据，不定新语义。状态按既有目录解除/持续时间，不造数值。
7. 选项好感、模板记忆、知情和路径回执同一次代码结算；按角色id写玩家关系，受个人cap与绝对范围约束；零档不加分、负档通道有测试；sharedExperience=suppress避免同一事件再加+3/+8。未重写整个旧好感系统或其全来源预算引擎。
8. 可选停留：碧鲮湾完成后保留藻丝窗口，主线按钮仍可继续，不强制做支线。明确离场照常记原旅程/日历；其他旅程关闭停留后，旧延迟路线不得倒放回起点。eventActive关闭条件按本地已到场的活跃事件解释，避免把“排队待前往叶媪村”误作已进山村。
9. 存档 entitySaveFormat=1：项目旧档明确拒绝，不做旧档迁移；独立外部mod不误拒。七检查点由新开档生产合同回放生成，游戏导出格式，非旧档注入。复测读入仍另建测试档。

## 补充7逐项数据核查

### a 霓龙丝：09:17用户定为穿越随身物，原错误判断撤销
relationships.ts确会把主角itemIds合进背包；用户补充10确认霓龙丝/尼龙丝本就是穿越随身物，所有原所有权保留。总表lcq.item.np012已注明来源，撤销“早持有债务”。第80章支线改发lcq.item.biling_algae_sample海藻丝样品（已正式入总表，storyItem），与霓龙丝不同，不重复发霓龙丝。

### b 乐明珠：已正确，不重复改
核查前/后均为当前工作区已纠正的光明观堂。源 character-cards-v3 staticProfile 为光明观堂小师妹，03b–06 phase身份为光明观堂弟子/潘金莲同门；registry相同。03b/04开场卡保留身份未揭的花苗新娘，04b/05/05b/06 role为光明观堂弟子。全仓可执行材料未找到“太乙真宗边缘分支弟子”。此前23号冲突第6条已处理，本轮仅核查，不重新打开合规字段。

### c 碧鲮女子
新增 lcq.character.biling_woman_ch80，源卡→registry；只记第80章议事拿来藻丝，女、碧鲮族、原文未点名。没有小津别名、没有推定同一人。关卡只引用optionalActorIds，加载边界读取这张时点最小卡，原40人基线断言不变；样板cast由作者数据维护，正文点名不建在场。

## 待确认 / 未冒称完成

- aff.w.small_neg：用户09:18定-3，第三选项已开放，好感/记忆同回执，重复动作不重复扣；原pending/null及建议-1均作废。记忆仅影响语气，不增加判定效果。
- 霓龙丝按09:17裁定保留穿越随身所有权，无待确认项；藻丝样品独立发放。
- E01/E03拆分已于09:13定方向：E03原id保留，E01拟用lcq.ending.death.baihu_beheading「第六个」；09:16已授权先做结构，直查id/来源别名/图表已接，正文仅TODO占位，旧图解绑、新图null，8097未部署。人物线结局类型未定；默认resolution endingId=null。其他阶段/战斗不扩，第3阶段不开。
- 同名技能/功法id不合并：例如生死根多id/多kind；“灵根.name”并非技能持有，不能机械换成某功法id。毒术天赋加成存在两个候选技能id，暂报而不猜；合同物理要素钢刀/弓弩等缺明确总表映射者列债务，不造剧情道具。
- 总表仍保存阶段差异；不是已完成全项目所有实体类别的定义归一。全来源好感预算、NPC两层记忆新系统仍未实施。

## 验证

定向113/113（收口前大组）；新增可选行旅窗口+行旅账17/17。tsc0；最终串行全量1550项、1545过/0败/5既有skip。canon首跑遇scenarioModStoryContext的Node25 IPC deserialize，单跑31/31；完整原样重跑全绿（66.0秒，1550项/1545过/0败/5跳过），未改断言或放宽门禁。日志 /tmp/id-systems-*；无真实模型或真人体验验收。

## 七检查点 / 读档

_newbot_tmp/combat-checkpoints/F01-before.json、F02-before.json、F04-before.json、F05-before.json、F03-before.json、F10-before.json、F13-before.json。
在游戏存档页导入上述json，选择对应“新档连续合同回放 · Fxx前”读档即可；不要导入 *.raw.json。均 entitySaveFormat=1、{type:'saves',saves:[…]}；回放中战斗用受控骰夹具，不声称真实模型通玩。

## 本轮文件清单

- `mod-kit/canon-authority-overlays/lcq.stage_03b_snake_flower_bridge.json`
- `mod-kit/canon-authority-overlays/lcq.stage_04.json`
- `mod-kit/canon-authority-overlays/lcq.stage_04b_lingfei_baiyi_crisis.json`
- `mod-kit/canon-authority-overlays/lcq.stage_05b.json`
- `mod-kit/canon-authority-overlays/lcq.stage_07_qingyuan_jiankang.json`
- `mod-kit/entity-catalog/index.json`
- `mod-kit/entity-catalog/items.json`
- `mod-kit/entity-catalog/skills.json`
- `mod-kit/entity-catalog/stage-access.json`
- `mod-kit/entity-catalog/techniques.json`
- `mod-kit/quest-lines/lines.json`
- `mod-kit/quest-lines/resources.json`
- `mod-kit/schema/xiantu.quest-lines.v1.schema.json`
- `mod-kit/schema/xiantu.scenario-mod.v1.schema.json`
- `scripts/build-character-registry.mjs`
- `scripts/build-entity-index.mjs`
- `scripts/canon-authority-overlay.mjs`
- `scripts/canon-build.mjs`
- `scripts/entity-catalog-projection.mjs`
- `scripts/quest-line-projection.mjs`
- `scripts/validate-entity-catalog.mjs`
- `scripts/validate-location-loot.mjs`
- `scripts/validate-quest-lines.mjs`
- `src/components/dashboard/RightSidebar.vue`
- `src/modules/scenarioMods/builtins/character-registry.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_01.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_02.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_03.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_03b_snake_flower_bridge.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_04.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_05.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_05b.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_06.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_07_qingyuan_jiankang.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_08_jiankang_coup.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_09_trade_and_escape.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_10_jiangzhou_shadow_war.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_11_lieshan_battle.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_12_jiangzhou_counterwar.json`
- `src/modules/scenarioMods/builtins/data/lyg.buddhist_conspiracy.json`
- `src/modules/scenarioMods/builtins/data/lyg.changgan_begins.json`
- `src/modules/scenarioMods/builtins/data/lyg.changgan_interlude.json`
- `src/modules/scenarioMods/builtins/data/lyg.dingtao_beijing.json`
- `src/modules/scenarioMods/builtins/data/lyg.ganlu_aftershock.json`
- `src/modules/scenarioMods/builtins/data/lyg.ganlu_bian.json`
- `src/modules/scenarioMods/builtins/data/lyg.han_succession.json`
- `src/modules/scenarioMods/builtins/data/lyg.liangzhou_league.json`
- `src/modules/scenarioMods/builtins/data/lyg.mijing_rumen.json`
- `src/modules/scenarioMods/builtins/data/lyg.shituolin_endgame.json`
- `src/modules/scenarioMods/builtins/data/lyg.shixiang_ambush.json`
- `src/modules/scenarioMods/builtins/data/lyl.han_palace_endgame.json`
- `src/modules/scenarioMods/builtins/data/lyl.jiangzhou_retreat.json`
- `src/modules/scenarioMods/builtins/data/lyl.lin_an_black_sea.json`
- `src/modules/scenarioMods/builtins/data/lyl.lin_an_bridge.json`
- `src/modules/scenarioMods/builtins/data/lyl.luoyang_cloud_secret.json`
- `src/modules/scenarioMods/builtins/data/lyl.luoyang_coup.json`
- `src/modules/scenarioMods/builtins/data/lyl.taiquan_afterfall.json`
- `src/modules/scenarioMods/builtins/data/lyl.taiquan_core_conflict.json`
- `src/modules/scenarioMods/builtins/data/lyl.taiquan_expedition.json`
- `src/modules/scenarioMods/builtins/data/lyl.taiquan_sacred_fruit.json`
- `src/modules/scenarioMods/builtins/data/lyl.xiaoyingzhou_blacksea_trap.json`
- `src/modules/scenarioMods/builtins/index.ts`
- `src/modules/scenarioMods/builtins/manifest.json`
- `src/modules/scenarioMods/entityCatalog.ts`
- `src/modules/scenarioMods/entitySaveFormat.ts`
- `src/modules/scenarioMods/expandInitializer.ts`
- `src/modules/scenarioMods/fastNarrativeDemoAdjudication.ts`
- `src/modules/scenarioMods/fixedInventoryContracts.ts`
- `src/modules/scenarioMods/questLineContext.ts`
- `src/modules/scenarioMods/questLineView.ts`
- `src/modules/scenarioMods/questLines.ts`
- `src/modules/scenarioMods/runtime.ts`
- `src/modules/scenarioMods/schema/content.ts`
- `src/modules/scenarioMods/storyContext.ts`
- `src/modules/scenarioMods/strictInitializer.ts`
- `src/modules/scenarioMods/travel/travelLedger.ts`
- `src/modules/scenarioMods/validator.ts`
- `src/modules/sceneModule/brief.ts`
- `src/modules/sceneModule/contracts/f10.json`
- `src/modules/sceneModule/contracts/registry.ts`
- `src/modules/sceneModule/host/loot.ts`
- `src/modules/sceneModule/host/narrate.ts`
- `src/stores/characterStore.ts`
- `src/stores/gameStateStore.ts`
- `tests/entityCatalog.test.mjs`
- `tests/processGmResponseAbortAtomicity.test.mjs`
- `tests/questLineSamples.test.mjs`
- `tests/questLines.test.mjs`
- `tests/sceneCombatLoot.test.mjs`
- `tests/sceneNarrationSubjects.test.mjs`
- `tests/sceneStage2.test.mjs`

源卡与裁定簿（既有ignored生产源，未强加git）：mod-kit/generated/deepseek-v4-flash/character-canon/character-cards-v3.json、CANON-DECISIONS.md。盘点追加 _newbot_tmp/id-audit-2026-10-06.md，完整AST候选 catalog-hardwrites-2026-10-06.json；旧盘点原文保留。这里只标三类字符串候选，不把UI“背包”或语义识别/展示当作机械替换目标。

## 8097最终交付

已重建，LAN `http://192.168.50.51:8097/combat-trial.js` 与磁盘包MD5均为 `c01331bf004d3ae78d70ac925acd5393`。包含第2阶段与本轮实体/支线接入；静态服务未重启，受保护服务未动。build日志 `/tmp/id-systems-8097-build.log`。manifest `4ded0531503f`。无真实模型/玩家测试，本包只声明门禁与部署核验通过。完整改动清单见上；本轮不提交、不推送，第3阶段未开。
