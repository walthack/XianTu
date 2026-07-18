# R2-9 数据治理审计（可复跑）

> 生成命令：`node scripts/audit-r2-9-data-governance.mjs`。这是风险定位报告，不自动覆盖人工正典。

## 汇总

- 扫描人物实例：1616
- notes 含未来时态/章节词的门控候选：10（候选不等于实锤；需逐条按 stage 时间确认）
- 低阶身份×高修仙境界异常：13
- R2-9 新增世界引力合同：22
- 年龄：沿用 P0 的寿元 clamp、孩童绝对年龄优先与新档 0 负岁门禁；本审计不重复改出生年。
- 境界显示：`realmUtils.ts` 已在右栏和主提示词使用六朝高手榜词表；底层存档仍保留修仙等级用于排序。

## 风险样本

|级别|类型|文件|人物|样本|
|---|---|---|---|---|
|P2|notes时间门控候选|qingyu/stages/lcq.stage_03b_snake_flower_bridge.json|阿夕|【身体】处女（第58章破处）；初次性爱主动套上；蜜穴娇嫩；粉臀小巧|
|P1|role×境界异常|qingyu/stages/lcq.stage_03b_snake_flower_bridge.json|巫嬷嬷|仆妇（西门庆手下） / 元婴|
|P2|notes时间门控候选|qingyu/stages/lcq.stage_04b_lingfei_baiyi_crisis.json|阿夕|【身体】处女（第58章破处）；初次性爱主动套上；蜜穴娇嫩；粉臀小巧|
|P1|role×境界异常|qingyu/stages/lcq.stage_04b_lingfei_baiyi_crisis.json|巫嬷嬷|仆妇（西门庆手下） / 元婴|
|P2|notes时间门控候选|qingyu/stages/lcq.stage_05.json|阿夕|【身体】处女（第58章破处）；初次性爱主动套上；蜜穴娇嫩；粉臀小巧|
|P2|notes时间门控候选|qingyu/stages/lcq.stage_05b.json|阿夕|【身体】处女（第58章破处）；初次性爱主动套上；蜜穴娇嫩；粉臀小巧|
|P1|role×境界异常|qingyu/stages/lcq.stage_05b.json|巫嬷嬷|仆妇（西门庆手下） / 元婴|
|P1|role×境界异常|qingyu/stages/lcq.stage_06.json|巫嬷嬷|仆妇（西门庆手下） / 元婴|
|P2|notes时间门控候选|qingyu/stages/lcq.stage_07_qingyuan_jiankang.json|阿夕|【身体】处女（第58章破处）；初次性爱主动套上；蜜穴娇嫩；粉臀小巧|
|P1|role×境界异常|qingyu/stages/lcq.stage_07_qingyuan_jiankang.json|巫嬷嬷|仆妇（西门庆手下） / 元婴|
|P2|notes时间门控候选|qingyu/stages/lcq.stage_08_jiankang_coup.json|阿夕|【身体】处女（第58章破处）；初次性爱主动套上；蜜穴娇嫩；粉臀小巧|
|P1|role×境界异常|qingyu/stages/lcq.stage_08_jiankang_coup.json|巫嬷嬷|仆妇（西门庆手下） / 元婴|
|P2|notes时间门控候选|qingyu/stages/lcq.stage_09_trade_and_escape.json|阿夕|【身体】处女（第58章破处）；初次性爱主动套上；蜜穴娇嫩；粉臀小巧|
|P1|role×境界异常|qingyu/stages/lcq.stage_09_trade_and_escape.json|巫嬷嬷|仆妇（西门庆手下） / 元婴|
|P2|notes时间门控候选|qingyu/stages/lcq.stage_10_jiangzhou_shadow_war.json|阿夕|【身体】处女（第58章破处）；初次性爱主动套上；蜜穴娇嫩；粉臀小巧|
|P1|role×境界异常|qingyu/stages/lcq.stage_10_jiangzhou_shadow_war.json|巫嬷嬷|仆妇（西门庆手下） / 元婴|
|P2|notes时间门控候选|qingyu/stages/lcq.stage_11_lieshan_battle.json|阿夕|【身体】处女（第58章破处）；初次性爱主动套上；蜜穴娇嫩；粉臀小巧|
|P1|role×境界异常|qingyu/stages/lcq.stage_11_lieshan_battle.json|巫嬷嬷|仆妇（西门庆手下） / 元婴|
|P2|notes时间门控候选|qingyu/stages/lcq.stage_12_jiangzhou_counterwar.json|阿夕|【身体】处女（第58章破处）；初次性爱主动套上；蜜穴娇嫩；粉臀小巧|
|P1|role×境界异常|qingyu/stages/lcq.stage_12_jiangzhou_counterwar.json|巫嬷嬷|仆妇（西门庆手下） / 元婴|
|P1|role×境界异常|yunlong/stages/lyl.lin_an_black_sea.json|金兀术|仆从 / 元婴|
|P1|role×境界异常|yunlong/stages/lyl.lin_an_black_sea.json|豹子头|仆从 / 元婴|
|P1|role×境界异常|yunlong/stages/lyl.taiquan_expedition.json|巫嬷嬷|仆妇（西门庆手下） / 元婴|

## 处置口径

- P1 role×境界异常必须先核原文/高手榜再改，不允许脚本按身份词直接降级。
- P2 notes 候选按关卡 `axisSeqLo/axisSeqHi` 做逐条门控；含“随后/后来”但描述已发生回忆者不得误删。
- 每批数据修复先复制到 `stages-pre-*-backup`，修后以该备份链 diff 界定审计范围。
- AFF_PROTECTED / AGE_PROTECTED / DEBUT_PROTECTED / USER_CANON 继续只读。
