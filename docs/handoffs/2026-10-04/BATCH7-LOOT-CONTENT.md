# 第七批：南荒搜刮内容交付（2026-10-04）

状态：READY_FOR_RETEST；未commit/push，保留之前全部未提交改动及战斗原型。
备份：`/Users/clawbot/Desktop/xiantu-batch7-backup-20261004-080159/pre-change.tgz`。

## 内容与审核决定

- 依据：`~/Desktop/narrative/15-南荒搜刮清单.md`、`15-location-loot.nanhuang.draft.json`；本次不修改仓库外稿件。
- 合并15个规范地点、115条目。原81地点结构保留，15个ready、66个pending。递归去掉所有下划线说明字段，不将引用章节／拟定价格／效果说明交给运行时。
- 60种新普通物品以现有id/name/description/type/grade登记：03b新增23（共46）、04新增23（共29）、04b新增28（共51）、05b新增23（共47）；同一物品跨关定义一致。四关tracked overlay追加content.items的幂等插入，再定向重建镜像。没有只改builtin，也没有改37关生成器。
- 本批不加售价或效果字段，只保留外观／用途描述；不实现售卖、回血、驱蛇、照明时长或装备加成。稀有物估价超过80铜铢不等于直接货币掉落；直接普通地点货币仍封顶80铜铢。
- 深井祭台改ready+空数组；玩家得到“没有找到可带走的东西”，计入每地3次，不再报尚未配置。
- 审核补3个前置：`temple.bronze`、`temple.snake_horn`、`temple.scale_pouch`须完成`lcq.event.haishen_hall_merfolk`。依据15稿第74章铜盾破碎／海蛇尸体来源，避免战前取得战后物。其余概率、数量、权重、once和事件前置照稿。
- 本表没有随机剧情关键道具；身契／墨镜／朱虎冠等既有合同授权与防重保持不变。空白地点不补编内容。

## 跨关前置与旧档

真实切关会清空当前关completedEventIds，但既有行旅账doneEventIds累积并跨关携带。`locationLoot.ts`现在读两者并集；不把历史事件灌回当前rail，也不额外迁移阶段进度。覆盖03b→04真实切关夹具及历史条件掉落。旧档无行旅历史时仍读当前已完成事件，缺失的过去事实不猜测、不自动解锁；若已丢失历史，须提供实际旧档再制定兼容。

## 校验与自测

- 新只读脚本：`node scripts/validate-location-loot.mjs`，81地点／15 ready／115条目，失败0。检查规范id、关卡登记、事件前置引用、状态、字段白名单、数量、权重、概率、货币上限和重复条目。按剧情声明的四关搜刮范围校验，不把全图提前可见当作已可搜刮。不改canon:build流水线。
- 串行定向8文件 **83/83通过，0失败、0skip**：locationLoot 7、locationLootContent 4、canonAuthorityOverlay 11、nanhuangTravelLedger 10、scenarioInventoryTransactions 12、nanhuangSceneLedger 7、run4FollowupRepairs 29、batch6NarrativeCorrections 3。
- 内容夹具强制逐条掉落，覆盖115条目在每个声明关卡中的实际入背包／货币回执；空表、跨关前置、缺失注册、非法字段／概率／数量、战后物前置均有检查。overlay二次套用及源重建一致已过。
- `git diff --check`通过。日志：`/tmp/xiantu-batch7-<测试文件>.log`；汇总`/tmp/xiantu-batch7-test-results.json`。
- 外部每地3000局是剧情策划既有模拟证据，本批没有冒称重新跑统计模拟。未跑全量、tsc、build、canon:build、真实模型或真人试玩；统一门禁由New Bot进行。

## 剧情复核与未做项

请剧情策划对照15稿复核海神殿3条新增战后前置；这是本次审核的唯一内容时点调整。售价和功能效果暂不需要阻塞确认，日后接交易／消耗机制时再定。
既有consumable到背包的通用类别仍显示为丹药；本批按稿保留type，未扩大到物品UI分类重构。没有更改搜刮上限、冷却、旅行、日历、战斗或其他剧情描述。

## 本轮全部改动文件（相对备份，共18个）

- `PROJECT-STATUS.md`
- `docs/PLANNING-ROUNDS.md`
- `docs/handoffs/2026-10-04/BATCH7-LOOT-CONTENT.md`
- `mod-kit/canon-authority-overlays/lcq.stage_03b_snake_flower_bridge.json`
- `mod-kit/canon-authority-overlays/lcq.stage_04.json`
- `mod-kit/canon-authority-overlays/lcq.stage_04b_lingfei_baiyi_crisis.json`
- `mod-kit/canon-authority-overlays/lcq.stage_05b.json`
- `mod-kit/generated/deepseek-v4-flash/character-canon/CANON-DECISIONS.md`
- `mod-kit/location-loot.qingyu.json`
- `scripts/validate-location-loot.mjs`
- `src/modules/scenarioMods/builtins/data/lcq.stage_03b_snake_flower_bridge.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_04.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_05b.json`
- `src/modules/scenarioMods/locationLoot.ts`
- `tests/locationLoot.test.mjs`
- `tests/locationLootContent.test.mjs`
- `tests/nanhuangTravelLedger.test.mjs`
