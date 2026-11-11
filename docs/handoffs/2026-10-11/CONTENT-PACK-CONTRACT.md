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
