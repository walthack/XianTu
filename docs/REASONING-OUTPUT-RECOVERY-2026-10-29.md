# 思考模型输出预算修复（2026-10-29）

基线：`feat/fast-no-legacy` / `3bb56f70`。依据 `../playtest-2026-09-28/REPORT-8091-3bb56f70-开局失败.md`。只做本地源码与模拟测试；未读取凭据、未访问用户 API 配置、未调用付费模型、未 commit/push、未部署。

## 上限与超时位置

| 场景 | 源码位置 | 原有值 / 本次行为 |
|---|---|---|
| 分步开局 | `src/utils/initialGenerationPolicy.ts:5`、`:6`、`:26`；`src/utils/AIBidirectionalSystem.ts:2080`、`:2138`、`:2242` | Step1 3072、Step2 8192；调用级 requestMaxRetries=0。冻结调用点不改，服务层识别思考模型后至少 16384。 |
| 普通叙事 | `src/services/aiService.ts:188`、`:1591`、`:1670` | 普通 main 默认最多 8192，显式调用预算优先；思考模型在兼容 API 请求入口按倍率/下限放大，再走现有模型输出/上下文夹紧。 |
| 单幕试验 | `src/modules/scenarioMods/legacyNarrativePilot.ts:14`、`:15`；`src/utils/AIBidirectionalSystem.ts:1030` | 原始预算 2048，思考模型实际至少 16384。 |
| generate 外层 | `src/services/aiService.ts:843`、`:863` | 思考模型默认单次传输 360 秒，外层给两次传输共 720 秒；显式 timeoutMs 也按策略放大。 |
| 清羽共享时限 | `src/services/qingyuTurnLongRequests.ts:6`、`:139`；`src/services/aiService.ts:848` | 原 60 秒；已识别的思考模型扩至外层预算，仍以回合原起点计时，不反复刷新。取消/失效和两次长请求闸门保留。 |
| OpenAI 兼容非流 | `src/services/aiService.ts:1779`、`:1829` | 流式降级原 60 秒→300 秒；直接非流原 120 秒→360 秒。 |
| OpenAI 兼容流式 | `src/services/aiService.ts:2192` | 原首字节 30 秒/总计 120 秒→300 秒/360 秒；content_idle 模式原首正文/空闲各30秒→各300秒，仍不设总时限。 |
| 客户端中止机制 | `src/services/aiRequestDeadline.ts:29`、`:30`、`:41`、`:47`、`:50` | 默认 120/30 秒不改；服务层传入放大值。AbortController、用户取消与 finally 清理保持。 |

## 配置

权威 `mod-kit/numbers-runtime.json` 的 `aiRetry.reasoning`；字段登记于 `numbersRegistry.ts`，运行时读取 GAME_NUMBERS 支持现有热改机制。合并产物通过 `node scripts/merge-game-numbers.mjs` 生成。

| 字段 | 默认值 | 含义 |
|---|---|---|
| modelPattern | `minimax-m3\|deepseek-r\|thinking\|reasoner` | 不区分大小写正则；非法正则由 validator 拒绝。 |
| minMaxTokens | 16384 | 思考模型首次输出预算下限。 |
| tokenMultiplier | 2 | 首次请求原预算倍率。 |
| minTimeoutMs | 300000 | 各传输计时器下限。 |
| timeoutMultiplier | 3 | 原计时器时长倍率。 |
| retryMultiplier | 2 | 思考耗尽后按上次实际预算放大一次。 |
| budgetTokens | 0 | 默认禁用；仅明确 `openrouter.ai` 端点发送 `reasoning.max_tokens`。不向 MiniMax 或未知代理猜测参数。 |

现有 `optionalReasoningParams.ts` 已构造 `reasoning.effort`；MiniMax 流式特殊分支有 `thinking.type=disabled` / `reasoning_split`，但只匹配 M3/M2.7 名称，并不覆盖报告中的 M3.1-Flash。本次不扩大关闭思考的匹配。OpenRouter 可选预算依据其[官方文档](https://github.com/OpenRouterTeam/docs/blob/main/guides/best-practices/reasoning-tokens.mdx)，是否生效仍依模型支持，默认不发送。

## 恢复与边界

- `aiReasoningModelPolicy.ts` 负责识别、预算和一次恢复。返回 reasoning / reasoning_content 非空、或 content 中出现 `<think>` 时在内存记住模型；不写 API 配置。剥离完整或未闭合 think 块；独立 reasoning 不再作为正文兜底。
- 空正文 + finish_reason=length + 思考模型/响应：同路由自动恢复一次，默认 16384→32768；未知别名首次3072返回思考后，恢复至至少16384。流式与非流式、流式降级都覆盖。
- `LCQ-NET-013` 连号新增，console/诊断日志写“思考耗尽输出长度”，只附预算与是否重试，不保存思考正文。重复耗尽失败；已取消不重试；可见正文截断保持原有处理。
- 仍受服务商输出上限、上下文夹紧和请求次数闸门约束。有限 token/时间预算不能保证任意模型永不截断或超时；未进行真实 MiniMax 验证。
- 未知模型在第一次响应被识别之前，已启动的计时器无法预知它会思考；会话内后续调用按新策略。已有外层用户 signal 仍可随时取消。原生 Claude/Gemini/Tavern 传输不属于此次 OpenAI 兼容恢复路径。

## duplicated prompt 证据与冻结未做项

确实重复，不仅是模型主观措辞：

1. AIBS `:2032–2050` 构造 Step1 system，`:2048` 插入整个 userPrompt。
2. AIBS `:2134–2135` 又把该 system 和同一 userPrompt 一起传入；`:2087–2089` generateRaw 各发送一条，`:2100–2103` generate 通过 inject + user_input 各发送一条。
3. aiService `:1373–1409` 自定义消息组装 `generateWithCustomAPI` 分别添加 injects 和 user_input，各一次；不是该层额外拼接。`promptAssembler.ts:44–104` 各段组装一次；`services/prompts/defaultPrompts.ts:407` 是 Step1 规则；`services/defaultPrompts.ts:1` 仅再导出。没有证据支持在这些非冻结文件删提示词。

直接修复应移除 AIBS `:2046–2048` 的“角色设定 + userPrompt”重复段，保留 `:2135` 用户消息。本次严格冻结，未修改。

另外，AIBS `:2113–2114` 的“整个分步开局最多4次调用”注释及 `:2148`/`:2183` 遥测仍显示请求预算3072而不是服务层实际预算；新增服务层专项重试可能使两步合计最多8次实际调用（尚受其他闸门约束）。如需全流程仍严格4次或让该遥测报告实际预算，需要解冻 AIBS `:2080–2110` 统一调用计数/预算回传及两个遥测点。本次不改这些位置；实际请求预算以服务层请求诊断为准。

## 验证

- 最终 `npm test`：2878项（原2863 + 新增15），2875通过、0失败、3跳过、0取消，166.3秒。首轮配置枚举/诊断守卫3项失败已修复后重新全量验证。
- `npx tsc --noEmit`：仅 `src/modules/sceneModule/host/controller.ts:202:42` TS2559，与允许保留项一致；不是类型全绿。
- `git diff --check` 通过；AIBS、runtime、tests/frozen-baseline.json 对 HEAD 的 diff 为空。
- 专项15项：流/非流、动态字段/think标签、一次恢复上限、取消、降级、实际计时器值、回合时限幂等、配置校验。全部使用 mock，无网络模型调用。
- 本地完整日志：`/tmp/xiantu-reasoning-full-final.log`；类型日志：`/tmp/xiantu-reasoning-tsc-final.log`。

改动文件：`src/services/aiService.ts`、新增 `src/services/aiReasoningModelPolicy.ts`、`src/services/qingyuTurnLongRequests.ts`、`mod-kit/numbers-runtime.json`、生成的 `mod-kit/game-numbers.qingyu.json`、`src/modules/sceneModule/numbersRegistry.ts`、`src/modules/diagnostics/codes.ts`、`docs/ERROR-CODES.md`、新增 `tests/reasoningModelPolicy.test.mjs`、`tests/aiRetryPolicy.test.mjs`、本报告、`PROJECT-STATUS.md`。
