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

本批只表示燕歌 106 条 baseline 征兆已完成剧情精修并通过确定性门禁。**独立剧情二审未做**，G2 正式 UI 验收未开始；在二审关闭 P0/P1/P2 之前，不得宣称燕歌精修完成。
