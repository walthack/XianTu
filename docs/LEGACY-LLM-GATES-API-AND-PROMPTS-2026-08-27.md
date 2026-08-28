# Legacy 主叙事：LLM 门禁、后台 API 与提示词配置的关系

> 日期：2026-08-27
> 工作目录：`/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu`
> 已提交基线：`55c4e0d`（Fast 默认关闭 + 结构化判定回执）
> 对照源码：当前工作区，含未提交的 Legacy 单幕试验（`legacyNarrativePilot`）
> 真机样本：`/tmp/xiantu-legacy-profile-1787832246033`（Fast 关、清羽隔离档、两轮观察、未注入 API）
> 范围：只说明配置怎么接到主叙事调用上。不关闭 P0-1/P0-2，不改 API，不优化性能。

## 结论先行

三套东西不是同一开关：

1. **后台 API 管理**管「打给谁、温度多少、要不要 JSON、maxTokens」。
2. **提示词管理**管「系统规则长什么样」。
3. **剧本/正典门禁**是第三套：既写进 prompt，也在返回后硬拦。

完整 Legacy 回合同时吃这三套。Fast 和 Legacy 单幕试验仍走 `usageType=main` 的模型指派，但用调用级 `responseMode=text` 压过面板的 `forceJsonOutput`，并且不拼完整 JSON/命令 schema。

改提示词管理里的中文，不会单独关掉 `json_object`，也不会让正文在 JSON 收齐前上屏。那两件事分别由 API 面板的 `forceJsonOutput` 和剧本 `renderGuard` 触发的缓冲门禁决定。

## 1. 配置层与权威

| 层 | 位置 | 管什么 | 回合时是否生效 |
|---|---|---|---|
| 后台 API | `.xiantu-server/save-storage/user_config_api_management_v1.json` | 模型、URL、温度、maxTokens、`forceJsonOutput`、功能指派、功能开关 | 页面加载时覆盖 localStorage，是网页端权威 |
| 本机 API 缓存 | `localStorage.api_management_config` | 同上副本 | 先读；随后被后台盖掉。有 pending 上传时禁止旧云端回盖 |
| 提示词默认 | `src/services/prompts/defaultPrompts.ts` | 系统规则正文 | `getPrompt()` 未改过的 key 用这份 |
| 提示词本机改写 | IndexedDB `dad-prompts` | 用户在「提示词管理」里改过的条目 | 仅当该 key `modified=true` 且未 `enabled=false` |
| 提示词云端 | `user_config_prompts_v1` | 自定义提示词同步 | **`getPrompt()` 不拉云端**。只在 `loadAll()`（打开提示词管理）时灌进 IndexedDB |
| 页面设置 | `dad_game_settings`、`xiantu.fastNarrativeDemo.v1`、`xiantu.legacyNarrativePilot.s01_01.v1` | 分步生成、Fast、单幕试验 | 每回合读存储键 |
| 检索本机开关 | 各服务 IndexedDB 配置 | 长期检索 / 叙事 RAG 的 `enabled` | 默认关；角色 RAG 没有这一层 |

加载顺序（API）：`localStorage` → 若有 pending 则重试上传并停 → 否则 GET 后台 `user_config_api_management_v1` 覆盖本机。

加载顺序（提示词）：回合路径 `promptStorage.get(key)` 只看 IndexedDB + 代码默认。云端提示词与当前回合可能不是同一份，除非这次浏览器已经打开过提示词管理。

相关代码：

- `src/stores/apiManagementStore.ts`：`loadFromStorage` / `getAPIForType` / `isFunctionEnabled`
- `src/services/prompts/promptStorage.ts`：`get` / `loadAll` / `loadRemoteOverrides`
- `src/services/aiService.ts`：`getAPIConfigForUsageType` / `resolveGenerateResponseFormat` / `getEffectiveRequestedMaxTokens`

## 2. 功能位怎么接到模型

`getAPIForType(type)` 按指派取配置；找不到或未启用则回退 `default`。若某辅助位仍指派 `default`，而 `main` 已指向独立 API，辅助位会 **跟随 main**（embedding 的角色 RAG 除外，它要求非 `default` 的独立 embedding API）。

本机后台当前指派（2026-08-27 读文件，不含密钥）：

| 功能位 | 配置名 | 模型 | forceJson | 功能开关 |
|---|---|---|---|---|
| `main` | Deepseek v4 flash | `deepseek/deepseek-v4-flash-0731` | 开 | 始终用于主叙事 |
| `memory_summary` | minimax high speed | `MiniMax-M2.7-highspeed` | 开 | 开 |
| `embedding` | 硅基流动 | `BAAI/bge-m3` | 关 | **开** |
| `text_optimization` | Deepseek v4 flash | 同上 main | 开 | **关** |
| `instruction_generation` | Deepseek v4 flash | 同上 main | 开 | 仅分步第 2 步用 |
| `world_generation` / `event_generation` / `sect_generation` / `crafting` / `progress_audit` / `event_reconcile` | minimax high speed | `MiniMax-M2.7-highspeed` | 开 | 审计、对账均为开 |

代码硬掐（不在面板上改）：

- 主叙事 `usageType=main`：`maxTokens = min(面板值, 8192)`。面板写 20000，真机发出去是 8192。
- `responseMode=text` 压过该次调用的 `forceJsonOutput`，不改 store / 后台。
- 分步生成只看 `dad_game_settings.splitResponseGeneration`，默认关。`instruction_generation` 指到非 default 只影响 UI 提示，不自动开分步。

## 3. 主叙事三条路

`processPlayerAction` 顺序：

```
tryFastNarrativeDemo
  → tryLegacyNarrativePilot
    → 完整 Legacy JSON
```

| 路径 | 存储键 | 提示词来源 | generate 选项 | 命令 |
|---|---|---|---|---|
| Fast | `xiantu.fastNarrativeDemo.v1`=`true`，且清羽 Demo 范围内 | Fast 自建短 prompt，**不**走 `assembleSystemPrompt` | `usageType=main`，`maxTokens=2048`，`responseMode=text`，`requestMaxRetries=0` | 空 |
| Legacy 单幕 | `xiantu.legacyNarrativePilot.s01_01.v1`=`true`，且点选 `s01_01` 新鲜结构化按钮 | `buildLegacyNarratorPrompt`：Narrator Profile + ≤6KB Render Packet；不再拼 `assembleNarrativeOnlySystemPrompt` | 同上，`maxTokens=2048`，`responseMode=text` | 空 |
| 完整 Legacy | 前两条都不进 | `assembleSystemPrompt` + 正典 + 剧本 + 存档 JSON；前台不再注入三套 RAG / 全量长期记忆 | `usageType=main`，跟随 `forceJsonOutput`，max 掐到 8192 | 模型可出 `tavern_commands` |

完整 Legacy 系统 prompt 的拼装顺序（`AIBidirectionalSystem.processPlayerAction`）：

1. `assembleSystemPrompt`：提示词管理里的核心包
2. `buildScenarioCanonPrompt`：可见正典
3. `buildScenarioStoryPrompt`：当前拍、IF、`renderGuard.*`
4. `buildActionGatePrompt`：行动门控余波
5. 角色核心状态速览 + 本回合判定回执（结构化核验后的文案，不再靠 `【本地判定已结算】` 文本权限）
6. 可选：长期检索 / 叙事 RAG / 角色 RAG
7. `# 游戏状态` + `buildNarrativePromptState` JSON
8. 独立 inject：聚焦 NPC、短期记忆、`</input>` 占位

提示词管理实际被主路径拼进去的 key：

- 始终：`coreOutputRules`、`businessRules`、`playerPersonality`、`dataDefinitions`、`textFormatRules`、`worldStandards`、`eventSystemRules`
- 可选：`actionOptions`（设置里开行动选项时）
- 分步时另取：`splitGenerationStep1` / `splitGenerationStep2`

**`extendedBusinessRules`（面板「2.5 扩展规则」）主路径不拼。** 能改、回合用不到。

`assembleNarrativeOnlySystemPrompt` 明确不取 `coreOutputRules` 和 `dataDefinitions`，因为那条路不许模型写命令或存档。

## 4. 门禁分三类

### A. 写进 prompt，指望模型遵守

- 提示词管理：JSON 合同、`NARRATIVE_PURITY_RULES`、本地判定单一权威、禁止自骰
- 剧本：`renderGuard.forbiddenTerms` / `reservedFutureTerms` / `rejectUngroundedHandoffLosses` / `atomicPrivateClaims` / `mustNotInvent=`
- 本回合结构化判定回执（`verifyResolvedJudgementReceipt` 通过才投影）

失败时模型仍可能输出违规正文。靠 C 兜。

### B. 调用合同（API 面板 + 代码）

- 完整 Legacy：`forceJsonOutput=true` → `response_format=json_object`
- `maxTokens` 面板值再被 8192 卡住
- 温度、模型、URL 跟 `main` 指派
- 网络层可以 stream；若 `requiresNarrativeBuffering(scenarioStoryPrompt)` 为真，**关掉 UI 分片回调**，等整份响应收齐再解析。清羽剧本几乎一定命中（prompt 里带 `renderGuard` / `mustNotInvent`）

这一层不读提示词管理。

### C. 返回后的硬门禁（代码）

1. 按是否强制 JSON 解析 `text` / `tavern_commands` / `action_options`
2. `validateNarrativePerformance`：对照剧本 `renderGuard`。违规则用 **同一套 main 提示词再打一次**；仍硬违规 → `safeNarrativeFallbackForContext`，并清空命令与记忆
3. 润色：`text_optimization` 功能开关，当前关
4. 剥模型 `〔判定〕` 标签；未登场人物 / 实体类型冲突剥离
5. `processGmResponse`：命令管道、本地判定独占气血/神识/效果、叙事补伤（读剥标签前正文）、物品补账
6. `event_reconcile` / `progress_audit`：另走 MiniMax 功能位，不是主叙事 chat。观察回合样本里 0 次

A 失败会触发 C 的整包重试，输入体积与 JSON 合同都再来一遍。

## 5. 检索与 embedding（容易和「提示词」混）

| 服务 | 额外开关 | 何时真正打 embedding |
|---|---|---|
| 长期检索 `vectorMemoryService` | 本机 `enabled` 默认 **关**，且 `isFunctionEnabled('embedding')` | 长期记忆非空才检索 |
| 叙事 RAG `narrativeRagService` | 本机 `enabled` 默认 **关** | 同上 |
| 角色 RAG `characterRagService` | **没有独立 enabled** | embedding 功能开 + 非 default 的独立 embedding API |

因此：面板上「长期检索默认关」不能推出「不会打 embedding」。本机 embedding 功能开、硅基流动已指派 → 角色 RAG 冷启动会建索引。真机 T1 出现 10 次 `BAAI/bge-m3`，T2 剩 1 次，与此一致。

## 6. 谁压过谁

1. 后台 `forceJsonOutput=true` 压过「只想要正文」的产品意图，除非这次 generate 显式 `responseMode=text`。
2. 代码 8192 压过面板 20000。
3. 剧本 `renderGuard` 压过流式上屏。
4. 角色 RAG 压过「检索默认关」的印象。
5. `getPrompt()` 不读云端提示词。
6. Fast / 单幕试验不改后台 API，只改这一次调用选项；关掉存储键立刻回到完整 Legacy JSON。
7. 本地判定权限以存档核验的 `JudgementResolution` 为准；玩家输入 `【本地判定已结算】` 文本没有权限。

## 7. 真机样本（完整 Legacy，不是 Fast）

隔离清羽开局、Fast=`false`、未注入 API、两轮观察：

| | 冷启动 T1 | 热回合 T2 |
|---|---:|---:|
| chat 首包 | 3.1s | 3.6s |
| 玩家看到新正文 | 62.2s | 58.5s |
| 请求体 | 134KB / 约 5.9 万字 | 137KB / 约 6.0 万字 |
| embedding | 10 次 | 1 次 |
| 模型 | `deepseek/deepseek-v4-flash-0731` | 同 |
| 输出合同 | `json_object` + stream + max_tokens=8192 | 同 |
| 可见正文 | 约 300 字 | 同量级 |
| MiniMax 对账/总结 | 0 | 0 |

含义：慢的是「收齐 JSON 之前画面被挡住」，不是首包，也不是提示词管理单独能解的。输入体积来自完整 Legacy 拼装；输出合同来自 main 的 `forceJsonOutput` + 8192；上屏等待来自 `requiresNarrativeBuffering`。

## 8. 若要动配置，对应哪一层

只列对应关系，不在本文批准实施。

| 目标 | 应动的层 | 不动什么 |
|---|---|---|
| 观察回合不要强制 JSON | 调用级 `responseMode=text`，或主 API `forceJsonOutput` | 单改提示词管理无效 |
| 降低输出上限 | `aiService` 的 8192 硬掐，或该次 `maxTokens` | 面板 20000 已被挡住 |
| 正文先上屏 | `requiresNarrativeBuffering` 的展示时机 | 提示词里的 renderGuard 文案 |
| 砍冷启动 10 次 embedding | 关 embedding 功能，或给角色 RAG 独立开关 | 长期检索开关不够 |
| 分步：先正文后命令 | `dad_game_settings.splitResponseGeneration` | `instruction_generation` 指派 |
| 改规则措辞 | 提示词管理（IndexedDB / 云端） | API 面板 |
| 改当前拍知识边界 | 剧本 JSON + `storyContext`，不是提示词管理 | — |

## 9. 未证明

- 带本地判定 / 命令密集回合的体积与耗时（样本只有观察）
- 打开提示词管理前后，云端提示词是否与回合 `getPrompt()` 一致
- 酒馆端 `TavernHelper` 路径（本文按网页端自定义 API）
- P0-1 取消原子性、P0-2 清羽→白湖长局

**P0-1 NOT CLOSED。P0-2 NOT CLOSED。**
