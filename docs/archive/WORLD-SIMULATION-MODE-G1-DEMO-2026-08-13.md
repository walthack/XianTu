# 六朝世界模式 G1 · 可验证 Demo

日期：2026-08-13  
纵切：`lyg.dingtao_beijing` / `s01_05–s01_07`  
入口：主页 → **六朝世界 Demo**（内存路由 `/world-sim-demo`）

## 1. 交付目标

这不是一段写死的假 UI。Demo 直接复用生产代码：

- `buildStrictScenarioInitialization(..., { storyMode: 'world_sim' })`
- `advanceScenarioRuntime`
- `buildLocalJudgementPreflight`
- `persistPendingJudgement` / `resolvePendingJudgement`
- `settleWorldSimulationJudgement`
- `confirmWorldSimulationDivergence`

Demo 明确标记为 `[DEV]`、`memory-only`、`disposable`。Demo 驱动器不调用
`scenarioModManager`、`gameStateStore`、任何存档/IndexedDB 写入接口或 AI service；
刷新或离开页面即丢弃状态。应用壳自身的正常启动迁移不属于 Demo 状态链。

## 2. 人工验收

### A. 默认世界线（零 LLM）

1. 从主页进入“六朝世界 Demo”。
2. 点击“跑完默认线（0 LLM）”。
3. 预期：世界时钟为 `19`，当前局势为“三项局势均已结算”，正式分歧为 `0`。
4. 三行状态均为“世界默认结算”，但 `s01_05/06/07` 的 `done` 全是 `false`。

证明：世界能在玩家不介入时完成定陶王继统、郭解默认死亡、董卓默认死亡，
但不会伪造玩家亲历或事件完成。

### B. 郭解生还 IF

1. 点击“郭解：固定成功候选”。
2. 预期：出现“待玩家确认 · 尚未发生”，正式分歧仍为 `0`。
3. 点击“确认正式 IF”。
4. 预期：候选消失，正式分歧变为 `1`，`s01_06` 显示
   `IF · lyg.if_guojie_longrest`，同时 `done=false`。

### C. 董卓生还 IF

1. 点击“董卓：固定成功候选”。
2. 预期：出现待确认候选，正式分歧仍为 `0`。
3. 点击“确认正式 IF”。
4. 预期：`s01_07` 显示 `IF · lyg.if_dongzhuo_longrest`，人物状态为长期休养，
   定陶王继统锚点不变。

“固定成功”只存在于隔离 Demo 驱动器，用来让验收可重复。正式游戏仍使用普通本地掷骰，
且成功结果也必须经过相同的玩家确认门闩。

## 3. 正常创角入口

启用带 `scenario.worldSimulation` 合同的剧本模组后，在创角第一步选择该模组，右侧出现：

- **原著同行**：默认值，维持既有 Canon Rail 与旧档行为。
- **六朝世界**：只写入这个新档；世界局势、NPC 行动和期限自行推进。

普通世界、旧档以及未显式选择的剧本都不会写入 `storyMode=world_sim`。

## 4. 验证证据

- 浏览器：主页入口、长页滚动、默认线、郭解候选/确认、董卓候选/确认均实测通过。
- 浏览器控制台：本功能零 error；只有项目既有 `Sect` 空子路由警告。
- `npm run canon:build`：37 关 schema / 裁定 / 主轴门禁通过，`578/578` 测试通过。
- `npm run type-check`：通过。
- `npm run build:single`：通过。
- 目标 ESLint：`0 errors`（既有文件保留历史 warnings）。

浏览器实测额外发现并修复两项：

1. 全局 `#app-container` 垂直居中会裁切长页面，Demo 现强制顶部对齐并由容器滚动。
2. Vue `ref` 会把存档变为 Proxy，`structuredClone(proxy)` 会失败；Demo 现按存档 JSON 边界克隆。

Claude Demo 专项二审确认内存隔离、零 LLM、二段式确认、生产 runtime 复用与默认兼容均成立，
并提出四项纵深边界；现已补为确定性约束：世界模式不暴露原 Rail 完成动作或判定元数据、
多事件合同不覆盖同组已结算成员、`expand` Mod 不能声明世界合同。新增回归已纳入上述 578 项。
修复后 Claude 聚焦复核确认四项全部 PASS、无 P0/P1/P2；其补充指出的未来探索事件 Rail 旁路
也已提前 fail-closed 并加回归。

二审建议把入口限制在开发构建。这里明确不采纳：本次交付目标就是让用户从测试服主页直接完成
验收；入口保留可达，但页面继续使用一次性内存状态，既不读取活动角色，也不调用存档写入或 LLM。

## 5. 范围边界

G1 只覆盖定陶王入京的三项局势，用于验证架构而非宣称全书迁移完成。后续扩量应继续遵守：

- 承重事实稀疏、显式、由本地引擎持有；
- 原著逐拍只作结果成立后的演出素材；
- 人物命运默认可演化，但改写必须走已登记 IF；
- LLM 不拥有世界时钟、死亡/生还、锚点或 IF 的写权限。
