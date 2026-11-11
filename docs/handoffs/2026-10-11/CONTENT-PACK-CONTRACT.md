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
