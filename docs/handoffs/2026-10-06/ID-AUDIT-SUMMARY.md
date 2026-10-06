# 统一id总表 · 只读盘点摘要

日期：2026-10-06；与第2阶段同轮交付。用户补充4：先把id总表落完再测第2阶段。本轮只盘点及提出方案，没有创建新总表、改名、迁移存档或批量替换引用。

## 实际来源与数量

| 类别 | 现状/主要来源 | 本次静态数 |
|---|---|---|
| 角色 | builtins/character-registry.json；阶段canon.characters；alias-registry；entity-ledger/overrides | registry315人；全部来源336个角色id，1702条投影；alias263，覆盖不同 |
| 地点 | shared-atlas/liuchao.shared-atlas.v1.json、阶段canon.locations、travel/locationIds.ts | atlas56；全部143个id；84个有跨表/关重复投影 |
| 势力/门派 | 同一atlas与阶段canon.factions | atlas39；全部131个id |
| 道具 | 各关content.items→runtime.canon.items；overlay为tracked改动源 | 306个id，1460条阶段记录，219个多处定义；无独立全项目总表 |
| 技能/功法 | 各关content.skills/techniques | 技能143个id/603条；功法67个id/233条；无独立总表 |
| 状态 | sceneModule/contracts/statuses.json＋statuses.ts＋旧合同/动态效果 | 目录17、内置6，23个id；旧效果字符串另并存 |
| 敌人/编组 | 场面合同parties/group/ref，场内id | 23个敌方场内条目，无独立模板总表 |
| 战斗 | sceneModule/contracts/registry.ts及合同JSON | 正式8场含W07；F14草稿1，不是已接入 |
| 事件/关卡/章节 | 37份builtin scenario；原著axis-binding另有时间轴 | 游戏事件534、关卡37、章节节点83；原著轴1399个，不等同游戏事件 |
| 结局 | fatalOutcomes、fixedEndingNarratives、endingPresentation/images、合同endingId | 8个不同endingId；E01/E03共用id、以sourceEventId区分，不机械合并 |
| 任务线/主轴 | secondaryLines、characterQuests、mainQuestAxis | 支线10、角色任务8、角色高光63无独立id、主轴16个eventId绑定节点 |
| 称谓 | entity-ledger/overrides逐章/六通道，其他角色沿阶段字段 | 22实体、1046条生效步骤，不覆盖全315角色 |
| 行旅 | qingyuNanhuang定义、五原开放世界定义 | 路线37（南荒29＋五原8）、南荒区域12/地点节点20 |
| 事实/秘密、动作、情势、flag | 各关局部条目/条件及schema | 静态factId86（显式secret2）；动作局部579、事件+动作880；情势360、flag655。公共事实句/动态拼接不计 |
| 境界/创建选项 | realms.ts、creationData.ts | 境界9档，无命名空间id；世界10、出身24、灵根26、天赋30、品级7为局部键 |
| 货币/物品品质 | currencySystem.ts、itemQuality.ts | 默认币种7（中文币种id）、品质7（中文键）、品级11（0–10），已有总定义但未统一命名空间 |

完整报告列每类文件路径、重复id与全部名称命中定位：[完整盘点](../../../_newbot_tmp/id-audit-2026-10-06.md)。扫描边界为37关、现有注册表/合同、生产src/脚本与七份当前战前导出样本；不穷举ignored旧快照/NAS/浏览器实际存储。多份定义可能是有意阶段投影，不直接判错。

## 硬写名词盘点怎么读

按已登记名称/别名匹配AST字符串与模板，排除注释、{{ref:id}}和带id的name/label定义。按类别列“代码/脚本/数据合同/存档样本”数量和代表，逐条完整清单在报告末尾。

例如角色候选35996（代码2555）、道具3424（代码330）、地点9516（代码471）、势力16567（代码553）、技能1691（代码73）、功法904（代码63）。同名多类别重复计数；「背包」「商道」这类被登记为名词的词也会匹配。**这些是审查候选，不能当作违规数或改动行数。** 原著正文、别名迁移、当前显示快照可合法含名词，需按用途人工确认。未登记名词、单字名、运行时拼接仍可能漏报。

代表：角色/势力 affinityCaps.ts:42/62 的名称条件；地点 baihuGambleRefusal.ts:330/338 的白湖商馆；技能/功法 dev/combatTrial/engine.ts:276 的生死根；状态 dev/combatTrial/flow.ts:272/276 的外伤。用户要求本轮只列，均未因盘点改动。全部道具候选及币种中文键等见完整报告。

## 建议统一方式和顺序（待批准）

1. 统一索引登记kind/id/权威来源/别名/版本；沿用现有角色registry、atlas/locationIds、称谓账本、状态目录、合同registry。显示名须经当前章节与通道投影，不能直接拿全书终点字段。
2. 优先合并道具/技能/功法权威定义；关卡保留id允许清单和阶段可得/揭示条件。剧情道具storyItem定向发、普通道具走原掉落。估计2–3工作日。
3. 补敌人模板/编组、结局/任务/事实/路线等索引与局部实例的区分；已有id保持映射兼容。估计2–4工作日。
4. 再替换结构化名称键/硬词判断与面板/模型投影出口，做悬空引用、别名冲突、重复权威校验与旧档迁移。估计3–5工作日。

总粗估7–12工作日，不是开工承诺；用户批准范围和旧档策略后再细分。统一索引不意味着每回合把全书JSON塞给模型，也不意味着每个数值/一次性文本都要新建实体。第3阶段战斗与真机暂等，不借本轮扩实现。

## 需要用户/剧情确认

- 旧档兼容还是开新档；中文货币id等现有合法键改命名空间会触及存档/账本，不直接改。
- 无名敌人模板、场内实例/群体id与显示标签关系；F01六人群体等胜负规则不因建表改变。
- E01/E03共用endingId的保留/拆分与sourceEventId兼容；通用游戏结束目前无故事正文。
- 揭名/章节/称谓通道、私有知情、阶段设定与全书卡回落，涉及剧情时间门，不能用总表末期身份覆盖。
- 原著台词、固定结局/合规标记只定位，不改写；检索命中不作为自主修改授权。

第2阶段代码及静态门禁见[交付](COMBAT-STAGE2.md)，8097仍旧f5e92d，未部署新四场。
