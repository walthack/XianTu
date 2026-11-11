# 内容包合同 v1 · P1-CONTENT-PACK-20261011

用户授权：六项P1“做掉”。目标：新增战斗合同或试玩段落只增改JSON，不写TypeScript import、不增加runtime/AI分支。内容编辑入口是`src/modules/contentPacks/packs/<目录>/manifest.json`；派生`generated/catalog.json`不可手工编辑。打包时自动生成，canon门禁重新校验。

## 作者交付

manifest字段：`schemaVersion:1`、全局唯一`id`；以下都是JSON文件路径：

| 字段 | 文件内容 | 消费点 |
|---|---|---|
| contracts / drafts | 合同对象；draft只校验，不可进入游戏 | sceneModule注册表 |
| statuses | 状态增量数组，不允许覆盖目录id | 状态目录 |
| stages | 完整ScenarioMod；不允许覆盖内置stage id | 内置模组库 |
| overlays | `{stageId,events:[完整事件]}`数组；只允许事件，不写canon角色/年龄/归属 | 加载stage时合并 |
| questLines | 现有quest-line v1的line增量数组 | 人物/支线引擎 |
| entities | `{kind:item/skill/technique,entry:现有CatalogEntry}`数组 | 实体目录 |
| texts | `{全局textId:正文}`对象；开场/固定结局逐字移入 | 正文、人物线文本引用 |
| playtests | 试玩声明数组，含起始/结束stage、结束事件、事件范围、隔离档标记与开场textId | 试玩建档/范围 |
| entries | 首页入口数组；label/route/group/icon/testId，试玩可指定playtestId | 首页Vue数据渲染 |

文件默认相对于pack目录；迁移既有权威允许`src/...`或`mod-kit/...`仓库相对路径。拒绝绝对路径、`..`、符号链接越界与非JSON。不加载任意脚本。各pack按目录排序，id冲突拒绝，不靠后加载覆盖。

playtests支持`extends`，有环或缺父定义拒绝。派生定义保留原存档kind/extensionKey，已有清羽、南荒两期和星月湖标记不改。新入口使用已有通用`/qingyu-opening-playtest`路由并填playtestId：首页自动附pack查询，建档使用声明的characterId/slot/startModId/openingTextId，禁止用正式角色id。当前通用建档仍沿六朝主角的既有创建预设；跨题材角色不在本轮范围。

新增战斗必须引用真实event/action；默认`advance_declared_objective`也必须由该stage事件提供。合同内容修改应提升meta.version，若允许旧场内状态续用须显式列compatibleStateVersions；不得在版本不变时改变正在进行的战斗规则。旧存档最终动作可在hook.compatibleActionIds显式声明（必须存在且不能是prepare），不把旧动作文本塞进识别词表。正文、剧情边界、奖励来源、人物在场名单由剧情策划负责；数值由模块策划打磨，模型仍从API设置读取，不绑提供商。

## 编译、校验与使用

`node scripts/content-packs.mjs`生成；`--check`校验来源并核对产物逐字段一致，过期则失败，不更新catalog。`sync-builtin-mods`同步完关卡再生成；`canon:build`含内容包引用/合同校验。错误不生成新catalog。检查重复id/歧义hook、草稿或待裁定误启用、事件/action、stage schema、试玩终点所属stage、正文、路由、继承环、实体覆盖、人物线结构/引用、状态与合同lint。

hook.completionSceneByOutcome只接受win/lose的固定事实、fallback/factChecks、cast、dayPart、sceneLocation和ledgerEffects字段，主动作与旧动作均需过schema；运行时只把补丁交给账本局部副本，不改保存合同。ledgerEffects为完整对象替换，不做嵌套合并。

通用能力：目标可声明when与targetIds，前置不成立或对象不对只返回可恢复澄清；预览也执行同一前置。settings.judgement可选现有判定种类，缺省仍combat/escape。收束事件可用atClose+when，以真实场内状态决定后果；辅助轨道应声明preserveOnWin，防止赢主目标时被自动补成完成。

F06–F09引用桌面31号作者原件的已定W18–32及裁定#209：F06/F08/F09在04b；05旧id不删除、不复活。F07挂04b既有biling_bay_stance，逃兵旗标使第87章blank_letter_and_dagu的第二动作进入条件盘问合同，未逃兵不插入。F14现有作者草稿无待裁定项，按数据注册为ready；数值初值经必经胜率门禁，超上限warning保留供模块策划调参，不改旧场数值。

## 核心文件冻结

`src/modules/scenarioMods/runtime.ts`与`src/utils/AIBidirectionalSystem.ts`只接受有失败证据的bugfix，不新增事件id/角色id/入口id分支。新内容走pack；新通用结算规则走sceneModule/host或合同字段，并有独立验证。此规则是开发/审查约束，不能由词法检查自动证明一个改动确属bugfix。本轮AI文件无diff；runtime只有已证明的旧动作绕过场面门禁bugfix，共用兼容判定用于入口/结算/地点动作查找，未新增任何剧情ID分支。

## 证据边界

新增JSON合同F14由清单加载，F06–F09与第87章条件合同均经同一加载；控骰回放仅用于合法生成检查点和确定性机制验证。隔离浏览器真实模型/自然骰与回放分开记录。真实玩家体验、长期数值平衡不能由门禁或执行观察替代。正式存档/API不改，不推送。

## 作者来源追溯

F06–F09采用[31号合同原样归档](../../../mod-kit/source-documents/31-南荒全部固定战斗合同草案.md)，[来源记录](../../../mod-kit/source-documents/README.md)包含原路径、保存时间、SHA-256与章节定位。此归档不修改已接入合同或试玩包。

## 2026-10-28 stage 资源引用

`stages` JSON 的值可用单键对象 `{"$text":"正文键"}` 引用该次编译合并的 pack texts，也可用 `{"$num":"story.qin.actionTimeCost"}` 引用数值权威。编译时递归替换后再做完整 stage schema 校验；缺键、混合字段对象立即失败，不生成半份 catalog。runtime 接收的仍是普通 ScenarioMod，不增加 TS 关卡注册或条件分支。

## 2026-11-11 正典 rail 与界面展示字段（秦线 PR B）

三个字段，下一条线照填即可；都只从编译后的 catalog 读，不读存档里烘焙的事件/章对象，旧档不用迁移。

**manifest `rails`**：JSON 文件路径数组（与 `mapEntries` 同做法）。每个文件是 rail 档数组，一关一条：

```json
[{
  "note": "可选，只给作者看，不进 catalog",
  "id": "<rail id>", "modId": "<已有 stage id>", "chapterId": "<该关的 rail 章 id>",
  "orderedEventIds": ["<该关事件 id>", "…"],
  "contracts": [{
    "eventId": "<与 orderedEventIds 同位的事件 id>",
    "mustReach": {"$text": "<正文键>"}, "completionEvidence": [],
    "forbiddenInCanon": [{"$text": "<正文键>"}], "allowedElaboration": {"$text": "<正文键>"}
  }]
}]
```

字段与 `CanonRailProfile` / `CanonRailContract` 相同；文案可写普通字符串或 `{"$text":…}`（引用 pack texts，编译时替换）。编译期校验：只认上列字段；`modId` 是已有 stage（内置或包内），同一 `modId`、同一 `id` 只登记一次；`chapterId` 是该关的章；`orderedEventIds` 不重复且都属于该关；`contracts` 与 `orderedEventIds` 逐位对齐，文案非空。运行时 `CANON_RAIL_PROFILES` = TS 手审档 + catalog `rails` + 生成档，再统一套 `DEFAULT_LINE_EXTRA_RAIL_BEATS`；同一 `modId` 不得同时留在 TS 里（测试钉数组长度等于 modId 去重数）。

**事件 `presentation.uiChapterId`**（包内 stage）：界面章名改标同一关里这一章的标题，不改挂章、activation 与 rail 归属。用于整关停在 rail 章上、后几幕的拍仍要照幕标的情形。未写时 `storyChapterTitle` 用调用方给的回退（通常是当前所在章）。编译期校验指向同一关已有章 id。不进合同哈希（哈希只算 `playerCompletionContract`）。

**章 `presentation.mood`**（包内 stage）：本章配乐，取值必须是 `src/utils/musicLibrary.ts` 的 `MusicMood`（编译期按源码里的类型声明校验）；章 `presentation` 目前只收 `mood`。`resolveMusicMoodForChapter` 先查 catalog，再回退 TS 里的 `CHAPTER_MOOD_MAP` 与模式规则。

秦线示例：`packs/qingyu/rails.json`；`stage-qin-xianyang.json` 后三幕与三个条件拍的 `uiChapterId`、序幕章 `mood: "court"`。

## 2026-11-11 多包与包间依赖（阶段 3a）

**manifest `dependsOn`**（可选，缺省 `[]`）：字符串数组，列出本包要引用的其他包 id。必须是已存在的包、不能是自己、不能重复、不能成环（报错给出环路 `a → b → a`）。可见性按传递闭包算：A 依赖 B、B 依赖 C，则 A 可引用 C 的 id。

**编译顺序**：按 `dependsOn` 拓扑排序，同时就绪的按目录名取；各类条目按这个顺序拼接。下一步表 `lineCompass.lines` 合并后再按 `NATION_LINE_IDS` 稳定排序，右栏线顺序与包顺序无关。

**归属规则**（只在编译期做，catalog 不记归属）：
- 包定义的 id：正文键；包内关的 stage id、事件 id、章 id；任务线 id、beat id；合同 `meta.id`；实体 `entry.id`；lineCompass 的 `lineId`；timeline 插入项、试玩、入口、状态、地图路线、地图入口、暂扣动作、rail 的 `id`；questLineResources 各表的键；overlay 新增的事件（既非内置事件、也非某包关内事件）。内置关（builtins/data）和 mod-kit 的 id 不登记，任何包可引用（到阶段 4 为止）。
- 同一种类的同一 id 由两个包定义 → `<种类> id X defined by both A and B`。不同种类同名不算冲突（如地图入口 `qin` 与线 `qin`）。
- 引用：扫描每个包的原始资产（`$text`／数值解析之前；正文文件的值不扫），对每个字符串（含对象键）取候选：整串；去掉账本前缀 `done|flags|line|acq|identity|knows.player|item|party|deadline|unlock|compass.` 后的部分，及其再去 `.outcome|.from|.status|.state` 后缀；按 `::`、`:` 拆开的各段。候选整串等于某包定义的 id，而定义它的包都不在本包及其依赖闭包内 → `P references X owned by Q; add dependsOn`。只做整串相等，不做子串匹配。
- 地图入口的 `previewTextId`／`returnLabelTextId`／`returnTextId`／`returnChronicleTextId` 写了就必须是已有正文键。

**重建与回滚**：`node scripts/content-packs.mjs` 先纯数据编译（不加载会读 `generated/catalog.json` 的 TS 模块），把新 catalog 写到位（旧文件先备份），再起子进程用 TS 校验器（validator／lint／questLines，它们加载时读磁盘上的 catalog）校验；失败则恢复旧文件（原来没有就删掉新文件）并报错。所以删掉 `catalog.json` 后单次重建即可。`--check` 不写文件：编译结果与磁盘不一致即报过期，一致再做 TS 校验。`compileContentPacks()` 只编译不写，其 TS 校验看到的是磁盘上的 catalog。

## 2026-11-11 秦线独立包（阶段 3b）

秦线是第一个独立的线包：`packs/qin/`，manifest `id: "qingyu.qin"`，`dependsOn: ["qingyu.core"]`。目录里有 `manifest.json`、`stage-qin-xianyang.json`（关）、`qin-texts.json`（关内正文）、`texts.json`（下一步表、地图入口预览与返回的 14 个正文键）、`line-compass.json`（只有 `lineId: "qin"` 一条）、`map-entries.json`（地图入口 `qin`）、`rails.json`。其中 `stage-qin-xianyang.json`、`qin-texts.json`、`map-entries.json`、`rails.json` 从 `packs/qingyu/` 整文件原样移来，`texts.json` 与 `line-compass.json` 是从核心包同名文件里拆出来的；上文「秦线示例」里的 `packs/qingyu/rails.json` 现在在 `packs/qin/rails.json`。
核心包 `packs/qingyu/` 里不再有秦专属 id，`tests/contentPackSplit.test.mjs` 会检查这一点，并把秦包并回核心包后编译，结果必须与拆开时一致（texts 键序与 `version` 除外）。新增线包照这个结构来：一条线一个目录，依赖核心包，只放本线的关、正文、下一步表条目与入口。

## 2026-11-11 线路格式 stageMeta／railExtraBeats／secondaryLines（宋线 S2）

三个 manifest 字段，都是 JSON 文件路径数组，每个文件是数组；三者只建机制，现有线的数据仍在 TS 里，迁哪条线就把那条线的条目从 TS 删掉、写进包里（同一条目两边都有 → 编译报错）。都只按 id 查编译后的 catalog，不读存档里烘焙的事件/章对象。条目里的 `note` 只给作者看，编译时剥掉。

**manifest `stageMeta`**：一关一条，`stageId` 可以是包内关，也可以是内置关（builtins/data，全局 id）：

```json
[{
  "note": "可选",
  "stageId": "<关 id>",
  "defaultLineQuarantined": true,
  "milestoneReward": {"titles": ["<称号>"], "revokeTitles": ["<可选，剥夺的称号>"], "note": "<授予说明>"},
  "presentation": {
    "defaultUiChapterId": "<该关的章 id：本关事件没单写 uiChapterId 时界面标这一章>",
    "chapters": {"<该关的章 id>": {"mood": "<MusicMood>"}},
    "events": {"<该关的事件 id>": {"uiChapterId": "<该关的章 id>", "mood": "<MusicMood>", "objective": "<玩家目标>"}}
  }
}]
```

各键都可选（`stageId` 除外）。编译期校验：只认上列字段；`stageId` 是已有关、全部 stageMeta 里不重复；章、事件属于这一关（事件含 overlay 并入的）；`uiChapterId`／`defaultUiChapterId` 是这一关有标题的章；`mood` 属于 `MusicMood`；`objective` 非空；事件 id、章 id 在全部 stageMeta 里只出现一次；包内关已写 `presentation.uiChapterId` 的事件、已写 `presentation.mood` 的章不得再写。编译器给条目补 `chapterTitles`（章 id → 标题），运行时据此出章名。与 TS 表重复即报错：隔离关在 `canonRail.ts` 的 `TS_DEFAULT_LINE_QUARANTINED_STAGE_IDS`、称号在 `MILESTONE_REWARDS`、目标在 `fixedQuestObjectives.ts`（表与三条特判）、配乐在 `musicLibrary.ts` 的 `CHAPTER_MOOD_MAP`／`EVENT_MOOD_MAP`、章名已由 `storyChapterTitle` 的特判或包内关 presentation 决定（`defaultUiChapterId` 用探针事件查整关特判，内置关另逐个查本关事件）。

读取顺序（新段为空时与原来逐项相同）：
- 隔离：`DEFAULT_LINE_QUARANTINED_STAGE_IDS`／`isDefaultLineQuarantinedStageId` = TS 表，stageMeta 写了 `true` 的加入、写了 `false` 的去掉。
- 称号：`milestoneRewardFor(stageId)` 先 stageMeta，再 `MILESTONE_REWARDS`。
- 章名 `storyChapterTitle`：地图入口口信拍 → 各关特判（stage_04、04b、临安、汉宫、洛都、长安初定、长安插曲）→ 包内关事件 `presentation.uiChapterId` → **stageMeta 事件 `uiChapterId` → stageMeta `defaultUiChapterId`** → stage_02 地点分段 → 回退。所以迁临安时要在同一 PR 删掉临安特判，否则编译报「shadowed」。
- 配乐：章 = 包内关章 `presentation.mood` → stageMeta 章 mood → `CHAPTER_MOOD_MAP` → 章 id 正则；事件锚点 = stageMeta 事件 mood → `EVENT_MOOD_MAP`。
- 目标：三条特判 → stageMeta 事件 `objective` → `FIXED_QUEST_OBJECTIVE_OVERRIDES` → `event.objective`。

**manifest `railExtraBeats`**：形状同 `canonRail.ts` 的 `DEFAULT_LINE_EXTRA_RAIL_BEATS` 条目，`afterEventId` 与 `beforeEventId` 二选一，文案可用 `{"$text":…}`：

```json
[{"note": "可选", "modId": "<有包 rail 的关>", "afterEventId": "<rail 里已有的事件>",
  "eventIds": ["<该关事件>"],
  "contracts": [{"eventId": "<同位事件>", "mustReach": "…", "completionEvidence": [], "forbiddenInCanon": ["…"], "allowedElaboration": "…"}]}]
```

编译器用 `canonRailMerge.ts` 的 `mergeExtraRailBeats`（运行时 TS 加拍表用的同一个函数，报错文案相同）并进同一次编译里同 `modId` 的包 rail，再过上面 rail 的全部校验；catalog 只存合并后的 rail，没有 `railExtraBeats` 段。`modId` 没有包 rail → 报错。同一 `modId` 的包 rail 不能同时出现在 TS 的 `DEFAULT_LINE_EXTRA_RAIL_BEATS` 里（运行时会再插一次）。

**包 rail 的动态名字**：rail（含加拍）文案里可写 `{{entity:<kind>:<id>}}`（显示名，同 `namedEntities.ts` 的 `entityText`）和 `{{entityLabel:<kind>:<id>:<labelId>}}`（`entityRecognitionLabel`，标签在 `mod-kit/entity-ledger/overrides.json` 的 `recognitionLabels`）。kind 取 character／location／faction／enemy／ending。catalog 里保留模板原样，`canonRail.ts` 合并包 rail 时用 `entityTemplateText` 解析，名字跟着实体总表走。编译期校验写法、实体存在、标签存在；其它 `{{…}}` 一律报错。

**manifest `secondaryLines`**：每条是 `SecondaryLine`（见 `secondaryLines.ts`）加 `after`（插在哪条线后面）和可选 `note`；节点也可带 `note`（TS 里夹在节点之间的 `//` 注释搬到下一个节点的 `note`）：

```json
[{"after": "<已有线 id>", "id": "<新线 id>", "name": "…", "kind": "nation",
  "anchorEventIds": ["<事件>"], "anchorLocationIds": ["<地点>"], "entryHint": "…", "basis": "…",
  "nodes": [{"note": "可选", "reviewSummary": "…", "status": "ready", "stageId": "<关>", "eventId": "<该关事件>"},
            {"reviewSummary": "…", "status": "pending"}]}]
```

编译期校验：只认 `SecondaryLine` 字段加 `after`／`note`；`kind` ∈ sect／nation／commerce／expedition，`status` ∈ ready／new／pending；`ready` 节点的关存在、事件属于该关；锚事件存在（`anchorEventPending: true` 的除外）；`anchorLocationIds` 在 `locations.json`（含别名）；包线之间 id 不重复、不能有两条 `after` 同一条线；`after` 能找到（TS 线或另一条包线，不能成环）、id 不与 TS 线重复（validateWithTs）。运行时 `SECONDARY_LINES` = `mergeSecondaryLines(TS_SECONDARY_LINES, catalog.secondaryLines)`：每条包线紧跟在 `after` 那条后面，输出不带 `after`。

**归属**：`secondaryLines` 的线 id 登记为包定义（种类 `secondaryLine`）；三段里写到的关、章、事件、rail 的 `modId` 走通用字符串扫描，引用别的包定义的 id 要 `dependsOn`（`tests/contentPackLineFormats.test.mjs` 钉住）。注意 `after` 也是普通字符串：核心包下一步表登记了 `lineId` `jin`／`han` 等，包线 `after: "jin"` 会被算成引用核心包。

catalog 新增两个顶层段 `stageMeta: []`、`secondaryLines: []`（为空时 version 也随之变化，内置模组重新播种一次）。

## 2026-11-11 宋线数据进包（宋线 S4）

宋包 `packs/song/`（`id: "qingyu.song"`，`dependsOn: ["qingyu.core"]`）：`rails.generated.json`（宋 6 个生成档）、`rail-extra-beats.json`（宋 13 条加拍，编译时并进上面的档）、`stage-meta.json`（宋 8 关：隔离、称号、章名、配乐、目标）、`secondary-lines.json`（`song` 线，`after: "jin"`）、`line-compass.json`（`lineId: "song"`）、`texts.json`（11 个 `lineCompass.song.*`）。宋 8 关的 stage JSON 仍在 `builtins/data`（全局 id）。

本批对前文的改动：
- `CANON_RAIL_PROFILES` = TS 手审档 → 挂包内关的包 rail（秦）→ 挂内置关的包 rail 与生成档合在一起按 `modId` 排（等于生成器按关文件名写出的顺序），再统一套 TS `DEFAULT_LINE_EXTRA_RAIL_BEATS`。宋 6 档搬进包后数组顺序与搬前相同（`tests/songPackMigration.test.mjs` 钉住）。
- rail 生成器 `build-canon-rail-profiles.mjs`：包 manifest `rails` 里文件名以 `.generated.json` 结尾的文件「认领」其中各档的 `modId`，生成的档写回那个包文件，不进 `canonRailProfiles.generated.json`；手写 rails 文件认领、两个文件认领同一关、认领了却没生成，一律报错（`scripts/canon-rail-routing.mjs`，`tests/canonRailRouting.test.mjs`）。
- 称号：TS 表改名 `TS_MILESTONE_REWARDS`；`MILESTONE_REWARDS` 改为合并值（stageMeta 的 `milestoneReward` 按 catalog 顺序在前，TS 表在后），编译期重复检查查 `TS_MILESTONE_REWARDS`。
- 章名特判里的临安分支已删，改由宋包 stageMeta 的 `defaultUiChapterId` 与首章 10 拍的 `uiChapterId` 供数。

## 2026-11-11 晋线数据进包（晋线 S4）

晋包 `packs/jin/`（`id: "qingyu.jin"`，`dependsOn: ["qingyu.core"]`）：`rails.generated.json`（晋 3 个生成档：stage_07／08／09）、`rail-extra-beats.json`（晋 6 条加拍）、`stage-meta.json`（晋 3 关：10 条目标、1 条事件配乐；晋没有隔离关、称号、章名特判、章配乐、手审 rail 档）、`secondary-lines.json`（`jin` 线，`after: "zhaonan"`）、`line-compass.json`（`lineId: "jin"`）、`texts.json`（9 个 `lineCompass.jin.*`）。晋 3 关的 stage JSON 仍在 `builtins/data`。

与宋不同之处：
- **宋包 `dependsOn` 加了 `qingyu.jin`**：宋线 `after: "jin"` 是对晋包线 id 的引用，归属检查要求宋包能看见晋包（`qingyu.song references jin owned by qingyu.jin`）。晋包不引用宋包定义的任何 id，不成环。包顺序随之为 core → jin → qin → song。
- `CANON_RAIL_PROFILES` 拼装没改：晋没有手审档，3 个生成档进包后照宋 S4 的规则按 `modId` 归位，全表顺序与搬前相同（`tests/jinPackMigration.test.mjs`）。catalog 的 `rails` 段按包顺序拼接，晋档排在秦档之前；运行时只认按关分组后的顺序，不受影响。`tests/contentPackSplit.test.mjs` 的比较口径相应把 `rails` 按 `modId` 排后再比。
- 二级线：`jin` 是包线、`song` 接在它后面（链式 `after`）。`tests/contentPackLineFormats.test.mjs` 的二级线与事件配乐夹具改为从 TS 表动态取第一条现存条目（`TS_SECONDARY_LINES[0]`、`EVENT_MOOD_MAP` 首条），表搬空时须改用合成的临时 TS 条目。
- 未搬（留在 TS）：`eventNarrativeView.ts` `legacyNarrativeVariants` 里 `s07_05_eight_steeds_informed` 的谢艺生还改写（stageMeta 无此字段）；`divergenceLedger.ts` 挂 `s08_06_pursuit_repelled` 的分歧项；别的线挂在晋事件上的节点与锚。

## 2026-11-11 太泉线数据进包（太泉线 S4）

太泉包 `packs/taiquan/`（`id: "qingyu.taiquan"`，`dependsOn: ["qingyu.core", "qingyu.song"]`）：`rails.generated.json`（太泉 3 个生成档：圣果／核心冲突／余波）、`rail-extra-beats.json`（4 条加拍）、`stage-meta.json`（3 关：5 条事件配乐、2 条目标；太泉没有隔离关、称号、章名特判、章配乐、手审 rail 档）、`secondary-lines.json`（`taiquan` 线，`after: "commerce"`）、`line-compass.json`（`lineId: "taiquan"`）、`texts.json`（7 个 `lineCompass.taiquan.*`）。3 关的 stage JSON 仍在 `builtins/data`。

与宋、晋不同之处：
- **太泉包 `dependsOn` 加了 `qingyu.song`**：二级线 `entryHintKeys.variants.song`（进太泉的原著版说法）这个对象键整串等于宋包定义的线 id `song`，归属检查扫对象键，报 `qingyu.taiquan references song owned by qingyu.song`。宋包不引用太泉包定义的任何 id（宋下一步表引用的太泉圣果关是内置关，不归包），不成环；包顺序 core → jin → qin → song → taiquan。键名由 `lineUnlock.ts` 读取，不改名。
- 二级线 `taiquan` 带 `unlock`、`entryHintKeys`（S2 白名单已认，节点 `beforeUnlock` 也已认），原样进包；`entryHintKeys` 里引用的 `line.taiquan.*` 正文键仍在核心包 `texts.json`（不属 `lineCompass.*`，本批不搬），太泉包依赖核心包可见。
- 核心包 `line-compass.json` 里 `taiquan` 原是最后一条，切掉后前一条（`tang`）的 `},` 改成 `}`，其余字节不动；catalog 的 `lineCompass` 段逐字节同搬前。
- 加拍表里领起「汉线补全」的三行注释夹在太泉圣果与太泉余波条目之间、同时领起其后洛都（汉关）条目：TS 里保留，复制进包里第一条余波加拍的 `note`。
- 未搬（留在 TS）：`fixedQuestObjectives.ts` 里 `han_shouyang_gaoyanei` 的 packText 目标特判、`eventNarrativeView.ts` 的 `storyActionPresentation`（同一事件到舞都改写）；`lineUnlock.ts`、`loadRepairs.ts` 的太泉逻辑；别的线挂在太泉事件上的节点。

## 2026-11-11 汉线数据进包（汉线 S4）

汉包 `packs/han/`（`id: "qingyu.han"`，`dependsOn: ["qingyu.core", "qingyu.song"]`）：`rails.generated.json`（汉 5 个生成档；隔离关 `lyl.luoyang_coup` 没有档）、`rail-extra-beats.json`（汉 4 条加拍）、`stage-meta.json`（汉 6 关：隔离 1、称号 2、章名、章配乐 5、事件配乐 7、目标 15）、`secondary-lines.json`（`han` 线，`after: "song"`）、`line-compass.json`（`lineId: "han"`）、`texts.json`（10 个 `lineCompass.han.*`）。汉 6 关的 stage JSON 仍在 `builtins/data`。

与宋、晋不同之处：
- **汉包 `dependsOn` 加了 `qingyu.song`**（`after: "song"`）。包顺序按依赖排为 core → jin → qin → song → han，不再是目录名序：catalog 的 `stageMeta`／`rails`／`secondaryLines` 里汉条目排在最后。
- **`MILESTONE_REWARDS` 合并值改按故事序排**：stageMeta 与 TS 表合并后按 `mainQuestAxis.ts` 的 `STAGE_ORDER` 稳定排序（不在其中的包内关排最后、保持合并前相对顺序）。故事序就是搬迁前 TS 表的原顺序（宋→汉→唐），所以快照钉的数组顺序不变；唐线搬称号时不用再改。
- **章名特判删了汉宫、洛都两处**，改由汉包 stageMeta 供数：汉宫 `defaultUiChapterId`＝「汉宫突入」章、「宫变之夜」8 拍逐事件 `uiChapterId`；洛都只给「洛都风云」4 拍写 `uiChapterId`、不设默认章。导出名 `HAN_PALACE_NIGHT_EVENT_IDS`、`LUOYANG_COURT_EVENT_IDS` 保留（快照钉住），改为从 stageMeta 派生（`stageMeta.ts` 新增 `stageMetaUiChapterEventIds`，按文件顺序）。
- 隔离集合 `DEFAULT_LINE_QUARANTINED_STAGE_IDS` 的成员不变，迭代顺序随包序变了（`lyl.luoyang_coup` 从 TS 段移到末尾）；所有读取方只用 `.has`。
- `dingtao_beijing.json` 里的 3 处 `presentation` 是 `timeline.reveal.presentation`（急报标题与正文），不是界面章名字段，与 stageMeta 不重叠。
- `tests/contentPackLineFormats.test.mjs` 宋 S4 留下的汉夹具（汉宫整关章名特判、洛都封侯称号、`liujian_takes_nangong` 目标、`luoyang_cloud_secret` 章配乐、`luoyang_coup` 隔离、`han` 二级线同 id）改为动态挑：章配乐取 `CHAPTER_MOOD_MAP` 首条、称号取 `TS_MILESTONE_REWARDS[0]`、目标取 `FIXED_QUEST_OBJECTIVE_OVERRIDES` 首键、隔离取 TS 表里非 `lcq.stage_03` 的一条、整关章名特判用表外探针事件按行为挑、二级线同 id 用 `TS_LINE_ID`；表或特判搬空时顶层断言报错，须改用合成的临时条目。
- 未搬（留在 TS）：`LINE_CRITICAL_EVENTS`；别的线挂在汉事件上的节点；`lyl.event.han_shouyang_gaoyanei` 的目标 packText 特判与动作特判（事件属太泉余波关）。

## 2026-11-11 塞外线数据进包（塞外线 S4）

塞外包 `packs/saiwai/`（`id: "qingyu.saiwai"`，`dependsOn: ["qingyu.core"]`）：`rails.json`（塞外 2 个**手审**档：stage_01／02，带 `handReviewed: true`）、`stage-meta.json`（3 关：stage_03 隔离、3 条章配乐、15 条事件配乐、2 条目标）。塞外不是国家线：没有二级线、下一步表、`lineCompass.*` 正文；没有生成档、加拍、称号。3 关的 stage JSON 仍在 `builtins/data`。

与宋、晋、太泉不同之处：
- **手审 rail 档进包**：TS `HAND_REVIEWED_CANON_RAIL_PROFILES` 原样搬进手写 `rails.json`，`entityName(kind,id)`／`entityRecognitionLabel(kind,id,label)` 改写为 `{{entity:kind:id}}`／`{{entityLabel:kind:id:label}}`（运行时解析，结果与搬前逐字相同）。TS 常量保留为空数组。
- **保序靠 `handReviewed: true`**：包 rail 条目可选字段，只收 `true`，只许挂内置关（挂包内关编译报错）。`CANON_RAIL_PROFILES` = TS 手审档 → **包 rail 里 `handReviewed: true` 的档（按包顺序、文件内顺序，运行时去掉该标记）** → 挂包内关的包 rail（秦）→ 其余挂内置关的包 rail 与生成档按 `modId` 排。没写这个字段的手写 rails 文件仍按 `modId` 归位（与原规则相同）。全表顺序与搬前相同（`tests/saiwaiPackMigration.test.mjs`）。
- rail 生成器仍用 `manualStageIds` 排除 stage_01／02；万一生成出来，路由会因手写 `rails.json` 认领而报错（fail closed），不会覆盖。
- 隔离：`lcq.stage_03` 从 TS 隔离表移到 stageMeta `defaultLineQuarantined: true`。成员不变，`DEFAULT_LINE_QUARANTINED_STAGE_IDS` 的迭代顺序变了（stage_03 排到 TS 剩余各关之后）；现有读取方只用 `.has()`。`tests/contentPackLineFormats.test.mjs` 的 TS 隔离夹具改为从 `TS_DEFAULT_LINE_QUARANTINED_STAGE_IDS` 动态取（避开注入成 false 的 `lyl.luoyang_coup`）。
- 未搬（留在 TS）：`fixedQuestObjectives.ts` 与 `formatQuestCompass` 的 `s02_04` 特判；`eventNarrativeView.ts` 里 stage_02 按地点分段的章名算法（含 `storyRouteLocation` 表）与 `legacyNarrativeVariants` 的 `gamble_bond_signed`／`ningyu_enters_gamble` 条件改写；开局/试玩代码、`loadRepairs.ts` 的 stage_01 旧短语快照；别的线挂在塞外事件上的节点。

## 2026-11-11 唐线数据进包（唐线 S4）

唐包 `packs/tang/`（`id: "qingyu.tang"`，`dependsOn: ["qingyu.core", "qingyu.han"]`）：`rails.generated.json`（唐 6 个生成档；隔离关 `lyg.ganlu_bian`、`lyg.shixiang_ambush` 没有档）、`rail-extra-beats.json`（唐 8 条加拍）、`stage-meta.json`（唐 6 关有条目：隔离 2、称号 1、章名 2 关、章配乐 3、事件配乐 5、目标 2）、`secondary-lines.json`（`tang` 线，`after: "han"`）、`line-compass.json`（`lineId: "tang"`）、`texts.json`（8 个 `lineCompass.tang.*`）。唐 8 关的 stage JSON 仍在 `builtins/data`。

与宋、晋、汉不同之处：
- **长安初定、长安插曲两处章名特判删掉**，改由唐包 stageMeta 供数：长安初定 `defaultUiChapterId`＝「抵达长安灞桥」、留仙坪 3 拍逐事件 `uiChapterId`＝「留仙坪」；长安插曲三章（年节与朝局／失踪与伏击／甘露前夜）的拍逐事件写 `uiChapterId`，**不设默认章**（原特判 `?? fallback`）。至此 `eventNarrativeView.ts` 已没有整关章名特判。
- 导出名 `LIUXIANPING_EVENT_IDS` 保留，照汉线用 `stageMetaUiChapterEventIds` 派生；`CHANGGAN_INTERLUDE_CHAPTER_EVENT_IDS`（`[章名, 事件集合][]`）用新增的 `stageMetaUiChapterGroups(meta, stageId)` 派生：按 `uiChapterId` 分组，章按 events 里首次出现的顺序、事件按文件顺序，章名取编译器写入的 `chapterTitles`。
- **`TS_MILESTONE_REWARDS` 搬空**（`[]`），全部称号都在 stageMeta；`MILESTONE_REWARDS` 照汉线按 `STAGE_ORDER` 排，顺序不变。
- `tang` 是 `TS_SECONDARY_LINES` 与核心包 `line-compass.json` 的最后一条：TS 侧删块后 zhaonan 收尾 `},` 原样；JSON 侧前一项的 `},` 改 `}`。
- `tests/contentPackLineFormats.test.mjs`：称号与整关章名特判两类 TS 侧都已搬空，改用**合成的临时 TS 条目**——用例内往 `TS_MILESTONE_REWARDS` 临时推一条、临时替换 `eventNarrativeView` 模块导出的 `storyChapterTitleIn`（编译器与测试经 jiti 共用模块缓存，拿到同一模块对象），用完还原；「既有特判先于 stageMeta」改用 `lcq.stage_04` 逐拍特判。

## 2026-11-11 昭南（南荒）线数据进包（昭南线 S4）

昭南包 `packs/zhaonan/`（`id: "qingyu.zhaonan"`，`dependsOn: ["qingyu.core"]`）：`rails.generated.json`（4 个生成档：03b／04／04b／05b）、`rail-extra-beats.json`（7 条加拍）、`stage-meta.json`（6 关：05／06 隔离、3 条章配乐、14 条事件配乐、13 条目标）、`secondary-lines.json`（`zhaonan` 线，`after: "heimohai"`）、`line-compass.json`（`lineId: "nanhuang"`）、`texts.json`（12 个 `lineCompass.nanhuang.*`）。6 关的 stage JSON 仍在 `builtins/data`。

与宋、晋、汉、塞外不同之处：
- **两个 id**：下一步表 lineId 是 `nanhuang`、正文键 `lineCompass.nanhuang.*`；二级线 id 是 `zhaonan`。包目录与包 id 用 `zhaonan`。
- **包二级线可写 `{{entity:…}}`／`{{entityLabel:…}}`**（本线是第一条带动态名字的包线：3 个节点的 `reviewSummary` 与 `pendingExpansion` 原用 `entityText(...)`）。运行时 `secondaryLines.ts` 在并入 TS 表之前解析（同包 rail，名字不冻进 catalog）；编译器把 `secondaryLines` 并进原有的 rail 模板校验（实体、标签须存在，报错前缀仍为 `rail entity`）。`mergeSecondaryLines` 本身不解析，编译期的 `validateWithTs` 拿到的是模板原文。
- **加拍里的 `entityText(...)`** 直接写成模板串：加拍编译时并进包 rail，由 rail 原有的解析处理。
- **晋包 `dependsOn` 加 `qingyu.zhaonan`**（晋线 `after: "zhaonan"`）。包拓扑序因此变为 … → saiwai → zhaonan → jin → song → …，catalog 里 `rails`／`stageMeta` 的拼接顺序跟着变；运行时 `CANON_RAIL_PROFILES` 按关分组排序，不受影响。
- 保序：本线没有手审档，4 个生成档进包后照宋 S4 的拼装按 `modId` 归位，没改拼装代码。
- 隔离：05／06 移到 stageMeta，成员不变，`DEFAULT_LINE_QUARANTINED_STAGE_IDS` 迭代顺序变了（同汉、塞外）。
- 未搬（留在 TS）：`eventNarrativeView.ts` 里 stage_04 的逐事件章名表与 04b 的多分支——返回的是写死的「第46章·袭击」「海神殿」「商队与峒使」等，不是该关已有章的标题，stageMeta 的 `uiChapterId` 表达不了；`legacyNarrativeVariants` 的 `shanghou_revealed` 条件改写；`fixedQuestObjectives.ts` 里用 `entityText` 的两条目标（`wuerlang_slays_dagu`、`s05b_02_xiaozi_exposed`，stageMeta 的 objective 不解析模板）与 `huamiao_coop_boundary` 特判；别的线挂在昭南事件上的节点与锚。`tests/contentPackLineFormats.test.mjs` 的「逐事件特判与默认章重叠」反例用的就是留在 TS 的 stage_04 特判。

## 2026-11-11 核心与人物数据的新包格式（F0a）

六个 manifest 新字段加 `secondaryLines` 的一条新规则，只建机制，现有数据仍在 TS 里；迁哪张表就把那张表的条目从 TS 删掉、写进包里（同一条目两边都有 → 编译报错，`storyAxis` 例外，见下）。都是 JSON 文件路径数组；`lineCriticalEvents` 的文件是数组，其余五种的文件是对象。条目（以及文件顶层）的 `note` 只给作者看，编译时剥掉——TS 里夹在条目之间的 `//` 注释搬到下一条的 `note`，表尾没有下一条的注释搬到文件顶层 `note`。编译逻辑在 `scripts/content-pack-core-formats.mjs`，catalog 形状的类型在 `src/modules/contentPacks/coreFormats.ts`。读取函数仍同步、无副作用，导出名与类型不变；新段为空时合并值与原 TS 表逐项相同（`tests/contentPackCoreCharacterFormats.test.mjs` 钉住）。

**`secondaryLines` 首条**：全部包线里至多一条不写 `after`，它排最前；只在 `TS_SECONDARY_LINES` 为空时允许（`omits after, but TS_SECONDARY_LINES is not empty`）。catalog 里这一条没有 `after` 键。包线文案里可写 `{{entity:<kind>:<id>}}`／`{{entityLabel:<kind>:<id>:<labelId>}}`，写法与实体在编译期校验，catalog 留模板，`SECONDARY_LINES` 合并时解析（同包 rail）。

**`lineCriticalEvents`**：`[{"note":"可选","eventId":"<事件>","lineId":"<二级线>"}]`。事件存在（隔离关事件也算）；`eventId` 全部包里不重复；`lineId` 是 TS 线或同一次编译里的包线；不能同时在 TS 表里。运行时 `LINE_CRITICAL_EVENTS` 仍是原来那个对象：TS 条目在前，包条目按 catalog 顺序就地并入；`TS_LINE_CRITICAL_EVENTS` 是并入前的拷贝。`lineCriticalFrozen` 不变。

**`characterBeats`**：`{"quests":[{"id","name","beats":[{"reviewSummary","status","eventIds":[],"note?"}],"note?"}],"highlights":[{"name","eventIds":[],"reviewSummary","note?"}]}`，字段同 `CharacterQuest`／`CharacterHighlight`。`status` ∈ ready／new／insert；ready／insert 的 `eventIds` 都存在，**new 的（建议 id）都必须不存在**；quest id 全部包与 TS 表里唯一（不进通用归属扫描，见下文「归属」）；同名且 `eventIds` 相同的高光不得重复（含与 TS 表）。`CHARACTER_QUESTS`／`CHARACTER_HIGHLIGHTS` = TS 表在前、包按 catalog 顺序在后（`mergeCharacterBeats`）。

**`storyAxis`**：`{"note?","stageOrder":[],"layers":[],"stages":[],"nodes":[],"requirements":[]}`，各段条目字段同 `mainQuestAxis.ts` 的类型，可带 `note`。全局至多一份；**有包声明时 `TS_STAGE_ORDER`／`TS_MAIN_QUEST_LAYERS／STAGES／NODES／REQUIREMENTS` 必须全空**（二选一，不逐条合并，`resolveStoryAxis`）。编译期：`stageOrder` 等于从首项沿 `manifest.nextStageId` 走出的链（不分叉、无环、走到没有 `nextStageId` 为止）并覆盖全部内置关（包内关可以不在链上，现状如此：秦关没有 `nextStageId`）；`layer` 是 1–6 的整数、不重复，`restricted` 只收 `true`；`unlockStageIds`、`stages[].stageId`、`nodes[].stageId` 是已有关；`pillars` ⊆ bloodline／taiquan；ready 节点的 `eventId` 属于该关、pending 节点不写 `eventId`；`locationId` 在 `locations.json`（含别名）；`bloodlineBranch`、`requirements[].id` 取类型里的枚举值。

**`locationAliases`**：`{"note?","canonical":{"<旧 id>":"<规范 id>"},"parents":{"<子>":"<父>"},"display":{"<id>":{"name","displayAliases?":[]}}}`。比方案多了 `parents`（`LOCATION_PARENTS` 也是地点数据表）。`canonical` 的值是 `locations.json` 的规范 id、不是另一条别名的键（不成链，含 TS 表），键不是 `locations.json` 已有的别名（否则会覆盖实体总表派生的那条）；`parents` 两端在 `locations.json`（含别名），合 TS 表后不成环；`display` 的键在 `locations.json`（含别名）。三张表的键全部包里唯一、不得与 `TS_LOCATION_ID_ALIASES`／`TS_LOCATION_PARENTS`／`TS_LOCATION_NAMES` 重复。运行时 `LOCATION_ID_ALIASES` = 实体总表派生 → TS 手写 → 包（仍 `Object.freeze`）；`LOCATION_PARENTS`／`LOCATION_NAMES` = TS → 包（`mergeLocationTable`）。

**`characterProfiles`**：`{"stance":[{"entities":[{"kind":"character|enemy","id"}],"extraNames?":[],"constant":[],"bands":{"low|mid|high":[]},"note?"}],"affinityCaps":[{"entities":[…],"extraNames?":[],"capTier":"<AFFINITY_TIERS id>","reason","liftedBy","note?"}]}`。`names` 运行时算：`entities` 逐个 `entityAliases` 展开（**可重复**，原表就有同一角色写两三遍的条目，展开后的重复名字原样保留）再接 `extraNames`；原表 names 都是「实体在前、字面名字在后」，逐条还原核过。`cap` = `capTier` 那档的 `max`。实体存在；展开后的名字在同一张表的两条里不能重复（`find` 取第一条，重复即后一条失效），也不能与 TS 表重名；姿态与上限是两张表，同一人可两边都有。`STANCE_PROFILES`／`AFFINITY_CAPS` = TS 表在前、包按 catalog 顺序在后，顺序即优先级。

**`ifBranches`**：`{"branches":[{"eventId","branchId","requiredCharacterId","acceptedStatuses":["alive",…],"flagCharacterSlug","normalizedStatus","prompt?","note?"}],"consequences":[{"eventId","requiredCharacterId","acceptedStatuses":[…],"flagKey","flagValue","prompt?","note?"}],"prompts":{"<分歧记录 id>":"…"}}`。`acceptedStatuses` 是不重复的小写字母串，运行时编译成与原表同形的正则（一个 `^x$`、多个 `^(a|b)$`，`i` 标志；原表三种写法都能这样表达，测试逐条核对）。事件存在、`requiredCharacterId` 是角色；`branchId` 归属种类 `ifBranch`，全部包与 TS 表里唯一；同事件同人物的后果、`prompts` 的键不重复（含 TS）；`flagValue` 是字符串／数字／布尔。本批把 `formatDivergencePrompt` 的三元式改成查表：TS 规则表加 `prompt` 字段、按 id 的那条进 `TS_DIVERGENCE_PROMPTS`；查找顺序同原式——分支（按 `branchId`，没有 prompt 的分支继续往下）→ 分歧记录 id → 后果（同事件、人物状态命中；**状态不 trim**，同原式；落旗标的匹配仍 trim）。

**归属**：`ifBranch` 登记为包定义；六段的原始值都进通用字符串扫描，引用别的包定义的关、事件等要 `dependsOn`。**人物任务 id（`characterBeats.quests[].id`）不进通用归属扫描**（B2 起，原因见 B2 一节）：它是 characterBeats 段内的单独命名空间，别的包里恰好同名的字符串不算对人物包的引用；唯一性另行保证——全部包之间由编译期校验（两个包定义同一 id 报 `characterQuest id … defined by both A and B`，同包内重复报 `duplicate id`），与 TS 表之间由 `validateCoreFormatsWithTs`。人物拍点与高光里的事件 id 照常进通用扫描。

catalog 在 `secondaryLines` 之后新增六个顶层空段：`lineCriticalEvents: []`、`characterBeats: {quests:[],highlights:[]}`、`storyAxis: null`、`locationAliases: {canonical:{},parents:{},display:{}}`、`characterProfiles: {stance:[],affinityCaps:[]}`、`ifBranches: {branches:[],consequences:[],prompts:{}}`；其余字节不变，version 随之变化（内置模组重新播种一次，同宋 S2）。棘轮：`divergenceLedger.ts` 三元式里 7 行带 id 的判断改为规则表的 `prompt` 字段与 `TS_DIVERGENCE_PROMPTS`（新增 1 行键），实扫 23 → 17，基线同批重写（总数 1313 → 1307）。

## 2026-11-11 展示类数据的新包格式（F0b）

stageMeta 事件加六个字段、关级加一个字段，texts 加两种键名约定，manifest 加三个新段 `endings`／`openWorldSlices`／`persistentEntries`（都是 JSON 文件路径数组，每个文件是数组）。只建机制，现有数据仍在 TS 里；搬哪张表就把那张表的条目从 TS 删掉、写进包里（同一条目两边都有 → 编译报错；行旅切片、常驻入口按整份／整种二选一，见下）。条目 `note` 只给作者看，编译时剥掉。编译逻辑在 `scripts/content-pack-presentation-formats.mjs`，三个新段的类型在 `src/modules/contentPacks/presentationFormats.ts`，stageMeta 新字段的类型在 `src/modules/contentPacks/stageMeta.ts`。读取函数仍同步、无副作用，导出名与类型不变；新段、新字段为空时读取结果与原 TS 表逐项相同（`tests/contentPackPresentationFormats.test.mjs` 钉住，含一项把现有 TS 表整张写进包、临时搬空 TS 后编译并逐项对照的搬迁演练）。

**stageMeta 事件新字段**（`presentation.events[<事件>]`，与 `uiChapterId`／`mood`／`objective` 同级；整条 stageMeta 先做 `$text` 解析）：
- `uiChapterTitle`：直接给章名串（可 `{"$text"}`），与 `uiChapterId` 互斥；事件自带 `presentation.uiChapterId` 时不许写。优先级同 `uiChapterId`（地图入口口信拍 → TS 逐关特判 → 包内关 presentation → stageMeta），被 TS 特判遮住即报错（探针同宋 S2）。
- `routeLocation`：`storyRouteLocation` 的地点串；`_ins_` 事件不许写（读取时剥掉 `_ins_` 取主线事件）。查找：TS 表 `TS_STORY_ROUTE_LOCATIONS` → stageMeta。
- `compassObjectiveOnly: true`：任务栏罗盘只显示目标。
- `lockedDecision: [["<动作>","<文案>"],…]`：分支锁；首项是决定动作、必须是合同动作，其余可以是致命选项（`fatalOutcomes.choices`）；动作不重复。`LOCKED_DECISIONS` = TS 表在前、包按 catalog 顺序在后。
- `actionPresentation: [{"actionId","whenLocationId","label","playerLine"}]`：玩家在该地点时换动作展示（label、playerLine 可 `{"$text"}`）；动作是合同动作、地点在 `locations.json`，(动作, 地点) 不重复。查找：TS 表 → stageMeta。
- `compatNarrativeVariants: [{"when":[{path,operator:eq|neq,value}],"priority?":"before-event-variants","replacesCanonRail?":true,"name?","description?","axisBeat?","objective?","relatedFactionIds?":[],"note"}]`：声明化的旧档兼容变体，**`note` 必填（写来源）**。不带 `priority` 的条目只在事件没有自带 `narrativeVariants` 时生效（同原 `legacyNarrativeVariants`，按数组顺序取第一条命中，参与 `narrativeVariantReplacesCanonRail`）；带 `priority: "before-event-variants"` 的先于一切变体、只改写文案字段（`relatedFactionIds` 可覆写为空数组），不参与 `replacesCanonRail`（两者同写报错）。按事件 id 二选一：TS 表 `TS_COMPAT_NARRATIVE_VARIANTS` 有这个事件就不看包，编译期禁止两边都有。
- `objective`：除纯文本、`{"$text"}` 外，可写 `{{entity:<kind>:<id>}}`／`{{entityLabel:…}}`，编译期校验，catalog 留模板，`resolveFixedQuestObjective` 读时解析。

**stageMeta 关级 `presentation.uiChapterByRouteLocation`**：`{"keepFallbackEventIds?":[…],"rules":[{"routeLocationIncludes","title"}],"defaultTitle?"}`。该关事件（含 `_ins_`）的章名：在 `keepFallbackEventIds` 里 → 调用方的 fallback；否则取第一条 `storyRouteLocation` 包含 `routeLocationIncludes` 的规则的 `title`，都不中取 `defaultTitle`，没有 `defaultTitle` 取 fallback。排在事件级 `uiChapterTitle`／`uiChapterId` 与 `defaultUiChapterId` 之后，与 `defaultUiChapterId` 互斥；被 TS 章名算法遮住（探针事件或该关任一事件已有结果）即报错。

**texts 键名约定**：
- `actionDisplay.<事件>.<动作|*>.line` + `.label`（成对）：动作显示覆写；`*` 是事件级通配（任何动作都返回）。查找：包逐动作键 → 包通配键 → TS 表 `TS_ACTION_DISPLAY_OVERRIDES`（键 `<事件>::<动作>`，`<事件>::*` 为事件级）逐动作 → TS 事件级。同一事件包与 TS 重叠即报错。
- `scopedPlayerLine.<事件>::<动作>`：试玩事件窗的玩家句；查找：TS 表 `TS_PLAYER_LINES` → texts。两边都有即报错。
- 两种键都要求事件存在、非通配动作是该事件的动作或致命选项；键里的事件 id 进归属扫描。

**`endings`**：`[{"endingId","key?":"E01","battleLoss?":{"title","kind":"death|failure","sourceEventId","tierFlag":"….tier","tier","facts":[…]},"pathText?":{"sourceEventId","textKey"},"note?"}]`，三项可分可合，至少写一项。结局实体存在、`endingId` 不重复、`key` 全部包里唯一；`battleLoss` 的来源事件存在且有场面合同挂在它上面（否则 tierFlag 永远不会落）；`pathText` 的来源事件存在、`textKey` 是已有正文键。`endingKey`／`BATTLE_LOSS_ENDINGS`／来路分支句 = TS 表（`TS_ENDING_KEYS`／`TS_BATTLE_LOSS_ENDINGS`／`TS_ENDING_PATH_TEXTS`）在前、包按 catalog 顺序在后；同一结局（或同一编号）两边都有即报错。`canonicalEndingId`、`migrateLegacyE01Ending` 留在框架。

**`openWorldSlices`**：`[{"key","definition":<OpenWorldSliceDefinition 原样>,"stageIds?":[…],"stepSceneStagePrefixes?":[…],"positionNodes?":{"segment","placeLocationId","nodes?":[{"zoneId","names"}]},"constants?":{"<大写名>":"<id>"},"zoneRanks?":{"<zone>":<整数>},"actionJudgement?":{"<动作>":{"kind"}},"actionDescribe?":{"<动作>":"…"},"note?"}]`。`key` 是 TS 导出取用它的绑定名（`nanhuang`、`wuyuan`），归属种类 `openWorldSlice`；`definition.id` 全局唯一但**不登记归属**（核心包 `timeline.json` 的 `sliceEntered` 已引用五原切片 id，登记了就要核心包依赖塞外包，成环）。校验：区／路线／区域／告示／角色／问题／动作 id 各自唯一；路线起止、父区、告示所在、问题所在、后果改写的区存在，父区不成环；`worldLocationId`、`placeLocationId` 在 `locations.json`；`freeRoamWhen`、`heardWhen`、`unlockWhen`、`background.when`、`forcedBy.afterEventDone` 引用的事件（可带 `::动作`）存在；`forcedBy.stageTransition` 是 `<关>→<关>`；`requirementKey` 必须有告示或后果解锁；`stepSceneStagePrefixes` 至少匹配一个关、全局不重复；`actionJudgement.kind` 是 `JUDGEMENT_KINDS`。读取：按 `key` 与 TS 那份二选一（`resolveOpenWorldSlice`），包里有就用包的、TS 那份须只剩 `key`（五原分在 `qingyuWuyuanZones.ts` 与 `wuyuanOpenWorldSlice.ts` 两份，都要清空）。逐拍演出前缀 = `TS_STEP_SCENE_STAGE_PREFIXES` 在前、各包 `stepSceneStagePrefixes` 在后，编译器（questLines 投影的 `guardCovers`）与运行时 `isStepSceneStage` 同口径。

**`persistentEntries`**：`[{"kind":"algae","beatId","eventId","stageId","locationId","characterId","itemId","receiptId","notBeforeStageIds":[…],"note?"} | {"kind":"rejoin","beatId","eventId","stageId","note?"}]`。每种全局至多一条；关存在、事件属于该关、拍子在包线或 `mod-kit` 基础线里；algae 的地点、角色、物品、`notBeforeStageIds` 都存在。编译器给 algae 条目带上 `templateEvent`（从它的关抄出的事件，内置关取原始事件，同原静态 import）。读取：`TS_PERSISTENT_ENTRIES` 在前、包在后，按种类取唯一一条（`persistentEntryIn`，两条或零条都抛错）；`QINGYU_STAGE_PREFIX` 留在框架。

catalog 在 `ifBranches` 之后新增三个顶层空段：`endings: []`、`openWorldSlices: []`、`persistentEntries: []`；其余字节不变，version 随之变化（内置模组重新播种一次，同宋 S2）。为让编译器在没有 catalog 时也能取逐拍演出前缀，`NANHUANG_STEP_SCENE_STAGE_IDS` 的 TS 数据原样拆到 `travel/defs/qingyuNanhuangStepScenes.ts`（导出名不变）。棘轮：`shanghou_revealed` 的特判改为 `TS_COMPAT_NARRATIVE_VARIANTS` 条目（`eventNarrativeView.ts` 34 → 33），南荒逐拍前缀 2 行移入新文件（29 → 27 + 2），总数 1135 → 1134、文件数 69 → 70，基线同批重写。

## 2026-11-11 非国家线四条二级线与线承重事件进包（B1）

核心包 `packs/qingyu/secondary-lines.json`（manifest 新增 `secondaryLines`）：商道 `commerce`（首条，**不写 `after`**）、太乙 `taiyi`（`after: "taiquan"`）、星月湖 `xingyuehu`（`after: "taiyi"`）、黑魔海 `heimohai`（`after: "xingyuehu"`）。汉包 `packs/han/line-critical-events.json`（manifest 新增 `lineCriticalEvents`）：原 `LINE_CRITICAL_EVENTS` 10 条（`dingtao_beijing` 6 条、隔离关 `luoyang_coup` 4 条，全部是汉关事件、`lineId: "han"`），原顺序。至此 `TS_SECONDARY_LINES` 为空数组；`LINE_CRITICAL_EVENTS` 只剩声明行与 `};`（对象就地并入汉包条目，导出名与对象不变），`TS_LINE_CRITICAL_EVENTS` 为 `{}`。

- **二级线的 `after` 不算跨包引用（新规则）**：`after` 只是全局排序提示——`mergeSecondaryLines` 在全部包线（catalog 拼接）加 TS 线上统一解析，与包顺序无关，所以归属扫描跳过包线顶层的 `after` 字段，不要求 `dependsOn`。原因：核心包 `taiyi` 要接在太泉包的 `taiquan` 后面，而太泉包依赖核心包，按旧规则会成环。线里 `after` 以外的字符串（节点、锚、`entryHintKeys` 的键等）照旧扫描。保留的报错：`after` 找不到（含成环）、两条线 `after` 同一条线（跨包也查）、id 重复、多于一条不写 `after`。已有各国家线包为 `after` 加的 `dependsOn`（宋→晋、晋→昭南、汉→宋、唐→汉）多余但无害，不动。`tests/contentPackLineFormats.test.mjs` 钉住「跨包 after 不需要 dependsOn；跨包成环、跨包同 after 仍报错；after 以外的字段仍要 dependsOn」。
- 写法：线与节点之间的 `//` 注释进相邻线或节点的 `note`（同昭南：`字段：注释`，多行用空格拼）；原表尾的「国家／地区线：锚地」分节注释后面没有 TS 线了，放进 `heimohai` 的 `note`。星月湖一个节点的 `entityText(...)` 写成 `{{entity:character:liuchao.character.shang_zhen_yu}}`；`basis`／`pendingExpansion`／`entryHint` 的 `+` 拼接合成一个字符串（值逐字相同，含 `\n\n`）。承重事件每行行尾的注释、两段分组注释进各条的 `note`。
- catalog：`secondaryLines` 6 → 10 条（新 4 条在前，原 6 条字节不变）、`lineCriticalEvents` 0 → 10 条，其余段不变；version `5dc9243674e0ce22` → `5020c25957e94d02`。
- 合并后的整表顺序不变：commerce → taiquan → taiyi → xingyuehu → heimohai → zhaonan → jin → song → han → tang（songPackSnapshot 钉住）。
- 留在 TS：`secondaryLineDisplayName` 的黑魔海显示名特判（代码）；`TS_SECONDARY_LINES` 上方文档注释里的孪生地点 id 举例（棘轮剩 5 行）。
- `scripts/quest-report.mjs` 原来按正则读 `secondaryLines.ts` 源码，表搬空后一条二级线都读不到，改为经 jiti 读合并后的 `SECONDARY_LINES`（同 `build-entity-index.mjs`）。
- 测试：`contentPackLineFormats` 的 `TS_LINE_ID` 改为合成的临时 TS 线（`withTsLine`，用例内推进 `TS_SECONDARY_LINES`、用完删掉，同 `withTsMilestone`）；汉／晋／塞外／太泉／唐／昭南六个迁移测试里「secondaryLines.ts 残留只在别的线的节点里」改为「残留为 0」（汉、唐另断言承重表在 TS 里只剩声明行与 `};`）；`contentPackCoreCharacterFormats` 搬迁演练的承重表改读合并值（同演练里的二级线）。棘轮 `secondaryLines.ts` 127 → 5，总数 1135 → 1013。

## 2026-11-11 人物任务与高光进人物包（B2）

人物包 `packs/characters/`（`id: "qingyu.characters"`，`dependsOn: ["qingyu.core"]`）：`character-beats.json`（`{quests, highlights}`）。`characterQuests.ts` 的 `TS_CHARACTER_QUESTS`（8 条人物任务、53 拍）与 `TS_CHARACTER_HIGHLIGHTS`（63 条）原样搬入、顺序不变，两张 TS 表为空数组；`CHARACTER_QUESTS`／`CHARACTER_HIGHLIGHTS`／`characterBeatsAt`／`characterQuestProgress`／`mergeCharacterBeats` 导出名与行为不变。权威来源现为这份 JSON（改了再跑 `node scripts/content-packs.mjs`），不再改文档重抽。
- 合规 C02 那行注释（`s12_zhuo_forced` 暂停）原样放进卓云君下一拍（翠微园）的 `note`；被暂停的那一拍不搬也不恢复。
- **归属规则改动**（主驱动裁定，解法 1）：F0a 原把人物任务 id 登记为包定义（种类 `characterQuest`），而归属扫描不分种类。核心包 `packs/qingyu/f07.json`（场面合同）里有 3 处合同内部 id 与人物任务 id 同名——`parties[6].id = "ningyu"`、`elements[1].id = "xieyi"`、`closing.lose.fixedCosts[2].target = "ningyu"`——与人物任务无关，却被当成核心包引用人物包，要求核心包 `dependsOn` 人物包，与人物包 `dependsOn` 核心包成环。现改为人物任务 id 不进通用扫描（改动只在 `scripts/content-pack-core-formats.mjs`：`coreDefinedIds` 不再返回 `characterQuest`，跨包唯一性由 `compileCoreFormats` 报 `defined by both`；`scripts/content-packs.mjs` 未改）。其余格式的归属规则不变。
- 人物包本身不引用别的包定义的 id（拍点与高光的事件都在内置关），`dependsOn: ["qingyu.core"]` 按任务规定写；核心包不反向依赖人物包。
- 读源码的两处改读合并值：`tests/criticalEventCoverage.test.mjs` 的人物层认领改读 `CHARACTER_QUESTS`／`CHARACTER_HIGHLIGHTS`（认领集合前后都是 120 个 id，欠账不变）；`scripts/quest-report.mjs` 的人物任务与二级线改用 jiti 读 `CHARACTER_QUESTS`／`CHARACTER_HIGHLIGHTS`／`SECONDARY_LINES`（主轴仍正则读源码）。
- catalog 只变 `characterBeats` 段与 version；棘轮 `characterQuests.ts` 116 → 0（总数 1135 → 1019，文件 69 → 68）。

## 2026-11-11 国家线注册与地区映射进包（秦线 PR C）

**manifest `nationLines`**：JSON 文件路径数组（同 `mapEntries`／`stageMeta`），每个文件是数组：

```json
[{"lineId": "<国家线 id>", "order": <正整数>, "regions": ["<地区名，mod-kit/entity-ledger/overrides.json stageRegions 的值>"]}]
```

只认这三个字段（段名按复核 M7 不叫 `lines`，那是人物线文件与下一步表）。七条国家线各登记在自己的线包里：`nanhuang`→`packs/zhaonan`、`jin`→`jin`、`song`→`song`、`han`→`han`、`tang`→`tang`、`qin`→`qin`、`taiquan`→`taiquan`，文件都叫 `nation-lines.json`。塞外不是国家线，`packs/saiwai` 不登记。

- **编译期校验**：`lineId` 非空、全部包里不重复（归属种类 `nationLine`，跨包报 `nationLine id X defined by both A and B`，同包报 `nation line missing/duplicate id`）；`order` 是正整数、全部包里不重复；`regions` 非空、元素非空且不重复，同一地区只能登记到一条线（`region R also registered to …`）。等价于原 numbers 里 `story.lineCompass.regionLines` 的校验（值须为国家线 id——现在结构上必然成立），并补上 lineId／地区不重复。
- **catalog**：新顶层段 `nationLines`（按 `order` 排好，条目原样），放在末尾；其余字节不变，version 随之变化（内置模组重新播种一次，同宋 S2）。
- **顺序**：显式由 `order` 决定，与包的拓扑序、目录名无关。下一步表 `lineCompass.lines` 合并后按这次编译出的 `nationLines` 顺序稳定排序（原按 `numbersRegistry.ts` 的常量排）。现值 1–7 = 南荒、晋、宋、汉、唐、秦、太泉，与原常量逐项相同。
- **运行时**：`src/modules/contentPacks/nationLines.ts` 只 import `generated/catalog.json`，导出 `NATION_LINES`、`PACK_NATION_LINE_IDS`、`NATION_LINE_OF_REGION`。`contentPacks/index.ts` 转导出这三个名字；`numbersRegistry.ts` 的 `NATION_LINE_IDS` 导出名不变，改为从 `../contentPacks` 取 `PACK_NATION_LINE_IDS`（场面模块只许引用 `../contentPacks`，`tests/sceneModuleIsolation.test.mjs`）；`lineCompass.ts` 的 `lineOfStage` 改查 `NATION_LINE_OF_REGION`。numbers 里删掉 `story.lineCompass.regionLines` 字段与它的必填项／校验。
- **构建顺序（M2）**：编译器不再 import `numbersRegistry.ts` 排序；`validateLineCompassTable` 加第 4 个参数 `nationLineIds`（缺省 `NATION_LINE_IDS`），`validateWithTs` 传这次编译出的 `catalog.nationLines` 的 id，不用磁盘上的旧 catalog。因为 `numbers.ts` → `numbersRegistry.ts` 现在会读 catalog.json，`buildCatalog` 的逐拍演出关判定不再经 `stepScene.ts`（它 import `numbers.ts`），改读 `travel/defs/qingyuNanhuang.ts` 的 `NANHUANG_STEP_SCENE_STAGE_IDS`，按关 id 前缀判定（同 `isStepSceneStage`）。删掉 catalog.json 后单次重建仍可用，产物逐字节相同。
- **加一条国家线**只改包数据（`tests/nationLinesPack.test.mjs` 用合成线 `test.nation` 在仓库副本里单次重建验证）。但 `numbersRegistry.ts` 的秦入口规则（阶段 2 才搬）要求「国家线去掉秦、太泉」恰为 numbers 的 `story.lineCompass.anyLineClosed.lineIds`，且每条在 `story.lineOutcome.failureClosureEvents` 有键：新线若不是秦／太泉，须同时补这两项 numbers 配置，否则数值冷启动校验（LCQ-NUM-007）失败。
- 测试：`tests/lineCompass.test.mjs` 的地区映射断言改读合并结果，「塞外登记成国家线」的负例移到 `tests/nationLinesPack.test.mjs`（下一步表用未登记的 `saiwai` 报 `lineId must be one of …`；`塞外` 登记到两条线报错）。

## 2026-11-11 角色姿态档案与好感上限进人物包（B4）

人物包 `packs/characters/`（`qingyu.characters`，`dependsOn` 仍只有 `qingyu.core`）manifest 加 `characterProfiles: ["profiles.json"]`。`stanceProfiles.ts` 的 `TS_STANCE_PROFILES`（49 条）与 `affinityCaps.ts` 的 `TS_AFFINITY_CAPS`（13 条）原样搬入 `profiles.json` 的 `stance`／`affinityCaps`，两张 TS 表为空数组；`STANCE_PROFILES`／`AFFINITY_CAPS`／`formatStanceProfile`／`hasStanceProfile`／`affinityCapFor`／`formatAffinityCap`／`packEntityNames`／`mergeStanceProfiles`／`mergeAffinityCaps` 导出名与行为不变。权威来源现为这份 JSON（改了再跑 `node scripts/content-packs.mjs`）。
- 写法照 F0a：每条 `names` 写成 `entities`（`entityAliases` 展开，原表重复展开的实体照写几遍；含 enemy 两条姿态、一条上限）＋ `extraNames`（字面名字，如「贾诩」「秦伴当」「小环」）；`cap` 写成 `capTier`（原 `tierMax('…')` 的档位 id）。文案（含成人内容）逐字照搬，用合并函数还原后与原表 deepStrictEqual。
- 顺序：JSON 顺序即原表顺序；TS 表为空，合并值就是包的顺序，`find` 取第一条命中的优先级不变。
- 注释：表内 10 处 `//` 注释（姿态 8、上限 2）进 `note`：夹在条目之间的分节注释进下一条，条目内部的注释进本条；编译时剥掉。
- 裁定簿核过：两张表没有 AFF_PROTECTED／AGE_PROTECTED／DEBUT_PROTECTED／USER_CANON 标记（裁定簿的 AFF_PROTECTED 指角色归属字段）。凝羽姿态 constant 的四条声音约束（#242，执法 `tests/ningyuVoice`）原样搬入，该测试读合并值，未改。
- 不需要 `dependsOn` 别的包：`dependsOn` 只有 `qingyu.core` 时编译通过，归属扫描没有报引用其它包定义的 id，没有成环。
- `tests/contentPackCoreCharacterFormats.test.mjs` 搬迁演练的姿态／上限两段改为取人物包 `profiles.json` 原样转写（TS 表搬空后原来的源码解析取到 0 条）；源码解析辅助函数 `sourceEntries` 因此无人使用，已删。
- catalog 只变 `characterProfiles` 段与 version；棘轮 `stanceProfiles.ts` 48 → 0、`affinityCaps.ts` 13 → 0（总数 1019 → 958，文件 68 → 66）。

## 2026-11-11 地点别名与主轴进核心包（B3）

核心包 `packs/qingyu/location-aliases.json`（manifest 新增 `locationAliases`）：原 `travel/locationIds.ts` 的 `TS_LOCATION_ID_ALIASES`（3 条）→ `canonical`、`TS_LOCATION_PARENTS`（4 条）→ `parents`、`TS_LOCATION_NAMES`（3 条）→ `display`，键序不变；原文件头的主策划／剧情裁定注释进文件顶层 `note`。三张 TS 表为 `{}`；`LOCATION_ID_ALIASES`（仍 `Object.freeze`，实体总表派生在前）／`LOCATION_PARENTS`／`LOCATION_NAMES` 与全部查询函数导出名、行为不变。权威来源现为这份 JSON（改了再跑 `node scripts/content-packs.mjs`）。
- 核心包不需要新的 `dependsOn`：引用的都是 `locations.json` 里的地点 id，归属扫描通过。
- 留在 TS：`NANHUANG_CONTINENT_IDS`（`auditLocationIds` 的南荒多边形判断用的代码常量；`liuchao.continent.` 不在棘轮前缀表里，不计数）。
- `tests/contentPackCoreCharacterFormats.test.mjs`：locationAliases 正例的合成三张表改为接在真实 catalog 段之后（原来整段换掉，真实数据搬进包后会被丢掉），合成地点另避开包里已用的 id；搬迁演练的地点一段改取 `location-aliases.json` 原样转写（同 B4 的姿态一段）。
- catalog 只变 `locationAliases` 段与 version（`ed494b3d542c4086` → `db269708a589beff`）；棘轮 `travel/locationIds.ts` 10 → 0（总数 835 → 825，文件 67 → 66）。
- 主轴（后半，裁定后续做）：核心包 `packs/qingyu/story-axis.json`（manifest 新增 `storyAxis`）：原 `mainQuestAxis.ts` 的 `TS_STAGE_ORDER`（37）→ `stageOrder`、`TS_MAIN_QUEST_LAYERS`（6）→ `layers`、`TS_MAIN_QUEST_STAGES`（18）→ `stages`、`TS_MAIN_QUEST_NODES`（16）→ `nodes`、`TS_MAIN_QUEST_REQUIREMENTS`（2）→ `requirements`，由脚本从 TS 模块求值结果直接转写，各段顺序与条目键序不变；`stageOrder` 原样照抄（编译期核对等于 `nextStageId` 链）。五张 TS 表同批清空为 `[]`；`STAGE_ORDER`／`MAIN_QUEST_*` 导出名、类型与 `resolveMainQuestNodes`／`resolveCurrentMainQuestNode`／`resolveMainQuestLayer`（及 `resolveStoryAxis`）不变。权威来源现为这份 JSON（改了再跑 `node scripts/content-packs.mjs`）。
  - 注释：条目内或条目之间的注释进紧随的那一条的 `note`（层 3 条、关 5 条、节点 5 条；节点表 baihu 之后、pending 之前的整段注释进下一条 pending 节点），表尾 `#20` 注释与来源说明进文件顶层 `note`；编译时剥掉。删掉的 63 行非空注释逐行核对过都在 JSON 里。
  - **归属规则（B3 裁定）**：通用归属扫描跳过 `storyAxis.stages[].pillars`。它是编译期按枚举（`bloodline｜taiquan`）校验的闭集，不是 id 引用；`"taiquan"` 与太泉包的二级线 id 同名，而太泉包依赖核心包，不跳就成环。做法同 B1 跳过二级线 `after`（`scripts/content-packs.mjs` 的 `unscanned`），只跳这一个字段：storyAxis 里其余字段（`stages[].stageId`、节点的 `stageId`／`eventId`／`locationId`、`layers[].unlockStageIds` 等）照扫，跨包引用仍要 `dependsOn`；`pillars` 写枚举外的值仍编译报错。机制测试：`contentPackCoreCharacterFormats` 的「归属：storyAxis 的 pillars 不进通用扫描」正反例。
  - 留在 TS：`mainQuestAxis.ts` 类型与文件头的设计说明注释里用反引号写的 4 处关 id（文件头「正典原文 `lcq.stage_02`」、`MainQuestRequirement` 的 JSDoc 两处、`MainQuestNode.locationId` 的字段说明），不是表条目，按裁定不改写。
  - catalog 只变 `storyAxis` 段（`null` → 五段）与 version（`c1836130a7d5935c` → `f19d311861823a0d`）；棘轮 `mainQuestAxis.ts` 59 → 4（总数 808 → 753，文件数 65 不变）。

## 2026-11-11 塞外／昭南／晋／太泉的展示残留进各线包（B6）

用 F0b 的格式把四条线 S4 之后留在框架 TS 的展示数据搬进各线包；包 JSON 由脚本从当前 TS 的求值结果转写（转写逻辑同 `contentPackPresentationFormats` 的搬迁演练），没有手抄。没有新增格式、没有改编译器。

- **塞外包**（`packs/saiwai`）：manifest 新增 `texts: ["texts.json"]`（新文件）。stageMeta `lcq.stage_02`：`lockedDecision` 3 条（ningyu_enters_gamble、sudaji_south_pact、free_ajiman）、`routeLocation` 5 条、`compassObjectiveOnly`（s02_04）、`objective`（s02_04，原代码特判）、`compatNarrativeVariants`（gamble_bond_signed 3 条、ningyu_enters_gamble 1 条，整组搬）、关级 `uiChapterByRouteLocation`（原 stage_02 按地点分段算法，该关没有 `defaultUiChapterId`）。texts：`scopedPlayerLine.*` 26 条（stage_01 6、stage_02 20）、`actionDisplay.lcq.event.ningyu_regicide_offer.hear_ningyu_regicide_price.line/label`。
- **昭南包**：stageMeta `lcq.stage_04` 7 条、`lcq.stage_04b_lingfei_baiyi_crisis` 12 条 `uiChapterTitle`（原两处章名特判；方案写 18，实际 7 + 12 = 19）；04b 的 `objective` 2 条（huamiao 特判、武二郎 `{{entity:…}}` 模板）；`lcq.stage_05b`：`lockedDecision` 2 条（s05b_09、xieyi_entrustment）、shanghou 的 `compatNarrativeVariants`（`priority: "before-event-variants"`、`relatedFactionIds: []`）、小紫 `objective`（模板）。texts：huamiao 的事件级 `actionDisplay.<e>.*.line/label`，geluo 1 对、yinzhu 2 对逐动作键。
- **晋包** `lcq.stage_07_qingyuan_jiankang`：s07_05 的 `compatNarrativeVariants`。**太泉包** `lyl.taiquan_afterfall`：han_shouyang_gaoyanei 的 `objective: {"$text":"report8091.han.arrived.objective"}` 与 `actionPresentation`（到舞都）。
- TS 侧：`TS_PLAYER_LINES`、`TS_ACTION_DISPLAY_OVERRIDES`、`TS_COMPAT_NARRATIVE_VARIANTS`、`TS_STORY_ROUTE_LOCATIONS`、`TS_STORY_ACTION_PRESENTATIONS` 为空，`TS_COMPASS_OBJECTIVE_ONLY_EVENT_IDS` 为空集合，`FIXED_QUEST_OBJECTIVE_OVERRIDES` 为 `Object.freeze({})`；`resolveFixedQuestObjectiveIn` 的三条特判、`storyChapterTitleIn` 的 stage_04／04b 特判与 stage_02 算法删掉（函数末尾 `return fallback;`；演练用的两个锚点行保留）。
- **留在 TS：`TS_LOCKED_DECISIONS` 的 shanghou_revealed 一条。** `residualTablesSnapshot` 钉了 `LOCKED_DECISIONS` 的键顺序（shanghou → 塞外 3 把 → 昭南 2 把），合并规则是「TS 在前、包按 catalog 顺序在后」，shanghou 与另两把昭南锁同在 05b，进包就排不回第一位。运行时只按事件 id 取锁（`branchDecision.ts` 唯一读取处），键顺序没有行为影响；若要清零，需用户同意改这项快照的键顺序，或给 `lockedDecision` 加排序字段（本批没做）。合并顺序依赖塞外包排在昭南包之前（目录名字母序、两包都只依赖核心包）；以后谁改这两个包的 `dependsOn`，要复核这项快照。
- 注释：分支锁的分组注释进塞外 stage_02、昭南 05b 的顶层 `note`；兼容变体的来源写进各条必填的 `note`；塞外 stage_02 原 note 里「目标特判、按地点分段的章名是算法，留在 TS」改为记录本批搬入的内容。
- catalog：`stageMeta` 新增 41 个事件／关级字段（原有字段字节不变、关顺序不变），`texts` 新增 36 键（原键不变），其余段不变；version `ed494b3d542c4086` → `ec3948d6059d3eb5`。
- 棘轮：`playerActionPresentation.ts` 31 → 0、`fixedQuestObjectives.ts` 5 → 0、`branchDecision.ts` 6 → 1、`eventNarrativeView.ts` 33 → 6（剩主角 id 回退 2 行、汉／唐从 stageMeta 派生的 4 个导出），总数 835 → 767、文件数 67 → 65，前缀模板行不变（1）。
- 测试：四个 `*PackMigration` 的「未搬残留」改为残留 0（塞外、昭南另把 `playerActionPresentation.ts`／`branchDecision.ts` 纳入检查，昭南断言 `branchDecision.ts` 只剩 shanghou）；`contentPackLineFormats` 的目标「与 TS 重复」反例改用合成的临时 TS 目标（`withTsObjective`，临时替换模块导出 `resolveFixedQuestObjectiveIn`，覆盖表是冻结对象加不进条目），「只对部分拍特判」反例改用 `WHOLE_STAGE` 第一拍的合成临时特判，读取方优先级一项里依赖已删特判的两半退化为空；`report75ea` 改读合并后的 `LOCKED_DECISIONS`（原按源码正则读 TS 表）；`fixedQuestObjectives` 的覆盖事件计数 61 → 64（三条原代码特判原先不在计数集合里）。护栏测试与 `tests/fixtures/` 一字未改、原样通过。

## 2026-11-11 IF 分歧表进人物包（B5）

人物包 `packs/characters/`（`qingyu.characters`，`dependsOn` 仍只有 `qingyu.core`）manifest 加 `ifBranches: ["if-branches.json"]`。`divergenceLedger.ts` 的 `TS_AUTO_BRANCH_RULES`（5 条，其中 4 条带 `prompt`，`lcq.if_xieyi_longrest` 没有）、`TS_AUTO_CONSEQUENCE_RULES`（1 条，带 `prompt`）与 `TS_DIVERGENCE_PROMPTS`（1 条：`offscreen.lcq.xingyuehu_war`）原样搬入 `if-branches.json` 的 `branches`／`consequences`／`prompts`，三张 TS 表为空；`resolveReconcileBranchId`／`recordReconcileDivergences`／`recordOffscreenDivergence`／`formatDivergencePrompt`／`acceptedStatusPattern`／`mergeIfBranches` 导出名与行为不变。权威来源现为这份 JSON（改了再跑 `node scripts/content-packs.mjs`）。
- 写法照 F0a：`acceptedStatuses` 写字符串数组（`["alive","longrest","incapacitated"]`、`["dead"]`、`["missing"]`），运行时编译出的正则与原表逐字相同；条目键序与原表相同。文案（含人物裁定 #92／#93／#97／#114 的约束句）由脚本从原 TS 模块直接转写，逐字相同。
- 注释：分支表头注释（R2-0V registry 说明 + 来源 `character-canon/qingyu.if-branches.json` + CANON-DECISIONS #90）进第一条分支的 `note`；后果表上方注释进那条后果的 `note`；`prompts` 是「id → 文案」的对象，条目不能带 `note`，它上方那句注释进文件顶层 `note`。编译时剥掉。
- 顺序：TS 表为空，合并后的分支／后果顺序就是 JSON 顺序（`find` 取第一条命中，s06_03 的分支与失踪后果互斥，顺序不影响结果）；`formatDivergencePrompt` 的查找顺序（分支 → 分歧记录 id → 后果；后果匹配状态不 trim、落旗标的匹配 trim）是代码，没动。
- 留在 TS 的只有代码：`characterFlagSlug`、落旗标逻辑、查找函数本身；`offscreen.lcq.xingyuehu_war` 这个 id 仍由冻结文件 `runtime.ts` 生成，只有它的提示在包里。
- `tests/contentPackCoreCharacterFormats.test.mjs` 搬迁演练的分歧一段改为取人物包 `if-branches.json` 原样转写、对照值改为真实 catalog 段的合并（TS 表搬空后原来的转写取到 0 条）。
- catalog 只变 `ifBranches` 段与 version（`a10abf5c8c597660` → `e3952d7c9800d358`）；棘轮 `divergenceLedger.ts` 17 → 0（总数 958 → 941，文件 66 → 65）。

## 2026-11-11 行旅定义与常驻入口进塞外／昭南包（B8）

塞外包 `packs/saiwai/` manifest 加 `openWorldSlices: ["open-world-slices.json"]`；昭南包 `packs/zhaonan/` manifest 加 `openWorldSlices: ["open-world-slices.json"]`、`persistentEntries: ["persistent-entries.json"]`。两包的 `dependsOn` 仍只有 `qingyu.core`：编译通过，归属扫描没有报引用别包定义的 id，没有成环；核心包 `timeline.json` 的 `sliceEntered` 引用五原切片 id，不需要改依赖（`definition.id` 不登记归属，F0b）。
- **昭南 `open-world-slices.json`**：一条，key `nanhuang`。原 `travel/defs/qingyuNanhuang.ts` 的 definition（areas 12、zones 20、routes 29，notices／actors／problems／actions 为空）、`stageIds`（5 关）、`stepSceneStagePrefixes`（`lcq.stage_03b`、`lcq.stage_04`，原 `qingyuNanhuangStepScenes.ts`）、`positionNodes`（碧鲮：segment、placeLocationId、海神殿一节点）。
- **塞外 `open-world-slices.json`**：一条，key `wuyuan`，整份五原切片：definition 的 zones（8）来自原 `qingyuWuyuanZones.ts`，routes 8／notices 2／actors 2／problems 1／actions 2 来自原 `wuyuanOpenWorldSlice.ts`；`constants` 两份合并（节点 id 8 个在前，切片与路线 id 7 个在后）；`zoneRanks`（6 个节点）、`actionJudgement`、`actionDescribe`；`positionNodes` 只有 segment／placeLocationId（无节点表）。
- **昭南 `persistent-entries.json`**：algae、rejoin 两条，按原顺序。编译器给 algae 带上 `templateEvent`（04b 内置关原始事件，与原静态 import 深相等），catalog 因此多出一份事件，属预期。
- **生成方式**：JSON 由脚本从当前 TS 模块的求值结果转写（转写同 `contentPackPresentationFormats` 搬迁演练第 1 步），id 都是求值后的值；`E()`／`B03()`／`B04B()`／`journey()`／`local()`／`after()` 随表删掉，前缀模板行归零。原文件头注释与行内注释进条目 `note`（编译时剥掉）。
- **TS 侧**：`TS_NANHUANG_OPEN_WORLD_SLICE`、`TS_WUYUAN_ZONE_PART`、`TS_WUYUAN_OPEN_WORLD_SLICE` 只剩 `{key}`；`TS_NANHUANG_STEP_SCENE_STAGE_IDS` 为 `[]`；`TS_PERSISTENT_ENTRIES` 为 `[]`，`persistentLineEntries.ts` 对 04b 关 JSON 的静态 import（只给 TS 条目兜底取模板）随之删掉。全部原导出名、类型与取值不变（两棵树逐项对比）。留在 TS 的：`wuyuanOpenWorldSlice.ts` 的逻辑代码（强制路线、王哲殉军、`hasDepartedWuyuan` 事件列表等），`persistentLineEntries.ts` 的 `QINGYU_STAGE_PREFIX`。
- **编译器（M2，纯机制）**：`openWorldSlices` 非空时编译器要读 `JUDGEMENT_KINDS`，原来经 `src/utils/judgementEngine.ts`，其 import 链会读 `generated/catalog.json`，删掉 catalog 后单次重建失败（`contentPackRebuild`、`nationLinesPack` 报红）。改为：`JudgementKind`／`JUDGEMENT_KINDS` 原样拆到纯模块 `src/utils/judgementKinds.ts`，`judgementEngine.ts` 原名转导出，编译器读纯模块。
- catalog 只变 `openWorldSlices`、`persistentEntries` 两段与 version（`ca385e4a806b1d9a` → `95f05996173bed2e`）；棘轮总数 818 → 739（文件 66 → 63），前缀模板行 1 → 0。

## 2026-11-11 结局表进塞外／昭南包（B7）

塞外包 `packs/saiwai/` 与昭南包 `packs/zhaonan/` 的 manifest 各加 `endings: ["endings.json"]`（只加这一段，其它行不动）。条目用 F0b 的 `endings` 格式，由脚本从 TS 求值结果转写（同 `contentPackPresentationFormats` 搬迁演练的转写），不手抄：

- 塞外 `endings.json`（4 条）：E01 `baihu_beheading`、E02 `ajiman_bond`（带 `pathText`：来源 `lcq.event.wuerlang_joins`，正文键 `lcq.ending.death.ajiman_bond.ajiman_path`）、E03 `paolao`、E04 `wangzhe_blast`。
- 昭南 `endings.json`（4 条）：E05 `shanghou_relic`；E06 `ghost_king_skull`、E07 `dragon_well`、E08 `fail.dragon_essence` 三条 `key` 与 `battleLoss` 写在同一条里（`endingId` 全部包里只能出现一次）。三条战败结局的来源事件都在 05b，各自挂着场面合同，编译通过。
- 归属：`endingId` 与结局里的事件都不是别的包定义的 id，两包 `dependsOn` 仍只有 `qingyu.core`，无成环。
- 顺序：包按目录名编译，`saiwai` 在 `zhaonan` 前，合并后的结局编号表仍是 E01→E08；TS 表为空，`BATTLE_LOSS_ENDINGS` 就是昭南包的顺序 E06→E07→E08，与原表相同（B0 深快照 `residual-tables-snapshot.json` 原样通过）。
- 注释：`ENDING_PATH_TEXTS` 的裁定簿 #240 说明、战败表「战斗正式接入时消费」说明进对应条目的 `note`（编译时剥掉）；TS 侧原注释保留并注明已搬。
- TS 侧：`TS_ENDING_KEYS`、`TS_BATTLE_LOSS_ENDINGS`、`TS_ENDING_PATH_TEXTS` 清空，导出名、合并函数、`BATTLE_LOSS_ENDINGS` 导出不变（冻结的 `runtime.ts:3799` 和 `sceneModule/host/controller.ts` 照旧读合并值）。`TS_BATTLE_LOSS_ENDINGS` 原来靠 `as const` 推类型，清空后显式标成 `readonly (PackBattleLossEnding & { endingId })[]`。留在 TS：`canonicalEndingId` 的旧 E01 别名（2 行，旧档补丁）、`migrateLegacyE01Ending`，以及 `fixedEndingNarratives.ts` 里的 `applyStepSceneLedger` 九阳一行和 `sceneLedgerSummary` 4 行（都是代码）。
- 测试：`tests/contentPackPresentationFormats.test.mjs` 两处——endings 反例「包 key 与 TS 编号同值」改为先往 TS 表临时加一个编号再撞（原写法在 TS 表为空时退化成撞合成包外的 E01，合成包编译不含真实包，测不到）；搬迁演练的 `before.endingKeys／battle／paths` 改取当前合并值（同一测试的 `locks` 早就这样写）。
- catalog 只变 `endings` 段（0 → 8 条）与 version（`ca385e4a806b1d9a` → `4e5ec9ab27c9e9da`）；棘轮 `endingPresentation.ts` 10 → 2、`fixedEndingNarratives.ts` 15 → 5（总数 818 → 800，文件数 66 不变）。
