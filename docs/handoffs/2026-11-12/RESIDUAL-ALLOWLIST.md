# 硬编码剧情 id：允许残留名单（2026-11-12）

线路迁移（各线 S4、B0–B8、F0a/F0b、阶段 2a/2b、BZ1）之后，`src/` 里还写着剧情 id 的地方。
口径与数字来自 `tests/hardcoded-story-id-baseline.json`（口径 B，主分支 `6b47e8ac`）：**60 个文件、576 行**，前缀模板行 0。起点是 71 文件、1999 行、前缀模板行 7。

棘轮测试（`tests/hardcodedStoryIdRatchet.test.mjs`）保证这些数字只降不升：任何文件多一行、或新文件里出现剧情 id，`npm test` 就红。本文件只是给这 576 行分类、说明为什么留着；不是测试的输入。

分类是主驱动（Fable）读匹配行后人工归的：超过 6 行的文件按文件的主要用途归类，没有逐行核；6 行及以下的文件逐行看过。一个文件只归一类，文件里个别行可能属于别的类（例如 `eventNarrativeView.ts` 6 行里有 2 行是主角 id）。

| 类 | 说明 | 文件数 | 行数 |
|---|---|---|---|
| A | 冻结文件 | 2 | 90 |
| B | 已标废弃的旧叙事试点 | 4 | 138 |
| C | 试玩、开发验收入口、战斗试炼 | 9 | 97 |
| D | 剧情专用的规则代码 | 32 | 196 |
| E | 旧档补丁 | 1 | 18 |
| F | 合规文件 | 1 | 16 |
| G | 注释、提示词里的举例、通用前缀或默认值 | 11 | 21 |
| 合计 | | 60 | 576 |

## A. 冻结文件（2 个文件，90 行）

改动须按冻结规矩单独解冻。BZ1（PR #41）已抽走合同哈希迁移表；剩下的是规则分支、五原地图合同常量（6 行）、同伴入队性别表（3 行，见 ASK-USER Q10）。

| 行数 | 文件 |
|---|---|
| 62 | `src/modules/scenarioMods/runtime.ts` |
| 28 | `src/utils/AIBidirectionalSystem.ts` |

## B. 已标废弃的旧叙事试点（4 个文件，138 行）

用户 2026-10-02 定「模块化稳定后删除」。删除会碰冻结的 AIBS，且属删除类操作，主驱动不主动做。

| 行数 | 文件 |
|---|---|
| 126 | `src/modules/scenarioMods/legacyPilotScenes.ts` |
| 10 | `src/modules/scenarioMods/legacyNarratorPacket.ts` |
| 1 | `src/modules/scenarioMods/legacyNarrativePilot.ts` |
| 1 | `src/modules/scenarioMods/legacyPilotActionOptions.ts` |

## C. 试玩、开发验收入口、战斗试炼（9 个文件，97 行）

不在正式游玩路径上（首页「历史试玩／开发测试」「R2-0V 验收」等入口）。原样保留。

| 行数 | 文件 |
|---|---|
| 24 | `src/modules/scenarioMods/qingyuOpeningPlaytest.ts` |
| 24 | `src/modules/scenarioMods/xingyuehuQuestPlaytest.ts` |
| 20 | `src/modules/scenarioMods/xingyuehuLandingPlaytest.ts` |
| 17 | `src/modules/scenarioMods/xingyuehuQuestPlaytestExperience.ts` |
| 5 | `src/modules/scenarioMods/r2AcceptanceFixtures.ts` |
| 3 | `src/dev/combatTrial/overlay.ts` |
| 2 | `src/components/character-creation/CharacterManagement.vue` |
| 1 | `src/dev/combatTrial/CombatTrialStartView.vue` |
| 1 | `src/dev/combatTrial/f03Scenario.ts` |

## D. 剧情专用的规则代码（32 个文件，196 行）

是代码分支不是数据表，纯搬迁搬不动；要清掉得新造「规则格式」，属加机制（ASK-USER Q6 第 1 条 (b)，默认 11-16 前不做）。改这些剧情时仍需改这些文件。

| 行数 | 文件 |
|---|---|
| 32 | `src/modules/scenarioMods/wuyuanOpenWorldSlice.ts` |
| 25 | `src/modules/scenarioMods/characterResolver.ts` |
| 21 | `src/utils/narrativeStateReconciler.ts` |
| 18 | `src/modules/scenarioMods/narrativeBoundaries.ts` |
| 15 | `src/modules/scenarioMods/travel/travelLedger.ts` |
| 12 | `src/modules/scenarioMods/baihuGambleRefusal.ts` |
| 9 | `src/modules/scenarioMods/fixedInventoryContracts.ts` |
| 8 | `src/modules/scenarioMods/presence.ts` |
| 6 | `src/modules/scenarioMods/eventNarrativeView.ts` |
| 6 | `src/utils/musicLibrary.ts` |
| 5 | `src/modules/scenarioMods/fixedEndingNarratives.ts` |
| 5 | `src/modules/scenarioMods/ledger/naming.ts` |
| 4 | `src/modules/scenarioMods/storyContext.ts` |
| 3 | `src/modules/scenarioMods/naturalIntentRouter.ts` |
| 3 | `src/modules/scenarioMods/playerAgencyGuard.ts` |
| 3 | `src/modules/sceneModule/host/loot.ts` |
| 2 | `src/modules/scenarioMods/endingPresentation.ts` |
| 2 | `src/modules/scenarioMods/locationLoot.ts` |
| 2 | `src/modules/scenarioMods/strictInitializer.ts` |
| 2 | `src/modules/scenarioMods/voiceCards.ts` |
| 2 | `src/modules/sceneModule/host/controller.ts` |
| 1 | `src/components/dashboard/MainGamePanel.vue` |
| 1 | `src/modules/scenarioMods/actionTime.ts` |
| 1 | `src/modules/scenarioMods/beatProgress.ts` |
| 1 | `src/modules/scenarioMods/branchDecision.ts` |
| 1 | `src/modules/scenarioMods/levelProgression.ts` |
| 1 | `src/modules/scenarioMods/lineUnlock.ts` |
| 1 | `src/modules/scenarioMods/narrativePerformanceGuard.ts` |
| 1 | `src/modules/scenarioMods/relationships.ts` |
| 1 | `src/modules/scenarioMods/shiweimoRescue.ts` |
| 1 | `src/modules/sceneModule/host/writeback.ts` |
| 1 | `src/services/characterRagService.ts` |

## E. 旧档补丁（1 个文件，18 行）

按存档里的旧 id 修档，id 必须写死。声明化（阶段 2c）已定延后（ASK-USER Q9 第 4 条）。

| 行数 | 文件 |
|---|---|
| 18 | `src/modules/scenarioMods/loadRepairs.ts` |

## F. 合规文件（1 个文件，16 行）

合规审计类，主驱动不动（DEFERRED-COMPLIANCE）。

| 行数 | 文件 |
|---|---|
| 16 | `src/modules/scenarioMods/intimacyProfiles.ts` |

## G. 注释、提示词里的举例、通用前缀或默认值（11 个文件，21 行）

不随某条线的剧情改动：注释里举例的关 id、提示词里的路径写法示例、`lcq.`／`liuchao.deadline.` 这类前缀判断、主角 id、默认线 id `lcq.main`、入口关 id、本地存储键名。

| 行数 | 文件 |
|---|---|
| 5 | `src/modules/scenarioMods/secondaryLines.ts` |
| 4 | `src/modules/scenarioMods/mainQuestAxis.ts` |
| 3 | `src/modules/scenarioMods/questLog.ts` |
| 2 | `src/modules/scenarioMods/playerLedgerRules.ts` |
| 1 | `src/modules/scenarioMods/liuchaoEntry.ts` |
| 1 | `src/modules/scenarioMods/openWorldSlice.ts` |
| 1 | `src/modules/scenarioMods/persistentLineEntries.ts` |
| 1 | `src/modules/sceneModule/host/rngSalt.ts` |
| 1 | `src/services/prompts/defaultPrompts.ts` |
| 1 | `src/utils/narrativePromptState.ts` |
| 1 | `src/utils/prompts/cot/cotCore.ts` |

## 对「框架代码不再随剧情改动」意味着什么

- 已做到：各线的 rail、章名、配乐、目标、二级线、结局、行旅定义、常驻入口、人物任务与高光、姿态档案、好感上限、IF 分歧、主轴表、地点别名、国家线注册与地区映射、入秦条件、大祭、合同哈希迁移表，都在内容包里；加改这些只动包数据。
- 还做不到：改 D 类涉及的那些具体剧情（五原开放段、身份揭示、南荒护栏与强制路线、白湖拒赌、几处固定结局与掉落等）仍要改对应的 TS；A 类里的剧情分支要解冻才能动。
- B、C、E、F、G 类不影响「加一条新线」。
