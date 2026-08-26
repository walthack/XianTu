# Grok 实施合同：清羽 Demo 恢复 Legacy 默认与本地判定结构化接回

> 日期：2026-08-27
> 工作目录：`/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu`
> 执行者：Grok 4.6 Build
> 当前基线：分支 `feat/fast-no-legacy`，起始 HEAD 以执行时 `git rev-parse HEAD` 为准
> 交付方式：可以修改源码和测试，但**不要提交 commit**；Codex 将审核 diff、补门禁并完成正式提交。

## 结论先行

将清羽 Demo 的正式默认正文路径恢复为 Legacy；Fast Narrative 保留为显式实验开关，不删除、不扩场景。本批同时把已经存在的通用本地判定回执以结构化、可核验方式接入 Legacy，替换运行时三处依赖文本包含判断的软连接。

目标是保留 Legacy 的提示词管理、API 配置、成人模式、记忆、行动选项及既有安全/正典规则，同时保留“本地判定先落账、LLM 只演出结果”。本批**不做 Legacy 性能优化**；先恢复正确产品基线，性能优化另起 A/B 批次。

## 开工前必读

1. 根目录 `AGENTS.md`。
2. `PROJECT-STATUS.md` 顶部当前状态，尤其 P0-1/P0-2 与移动系统待设计边界。
3. `mod-kit/generated/deepseek-v4-flash/character-canon/CANON-DECISIONS.md`，重点 #66–#76、#100、#104。
4. `docs/FAST-NARRATIVE-DEMO-BASELINE-AND-CONTRACT-2026-08-23.md`。原批准结论是 Fast 默认关闭、扩大范围/替换主路径 NO-GO。

开始前运行并记录：

```bash
git status --short
git rev-parse HEAD
```

工作区可能已有 Codex 新增的本合同和 `PROJECT-STATUS.md` 交接记录；必须保留，不得覆盖或回退用户/其他 agent 的改动。

## 已证明的现状

### 1. 默认值发生漂移

- `src/components/dashboard/SettingsPanel.vue:425-434,795-796`：UI、缺省读取、异常回退、重置设置均为 Fast 开启。
- `src/modules/scenarioMods/fastNarrativeDemo.ts:341-349`：存储键缺失或读取异常时返回 `true`。
- `src/modules/scenarioMods/fastNarrativeDemoAdjudication.ts:103-111`：Fast 专属短刀 scene fact 同样随一个开关启停。
- `tests/fastNarrativeDemo.test.mjs:100`：测试把“未设置=开启”固化为合同。

这与项目权威文档“实验默认关闭、替换主路径 NO-GO”冲突。

### 2. Legacy 已有通用本地判定入口

- `src/components/dashboard/MainGamePanel.vue:2059-2077`：确认判定后先执行 `resolvePendingJudgement`，保存，再调用正文生成。
- `src/components/dashboard/MainGamePanel.vue:1730-1732`：本地回执被追加到本轮消息。
- `src/components/dashboard/MainGamePanel.vue:1779`：真实 `JudgementResolution` 已通过 `options.judgementResolution` 传入。
- `src/utils/AIBidirectionalSystem.ts:863-865`：Legacy prompt 已声明本地判定单一权威。
- `src/utils/prompts/definitions/textFormats.ts` 与 `businessRules.ts`：提示词管理已有同一规则。

因此不得重写一套 Legacy 判定系统，也不得把 Fast 硬编码 prompt 搬进 Legacy。

### 3. Legacy 仍有三处软连接

以下逻辑仍依赖 `userMessage.includes(...)`，而不是已经传入的结构化回执：

1. `src/utils/AIBidirectionalSystem.ts:863`：判断本轮是否有本地判定。
2. `src/utils/AIBidirectionalSystem.ts:2283`：阻止 LLM 重复改写气血、神识和状态。
3. `src/utils/AIBidirectionalSystem.ts:2405`：避免本地战斗伤害与叙事补伤双扣。

Fast 已在 `src/modules/scenarioMods/fastNarrativeDemo.ts:370-390` 实现过回执投影和存档核验，但 Legacy 不得反向依赖 Fast 模块。应把通用能力下沉到 `judgementEngine` 或新的中性 helper。

## 必做改动

### A. Fast 渲染恢复默认关闭

保持存储键与显式 opt-in 兼容，只修改缺省语义：

- `SettingsPanel.vue`
  - `fastNarrativeDemoEnabled` 初值改为 `false`。
  - localStorage 键缺失/空值时返回 `false`。
  - 读取异常时返回 `false`。
  - “重置所有设置”恢复为 `false`。
  - UI 文案改为“默认关闭，开启后仅用于清羽实验路线；关闭后走 Legacy”。
- `fastNarrativeDemo.ts:isFastNarrativeDemoEnabled`
  - 键缺失/空值与异常均 fail closed 为 `false`。
- `fastNarrativeDemoAdjudication.ts:isFeatureEnabled`
  - 同样默认 `false`。该模块仍是 Fast 专属短刀实验，不因本批自动晋升为正式通用系统。
- 显式存储值 `'true'` 必须继续开启 Fast；显式 `'false'` 必须走 Legacy。

不要删除 Fast 代码，不要改存储键版本，不要强制覆盖玩家已经明确保存的 `'true'`。

### B. 建立通用的已结算回执核验

在中性位置实现并导出窄 helper，建议放入 `src/utils/judgementEngine.ts`：

```ts
verifyResolvedJudgementReceipt(saveData, resolution): JudgementResolution | null
```

合同：

- 只接受 `status === 'resolved'`。
- 存档当前不得仍有 pending。
- `resolution.id` 必须存在于 `getJudgementState(saveData).recent`。
- 至少逐字段核对：`id`、`actionHash`、`actionText`、`kind`、`difficulty`、`roll`、`total`、`outcome`、`canonPolicy`、`stakes`、`appliedEffects`、`resolvedAtTurn`、`status`；如类型还有影响权威的字段，也应纳入。
- 返回存档中的可信副本，不返回调用方提供对象。
- 空值、过期、篡改、不匹配、仍 pending 时返回 `null`，不得抛错阻断普通 Legacy 回合。

将 Fast 现有的私有 `resolutionReceiptMatches/resolutionView` 改为复用该中性 helper，避免两个核验器继续漂移。不要扩大到 canon 数据或其他模块重构。

### C. Legacy 使用结构化回执，而不是文本匹配

在 `processPlayerAction` 获取 `saveData` 后，对 `options?.judgementResolution` 做一次核验，并在本次事务内复用同一个可信结果。

1. Prompt 投影
   - 有可信回执：在 Legacy 系统上下文中加入一段紧凑、确定性的“本回合本地判定回执”，包含动作、ID、类型、骰点、总值、难度、结果、正典策略、结果文案和已写入 effects。
   - 无可信回执：继续注入“本回合无本地判定回执”。
   - 是否有回执不得再由 `userMessage.includes('【本地判定已结算】')` 决定。
   - 保留提示词管理体系；不要修改或绕过 `assembleSystemPrompt/getPrompt()`。

2. 命令保护
   - 为 `processGmResponse` 的 options 增加结构化 `judgementResolution?: JudgementResolution`，传入上面核验后的可信副本。
   - 只有可信回执存在时，阻止 LLM 重复改写本地独占的气血、神识和状态字段。
   - 删除这一权限判断对 `options.userAction.includes('【本地判定已结算】')` 的依赖。

3. 战斗伤害去重
   - `hasLocalCombatDamage` 必须从可信回执判断：`kind === 'combat'` 且 `appliedEffects` 中真实包含气血当前值写入。
   - 删除对文本 `本地战斗伤害已结算=true` 的权限依赖。

4. 文本边界
   - UI 为可读性继续显示/发送现有回执文字可以暂时保留，但它只是展示材料，不再是代码权限来源。
   - 玩家自行输入同名标记不得获得结构化回执权限、不得触发伤害去重或命令保护。

### D. 证明 Fast 关闭后，本地系统仍工作

以下现有本地系统本来就位于共享结算链，Fast 关闭后必须保持：

- 通用 `resolvePendingJudgement` 及 effects。
- 结构化 `eventAction` 的 `recordStoryEventStructuredAction`。
- `opportunityAction` 的本地步骤和 inventory receipt。
- `openWorldAction` 的本地结算。
- Canon Rail 当前拍、IF、知识、关系和物品边界。

不要把这些逻辑复制进 Legacy；用回归测试证明共用链仍执行即可。

Fast 专属 `fastNarrativeDemoAdjudication` 短刀 scene fact 暂时继续显式实验开关控制。不要在本批决定它是否进入正式背包、通用场景物品或 Legacy 世界真值；把该问题列入交付报告的待裁定项。

## 明确禁止

- 不删除 Fast 模块或历史测试。
- 不优化 Legacy 请求体、Token、RAG、分步生成或重试；这些另起性能批次。
- 不改变任何玩家 API 配置、提示词管理存储、成人模式、行动选项设置。
- 不修改 `mod-kit/generated/**`、内置 stage JSON、正典人物数据或 `CANON-DECISIONS.md`。
- 不修改移动/地点机制；移动系统仍待独立设计，禁止文本匹配补丁。
- 不合入或关闭 P0-1/P0-2；不得把本批测试绿色解释为 P0-2。
- 不顺手处理 `event_reconcile` abort 原子性候选 `89ba21c`。
- 不使用删除、重置或覆盖工作区的 Git 命令。

## 必须新增/调整的测试

至少覆盖：

1. Fast 开关缺失、空值、读取异常时均走 Legacy。
2. 显式 `'true'` 仍进入 Fast；显式 `'false'` 走 Legacy。
3. 设置页初值、异常回退、重置设置和文案均为默认关闭。
4. Fast 专属短刀 adjudication 在缺省/关闭时不写入，显式开启时原合同不变。
5. 可信 `JudgementResolution` 能从存档核验并投影到 Legacy prompt。
6. 篡改 ID/outcome/effects/difficulty/actionHash，或存档仍 pending 时 fail closed。
7. 玩家只输入伪造的 `【本地判定已结算】` 文本，不触发结构化权限。
8. 可信战斗回执阻止 LLM 重复改气血/状态，并跳过叙事补伤。
9. 非战斗回执或无气血 effect 不错误跳过正常叙事补伤。
10. Fast 关闭时，结构化事件、机会卡和开放世界动作仍各只结算一次。
11. `processPlayerAction` 的失败、取消和重试不得重复应用本地 effects。

优先扩展：

- `tests/judgementAuthorityIntegration.test.mjs`
- `tests/judgementEngine.test.mjs`
- `tests/fastNarrativeDemo.test.mjs`
- `tests/fastNarrativeDemoAdjudication.test.mjs`
- 如需验证 `processGmResponse`，新增聚焦测试文件，不要把逻辑塞进无关套件。

## 验证门禁

先跑聚焦测试，再跑全门：

```bash
node --test tests/judgementEngine.test.mjs tests/judgementAuthorityIntegration.test.mjs tests/fastNarrativeDemo.test.mjs tests/fastNarrativeDemoAdjudication.test.mjs
npm run type-check
npm run canon:build
git diff --check
git status --short
```

若 `canon:build` 失败，必须区分本批引入与既有失败；但在本项目提交纪律下，交付前目标仍是全绿。不要为了过测试降低 P0/P1 保护或修改 canon 数据。

## Grok 交付格式

完成后只报告：

1. `verdict: implemented | partial | blocked`
2. 起始 HEAD 与最终未提交工作区状态。
3. 改动文件及每个文件的目的。
4. 哪些本地判定已证明在 Legacy 下工作。
5. 哪些 Fast 专属逻辑仍未迁移，以及原因。
6. 聚焦测试、type-check、canon:build、diff-check 的精确结果。
7. 已证明 / 推断 / 未证明。
8. 明确写：P0-1 NOT CLOSED；P0-2 NOT CLOSED。

不要提交 commit，不要宣称完成 Legacy 性能优化，不要自动开始下一批。
