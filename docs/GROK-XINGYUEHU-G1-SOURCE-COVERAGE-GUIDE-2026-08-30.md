# Grok 执行指南：星月湖 G-1 原著拍覆盖审计（2026-08-30）

> 用途：在实现第一批星月湖二级任务线之前，核实当前任务、stage 与分歧设计是否漏掉了承重原著拍。
>
> 本任务只做审计，不做实现。结论由 Codex 复核后，才决定是否进入 G0 可达性审计或补设计。

## 一、可直接交给 Grok 的任务

请在以下项目执行一次**严格、只读、来源优先**的 G-1 审计：

```text
工作目录：/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu
审计对象：第一批二级任务线候选——星月湖“谢艺命运 → 星月湖响应”
原著：/Volumes/botsvault/06_material/A-六朝清羽记.epub
```

你的任务不是检查“现有文档彼此是否一致”，而是从原著重新建立本批相关的候选拍清单，再逐拍核对当前 stage、二级线、人物线、分歧账本和下游事件。必须能回答：

1. 当前任务／stage 是否漏掉了会改变人物知识、选择条件、人物状态、因果链或下游场景的原著拍？
2. 已有节点是否错误合并、错序、错挂 stage／event，或只在隔离关里存在？
3. “谢艺死亡／生还／失踪”三种状态是否都能找到合法的后续承接；哪些承接来自原著，哪些是项目为了真分支必须补写的作者设计？
4. 哪些细节应成为固定 event，哪些只应进入人物插入段、A／B 演出变体或 LLM 动态演出，哪些可以有意省略？

### 硬边界

- 全程只读项目文件；不得修改代码、canon、prompt、stage、测试、文档或存档。
- 不 commit，不 stash，不重启 8091，不跑浏览器／真机，不注入 flag，不解除隔离关。
- 不把当前 `reviewSummary`、旧设计文档或测试断言当成原著证据；它们只能作为“现状待核对象”。
- 不发明原著事实，不擅自裁定人物结局，不把推断写成已证实。
- 不因关键词没搜到就判定原著没有。必须检查人物别名、地点、势力、相关动作与前后章语境。
- 报告只写中性转述和精确章节／索引定位，不大段复制原著正文。
- 所有审计产物写到 `/tmp/xiantu-g1-xingyuehu-source-audit-<时间戳>/`，不得写回 repo。

## 二、开始前冻结现场

先记录，不改变现场：

```bash
git rev-parse HEAD
git status --short
git branch --show-current
shasum -a 256 /Volumes/botsvault/06_material/A-六朝清羽记.epub
```

产出 `version.json`，至少包含：

- `head`
- `branch`
- `workingTreeStatus`
- `epubPath`
- `epubSha256`
- `startedAt`
- `auditScope: "xingyuehu-g1-source-coverage"`

如果 EPUB 不可读、路径不符，或当前 HEAD 与用户指定冻结版本不一致，立即输出 `BLOCKED`；不要换用网络文本或旧摘要继续。

## 三、必须读取的项目材料

### 3.1 项目边界与人工裁定

完整读取：

- `AGENTS.md`
- `PROJECT-STATUS.md`
- `docs/SECONDARY-QUEST-LINE-BATCH-MATRIX-2026-08-30.md`
- `docs/THREE-TIER-QUEST-CHAIN-EXPLAINED-2026-08-30.md`
- `mod-kit/generated/deepseek-v4-flash/character-canon/CANON-DECISIONS.md`
- `mod-kit/generated/deepseek-v4-flash/character-canon/SAVE-CONTRACT.json`

只把人工裁定当约束，不把它反推成原著内容。特别保留用户裁定：谢艺不必按原著写死；这意味着审计要分别标记“原著默认结果”和“项目合法分支扩写”。

### 3.2 原著索引与时间线

- `mod-kit/generated/deepseek-v4-flash/qingyu/source-index.json`
- `mod-kit/generated/deepseek-v4-flash/character-canon/story-timeline.json`
- `mod-kit/generated/deepseek-v4-flash/character-canon/story-timeline.md`
- `mod-kit/generated/deepseek-v4-flash/qingyu/extraction/batch-*.json`

时间线和 extraction 是检索辅助，不是最终来源。所有承重结论必须回到 EPUB 相应章节复核上下文。

### 3.3 当前剧情与运行时现状

- `mod-kit/generated/deepseek-v4-flash/qingyu/stage-plan.json`
- `mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_04b_lingfei_baiyi_crisis.json`
- `mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_05b.json`
- `mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_06.json`
- `mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_07_qingyuan_jiankang.json`
- `mod-kit/generated/deepseek-v4-flash/qingyu/stages/lcq.stage_08_jiankang_coup.json`
- `src/modules/scenarioMods/secondaryLines.ts`
- `src/modules/scenarioMods/characterQuests.ts`
- `src/modules/scenarioMods/canonRail.ts`
- `src/modules/scenarioMods/divergenceLedger.ts`
- `src/modules/scenarioMods/eventNarrativeView.ts`
- `src/modules/scenarioMods/fixedQuestObjectives.ts`

还要读取以下现状说明，但必须标注它们可能过时：

- `docs/R3-10-BACKLOG-2026-08-16.md` 的 P1-7
- `docs/R3-10-CHARACTER-QUESTS-DRAFT-2026-08-16.md` 的谢艺、萧遥逸段
- `docs/R3-10-SECONDARY-LINES-2026-08-16.md` 的星月湖段
- `docs/THREE-TIER-QUEST-TRIGGER-AUDIT-2026-08-20.md`

## 四、审计范围

本次不是重建整部《六朝清羽记》，也不是审计星月湖全部 25 个节点。范围是第一纵切的完整因果窗：

1. 玩家最早知道星月湖／岳帅关联的合法入口；
2. 谢艺寻找碧姬、讲述碧鲮旧战、岳帅遗事等与托付选择相关的前置知识；
3. 鬼王峒围猎、谢艺受创、杀龙、托付及死亡／生还／失踪分歧；
4. 萧遥逸出现、左武旧案、八骏向孟非卿报告、星月湖开放资源等第一批响应；
5. 后续仍把谢艺死亡当前提的承重点，包括但不限于报死讯、接骨灰、祭墓；
6. 为判断上述拍是否错序或漏因果，必须查看的相邻原著拍。

至少逐项核对这些当前 ID；不得假定列表已经完整：

- `lcq.event.s04b_lingfei_baiyi_crisis_16`
- `lcq.event.xieyi_biling_war`
- `lcq.event.slay_dragon`
- `lcq.event.s06_03`（隔离来源与旧 IF 锚）
- `lcq.event.s07_01_old_case`
- `lcq.event.s07_05_eight_steeds_informed`
- `lcq.event.xiao_opens_resources`
- `lcq.event.s08_debut_xiaoyaoyi`
- `lyl.event.lin_an_bridge_xieyi_tomb`
- `lcq.if_xieyi_longrest`
- `world.xieyi_absence.active`

如果原著复核发现另有承重拍，必须加入候选清单，不能因为不在本列表就忽略。

## 五、执行方法

### 第 1 步：从原著独立建立候选拍

先不要看当前节点顺序下结论。通过 EPUB 的章节文件与 `source-index.json` 建立时间顺序清单。搜索至少覆盖：

- 人物：谢艺、萧遥逸、孟非卿、小紫、云苍峰、八骏及相关别称；
- 势力／旧案：星月湖、岳帅／岳鹏举、左武军、鹏翼社；
- 关键动作／物件：杀龙、受创、闪电、托付、遗物、骨灰、报讯／报丧、救治、失踪、墓祭；
- 相关地点和事件名，而不是只搜人物名字。

每个命中必须读取完整段落及前后必要语境；遇到跨章因果，继续向前后扩窗。对每个候选拍记录：

- `sourceIndex`
- EPUB 内部文件名
- 章名／章号
- 可复查的短定位词
- 中性事实转述
- 谁在当时知道什么
- 它改变了哪个人物状态、选择条件或后续因果

禁止只把现有 timeline 逐条抄成结果。

### 第 2 步：逐拍映射当前实现

对每个原著候选拍，检查它当前落在何处：

- stage event；
- 二级任务线节点；
- 人物任务插入段；
- narrative variant；
- divergence／IF／人物状态；
- intentional omission（有意省略）；
- 完全没有承载。

检查的不只是“有没有同名 ID”，还包括：

- 事件描述、objective、completion 合同是否保留了承重事实；
- axisSeq、stage 顺序和先决知识是否正确；
- 默认可玩路线是否能到达，还是只存在于隔离关／备份／测试 fixture；
- 一个 event 是否错误压进了多个需要独立选择或独立回执的拍；
- 同一拍是否在多处重复，且不同副本对结局有冲突；
- 后续文字是否偷偷恢复了原著死亡、骨灰或墓葬前提。

### 第 3 步：给每拍分类

每个候选拍必须且只能选一个主分类：

| 分类 | 判据 | 应有承载 |
|---|---|---|
| `LOAD_BEARING_EVENT` | 改变知识、人物状态、选择权、资源、地点或下游因果 | 固定 event／本地合同／权威分支状态 |
| `CHARACTER_INSERT` | 不改变上级结果，但只有特定人物在场才成立 | 人物任务插入段 |
| `BRANCH_VARIANT` | 同一固定锚在死亡／生还／失踪下过程或人物行动不同 | 本地状态选择的 A／B／C variant |
| `DYNAMIC_PERFORMANCE` | 台词、动作细节、环境、节奏可变化，不承载新真值 | LLM 小渲染或审核过的变体素材 |
| `INTENTIONAL_OMISSION` | 对选择和后续无承重作用，省略不破坏因果 | 在账中写明省略理由 |
| `OUT_OF_SCOPE` | 与本纵切无直接因果，仅因同章出现 | 记录边界理由，不纳入缺口数 |

不要把小说每个动作都升级为 event；也不要把承担状态变化的拍降成“LLM 自由发挥”。

### 第 4 步：单独做三状态后果表

以杀龙与托付后的权威人物状态为分叉点，分别审计：

| 状态 | 必须回答 |
|---|---|
| `dead` | 原著默认因果是否完整；报讯、萧遥逸、资源开放、骨灰／祭墓的顺序是否正确 |
| `alive/longrest` | 哪些原著事实仍成立；哪些死亡依赖拍必须换入口／换动作；新增内容是否明确标为作者扩写 |
| `missing` | 不得确认死或生；谁会搜寻、哪些资源被牵制、玩家怎样继续介入；不能误激活 longrest IF |

三条都要追踪到第一批重新汇合点。只写三种不同文案、但任务目标、人物行动、资源与后续场景完全相同，不算真实分支。

### 第 5 步：识别“漏拍”与“伪漏拍”

将发现分为：

- `MISSING_LOAD_BEARING`：缺失会让选择无依据、状态跳变或后续失去因果；阻塞实现。
- `PARTIAL_OR_MERGED`：已有承载，但合并过度、错序或缺少独立回执；由影响程度判是否阻塞。
- `SOURCE_CONFLICT`：当前实现与原著或人工裁定冲突；阻塞并交 Codex／用户裁定。
- `DOWNSTREAM_DEATH_ASSUMPTION`：下游仍锁死死亡；星月湖真分支的阻塞项。
- `NONBLOCKING_TEXTURE`：只缺演出细节；不阻塞 G0／B1，可留给动态演出。
- `INTENTIONAL_OMISSION`：确认可省略；不是缺陷，但必须留理由。
- `STALE_DOC_ONLY`：仅旧文档过时，运行时已正确；不要误报成产品缺陷。

## 六、覆盖账格式

生成 `source-coverage.tsv` 和同内容的 `source-coverage.md`。每行至少包含：

| 字段 | 内容 |
|---|---|
| `beatId` | 审计自建稳定编号，如 `XY-G1-001` |
| `sourceIndex` | `source-index.json` index |
| `epubFile` | EPUB 内部章节文件 |
| `chapter` | 章号与章名 |
| `sourceLocator` | 短定位词，不贴长原文 |
| `sourceFact` | 中性事实转述 |
| `knowledgeBeforeAfter` | 谁在这一拍前后知道什么 |
| `causalRole` | 对选择／状态／后续的作用 |
| `classification` | 六类之一 |
| `branchApplicability` | `all/dead/alive/missing`，可多选 |
| `currentCarrier` | stage/event/character beat/IF/variant，缺失写 `none` |
| `reachability` | `default/quarantined/test-only/unknown/not-applicable` |
| `coverageStatus` | `covered/partial/missing/intentional/conflict/out-of-scope` |
| `evidence` | 当前文件与行号；原著写 chapter/index |
| `recommendedAction` | 只给最小修复方向，不写代码 |

另生成 `candidate-missing-beats.md`，只列 `missing/partial/conflict`，按阻塞程度排序。每项必须同时给出原著定位和当前缺口证据。

## 七、判定规则

### `PASS`

同时满足：

- 审计范围内原著候选拍全部完成分类；
- 没有 `MISSING_LOAD_BEARING` 或 `SOURCE_CONFLICT`；
- 默认原著结果与项目允许的生还／失踪扩写明确分账；
- 所有死亡依赖的下游承重点都已识别，并对生还／失踪给出合法承接要求；
- 没有把未来知识提前放进入口或任务目标；
- 有意省略均有理由；
- 报告能区分“来源覆盖完整”与“运行时可达”。

### `PASS_WITH_NONBLOCKING_OMISSIONS`

只有 `NONBLOCKING_TEXTURE` 或证据充分的 `INTENTIONAL_OMISSION`；可以进入 G0，但必须把这些项留到 B4 动态演出素材池。

### `FAIL_MISSING_LOAD_BEARING_BEATS`

存在任何会导致选择缺依据、人物状态跳变、因果断裂、后续场景无入口或分支重新被写回死亡的漏拍／过度合并。

### `FAIL_SOURCE_CONFLICT`

原著、当前实现与人工裁定互相冲突，无法在不新增裁定的情况下确定合法合同。此时停止，不自行选边。

可达性问题单独标为 `KNOWN_G0_BLOCKER`，但不要在本任务里跑 G0，也不要因此掩盖 G-1 的来源结论。

## 八、最终交付物

在 `/tmp/xiantu-g1-xingyuehu-source-audit-<时间戳>/` 生成：

1. `version.json`
2. `source-coverage.tsv`
3. `source-coverage.md`
4. `three-state-consequences.md`
5. `candidate-missing-beats.md`
6. `verdict.md`
7. `commands.log`（仅记录实际执行的只读命令）

`verdict.md` 必须用以下结构：

```markdown
# 星月湖 G-1 来源完整性审计

- Verdict: PASS | PASS_WITH_NONBLOCKING_OMISSIONS | FAIL_MISSING_LOAD_BEARING_BEATS | FAIL_SOURCE_CONFLICT | BLOCKED
- HEAD: <full hash>
- Evidence: </tmp/...>
- Candidate beats: <n>
- Covered: <n>
- Partial: <n>
- Missing: <n>
- Intentional omissions: <n>
- Conflicts: <n>
- Known G0 blockers: <n>

## Blocking findings
1. ...

## Non-blocking findings
1. ...

## Dead / alive / missing consequence summary
- dead: ...
- alive: ...
- missing: ...

## Recommendation
- 是否可进入 G0；若不可，只列下一项最小设计／裁定工作。

## Boundaries
- 未改 repo；未跑 G0；未跑真机；未关闭任何官方里程碑。
```

最后在终端回报同一摘要。禁止只说“看起来完整”或“测试通过”；必须给精确计数、阻塞项和证据目录。

## 九、给 Grok 的停止条件

遇到以下任一情况立即停在 `BLOCKED`，保留已完成覆盖账：

- EPUB 无法读取或 source index 无法映射章节；
- 原著章节号／时间线序号存在无法解释的冲突；
- 需要改动 `CANON-DECISIONS.md` 才能继续；
- 需要用户决定生还分支的新增作者事实；
- 发现当前工作区在审计期间发生变化，无法证明报告对应同一 HEAD／同一文件状态。

不要为了产出 PASS 而补写缺失设计。G-1 的价值就是在实现前把漏拍和裁定缺口暴露出来。

## 十、本任务之后的决策

- `PASS`／`PASS_WITH_NONBLOCKING_OMISSIONS`：再跑 G0 默认路线可达性审计。
- `FAIL_MISSING_LOAD_BEARING_BEATS`：先做一次最小剧情合同设计补全，再重跑 G-1；不要直接写 runtime。
- `FAIL_SOURCE_CONFLICT`：交 Codex 和用户裁定，裁定入档后重跑。
- `KNOWN_G0_BLOCKER`：来源审计可以通过，但星月湖仍不能进入 B1，先修真实触发链并单独验证。
