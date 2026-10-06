# 补充8–11：E01结构拆分、随身霓龙丝及乐明珠选项

2026-10-06；用户09:13–09:18授权。只本地改动，不提交/推送，不重建8097。原工作区全部保留。

## E01/E03

- stage_02及来源overlay的scenario.events.to：拒赌endingId改lcq.ending.death.baihu_beheading，title「第六个」，facts为苏妲己不信产地、凝羽画外一刀了结、赌局未开/卖身契未签。历史动作refuse_gamble_take_paolao保留，runtime相邻注释注明历史名。
- fixedEndingNarratives.ts：所有固定正文按endingId直接查；E01只用用户情境作临时占位，标TODO等剧情定稿，不自行扩写。E03原id/正文不变。
- endingPresentation.ts：canonicalEndingId只对paolao+ningyu_enters_gamble这对旧E01映射。E03及其他来源不迁移。migrateLegacyE01Ending在读档与advance接入，更新终局id/title、清旧图；不重写历史正文，也不豁免新档格式要求。
- mod-kit/ending-images.qingyu.json：新增byEndingId权威绑定，E01新id为null，旧E01快捷键也null；旧四张炮烙图文件未删、未替换。E03仍E03.jpg。其他配图按原映射。
- runtime E03事实文字“依约执行炮烙→下令执行炮烙”兼容保留：原合同仍含此旧措辞，此处不是E01映射特例，删除会改变E03既有结果。
- 裁定簿追加#201，替代#165“复用结局id”口径，历史原条不删。合规文档E01-C1～C3原样登记；未改原著与合规实现。

## 补充10：霓龙丝

用户定霓龙丝/尼龙丝为穿越随身物。总表lcq.item.np012 description注明来源，增加尼龙丝别名；保留全部初始所有权、阶段itemIds，撤销前轮“时序错误”判断（裁定#202覆盖#200该句）。

碧鲮支线原错误引用np012现改lcq.item.biling_algae_sample「碧鲮海藻丝样品」。正式登记总表storyItem、04b可得引用，支线只引用新id；知情条目subjectId同步。支线发海藻丝，不重复发霓龙丝。道具310、技能143、功法67、索引3214。

## 补充11：乐明珠第三选项

resources.json aff.w.small_neg=-3；原通用通道自动开放第三选项，无额外机制。角色id好感40→37、模板记忆与同一动作回执一次写；重复动作不再扣分/加记忆，advance不叠加通用完成分。记忆小票只影响语气，未接判定加成或修改世界事实。裁定#203解除原待定。

## 本轮文件

- mod-kit/canon-authority-overlays/lcq.stage_02.json
- src/modules/scenarioMods/builtins/data/lcq.stage_02.json
- src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json
- src/modules/scenarioMods/fixedEndingNarratives.ts
- src/modules/scenarioMods/endingPresentation.ts
- src/modules/scenarioMods/runtime.ts
- src/stores/gameStateStore.ts
- mod-kit/ending-images.qingyu.json
- mod-kit/entity-catalog/items.json、stage-access.json、index.json
- mod-kit/quest-lines/lines.json、resources.json
- tests/baihuGambleRefusal.test.mjs：仅更新拒赌新id断言与相邻注释
- tests/e01EndingSplit.test.mjs：新增直查/旧档来源别名/图解绑/两类丝分离
- tests/questLineSamples.test.mjs：负档改测正式-3并加重复动作断言；奖励样品id对齐
- tests/entityCatalog.test.mjs：新增正式物品后总数310
- PROJECT-STATUS.md、docs/PLANNING-ROUNDS.md、docs/handoffs/2026-10-06/ENTITY-SYSTEMS.md、本文件
- docs/COMPLIANCE-REQUIREMENTS.md：补充8原样登记，原有内容未动
- ignored生产源CANON-DECISIONS.md：#201–203；未强加git
- canon门禁生成registry/manifest及统一索引，生成副作用保留

## 验证与部署

定向59/59，tsc0；串行全量1553项1548过/0败/5既有skip；canon门禁已绿63.5秒。日志/tmp/e01-{focused-final,tsc,full,canon}.log。diff检查通过。无新包真机验收。

**8097未重建**，磁盘仍c01331bf004d3ae78d70ac925acd5393，供第2阶段测试。工作区新增范围仅E01拆分结构、合规登记与两条用户样板裁定，未改第2阶段四场合同/胜负/接线；这些新增尚未进入测试包。等协调方明确通知后才重建，避免混包。

## 待交剧情

E01正式正文、新图；现占位和null不视为最终内容。E01/E03方向不再列待定；霓龙丝所有权与第三选项数值也已闭环。人物结局类型等此前待定仍未代定。第3阶段未开。

后续补充12–16及真机返修已继续在同一工作区落地，当前范围和最新门禁见[返修交接](STAGE2-TRUE-DEVICE-REPAIRS.md)。本文件前述仅E01范围的包说明是历史范围；当前8097仍不重建。
