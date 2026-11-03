# 主叙事推理档（2026-11-03）

用户批准：只压低主叙事请求的推理强度；不换模型、不碰 key。回合总限时 90→150 秒保底。

## 实际模型（m69 真机 net.log，10-31～11-02）

| 请求 | 模型 | 次数 | 均耗时 | 均推理字数 | 均正文字数 | ttfb |
|---|---|---|---|---|---|---|
| 主叙事（inChars>50k、rf=json_object、流式、max_tokens 16384） | MiniMax-M3.1-Flash | 271 | 68.2 s | 21436 | 1334 | 2.7 s |
| 同上，max_tokens 32768（截断补救） | MiniMax-M3.1-Flash | 2 | 99.6 s | 48190 | 2807 | 2.2 s |
| 模块演出／意图（rf 空、流式） | MiniMax-M3.1-Flash | 643 | 17–34 s | 5400–9196 | — | 1.4 s |
| 小请求（rf=json_object、非流式，记忆等） | MiniMax-M2.7-highspeed | 80 | 4.6–5.9 s | 0（无独立字段） | — | — |
| 主叙事流式 >50k（个别轮次） | MiniMax-M2.7-highspeed | 3 | 6–19 s | 0 | — | — |

主叙事当前实际是 **MiniMax-M3.1-Flash**（`apiAssignments.main`，用户 API 配置在 save-storage，本次未读取）；M2.7-highspeed 是辅助功能分配（记忆摘要等），旧文档把它写成测试用主模型。真机日志 START 行 `reasoning=""`：主叙事请求体从未带推理参数。

## MiniMax 官方参数（OpenAI 兼容 chat/completions）

出处：<https://platform.minimax.io/docs/api-reference/text-openai-api>、<https://platform.minimax.cn/docs/api-reference/text-openai-api>（2026-11-03 查）。

- `reasoning_effort`：仅 MiniMax-M3.1-Flash 生效；`low`/`medium`/`high`/`xhigh`/`max`；**省略默认 max**；不支持 `none`（400）。
- `thinking.type`：`disabled`/`adaptive`；M3.1-Flash 强制思考，传 `disabled` 返回 400（2013）；M3 可关；M2.x 关不掉。
- `reasoning_split`：输出格式开关；M3.1-Flash 不支持设为 false。
- `max_tokens`/`max_completion_tokens`：思考 token 计入；无单独的思考 token 上限参数。

## 改动

- 配置 `aiRetry.reasoning.mainNarrative`（`mod-kit/numbers-runtime.json`，登记 `numbersRegistry.ts`）：`effort=low`，`modelPattern=^minimax-m3\.1-flash`，`hostPattern=^api\.minimaxi?\.(com|io)$`；`off` 不发送。
- `aiService.bindQingyuTransportBudget` 标记主叙事：usageType=main、非后台、有回合 id、调用方未指定 reasoningEffort/timeoutMode。OpenAI 兼容流式、流式降级、非流式三处请求体经 `mainNarrativeReasoningParam`（`aiReasoningModelPolicy.ts`）追加 `reasoning_effort`。冻结文件（AIBS、runtime.ts、frozen-baseline.json）未改——注入点在服务层。
- `story.narrativeTurnBudget.totalMs` 90000→150000。
- 测试：`tests/mainNarrativeReasoning.test.mjs`、`tests/benchNarrativeReasoning.test.mjs`。

## 实测脚本 `scripts/bench-narrative-reasoning.mjs`

```
node scripts/bench-narrative-reasoning.mjs --body <主叙事请求体.json> --base <代理 base URL> --n 5 --out bench.jsonl
node scripts/bench-narrative-reasoning.mjs --body <主叙事请求体.json> --dry-run
```

- 改前＝不带 `reasoning_effort`（MiniMax 默认 max），改后＝配置档（`--effort` 可覆盖），交替各 N 次，流式。逐次输出 totalMs、ttfbMs、firstReasoningMs、firstContentMs、reasoningChars、contentChars、finish、usage token、jsonOk/textChars（游戏 `parseJsonSmart` 强 JSON 口径），末尾汇总表。
- **不处理 key**：只发 Content-Type/Accept 头，请求体里疑似凭据字段删掉只报字段名；`--out` 只写指标。
- **代理端点**：`--base` 必须是服务端注入 key 的 OpenAI 兼容代理。仓库内没有：webpack dev server（8091 即此）只有 `/api/v1/save-storage/*` 与转发 `XIANTU_BACKEND_URL`（默认 192.168.50.51:8080）的 `/api` 通用代理，nginx 只代 `/ollama-api/`；游戏浏览器直连 `api.minimaxi.com` 并在前端带 key。需由用户在有 key 的机器上提供代理（例如后端 8080 若有 chat 代理，则 `--base http://192.168.50.51:8091/api/<该路径>/v1`）。
- **请求体来源**：真机 ctx.log 只记分段长度与段首 30 字，没有完整正文；`--ctx` 找到 s01_05 条目后会以退出码 2 说明无法还原。需要真机驱动把该请求的 `request.postData()` 原样另存为 JSON 再用 `--body`。
