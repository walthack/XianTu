# 补充15：实体总表迁移（补充18收口）

本轮沿用当前脏工作区，不提交、不推送、不重建8097。第3阶段未开；F06/F08/F09的归关未裁定、未改。合规规则与正文不改，亲密档案仅names识别字段改为角色id派生别名。

## 已落地

- `mod-kit/entity-catalog/enemies.json`：21项（17种敌人、4个群体，含两类已有我方群体）。鬼王峒武士/鬼武士合为`lcq.enemy.guiwang_warrior`，旧id保留别名。具体武士保持独立party/instanceId/轨道，实例显示词来自总表，不能因合并类型误合并伤情或终态。具名敌人保留角色ref，敌人模板另记enemyId。
- `locations.json`：138项；126个地图地点，8个五原细节点、4个无worldLocationId的既有行旅节点。其余南荒节点以worldLocationId地点为权威、节点id作别名。未捏造坐标。
- `factions.json`：124项；7组同名多id以关卡/atlas实际结构化引用较多的id为主，旧id为别名。
- `endings.json`：9项（8个已命名结局+通用游戏结束）；既有固定正文未改。
- 角色registry：322项，六张最简时点卡由现有关卡记录补入源卡并脚本生成：`lcq.character.nanhuang_dagu/shekui/heishe/shigang/xiaowei/kawa`。无来源的种族、性别、身世不补造。
- 新档版本2：人物/地点/势力结构化引用；位置保留人类可读描述缓存，另存locationId，五原细节点另存zoneId；NPC factionId/factionIds及原势力列表存id，面板从总表取名称。移动、换关/回合写回边界同步，旧档不迁移。
- 识别正则保留，实际实体名改由总表aliases派生；名单、比较改为id对应标签判断。主线完成证据不把别名展开成AND条件。六名新增角色的作者摘要用id投影；生成长摘要迁入JSON，生成器同步，不放宽棘轮。
- 原内容搜刮表地点键同步规范id，不改掉落概率、数量、上限、入账。
- 场面核心继续无主应用数据依赖；具体单位名称由宿主投影。R02测试通过生产宿主名称回调验证，原断言未改；搜刮负例只换规范/别名夹具的方向，仍要求错误被拦。

## 补充15上一轮门禁（历史，已由补充18替代）

- tsc：0错误。
- 全量：1562项，1556过/1败/5跳；唯一确定失败：七里坊坐标冲突。
- 最新专项：总表/单位身份/搜刮/主线/亲密识别15/15；另身份与档案专项11/11、识别与主线专项48/48。各次有重复，不能相加当唯一测试数。
- 总表校验：0错误；人名字面量棘轮通过，未加大预算。
- canon:build：已执行，地点id校验处中断；不能报绿，后续步骤未执行。
- git diff --check：通过。

## 补充15上一轮未完项（历史，当前看补充18）

1. 七里坊：规范id已按引用数量选`lyl.location.qilifang`，两来源坐标6114,3929与6838,3577冲突。没有改坐标，没有加豁免。已向用户请求是否沿用主id坐标；未得到回复，保留红项。
2. 原盘点152指名词，不是152行。已迁移明确实体引用，但还有22个AST候选，详见下表；不能声称全部清零。伤情形容词不等于唯一状态id，不能擅自把“重伤”全部判作某一外伤；揭名描述/原著完成证据须保持现有门禁语义。合规判定那条不改。
3. 六张新增源卡及裁定#206在既有ignored生成源中；未git add -f。完整复现须保留该源，本机已脚本生成registry。
4. 地点/势力规范侧统计依据为关卡/atlas结构化引用；未把prompt文字出现次数算入id引用票数。完整决策记录见`_newbot_tmp/supp15-canonical-decisions.json`。

## 新档检查点

`_newbot_tmp/combat-checkpoints-supp15/F01-before.json`、F02、F03、F04、F05、F10、F13各一份（游戏导出格式type=saves，版本2），生成器从新档连续回放当前合同导出；非真模型/真人验收。旧目录未覆盖。8097仍旧格式测试包，需获准重建后才能用新档测试。

8097未重建：MD5 `c01331bf004d3ae78d70ac925acd5393`；受保护端口与PID未操作。

## 补充15上一轮22候选（历史）

| 文件:行 | 原值/模式 |
|---|---|
| src/modules/scenarioMods/canonRail.ts:212 | `阿姬曼` |
| src/modules/scenarioMods/canonRail.ts:219 | `五原` |
| src/utils/narrativeStateReconciler.ts:137 | `/(?:神魂∣身体).{0,8}虚弱∣虚弱.{0,8}(?:休息∣静养)∣正在休息/` |
| src/utils/narrativeStateReconciler.ts:153 | `/中毒.{0,8}(?:昏迷∣不醒)∣(?:昏迷∣不醒).{0,8}中毒/` |
| src/utils/narrativeStateReconciler.ts:203 | `/寒毒.{0,10}(?:濒死∣垂危∣重伤)∣(?:重伤∣濒死).{0,10}寒毒/` |
| src/utils/narrativeStateReconciler.ts:220 | `/(?:陷入∣仍在∣一直)?昏迷∣不省人事∣失去意识/` |
| src/utils/narrativeStateReconciler.ts:223 | `/(?:身受∣受了?∣伤势)?重伤∣伤势.{0,6}(?:沉重∣严重)/` |
| src/utils/narrativeStateReconciler.ts:232 | `/(?:神魂∣魂魄).{0,8}(?:虚弱∣不稳∣受创)/` |
| src/utils/narrativeStateReconciler.ts:234 | `/(?:身体∣体力∣气息).{0,8}(?:虚弱∣不支∣衰弱)/` |
| src/services/eventReconcileService.ts:466 | `/重伤∣昏迷∣休养∣长养/` |
| src/modules/scenarioMods/travel/travelLedger.ts:372 | `/五原∣白湖/` |
| src/modules/scenarioMods/storyContext.ts:530 | `花苗新娘` |
| src/modules/scenarioMods/wuyuanOpenWorldSlice.ts:225 | `五原` |
| src/modules/scenarioMods/wuyuanOpenWorldSlice.ts:248 | `/去五原∣前往五原∣去市集∣前往五原露天市集/` |
| src/modules/scenarioMods/legacyNarrativeContract.ts:45 | `/(?:重伤∣身亡∣死亡∣被射杀∣中箭身亡∣刎颈∣气绝)/u` |
| src/modules/scenarioMods/legacyNarrativeContract.ts:137 | `/(?:重伤∣身亡∣死亡∣被射杀∣中箭身亡∣刎颈∣气绝∣受伤∣击杀∣惨案∣尸体)/` |
| src/modules/sceneModule/host/controller.ts:126 | `/战斗结束∣战斗胜利∣敌人倒下∣获得∣收入背包∣已经逃离∣<[^>]+>/` |
| src/modules/sceneModule/host/writeback.ts:36 | `倒下` |
| src/services/vectorMemoryService.ts:80 | `重伤` |
| src/services/vectorMemoryService.ts:157 | `重伤` |
| src/utils/judgementEngine.ts:470 | `/强迫∣胁迫∣逼迫∣迫使∣威胁∣迷药∣麻古∣下药∣催情∣制住∣制服∣控制∣绑住∣束缚∣强行∣不愿∣不情愿∣不同意∣不合意∣非自愿∣被迫∣拒绝∣昏迷∣失去意识∣神志不清∣不能反抗∣不得不∣乘人之危/` |
| src/utils/narratedDamage.ts:61 | `/(?:重创∣重伤∣贯穿∣洞穿∣撕裂∣喷溅∣血流如注∣鲜血淋漓∣震飞∣击飞∣撞飞∣扫飞∣掀翻∣眼前发黑∣喉头一甜∣(?:胸∣腹∣咽喉)[^。；\n]{0,12}(?:贯穿∣洞穿∣撕裂∣割破∣划破∣鲜血∣剧痛))/` |

## 本轮涉及文件（不含既有其他批次未提交改动）

- `mod-kit/entity-catalog/endings.json`
- `mod-kit/entity-catalog/enemies.json`
- `mod-kit/entity-catalog/factions.json`
- `mod-kit/entity-catalog/index.json`
- `mod-kit/entity-catalog/locations.json`
- `mod-kit/entity-ledger/overrides.json`
- `mod-kit/location-loot.qingyu.json`
- `scripts/build-canon-rail-profiles.mjs`
- `scripts/build-entity-index.mjs`
- `scripts/review-canon-rail-semantic-contracts.mjs`
- `scripts/validate-entity-catalog.mjs`
- `scripts/validate-location-ids.mjs`
- `scripts/validate-location-loot.mjs`
- `src/components/dashboard/GameMapPanel.vue`
- `src/components/dashboard/UnmappedLocationsPanel.vue`
- `src/modules/scenarioMods/affinityCaps.ts`
- `src/modules/scenarioMods/baihuGambleRefusal.ts`
- `src/modules/scenarioMods/builtins/character-registry.json`
- `src/modules/scenarioMods/builtins/manifest.json`
- `src/modules/scenarioMods/canonGuard.ts`
- `src/modules/scenarioMods/canonRail.ts`
- `src/modules/scenarioMods/canonRailProfiles.generated.json`
- `src/modules/scenarioMods/characterResolver.ts`
- `src/modules/scenarioMods/entitySaveFormat.ts`
- `src/modules/scenarioMods/entitySaveRefs.ts`
- `src/modules/scenarioMods/fastNarrativeDemo.ts`
- `src/modules/scenarioMods/fixedEndingNarratives.ts`
- `src/modules/scenarioMods/fixedInventoryContracts.ts`
- `src/modules/scenarioMods/legacyNarratorPacket.ts`
- `src/modules/scenarioMods/legacyPilotScenes.ts`
- `src/modules/scenarioMods/namedEntities.ts`
- `src/modules/scenarioMods/narrativeBoundaries.ts`
- `src/modules/scenarioMods/narrativePerformanceGuard.ts`
- `src/modules/scenarioMods/naturalIntentRouter.ts`
- `src/modules/scenarioMods/playerAgencyGuard.ts`
- `src/modules/scenarioMods/presence.ts`
- `src/modules/scenarioMods/qingyuOpeningPlaytest.ts`
- `src/modules/scenarioMods/runtime.ts`
- `src/modules/scenarioMods/stanceProfiles.ts`
- `src/modules/scenarioMods/travel/travelLedger.ts`
- `src/modules/scenarioMods/voiceCards.ts`
- `src/modules/scenarioMods/wuyuanOpenWorldSlice.ts`
- `src/modules/sceneModule/contracts/f01.json`
- `src/modules/sceneModule/contracts/f02.json`
- `src/modules/sceneModule/contracts/f03-entry.json`
- `src/modules/sceneModule/contracts/f03.json`
- `src/modules/sceneModule/contracts/f04.json`
- `src/modules/sceneModule/contracts/f05.json`
- `src/modules/sceneModule/contracts/f10.json`
- `src/modules/sceneModule/contracts/f13.json`
- `src/modules/sceneModule/contracts/f14.draft.json`
- `src/modules/sceneModule/host/injuries.ts`
- `src/modules/sceneModule/host/refs.ts`
- `src/modules/sceneModule/queries.ts`
- `src/modules/sceneModule/types.ts`
- `src/services/eventReconcileService.ts`
- `src/types/game.d.ts`
- `src/utils/AIBidirectionalSystem.ts`
- `src/utils/musicLibrary.ts`
- `src/utils/narrativeStateReconciler.ts`
- `tests/entityCatalog.test.mjs`
- `tests/entityMasterReferences.test.mjs`
- `tests/locationIds.test.mjs`
- `tests/locationLootContent.test.mjs`
- `tests/processGmResponseAbortAtomicity.test.mjs`
- `tests/sceneNarrationSubjects.test.mjs`

此外：源卡与裁定簿为既有ignored源；canon生成的registry/manifest时间戳与构建产物保留。前轮已改的文件全部保留，未整体回滚。

## 补充18当前收口（2026-10-06）

- 七里坊：统一主id坐标6838,3577，6114,3929记在locations.json coordinateHistory。stageVariant与燕歌行内置关同步；新增十号overlay，从原始生成坐标投影到主坐标，重建和重复套用一致。裁定簿#207记录本次授权。
- 门禁不放宽：原共享锚点债务只缩小为七里坊移出后的三处；12条已被别名归一解决的旧问题转入closedIssues留存，不删记录。过期检查使用与匹配相同的归一键，未新增豁免。测试故意恢复旧坐标，仍被coordinate_conflict拦截。
- 明确引用：阿姬曼/五原短证据从角色/地点id的short识别标签取；保持原字面证据，不扩成AND别名，也不改成更严格的全名。花苗新娘从既有乐明珠称谓章门第0章描述读，揭示门语义原样。五原比较/识别正则由地点表别名生成。
- 状态：新增statusNamePattern读取现有目录/临时通用定义label与aliases；未知id返回不匹配。宿主“倒下”识别和清理只引用incapacitated，不改状态时长、战斗数值或档位。
- 未映射：目录17种书内伤情和6种临时通用状态没有“重伤/虚弱/昏迷/中毒”的已声明别名；这些词可能是外伤、内伤、魂魄或药物状态，不能猜成一个id。本轮按用户要求原样保留并列下表（13处）。judgementEngine:470另单列，文件与本轮前备份逐字节一致。
- 不调境界、货币、战斗数值；F05分摊未做；第3阶段未开。未提交、未推送、未重建8097；MD5仍c01331bf004d3ae78d70ac925acd5393。

### 保留的14处候选（13处目录未映射＋1处明确不动）

| 文件:行 | 原词/模式 | 原因 |
|---|---|---|
| src/utils/narrativeStateReconciler.ts:137 | `/(?:神魂∣身体).{0,8}虚弱∣虚弱.{0,8}(?:休息∣静养)∣正在休息/` | 无明确状态id/目录别名，不猜映射 |
| src/utils/narrativeStateReconciler.ts:153 | `/中毒.{0,8}(?:昏迷∣不醒)∣(?:昏迷∣不醒).{0,8}中毒/` | 无明确状态id/目录别名，不猜映射 |
| src/utils/narrativeStateReconciler.ts:203 | `/寒毒.{0,10}(?:濒死∣垂危∣重伤)∣(?:重伤∣濒死).{0,10}寒毒/` | 无明确状态id/目录别名，不猜映射 |
| src/utils/narrativeStateReconciler.ts:220 | `/(?:陷入∣仍在∣一直)?昏迷∣不省人事∣失去意识/` | 无明确状态id/目录别名，不猜映射 |
| src/utils/narrativeStateReconciler.ts:223 | `/(?:身受∣受了?∣伤势)?重伤∣伤势.{0,6}(?:沉重∣严重)/` | 无明确状态id/目录别名，不猜映射 |
| src/utils/narrativeStateReconciler.ts:232 | `/(?:神魂∣魂魄).{0,8}(?:虚弱∣不稳∣受创)/` | 无明确状态id/目录别名，不猜映射 |
| src/utils/narrativeStateReconciler.ts:234 | `/(?:身体∣体力∣气息).{0,8}(?:虚弱∣不支∣衰弱)/` | 无明确状态id/目录别名，不猜映射 |
| src/services/eventReconcileService.ts:466 | `/重伤∣昏迷∣休养∣长养/` | 无明确状态id/目录别名，不猜映射 |
| src/modules/scenarioMods/legacyNarrativeContract.ts:45 | `/(?:重伤∣身亡∣死亡∣被射杀∣中箭身亡∣刎颈∣气绝)/u` | 无明确状态id/目录别名，不猜映射 |
| src/modules/scenarioMods/legacyNarrativeContract.ts:137 | `/(?:重伤∣身亡∣死亡∣被射杀∣中箭身亡∣刎颈∣气绝∣受伤∣击杀∣惨案∣尸体)/` | 无明确状态id/目录别名，不猜映射 |
| src/services/vectorMemoryService.ts:80 | `重伤` | 无明确状态id/目录别名，不猜映射 |
| src/services/vectorMemoryService.ts:157 | `重伤` | 无明确状态id/目录别名，不猜映射 |
| src/utils/judgementEngine.ts:470 | `/强迫∣胁迫∣逼迫∣迫使∣威胁∣迷药∣麻古∣下药∣催情∣制住∣制服∣控制∣绑住∣束缚∣强行∣不愿∣不情愿∣不同意∣不合意∣非自愿∣被迫∣拒绝∣昏迷∣失去意识∣神志不清∣不能反抗∣不得不∣乘人之危/` | 用户指定合规判定原样保留 |
| src/utils/narratedDamage.ts:61 | `/(?:重创∣重伤∣贯穿∣洞穿∣撕裂∣喷溅∣血流如注∣鲜血淋漓∣震飞∣击飞∣撞飞∣扫飞∣掀翻∣眼前发黑∣喉头一甜∣(?:胸∣腹∣咽喉)[^。；\n]{0,12}(?:贯穿∣洞穿∣撕裂∣割破∣划破∣鲜血∣剧痛))/` | 无明确状态id/目录别名，不猜映射 |

### 补充18改动文件

- `mod-kit/entity-catalog/locations.json`
- `mod-kit/entity-ledger/overrides.json`
- `mod-kit/canon-authority-overlays/lyg.mijing_rumen.json`
- `mod-kit/canon-authority-overlays/manifest.json`
- `mod-kit/location-id-known-issues.json`
- `scripts/validate-location-ids.mjs`
- `src/modules/scenarioMods/namedEntities.ts`
- `src/modules/scenarioMods/canonRail.ts`
- `src/modules/scenarioMods/storyContext.ts`
- `src/modules/scenarioMods/travel/travelLedger.ts`
- `src/modules/scenarioMods/wuyuanOpenWorldSlice.ts`
- `src/modules/sceneModule/statuses.ts`
- `src/modules/sceneModule/types.ts`
- `src/modules/sceneModule/host/controller.ts`
- `src/modules/sceneModule/host/writeback.ts`
- `tests/canonAuthorityOverlay.test.mjs`
- `tests/supplement18Closure.test.mjs`
- `src/modules/scenarioMods/builtins/data/lyg.mijing_rumen.json`
- `src/modules/scenarioMods/builtins/manifest.json`
- `mod-kit/entity-catalog/index.json`

附带docs：PROJECT-STATUS、PLANNING-ROUNDS、本交接。ignored裁定簿#207未强制加入Git。registry生成时间戳由门禁刷新，原有全部未提交改动保留。

### 命令行加载修复

canon首跑在schema脚本加载新增namedEntities引用时遇到@路径别名解析失败。将本轮迁移引入的引用改为相对路径，保持运行逻辑和所有校验条件不变；未修改schema脚本或放宽检查。除上列travelLedger/wuyuanOpenWorldSlice外涉及：

- `src/modules/scenarioMods/characterResolver.ts`
- `src/modules/scenarioMods/voiceCards.ts`
- `src/modules/scenarioMods/narrativeBoundaries.ts`
- `src/modules/scenarioMods/qingyuOpeningPlaytest.ts`
- `src/modules/scenarioMods/naturalIntentRouter.ts`
- `src/modules/scenarioMods/playerAgencyGuard.ts`
- `src/modules/scenarioMods/baihuGambleRefusal.ts`
- `src/modules/scenarioMods/fixedInventoryContracts.ts`
- `src/modules/scenarioMods/legacyPilotScenes.ts`
- `src/modules/scenarioMods/fastNarrativeDemo.ts`
- `src/modules/scenarioMods/narrativePerformanceGuard.ts`
- `src/modules/scenarioMods/legacyNarratorPacket.ts`
- `src/modules/scenarioMods/presence.ts`
- `src/modules/scenarioMods/runtime.ts`

### 补充18验收

定向70/70、tsc0；串行全量1565项（1560过/0败/5跳）；生产构建通过。第一次并发全量只有Node25 IPC deserialize异常，文件单跑31/31；随后以相同tests/*.test.mjs串行重跑，不改断言。canon:build完整通过（74.7秒，内含同一1565项串行单测）；地点校验失败0/既有警告25/过期0，git diff --check通过。命令行别名修复后定向70/70、tsc0、串行全量和生产build已再次验证。

十号overlay为本轮明确坐标裁定的新增闭包，相关测试名单从9关同步为明确的10关（新增lyg.mijing_rumen），仍逐关要求生成源＋overlay逐字重建内置数据，未移除漂移/幂等检查。
