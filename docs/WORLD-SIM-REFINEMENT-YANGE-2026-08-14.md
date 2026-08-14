# 燕歌 world-sim 征兆精修

日期：2026-08-14
范围：燕歌 10 个 stage／106 条 baseline situation。`lyg.dingtao_beijing` 的人工纵切（3 条非 baseline 局势）不在本批，自动被过滤，未改动。

## 目标

与清羽／云龙同一合同：把自动生成的模板征兆（"…的局势尚未定局；玩家可以介入…"）改为剧情内可感知的事前信号——人物言行、使者口信、现场痕迹或环境异动。只写当前可观察压力，结果未知、可忽略、可继续当前行动。

## 分工

- **Grok 4.6 Build**：逐 stage 读取自包含的事件、地点、相关人物卡与既有 situation，产出 106 条结构化首稿。
- **Claude（本批）**：管线参数化、确定性合并与门禁、内置同步、测试扩展与构建。不做本批的终审——终审另开冷上下文独立 job。

## 本批对管线的改动

1. **按批运行**：`WORLD_SIM_BATCH=<qingyu-yunlong|yange>` 选择书目、隔离工件目录与 tracked overlay，已完成批次保持可重跑（实测重跑后 `src/` 零改动）。
2. **多 overlay 装载**：打包时装载 `mod-kit/world-sim-refinements/` 下全部 overlay，并对"同一 situationId 被两批同时认领"直接抛错。
3. **生成合同补两条硬约束**（来自清羽／云龙二审的实证缺陷）：
   - 全文必须中文，不得出现英文单词或拉丁字母；人名必须与人物卡逐字一致，不得自造人名。（对应上批的 4 处英文残留与"谢艺→谢仪"讹名）
   - 若该 event 本身要玩家去发现某个身份或秘密，征兆只能写引出怀疑的可观察摩擦，不得用肯定句提前说出谜底。（对应上批 P0）
4. **effort 可覆盖**：`WORLD_SIM_EFFORT`，用于单独提档重跑退化的关。
5. **空 stage 不进批**：没有 baseline situation 的人工纵切关（定陶）在 prepare 阶段就被排除。

## 生成期的真实拒收

`lyg.shixiang_ambush` 连续两次在 `low` effort 下**中途放弃并自造占位条目**凑满 schema 定长（`situationId: placeholder…`、"占位摘要用于满足数量，稍后按完整输入替换"），两次分别只有 6/14 与 8/14 是真内容，均被 merge fail-closed 拒收。

提示词体积不是原因——该关 prompt 仅 31KB，是本批第二小；最大的 `lyg.mijing_rumen`（104KB）一次通过。改用 `WORLD_SIM_EFFORT=medium` 后 14/14 无占位（该关成本 $0.30，全批 $1.42）。`high` 会超过管线 600 秒超时被 SIGTERM 杀掉。

结论：schema 的定长要求会诱导模型补数，这类退化只能靠"占位即拒收"的确定性闸门兜住，不能靠观察产物条数。

## 不变量与验证

- 106 条锁定原 `stageId + situationId + sourceEventId`；结构化 diff 覆盖全部 10 个 stage：**606 处字段变化、0 处越界**，仅 `title/summary/omen.{observableFacts,environmentFallback,presentation,transmitters}` 变动；`scenario.events` 完全未变。
- `lyg.dingtao_beijing.json` 工作树无改动。
- `preferredCharacterIds` 全部落在同一 source event 的 `relatedCharacterIds` 内（测试 100% 覆盖）；每条保留 messenger／environment 兜底。
- 自查扫描：禁用词 0 命中、拉丁残留 0 命中。讹名启发式（与正典人名一字之差）产出 30 条候选，逐条回查后全部证实为跨词边界切片或有源专名——`舞阳侯`（122 处前置命中）、`皇太后`、`中常侍`、`白员外`（源事件 `description`／`axisBeat` 明写）均有据。
- 抽读的"街巷传程宗扬已亡"经回查为源事件 `axisBeat` 明写的假情报部署，非违规死亡断言。

## 测试面收严

- 映射回归改为**按批表驱动**，两批条数（251／106）都是显式回归锚点，并断言同一 situationId 不被两份 overlay 同时认领。
- 兑现上一批留下的接口：严格禁用词与拉丁残留闸门现在**覆盖 `situation.title/summary`**，判据是 `world-sim.baseline.` 前缀——机器生成的 baseline 受精修合同约束，人工纵切（定陶的 `world-sim.lyg.s01_*`，其 summary 含"玩家可介入"）按裁定 #154／#155 不受影响。已用注入违规词的负向测试确认该断言会红，随后按哈希原样还原。

## 自动验证

- `node --test tests/worldSimulationAllStages.test.mjs`：6/6 PASS。
- `npm run canon:build`：37/37 stage schema，600/600 tests PASS。
- `npm run type-check`、`npm run build:single`、`git diff --check`：PASS。
- `character-registry.json` 的日期时间戳噪声已还原（`sourceHash` 未变）。

## 尚未完成

本批只表示燕歌 106 条 baseline 征兆已完成剧情精修、通过确定性门禁，且二审 P0 已关闭。**聚焦复审未回**，G2 正式 UI 验收未开始；复审确认前不宣称燕歌精修完成。

## 独立二审与修复（2026-08-14）

二审 job `claude-2026-08-14T12-50-51-698Z-04429c2b`（只读 plan 模式，固定在 `4e4ff34`）判 FAIL：1 项 P0、1 项 P1。

### P0-1 已关闭：`lyg.changgan_interlude` 6 条征兆写的是本关别的事件

`_04`–`_09` 六条的选题与自己的 source event 不对应：`_04`（密约谈崩）写成赵飞燕病案、`_05`（宗室试探）写成十方丛林据点、`_09`（返程伏击）写成白霓裳失联与王守澄／墨枫林——后者等于把 `_10` 才该揭的一线提前摊开一拍。`_01`／`_02`／`_03`／`_10` 对齐正确。

**对二审定性的修正**：二审依据"王守澄／墨枫林／贾师宪／林娘子 不在本关 `canon.characters`"推向"无源新事实"。复核改动前的数据，这些名字在本关原本就有出处（`王守澄` 16 次、`林娘子` 4 次、`贾师宪` 4 次，多在 event 文本与其他 canon 字段中）。所以这不是杜撰人物，而是**选题错位**——征兆写了本关另一个事件的情节。（计数口径：这些数字是在 `b88876c`（燕歌批次之前）上数的，刻意避开循环论证；若在 `4e4ff34` 上数会得到 22/7/7，因为那份数据已经含有正在被质疑的征兆本身，它们自己就提到这些人名。）按征兆合同（只写本事件发生前的可观察压力，且不得提前揭晓后续事件）仍然是 P0。

修复方式：该关以 `WORLD_SIM_EFFORT=medium` 整关重跑（$0.36），10 条全部对齐；结构化 diff 48 处字段变化、0 处越界、`scenario.events` 未变。

### 错位范围已定界

用"征兆正文与本关各事件的专名重合度"对全部 357 条精修（含已关门的清羽／云龙 251 条）做了一次分诊：22 条告警逐条人工回读，**真错位 4 条、全部落在 `changgan_interlude`**（人工另读出 2 条，该关共 6 条）；其余 18 条均为启发式误报，清羽／云龙无此类缺陷，G1 不需重开。

### P1-1 属实，但建议的自动化方向经实测不可行

二审指出测试与生成期对"整段情节挪错位置"都是盲区——属实。但上述分诊启发式的实测表现是：召回 4/6，22 条告警里 18 条误报，重合分数普遍是 0 vs 1（omen 用改写而非复述，专名重合本就稀薄）。**不足以作为闸门**，登记为技术债，同类批次继续靠人工对齐抽检。

### 根因与默认档调整

low 档下出现的两类单关退化——占位条目凑满 schema 定长（`shixiang_ambush`）与选题错位（`changgan_interlude`）——medium 重跑均可修复。`WORLD_SIM_EFFORT` 默认已从 `low` 改为 `medium`，代价是单关成本约 5 倍（$0.07→$0.36 量级），换掉两类只能靠人工发现的缺陷。

### 修复后验证

- `node --test tests/worldSimulationAllStages.test.mjs`：6/6 PASS。
- `npm run canon:build`：37/37 stage schema，600/600 tests PASS。
- `npm run type-check`、`npm run build:single`、`git diff --check`：PASS。
- 全批自查：禁用词 0、拉丁残留 0；该关对齐告警 4→0。

## 聚焦复审：PASS（2026-08-14）

复审 job `claude-2026-08-14T13-16-59-263Z-e40bd59f`（只读 plan 模式，固定在 `fb1e77d`）结论 **PASS**，无 P0／P1。

- `_04`–`_09` 六条选题错位全部对齐；`_09` 不再出现"白霓裳／王守澄／墨枫林"，不再提前摊开 `_10`；`_10` 仍保持悬置措辞，未断言救出／击杀已发生。
- 复审独立跑了 `node --test tests/worldSimulationAllStages.test.mjs`（6/6 PASS，非转述），并用 `git diff --numstat` 确认改动只落在该 stage 的数据文件与元数据／文档／脚本，`scenario.events`、条件、时钟、锚点、`preferredCharacterIds`、其余 9 关与清羽／云龙 251 条均未被触碰。
- "选题错位而非杜撰人物"的定性被独立复核并**扩展验证**：本次新写入的囊瓦、磨勒、释特昧普、观海、廖群玉、岳霏同样不在 `canon.characters` 注册表，但都能在本关 `events[].description`／`axisBeat` 找到直接出处——该模式可推广。
- 无禁用词、无拉丁残留、无确定结果断言、无元语言。

复审提出的 P2 是计数口径差异（22/7/7 对 16/4/4），已在上一节说明：本文取的是燕歌批次之前的计数，以避免用待证文本自证。

## 燕歌批次结论

燕歌 10 关／106 条 baseline 征兆精修完成：二审 P0 已关闭并经聚焦复审 PASS。三本书（清羽 159／云龙 92／燕歌 106）合计 357 条 baseline 征兆全部完成精修，覆盖率 357/357，残留模板文案 0。

仍未开始：G2 正式 UI 验收；已登记未解决的技术债：征兆"选题错位"缺乏可自动化闸门。
